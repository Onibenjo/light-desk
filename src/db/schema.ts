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
