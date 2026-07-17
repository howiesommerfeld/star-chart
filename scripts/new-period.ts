/*
 * Start a new period (eng plan T12 / codex D8 — the day-22 cliff killer).
 *
 *   close active period ──▶ snapshot config (carried or overridden)
 *        ──▶ new period row (fresh seed) ──▶ pre-generate all boards
 *
 * Points carry over automatically (they live in the ledger, keyed by kid);
 * grace tokens and the day grid reset because they're period-scoped.
 *
 * Usage:
 *   npm run db:new-period                          # start tonight, same config
 *   SEED_STARTS_ON=2026-08-01 npm run db:new-period
 *   SEED_GRAND_REWARD="Movie night 🎬" npm run db:new-period
 *   SEED_LENGTH=14 npm run db:new-period           # 14/21/28 (X scales: 12/18/24)
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { periods, kids, boards } from "../src/db/schema";
import { generateBoard } from "../src/engine/board";

const X_DEFAULTS: Record<number, number> = { 14: 12, 21: 18, 28: 24 };
const GRACE_DEFAULTS: Record<number, number> = { 14: 2, 21: 3, 28: 4 };
const CHECKPOINT_DEFAULTS: Record<number, number[]> = {
  14: [5, 10],
  21: [7, 14],
  28: [9, 18],
};

async function main() {
  const db = getDb();

  const [active] = await db
    .select()
    .from(periods)
    .where(eq(periods.status, "active"));
  if (!active) {
    console.error("No active period to close. Run db:seed for a first period.");
    process.exit(1);
  }

  const lengthDays = Number(process.env.SEED_LENGTH ?? active.lengthDays);
  if (!X_DEFAULTS[lengthDays]) {
    console.error(`SEED_LENGTH must be 14, 21 or 28 (got ${lengthDays})`);
    process.exit(1);
  }

  const allKids = await db.select().from(kids);
  const seed = randomBytes(32).toString("hex");
  const startsOn =
    process.env.SEED_STARTS_ON ?? new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(periods)
      .set({ status: "completed" })
      .where(eq(periods.id, active.id));

    const [next] = await tx
      .insert(periods)
      .values({
        number: active.number + 1,
        startsOn,
        lengthDays,
        timezone: active.timezone,
        wakeHour: active.wakeHour,
        xRequired: X_DEFAULTS[lengthDays],
        graceTokens: GRACE_DEFAULTS[lengthDays],
        checkpointDays: CHECKPOINT_DEFAULTS[lengthDays],
        gridW: active.gridW,
        gridH: active.gridH,
        tileValues: active.tileValues, // config snapshot carries forward
        checkpointBonusPoints: active.checkpointBonusPoints,
        checkpointBonusPeeks: active.checkpointBonusPeeks,
        peekCap: active.peekCap,
        grandReward: process.env.SEED_GRAND_REWARD ?? active.grandReward,
        seed,
        status: "active",
      })
      .returning();

    const rows = [];
    for (const kid of allKids) {
      for (let day = 1; day <= lengthDays; day++) {
        rows.push({
          periodId: next.id,
          kidId: kid.id,
          dayNo: day,
          tiles: generateBoard(seed, kid.id, day, active.tileValues),
        });
      }
    }
    await tx.insert(boards).values(rows);

    console.log(
      `Period #${active.number} closed. Period #${next.number} started: ` +
        `${startsOn}, ${lengthDays} days, X=${next.xRequired}, ` +
        `reward: ${next.grandReward}. Points carried, grace reset.`,
    );
  });
}

main().then(() => process.exit(0));
