/*
 * Seed the database for period 1: kids, behaviours, period config, and all
 * pre-generated boards. Idempotent-ish: refuses to run if an active period
 * already exists (protects live family data from a fat-fingered re-run).
 *
 * Usage: npm run db:seed
 * ALL configuration (family details, period tuning, database credentials)
 * lives in scripts/star-chart.local.json — GITIGNORED. Copy
 * scripts/star-chart.local.example.json to start. Env vars override.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  loadLocalConfig,
  applyDatabaseEnv,
  X_DEFAULTS,
  GRACE_DEFAULTS,
  CHECKPOINT_DEFAULTS,
} from "./config";
import { getDb } from "../src/db/client";
import { periods, kids, behaviours, boards } from "../src/db/schema";
import { generateBoard } from "../src/engine/board";

// getDb() connects lazily on first call, so setting env here is early enough.
const CONFIG = loadLocalConfig();
applyDatabaseEnv(CONFIG);

const FALLBACK_KIDS = [
  { name: "Kid 1", avatar: "🦄", color: "#7c4dff" },
  { name: "Kid 2", avatar: "🦖", color: "#43a047" },
  { name: "Kid 3", avatar: "🐣", color: "#fb8c00" },
];

const KIDS = (CONFIG.family?.kids ?? FALLBACK_KIDS).map((k, i) => ({
  ...k,
  sortOrder: i,
}));

const p = CONFIG.period ?? {};
const lengthDays = p.lengthDays ?? 21;

const PERIOD = {
  number: 1,
  startsOn:
    process.env.SEED_STARTS_ON ??
    p.startsOn ??
    new Date().toISOString().slice(0, 10), // first NIGHT
  lengthDays,
  timezone:
    process.env.SEED_TIMEZONE ??
    CONFIG.family?.timezone ??
    "Africa/Johannesburg",
  wakeHour: p.wakeHour ?? 5,
  xRequired: p.xRequired ?? X_DEFAULTS[lengthDays] ?? 18, // design doc D2
  graceTokens: p.graceTokens ?? GRACE_DEFAULTS[lengthDays] ?? 3,
  checkpointDays: p.checkpointDays ?? CHECKPOINT_DEFAULTS[lengthDays] ?? [7, 14],
  gridW: 4,
  gridH: 4,
  // One board's prize multiset: 1 jackpot, 3 high, 12 low (positions shuffle daily)
  tileValues:
    p.tileValues ?? [50, 20, 20, 20, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5],
  checkpointBonusPoints: p.checkpointBonusPoints ?? 20,
  checkpointBonusPeeks: p.checkpointBonusPeeks ?? 1,
  peekCap: p.peekCap ?? 3,
  grandReward:
    process.env.SEED_GRAND_REWARD ??
    CONFIG.family?.grandReward ??
    "Trip to the zoo 🦁",
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
