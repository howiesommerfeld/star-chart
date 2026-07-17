import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, seedFixture, morningOf } from "../helpers/testdb";
import { confirmNight } from "@/db/confirm";
import { flipTile, spendPeek } from "@/db/actions";
import { buildState } from "@/db/state";
import { ledger } from "@/db/schema";
import { generateBoard } from "@/engine/board";
import { TEST_SEED, TEST_TILES } from "../helpers/testdb";

/*
 * The 21-day simulated period (eng plan test contract): a full messy period —
 * yes/no/grace/retro-edits/peeks/catch-up mornings — after which every number
 * the UI would show MUST equal the ledger sum, and the reward outcome must
 * match the invariant. This is the design doc's "state is always explainable
 * from the ledger" success criterion, made executable.
 */

describe("21-day simulated period", () => {
  it("ledger always reconciles with displayed state; invariant outcome correct", async () => {
    const db = await freshDb();
    const { kids, behaviours } = await seedFixture(db);
    const kid = kids[0].id;
    const b = behaviours.map((x) => x.id);

    let expectedPoints = 0;
    const flippedDays = new Set<number>();

    const flip = async (day: number, tile: number, at: Date) => {
      const res = await flipTile(db, { kidId: kid, dayNo: day, tileIndex: tile }, at);
      if (!res.alreadyFlipped) {
        expectedPoints += res.points;
        flippedDays.add(day);
      }
      return res;
    };

    // Days 1-6: good week, some behaviours
    for (let d = 1; d <= 6; d++) {
      const at = morningOf(d);
      await confirmNight(
        db,
        { kidId: kid, dayNo: d, status: "yes", behaviourIds: d % 2 ? [b[0]] : [] },
        at,
      );
      await flip(d, d % 16, at);
    }

    // Day 7: checkpoint should fire (+20 pts) on this confirm
    await confirmNight(db, { kidId: kid, dayNo: 7, status: "yes" }, morningOf(7));
    expectedPoints += 20;
    await flip(7, 3, morningOf(7));

    // Day 8: sick night, graced. Behaviour still confirmed (teeth brushed).
    await confirmNight(
      db,
      { kidId: kid, dayNo: 8, status: "no", grace: true, behaviourIds: [b[2]] },
      morningOf(8),
    );

    // Days 9-11: unlogged weekend+; parent catches up on day 12 (bonanza morning)
    for (const d of [9, 10, 11]) {
      await confirmNight(db, { kidId: kid, dayNo: d, status: "yes" }, morningOf(12));
      await flip(d, (d * 3) % 16, morningOf(12));
    }

    // Day 12: defiant night — plain miss (parent declines the token)
    await confirmNight(db, { kidId: kid, dayNo: 12, status: "no" }, morningOf(13));

    // Day 13: parent retro-edits day 12 to graced after learning kid was sick
    await confirmNight(
      db,
      { kidId: kid, dayNo: 12, status: "no", grace: true },
      morningOf(13),
    );

    // Days 13-14: yes; day-14 checkpoint fires
    await confirmNight(db, { kidId: kid, dayNo: 13, status: "yes" }, morningOf(14));
    await confirmNight(db, { kidId: kid, dayNo: 14, status: "yes" }, morningOf(14));
    expectedPoints += 20;
    await flip(13, 1, morningOf(14));

    // Spend a peek before flipping day 14 (behaviour peeks accumulated)
    const peek = await spendPeek(db, { kidId: kid, dayNo: 14, tileIndex: 5 }, morningOf(14));
    const day14 = await flip(14, 5, morningOf(14)); // trust the peek
    expect(day14.points).toBe(peek.value);

    // Day 15: retro-edit day 5 yes→no (points stand, qualifying drops)
    await confirmNight(db, { kidId: kid, dayNo: 5, status: "no" }, morningOf(15));

    // Days 15-19: yes
    for (let d = 15; d <= 19; d++) {
      await confirmNight(db, { kidId: kid, dayNo: d, status: "yes" }, morningOf(d + 1));
      await flip(d, (d + 7) % 16, morningOf(d + 1));
    }

    // Day 20: yes → qualifying reaches 18 → grand reward fires
    await confirmNight(db, { kidId: kid, dayNo: 20, status: "yes" }, morningOf(20));
    await flip(20, 2, morningOf(20));

    // Day 21: yes
    await confirmNight(db, { kidId: kid, dayNo: 21, status: "yes" }, morningOf(21));
    await flip(21, 0, morningOf(21));

    // ── Reconciliation ──────────────────────────────────────────────────
    const state = await buildState(db, morningOf(21));
    const kidState = state.kids!.find((k) => k.id === kid)!;

    // Points: Σ ledger == displayed == our independent tally
    const rows = await db.select().from(ledger).where(eq(ledger.kidId, kid));
    const ledgerPoints = rows.reduce((s, r) => s + r.pointsDelta, 0);
    expect(kidState.points).toBe(ledgerPoints);
    expect(kidState.points).toBe(expectedPoints);

    // Peeks: never negative, never above cap, matches ledger
    const ledgerPeeks = rows.reduce((s, r) => s + r.peeksDelta, 0);
    expect(kidState.peeks).toBe(ledgerPeeks);
    expect(kidState.peeks).toBeGreaterThanOrEqual(0);
    expect(kidState.peeks).toBeLessThanOrEqual(3);

    // Invariant: yes = days 1-4,6,7,9-11,13-21 = 18; graced = days 8,12 = 2
    // qualifying = 18 + 2 = 20 ≥ 18
    expect(kidState.qualifying).toBe(20);
    expect(kidState.grandRewardEarned).toBe(true);
    const grandEvents = rows.filter((r) => r.type === "grand_reward");
    expect(grandEvents).toHaveLength(1);

    // Grace: spent day 8, spent day 12 (after the retro-edit) = 2 used, 1 left
    expect(kidState.graceUsed).toBe(2);
    expect(kidState.graceLeft).toBe(1);

    // Checkpoints: both fired exactly once
    expect([...kidState.checkpointsGranted].sort((a, b) => a! - b!)).toEqual([7, 14]);
    expect(rows.filter((r) => r.type === "checkpoint")).toHaveLength(2);

    // Day 5 history rule: played board stays revealed despite yes→no retro-edit
    const day5 = kidState.days.find((d) => d.dayNo === 5)!;
    expect(day5.state).toBe("played");
    expect(day5.tiles).toBeDefined();

    // Day 8 graced board: face-down, no values leaked
    const day8 = kidState.days.find((d) => d.dayNo === 8)!;
    expect(day8.state).toBe("graced");
    expect(day8.tiles).toBeUndefined();

    // Boards deterministic end-to-end: replayed generation matches stored reveal
    const day14View = kidState.days.find((d) => d.dayNo === 14)!;
    expect(day14View.tiles).toEqual(generateBoard(TEST_SEED, kid, 14, TEST_TILES));

    // Plain misses: day 5 retro-no (ungraced) = 1 → summit was never lost
    expect(kidState.plainMisses).toBe(1);
    expect(kidState.achievable).toBe(true);
  });

  it("a lost summit keeps flips and points flowing (no dead tail)", async () => {
    const db = await freshDb();
    const { kids } = await seedFixture(db);
    const kid = kids[0].id;

    // 4 plain misses = summit lost on 18/21
    for (const d of [1, 2, 3, 4]) {
      await confirmNight(db, { kidId: kid, dayNo: d, status: "no" }, morningOf(5));
    }
    // Kid keeps playing: day 5 confirmed and flipped
    await confirmNight(db, { kidId: kid, dayNo: 5, status: "yes" }, morningOf(6));
    const res = await flipTile(db, { kidId: kid, dayNo: 5, tileIndex: 0 }, morningOf(6));
    expect(res.points).toBeGreaterThan(0);

    const state = await buildState(db, morningOf(6));
    const kidState = state.kids!.find((k) => k.id === kid)!;
    expect(kidState.achievable).toBe(false); // summit lost…
    expect(kidState.points).toBe(res.points); // …points keep flowing
    expect(kidState.grandRewardEarned).toBe(false);
  });
});
