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
  CREATE TABLE IF NOT EXISTS message_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    sort INTEGER NOT NULL, in_service INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL REFERENCES message_sections(id),
    title TEXT NOT NULL, parts TEXT NOT NULL, sort INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, items TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS setlists_one_active ON setlists (active) WHERE active = 1;
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS does nothing
 * to a table that already exists, and SQLite has no ADD COLUMN IF NOT EXISTS, so
 * each one is checked against the live table. Still no migration files to run.
 */
const ADDED_COLUMNS = [{ table: "songs", column: "edited_at", type: "INTEGER" }] as const;

/**
 * True when `e` is SQLite's refusal to add a column that's already there. Two
 * instances can both pass the PRAGMA check before either runs its ALTER — the
 * loser of that race gets this, not a real problem, since the column it wanted
 * now exists either way.
 */
function isDuplicateColumnError(e: unknown): boolean {
  return e instanceof Error && /duplicate column name/i.test(e.message);
}

/**
 * The first release created `messages` as an M2 placeholder (section, title,
 * body, sort) that nothing ever wrote to. CREATE TABLE IF NOT EXISTS would keep
 * that shape forever, so it is dropped here when — and only when — it is still
 * the placeholder and still empty. A placeholder with rows means someone put
 * data there by hand; refusing loudly beats dropping it.
 *
 * Two instances booting at once can both pass the check; the second DROP then
 * finds either nothing (IF EXISTS) or the new, still-empty table, which the
 * SCHEMA_SQL that follows recreates. Nothing with data in it is reachable.
 */
async function replacePlaceholderMessages(client: Client): Promise<void> {
  const info = await client.execute("PRAGMA table_info(messages)");
  if (!info.rows.some((r) => r.name === "body")) return;
  const count = await client.execute("SELECT count(*) AS n FROM messages");
  const rows = Number(count.rows[0].n);
  if (rows > 0) {
    throw new Error(`The messages table still has its old placeholder shape and ${rows} row(s); refusing to drop it. Back it up, empty it, and restart.`);
  }
  await client.execute("DROP TABLE IF EXISTS messages");
}

/** Bring any database — new or years old — up to the schema above. Idempotent. */
export async function applySchema(client: Client): Promise<void> {
  await replacePlaceholderMessages(client);
  await client.executeMultiple(SCHEMA_SQL);
  for (const { table, column, type } of ADDED_COLUMNS) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    if (info.rows.some((r) => r.name === column)) continue;
    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (e) {
      if (!isDuplicateColumnError(e)) throw e;
    }
  }
}
