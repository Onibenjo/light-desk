import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schemaSql";

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
      await getClient().executeMultiple(SCHEMA_SQL);
    })();
  }
  return ensured;
}
