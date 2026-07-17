import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import {
  kids,
  nights,
  boards,
  ledger,
  behaviours,
  nightBehaviours,
} from "./schema";
import { getActivePeriod } from "./confirm";
import { currentDayNo } from "@/engine/day";
import {
  qualifyingCount,
  plainMisses,
  achievable,
  graceTokensUsed,
  type NightRecord,
} from "@/engine/rewards";

/*
 * GET /state assembly. Board state machine (eng plan D7):
 *
 *  future ──(day arrives)──▶ locked ──(confirm-yes)──▶ playable ──(flip)──▶ played
 *                               │                          ▲
 *                               ├──(confirm-no+grace)──▶ graced   (retro no→yes)
 *                               └──(confirm-no plain)──▶ missed ──────┘
 *
 *  Tile VALUES are included only for state=played (history rule: a played
 *  board stays revealed forever, even if the night is later retro-edited).
 */

export type BoardState =
  | "future"
  | "locked"
  | "playable"
  | "played"
  | "graced"
  | "missed";

export interface DayView {
  dayNo: number;
  state: BoardState;
  isToday: boolean;
  checkpoint: boolean;
  // played only:
  tiles?: number[];
  flippedIndex?: number;
  pointsWon?: number;
}

export async function buildState(db: Db, now: Date) {
  const period = await getActivePeriod(db);
  if (!period) return { period: null };

  const today = currentDayNo(period, now);
  const allKids = await db.select().from(kids).orderBy(kids.sortOrder);
  const allBehaviours = await db
    .select()
    .from(behaviours)
    .where(eq(behaviours.active, true));

  const kidStates = [];
  for (const kid of allKids) {
    const kidNights = await db
      .select()
      .from(nights)
      .where(and(eq(nights.periodId, period.id), eq(nights.kidId, kid.id)));
    const kidBoards = await db
      .select()
      .from(boards)
      .where(and(eq(boards.periodId, period.id), eq(boards.kidId, kid.id)));
    const [balances] = await db
      .select({
        points: sql<number>`COALESCE(SUM(${ledger.pointsDelta}), 0)`,
        peeks: sql<number>`COALESCE(SUM(${ledger.peeksDelta}), 0)`,
      })
      .from(ledger)
      .where(and(eq(ledger.periodId, period.id), eq(ledger.kidId, kid.id)));
    // Points carry across periods (design doc): all-period total for display.
    const [lifetime] = await db
      .select({ points: sql<number>`COALESCE(SUM(${ledger.pointsDelta}), 0)` })
      .from(ledger)
      .where(eq(ledger.kidId, kid.id));
    const grantedCheckpoints = (
      await db
        .select({ dayNo: ledger.dayNo })
        .from(ledger)
        .where(
          and(
            eq(ledger.periodId, period.id),
            eq(ledger.kidId, kid.id),
            eq(ledger.type, "checkpoint"),
          ),
        )
    ).map((r) => r.dayNo);
    const [grand] = await db
      .select({ c: sql<number>`COUNT(*)`, at: sql<string>`MAX(${ledger.createdAt})` })
      .from(ledger)
      .where(
        and(
          eq(ledger.periodId, period.id),
          eq(ledger.kidId, kid.id),
          eq(ledger.type, "grand_reward"),
        ),
      );

    const nightRecords: NightRecord[] = kidNights.map((n) => ({
      dayNo: n.dayNo,
      status: n.status,
      graced: n.graced,
    }));
    const nightByDay = new Map(kidNights.map((n) => [n.dayNo, n]));
    const boardByDay = new Map(kidBoards.map((b) => [b.dayNo, b]));

    const days: DayView[] = [];
    for (let dayNo = 1; dayNo <= period.lengthDays; dayNo++) {
      const night = nightByDay.get(dayNo);
      const board = boardByDay.get(dayNo);
      const played = board?.flippedIndex !== null && board?.flippedIndex !== undefined;

      let state: BoardState;
      if (played) state = "played"; // history rule: played stays revealed
      else if (dayNo > today) state = "future";
      else if (!night) state = "locked";
      else if (night.status === "yes") state = "playable";
      else if (night.graced) state = "graced";
      else state = "missed";

      const view: DayView = {
        dayNo,
        state,
        isToday: dayNo === today,
        checkpoint: period.checkpointDays.includes(dayNo),
      };
      if (state === "played" && board) {
        view.tiles = board.tiles;
        view.flippedIndex = board.flippedIndex!;
        view.pointsWon = board.tiles[board.flippedIndex!];
      }
      days.push(view);
    }

    const behaviourConfirmations = await db
      .select()
      .from(nightBehaviours)
      .where(
        and(
          eq(nightBehaviours.periodId, period.id),
          eq(nightBehaviours.kidId, kid.id),
        ),
      );

    kidStates.push({
      id: kid.id,
      name: kid.name,
      avatar: kid.avatar,
      color: kid.color,
      points: lifetime?.points ?? 0,
      periodPoints: balances?.points ?? 0,
      peeks: balances?.peeks ?? 0,
      qualifying: qualifyingCount(nightRecords),
      plainMisses: plainMisses(nightRecords),
      achievable: achievable(period.lengthDays, nightRecords, period.xRequired),
      graceUsed: graceTokensUsed(nightRecords),
      graceLeft: period.graceTokens - graceTokensUsed(nightRecords),
      checkpointsGranted: grantedCheckpoints,
      grandRewardEarned: (grand?.c ?? 0) > 0,
      grandRewardEarnedAt: (grand?.c ?? 0) > 0 ? grand?.at : null,
      days,
      nightStatuses: Object.fromEntries(
        kidNights.map((n) => [n.dayNo, { status: n.status, graced: n.graced }]),
      ),
      behaviourDays: behaviourConfirmations.reduce<Record<number, number[]>>(
        (acc, r) => {
          (acc[r.dayNo] ??= []).push(r.behaviourId);
          return acc;
        },
        {},
      ),
    });
  }

  return {
    period: {
      id: period.id,
      number: period.number,
      lengthDays: period.lengthDays,
      xRequired: period.xRequired,
      graceTokens: period.graceTokens,
      checkpointDays: period.checkpointDays,
      grandReward: period.grandReward,
      peekCap: period.peekCap,
      today,
      status: period.status,
    },
    behaviours: allBehaviours,
    kids: kidStates,
  };
}
