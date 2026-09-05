/**
 * The whole schema as plain DDL, kept free of any client so scripts can create
 * these tables in a brand-new database without pulling in the app's connection.
 * `ensureSchema()` runs this on every boot; the backup/restore scripts run it
 * against whichever database they're pointed at.
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
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );
`;
