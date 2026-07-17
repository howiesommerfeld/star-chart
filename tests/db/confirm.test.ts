import { describe, it, expect, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { freshDb, seedFixture, morningOf } from "../helpers/testdb";
import { confirmNight, ConfirmError } from "@/db/confirm";
import { flipTile } from "@/db/actions";
import { ledger, nights } from "@/db/schema";
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

const ledgerRows = (kid: number) =>
  db
    .select()
    .from(ledger)
    .where(eq(ledger.kidId, kid));

describe("confirmNight — day validation", () => {
  it("rejects future days", async () => {
    await expect(
      confirmNight(db, { kidId, dayNo: 5, status: "yes" }, morningOf(3)),
    ).rejects.toMatchObject({ code: "FUTURE_DAY" });
  });

  it("rejects out-of-period days", async () => {
    await expect(
      confirmNight(db, { kidId, dayNo: 22, status: "yes" }, morningOf(21)),
    ).rejects.toMatchObject({ code: "INVALID_DAY" });
    await expect(
      confirmNight(db, { kidId, dayNo: 0, status: "yes" }, morningOf(3)),
    ).rejects.toMatchObject({ code: "INVALID_DAY" });
  });

  it("accepts retro-logging any past day", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(5));
    const [night] = await db.select().from(nights).where(eq(nights.dayNo, 1));
    expect(night.status).toBe("yes");
  });
});

describe("confirmNight — grace tokens", () => {
  it("spends a token on grace and refunds when superseded by yes", async () => {
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "no", grace: true },
      morningOf(2),
    );
    let rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "grace_spent")).toHaveLength(1);

    // Parent learns the kid actually stayed in bed: yes supersedes grace
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(3));
    rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "grace_refund")).toHaveLength(1);

    // Token pool restored: can grace 3 more nights
    await confirmNight(db, { kidId, dayNo: 2, status: "no", grace: true }, morningOf(4));
    await confirmNight(db, { kidId, dayNo: 3, status: "no", grace: true }, morningOf(4));
    await confirmNight(db, { kidId, dayNo: 4, status: "no", grace: true }, morningOf(5));
  });

  it("rejects grace when the pool is exhausted", async () => {
    for (const day of [1, 2, 3]) {
      await confirmNight(
        db,
        { kidId, dayNo: day, status: "no", grace: true },
        morningOf(4),
      );
    }
    await expect(
      confirmNight(db, { kidId, dayNo: 4, status: "no", grace: true }, morningOf(5)),
    ).rejects.toMatchObject({ code: "NO_GRACE_TOKENS" });
  });

  it("re-confirming the same graced night does not double-spend", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "no", grace: true }, morningOf(2));
    await confirmNight(db, { kidId, dayNo: 1, status: "no", grace: true }, morningOf(2));
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "grace_spent")).toHaveLength(1);
  });
});

describe("confirmNight — behaviours & peeks", () => {
  it("grants peeks for behaviours, on confirmed-no nights too", async () => {
    await confirmNight(
      db,
      {
        kidId,
        dayNo: 1,
        status: "no",
        behaviourIds: [behaviourIds[0], behaviourIds[2]],
      },
      morningOf(2),
    );
    const rows = await ledgerRows(kidId);
    const mints = rows.filter((r) => r.type === "behaviour_peek");
    expect(mints).toHaveLength(2);
  });

  it("clamps peek grants at the cap; excess is forfeited", async () => {
    // 3 behaviours day 1 = cap reached
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds },
      morningOf(2),
    );
    // 2 more behaviours day 2: balance already 3, no mints
    await confirmNight(
      db,
      { kidId, dayNo: 2, status: "yes", behaviourIds: behaviourIds.slice(0, 2) },
      morningOf(3),
    );
    const rows = await ledgerRows(kidId);
    const total = rows.reduce((s, r) => s + r.peeksDelta, 0);
    expect(total).toBe(3);
  });

  it("toggle-off reverses an unspent peek; toggle-on again can't double-mint", async () => {
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    // toggle off
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [] },
      morningOf(2),
    );
    let rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "behaviour_peek_reversal")).toHaveLength(1);

    // toggle back on: net was 0, mints again (legitimate)
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    rows = await ledgerRows(kidId);
    const balance = rows.reduce((s, r) => s + r.peeksDelta, 0);
    expect(balance).toBe(1);
  });

  it("a SPENT peek is never clawed back by toggle-off, and re-toggle can't re-mint it", async () => {
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    // spend the peek on today's board
    await db.transaction(async () => {}); // no-op; spend via ledger directly for isolation
    const { spendPeek } = await import("@/db/actions");
    await spendPeek(db, { kidId, dayNo: 1, tileIndex: 0 }, morningOf(2));

    // toggle off: balance is 0 → no reversal
    await confirmNight(db, { kidId, dayNo: 1, status: "yes", behaviourIds: [] }, morningOf(2));
    // toggle on: net grants for pair is +1 → no re-mint
    await confirmNight(
      db,
      { kidId, dayNo: 1, status: "yes", behaviourIds: [behaviourIds[0]] },
      morningOf(2),
    );
    const rows = await ledgerRows(kidId);
    const balance = rows.reduce((s, r) => s + r.peeksDelta, 0);
    expect(balance).toBe(0); // spent stays spent
    expect(rows.filter((r) => r.type === "behaviour_peek")).toHaveLength(1);
  });

  it("rejects unknown behaviour ids", async () => {
    await expect(
      confirmNight(
        db,
        { kidId, dayNo: 1, status: "yes", behaviourIds: [999] },
        morningOf(2),
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_BEHAVIOUR" });
  });
});

