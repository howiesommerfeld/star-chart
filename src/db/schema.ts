import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/*
 * Data model (see eng plan D4). The one rule that matters everywhere:
 * `ledger` is APPEND-ONLY — balances are always Σ(deltas), never a stored
 * number, so every screen value is explainable after the fact.
 *
 *   periods ──< nights ──< night_behaviours >── behaviours
 *      │  └──< boards
 *      └──< ledger (also references kid + day)
 *   kids ───< nights / boards / ledger
 */

export const periods = sqliteTable("periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number").notNull(), // 1, 2, 3…
  startsOn: text("starts_on").notNull(), // ISO date of the FIRST NIGHT
  lengthDays: integer("length_days").notNull(),
  timezone: text("timezone").notNull(), // IANA, e.g. Africa/Johannesburg
  wakeHour: integer("wake_hour").notNull().default(5), // day N unlocks at this hour the morning after night N
  xRequired: integer("x_required").notNull(), // N-of-M threshold
  graceTokens: integer("grace_tokens").notNull(),
  checkpointDays: text("checkpoint_days", { mode: "json" })
    .$type<number[]>()
    .notNull(),
  gridW: integer("grid_w").notNull().default(4),
  gridH: integer("grid_h").notNull().default(4),
  // The full tile multiset for one board (length = gridW*gridH). Positions
  // shuffle per (kid, day); the prize SET is identical every day — that's the
  // bank-game mechanic. Snapshotted per period: changes apply next period.
  tileValues: text("tile_values", { mode: "json" }).$type<number[]>().notNull(),
  checkpointBonusPoints: integer("checkpoint_bonus_points").notNull().default(20),
  checkpointBonusPeeks: integer("checkpoint_bonus_peeks").notNull().default(1),
  peekCap: integer("peek_cap").notNull().default(3),
  grandReward: text("grand_reward").notNull(),
  seed: text("seed").notNull(), // server secret; board layouts derive from hmac(seed, kid, day)
  status: text("status", { enum: ["active", "completed", "ended_early"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const kids = sqliteTable("kids", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(), // emoji
  color: text("color").notNull(), // hex signature colour
  sortOrder: integer("sort_order").notNull().default(0),
});

export const nights = sqliteTable(
  "nights",
  {
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id),
    kidId: integer("kid_id")
      .notNull()
      .references(() => kids.id),
    dayNo: integer("day_no").notNull(), // 1..lengthDays
    status: text("status", { enum: ["yes", "no"] }).notNull(), // absence of row = not-yet-logged
    graced: integer("graced", { mode: "boolean" }).notNull().default(false),
    confirmedAt: text("confirmed_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.kidId, t.dayNo] })],
);

export const boards = sqliteTable(
  "boards",
  {
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id),
    kidId: integer("kid_id")
      .notNull()
      .references(() => kids.id),
    dayNo: integer("day_no").notNull(),
    tiles: text("tiles", { mode: "json" }).$type<number[]>().notNull(),
    // Set-once: the conditional UPDATE … WHERE flipped_index IS NULL is the
    // flip's idempotency guard (eng plan: ledger idempotency).
    flippedIndex: integer("flipped_index"),
    flippedAt: text("flipped_at"),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.kidId, t.dayNo] })],
);

export const behaviours = sqliteTable("behaviours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  emoji: text("emoji").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const nightBehaviours = sqliteTable(
  "night_behaviours",
  {
    periodId: integer("period_id").notNull(),
    kidId: integer("kid_id").notNull(),
    dayNo: integer("day_no").notNull(),
    behaviourId: integer("behaviour_id")
      .notNull()
      .references(() => behaviours.id),
  },
  (t) => [primaryKey({ columns: [t.periodId, t.kidId, t.dayNo, t.behaviourId] })],
);

export type LedgerType =
  | "flip"
  | "checkpoint"
  | "behaviour_peek"
  | "behaviour_peek_reversal"
  | "peek_spent"
  | "grace_spent"
  | "grace_refund"
  | "grand_reward"
  | "adjust";

export const ledger = sqliteTable(
  "ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id),
    kidId: integer("kid_id")
      .notNull()
      .references(() => kids.id),
    dayNo: integer("day_no"), // null for period-scoped events
    type: text("type").$type<LedgerType>().notNull(),
    pointsDelta: integer("points_delta").notNull().default(0),
    peeksDelta: integer("peeks_delta").notNull().default(0),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // Once-only events (eng plan, codex D7) enforced as partial unique indexes.
    // NB: SQLite treats NULLs as distinct in unique indexes, so grand_reward
    // (day-less) gets its own index without dayNo.
    uniqueIndex("uq_ledger_day_events")
      .on(t.periodId, t.kidId, t.dayNo, t.type)
      .where(sql`type IN ('flip','checkpoint')`),
    uniqueIndex("uq_ledger_grand_reward")
      .on(t.periodId, t.kidId)
      .where(sql`type = 'grand_reward'`),
  ],
);
