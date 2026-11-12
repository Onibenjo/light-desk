import { sqliteTable, text, integer, primaryKey, unique } from "drizzle-orm/sqlite-core";

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

/**
 * One row per church branch. PINs are stored as hashes (src/lib/pinHash.ts);
 * `pinVersion` bumps when they change so old sessions stop working. `tokens` is
 * a JSON object of the branch's own API tokens.
 */
export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // COLLATE NOCASE in schemaSql.ts
  churchPinHash: text("church_pin_hash").unique(),
  adminPinHash: text("admin_pin_hash").unique(),
  pinVersion: integer("pin_version").notNull().default(0),
  tokens: text("tokens").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  /** The branch's Mixlr channel name ("clc-ilorin"). Null until set: no attendance is recorded. */
  mixlrChannel: text("mixlr_channel"),
});

/** Everything the operator copied, for handover and pilot metrics. */
export const sentLog = sqliteTable("sent_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // verse | search | message | song
  label: text("label").notNull(), // "Romans 8:28 NKJV", the search phrase, etc.
  body: text("body"), // the exact text copied
  meta: text("meta"), // JSON: { source, ms, candidates }
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  branchId: integer("branch_id").notNull().default(1),
});

/**
 * The engagement document, one section per heading (Apologies, Welcoming
 * Ambience Jewel, …). `inService` says whether its messages may be added to a
 * setlist: apologies happen whenever the sound drops, so that section is off.
 * Names are unique regardless of case — `COLLATE NOCASE` in schemaSql.ts, which
 * drizzle's builder cannot express.
 */
export const messageSections = sqliteTable("message_sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sort: integer("sort").notNull(),
  inService: integer("in_service", { mode: "boolean" }).notNull().default(true),
});

/**
 * One message per variant: "Sunday · Worship", "Pastor Queen Okoye". `parts` is
 * a JSON array of strings, one Mixlr post each, like `songs.sections`.
 */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionId: integer("section_id").notNull().references(() => messageSections.id),
  title: text("title").notNull(),
  parts: text("parts").notNull(), // JSON string[]
  sort: integer("sort").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  /** Null means shared by every branch. */
  branchId: integer("branch_id"),
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
  /** The branch that made that correction. */
  editedBy: integer("edited_by"),
});

/**
 * A service's songs, prepared ahead so the operator taps instead of searching.
 * `items` is a JSON array of `{ id, title }`: the id is the reference, so lyrics
 * are always read live from the song, and the title is only a cached label so
 * the list can paint before the songbook has loaded.
 *
 * Each branch has at most one row with `active` set. That is enforced by the
 * partial unique index `setlists_one_active_per_branch` in schemaSql.ts, which drizzle's schema builder
 * cannot express — which is why activating clears the old row first.
 *
 * `updatedAt` doubles as the optimistic-concurrency token a client echoes back
 * on a `items` PATCH, so it is stored in milliseconds (`timestamp_ms`, not
 * `timestamp`): whole-second precision left a blind window where two writes to
 * the same row inside one second produced the same token, so the guard could
 * not tell them apart. The column itself is still a plain INTEGER (schemaSql.ts) —
 * SQLite stores whichever unit is written, so no migration is needed.
 */
export const setlists = sqliteTable("setlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  items: text("items").notNull(), // JSON { id, title }[]
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  branchId: integer("branch_id").notNull().default(1),
});

/**
 * One service as Mixlr broadcast it: the thing an attendance record is about.
 * Made by the poller the first time it finds the branch's channel live, never
 * by hand.
 *
 * `mixlrKey` is what makes two readings the same service: `event:<id>` when the
 * broadcast belongs to a scheduled Mixlr event (so a dropped connection that
 * comes back is still the same service), `broadcast:<uid>` when it does not.
 * Mixlr can reuse one event for another day, so the key alone is not unique:
 * the key and the start time together are (`services_once` in schemaSql.ts).
 *
 * `setlistId` is the service order used, chosen by the operator. It is a plain
 * number, not a foreign key: deleting a service order must never be refused
 * because a past service once used it.
 */
export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    branchId: integer("branch_id").notNull(),
    mixlrKey: text("mixlr_key").notNull(),
    title: text("title").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    /** Null while the service is on air. */
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    scheduledStart: integer("scheduled_start", { mode: "timestamp_ms" }),
    scheduledEnd: integer("scheduled_end", { mode: "timestamp_ms" }),
    setlistId: integer("setlist_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [unique("services_once").on(t.branchId, t.mixlrKey, t.startedAt)],
);

/**
 * How many were listening to a service at one moment. `at` is epoch
 * milliseconds as a plain number, because everything done with it is
 * arithmetic. One reading per service per five-minute slot: the unique index
 * `listener_readings_slot` in schemaSql.ts is on an expression, which drizzle's
 * builder cannot express, and is what lets two pollers run at once safely.
 */
export const listenerReadings = sqliteTable("listener_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceId: integer("service_id").notNull().references(() => services.id),
  at: integer("at").notNull(),
  listeners: integer("listeners").notNull(),
});
