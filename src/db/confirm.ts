import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
import {
  periods,
  nights,
  nightBehaviours,
  ledger,
  behaviours as behavioursTable,
} from "./schema";
import { currentDayNo } from "@/engine/day";
import {
  qualifyingCount,
  graceTokensUsed,
  checkpointEligible,
  type NightRecord,
} from "@/engine/rewards";

/*
 * THE confirm transaction (eng plan: the ONE place night state changes).
 *
 *   validate day ──▶ upsert night ──▶ grace spend/refund ──▶ behaviour diff
 *        │                                                     (mint/reverse peeks)
 *        └──────────────▶ monotonic checkpoint grants ──▶ grand-reward event
 *
 * Everything appends to the ledger inside one transaction; a partial failure
 * rolls the whole confirm back. Balances are never stored — always Σ(deltas).
 */

export class ConfirmError extends Error {
  constructor(
    public code:
      | "FUTURE_DAY"
      | "INVALID_DAY"
      | "NO_GRACE_TOKENS"
      | "NO_ACTIVE_PERIOD"
      | "UNKNOWN_BEHAVIOUR",
    message: string,
  ) {
    super(message);
  }
}

export interface ConfirmInput {
  kidId: number;
  dayNo: number;
  status: "yes" | "no";
  grace?: boolean;
  behaviourIds?: number[];
}

async function peekBalance(tx: DbOrTx, periodId: number, kidId: number) {
  const [row] = await tx
    .select({ total: sql<number>`COALESCE(SUM(${ledger.peeksDelta}), 0)` })
    .from(ledger)
    .where(and(eq(ledger.periodId, periodId), eq(ledger.kidId, kidId)));
  return row?.total ?? 0;
}

async function loadNights(tx: DbOrTx, periodId: number, kidId: number) {
  const rows = await tx
    .select()
    .from(nights)
    .where(and(eq(nights.periodId, periodId), eq(nights.kidId, kidId)));
  return rows.map(
    (r): NightRecord => ({ dayNo: r.dayNo, status: r.status, graced: r.graced }),
  );
}

export async function getActivePeriod(db: Db) {
  const [period] = await db
    .select()
    .from(periods)
    .where(eq(periods.status, "active"));
  return period;
}

