import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/** One row per verse per translation. Filled the first time a verse is fetched. */
export const verseCache = sqliteTable(
  "verse_cache",
  {
    translation: text("translation").notNull(), // "NKJV"
    book: integer("book").notNull(), // 0-based index in books.ts
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    text: text("text").notNull(),
    source: text("source").notNull(), // youversion | apibible | gateway
    fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.translation, t.book, t.chapter, t.verse] })],
);

/** Everything the operator copied, for handover and pilot metrics. */
export const sentLog = sqliteTable("sent_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // verse | search | message | song
  label: text("label").notNull(), // "Romans 8:28 NKJV", the search phrase, etc.
  body: text("body"), // the exact text copied
  meta: text("meta"), // JSON: { source, ms, candidates }
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Canned messages (M2) — table exists now so the schema doesn't churn later. */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  section: text("section").notNull(), // runsheet section or "scenario"
  title: text("title").notNull(),
  body: text("body").notNull(),
  sort: integer("sort").notNull().default(0),
});

/** The songbook. sections is a JSON array of strings (one 🎵 chunk each). */
export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guid: text("guid").notNull().unique(), // VideoPsalm Guid, or "manual:<ts>" for quick-adds
  title: text("title").notNull(),
  author: text("author"),
  sections: text("sections").notNull(), // JSON string[]
  source: text("source").notNull(), // videopsalm | manual
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  /** Set the first time someone corrects the song here; import then leaves it alone. */
  editedAt: integer("edited_at", { mode: "timestamp" }),
});

/**
 * A service's songs, prepared ahead so the operator taps instead of searching.
 * `items` is a JSON array of `{ id, title }`: the id is the reference, so lyrics
 * are always read live from the song, and the title is only a cached label so
 * the list can paint before the songbook has loaded.
 *
 * At most one row may have `active` set. That is enforced by the partial unique
 * index `setlists_one_active` in schemaSql.ts, which drizzle's schema builder
 * cannot express — which is why activating clears the old row first.
 */
export const setlists = sqliteTable("setlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  items: text("items").notNull(), // JSON { id, title }[]
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
