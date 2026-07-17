import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/db/schema";
import { generateBoard } from "@/engine/board";
import type { Db } from "@/db/client";

export const TEST_TILES = [50, 20, 20, 20, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5];
export const TEST_SEED = "test-period-seed";

/** Fresh migrated DB in a temp dir; each call is fully isolated. */
export async function freshDb(): Promise<Db> {
  const dir = mkdtempSync(path.join(tmpdir(), "star-chart-test-"));
  const client = createClient({ url: `file:${path.join(dir, "test.db")}` });
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export interface FixtureOptions {
  startsOn?: string;
  lengthDays?: number;
  xRequired?: number;
  graceTokens?: number;
  checkpointDays?: number[];
  peekCap?: number;
}

/** Seed one period + 3 kids + all boards. First night = startsOn (default Jul 17). */
export async function seedFixture(db: Db, opts: FixtureOptions = {}) {
  const config = {
    number: 1,
    startsOn: opts.startsOn ?? "2026-07-17",
    lengthDays: opts.lengthDays ?? 21,
    timezone: "Africa/Johannesburg",
    wakeHour: 5,
    xRequired: opts.xRequired ?? 18,
    graceTokens: opts.graceTokens ?? 3,
    checkpointDays: opts.checkpointDays ?? [7, 14],
    gridW: 4,
    gridH: 4,
    tileValues: TEST_TILES,
    checkpointBonusPoints: 20,
    checkpointBonusPeeks: 1,
    peekCap: opts.peekCap ?? 3,
    grandReward: "Trip to the zoo",
    seed: TEST_SEED,
    status: "active" as const,
  };
  const [period] = await db.insert(schema.periods).values(config).returning();
  const kidRows = await db
    .insert(schema.kids)
    .values([
      { name: "Maya", avatar: "🦄", color: "#7c4dff", sortOrder: 0 },
      { name: "Finn", avatar: "🦖", color: "#43a047", sortOrder: 1 },
      { name: "Ivy", avatar: "🐣", color: "#fb8c00", sortOrder: 2 },
    ])
    .returning();
  const behaviourRows = await db
    .insert(schema.behaviours)
    .values([
      { label: "In bed by lights-out", emoji: "🛏️" },
      { label: "Stayed in bed all night", emoji: "🌙" },
      { label: "Teeth brushed unprompted", emoji: "🪥" },
    ])
    .returning();

  const boardRows = [];
  for (const kid of kidRows) {
    for (let day = 1; day <= config.lengthDays; day++) {
      boardRows.push({
        periodId: period.id,
        kidId: kid.id,
        dayNo: day,
        tiles: generateBoard(TEST_SEED, kid.id, day, TEST_TILES),
      });
    }
  }
  await db.insert(schema.boards).values(boardRows);

  return { period, kids: kidRows, behaviours: behaviourRows };
}

/** Morning after night N at 07:00 SAST (comfortably past wake hour 5). */
export function morningOf(dayNo: number, startsOn = "2026-07-17"): Date {
  const [y, m, d] = startsOn.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dayNo, 5, 0, 0)); // 05:00 UTC = 07:00 SAST
}
