/*
 * Seed the database for period 1: kids, behaviours, period config, and all
 * pre-generated boards. Idempotent-ish: refuses to run if an active period
 * already exists (protects live family data from a fat-fingered re-run).
 *
 * Usage: npm run db:seed
 * Family details (kid names/avatars/colours, reward) live in
 * scripts/family.local.json — GITIGNORED so real names never hit the repo.
 * Copy scripts/family.local.example.json to start.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/client";
import { periods, kids, behaviours, boards } from "../src/db/schema";
import { generateBoard } from "../src/engine/board";
import { eq } from "drizzle-orm";

interface FamilyConfig {
  kids: { name: string; avatar: string; color: string }[];
  grandReward: string;
  timezone?: string;
}

function loadFamily(): FamilyConfig {
  const file = path.join(__dirname, "family.local.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.warn(
      "⚠️  scripts/family.local.json not found — using placeholder kids.\n" +
        "   Copy scripts/family.local.example.json to family.local.json and edit it.",
    );
    return JSON.parse(
      readFileSync(path.join(__dirname, "family.local.example.json"), "utf8"),
    );
  }
}

const FAMILY = loadFamily();
const KIDS = FAMILY.kids.map((k, i) => ({ ...k, sortOrder: i }));

const PERIOD = {
  number: 1,
  startsOn: process.env.SEED_STARTS_ON ?? new Date().toISOString().slice(0, 10), // first NIGHT
  lengthDays: 21,
  timezone: process.env.SEED_TIMEZONE ?? FAMILY.timezone ?? "Africa/Johannesburg",
  wakeHour: 5,
  xRequired: 18, // 18-of-21 (design doc D2)
  graceTokens: 3, // 1 per 7 days
  checkpointDays: [7, 14],
  gridW: 4,
  gridH: 4,
  // One board's prize multiset: 1 jackpot, 3 high, 12 low (positions shuffle daily)
  tileValues: [50, 20, 20, 20, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5],
  checkpointBonusPoints: 20,
  checkpointBonusPeeks: 1,
  peekCap: 3,
  grandReward: process.env.SEED_GRAND_REWARD ?? FAMILY.grandReward,
};

const BEHAVIOURS = [
  { label: "In bed by lights-out", emoji: "🛏️" },
  { label: "Stayed in bed all night", emoji: "🌙" },
  { label: "Teeth brushed unprompted", emoji: "🪥" },
];
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();

  const existing = await db
    .select()
    .from(periods)
    .where(eq(periods.status, "active"));
  if (existing.length > 0) {
    console.error(
      `Refusing to seed: active period #${existing[0].number} already exists. ` +
        `Use npm run db:new-period to start a new one.`,
    );
    process.exit(1);
  }

  if (PERIOD.tileValues.length !== PERIOD.gridW * PERIOD.gridH) {
    throw new Error(
      `tileValues length ${PERIOD.tileValues.length} != grid ${PERIOD.gridW}x${PERIOD.gridH}`,
    );
  }

  const seededKids = await db.insert(kids).values(KIDS).returning();
  await db.insert(behaviours).values(BEHAVIOURS);

  const seed = randomBytes(32).toString("hex");
  const [period] = await db
    .insert(periods)
    .values({ ...PERIOD, seed, status: "active" })
    .returning();

  // Pre-generate every board (design doc: deterministic, auditable).
  const rows = [];
  for (const kid of seededKids) {
    for (let day = 1; day <= PERIOD.lengthDays; day++) {
      rows.push({
        periodId: period.id,
        kidId: kid.id,
        dayNo: day,
        tiles: generateBoard(seed, kid.id, day, PERIOD.tileValues),
      });
    }
  }
  await db.insert(boards).values(rows);

  console.log(
    `Seeded period #${period.number}: ${seededKids.length} kids, ` +
      `${rows.length} boards, ${PERIOD.lengthDays} days, X=${PERIOD.xRequired}, ` +
      `reward: ${PERIOD.grandReward}`,
  );
}

main().then(() => process.exit(0));