describe("confirmNight — checkpoints", () => {
  async function confirmDays(from: number, to: number, at: Date) {
    for (let d = from; d <= to; d++) {
      await confirmNight(db, { kidId, dayNo: d, status: "yes" }, at);
    }
  }

  it("grants the day-7 checkpoint exactly once", async () => {
    await confirmDays(1, 7, morningOf(7));
    await confirmNight(db, { kidId, dayNo: 7, status: "yes" }, morningOf(8)); // re-confirm
    const rows = await ledgerRows(kidId);
    const cps = rows.filter((r) => r.type === "checkpoint" && r.dayNo === 7);
    expect(cps).toHaveLength(1);
    expect(cps[0].pointsDelta).toBe(20);
    expect(cps[0].peeksDelta).toBe(1);
  });

  it("does not grant when the summit is already lost before the checkpoint day", async () => {
    // Misses logged BEFORE day 7 arrives — summit dead on arrival at the checkpoint
    for (const d of [1, 2, 3, 4]) {
      await confirmNight(db, { kidId, dayNo: d, status: "no" }, morningOf(5));
    }
    await confirmDays(5, 7, morningOf(7));
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "checkpoint")).toHaveLength(0);
  });

  it("grants generously while past days are merely unlogged (monotonic by design)", async () => {
    // Parent's first-ever confirm happens on day-7 morning: days 1-6 unlogged
    // count as potentially qualifying, so the checkpoint fires — and stands
    // even when the unlogged days later turn out to be misses.
    await confirmNight(db, { kidId, dayNo: 1, status: "no" }, morningOf(7));
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "checkpoint" && r.dayNo === 7)).toHaveLength(1);
  });

  it("retro-grants monotonically: catch-up on day 10 fires the day-7 bonus", async () => {
    // nothing logged until day 10, then parent back-fills
    await confirmDays(1, 10, morningOf(10));
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "checkpoint" && r.dayNo === 7)).toHaveLength(1);
  });

  it("granted checkpoints stand even if achievability later drops (never revoked)", async () => {
    await confirmDays(1, 7, morningOf(7));
    // 4 plain misses later — summit lost
    for (const d of [8, 9, 10, 11]) {
      await confirmNight(db, { kidId, dayNo: d, status: "no" }, morningOf(12));
    }
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "checkpoint" && r.dayNo === 7)).toHaveLength(1);
  });
});

describe("confirmNight — grand reward", () => {
  it("fires exactly once at the Xth qualifying night, never again on recompute", async () => {
    for (let d = 1; d <= 18; d++) {
      await confirmNight(db, { kidId, dayNo: d, status: "yes" }, morningOf(18));
    }
    // Re-confirm and add more nights — event must stay unique
    await confirmNight(db, { kidId, dayNo: 18, status: "yes" }, morningOf(19));
    await confirmNight(db, { kidId, dayNo: 19, status: "yes" }, morningOf(20));
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "grand_reward")).toHaveLength(1);
  });

  it("counts graced nights toward X", async () => {
    for (let d = 1; d <= 15; d++) {
      await confirmNight(db, { kidId, dayNo: d, status: "yes" }, morningOf(18));
    }
    for (const d of [16, 17, 18]) {
      await confirmNight(db, { kidId, dayNo: d, status: "no", grace: true }, morningOf(19));
    }
    const rows = await ledgerRows(kidId);
    expect(rows.filter((r) => r.type === "grand_reward")).toHaveLength(1);
  });
});

describe("confirmNight — transaction rollback", () => {
  it("a failed confirm leaves no partial state (grace check fails after night would change)", async () => {
    // Exhaust tokens
    for (const day of [1, 2, 3]) {
      await confirmNight(db, { kidId, dayNo: day, status: "no", grace: true }, morningOf(4));
    }
    const before = await ledgerRows(kidId);
    // This confirm throws NO_GRACE_TOKENS inside the transaction
    await expect(
      confirmNight(db, { kidId, dayNo: 4, status: "no", grace: true }, morningOf(5)),
    ).rejects.toBeInstanceOf(ConfirmError);
    const after = await ledgerRows(kidId);
    expect(after).toHaveLength(before.length); // no stray events
    const [night4] = await db
      .select()
      .from(nights)
      .where(and(eq(nights.kidId, kidId), eq(nights.dayNo, 4)));
    expect(night4).toBeUndefined(); // night upsert rolled back too
  });
});

describe("points are never lost (Premise 2)", () => {
  it("retro yes→no keeps banked flip points", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    const flip = await flipTile(db, { kidId, dayNo: 1, tileIndex: 3 }, morningOf(2));
    expect(flip.points).toBeGreaterThan(0);

    await confirmNight(db, { kidId, dayNo: 1, status: "no" }, morningOf(3));
    const rows = await ledgerRows(kidId);
    const points = rows.reduce((s, r) => s + r.pointsDelta, 0);
    expect(points).toBe(flip.points); // still banked
  });
});

describe("last-write-wins across parents", () => {
  it("second confirm of the same night simply overwrites status", async () => {
    await confirmNight(db, { kidId, dayNo: 1, status: "no" }, morningOf(2));
    await confirmNight(db, { kidId, dayNo: 1, status: "yes" }, morningOf(2));
    const [night] = await db
      .select()
      .from(nights)
      .where(and(eq(nights.kidId, kidId), eq(nights.dayNo, 1)));
    expect(night.status).toBe("yes");
    const [count] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(nights)
      .where(and(eq(nights.kidId, kidId), eq(nights.dayNo, 1)));
    expect(count.c).toBe(1); // one row, not two
  });
});
