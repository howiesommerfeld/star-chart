/*
 * Apply Drizzle migrations, taking a pre-migration backup first (eng plan /
 * codex D7: schema changes against live kid data always follow a dump).
 *
 * Connection comes from scripts/star-chart.local.json (database section),
 * overridable via TURSO_DATABASE_URL / TURSO_AUTH_TOKEN env vars; falls back
 * to file:local.db for dev.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { loadLocalConfig, applyDatabaseEnv } from "./config";
import { getDb } from "../src/db/client";

// getDb() and rawClient() read env lazily, so setting it here is early enough.
applyDatabaseEnv(loadLocalConfig());

function rawClient() {
  return createClient({
    url:
      process.env.TURSO_DATABASE_URL ??
      process.env.STAR_CHART_DB_URL ??
      "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

async function dumpBackup() {
  const client = rawClient();
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
  );
  if (tables.rows.length === 0) {
    console.log("Fresh database — skipping pre-migration backup.");
    return;
  }
  const lines: string[] = [];
  for (const row of tables.rows) {
    const table = String(row.name);
    const data = await client.execute(`SELECT * FROM "${table}"`);
    lines.push(`-- ${table}: ${data.rows.length} rows`);
    for (const r of data.rows) {
      const cols = data.columns.map((c: string) => `"${c}"`).join(",");
      const vals = data.columns
        .map((c: string) => {
          const v = r[c];
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "number" || typeof v === "bigint") return String(v);
          return `'${String(v).replaceAll("'", "''")}'`;
        })
        .join(",");
      lines.push(`INSERT INTO "${table}" (${cols}) VALUES (${vals});`);
    }
  }
  mkdirSync("backups", { recursive: true });
  const file = `backups/pre-migration-${new Date().toISOString().replaceAll(":", "-")}.sql`;
  writeFileSync(file, lines.join("\n"));
  console.log(`Backup written: ${file} (${lines.length} lines)`);
}

async function main() {
  await dumpBackup();
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
}

main().then(() => process.exit(0));
