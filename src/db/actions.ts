import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { boards, nights, ledger } from "./schema";
import { currentDayNo } from "@/engine/day";
import { getActivePeriod } from "./confirm";

/*
 * Kid actions: flip and peek. Both require the board to be PLAYABLE —
 * night confirmed-yes, day unlocked, flip unused. Values leave the server
 * only through these responses or a played board (no-spoilers rule).
 */

export class ActionError extends Error {
  constructor(
    public code:
      | "NO_ACTIVE_PERIOD"
      | "INVALID_DAY"
      | "FUTURE_DAY"
      | "NOT_CONFIRMED"
      | "NOT_PLAYABLE"
      | "INVALID_TILE"
      | "NO_PEEKS",
    message: string,
  ) {
    super(message);
  }
}

interface Target {
  kidId: number;
  dayNo: number;
  tileIndex: number;
}

async function loadPlayableContext(db: Db, target: Target, now: Date) {
  const period = await getActivePeriod(db);
  if (!period) throw new ActionError("NO_ACTIVE_PERIOD", "No active period");

  const today = currentDayNo(period, now);
  if (target.dayNo < 1 || target.dayNo > period.lengthDays)
    throw new ActionError("INVALID_DAY", `Day ${target.dayNo} out of range`);
  if (target.dayNo > today)
    throw new ActionError("FUTURE_DAY", `Day ${target.dayNo} hasn't happened yet`);

  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.periodId, period.id),
        eq(boards.kidId, target.kidId),
        eq(boards.dayNo, target.dayNo),
      ),
    );
  if (!board) throw new ActionError("INVALID_DAY", "No board for that day");
  if (target.tileIndex < 0 || target.tileIndex >= board.tiles.length)
    throw new ActionError("INVALID_TILE", `Tile ${target.tileIndex} out of range`);

  const [night] = await db
    .select()
    .from(nights)
    .where(
      and(
        eq(nights.periodId, period.id),
        eq(nights.kidId, target.kidId),
        eq(nights.dayNo, target.dayNo),
      ),
    );
  if (!night || night.status !== "yes")
    throw new ActionError("NOT_CONFIRMED", "Night not confirmed yes");

  return { period, board };
}

/** Idempotent: a second flip (double-tap, retry, other tab) returns the original result. */
export async function flipTile(db: Db, target: Target, now: Date) {
  const { period, board } = await loadPlayableContext(db, target, now);
  const ts = now.toISOString();

  return db.transaction(async (tx) => {
    // Set-once guard: only ONE writer ever passes this conditional update.
    const res = await tx
      .update(boards)
      .set({ flippedIndex: target.tileIndex, flippedAt: ts })
      .where(
        and(
          eq(boards.periodId, period.id),
          eq(boards.kidId, target.kidId),
          eq(boards.dayNo, target.dayNo),
          isNull(boards.flippedIndex),
        ),
      );

    if (res.rowsAffected === 0) {
      // Already flipped — return the original outcome, bank nothing.
      const [existing] = await tx
        .select()
        .from(boards)
        .where(
          and(
            eq(boards.periodId, period.id),
            eq(boards.kidId, target.kidId),
            eq(boards.dayNo, target.dayNo),
          ),
        );
      return {
        alreadyFlipped: true,
        flippedIndex: existing.flippedIndex!,
        points: existing.tiles[existing.flippedIndex!],
        tiles: existing.tiles,
      };
    }

    const points = board.tiles[target.tileIndex];
    await tx.insert(ledger).values({
      periodId: period.id,
      kidId: target.kidId,
      dayNo: target.dayNo,
      type: "flip",
      pointsDelta: points,
      meta: { tileIndex: target.tileIndex },
      createdAt: ts,
    });

    return {
      alreadyFlipped: false,
      flippedIndex: target.tileIndex,
      points,
      tiles: board.tiles, // full reveal: the roads not taken
    };
  });
}

/** Spend one peek: briefly see one tile's value on a still-playable board. */
export async function spendPeek(db: Db, target: Target, now: Date) {
  const { period, board } = await loadPlayableContext(db, target, now);
  if (board.flippedIndex !== null)
    throw new ActionError("NOT_PLAYABLE", "Board already played");
  const ts = now.toISOString();

  return db.transaction(async (tx) => {
    const [bal] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${ledger.peeksDelta}), 0)` })
      .from(ledger)
      .where(and(eq(ledger.periodId, period.id), eq(ledger.kidId, target.kidId)));
    if ((bal?.total ?? 0) <= 0) throw new ActionError("NO_PEEKS", "No peeks held");

    await tx.insert(ledger).values({
      periodId: period.id,
      kidId: target.kidId,
      dayNo: target.dayNo,
      type: "peek_spent",
      peeksDelta: -1,
      meta: { tileIndex: target.tileIndex },
      createdAt: ts,
    });

    return {
      tileIndex: target.tileIndex,
      value: board.tiles[target.tileIndex],
      peeksLeft: (bal?.total ?? 0) - 1,
    };
  });
}
