import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, seedFixture, morningOf, TEST_TILES } from "../helpers/testdb";
import { confirmNight } from "@/db/confirm";
import { flipTile, spendPeek } from "@/db/actions";
import { ledger } from "@/db/schema";
import type { Db } from "@/db/client";

let db: Db;
let kidId: number;
let behaviourIds: number[];

beforeEach(async () => {
  db = await freshDb();
  const fixture = await seedFixture(db);
  kidId = fixture.kids[0].id;
  behaviourIds = fixture.behaviours.map((b) => b.id);
});

describe("flipTile", () => {
  it("rejects flipping an unconfirmed (locked) board", async () => {
    await expect(
      flipTile(db, { kidId, dayNo: 1, tileIndex: 0 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "NOT_CONFIRMED" });
  });

  it("rejects future days even if somehow addressed", async () => {
    await expect(
      flipTile(db, { kidId, dayNo: 9, tileIndex: 0 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "FUTURE_DAY" });
  });

  it("rejects a confirmed-no night", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "no" }, morningOf(2));
    await expect(
      flipTile(db, { kidId, dayNo: 1, tileIndex: 0 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "NOT_CONFIRMED" });
  });

  it("banks the tile value and reveals the whole board", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    const res = await flipTile(db, { kidId, dayNo: 1, tileIndex: 5 }, morningOf(2));
    expect(res.alreadyFlipped).toBe(false);
    expect(res.points).toBe(res.tiles[5]);
    expect([...res.tiles].sort((a, b) => a - b)).toEqual(
      [...TEST_TILES].sort((a, b) => a - b),
    );
  });

  it("is idempotent: double-tap returns the ORIGINAL result and banks once", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    const first = await flipTile(db, { kidId, dayNo: 1, tileIndex: 2 }, morningOf(2));
    const second = await flipTile(db, { kidId, dayNo: 1, tileIndex: 9 }, morningOf(2));
    expect(second.alreadyFlipped).toBe(true);
    expect(second.flippedIndex).toBe(2);
    expect(second.points).toBe(first.points);

    const rows = await db.select().from(ledger).where(eq(ledger.type, "flip"));
    expect(rows).toHaveLength(1);
  });

  it("catch-up morning: three retro-confirmed days give three independent flips", async () => {
    // Days 1-3 unlogged until day 4 morning; parent back-fills, kid flips all three
    for (const d of [1, 2, 3]) {
      await confirmNight(db, { kidId, dayNo: d, status: "yes" }, morningOf(4));
    }
    let total = 0;
    for (const d of [1, 2, 3]) {
      const res = await flipTile(db, { kidId, dayNo: d, tileIndex: d }, morningOf(4));
      total += res.points;
    }
    const rows = await db.select().from(ledger).where(eq(ledger.type, "flip"));
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.pointsDelta, 0)).toBe(total);
  });

  it("rejects an out-of-range tile index", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    await expect(
      flipTile(db, { kidId, dayNo: 1, tileIndex: 16 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "INVALID_TILE" });
  });
});

describe("spendPeek", () => {
  it("rejects with zero balance", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    await expect(
      spendPeek(db, { kidId, dayNo: 1, tileIndex: 0 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "NO_PEEKS" });
  });

  it("reveals the true tile value and decrements the balance", async () => {
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    const peek = await spendPeek(db, { kidId, dayNo: 1, tileIndex: 7 }, morningOf(2));
    const flip = await flipTile(db, { kidId, dayNo: 1, tileIndex: 7 }, morningOf(2));
    expect(peek.value).toBe(flip.points); // peek told the truth
    expect(peek.peeksLeft).toBe(0);
  });

  it("cannot peek an already-played board", async () => {
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    await flipTile(db, { kidId, dayNo: 1, tileIndex: 0 }, morningOf(2));
    await expect(
      spendPeek(db, { kidId, dayNo: 1, tileIndex: 1 }, morningOf(2)),
    ).rejects.toMatchObject({ code: "NOT_PLAYABLE" });
  });
});