export async function confirmNight(
  db: Db,
  input: ConfirmInput,
  now: Date,
): Promise<{ granted: { checkpoints: number[]; grandReward: boolean } }> {
  const period = await getActivePeriod(db);
  if (!period) throw new ConfirmError("NO_ACTIVE_PERIOD", "No active period");

  const today = currentDayNo(period, now);
  if (input.dayNo < 1 || input.dayNo > period.lengthDays)
    throw new ConfirmError("INVALID_DAY", `Day ${input.dayNo} out of range`);
  if (input.dayNo > today)
    throw new ConfirmError("FUTURE_DAY", `Day ${input.dayNo} hasn't happened yet`);

  const ts = now.toISOString();
  const nowGraced = input.status === "no" && input.grace === true;
  const grantedCheckpoints: number[] = [];
  let grantedGrandReward = false;

  await db.transaction(async (tx) => {
    const [prior] = await tx
      .select()
      .from(nights)
      .where(
        and(
          eq(nights.periodId, period.id),
          eq(nights.kidId, input.kidId),
          eq(nights.dayNo, input.dayNo),
        ),
      );

    // ── Grace tokens ────────────────────────────────────────────────────
    const wasGraced = prior?.graced ?? false;
    if (!wasGraced && nowGraced) {
      const allNights = await loadNights(tx, period.id, input.kidId);
      const used = graceTokensUsed(
        allNights.filter((n) => n.dayNo !== input.dayNo),
      );
      if (used >= period.graceTokens)
        throw new ConfirmError("NO_GRACE_TOKENS", "No grace tokens left");
      await tx.insert(ledger).values({
        periodId: period.id,
        kidId: input.kidId,
        dayNo: input.dayNo,
        type: "grace_spent",
        createdAt: ts,
      });
    } else if (wasGraced && !nowGraced) {
      // yes supersedes grace, or parent changed their mind: token back
      await tx.insert(ledger).values({
        periodId: period.id,
        kidId: input.kidId,
        dayNo: input.dayNo,
        type: "grace_refund",
        createdAt: ts,
      });
    }

    // ── Night upsert (LWW across parents by design) ─────────────────────
    await tx
      .insert(nights)
      .values({
        periodId: period.id,
        kidId: input.kidId,
        dayNo: input.dayNo,
        status: input.status,
        graced: nowGraced,
        confirmedAt: prior?.confirmedAt ?? ts,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: [nights.periodId, nights.kidId, nights.dayNo],
        set: { status: input.status, graced: nowGraced, updatedAt: ts },
      });

    // ── Behaviour diff → peek mints/reversals ───────────────────────────
    if (input.behaviourIds) {
      const valid = new Set(
        (
          await tx
            .select({ id: behavioursTable.id })
            .from(behavioursTable)
            .where(eq(behavioursTable.active, true))
        ).map((b) => b.id),
      );
      for (const id of input.behaviourIds)
        if (!valid.has(id))
          throw new ConfirmError("UNKNOWN_BEHAVIOUR", `Behaviour ${id}`);

      const existing = (
        await tx
          .select()
          .from(nightBehaviours)
          .where(
            and(
              eq(nightBehaviours.periodId, period.id),
              eq(nightBehaviours.kidId, input.kidId),
              eq(nightBehaviours.dayNo, input.dayNo),
            ),
          )
      ).map((r) => r.behaviourId);

      const wanted = new Set(input.behaviourIds);
      const added = input.behaviourIds.filter((id) => !existing.includes(id));
      const removed = existing.filter((id) => !wanted.has(id));

      for (const behaviourId of added) {
        await tx.insert(nightBehaviours).values({
          periodId: period.id,
          kidId: input.kidId,
          dayNo: input.dayNo,
          behaviourId,
        });
        // Re-toggle can't double-mint: mint only if net grants for this
        // (day, behaviour) pair are zero — a spent-then-retoggled peek stays spent.
        const [pair] = await tx
          .select({
            net: sql<number>`COALESCE(SUM(${ledger.peeksDelta}), 0)`,
          })
          .from(ledger)
          .where(
            and(
              eq(ledger.periodId, period.id),
              eq(ledger.kidId, input.kidId),
              eq(ledger.dayNo, input.dayNo),
              sql`${ledger.type} IN ('behaviour_peek','behaviour_peek_reversal')`,
              sql`json_extract(${ledger.meta}, '$.behaviourId') = ${behaviourId}`,
            ),
          );
        const balance = await peekBalance(tx, period.id, input.kidId);
        if ((pair?.net ?? 0) <= 0 && balance < period.peekCap) {
          await tx.insert(ledger).values({
            periodId: period.id,
            kidId: input.kidId,
            dayNo: input.dayNo,
            type: "behaviour_peek",
            peeksDelta: 1,
            meta: { behaviourId },
            createdAt: ts,
          });
        }
        // at cap: behaviour recorded, peek forfeited (eng plan)
      }

      for (const behaviourId of removed) {
        await tx
          .delete(nightBehaviours)
          .where(
            and(
              eq(nightBehaviours.periodId, period.id),
              eq(nightBehaviours.kidId, input.kidId),
              eq(nightBehaviours.dayNo, input.dayNo),
              eq(nightBehaviours.behaviourId, behaviourId),
            ),
          );
        const balance = await peekBalance(tx, period.id, input.kidId);
        if (balance > 0) {
          await tx.insert(ledger).values({
            periodId: period.id,
            kidId: input.kidId,
            dayNo: input.dayNo,
            type: "behaviour_peek_reversal",
            peeksDelta: -1,
            meta: { behaviourId },
            createdAt: ts,
          });
        }
        // balance 0 = the peek was already spent; never clawed back
      }
    }

    // ── Monotonic checkpoint grants ─────────────────────────────────────
    const nightsNow = await loadNights(tx, period.id, input.kidId);
    for (const cp of period.checkpointDays) {
      if (
        !checkpointEligible(cp, today, period.lengthDays, nightsNow, period.xRequired)
      )
        continue;
      const balance = await peekBalance(tx, period.id, input.kidId);
      const peekGrant = Math.max(
        0,
        Math.min(period.checkpointBonusPeeks, period.peekCap - balance),
      );
      await tx
        .insert(ledger)
        .values({
          periodId: period.id,
          kidId: input.kidId,
          dayNo: cp,
          type: "checkpoint",
          pointsDelta: period.checkpointBonusPoints,
          peeksDelta: peekGrant,
          createdAt: ts,
        })
        .onConflictDoNothing(); // unique index = granted exactly once, never revoked
      const [wasInserted] = await tx
        .select({ c: sql<number>`COUNT(*)` })
        .from(ledger)
        .where(
          and(
            eq(ledger.periodId, period.id),
            eq(ledger.kidId, input.kidId),
            eq(ledger.dayNo, cp),
            eq(ledger.type, "checkpoint"),
            eq(ledger.createdAt, ts),
          ),
        );
      if ((wasInserted?.c ?? 0) > 0) grantedCheckpoints.push(cp);
    }

    // ── Grand reward (unique event; celebration fires once) ─────────────
    if (qualifyingCount(nightsNow) >= period.xRequired) {
      await tx
        .insert(ledger)
        .values({
          periodId: period.id,
          kidId: input.kidId,
          type: "grand_reward",
          meta: { earnedOnDay: input.dayNo },
          createdAt: ts,
        })
        .onConflictDoNothing();
      const [row] = await tx
        .select({ c: sql<number>`COUNT(*)` })
        .from(ledger)
        .where(
          and(
            eq(ledger.periodId, period.id),
            eq(ledger.kidId, input.kidId),
            eq(ledger.type, "grand_reward"),
            eq(ledger.createdAt, ts),
          ),
        );
      grantedGrandReward = (row?.c ?? 0) > 0;
    }

    // NB: retro yes→no may drop achievability, but granted checkpoints and
    // the grand-reward event stand — we only ever INSERT here (Premise 2).
  });

  return { granted: { checkpoints: grantedCheckpoints, grandReward: grantedGrandReward } };
}
