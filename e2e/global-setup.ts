import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../src/db/schema";
import { generateBoard } from "../src/engine/board";

const TILES = [50, 20, 20, 20, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5];
const SEED = "e2e-seed";

export default async function globalSetup() {
  rmSync("e2e.db", { force: true });
  const client = createClient({ url: "file:e2e.db" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  const [period] = await db
    .insert(schema.periods)
    .values({
      number: 1,
      startsOn: "2026-07-10", // FAKE_NOW = Jul 17 07:00 SAST → today = 7
      lengthDays: 21,
      timezone: "Africa/Johannesburg",
      wakeHour: 5,
      xRequired: 5, // lowered so grand reward is reachable in the frozen week
      graceTokens: 3,
      checkpointDays: [14], // out of reach — keeps celebrations grand-only
      gridW: 4,
      gridH: 4,
      tileValues: TILES,
      checkpointBonusPoints: 20,
      checkpointBonusPeeks: 1,
      peekCap: 3,
      grandReward: "Trip to the zoo",
      seed: SEED,
      status: "active",
    })
    .returning();

  const kids = await db
    .insert(schema.kids)
    .values([
      { name: "Maya", avatar: "🦄", color: "#7c4dff", sortOrder: 0 },
      { name: "Finn", avatar: "🦖", color: "#43a047", sortOrder: 1 },
      { name: "Ivy", avatar: "🐣", color: "#fb8c00", sortOrder: 2 },
    ])
    .returning();

  const behaviours = await db
    .insert(schema.behaviours)
    .values([
      { label: "In bed by lights-out", emoji: "🛏️" },
      { label: "Stayed in bed all night", emoji: "🌙" },
      { label: "Teeth brushed unprompted", emoji: "🪥" },
    ])
    .returning();

  const boardRows = [];
  for (const kid of kids) {
    for (let day = 1; day <= 21; day++) {
      boardRows.push({
        periodId: period.id,
        kidId: kid.id,
        dayNo: day,
        tiles: generateBoard(SEED, kid.id, day, TILES),
      });
    }
  }
  await db.insert(schema.boards).values(boardRows);

  const ts = new Date().toISOString();
  // Maya (kid 1): night 7 confirmed-yes — the flip spec's board.
  await db.insert(schema.nights).values({
    periodId: period.id,
    kidId: kids[0].id,
    dayNo: 7,
    status: "yes",
    graced: false,
    confirmedAt: ts,
    updatedAt: ts,
  });
  // Finn (kid 2): night 7 yes + one behaviour peek — the peek spec's board.
  await db.insert(schema.nights).values({
    periodId: period.id,
    kidId: kids[1].id,
    dayNo: 7,
    status: "yes",
    graced: false,
    confirmedAt: ts,
    updatedAt: ts,
  });
  await db.insert(schema.nightBehaviours).values({
    periodId: period.id,
    kidId: kids[1].id,
    dayNo: 7,
    behaviourId: behaviours[0].id,
  });
  await db.insert(schema.ledger).values({
    periodId: period.id,
    kidId: kids[1].id,
    dayNo: 7,
    type: "behaviour_peek",
    peeksDelta: 1,
    meta: { behaviourId: behaviours[0].id },
    createdAt: ts,
  });

  client.close();
}
