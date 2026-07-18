/*
 * Shared loader for scripts/star-chart.local.json — the single gitignored
 * file holding family details, period tuning, and database credentials.
 *
 *   precedence (connection):  env vars  >  local file  >  file:local.db
 *   precedence (seed values): SEED_* env >  local file  >  built-in defaults
 *
 * The deployed app never reads this file — Vercel env vars configure it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface LocalConfig {
  family?: {
    kids?: { name: string; avatar: string; color: string }[];
    grandReward?: string;
    timezone?: string;
  };
  period?: {
    startsOn?: string | null;
    lengthDays?: number;
    wakeHour?: number;
    xRequired?: number | null;
    graceTokens?: number | null;
    checkpointDays?: number[] | null;
    tileValues?: number[];
    checkpointBonusPoints?: number;
    checkpointBonusPeeks?: number;
    peekCap?: number;
  };
  database?: {
    url?: string | null;
    authToken?: string | null;
  };
}

const LOCAL_FILE = "star-chart.local.json";

export function loadLocalConfig(): LocalConfig {
  try {
    return JSON.parse(
      readFileSync(path.join(__dirname, LOCAL_FILE), "utf8"),
    ) as LocalConfig;
  } catch {
    console.warn(
      `⚠️  scripts/${LOCAL_FILE} not found — using built-in defaults.\n` +
        `   Copy scripts/star-chart.local.example.json to scripts/${LOCAL_FILE} and edit it.`,
    );
    return {};
  }
}

/**
 * Point src/db/client.ts at the configured database. Call BEFORE getDb().
 * Env vars already set in the shell always win (emergency override, CI, e2e).
 */
export function applyDatabaseEnv(config: LocalConfig): void {
  const url = config.database?.url;
  if (url && !process.env.TURSO_DATABASE_URL && !process.env.STAR_CHART_DB_URL) {
    process.env.TURSO_DATABASE_URL = url;
    if (config.database?.authToken && !process.env.TURSO_AUTH_TOKEN) {
      process.env.TURSO_AUTH_TOKEN = config.database.authToken;
    }
    console.log(`Using database from scripts/${LOCAL_FILE}: ${url}`);
  } else if (process.env.TURSO_DATABASE_URL) {
    console.log(`Using database from env: ${process.env.TURSO_DATABASE_URL}`);
  } else if (process.env.STAR_CHART_DB_URL) {
    console.log(`Using database from env: ${process.env.STAR_CHART_DB_URL}`);
  } else {
    console.log("Using local dev database (file:local.db)");
  }
}

/** Per-length defaults (design doc D2): X, grace tokens, checkpoint days. */
export const X_DEFAULTS: Record<number, number> = { 14: 12, 21: 18, 28: 24 };
export const GRACE_DEFAULTS: Record<number, number> = { 14: 2, 21: 3, 28: 4 };
export const CHECKPOINT_DEFAULTS: Record<number, number[]> = {
  14: [5, 10],
  21: [7, 14],
  28: [9, 18],
};
