import type { Client } from "@libsql/client";

/**
 * The whole schema as plain DDL, kept free of any client so scripts can create
 * these tables in a brand-new database without pulling in the app's connection.
 * `ensureSchema()` runs this on every boot; the backup/restore scripts run it
 * against whichever database they're pointed at. `applySchema` below takes a
 * real `Client`, but only as a type — a type-only import is erased at build
 * time, so this file still pulls in none of the client's runtime code.
 */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS verse_cache (
    translation TEXT NOT NULL, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
    text TEXT NOT NULL, source TEXT NOT NULL, fetched_at INTEGER NOT NULL,
    PRIMARY KEY (translation, book, chapter, verse)
  );
  CREATE TABLE IF NOT EXISTS sent_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, label TEXT NOT NULL,
    body TEXT, meta TEXT, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sent_log_created_at ON sent_log (created_at);
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, edited_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS does nothing
 * to a table that already exists, and SQLite has no ADD COLUMN IF NOT EXISTS, so
 * each one is checked against the live table. Still no migration files to run.
 */
const ADDED_COLUMNS = [{ table: "songs", column: "edited_at", type: "INTEGER" }] as const;

/** Bring any database — new or years old — up to the schema above. Idempotent. */
export async function applySchema(client: Client): Promise<void> {
  await client.executeMultiple(SCHEMA_SQL);
  for (const { table, column, type } of ADDED_COLUMNS) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    if (!info.rows.some((r) => r.name === column)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
