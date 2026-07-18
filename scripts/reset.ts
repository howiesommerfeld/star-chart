/*
 * Wipe all game data and re-seed from scripts/star-chart.local.json.
 * For test cycles against production (or dev) without lingering pollution:
 *
 *   SEED_STARTS_ON=2026-07-11 npm run db:reset -- --yes   # backdated playground
 *   npm run db:reset -- --yes                             # back to real defaults
 *
 * Safety: refuses to run without --yes, prints the target DB and row counts
 * first, and writes a full backup dump to backups/ before deleting anything.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { loadLocalConfig, applyDatabaseEnv } from "./config";

applyDatabaseEnv(loadLocalConfig());

const TABLES = [
  // children first (FK order)
  "ledger",
  "night_behaviours",
  "nights",
  "boards",
  "behaviours",
  "periods",
  "kids",
];

function client() {
  return createClient({
    url:
      process.env.TURSO_DATABASE_URL ??
      process.env.STAR_CHART_DB_URL ??
      "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

async function main() {
  const db = client();

  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const res = await db
      .execute(`SELECT COUNT(*) AS c FROM "${t}"`)
      .catch(() => ({ rows: [{ c: 0 }] }));
    counts[t] = Number(res.rows[0].c);
  }
  console.log("Target:", process.env.TURSO_DATABASE_URL ?? "file:local.db");
  console.log("Rows:", JSON.stringify(counts));

  if (!process.argv.includes("--yes")) {
    console.log("\nDry run — nothing deleted. Re-run with:  npm run db:reset -- --yes");
    process.exit(0);
  }

  // Backup before destruction (same shape as migrate's pre-dump)
  const lines: string[] = [];
  for (const t of TABLES) {
    const data = await db.execute(`SELECT * FROM "${t}"`);
    lines.push(`-- ${t}: ${data.rows.length} rows`);
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
      lines.push(`INSERT INTO "${t}" (${cols}) VALUES (${vals});`);
    }
  }
  mkdirSync("backups", { recursive: true });
  const file = `backups/pre-reset-${new Date().toISOString().replaceAll(":", "-")}.sql`;
  writeFileSync(file, lines.join("\n"));
  console.log(`Backup written: ${file}`);

  for (const t of TABLES) {
    await db.execute(`DELETE FROM "${t}"`);
  }
  console.log("All game data wiped. Re-seeding from scripts/star-chart.local.json…\n");
  db.close();

  // Same env (incl. SEED_* overrides) flows into the normal seed path.
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
}

main().then(() => process.exit(0));
