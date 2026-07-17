import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;
/** A Db or the transaction handle inside db.transaction() — same query API. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

let _client: Client | undefined;
let _db: Db | undefined;

/** Dev/tests hit file:local.db (or STAR_CHART_DB_URL); prod hits Turso. */
export function getDb(): Db {
  if (!_db) {
    _client = createClient({
      url:
        process.env.TURSO_DATABASE_URL ??
        process.env.STAR_CHART_DB_URL ??
        "file:local.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** Test helper: point at a fresh DB and drop the cached connection. */
export function resetDbForTests(url: string) {
  _client?.close();
  _client = undefined;
  _db = undefined;
  process.env.STAR_CHART_DB_URL = url;
}
