import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Turso in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN); a local SQLite
// file in development so `npm run dev` works with no account at all.
const globalForDb = globalThis as unknown as { __ldClient?: ReturnType<typeof createClient> };

function getClient() {
  if (!globalForDb.__ldClient) {
    const url = process.env.TURSO_DATABASE_URL || "file:./local.db";
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
    globalForDb.__ldClient = createClient({ url, authToken });
  }
  return globalForDb.__ldClient;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    if (!_db) _db = drizzle(getClient(), { schema });
    return Reflect.get(_db, prop);
  },
});

let ensured: Promise<void> | null = null;
/** Creates tables if missing. Cheap, idempotent, and saves a migration step for a one-church app. */
export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await getClient().executeMultiple(`
        CREATE TABLE IF NOT EXISTS verse_cache (
          translation TEXT NOT NULL, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
          text TEXT NOT NULL, source TEXT NOT NULL, fetched_at INTEGER NOT NULL,
          PRIMARY KEY (translation, book, chapter, verse)
        );
        CREATE TABLE IF NOT EXISTS sent_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, label TEXT NOT NULL,
          body TEXT, meta TEXT, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
          body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
        );
      `);
    })();
  }
  return ensured;
}
