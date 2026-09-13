# Message Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the church's engagement document (greetings, prayer introductions, welcoming Ambience Jewel, confession, account details, apologies, next-service lines) into the desk as a searchable library the operator copies from, and let service-order messages go into a setlist beside songs.

**Architecture:** Two new tables, `message_sections` and `messages` (replacing an empty placeholder), read and written only through `src/db/messages.ts`. Setlist items become a tagged union of songs and messages; a message item links to the library and may carry text edited for that one service. The desk gains a third tab and ⌘K entries; a `/messages` page edits the library (admin). All rules — validation, search, row resolution — live in pure modules under `src/lib` and test without a DOM or database.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19, drizzle-orm over `@libsql/client` (local SQLite file in dev, Turso in production), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-message-library-design.md`

## Global Constraints

- **Read the Next.js docs before writing route or page code.** `AGENTS.md` requires it: this is not the Next.js in your training data. Start with `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- **Route params are a promise:** `{ params }: { params: Promise<{ id: string }> }`, then `await params`. See `src/app/api/setlists/[id]/route.ts`.
- **A route file exports only route fields** (`GET`, `POST`, `PATCH`, `DELETE`, `runtime`, …). Helpers and constants stay unexported or go in `src/lib`.
- **Every route that touches the database** sets `export const runtime = "nodejs"` and calls `await ensureSchema()` before its first query.
- **No migration files.** Schema changes go in *both* `src/db/schema.ts` and `SCHEMA_SQL` in `src/db/schemaSql.ts`.
- **Words:** "message", "section", "library", "setlist", "part". Never "snippet", "runsheet", "template". **"Pin" is taken** (it pins a song section so `C` re-sends it) — do not use it for anything here.
- **Permissions:** reading/copying messages and anything about setlists = church PIN (no gate in the route). Changing the library (messages, sections, seeding) = admin, 403 otherwise.
- **Limits, verbatim:** section name 1–80 chars, one line, unique regardless of case; message title 1–120 chars, one line; 1–20 parts per message, each at most 4,000 chars after trimming; setlist still at most 50 items. Mixlr warning threshold is `MAX_MESSAGE_CHARS` from `src/lib/format.ts` (default 1000) — a warning, never a block.
- **Setlist rule:** a message may be *added* to a setlist only if it exists and its section has `in_service = 1`. Items already in the stored setlist are never re-checked.
- **Log kind** for every message copy is `message`; label `Section · Title`, plus ` · part N of M` when the message has more than one part.
- **Tests are vitest, run with `npm test`** (or `npx vitest run tests/<file>`). Component tests use `renderToStaticMarkup` from `react-dom/server`; there is no React Testing Library. Database tests use a temp file database, as `tests/setlists.test.ts` does.
- **Styling:** Tailwind v4, existing dark palette (`bg-zinc-900/60`, `border-zinc-800`, `var(--accent)`, `var(--muted)`), touch targets `min-h-11`. Rows with two actions are a flex `<li>` with two sibling `<button>`s — never nested buttons.
- **Do not commit** `docs/CLC ONLINE SERVICE ENGAGEMENT DOCUMENT.txt`, `docs/CLC_Engagement_ReStructured.docx` or `docs/IMG_*.heic`. Stage files by name, never `git add -A` / `git add .`.
- **Commit after every task** with the message given in its last step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/messageEdit.ts` | What the library may hold: parsing request bodies, splitting text into parts. Pure. |
| `src/lib/messageLibrary.ts` | Library types, ordering, labels, id lookup. Pure. |
| `src/lib/messageSearch.ts` | Every-word search over section, title and text. Pure. |
| `src/lib/messageActions.ts` | ⌘K palette entries for the library. Pure. |
| `src/lib/adminGate.ts` | `isAdmin()` for route handlers. |
| `src/db/messages.ts` | The only place library rows are read and written, including seeding. |
| `src/data/messages.seed.json` | The starter library, cleaned by hand from the doc. |
| `src/app/api/messages/route.ts` | `GET` library, `POST` message. |
| `src/app/api/messages/[id]/route.ts` | `PATCH`, `DELETE` a message. |
| `src/app/api/messages/seed/route.ts` | `POST` load the starter library. |
| `src/app/api/message-sections/route.ts` | `POST` section. |
| `src/app/api/message-sections/[id]/route.ts` | `PATCH`, `DELETE` a section. |
| `src/app/MessageList.tsx` | Presentational: sections and rows with copy/open and `+`. |
| `src/app/MessageView.tsx` | Presentational: one message's parts, sent one at a time. |
| `src/app/MessagesTab.tsx` | The tab: search, list, view, adding to the setlist. |
| `src/app/StartSetlist.tsx` | The "Start a setlist" panel, shared by both tabs. |
| `src/app/useMessages.ts` | Fetching the library once, with retry. |
| `src/app/useMessageCopy.ts` | Copying a message part: clipboard, toast, log, ✓ ticks. |
| `src/app/messages/page.tsx` | The library editor (admin). |
| `tests/messageEdit.test.ts`, `tests/messageLibrary.test.ts`, `tests/messageSearch.test.ts`, `tests/messages.test.ts`, `tests/messageSeed.test.ts`, `tests/messageActions.test.ts`, `tests/messageList.test.tsx`, `tests/messageView.test.tsx`, `tests/setlistRoute.test.ts` | New tests. |

**Modified:**

| File | Change |
|---|---|
| `src/db/schema.ts`, `src/db/schemaSql.ts` | New tables; placeholder replacement. |
| `src/lib/dbTransfer.ts` | `message_sections` in `DATA_TABLES`, before `messages`. |
| `src/lib/setlistEdit.ts` | `SetlistItem` becomes song \| message; item keys; the add-a-message rule. |
| `src/lib/setlist.ts` | Rows for both kinds; `withParts`. |
| `src/db/setlists.ts` | Reads old items without `kind` as songs. |
| `src/app/api/setlists/[id]/route.ts` | Refuses messages that cannot go in a setlist. |
| `src/app/useSetlist.ts` | `addItem` / `startSetlist` take any item. |
| `src/app/SetlistBar.tsx` | Message rows, *edited* tag, ✓ ticks. |
| `src/app/SongsTab.tsx` | Setlist comes in as a prop; uses `StartSetlist`; message rows in its bar. |
| `src/app/page.tsx` | Third tab, lifted setlist, library, cross-tab opening, palette entries. |
| `src/app/setlists/page.tsx` | Mixed items, "Edit for this service", "Reset to library text". |
| `README.md` | M2 done; layout. |
| `tests/schema.test.ts`, `tests/dbTransfer.test.ts`, `tests/setlistEdit.test.ts`, `tests/setlist.test.ts`, `tests/setlists.test.ts`, `tests/setlistBar.test.tsx` | Extended. |

---

### Task 1: The library tables

**Files:**
- Modify: `src/db/schemaSql.ts`
- Modify: `src/db/schema.ts` (replace the `messages` export)
- Modify: `src/lib/dbTransfer.ts:3`
- Test: `tests/schema.test.ts`, `tests/dbTransfer.test.ts`

**Interfaces:**
- Produces: tables `message_sections(id, name, sort, in_service)` and `messages(id, section_id, title, parts, sort, created_at, updated_at)`; drizzle exports `messageSections` (fields `id, name, sort, inService: boolean`) and `messages` (fields `id, sectionId, title, parts: string /* JSON */, sort, createdAt: Date, updatedAt: Date`, timestamps `timestamp_ms`); `DATA_TABLES` = `["verse_cache", "sent_log", "songs", "message_sections", "messages", "setlists"]`.

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/schema.test.ts`:

```ts
describe("the message library tables", () => {
  const placeholder = `CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );`;
  const cols = async (table: string) => (await client.execute(`PRAGMA table_info(${table})`)).rows.map((r) => columnName(r.name));

  it("creates both tables with every column", async () => {
    await applySchema(client);
    expect(await cols("message_sections")).toEqual(["id", "name", "sort", "in_service"]);
    expect(await cols("messages")).toEqual(["id", "section_id", "title", "parts", "sort", "created_at", "updated_at"]);
  });

  it("replaces the empty placeholder table the first release created", async () => {
    await client.executeMultiple(placeholder);
    await applySchema(client);
    expect(await cols("messages")).toContain("parts");
    expect(await cols("messages")).not.toContain("body");
  });

  it("refuses to drop a placeholder table that has rows, and leaves them where they are", async () => {
    await client.executeMultiple(placeholder);
    await client.execute({ sql: "INSERT INTO messages (section, title, body) VALUES (?,?,?)", args: ["Apologies", "Sound", "Sorry"] });
    await expect(applySchema(client)).rejects.toThrow(/messages/);
    expect((await client.execute("SELECT body FROM messages")).rows[0].body).toBe("Sorry");
  });

  it("leaves a real library alone on the next boot", async () => {
    await applySchema(client);
    await client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["Apologies", 0] });
    await client.execute({
      sql: "INSERT INTO messages (section_id, title, parts, sort, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      args: [1, "Sound restored", '["Sorry"]', 0, 1, 1],
    });
    await applySchema(client);
    expect((await client.execute("SELECT count(*) AS n FROM messages")).rows[0].n).toBe(1);
  });

  it("treats section names that differ only in case as the same name", async () => {
    await applySchema(client);
    await client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["Apologies", 0] });
    await expect(client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["apologies", 1] })).rejects.toThrow(/UNIQUE/i);
  });
});
```

- [ ] **Step 2: Write the failing transfer test**

In `tests/dbTransfer.test.ts`, inside `it("captures every row of every table"`, add after the `messages` expectation:

```ts
    expect(dump.tables.message_sections).toEqual([]);
```

And add to `describe("importAll"`:

```ts
  it("restores the message library, sections before the messages that point at them", async () => {
    await source.execute({ sql: "INSERT INTO message_sections (name, sort, in_service) VALUES (?,?,?)", args: ["Apologies", 0, 0] });
    await source.execute({
      sql: "INSERT INTO messages (section_id, title, parts, sort, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      args: [1, "Sound restored", '["Sirs and Mas, the sound has been restored."]', 0, 1788288361, 1788288361],
    });
    const written = await importAll(target, await exportAll(source));
    expect(written.map((w) => w.table)).toEqual(["verse_cache", "sent_log", "songs", "message_sections", "messages", "setlists"]);
    const rows = await target.execute("SELECT s.name, m.title FROM messages m JOIN message_sections s ON s.id = m.section_id");
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([{ name: "Apologies", title: "Sound restored" }]);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/schema.test.ts tests/dbTransfer.test.ts`
Expected: FAIL — `no such table: message_sections`, and the placeholder tests fail because `messages` still has `body`.

- [ ] **Step 4: Change the DDL and replace the placeholder**

In `src/db/schemaSql.ts`, replace the `messages` block inside `SCHEMA_SQL`:

```sql
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );
```

with:

```sql
  CREATE TABLE IF NOT EXISTS message_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    sort INTEGER NOT NULL, in_service INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL REFERENCES message_sections(id),
    title TEXT NOT NULL, parts TEXT NOT NULL, sort INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
```

Add above `applySchema`:

```ts
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
```

And make it the first line of `applySchema`:

```ts
export async function applySchema(client: Client): Promise<void> {
  await replacePlaceholderMessages(client);
  await client.executeMultiple(SCHEMA_SQL);
```

- [ ] **Step 5: Replace the drizzle definition**

In `src/db/schema.ts`, replace the whole `/** Canned messages (M2) … */ export const messages = …;` block with:

```ts
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
});
```

- [ ] **Step 6: Back up the new table**

In `src/lib/dbTransfer.ts` line 3:

```ts
export const DATA_TABLES = ["verse_cache", "sent_log", "songs", "message_sections", "messages", "setlists"] as const;
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/schema.test.ts tests/dbTransfer.test.ts`
Expected: PASS, all tests including the existing ones.

- [ ] **Step 8: Commit**

```bash
git add src/db/schemaSql.ts src/db/schema.ts src/lib/dbTransfer.ts tests/schema.test.ts tests/dbTransfer.test.ts
git commit -m "feat: message library tables, replacing the empty placeholder"
```

---
### Task 2: Validating the library

**Files:**
- Create: `src/lib/messageEdit.ts`
- Test: `tests/messageEdit.test.ts`

**Interfaces:**
- Consumes: `splitOnBlankLines(text: string): string[]` from `src/lib/songSections.ts`.
- Produces:
  ```ts
  export const MAX_SECTION_NAME = 80, MAX_MESSAGE_TITLE = 120, MAX_PARTS = 20, MAX_PART_CHARS = 4000;
  export interface SectionCreate { name: string; inService: boolean }
  export interface SectionPatch { name?: string; inService?: boolean; move?: -1 | 1 }
  export interface MessageCreate { sectionId: number; title: string; parts: string[] }
  export interface MessagePatch { sectionId?: number; title?: string; parts?: string[]; move?: -1 | 1 }
  export function cleanSectionName(value: unknown): string | null;
  export function cleanTitle(value: unknown): string | null;
  export function cleanParts(value: unknown): string[] | string;     // an array of strings
  export function partsFromText(value: unknown): string[] | string;  // textarea text
  export function textFromParts(parts: string[]): string;
  export function longParts(parts: string[], limit: number): number[];
  export function parseSectionCreate(body: unknown): SectionCreate | string;
  export function parseSectionPatch(body: unknown): SectionPatch | string;
  export function parseMessageCreate(body: unknown): MessageCreate | string;
  export function parseMessagePatch(body: unknown): MessagePatch | string;
  ```
  A `string` return is always the message to show the operator.

- [ ] **Step 1: Write the failing tests**

Create `tests/messageEdit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  cleanParts,
  longParts,
  MAX_PART_CHARS,
  MAX_PARTS,
  parseMessageCreate,
  parseMessagePatch,
  parseSectionCreate,
  parseSectionPatch,
  partsFromText,
  textFromParts,
} from "../src/lib/messageEdit";

const ok = <T>(r: T | string): T => {
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};

describe("a section", () => {
  it("is named on one trimmed line, and is in service unless it says otherwise", () => {
    expect(ok(parseSectionCreate({ name: "  Welcoming\nAmbience Jewel " }))).toEqual({ name: "Welcoming Ambience Jewel", inService: true });
    expect(ok(parseSectionCreate({ name: "Apologies", inService: false }))).toEqual({ name: "Apologies", inService: false });
  });

  it("refuses a blank or over-long name", () => {
    expect(parseSectionCreate({ name: "  " })).toMatch(/name/i);
    expect(parseSectionCreate(null)).toMatch(/name/i);
    expect(ok(parseSectionCreate({ name: "a".repeat(80) })).name).toHaveLength(80);
    expect(parseSectionCreate({ name: "a".repeat(81) })).toMatch(/name/i);
  });

  it("refuses an in-service flag that is not true or false", () => {
    expect(parseSectionCreate({ name: "Apologies", inService: "no" })).toMatch(/true or false/i);
  });

  it("can be renamed, switched, or moved one place, and a change must change something", () => {
    expect(ok(parseSectionPatch({ name: "Apologies" }))).toEqual({ name: "Apologies" });
    expect(ok(parseSectionPatch({ inService: false }))).toEqual({ inService: false });
    expect(ok(parseSectionPatch({ move: -1 }))).toEqual({ move: -1 });
    expect(parseSectionPatch({ move: 2 })).toMatch(/move/i);
    expect(parseSectionPatch({})).toMatch(/nothing/i);
  });
});

describe("a message's text", () => {
  it("splits into parts at blank lines, one Mixlr post each", () => {
    expect(ok(partsFromText("Father we thank You\nBy the eternal law\n\n  \nEvery son and daughter\n"))).toEqual([
      "Father we thank You\nBy the eternal law",
      "Every son and daughter",
    ]);
  });

  it("round-trips through the editor's textarea", () => {
    const parts = ["one\ntwo", "three"];
    expect(ok(partsFromText(textFromParts(parts)))).toEqual(parts);
  });

  it("refuses no text at all", () => {
    expect(partsFromText("   \n\n ")).toMatch(/text/i);
    expect(partsFromText(undefined)).toMatch(/text/i);
  });

  it(`refuses more than ${MAX_PARTS} parts or a part over ${MAX_PART_CHARS} characters`, () => {
    expect(ok(cleanParts(Array.from({ length: MAX_PARTS }, (_, i) => `p${i}`)))).toHaveLength(MAX_PARTS);
    expect(cleanParts(Array.from({ length: MAX_PARTS + 1 }, (_, i) => `p${i}`))).toMatch(/parts/i);
    expect(ok(cleanParts(["x".repeat(MAX_PART_CHARS)]))).toHaveLength(1);
    expect(cleanParts(["x".repeat(MAX_PART_CHARS + 1)])).toMatch(/characters/i);
  });

  it("drops blank parts and refuses anything that is not a string", () => {
    expect(ok(cleanParts([" a ", "", "  ", "b"]))).toEqual(["a", "b"]);
    expect(cleanParts(["a", 3])).toMatch(/text/i);
    expect(cleanParts("a")).toMatch(/text/i);
  });

  it("points out parts Mixlr may cut, without refusing them", () => {
    expect(longParts(["short", "x".repeat(1001), "y".repeat(1000)], 1000)).toEqual([1]);
  });
});

describe("a message", () => {
  it("needs a section, a one-line title and some text", () => {
    expect(ok(parseMessageCreate({ sectionId: 3, title: " Sunday ·\nWorship ", text: "Arms wide" }))).toEqual({
      sectionId: 3,
      title: "Sunday · Worship",
      parts: ["Arms wide"],
    });
    expect(parseMessageCreate({ title: "Sunday", text: "x" })).toMatch(/section/i);
    expect(parseMessageCreate({ sectionId: 1.5, title: "Sunday", text: "x" })).toMatch(/section/i);
    expect(parseMessageCreate({ sectionId: 3, title: " ", text: "x" })).toMatch(/title/i);
    expect(parseMessageCreate({ sectionId: 3, title: "a".repeat(121), text: "x" })).toMatch(/title/i);
    expect(parseMessageCreate({ sectionId: 3, title: "Sunday", text: "" })).toMatch(/text/i);
  });

  it("can change any one thing, and a change must change something", () => {
    expect(ok(parseMessagePatch({ title: "Wednesday" }))).toEqual({ title: "Wednesday" });
    expect(ok(parseMessagePatch({ text: "a\n\nb" }))).toEqual({ parts: ["a", "b"] });
    expect(ok(parseMessagePatch({ sectionId: 4 }))).toEqual({ sectionId: 4 });
    expect(ok(parseMessagePatch({ move: 1 }))).toEqual({ move: 1 });
    expect(parseMessagePatch({ sectionId: 0 })).toMatch(/section/i);
    expect(parseMessagePatch({})).toMatch(/nothing/i);
    expect(parseMessagePatch(null)).toMatch(/nothing/i);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/messageEdit.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/messageEdit"`.

- [ ] **Step 3: Implement**

Create `src/lib/messageEdit.ts`:

```ts
// What the message library is allowed to hold. Pure, so the routes stay thin
// and the editor, the seed and the setlist's edited text all apply exactly the
// same rules. Same convention as songEdit.ts: the parsed value on success, the
// message to show the operator on failure.

import { splitOnBlankLines } from "./songSections";

export const MAX_SECTION_NAME = 80;
export const MAX_MESSAGE_TITLE = 120;
export const MAX_PARTS = 20;
export const MAX_PART_CHARS = 4000;

export interface SectionCreate {
  name: string;
  inService: boolean;
}

export interface SectionPatch {
  name?: string;
  inService?: boolean;
  /** Swap with the section above (-1) or below (1). */
  move?: -1 | 1;
}

export interface MessageCreate {
  sectionId: number;
  title: string;
  parts: string[];
}

export interface MessagePatch {
  sectionId?: number;
  title?: string;
  parts?: string[];
  /** Swap with the message above (-1) or below (1) in its section. */
  move?: -1 | 1;
}

const NAME_ERROR = `A section needs a name of 1 to ${MAX_SECTION_NAME} characters`;
const TITLE_ERROR = `A message needs a title of 1 to ${MAX_MESSAGE_TITLE} characters`;
const TEXT_ERROR = "A message needs some text";
const COUNT_ERROR = `A message holds at most ${MAX_PARTS} parts`;
const LENGTH_ERROR = `A part can be at most ${MAX_PART_CHARS} characters`;
const SECTION_ERROR = "Pick a section for the message";
const FLAG_ERROR = "In service is true or false";
const MOVE_ERROR = "Move is -1 or 1";
const NOTHING = "Nothing to change";

function oneLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

export function cleanSectionName(value: unknown): string | null {
  return oneLine(value, MAX_SECTION_NAME);
}

export function cleanTitle(value: unknown): string | null {
  return oneLine(value, MAX_MESSAGE_TITLE);
}

/** Parts that arrive already split — a setlist item's edited text does. Blank parts are dropped. */
export function cleanParts(value: unknown): string[] | string {
  if (!Array.isArray(value)) return TEXT_ERROR;
  const parts: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return TEXT_ERROR;
    const part = raw.trim();
    if (!part) continue;
    if (part.length > MAX_PART_CHARS) return LENGTH_ERROR;
    parts.push(part);
  }
  if (!parts.length) return TEXT_ERROR;
  return parts.length > MAX_PARTS ? COUNT_ERROR : parts;
}

/** The editor's textarea: a blank line starts a new part, as in the song editor. */
export function partsFromText(value: unknown): string[] | string {
  if (typeof value !== "string") return TEXT_ERROR;
  return cleanParts(splitOnBlankLines(value));
}

export function textFromParts(parts: string[]): string {
  return parts.join("\n\n");
}

/** Indexes of parts long enough that Mixlr may cut them. A warning, never a rule. */
export function longParts(parts: string[], limit: number): number[] {
  return parts.flatMap((part, i) => (part.length > limit ? [i] : []));
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function has(body: object, key: string): boolean {
  return key in body && (body as Record<string, unknown>)[key] !== undefined;
}

export function parseSectionCreate(body: unknown): SectionCreate | string {
  if (typeof body !== "object" || body === null) return NAME_ERROR;
  const b = body as Record<string, unknown>;
  const name = cleanSectionName(b.name);
  if (name === null) return NAME_ERROR;
  if (b.inService !== undefined && typeof b.inService !== "boolean") return FLAG_ERROR;
  return { name, inService: typeof b.inService === "boolean" ? b.inService : true };
}

export function parseSectionPatch(body: unknown): SectionPatch | string {
  if (typeof body !== "object" || body === null) return NOTHING;
  const b = body as Record<string, unknown>;
  const patch: SectionPatch = {};
  if (has(body, "name")) {
    const name = cleanSectionName(b.name);
    if (name === null) return NAME_ERROR;
    patch.name = name;
  }
  if (has(body, "inService")) {
    if (typeof b.inService !== "boolean") return FLAG_ERROR;
    patch.inService = b.inService;
  }
  if (has(body, "move")) {
    if (b.move !== -1 && b.move !== 1) return MOVE_ERROR;
    patch.move = b.move === -1 ? -1 : 1;
  }
  return Object.keys(patch).length ? patch : NOTHING;
}

export function parseMessageCreate(body: unknown): MessageCreate | string {
  if (typeof body !== "object" || body === null) return SECTION_ERROR;
  const b = body as Record<string, unknown>;
  const sectionId = positiveId(b.sectionId);
  if (sectionId === null) return SECTION_ERROR;
  const title = cleanTitle(b.title);
  if (title === null) return TITLE_ERROR;
  const parts = partsFromText(b.text);
  if (typeof parts === "string") return parts;
  return { sectionId, title, parts };
}

export function parseMessagePatch(body: unknown): MessagePatch | string {
  if (typeof body !== "object" || body === null) return NOTHING;
  const b = body as Record<string, unknown>;
  const patch: MessagePatch = {};
  if (has(body, "sectionId")) {
    const sectionId = positiveId(b.sectionId);
    if (sectionId === null) return SECTION_ERROR;
    patch.sectionId = sectionId;
  }
  if (has(body, "title")) {
    const title = cleanTitle(b.title);
    if (title === null) return TITLE_ERROR;
    patch.title = title;
  }
  if (has(body, "text")) {
    const parts = partsFromText(b.text);
    if (typeof parts === "string") return parts;
    patch.parts = parts;
  }
  if (has(body, "move")) {
    if (b.move !== -1 && b.move !== 1) return MOVE_ERROR;
    patch.move = b.move === -1 ? -1 : 1;
  }
  return Object.keys(patch).length ? patch : NOTHING;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/messageEdit.test.ts`
Expected: PASS. (The error strings are chosen so each test's regex matches: "text", "parts", "characters", "section", "title", "name", "true or false", "move", "nothing".)

- [ ] **Step 5: Commit**

```bash
git add src/lib/messageEdit.ts tests/messageEdit.test.ts
git commit -m "feat: validation rules for the message library"
```

---
### Task 3: Library shape and search

**Files:**
- Create: `src/lib/messageLibrary.ts`, `src/lib/messageSearch.ts`
- Test: `tests/fixtures/library.ts`, `tests/messageLibrary.test.ts`, `tests/messageSearch.test.ts`

**Interfaces:**
- Consumes: `normalize(s: string): string` and `tokenize(q: string): string[]` from `src/lib/songSearch.ts` (lowercase, diacritics folded, apostrophes dropped; `tokenize` dedupes and caps at 8 words).
- Produces:
  ```ts
  // messageLibrary.ts
  export interface LibrarySection { id: number; name: string; sort: number; inService: boolean }
  export interface LibraryMessage { id: number; sectionId: number; title: string; parts: string[]; sort: number }
  export interface Library { sections: LibrarySection[]; messages: LibraryMessage[] }
  export interface LibraryEntry { section: LibrarySection; message: LibraryMessage }
  export interface LibraryGroup { section: LibrarySection; messages: LibraryMessage[] }
  export function messageLabel(section: { name: string }, message: { title: string }): string; // "Apologies · Sound restored"
  export function groupLibrary(library: Library): LibraryGroup[];
  export function libraryEntries(library: Library): LibraryEntry[];
  export function messagesById(library: Library | null): Map<number, LibraryEntry> | null;
  // messageSearch.ts
  export function searchMessages(library: Library, query: string): LibraryEntry[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/fixtures/library.ts` (not a test file — `vitest.config.ts` only runs `tests/**/*.test.{ts,tsx}`):

```ts
import type { Library } from "../../src/lib/messageLibrary";

/** A small library shared by the message tests: out of order on purpose, with an empty section and an orphan. */
export const library: Library = {
  sections: [
    { id: 2, name: "Welcoming Ambience Jewel", sort: 1, inService: true },
    { id: 1, name: "Apologies", sort: 0, inService: false },
    { id: 3, name: "Empty", sort: 2, inService: true },
  ],
  messages: [
    { id: 11, sectionId: 2, title: "Sunday · Worship", parts: ["Arms wide, hearts bowed"], sort: 1 },
    { id: 10, sectionId: 2, title: "Sunday", parts: ["As we gather to honour"], sort: 0 },
    { id: 20, sectionId: 1, title: "Sound restored", parts: ["Sirs and Mas, we apologize for the interruption. The sound has been restored."], sort: 0 },
    { id: 99, sectionId: 42, title: "Orphan", parts: ["no section"], sort: 0 },
  ],
};
```

Create `tests/messageLibrary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupLibrary, libraryEntries, messageLabel, messagesById } from "../src/lib/messageLibrary";
import { library } from "./fixtures/library";

describe("the library in order", () => {
  it("lists sections by sort, each with its messages by sort, empty sections included", () => {
    const groups = groupLibrary(library);
    expect(groups.map((g) => g.section.name)).toEqual(["Apologies", "Welcoming Ambience Jewel", "Empty"]);
    expect(groups[1].messages.map((m) => m.title)).toEqual(["Sunday", "Sunday · Worship"]);
    expect(groups[2].messages).toEqual([]);
  });

  it("flattens to entries in that same order, leaving out a message whose section is gone", () => {
    expect(libraryEntries(library).map((e) => e.message.id)).toEqual([20, 10, 11]);
  });

  it("labels a message by its section, which is how it reads in a setlist and the log", () => {
    expect(messageLabel({ name: "Apologies" }, { title: "Sound restored" })).toBe("Apologies · Sound restored");
  });

  it("looks messages up by id, and knows nothing while the library is loading", () => {
    expect(messagesById(null)).toBe(null);
    expect(messagesById(library)?.get(11)?.section.name).toBe("Welcoming Ambience Jewel");
    expect(messagesById(library)?.has(99)).toBe(false);
  });
});
```

Create `tests/messageSearch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchMessages } from "../src/lib/messageSearch";
import { library } from "./fixtures/library";

const ids = (q: string) => searchMessages(library, q).map((e) => e.message.id);

describe("finding a message", () => {
  it("needs every word, in any order", () => {
    expect(ids("sound restored")).toEqual([20]);
    expect(ids("restored sound")).toEqual([20]);
    expect(ids("sound worship")).toEqual([]);
  });

  it("matches the text, not just the title", () => {
    expect(ids("interruption")).toEqual([20]);
  });

  it("matches the section name, so 'welcoming sunday' finds both Sunday lines", () => {
    expect(ids("welcoming sunday")).toEqual([10, 11]);
  });

  it("matches words from their start, ignoring case and accents", () => {
    expect(ids("RESTOR")).toEqual([20]);
    expect(ids("storED")).toEqual([]);
    expect(ids("apologíes")).toEqual([20]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(ids("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/messageLibrary.test.ts tests/messageSearch.test.ts`
Expected: FAIL — cannot resolve `../src/lib/messageLibrary`.

- [ ] **Step 3: Implement `src/lib/messageLibrary.ts`**

```ts
// The message library as the desk holds it: sections in the order the service
// runs, messages in each. Pure, so ordering and lookup test without a database.

export interface LibrarySection {
  id: number;
  name: string;
  sort: number;
  /** False for sections like Apologies whose messages never go in a setlist. */
  inService: boolean;
}

export interface LibraryMessage {
  id: number;
  sectionId: number;
  title: string;
  /** One Mixlr post each. */
  parts: string[];
  sort: number;
}

export interface Library {
  sections: LibrarySection[];
  messages: LibraryMessage[];
}

export interface LibraryEntry {
  section: LibrarySection;
  message: LibraryMessage;
}

export interface LibraryGroup {
  section: LibrarySection;
  messages: LibraryMessage[];
}

const bySort = (a: { sort: number; id: number }, b: { sort: number; id: number }) => a.sort - b.sort || a.id - b.id;

/** "Apologies · Sound restored" — how a message reads in a setlist, the palette and the log. */
export function messageLabel(section: { name: string }, message: { title: string }): string {
  return `${section.name} · ${message.title}`;
}

export function groupLibrary(library: Library): LibraryGroup[] {
  return [...library.sections].sort(bySort).map((section) => ({
    section,
    messages: library.messages.filter((m) => m.sectionId === section.id).sort(bySort),
  }));
}

/** Every message with its section, in service order. A message whose section is gone is left out. */
export function libraryEntries(library: Library): LibraryEntry[] {
  return groupLibrary(library).flatMap(({ section, messages }) => messages.map((message) => ({ section, message })));
}

/** Lookup for setlist rows, or null while the library is still loading. */
export function messagesById(library: Library | null): Map<number, LibraryEntry> | null {
  if (!library) return null;
  return new Map(libraryEntries(library).map((entry) => [entry.message.id, entry]));
}
```

- [ ] **Step 4: Implement `src/lib/messageSearch.ts`**

```ts
// Finding a message from the words the operator remembers. The library is a
// few dozen messages, so this is a plain filter: every typed word must start a
// word somewhere in the section name, the title or the text. Order is the
// service order, never a score — the operator scans a short list top to bottom.

import { normalize, tokenize } from "./songSearch";
import { libraryEntries, type Library, type LibraryEntry } from "./messageLibrary";

export function searchMessages(library: Library, query: string): LibraryEntry[] {
  const words = tokenize(query);
  if (!words.length) return [];
  return libraryEntries(library).filter(({ section, message }) => {
    const haystack = ` ${normalize([section.name, message.title, ...message.parts].join(" "))}`;
    return words.every((word) => haystack.includes(` ${word}`));
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/messageLibrary.test.ts tests/messageSearch.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/messageLibrary.ts src/lib/messageSearch.ts tests/fixtures/library.ts tests/messageLibrary.test.ts tests/messageSearch.test.ts
git commit -m "feat: order, look up and search the message library"
```

---
### Task 4: Reading and writing the library

**Files:**
- Create: `src/lib/messageSeed.ts`, `src/db/messages.ts`
- Test: `tests/messages.test.ts`

**Interfaces:**
- Consumes: `messageSections`, `messages` (Task 1); `cleanSectionName`, `cleanTitle`, `partsFromText`, `SectionCreate`, `SectionPatch`, `MessageCreate`, `MessagePatch` (Task 2); `Library`, `LibrarySection`, `LibraryMessage` (Task 3).
- Produces:
  ```ts
  // src/lib/messageSeed.ts (pure)
  export interface SeedFile { sections: { name: string; inService: boolean; messages: { title: string; text: string }[] }[] }
  export interface ParsedSeed { sections: { name: string; inService: boolean; messages: { title: string; parts: string[] }[] }[] }
  export function parseSeed(raw: unknown): ParsedSeed | string;
  // src/db/messages.ts
  export async function loadLibrary(): Promise<Library>;
  export async function createSection(input: SectionCreate): Promise<LibrarySection | "duplicate">;
  export async function updateSection(id: number, patch: SectionPatch): Promise<LibrarySection | "gone" | "duplicate">;
  export async function deleteSection(id: number): Promise<"deleted" | "gone" | "not-empty">;
  export async function createMessage(input: MessageCreate): Promise<LibraryMessage | "no-section">;
  export async function updateMessage(id: number, patch: MessagePatch): Promise<LibraryMessage | "gone" | "no-section">;
  export async function deleteMessage(id: number): Promise<boolean>;
  export async function seedLibrary(seed: ParsedSeed): Promise<{ sections: number; messages: number } | "not-empty">;
  export interface MessageFacts { inService: boolean; sectionName: string }
  export async function factsForMessages(ids: number[]): Promise<Map<number, MessageFacts>>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/messages.test.ts`:

```ts
// Exercises src/db/messages.ts against a real temporary file database, the way
// tests/setlists.test.ts does: the reorder swap and the case-insensitive unique
// name both live in SQL, so a mock would only prove the mock.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSeed } from "../src/lib/messageSeed";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let lib: typeof import("../src/db/messages");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-messages-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  lib = await import("../src/db/messages");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

const section = async (name: string, inService = true) => {
  const s = await lib.createSection({ name, inService });
  if (s === "duplicate") throw new Error("unexpected duplicate");
  return s;
};
const message = async (sectionId: number, title: string, parts = ["text"]) => {
  const m = await lib.createMessage({ sectionId, title, parts });
  if (m === "no-section") throw new Error("unexpected no-section");
  return m;
};

describe("sections", () => {
  it("are created at the end, and a name that differs only in case is a duplicate", async () => {
    const a = await section("Apologies", false);
    const b = await section("Greetings");
    expect([a.sort, b.sort]).toEqual([0, 1]);
    expect(a.inService).toBe(false);
    expect(await lib.createSection({ name: "APOLOGIES", inService: true })).toBe("duplicate");
    expect(await lib.updateSection(b.id, { name: "apologies" })).toBe("duplicate");
  });

  it("move one place at a time, and moving past either end does nothing", async () => {
    const a = await section("A");
    const b = await section("B");
    const c = await section("C");
    await lib.updateSection(c.id, { move: -1 });
    await lib.updateSection(a.id, { move: -1 });
    expect((await lib.loadLibrary()).sections.map((s) => s.name)).toEqual(["A", "C", "B"]);
    expect(b.id).toBeGreaterThan(0);
  });

  it("can be renamed and switched out of service", async () => {
    const a = await section("Apology");
    const saved = await lib.updateSection(a.id, { name: "Apologies", inService: false });
    expect(saved).toMatchObject({ name: "Apologies", inService: false });
    expect(await lib.updateSection(999, { name: "x" })).toBe("gone");
  });

  it("cannot be deleted while they still hold messages, so one click never wipes twenty", async () => {
    const a = await section("Apologies");
    await message(a.id, "Sound restored");
    expect(await lib.deleteSection(a.id)).toBe("not-empty");
    const empty = await section("Empty");
    expect(await lib.deleteSection(empty.id)).toBe("deleted");
    expect(await lib.deleteSection(empty.id)).toBe("gone");
  });
});

describe("messages", () => {
  it("keep their parts, and are created at the end of their section", async () => {
    const a = await section("Confession");
    const first = await message(a.id, "Sunday", ["Sirs and Mas, join us"]);
    const second = await message(a.id, "Full text", ["Father we thank You", "Every son and daughter"]);
    expect([first.sort, second.sort]).toEqual([0, 1]);
    expect((await lib.loadLibrary()).messages.find((m) => m.id === second.id)?.parts).toEqual(["Father we thank You", "Every son and daughter"]);
  });

  it("need a section that exists", async () => {
    expect(await lib.createMessage({ sectionId: 999, title: "x", parts: ["y"] })).toBe("no-section");
  });

  it("move within their section only", async () => {
    const a = await section("A");
    const b = await section("B");
    const a1 = await message(a.id, "a1");
    const a2 = await message(a.id, "a2");
    await message(b.id, "b1");
    await lib.updateMessage(a2.id, { move: -1 });
    await lib.updateMessage(a2.id, { move: -1 });
    const inA = (await lib.loadLibrary()).messages.filter((m) => m.sectionId === a.id).sort((x, y) => x.sort - y.sort);
    expect(inA.map((m) => m.title)).toEqual(["a2", "a1"]);
    expect(a1.id).toBeGreaterThan(0);
  });

  it("go to the end of another section when moved there", async () => {
    const a = await section("A");
    const b = await section("B");
    await message(b.id, "b1");
    const moving = await message(a.id, "a1");
    const saved = await lib.updateMessage(moving.id, { sectionId: b.id, title: "now in B" });
    expect(saved).toMatchObject({ sectionId: b.id, sort: 1, title: "now in B" });
    expect(await lib.updateMessage(moving.id, { sectionId: 999 })).toBe("no-section");
    expect(await lib.updateMessage(999, { title: "x" })).toBe("gone");
  });

  it("can be deleted once", async () => {
    const a = await section("A");
    const m = await message(a.id, "a1");
    expect(await lib.deleteMessage(m.id)).toBe(true);
    expect(await lib.deleteMessage(m.id)).toBe(false);
  });

  it("report whether they may go in a setlist, for the setlist route", async () => {
    const apologies = await section("Apologies", false);
    const welcoming = await section("Welcoming Ambience Jewel");
    const sorry = await message(apologies.id, "Sound restored");
    const sunday = await message(welcoming.id, "Sunday");
    const facts = await lib.factsForMessages([sorry.id, sunday.id, 999]);
    expect(facts.get(sorry.id)).toEqual({ inService: false, sectionName: "Apologies" });
    expect(facts.get(sunday.id)).toEqual({ inService: true, sectionName: "Welcoming Ambience Jewel" });
    expect(facts.has(999)).toBe(false);
    expect((await lib.factsForMessages([])).size).toBe(0);
  });
});

describe("seeding", () => {
  const seed = parseSeed({
    sections: [
      { name: "Apologies", inService: false, messages: [{ title: "Sound restored", text: "Sorry." }] },
      { name: "Confession", inService: true, messages: [{ title: "Full text", text: "Father\n\nEvery son" }] },
    ],
  });

  it("fills an empty library in order", async () => {
    if (typeof seed === "string") throw new Error(seed);
    expect(await lib.seedLibrary(seed)).toEqual({ sections: 2, messages: 2 });
    const loaded = await lib.loadLibrary();
    expect(loaded.sections.map((s) => [s.name, s.sort, s.inService])).toEqual([
      ["Apologies", 0, false],
      ["Confession", 1, true],
    ]);
    expect(loaded.messages.find((m) => m.title === "Full text")?.parts).toEqual(["Father", "Every son"]);
  });

  it("does nothing to a library that already has anything in it", async () => {
    if (typeof seed === "string") throw new Error(seed);
    await section("Mine");
    expect(await lib.seedLibrary(seed)).toBe("not-empty");
    expect((await lib.loadLibrary()).sections.map((s) => s.name)).toEqual(["Mine"]);
  });
});

describe("parseSeed", () => {
  it("names the section and message that break a rule", () => {
    expect(parseSeed({ sections: [{ name: "", inService: true, messages: [] }] })).toMatch(/section 1/i);
    expect(parseSeed({ sections: [{ name: "A", inService: true, messages: [{ title: "t", text: "" }] }] })).toMatch(/A, message 1/);
    expect(parseSeed({ sections: [{ name: "A", inService: "yes", messages: [] }] })).toMatch(/true or false/i);
    expect(parseSeed({ sections: [{ name: "A", inService: true, messages: [] }, { name: "a", inService: true, messages: [] }] })).toMatch(/twice/);
    expect(parseSeed({})).toMatch(/sections/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/messages.test.ts`
Expected: FAIL — cannot resolve `../src/lib/messageSeed`.

- [ ] **Step 3: Implement `src/lib/messageSeed.ts`**

```ts
// The starter library's file format, checked by the same rules the editor
// uses. The file keeps each message's text as the editor shows it (a blank
// line between parts) so a person reviewing it reads what the operator sends.

import { cleanSectionName, cleanTitle, partsFromText } from "./messageEdit";

export interface SeedFile {
  sections: { name: string; inService: boolean; messages: { title: string; text: string }[] }[];
}

export interface ParsedSeed {
  sections: { name: string; inService: boolean; messages: { title: string; parts: string[] }[] }[];
}

export function parseSeed(raw: unknown): ParsedSeed | string {
  const list = typeof raw === "object" && raw !== null ? (raw as { sections?: unknown }).sections : undefined;
  if (!Array.isArray(list)) return "The seed needs a sections array";

  const seen = new Set<string>();
  const sections: ParsedSeed["sections"] = [];
  for (const [si, rawSection] of list.entries()) {
    const s = (rawSection ?? {}) as { name?: unknown; inService?: unknown; messages?: unknown };
    const name = cleanSectionName(s.name);
    if (name === null) return `Section ${si + 1}: needs a name of 1 to 80 characters`;
    if (typeof s.inService !== "boolean") return `${name}: in service is true or false`;
    if (seen.has(name.toLowerCase())) return `${name}: appears twice`;
    seen.add(name.toLowerCase());
    if (!Array.isArray(s.messages)) return `${name}: needs a messages array`;

    const messages: ParsedSeed["sections"][number]["messages"] = [];
    for (const [mi, rawMessage] of s.messages.entries()) {
      const m = (rawMessage ?? {}) as { title?: unknown; text?: unknown };
      const title = cleanTitle(m.title);
      if (title === null) return `${name}, message ${mi + 1}: needs a title of 1 to 120 characters`;
      const parts = partsFromText(m.text);
      if (typeof parts === "string") return `${name}, message ${mi + 1} (${title}): ${parts}`;
      messages.push({ title, parts });
    }
    sections.push({ name, inService: s.inService, messages });
  }
  return { sections };
}
```

- [ ] **Step 4: Implement `src/db/messages.ts`**

```ts
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "./index";
import { messageSections, messages } from "./schema";
import type { Library, LibraryMessage, LibrarySection } from "@/lib/messageLibrary";
import type { MessageCreate, MessagePatch, SectionCreate, SectionPatch } from "@/lib/messageEdit";
import type { ParsedSeed } from "@/lib/messageSeed";

type SectionRow = typeof messageSections.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

function toSection(row: SectionRow): LibrarySection {
  return { id: row.id, name: row.name, sort: row.sort, inService: row.inService };
}

function toMessage(row: MessageRow): LibraryMessage {
  return { id: row.id, sectionId: row.sectionId, title: row.title, parts: JSON.parse(row.parts) as string[], sort: row.sort };
}

/**
 * True for SQLite's UNIQUE refusal. Drizzle wraps the driver's error, so the
 * message worth reading can be one or two `cause`s down.
 */
function isUniqueViolation(e: unknown): boolean {
  for (let current: unknown = e; current instanceof Error; current = current.cause) {
    if (/UNIQUE/i.test(current.message)) return true;
  }
  return false;
}

/** Everything, one payload. The library is a few dozen rows and always read whole. */
export async function loadLibrary(): Promise<Library> {
  const [sectionRows, messageRows] = await Promise.all([
    db.select().from(messageSections).orderBy(asc(messageSections.sort), asc(messageSections.id)),
    db.select().from(messages).orderBy(asc(messages.sort), asc(messages.id)),
  ]);
  return { sections: sectionRows.map(toSection), messages: messageRows.map(toMessage) };
}

async function nextSectionSort(): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${messageSections.sort})` }).from(messageSections);
  return (row?.max ?? -1) + 1;
}

async function nextMessageSort(sectionId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${messages.sort})` })
    .from(messages)
    .where(eq(messages.sectionId, sectionId));
  return (row?.max ?? -1) + 1;
}

async function findSectionRow(id: number): Promise<SectionRow | undefined> {
  const [row] = await db.select().from(messageSections).where(eq(messageSections.id, id));
  return row;
}

async function findMessageRow(id: number): Promise<MessageRow | undefined> {
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return row;
}

export async function createSection(input: SectionCreate): Promise<LibrarySection | "duplicate"> {
  try {
    const [row] = await db
      .insert(messageSections)
      .values({ name: input.name, inService: input.inService, sort: await nextSectionSort() })
      .returning();
    return toSection(row);
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate";
    throw e;
  }
}

/** Trade `sort` with the nearest section above (-1) or below (1). At either end there is nothing to do. */
async function swapSection(current: SectionRow, delta: -1 | 1): Promise<void> {
  const [neighbour] = await db
    .select()
    .from(messageSections)
    .where(delta < 0 ? lt(messageSections.sort, current.sort) : gt(messageSections.sort, current.sort))
    .orderBy(delta < 0 ? desc(messageSections.sort) : asc(messageSections.sort))
    .limit(1);
  if (!neighbour) return;
  // One batch, so a failure halfway cannot leave two sections sharing a place.
  await db.batch([
    db.update(messageSections).set({ sort: neighbour.sort }).where(eq(messageSections.id, current.id)),
    db.update(messageSections).set({ sort: current.sort }).where(eq(messageSections.id, neighbour.id)),
  ]);
}

export async function updateSection(id: number, patch: SectionPatch): Promise<LibrarySection | "gone" | "duplicate"> {
  const current = await findSectionRow(id);
  if (!current) return "gone";
  if (patch.move) await swapSection(current, patch.move);

  const values: { name?: string; inService?: boolean } = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.inService !== undefined) values.inService = patch.inService;
  if (Object.keys(values).length) {
    try {
      await db.update(messageSections).set(values).where(eq(messageSections.id, id));
    } catch (e) {
      if (isUniqueViolation(e)) return "duplicate";
      throw e;
    }
  }
  const saved = await findSectionRow(id);
  return saved ? toSection(saved) : "gone";
}

/**
 * Only an empty section can go. Checked in code rather than by a foreign key,
 * because SQLite only enforces those when a connection asks it to.
 */
export async function deleteSection(id: number): Promise<"deleted" | "gone" | "not-empty"> {
  const [used] = await db.select({ id: messages.id }).from(messages).where(eq(messages.sectionId, id)).limit(1);
  if (used) return "not-empty";
  const [row] = await db.delete(messageSections).where(eq(messageSections.id, id)).returning({ id: messageSections.id });
  return row ? "deleted" : "gone";
}

export async function createMessage(input: MessageCreate): Promise<LibraryMessage | "no-section"> {
  if (!(await findSectionRow(input.sectionId))) return "no-section";
  const now = new Date();
  const [row] = await db
    .insert(messages)
    .values({
      sectionId: input.sectionId,
      title: input.title,
      parts: JSON.stringify(input.parts),
      sort: await nextMessageSort(input.sectionId),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toMessage(row);
}

/** Trade `sort` with the nearest message above or below, within the same section. */
async function swapMessage(current: MessageRow, delta: -1 | 1): Promise<void> {
  const [neighbour] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sectionId, current.sectionId), delta < 0 ? lt(messages.sort, current.sort) : gt(messages.sort, current.sort)))
    .orderBy(delta < 0 ? desc(messages.sort) : asc(messages.sort))
    .limit(1);
  if (!neighbour) return;
  await db.batch([
    db.update(messages).set({ sort: neighbour.sort }).where(eq(messages.id, current.id)),
    db.update(messages).set({ sort: current.sort }).where(eq(messages.id, neighbour.id)),
  ]);
}

export async function updateMessage(id: number, patch: MessagePatch): Promise<LibraryMessage | "gone" | "no-section"> {
  const current = await findMessageRow(id);
  if (!current) return "gone";

  const values: { updatedAt: Date; title?: string; parts?: string; sectionId?: number; sort?: number } = { updatedAt: new Date() };
  if (patch.sectionId !== undefined && patch.sectionId !== current.sectionId) {
    if (!(await findSectionRow(patch.sectionId))) return "no-section";
    values.sectionId = patch.sectionId;
    // Arrives at the end of its new section; a move within the old one is moot.
    values.sort = await nextMessageSort(patch.sectionId);
  } else if (patch.move) {
    await swapMessage(current, patch.move);
  }
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.parts !== undefined) values.parts = JSON.stringify(patch.parts);

  await db.update(messages).set(values).where(eq(messages.id, id));
  const saved = await findMessageRow(id);
  return saved ? toMessage(saved) : "gone";
}

export async function deleteMessage(id: number): Promise<boolean> {
  const [row] = await db.delete(messages).where(eq(messages.id, id)).returning({ id: messages.id });
  return !!row;
}

/**
 * The starter library, into a library with nothing in it — never on top of
 * anything, so pressing the button twice, or after someone has started typing
 * messages in, changes nothing. One batch: half a library is worse than none.
 */
export async function seedLibrary(seed: ParsedSeed): Promise<{ sections: number; messages: number } | "not-empty"> {
  const [sectionCount] = await db.select({ n: sql<number>`count(*)` }).from(messageSections);
  const [messageCount] = await db.select({ n: sql<number>`count(*)` }).from(messages);
  if (Number(sectionCount.n) + Number(messageCount.n) > 0) return "not-empty";

  const now = new Date();
  let total = 0;
  const statements = seed.sections.flatMap((section, si) => {
    // Ids are given explicitly so each message can name its section inside the same batch.
    const id = si + 1;
    total += section.messages.length;
    return [
      db.insert(messageSections).values({ id, name: section.name, sort: si, inService: section.inService }),
      ...section.messages.map((m, mi) =>
        db.insert(messages).values({ sectionId: id, title: m.title, parts: JSON.stringify(m.parts), sort: mi, createdAt: now, updatedAt: now }),
      ),
    ];
  });
  if (statements.length) await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return { sections: seed.sections.length, messages: total };
}

export interface MessageFacts {
  inService: boolean;
  sectionName: string;
}

/** What the setlist route needs to know before letting a message in. Unknown ids are simply absent. */
export async function factsForMessages(ids: number[]): Promise<Map<number, MessageFacts>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: messages.id, inService: messageSections.inService, sectionName: messageSections.name })
    .from(messages)
    .innerJoin(messageSections, eq(messages.sectionId, messageSections.id))
    .where(inArray(messages.id, ids));
  return new Map(rows.map((r) => [r.id, { inService: r.inService, sectionName: r.sectionName }]));
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/messages.test.ts`
Expected: PASS.

If `db.batch` rejects the `statements` typing, keep the runtime shape and adjust only the cast; `db.batch` needs a non-empty tuple type, which is why the cast exists. Run `npx tsc --noEmit -p .` to confirm no type errors in `src/db/messages.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/messageSeed.ts src/db/messages.ts tests/messages.test.ts
git commit -m "feat: read, write, reorder and seed the message library"
```

---
### Task 5: The library API

**Files:**
- Create: `src/lib/adminGate.ts`
- Create: `src/app/api/messages/route.ts`, `src/app/api/messages/[id]/route.ts`, `src/app/api/messages/seed/route.ts`
- Create: `src/app/api/message-sections/route.ts`, `src/app/api/message-sections/[id]/route.ts`

**Interfaces:**
- Consumes: everything `src/db/messages.ts` exports (Task 4); `parseSectionCreate`, `parseSectionPatch`, `parseMessageCreate`, `parseMessagePatch` (Task 2); `parseSeed` (Task 4); `roleFromToken`, `SESSION_COOKIE` from `src/lib/auth.ts`.
- Produces (HTTP):
  - `GET /api/messages` → `200 { sections: LibrarySection[], messages: LibraryMessage[] }` (church PIN)
  - `POST /api/messages` `{ sectionId, title, text }` → `200 { ok, message }` | 400 | 403
  - `PATCH /api/messages/:id` `{ sectionId?, title?, text?, move? }` → `200 { ok, message }` | 400 | 403 | 404
  - `DELETE /api/messages/:id` → `200 { ok }` | 403 | 404
  - `POST /api/messages/seed` → `200 { ok, sections, messages }` | 403 | 409 `{ error }` when the library is not empty | 500 if the seed file breaks a rule
  - `POST /api/message-sections` `{ name, inService? }` → `200 { ok, section }` | 400 | 403 | 409 duplicate
  - `PATCH /api/message-sections/:id` `{ name?, inService?, move? }` → `200 { ok, section }` | 400 | 403 | 404 | 409 duplicate
  - `DELETE /api/message-sections/:id` → `200 { ok }` | 403 | 404 | 409 not empty
  - Every 403 body is `{ error: "Admin PIN required to edit the message library" }`; the editor page (Task 12) checks for status 403.
  - `src/lib/adminGate.ts`: `export async function isAdmin(): Promise<boolean>`.

These are thin: parse, gate, call Task 4, map results to status codes. They are verified by hand against the dev server (Step 7), because `cookies()` only works inside a real request and the logic under them is already tested in Task 4.

> **Note:** `src/data/messages.seed.json` does not exist until Task 6. Until then, create it as `{ "sections": [] }` so the seed route compiles; Task 6 fills it.

- [ ] **Step 1: Read the route handler docs**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. Confirm the params-as-promise signature and that a route file may not export arbitrary names.

- [ ] **Step 2: The admin gate**

Create `src/lib/adminGate.ts`:

```ts
import { cookies } from "next/headers";
import { roleFromToken, SESSION_COOKIE } from "./auth";

/**
 * True when this request's session carries the admin PIN. Route handlers only:
 * it reads the request's cookies. Kept out of auth.ts, which proxy.ts imports
 * and which must stay free of next/headers.
 */
export async function isAdmin(): Promise<boolean> {
  return (await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value)) === "admin";
}
```

- [ ] **Step 3: `src/app/api/messages/route.ts`**

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createMessage, loadLibrary } from "@/db/messages";
import { parseMessageCreate } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit the message library";

/** GET — the whole library. Church PIN: it is what the operator copies from. */
export async function GET() {
  await ensureSchema();
  return NextResponse.json(await loadLibrary());
}

/** POST { sectionId, title, text } — admin. A blank line in text starts a new part. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const parsed = parseMessageCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createMessage(parsed);
  if (result === "no-section") return NextResponse.json({ error: "No such section" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}
```

- [ ] **Step 4: `src/app/api/messages/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteMessage, updateMessage } from "@/db/messages";
import { parseMessagePatch } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit the message library";
const MISSING = "No such message";

/** Route params arrive as a promise in this version of Next. */
async function messageId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** PATCH { sectionId?, title?, text?, move? } — admin. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await messageId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  const parsed = parseMessagePatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateMessage(id, parsed);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "no-section") return NextResponse.json({ error: "No such section" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}

/**
 * DELETE — admin. A setlist that already holds this message keeps its row: with
 * edited text it still copies, without it the row greys out (src/lib/setlist.ts).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await messageId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  await ensureSchema();
  if (!(await deleteMessage(id))) return NextResponse.json({ error: MISSING }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: `src/app/api/messages/seed/route.ts`**

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { seedLibrary } from "@/db/messages";
import { parseSeed } from "@/lib/messageSeed";
import { isAdmin } from "@/lib/adminGate";
import seed from "@/data/messages.seed.json";

export const runtime = "nodejs";

/**
 * POST — admin. Loads the starter library, cleaned by hand from the engagement
 * document, into a library with nothing in it. A route rather than a script so
 * it reaches the production database without anyone holding Turso credentials.
 */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin PIN required to edit the message library" }, { status: 403 });

  // tests/messageSeed.test.ts guards the file; this is the belt to that brace.
  const parsed = parseSeed(seed);
  if (typeof parsed === "string") return NextResponse.json({ error: `The starter library is broken: ${parsed}` }, { status: 500 });

  await ensureSchema();
  const result = await seedLibrary(parsed);
  if (result === "not-empty") return NextResponse.json({ error: "The library already has messages in it" }, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}
```

Create the placeholder seed so this compiles: `src/data/messages.seed.json` containing exactly `{ "sections": [] }`.

- [ ] **Step 6: The section routes**

Create `src/app/api/message-sections/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createSection } from "@/db/messages";
import { parseSectionCreate } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

/** POST { name, inService? } — admin. New sections go to the end. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin PIN required to edit the message library" }, { status: 403 });
  const parsed = parseSectionCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createSection(parsed);
  if (result === "duplicate") return NextResponse.json({ error: `There is already a section called "${parsed.name}"` }, { status: 409 });
  return NextResponse.json({ ok: true, section: result });
}
```

Create `src/app/api/message-sections/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteSection, updateSection } from "@/db/messages";
import { parseSectionPatch } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit the message library";
const MISSING = "No such section";

/** Route params arrive as a promise in this version of Next. */
async function sectionId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH { name?, inService?, move? } — admin. Switching a section out of
 * service does not touch setlists already holding its messages; the rule only
 * applies to new additions.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await sectionId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  const parsed = parseSectionPatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateSection(id, parsed);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "duplicate") return NextResponse.json({ error: `There is already a section called "${parsed.name}"` }, { status: 409 });
  return NextResponse.json({ ok: true, section: result });
}

/** DELETE — admin, and only an empty section. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await sectionId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  await ensureSchema();
  const result = await deleteSection(id);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "not-empty") return NextResponse.json({ error: "Move or delete its messages first" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Verify by hand against the dev server**

Locally, with no `CHURCH_PIN`/`ADMIN_PIN` in `.env.local`, every request is admin (`src/lib/auth.ts`). Use a throwaway database so `local.db` is untouched:

```bash
TURSO_DATABASE_URL=file:/tmp/lightdesk-api-check.db npm run dev
```

In a second terminal:

```bash
B=http://localhost:3000
curl -s $B/api/messages
# {"sections":[],"messages":[]}
curl -s -XPOST $B/api/message-sections -H 'Content-Type: application/json' -d '{"name":"Apologies","inService":false}'
# {"ok":true,"section":{"id":1,"name":"Apologies","sort":0,"inService":false}}
curl -s -XPOST $B/api/message-sections -H 'Content-Type: application/json' -d '{"name":"apologies"}' -w ' %{http_code}\n'
# {"error":"There is already a section called \"apologies\""} 409
curl -s -XPOST $B/api/messages -H 'Content-Type: application/json' -d '{"sectionId":1,"title":"Sound restored","text":"Sirs and Mas, the sound has been restored."}'
# {"ok":true,"message":{"id":1,"sectionId":1,"title":"Sound restored","parts":["Sirs and Mas, the sound has been restored."],"sort":0}}
curl -s -XPATCH $B/api/messages/1 -H 'Content-Type: application/json' -d '{"text":"one\n\ntwo"}'
# parts ["one","two"]
curl -s -XDELETE $B/api/message-sections/1 -w ' %{http_code}\n'
# {"error":"Move or delete its messages first"} 409
curl -s -XPOST $B/api/messages/seed -w ' %{http_code}\n'
# {"error":"The library already has messages in it"} 409
```

Stop the server, then `rm /tmp/lightdesk-api-check.db`. If any response differs, fix the route before committing.

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc --noEmit -p .` — expected: no errors.

```bash
git add src/lib/adminGate.ts src/app/api/messages src/app/api/message-sections src/data/messages.seed.json
git commit -m "feat: message library API"
```

---
### Task 6: The starter library

**Files:**
- Modify: `src/data/messages.seed.json` (replacing the `{ "sections": [] }` placeholder from Task 5)
- Test: `tests/messageSeed.test.ts`

**Interfaces:**
- Consumes: `parseSeed` (Task 4), `MAX_MESSAGE_CHARS` from `src/lib/format.ts`.
- Produces: a seed file in the `SeedFile` shape: `{ "sections": [ { "name", "inService", "messages": [ { "title", "text" } ] } ] }`. In `text`, a blank line (`\n\n`) separates parts; a single `\n` is a line break inside one post.

**Source:** `docs/CLC ONLINE SERVICE ENGAGEMENT DOCUMENT.txt` (the current doc; line numbers below refer to it). Its emoji are broken (`����`); take the real emoji from `docs/CLC_Engagement_ReStructured.docx` (convert with `textutil -convert txt -output /tmp/restructured.txt docs/CLC_Engagement_ReStructured.docx`). **Neither source file is committed.**

**Text rules:**
- Copy the doc's wording exactly, including "Sirs and Mas", the ` |` separators in account details, and capitalisation. Trim trailing spaces on each line.
- Lines the doc stacks as one post stay one part, joined with `\n`. A new part only where this task says so.
- Do not invent text. The only permitted edits are the ones listed under **Flagged edits** below, plus the `[DATE]` / `[SERVICE NAME]` placeholders in Next Service.
- Leave out: every "Prayer Focus" line (36, 81, 593–597 — typed live), the stray ` 5` (24), and the bare name "Pastor Fayode Ayomidotun" (201), which has no text.

- [ ] **Step 1: Write the failing test**

Create `tests/messageSeed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import seed from "../src/data/messages.seed.json";
import { parseSeed, type ParsedSeed } from "../src/lib/messageSeed";
import { MAX_MESSAGE_CHARS } from "../src/lib/format";

const parsed = parseSeed(seed);
const lib = (): ParsedSeed => {
  if (typeof parsed === "string") throw new Error(parsed);
  return parsed;
};
const section = (name: string) => {
  const s = lib().sections.find((x) => x.name === name);
  if (!s) throw new Error(`no section ${name}`);
  return s;
};

describe("the starter library", () => {
  it("passes every rule the editor enforces", () => {
    expect(parsed).not.toBeTypeOf("string");
  });

  it("has the doc's sections, with Apologies first because it is the one needed in a hurry", () => {
    expect(lib().sections.map((s) => s.name)).toEqual([
      "Apologies",
      "Greetings",
      "Prayer Before Ambience Jewel",
      "Welcoming Ambience Jewel",
      "Prayer Before Sermon",
      "Confession",
      "Testimony",
      "Recap",
      "Welcoming Pastor",
      "Altar Call",
      "Announcement",
      "Offerings and Tithe",
      "First Timer",
      "Apostolic Blessing",
      "Closing Charge",
      "Next Service",
      "Communion",
      "Special Programs",
    ]);
  });

  it("keeps Apologies and Special Programs out of setlists, and everything else in", () => {
    for (const s of lib().sections) expect([s.name, s.inService]).toEqual([s.name, !["Apologies", "Special Programs"].includes(s.name)]);
  });

  it("has one message per variant where the doc has variants", () => {
    expect(section("Welcoming Ambience Jewel").messages.map((m) => m.title)).toEqual([
      "Sunday",
      "Sunday · Worship",
      "Sunday · Praise",
      "Wednesday",
      "Wednesday · Worship",
      "Wednesday · Praise",
    ]);
    expect(section("Prayer Before Ambience Jewel").messages).toHaveLength(7);
    expect(section("Prayer Before Sermon").messages).toHaveLength(7);
    expect(section("Apologies").messages).toHaveLength(11);
  });

  it("names each prayer line after the person praying, spelled the same in both prayer sections", () => {
    const names = (s: string) => section(s).messages.map((m) => m.title).sort();
    expect(names("Prayer Before Ambience Jewel")).toEqual(names("Prayer Before Sermon"));
    for (const m of section("Prayer Before Sermon").messages) expect(m.parts.join(" ")).toContain(m.title);
  });

  it("splits the confession into several posts", () => {
    const full = section("Confession").messages.find((m) => m.title === "Full text");
    expect(full?.parts.length).toBeGreaterThan(1);
    expect(full?.parts[0].startsWith("Father we thank You")).toBe(true);
  });

  it("carries no broken emoji from the plain-text export", () => {
    expect(JSON.stringify(seed)).not.toContain("�");
  });

  it("leaves no stale dates in the next-service lines, only placeholders to fill in per setlist", () => {
    for (const m of section("Next Service").messages) expect(m.parts.join(" ")).not.toMatch(/\b20\d\d\b/);
  });

  it(`starts with no part long enough (over ${MAX_MESSAGE_CHARS} characters) to earn a Mixlr warning`, () => {
    for (const s of lib().sections) for (const m of s.messages) for (const p of m.parts) expect([s.name, m.title, p.length <= MAX_MESSAGE_CHARS]).toEqual([s.name, m.title, true]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/messageSeed.test.ts`
Expected: FAIL — the section list is `[]`.

- [ ] **Step 3: Write the seed file, section by section**

Write `src/data/messages.seed.json` with these sections **in this order**. Each bullet is one message: **title** — source lines — how to split.

1. **Apologies** — `inService: false`
   - **Volume being fixed** — 354
   - **Working on the sound** — 355
   - **Sound is a work in progress** — 356
   - **Volume increased** — 357
   - **Sound restored** — 359
   - **Interruption, volume increased** — 360
   - **Remain connected, sound soon** — 362
   - **Back after a break in transmission** — 363
   - **Sound will be restored shortly** — 364
   - **Will be fixed shortly** — 365
   - **Check your network and refresh** — 367
2. **Greetings** — `inService: true`
   - **Wednesday** — 5
   - **Sunday** — 12–13, one part, two lines; the emoji at the end of 13 is `🩷🩷🩷`
   - **Sunday · Romans 15:7** — 16
   - **Apostolic Service** — 19–20, one part
3. **Prayer Before Ambience Jewel** — `inService: true`. One message per line 27–34, titled with the name as written in the line: **Pastor Queen Okoye**, **Pastor Jisola Adekeye**, **Pastor Ireoluwa Oluwatade**, **Pastor Oluwatade Falade**, **Pastor Charles Olumorin**, **Pastor Ajibowu Abayomi**, **Pastor Ayomidotun Fayode**
4. **Welcoming Ambience Jewel** — `inService: true`
   - **Sunday** — 48
   - **Sunday · Worship** — 50
   - **Sunday · Praise** — 55–56, one part
   - **Wednesday** — 60, as `🎶Now Ministering: Ambience Jewel🎶`
   - **Wednesday · Worship** — 62
   - **Wednesday · Praise** — 65–66, one part
5. **Prayer Before Sermon** — `inService: true`. One message per line 73–79, titled exactly as in section 3, in the doc's order (Jisola, Queen, Ireoluwa, Oluwatade Falade, Ajibowu, Charles, Ayomidotun). Line 77's "Ajibowo" becomes "Ajibowu" (flagged).
6. **Confession** — `inService: true`
   - **Sunday** — 86
   - **Wednesday** — 88
   - **Family Meeting** — 90
   - **Full text** — 98–154, seven parts: 98–103 · 105–108 · 110–120 · 124 + 126 (joined with `\n`; the doc's blank line between them is a typing slip) · 128–129 · 132–144 · 146–154. Lines inside a part joined with `\n`; blank lines inside a range dropped.
7. **Testimony** — `inService: true`
   - **Share your testimony** — 161–162, one part
   - **Email and format** — 164–170, one part, one line each
8. **Recap** — `inService: true`
   - **Recap** — 179
9. **Welcoming Pastor** — `inService: true`
   - **Pastor Ibukun Faleye** — 186
   - **Pastor Damilola Faleye** — 188
   - **Evangelist Chuks Okoye** — 190
   - **Pastor Oluwatade Falade** — 192
   - **Pastor Queen Okoye** — 194
   - **Apostle Muyiwa Areo** — 196
   - **Pastor Temitope Areo** — 198, with "as he pours" corrected to "as she pours" (flagged)
10. **Altar Call** — `inService: true`
    - **New convert link** — 204
    - **Accept Jesus link** — 207
11. **Announcement** — `inService: true`
    - **Listen to the announcement** — 218
    - **Morning Altar Prayer** — 221
    - **Watch the last service** — 224
    - **Global Prayer Group** — 213–214, one part
    - **Final-year brethren** — 229
12. **Offerings and Tithe** — `inService: true`
    - **Sunday offering** — 232
    - **Wednesday offering** — 235
    - **Offering accounts** — five parts: 241–244 · 247–249 · 253–255 · 258–260 · 262–264
    - **Tithe accounts** — six parts: 267 · 270–274 (drop the blank 271) · 277–279 · 282–284 · 287–289 · 293–295
    - **MAMI Partnership accounts** — three parts: 311 · 313–316 · 319–322
    - **Outreach account** — 324–326, one part
    - **Welfare account** — 328–331, one part, exactly as written
    - **Honour account** — 333–335, one part
    - **Nations Seed account** — 337–339, one part
13. **First Timer** — `inService: true`
    - **First timer** — 344–347, one part
14. **Apostolic Blessing** — `inService: true`
    - **Father** — 374–375, one part
    - **Mother** — 377–378, one part
    - **Father and Mother** — 381–382, one part
15. **Closing Charge** — `inService: true`
    - **Galatians 5:1** — 387
16. **Next Service** — `inService: true`. The doc's dated copies collapse to one message per situation; dates become `[DATE]`, a named special service becomes `[SERVICE NAME]`.
    - **First Service · Second starts by 10am** — 393–394, one part
    - **First Service · Second starts immediately** — 396–397, one part
    - **First Service · Marathon Prayer on Saturday** — 399–402, one part, drop the blank 401
    - **First Service · Fasting continues** — 406–408, one part
    - **Second Service · Next Wednesday** — `Thank you Sirs and Mas for joining Second Service. Our next service is on Wednesday, [DATE] by 5:30pm, whether online or onsite. God bless as you come.\nWELCOME TO FREEDOM, SIRS AND MAS!!!` (from 428 and 434)
    - **Second Service · Single service reminder** — 413 with the date as `[DATE]`
    - **Second Service · No service on Wednesday** — 436 with `Wednesday, [DATE] as [REASON].` replacing the date and the conference clause
    - **Second Service · Global Prayer Group** — 422–423, one part
    - **Second Service · Fasting and prayers** — 425 with the date range as `[DATE]`
    - **Special service · Next Wednesday** — `Thank you Sirs and Mas for joining [SERVICE NAME]. Our next service is on Wednesday, [DATE] by 5:30pm, whether online or onsite. God bless as you come.\nWELCOME TO FREEDOM, SIRS AND MAS!!!!` (from 439–445)
    - **Midweek · Workers Meeting and Sunday** — 448–452, one part, both dates as `[DATE]`, blank 451 dropped
    - **Midweek · Next Sunday, two services** — 456–459, one part, date as `[DATE]`, blank 458 dropped
    - **Midweek · Next Sunday, single service** — 483 + 486 + `WELCOME TO FREEDOM, SIRS AND MAS!!!!`, one part, date as `[DATE]`
    - **Family Meeting · Tomorrow's services** — 497–499 + 505, one part, date as `[DATE]`
    - **Cross Over · Next service** — 507 + 509, one part, date as `[DATE]`, "with Apostle Muyiwa Areo" kept
17. **Communion** — `inService: true`
    - **Stay connected** — 600
    - **Get a token** — 601
18. **Special Programs** — `inService: false` (flagged). One message each, one part each unless noted:
    - **Family Meeting · First of the year** — 515–517
    - **Love Choices · It's here** — 519–521
    - **New Year's Eve · Reflect** — 524
    - **New Year · Evening service** — 526
    - **Vow Renewal** — 529
    - **Marathon Prayer · Welcome** — 533–534
    - **Partners · The day is here** — 537–538
    - **Welcome back from IGOSDP** — 541–544, emoji `🥳💃`
    - **R.A.W. · Day one** — 547–548
    - **R.A.W. · Final morning** — 551, emoji `🩷🩷🩷`
    - **R.A.W. · Thanksgiving** — 554–556
    - **AMA Praise Party** — 560, emoji `🩷🩷🩷`
    - **Freedom Conference · Day 4** — 563–564
    - **Honouring Daddy and Mummy** — 567
    - **Freedom Finalists' meeting** — 569–571
    - **Fasting and prayer · Day 6** — 575–577
    - **New Year · Midweek** — 580–582
    - **Father's Day · Greeting** — 585–586
    - **Marathon Prayer · Still praying** — 591
    - **Now Ministering · Ambience Jewel** — 603, emoji `🎶🎶🎶`
    - **Love Choices · Intro** — two parts: 608–612 · 615–621
    - **Love Choices · Closing** — 625 · 627–628, two parts
    - **Love Choices · Prayer** — 631
    - **Love Choices · Ambience Jewel** — 635
    - **Love Choices · Welcoming the Pastor** — 638
    - **Easter** — 644–647
    - **Father's Day · Next service** — 651 with the date as `[DATE]`
    - **Thanksgiving · Dedications** — 511

**Flagged edits** (the only changes to wording; each is listed for the user in Step 5):
- "Ajibowo" (77) → "Ajibowu", matching line 32.
- "as he pours" (198, Pastor Temitope Areo) → "as she pours".
- "Thank you, Sirs and Ma." (362) → "Thank you, Sirs and Mas."
- Special Programs is `inService: false` as the spec says — but its messages are greetings for planned services (Easter, Love Choices), so the user may want it `true`. If they do, change it in the JSON *and* in the test "keeps Apologies and Special Programs out of setlists" (drop it from that list and from the test's name).
- Name choices where the two copies of the doc disagree — the `.txt` spelling was used: "Pastor Charles Olumorin" (`.docx`: "Mr."), "Pastor Ajibowu Abayomi" (`.docx`: "Mr."), "Pastor Ayomidotun Fayode" (`.docx` prayer list: "Pastor John Fayode").
- Welcoming Ambience Jewel · Sunday uses the `.txt` wording ("As we gather to honour…"); the `.docx` has "To lead us as we honor God in worship; Ambience Jewel🙌🏽🙌🏽".

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/messageSeed.test.ts tests/messages.test.ts`
Expected: PASS. If "passes every rule" fails, the message returned by `parseSeed` names the section and message; fix the JSON there.

- [ ] **Step 5: STOP — the user reviews the seed before it is committed**

The seed is an interpretation of the doc, and it is what the operator will paste into a public chat. Show the user:
1. The **Flagged edits** list above, asking for a yes/no on each (and which spelling for each name).
2. The file itself: `src/data/messages.seed.json`.

Apply their answers, re-run Step 4, and only then commit. Do not start Task 7 until they have answered.

- [ ] **Step 6: Commit**

```bash
git add src/data/messages.seed.json tests/messageSeed.test.ts
git commit -m "feat: starter message library from the engagement document"
```

---
### Task 7: Setlist items that can be messages

**Files:**
- Modify: `src/lib/setlistEdit.ts`
- Modify: `src/db/setlists.ts` (`toRecord`)
- Modify: `src/app/api/setlists/[id]/route.ts` (`PATCH`)
- Modify: `src/lib/setlist.ts` (`resolveSetlist` signature only — Task 8 finishes it)
- Modify: `src/app/useSetlist.ts`, `src/app/SongsTab.tsx`, `src/app/setlists/page.tsx` (callers)
- Test: `tests/setlistEdit.test.ts`, `tests/setlists.test.ts`, `tests/setlist.test.ts`, create `tests/setlistRoute.test.ts`

**Interfaces:**
- Consumes: `cleanParts` (Task 2); `factsForMessages`, `MessageFacts`, `createSection`, `createMessage` (Task 4).
- Produces (in `src/lib/setlistEdit.ts`):
  ```ts
  export interface SongItem { kind: "song"; id: number; title: string }
  export interface MessageItem { kind: "message"; id: number; title: string; parts?: string[] }
  export type SetlistItem = SongItem | MessageItem;
  export function itemKey(item: { kind: "song" | "message"; id: number }): string;       // "song:3", "message:12"
  export function storedItems(raw: unknown): SetlistItem[];                                // tolerant read of the JSON column
  export function addedMessageIds(before: SetlistItem[], after: SetlistItem[]): number[];
  export function refusedMessage(ids: number[], facts: Map<number, { inService: boolean; sectionName: string }>): string | null;
  ```
- Produces (in `src/app/useSetlist.ts`): `export type SetlistApi = ReturnType<typeof useSetlist>`; the hook returns `{ setlist, addItem(item: SetlistItem): Promise<AddResult>, startSetlist(name: string, item: SetlistItem): Promise<AddResult> }` (`addSong` is removed).

- [ ] **Step 1: Update the validation tests**

In `tests/setlistEdit.test.ts`:

Change the import line to:

```ts
import { addedMessageIds, itemKey, parseSetlistCreate, parseSetlistPatch, refusedMessage, storedItems, MAX_ITEMS } from "../src/lib/setlistEdit";
```

Change the `song` helper to:

```ts
const song = (id: number, title = `Song ${id}`) => ({ kind: "song" as const, id, title });
const message = (id: number, title = `Message ${id}`, parts?: string[]) => ({ kind: "message" as const, id, title, ...(parts ? { parts } : {}) });
```

In `it("trims a cached title and cuts it at 200 characters"` nothing changes. Append a new block at the end of the file:

```ts
describe("messages in a setlist", () => {
  it("reads an item with no kind as a song, which is how every setlist before messages was saved", () => {
    expect(patched({ items: [{ id: 3, title: "Way Maker" }], updatedAt: "t" }).items).toEqual([song(3, "Way Maker")]);
    expect(storedItems([{ id: 3, title: "Way Maker" }, message(4)])).toEqual([song(3, "Way Maker"), message(4)]);
    expect(storedItems("not an array")).toEqual([]);
  });

  it("takes a message, with or without text edited for this service", () => {
    const p = patched({ items: [message(12, "Next Service · Midweek"), message(13, "Greetings · Sunday", [" Good morning ", ""])], updatedAt: "t" });
    expect(p.items).toEqual([message(12, "Next Service · Midweek"), message(13, "Greetings · Sunday", ["Good morning"])]);
  });

  it("refuses edited text that breaks the library's rules", () => {
    expect(parseSetlistPatch({ items: [message(12, "x", [])], updatedAt: "t" })).toMatch(/edited text/i);
    expect(parseSetlistPatch({ items: [message(12, "x", ["a".repeat(4001)])], updatedAt: "t" })).toMatch(/edited text/i);
  });

  it("tells a song from a message with the same id, but not a message from itself", () => {
    expect(patched({ items: [song(12), message(12), message(12, "again")], updatedAt: "t" }).items).toEqual([song(12), message(12)]);
    expect(itemKey(song(12))).not.toBe(itemKey(message(12)));
  });

  it("refuses an unknown kind", () => {
    expect(parseSetlistPatch({ items: [{ kind: "verse", id: 1, title: "John 3:16" }], updatedAt: "t" })).toMatch(/song or message/i);
  });

  it("finds only the messages being added, so a setlist saved earlier is never re-judged", () => {
    expect(addedMessageIds([song(1), message(5)], [message(5), song(1), message(7), song(9)])).toEqual([7]);
  });

  it("refuses an apology by its section's name, and a message that is gone", () => {
    const facts = new Map([
      [7, { inService: false, sectionName: "Apologies" }],
      [8, { inService: true, sectionName: "Greetings" }],
    ]);
    expect(refusedMessage([8], facts)).toBe(null);
    expect(refusedMessage([8, 7], facts)).toBe("Apologies can't go in a setlist");
    expect(refusedMessage([99], facts)).toMatch(/no longer in the library/);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/setlistEdit.test.ts`
Expected: FAIL — `addedMessageIds` is not exported, and existing expectations now include `kind: "song"`.

- [ ] **Step 3: Implement the item union in `src/lib/setlistEdit.ts`**

Replace the `SetlistItem` interface with:

```ts
import { cleanParts } from "./messageEdit";

export interface SongItem {
  kind: "song";
  /** The song's row id. This is the reference; lyrics are always read live. */
  id: number;
  /** A cached label so the list can paint before the songbook has loaded. */
  title: string;
}

export interface MessageItem {
  kind: "message";
  /** The library message's row id. Its text is read live unless `parts` is set. */
  id: number;
  /** A cached "Section · Title" label, for the same reason as a song's. */
  title: string;
  /** Text edited for this service only. Present, it wins over the library's. */
  parts?: string[];
}

export type SetlistItem = SongItem | MessageItem;

/** Song 12 and message 12 are different things; this is what tells them apart. */
export function itemKey(item: { kind: "song" | "message"; id: number }): string {
  return `${item.kind}:${item.id}`;
}
```

(Put the `import` at the top of the file, under the header comment.)

Replace `ITEM_ERROR` and `cleanItems` with:

```ts
const ITEM_ERROR = "Every song or message in a setlist needs an id and a title";
```

```ts
/** The items, deduplicated by kind and id keeping the first, or the message to show. */
function cleanItems(value: unknown): SetlistItem[] | string {
  if (!Array.isArray(value)) return ITEM_ERROR;
  const seen = new Set<string>();
  const items: SetlistItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return ITEM_ERROR;
    const { kind = "song", id, title, parts } = raw as { kind?: unknown; id?: unknown; title?: unknown; parts?: unknown };
    // No kind means a song: every setlist saved before messages existed looks like that.
    if (kind !== "song" && kind !== "message") return ITEM_ERROR;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return ITEM_ERROR;
    if (typeof title !== "string" || !title.trim()) return ITEM_ERROR;
    const key = itemKey({ kind, id });
    if (seen.has(key)) continue;
    seen.add(key);
    // Truncated rather than refused: it is only a cached label, and the live
    // title replaces it as soon as the songbook or library has loaded.
    const label = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
    if (kind === "song" || parts === undefined) {
      items.push({ kind, id, title: label });
      continue;
    }
    const edited = cleanParts(parts);
    if (typeof edited === "string") return `Edited text: ${edited}`;
    items.push({ kind, id, title: label, parts: edited });
  }
  return items.length > MAX_ITEMS ? `A setlist holds at most ${MAX_ITEMS} items` : items;
}
```

Append to the end of the file:

```ts
/**
 * Items as stored, trusted — they passed cleanItems on the way in. The one
 * repair is `kind`: rows written before messages existed have none, and every
 * one of those is a song. They are written back with it on the next change.
 */
export function storedItems(raw: unknown): SetlistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ("kind" in item ? item : { ...item, kind: "song" }) as SetlistItem);
}

/** Messages in `after` that were not already in `before`: the only ones the setlist rule applies to. */
export function addedMessageIds(before: SetlistItem[], after: SetlistItem[]): number[] {
  const had = new Set(before.filter((i) => i.kind === "message").map((i) => i.id));
  return after.filter((i) => i.kind === "message" && !had.has(i.id)).map((i) => i.id);
}

/**
 * Why one of these messages cannot be added, or null. An apology is posted when
 * the sound drops, not at a point in the order, so its section is out of service.
 */
export function refusedMessage(ids: number[], facts: Map<number, { inService: boolean; sectionName: string }>): string | null {
  for (const id of ids) {
    const fact = facts.get(id);
    if (!fact) return "That message is no longer in the library";
    if (!fact.inService) return `${fact.sectionName} can't go in a setlist`;
  }
  return null;
}
```

Update the existing `it(\`refuses more than ${MAX_ITEMS} songs\`` expectation if needed: its regex is `/at most/i`, which still matches.

- [ ] **Step 4: Run the validation tests**

Run: `npx vitest run tests/setlistEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Read old rows as songs in `src/db/setlists.ts`**

Change the import to `import { storedItems, type SetlistItem, type SetlistPatch } from "@/lib/setlistEdit";` and in `toRecord` replace `items: JSON.parse(row.items) as SetlistItem[],` with:

```ts
    items: storedItems(JSON.parse(row.items)),
```

In `tests/setlists.test.ts`, change both `items: [{ id: 1, title: "Way Maker" }]` / `[{ id: 2, title: "Goodness of God" }]` inputs to include `kind: "song"`, and the expectation to `toEqual([{ kind: "song", id: 1, title: "Way Maker" }])`. Then add inside `describe("updateSetlist"`:

```ts
  it("reads a setlist saved before messages existed, its items without a kind, as songs", async () => {
    const created = await setlists.createSetlist("Last month");
    const { db } = await import("../src/db");
    const { setlists: table } = await import("../src/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(table).set({ items: '[{"id":1,"title":"Way Maker"}]' }).where(eq(table.id, created.id));
    expect((await setlists.findSetlist(created.id))?.items).toEqual([{ kind: "song", id: 1, title: "Way Maker" }]);
  });
```

Run: `npx vitest run tests/setlists.test.ts` — expected: PASS.

- [ ] **Step 6: Write the failing route test**

Create `tests/setlistRoute.test.ts`:

```ts
// The setlist PATCH route's one piece of its own logic: a message may be added
// only from a section that is in service. Called directly with a Request against
// a temp database; the setlist routes read no cookies, so no request scope is needed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let route: typeof import("../src/app/api/setlists/[id]/route");
let setlists: typeof import("../src/db/setlists");
let lib: typeof import("../src/db/messages");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-setlist-route-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  setlists = await import("../src/db/setlists");
  lib = await import("../src/db/messages");
  route = await import("../src/app/api/setlists/[id]/route");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

async function fixture() {
  const apologies = await lib.createSection({ name: "Apologies", inService: false });
  const welcoming = await lib.createSection({ name: "Welcoming Ambience Jewel", inService: true });
  if (apologies === "duplicate" || welcoming === "duplicate") throw new Error("duplicate");
  const sorry = await lib.createMessage({ sectionId: apologies.id, title: "Sound restored", parts: ["Sorry"] });
  const sunday = await lib.createMessage({ sectionId: welcoming.id, title: "Sunday", parts: ["As we gather"] });
  if (sorry === "no-section" || sunday === "no-section") throw new Error("no-section");
  return { welcoming, sorry, sunday, setlist: await setlists.createSetlist("Sunday") };
}

async function patch(id: number, body: unknown) {
  const res = await route.PATCH(new Request(`http://desk/api/setlists/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status, body: (await res.json()) as { error?: string; setlist?: { items: unknown[]; updatedAt: string } } };
}

describe("adding a message to a setlist", () => {
  it("accepts one from a section in service", async () => {
    const { sunday, setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: sunday.id, title: "Welcoming Ambience Jewel · Sunday" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(200);
    expect(res.body.setlist?.items).toHaveLength(1);
  });

  it("refuses an apology, naming its section", async () => {
    const { sorry, setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: sorry.id, title: "Apologies · Sound restored" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Apologies can't go in a setlist");
  });

  it("refuses a message that does not exist", async () => {
    const { setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: 999, title: "Gone" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(400);
  });

  it("does not re-judge a message already there when its section is later switched off", async () => {
    const { welcoming, sunday, setlist } = await fixture();
    const item = { kind: "message", id: sunday.id, title: "Welcoming Ambience Jewel · Sunday" };
    const first = await patch(setlist.id, { items: [item], updatedAt: setlist.updatedAt });
    await lib.updateSection(welcoming.id, { inService: false });
    const reorder = await patch(setlist.id, { items: [item, { kind: "song", id: 1, title: "Way Maker" }], updatedAt: first.body.setlist?.updatedAt });
    expect(reorder.status).toBe(200);
  });
});
```

Run: `npx vitest run tests/setlistRoute.test.ts`
Expected: FAIL — "refuses an apology" gets 200.

- [ ] **Step 7: Apply the rule in the route**

In `src/app/api/setlists/[id]/route.ts`, change the imports to:

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteSetlist, findSetlist, updateSetlist } from "@/db/setlists";
import { factsForMessages } from "@/db/messages";
import { addedMessageIds, parseSetlistPatch, refusedMessage } from "@/lib/setlistEdit";
```

In `PATCH`, between `await ensureSchema();` and `const result = await updateSetlist(id, parsed);`, insert:

```ts
  // Only messages being added are judged. One already in the setlist stays even
  // if its section has since been switched out of service, so flipping a toggle
  // cannot make Sunday's prepared order unsaveable.
  if (parsed.items) {
    const current = await findSetlist(id);
    if (!current) return NextResponse.json({ error: "No such setlist" }, { status: 404 });
    const added = addedMessageIds(current.items, parsed.items);
    const refused = refusedMessage(added, await factsForMessages(added));
    if (refused) return NextResponse.json({ error: refused }, { status: 400 });
  }
```

Run: `npx vitest run tests/setlistRoute.test.ts` — expected: PASS.

- [ ] **Step 8: Keep the callers compiling**

`src/lib/setlist.ts` — change the import to `import type { SetlistItem, SongItem } from "./setlistEdit";` and the first line of `resolveSetlist` to resolve songs only for now (Task 8 replaces this function):

```ts
export function resolveSetlist(items: SetlistItem[], byId: Map<number, SearchableSong> | null): SetlistRow[] {
  return items
    .filter((item): item is SongItem => item.kind === "song")
    .map((item) => {
```

(close the extra parenthesis at the end of the `map`). In `tests/setlist.test.ts`, add `kind: "song" as const` to every item literal passed to `resolveSetlist`, e.g. `resolveSetlist([{ kind: "song", id: 1, title: "Waymaker" }], songsById(book))`.

`src/app/useSetlist.ts` — change the import to `import { itemKey, type SetlistItem } from "@/lib/setlistEdit";`, remove the `SearchableSong` import, and replace `addSong` and `startSetlist` with:

```ts
  const addItem = useCallback(
    async (item: SetlistItem): Promise<AddResult> => {
      if (!setlist) return "failed";
      const key = itemKey(item);
      if (setlist.items.some((i) => itemKey(i) === key)) return "duplicate";

      // Two goes: ours, and one more on top of whatever the other person saved.
      let target = setlist;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { status, setlist: saved, error } = await patch(target.id, {
          items: [...target.items, item],
          updatedAt: target.updatedAt,
        });
        if (status === 200 && saved) {
          setSetlist(saved);
          return "added";
        }
        if (status === 409 && saved) {
          // They may have added the very thing we are adding.
          if (saved.items.some((i) => itemKey(i) === key)) {
            setSetlist(saved);
            return "duplicate";
          }
          target = saved;
          continue;
        }
        if (status === 400 && error) return { refused: error };
        return "failed";
      }
      return "failed";
    },
    [setlist],
  );

  /** Create a setlist, make it the active one, and put this item in it. */
  const startSetlist = useCallback(async (name: string, item: SetlistItem): Promise<AddResult> => {
    const res = await fetch("/api/setlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return "failed";
    const { setlist: created } = (await res.json()) as { setlist: Setlist };

    const activated = await patch(created.id, { active: true });
    if (!activated.setlist) return "failed";

    const added = await patch(activated.setlist.id, { items: [item], updatedAt: activated.setlist.updatedAt });
    if (added.status === 400 && added.error) {
      setSetlist(activated.setlist);
      return { refused: added.error };
    }
    if (!added.setlist) return "failed";

    setSetlist(added.setlist);
    return "added";
  }, []);

  return { setlist, addItem, startSetlist };
}

export type SetlistApi = ReturnType<typeof useSetlist>;
```

and change `AddResult` and `patch` to carry the refusal:

```ts
export type AddResult = "added" | "duplicate" | "failed" | { refused: string };

async function patch(id: number, body: unknown): Promise<{ status: number; setlist?: Setlist; error?: string }> {
  const res = await fetch(`/api/setlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { setlist?: Setlist; error?: string } | null;
  return { status: res.status, setlist: data?.setlist, error: data?.error };
}
```

`src/app/SongsTab.tsx` — rename the destructured `addSong` to `addItem`; in `addToSetlist` replace `const result = await addSong(song);` with:

```ts
      if (song.id === undefined) return showToast("Save the song before adding it to a setlist", "err");
      const result = await addItem({ kind: "song", id: song.id, title: song.title });
```

and update its dependency array to `[setlist, addItem, showToast]`. In the "Start it" button handler replace `const result = await startSetlist(name, song);` with:

```ts
              if (song.id === undefined) return;
              const result = await startSetlist(name, { kind: "song", id: song.id, title: song.title });
```

`src/app/setlists/page.tsx` — import `itemKey` from `@/lib/setlistEdit`; change `<li key={item.id}` to `<li key={itemKey(item)}`, and the remove handler's filter to `s.items.filter((x) => itemKey(x) !== itemKey(item))`.

- [ ] **Step 9: Run everything**

Run: `npm test && npx tsc --noEmit -p .`
Expected: all tests PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/setlistEdit.ts src/db/setlists.ts "src/app/api/setlists/[id]/route.ts" src/lib/setlist.ts src/app/useSetlist.ts src/app/SongsTab.tsx src/app/setlists/page.tsx tests/setlistEdit.test.ts tests/setlists.test.ts tests/setlist.test.ts tests/setlistRoute.test.ts
git commit -m "feat: setlist items can be library messages, service-order sections only"
```

---
### Task 8: Setlist rows and the bar, for both kinds

**Files:**
- Modify: `src/lib/setlist.ts`
- Modify: `src/app/SetlistBar.tsx`
- Modify: `src/app/SongsTab.tsx` (the `SetlistBar` call and `setlistRows`)
- Test: `tests/setlist.test.ts`, `tests/setlistBar.test.tsx`

**Interfaces:**
- Consumes: `SetlistItem`, `SongItem`, `MessageItem`, `itemKey` (Task 7); `LibraryEntry`, `messageLabel` (Task 3); `SearchableSong` from `src/lib/songSearch.ts`.
- Produces (in `src/lib/setlist.ts`):
  ```ts
  export interface SongRow { kind: "song"; key: string; id: number; title: string; author: string | null; song: SearchableSong | null; missing: boolean }
  export interface MessageRow {
    kind: "message"; key: string; id: number; title: string;
    parts: string[] | null;  // what a tap copies; null = nothing to copy yet
    edited: boolean;         // text was edited for this service
    removed: boolean;        // library loaded and the message is not in it
    waiting: boolean;        // library still loading and no edited text to fall back on
  }
  export type SetlistRow = SongRow | MessageRow;
  export function resolveSetlist(items: SetlistItem[], songs: Map<number, SearchableSong> | null, library: Map<number, LibraryEntry> | null): SetlistRow[];
  export function withParts(items: SetlistItem[], index: number, parts: string[] | undefined): SetlistItem[];
  ```
- Produces (`SetlistBar` props): `{ name: string; staleNote: string | null; rows: SetlistRow[]; copied: ReadonlySet<string>; onOpen: (row: SongRow) => void; onMessage: (row: MessageRow) => void }`. `copied` holds row keys (`itemKey`).

- [ ] **Step 1: Write the failing resolution tests**

In `tests/setlist.test.ts`, change the import to also bring in `withParts`, and add `import { messagesById } from "../src/lib/messageLibrary";` and `import { library } from "./fixtures/library";`. Every existing `resolveSetlist(x, songsById(...))` call gains a third argument `null`. Append:

```ts
describe("message rows", () => {
  const lib = messagesById(library);
  const msg = (id: number, title: string, parts?: string[]) => ({ kind: "message" as const, id, title, ...(parts ? { parts } : {}) });

  it("shows the live label and copies the library's text", () => {
    const [row] = resolveSetlist([msg(10, "old label")], null, lib);
    expect(row).toMatchObject({ kind: "message", key: "message:10", title: "Welcoming Ambience Jewel · Sunday", parts: ["As we gather to honour"], edited: false, removed: false, waiting: false });
  });

  it("copies the text edited for this service instead, and says so", () => {
    const [row] = resolveSetlist([msg(10, "x", ["As we gather this Easter"])], null, lib);
    expect(row).toMatchObject({ parts: ["As we gather this Easter"], edited: true });
  });

  it("waits for the library, unless its edited text needs nothing from it", () => {
    const [plain, edited] = resolveSetlist([msg(10, "Welcoming Ambience Jewel · Sunday"), msg(11, "cached", ["mine"])], null, null);
    expect(plain).toMatchObject({ title: "Welcoming Ambience Jewel · Sunday", parts: null, waiting: true, removed: false });
    expect(edited).toMatchObject({ parts: ["mine"], waiting: false, removed: false });
  });

  it("keeps a message deleted from the library: dead without edited text, still working with it", () => {
    const [dead, alive] = resolveSetlist([msg(77, "Gone"), msg(78, "Gone too", ["kept"])], null, lib);
    expect(dead).toMatchObject({ title: "Gone", parts: null, removed: true, waiting: false });
    expect(alive).toMatchObject({ title: "Gone too", parts: ["kept"], removed: true });
  });

  it("keeps songs and messages in the order they were prepared", () => {
    const rows = resolveSetlist([msg(20, "a"), { kind: "song", id: 2, title: "Oceans" }, msg(10, "b")], songsById(book), lib);
    expect(rows.map((r) => r.key)).toEqual(["message:20", "song:2", "message:10"]);
  });
});

describe("editing a message for one service", () => {
  const items = [{ kind: "song" as const, id: 1, title: "Way Maker" }, { kind: "message" as const, id: 10, title: "Sunday" }];

  it("puts edited text on that item only", () => {
    expect(withParts(items, 1, ["Easter morning"])).toEqual([items[0], { kind: "message", id: 10, title: "Sunday", parts: ["Easter morning"] }]);
  });

  it("resets to the library's text by removing it", () => {
    const edited = withParts(items, 1, ["Easter morning"]);
    expect(withParts(edited, 1, undefined)).toEqual(items);
  });

  it("never puts text on a song", () => {
    expect(withParts(items, 0, ["nope"])).toEqual(items);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/setlist.test.ts`
Expected: FAIL — `withParts` is not exported; message rows are filtered out.

- [ ] **Step 3: Implement rows for both kinds**

In `src/lib/setlist.ts`, replace the imports, `SetlistRow` and `resolveSetlist` with:

```ts
import type { IndexedSong, SearchableSong } from "./songSearch";
import { itemKey, type MessageItem, type SetlistItem } from "./setlistEdit";
import { messageLabel, type LibraryEntry } from "./messageLibrary";

export interface SongRow {
  kind: "song";
  key: string;
  id: number;
  title: string;
  author: string | null;
  /** The song to open. Null while the book is loading, and for a deleted song. */
  song: SearchableSong | null;
  /** True only once the book has loaded and this id is not in it. */
  missing: boolean;
}

export interface MessageRow {
  kind: "message";
  key: string;
  id: number;
  title: string;
  /** What a tap copies: the edited text, else the library's. Null when there is nothing to copy yet. */
  parts: string[] | null;
  /** The text was edited for this service, so library fixes no longer reach it. */
  edited: boolean;
  /** The library has loaded and this message is not in it. */
  removed: boolean;
  /** The library is still loading and there is no edited text to fall back on. */
  waiting: boolean;
}

export type SetlistRow = SongRow | MessageRow;
```

(keep `songsById` as it is)

```ts
export function resolveSetlist(
  items: SetlistItem[],
  songs: Map<number, SearchableSong> | null,
  library: Map<number, LibraryEntry> | null,
): SetlistRow[] {
  return items.map((item): SetlistRow => {
    if (item.kind === "message") {
      const entry = library?.get(item.id);
      const parts = item.parts ?? entry?.message.parts ?? null;
      return {
        kind: "message",
        key: itemKey(item),
        id: item.id,
        title: entry ? messageLabel(entry.section, entry.message) : item.title,
        parts,
        edited: item.parts !== undefined,
        // Not knowing yet is not the same as knowing it is gone.
        removed: library !== null && !entry,
        waiting: library === null && parts === null,
      };
    }
    const song = songs?.get(item.id) ?? null;
    return {
      kind: "song",
      key: itemKey(item),
      id: item.id,
      title: song?.title ?? item.title,
      author: song?.author ?? null,
      song,
      missing: songs !== null && song === null,
    };
  });
}

/** Set (or, with undefined, remove) the text edited for this service on one message item. */
export function withParts(items: SetlistItem[], index: number, parts: string[] | undefined): SetlistItem[] {
  return items.map((item, i) => {
    if (i !== index || item.kind !== "message") return item;
    const next: MessageItem = { kind: "message", id: item.id, title: item.title };
    if (parts) next.parts = parts;
    return next;
  });
}
```

Update the file's header comment: replace "A stored item is `{ id, title }`." with "A stored item is a song `{ kind, id, title }` or a message `{ kind, id, title, parts? }`." and add one sentence: "A message's text is read from the library unless it was edited for this service."

- [ ] **Step 4: Run the resolution tests**

Run: `npx vitest run tests/setlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing bar tests**

In `tests/setlistBar.test.tsx`, replace the helpers at the top with:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetlistBar from "../src/app/SetlistBar";
import type { MessageRow, SetlistRow, SongRow } from "../src/lib/setlist";

const row = (over: Partial<SongRow> & { id: number; title: string }): SongRow => ({
  kind: "song",
  key: `song:${over.id}`,
  author: null,
  song: { id: over.id, title: over.title, sections: ["la la"] },
  missing: false,
  ...over,
});

const note = (over: Partial<MessageRow> & { id: number; title: string }): MessageRow => ({
  kind: "message",
  key: `message:${over.id}`,
  parts: ["Sirs and Mas"],
  edited: false,
  removed: false,
  waiting: false,
  ...over,
});

const render = (rows: SetlistRow[], staleNote: string | null = null, copied: string[] = []) =>
  renderToStaticMarkup(
    <SetlistBar name="Sunday 14 Sept" staleNote={staleNote} rows={rows} copied={new Set(copied)} onOpen={() => {}} onMessage={() => {}} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();
```

Change the empty-setlist test to:

```tsx
  it("tells you what to do with a setlist that has nothing in it yet", () => {
    expect(render([])).toContain("Nothing in it yet");
  });
```

Change the numbering test's expectations to allow the kind marker between the number and the title:

```tsx
  it("numbers the items in the order they were prepared", () => {
    const t = text(render([row({ id: 1, title: "Way Maker" }), note({ id: 2, title: "Greetings · Sunday" })]));
    expect(t).toContain("1\n🎵\nWay Maker");
    expect(t).toContain("2\n💬\nGreetings · Sunday");
  });
```

Append:

```tsx
describe("messages in the setlist bar", () => {
  it("marks songs and messages apart", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), note({ id: 2, title: "Greetings · Sunday" })]);
    expect(html).toContain("🎵");
    expect(html).toContain("💬");
  });

  it("says when a message's text was edited for this service", () => {
    expect(render([note({ id: 2, title: "Next Service · Midweek", edited: true })])).toContain("edited");
    expect(render([note({ id: 2, title: "Next Service · Midweek" })])).not.toContain("edited");
  });

  it("ticks what has been copied this session, and nothing else", () => {
    const html = render([note({ id: 2, title: "Greetings · Sunday" }), note({ id: 3, title: "Prayer · Queen" })], null, ["message:2"]);
    expect(html.match(/✓/g)).toHaveLength(1);
  });

  it("says how many posts a long message is", () => {
    expect(render([note({ id: 4, title: "Confession · Full text", parts: ["a", "b", "c"] })])).toContain("3 parts");
  });

  it("disables a message with nothing to copy, and says why", () => {
    const gone = render([note({ id: 5, title: "Gone", parts: null, removed: true })]);
    expect(gone).toContain("no longer in the library");
    // The attribute, not the word: every row's classes contain "disabled:".
    expect(gone).toContain('disabled=""');
    expect(render([note({ id: 6, title: "Loading", parts: null, waiting: true })])).toContain("library not loaded");
  });

  it("keeps a removed message with edited text working, with a quiet note", () => {
    const html = render([note({ id: 7, title: "Kept", parts: ["mine"], edited: true, removed: true })]);
    expect(html).toContain("removed from library");
    expect(html).not.toContain('disabled=""');
  });
});
```

Run: `npx vitest run tests/setlistBar.test.tsx`
Expected: FAIL — no `💬`, no `copied` prop.

- [ ] **Step 6: Implement the bar**

Replace `src/app/SetlistBar.tsx` with:

```tsx
"use client";

import type { MessageRow, SetlistRow, SongRow } from "@/lib/setlist";

interface Props {
  name: string;
  /** From staleNote(); shown in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** Keys of rows copied during this page session. Local to this screen; never shared. */
  copied: ReadonlySet<string>;
  /** The tab decides whether to open row.song or fetch it by id first. */
  onOpen: (row: SongRow) => void;
  /** The desk decides: one part copies at once, several open the message. */
  onMessage: (row: MessageRow) => void;
}

function messageNote(row: MessageRow): string | null {
  if (row.waiting) return "library not loaded";
  if (row.removed) return row.parts ? "removed from library" : "no longer in the library";
  return null;
}

/**
 * The service order, at the top of the Songs and Messages tabs, so the operator
 * taps instead of searching. A song row opens the same song view a search hit
 * opens; a message row copies. It is a shortcut into machinery that already
 * works, not a second way to send anything.
 *
 * The author is on every song row on purpose: it is the thing missing from a
 * title when two songs look the same in a list of search results.
 */
export default function SetlistBar({ name, staleNote, rows, copied, onOpen, onMessage }: Props) {
  return (
    <section aria-label="Setlist for this service" className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        {name}
        {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in it yet — add songs or messages with +.</p>
      ) : (
        <ol className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <li key={row.key}>
              {row.kind === "song" ? (
                <button
                  onClick={() => onOpen(row)}
                  disabled={row.missing}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <span className="mr-2" aria-label="Song">🎵</span>
                    <span className="font-medium">{row.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{row.missing ? "no longer in the songbook" : row.author}</span>
                </button>
              ) : (
                <button
                  onClick={() => onMessage(row)}
                  disabled={row.parts === null}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <span className="mr-2" aria-label="Message">💬</span>
                    <span className="font-medium">{row.title}</span>
                    {row.edited && (
                      <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {messageNote(row) ?? (row.parts && row.parts.length > 1 ? `${row.parts.length} parts` : "")}
                    {copied.has(row.key) && <span className="ml-2 text-emerald-400">✓</span>}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Keep the Songs tab compiling**

In `src/app/SongsTab.tsx`, change `setlistRows` to

```ts
  const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, byId, null) : []), [setlist, byId]);
```

and the `<SetlistBar … />` call to add

```tsx
              copied={new Set()}
              onMessage={() => showToast("Open the Messages tab to copy this message", "warn")}
```

This is an interim state: Task 10 gives the Songs tab the library, the ✓ ticks and real message copying.

- [ ] **Step 8: Run everything**

Run: `npm test && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/setlist.ts src/app/SetlistBar.tsx src/app/SongsTab.tsx tests/setlist.test.ts tests/setlistBar.test.tsx
git commit -m "feat: setlist rows and bar show library messages beside songs"
```

---
### Task 9: The message list and the message view

**Files:**
- Modify: `src/lib/messageLibrary.ts` (add `groupEntries`)
- Create: `src/app/MessageList.tsx`, `src/app/MessageView.tsx`
- Test: `tests/messageLibrary.test.ts`, create `tests/messageList.test.tsx`, `tests/messageView.test.tsx`

**Interfaces:**
- Consumes: `LibraryEntry`, `LibraryGroup`, `groupLibrary` (Task 3); `itemKey` (Task 7).
- Produces:
  ```ts
  // messageLibrary.ts
  export function groupEntries(entries: LibraryEntry[]): LibraryGroup[]; // consecutive entries of one section grouped, order kept
  // MessageList.tsx (default export, memo)
  interface MessageListProps {
    groups: LibraryGroup[];             // empty groups are not rendered
    active: number | null;              // message id the keyboard points at
    copied: ReadonlySet<string>;        // itemKey()s copied this session
    onPick: (entry: LibraryEntry) => void;
    onAdd: (entry: LibraryEntry) => void;
    onHover: (messageId: number) => void;
  }
  // MessageView.tsx (default export)
  interface MessageViewProps {
    label: string; parts: string[]; edited: boolean;
    sent: ReadonlySet<number>; cursor: number; flash: number | null;
    addLabel: string | null;            // "+ Setlist" / "Start a setlist"; null hides the button (section not in service)
    onCopy: (index: number, advance: boolean) => void;
    onFocusPart: (index: number) => void;
    onAdd: () => void; onBack: () => void;
    partRef: (index: number, el: HTMLButtonElement | null) => void;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/messageLibrary.test.ts` (and add `groupEntries` to its import):

```ts
describe("grouping search results", () => {
  it("groups consecutive results under their section, in the order given", () => {
    const entries = libraryEntries(library);
    const groups = groupEntries([entries[1], entries[2], entries[0]]);
    expect(groups.map((g) => [g.section.name, g.messages.map((m) => m.id)])).toEqual([
      ["Welcoming Ambience Jewel", [10, 11]],
      ["Apologies", [20]],
    ]);
  });
});
```

Create `tests/messageList.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MessageList from "../src/app/MessageList";
import { groupLibrary } from "../src/lib/messageLibrary";
import { library } from "./fixtures/library";

const render = (opts: { active?: number | null; copied?: string[] } = {}) =>
  renderToStaticMarkup(
    <MessageList groups={groupLibrary(library)} active={opts.active ?? null} copied={new Set(opts.copied ?? [])} onPick={() => {}} onAdd={() => {}} onHover={() => {}} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("the message library the operator browses", () => {
  it("lists sections in service order, skipping empty ones", () => {
    const t = text(render());
    expect(t.indexOf("Apologies")).toBeLessThan(t.indexOf("Welcoming Ambience Jewel"));
    expect(t).not.toContain("Empty");
  });

  it("previews each message's text under its title", () => {
    expect(text(render())).toContain("Sound restored\nSirs and Mas, we apologize");
  });

  it("offers + only where the section can go in a setlist", () => {
    const html = render();
    expect(html).toContain('aria-label="Add Welcoming Ambience Jewel · Sunday to the setlist"');
    expect(html).not.toContain('aria-label="Add Apologies · Sound restored to the setlist"');
  });

  it("marks the row the keyboard is on, and ticks what was copied", () => {
    const html = render({ active: 20, copied: ["message:20"] });
    expect(html).toContain('aria-current="true"');
    expect(html.match(/✓/g)).toHaveLength(1);
  });
});
```

Create `tests/messageView.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MessageView from "../src/app/MessageView";

const render = (over: Partial<Parameters<typeof MessageView>[0]> = {}) =>
  renderToStaticMarkup(
    <MessageView
      label="Confession · Full text"
      parts={["Father we thank You", "Every son and daughter", "I boldly decree and declare"]}
      edited={false}
      sent={new Set()}
      cursor={0}
      flash={null}
      addLabel="+ Setlist"
      onCopy={() => {}}
      onFocusPart={() => {}}
      onAdd={() => {}}
      onBack={() => {}}
      partRef={() => {}}
      {...over}
    />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("sending a long message part by part", () => {
  it("numbers every part, in order", () => {
    const t = text(render());
    expect(t).toContain("1\nFather we thank You");
    expect(t).toContain("3\nI boldly decree and declare");
  });

  it("puts only the cursor's part in the tab order", () => {
    expect(render({ cursor: 1 }).match(/tabindex="0"/g)).toHaveLength(1);
  });

  it("dims parts already sent", () => {
    expect(render({ sent: new Set([0]) })).toContain("opacity-60");
  });

  it("says when this is text edited for the service", () => {
    expect(render({ edited: true })).toContain("edited");
  });

  it("hides the setlist button for a message that cannot go in one", () => {
    expect(render()).toContain("+ Setlist");
    expect(render({ addLabel: null })).not.toContain("Setlist");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/messageLibrary.test.ts tests/messageList.test.tsx tests/messageView.test.tsx`
Expected: FAIL — `groupEntries` not exported; components do not exist.

- [ ] **Step 3: `groupEntries`**

Append to `src/lib/messageLibrary.ts`:

```ts
/** Search results back into section groups, keeping the order they came in. */
export function groupEntries(entries: LibraryEntry[]): LibraryGroup[] {
  const groups: LibraryGroup[] = [];
  for (const { section, message } of entries) {
    const last = groups.at(-1);
    if (last && last.section.id === section.id) last.messages.push(message);
    else groups.push({ section, messages: [message] });
  }
  return groups;
}
```

- [ ] **Step 4: `src/app/MessageList.tsx`**

```tsx
"use client";

import { memo } from "react";
import { messageLabel, type LibraryEntry, type LibraryGroup } from "@/lib/messageLibrary";
import { itemKey } from "@/lib/setlistEdit";

interface Props {
  groups: LibraryGroup[];
  /** The message the keyboard points at in search results. */
  active: number | null;
  copied: ReadonlySet<string>;
  /** The tab decides: one part copies at once, several open the message. */
  onPick: (entry: LibraryEntry) => void;
  onAdd: (entry: LibraryEntry) => void;
  onHover: (messageId: number) => void;
}

/**
 * The library by section. Each row is two sibling buttons, never one inside the
 * other: the row copies or opens, the + adds to the setlist. The + only exists
 * where the section can go in a setlist, so an apology never offers it.
 */
function MessageList({ groups, active, copied, onPick, onAdd, onHover }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      {groups
        .filter((g) => g.messages.length > 0)
        .map(({ section, messages }) => (
          <section key={section.id} aria-label={section.name}>
            <h3 className="border-y border-zinc-800 bg-zinc-950/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{section.name}</h3>
            <ul className="divide-y divide-zinc-800">
              {messages.map((message) => {
                const entry = { section, message };
                const label = messageLabel(section, message);
                return (
                  <li key={message.id} className="flex items-stretch">
                    <button
                      onClick={() => onPick(entry)}
                      onMouseEnter={() => onHover(message.id)}
                      aria-current={active === message.id ? "true" : undefined}
                      className={`min-w-0 flex-1 px-4 py-3 text-left hover:bg-zinc-800/60 ${active === message.id ? "bg-zinc-800/60" : ""}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 font-medium">{message.title}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {message.parts.length > 1 ? `${message.parts.length} parts` : ""}
                          {copied.has(itemKey({ kind: "message", id: message.id })) && <span className="ml-2 text-emerald-400">✓</span>}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">{message.parts[0]}</span>
                    </button>
                    {section.inService && (
                      <button
                        onClick={() => onAdd(entry)}
                        aria-label={`Add ${label} to the setlist`}
                        title="Add to the setlist"
                        className="grid min-h-11 min-w-11 shrink-0 place-items-center self-start text-lg text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        +
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

export default memo(MessageList);
```

- [ ] **Step 5: `src/app/MessageView.tsx`**

```tsx
"use client";

interface Props {
  label: string;
  parts: string[];
  /** Showing text edited for this service rather than the library's. */
  edited: boolean;
  sent: ReadonlySet<number>;
  cursor: number;
  /** The part just copied, briefly highlighted where the operator is looking. */
  flash: number | null;
  /** "+ Setlist" or "Start a setlist"; null when the section cannot go in a setlist. */
  addLabel: string | null;
  onCopy: (index: number, advance: boolean) => void;
  onFocusPart: (index: number) => void;
  onAdd: () => void;
  onBack: () => void;
  partRef: (index: number, el: HTMLButtonElement | null) => void;
}

/**
 * A message of several Mixlr posts — the confession, the account details —
 * sent one part at a time, the way a song is sent section by section. Keys are
 * handled by the tab (Esc, arrows, 1–9); Enter on a focused part copies it and
 * moves on, a click copies it and stays.
 */
export default function MessageView({ label, parts, edited, sent, cursor, flash, addLabel, onCopy, onFocusPart, onAdd, onBack, partRef }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">
          {label}
          {edited && (
            <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
          )}
        </h2>
        <span className="flex shrink-0 gap-2">
          {addLabel && (
            <button onClick={onAdd} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
              {addLabel}
            </button>
          )}
          <button onClick={onBack} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            ← Messages
          </button>
        </span>
      </div>
      <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
        <span className="kbd">↵</span> send and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> jump · <span className="kbd">Esc</span> back
      </p>
      <ol className="space-y-2">
        {parts.map((part, i) => (
          <li
            key={i}
            className={`rounded-xl border p-1 transition-colors ${
              flash === i ? "border-emerald-500/60 bg-emerald-500/10" : sent.has(i) ? "border-zinc-800/60 opacity-60" : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <button
              ref={(el) => partRef(i, el)}
              onClick={() => onCopy(i, false)}
              onFocus={() => onFocusPart(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCopy(i, true);
                }
              }}
              tabIndex={i === cursor ? 0 : -1}
              className={`w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800/60 ${i === cursor ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
            >
              <span className="mr-2 text-xs text-[var(--muted)]">{i + 1}</span>
              <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{part}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/messageLibrary.test.ts tests/messageList.test.tsx tests/messageView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/messageLibrary.ts src/app/MessageList.tsx src/app/MessageView.tsx tests/messageLibrary.test.ts tests/messageList.test.tsx tests/messageView.test.tsx
git commit -m "feat: message list and part-by-part message view"
```

---
### Task 10: The Messages tab

**Files:**
- Modify: `src/lib/messageLibrary.ts` (add `OpenMessage`, `openMessageFor`, `partLabel`)
- Modify: `src/lib/setlist.ts` (add `openMessageFromRow`)
- Create: `src/app/useMessages.ts`, `src/app/useMessageCopy.ts`, `src/app/StartSetlist.tsx`, `src/app/MessagesTab.tsx`
- Modify: `src/app/useSetlist.ts` (add `addToast`)
- Modify: `src/app/SongsTab.tsx` (use `StartSetlist` and `addToast`)
- Test: `tests/messageLibrary.test.ts`, `tests/setlist.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 7, 8, 9.
- Produces:
  ```ts
  // messageLibrary.ts
  export interface OpenMessage { key: string; id: number; label: string; parts: string[]; edited: boolean; inService: boolean }
  export function openMessageFor(entry: LibraryEntry): OpenMessage;
  export function partLabel(label: string, index: number, count: number): string; // "X" or "X · part 2 of 3"
  // setlist.ts
  export function openMessageFromRow(row: MessageRow, library: Map<number, LibraryEntry> | null): OpenMessage | null;
  // useMessages.ts
  export function useMessages(): { library: Library | null; failed: boolean; reload: () => void };
  // useMessageCopy.ts
  export function useMessageCopy(deps: { copyText: (t: string) => Promise<boolean>; showToast: (text: string, tone?: "ok" | "warn" | "err") => void; logSend: (kind: string, label: string, body: string, meta?: unknown) => void }):
    { copied: ReadonlySet<string>; copyPart: (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number) => Promise<boolean> };
  // useSetlist.ts
  export function addToast(result: AddResult, what: string, setlistName: string): { text: string; tone: "ok" | "warn" | "err" };
  // StartSetlist.tsx (default export)
  interface StartSetlistProps { what: string; onCancel: () => void; onStart: (name: string) => void }
  // MessagesTab.tsx (default export)
  interface MessagesTabProps {
    library: Library | null; failed: boolean; onRetry: () => void;
    setlistApi: SetlistApi;
    copied: ReadonlySet<string>;
    copyPart: (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number) => Promise<boolean>;
    showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
    pending: OpenMessage | null;      // open this on arrival (setlist row on the Songs tab, or ⌘K)
    onPendingDone: () => void;
    onOpenSong: (row: SongRow) => void; // a song row tapped here: the desk switches to Songs
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/messageLibrary.test.ts` (add `openMessageFor, partLabel` to the import):

```ts
describe("opening and logging a message", () => {
  it("opens a library message with its key, label and whether it can go in a setlist", () => {
    const [sorry] = libraryEntries(library);
    expect(openMessageFor(sorry)).toEqual({
      key: "message:20",
      id: 20,
      label: "Apologies · Sound restored",
      parts: sorry.message.parts,
      edited: false,
      inService: false,
    });
  });

  it("logs which part of a long message was sent, and nothing extra for a short one", () => {
    expect(partLabel("Apologies · Sound restored", 0, 1)).toBe("Apologies · Sound restored");
    expect(partLabel("Confession · Full text", 1, 3)).toBe("Confession · Full text · part 2 of 3");
  });
});
```

Append to `tests/setlist.test.ts` (add `openMessageFromRow` to the import):

```ts
describe("opening a message from its setlist row", () => {
  const lib = messagesById(library);

  it("carries the row's text, edited or not, and the section's setlist rule", () => {
    const [row] = resolveSetlist([{ kind: "message", id: 11, title: "x", parts: ["Easter worship"] }], null, lib);
    if (row.kind !== "message") throw new Error("expected a message row");
    expect(openMessageFromRow(row, lib)).toEqual({
      key: "message:11",
      id: 11,
      label: "Welcoming Ambience Jewel · Sunday · Worship",
      parts: ["Easter worship"],
      edited: true,
      inService: true,
    });
  });

  it("opens nothing for a row with nothing to copy", () => {
    const [row] = resolveSetlist([{ kind: "message", id: 77, title: "Gone" }], null, lib);
    if (row.kind !== "message") throw new Error("expected a message row");
    expect(openMessageFromRow(row, lib)).toBe(null);
  });
});
```

Run: `npx vitest run tests/messageLibrary.test.ts tests/setlist.test.ts`
Expected: FAIL — the new functions are not exported.

- [ ] **Step 2: Implement the helpers**

Append to `src/lib/messageLibrary.ts`:

```ts
/** A message the desk is about to copy or has open: from the library, a setlist row, or ⌘K. */
export interface OpenMessage {
  /** itemKey() of the message, which is also what the ✓ ticks are keyed by. */
  key: string;
  id: number;
  label: string;
  parts: string[];
  /** Text edited for one service, not the library's. */
  edited: boolean;
  /** Whether its section may go in a setlist, which decides if + is offered. */
  inService: boolean;
}

export function openMessageFor({ section, message }: LibraryEntry): OpenMessage {
  return {
    key: `message:${message.id}`,
    id: message.id,
    label: messageLabel(section, message),
    parts: message.parts,
    edited: false,
    inService: section.inService,
  };
}

/** The log label for one copied part. A one-part message is just its label. */
export function partLabel(label: string, index: number, count: number): string {
  return count > 1 ? `${label} · part ${index + 1} of ${count}` : label;
}
```

Append to `src/lib/setlist.ts` (and add `OpenMessage` to its `messageLibrary` import):

```ts
/** What tapping a message row opens or copies. Null when the row has no text to offer. */
export function openMessageFromRow(row: MessageRow, library: Map<number, LibraryEntry> | null): OpenMessage | null {
  if (!row.parts) return null;
  return {
    key: row.key,
    id: row.id,
    label: row.title,
    parts: row.parts,
    edited: row.edited,
    inService: library?.get(row.id)?.section.inService ?? false,
  };
}
```

Run: `npx vitest run tests/messageLibrary.test.ts tests/setlist.test.ts` — expected: PASS.

- [ ] **Step 3: `src/app/useMessages.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Library } from "@/lib/messageLibrary";

/**
 * The library, fetched once when the desk opens: the palette needs it on any
 * tab, and it is a few dozen rows. A failure leaves `library` null and
 * `failed` set, so the Messages tab can offer Retry and nothing else breaks.
 */
export function useMessages() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      // A 401 from an expired PIN parses cleanly; taking it would show an empty library.
      if (!res.ok) return setFailed(true);
      setLibrary((await res.json()) as Library);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void fetchLibrary();
  }, [fetchLibrary]);

  const reload = useCallback(() => {
    setFailed(false);
    void fetchLibrary();
  }, [fetchLibrary]);

  return { library, failed, reload };
}
```

- [ ] **Step 4: `src/app/useMessageCopy.ts`**

```ts
"use client";

import { useCallback, useState } from "react";
import { partLabel, type OpenMessage } from "@/lib/messageLibrary";

interface Deps {
  copyText: (t: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
}

/**
 * Copying one part of a message, the same way from every place a message can
 * be copied — the Messages tab, a setlist row on either tab, ⌘K — so the toast,
 * the log entry and the ✓ tick never disagree. The ticks live only in this
 * page session; they are not progress anyone else sees.
 */
export function useMessageCopy({ copyText, showToast, logSend }: Deps) {
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set());

  const copyPart = useCallback(
    async (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number): Promise<boolean> => {
      const text = message.parts[index];
      if (text === undefined) return false;
      if (!(await copyText(text))) {
        showToast("Clipboard blocked — tap again", "err");
        return false;
      }
      const count = message.parts.length;
      showToast(count > 1 ? `Copied part ${index + 1} of ${count} — paste in Mixlr` : `Copied "${message.label}" — paste in Mixlr`);
      logSend("message", partLabel(message.label, index, count), text, { part: index + 1, parts: count });
      setCopied((prev) => new Set(prev).add(message.key));
      return true;
    },
    [copyText, showToast, logSend],
  );

  return { copied, copyPart };
}
```

- [ ] **Step 5: `addToast` in `src/app/useSetlist.ts`**

Append:

```ts
/** The toast for adding something to the setlist, the same from both tabs. */
export function addToast(result: AddResult, what: string, setlistName: string): { text: string; tone: "ok" | "warn" | "err" } {
  if (result === "added") return { text: `Added "${what}" to ${setlistName}`, tone: "ok" };
  if (result === "duplicate") return { text: "Already in the setlist", tone: "warn" };
  if (typeof result === "object") return { text: result.refused, tone: "err" };
  return { text: "Could not add to the setlist", tone: "err" };
}
```

- [ ] **Step 6: `src/app/StartSetlist.tsx`**

```tsx
"use client";

import { useState } from "react";
import { comingSundayName } from "@/lib/setlist";

interface Props {
  /** What will be first in it: a song title or a message label. */
  what: string;
  onCancel: () => void;
  onStart: (name: string) => void;
}

/** Naming a new setlist, prefilled with the coming Sunday. Shared by the Songs and Messages tabs. */
export default function StartSetlist({ what, onCancel, onStart }: Props) {
  const [name, setName] = useState(() => comingSundayName(new Date()));
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Start a setlist</h2>
        <button onClick={onCancel} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
          Cancel
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">&ldquo;{what}&rdquo; will be first.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Setlist name"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
      />
      <button onClick={() => name.trim() && onStart(name.trim())} disabled={!name.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
        Start it
      </button>
    </div>
  );
}
```

`comingSundayName` uses the current date, so it is computed in the state initialiser. The panel only mounts after a click, never during the server render, so there is no hydration mismatch.

- [ ] **Step 7: Use them in `src/app/SongsTab.tsx`**

- Remove the `startName` state and its `setStartName(...)` call in `addToSetlist` (keep `setStarting(song)`).
- Import `StartSetlist from "./StartSetlist"` and `addToast` from `"./useSetlist"`.
- In `addToSetlist`, replace the three `if/else` toast lines with:

```ts
      const toast = addToast(result, song.title, setlist.name);
      showToast(toast.text, toast.tone);
```

- Replace the whole `{starting && ( <div …> … </div> )}` block with:

```tsx
      {starting && (
        <StartSetlist
          what={starting.title}
          onCancel={() => setStarting(null)}
          onStart={async (name) => {
            const song = starting;
            setStarting(null);
            if (song.id === undefined) return;
            const result = await startSetlist(name, { kind: "song", id: song.id, title: song.title });
            showToast(result === "added" ? `Started ${name} with "${song.title}"` : addToast(result, song.title, name).text, result === "added" ? "ok" : "err");
          }}
        />
      )}
```

- Remove the now-unused `comingSundayName` import if nothing else in the file uses it.

- [ ] **Step 8: `src/app/MessagesTab.tsx`**

```tsx
"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { digitToIndex, moveCursor } from "@/lib/songKeys";
import { isTypingTarget } from "@/lib/shortcuts";
import { hasFinePointer } from "@/lib/pointer";
import { groupEntries, groupLibrary, messagesById, openMessageFor, type Library, type LibraryEntry, type OpenMessage } from "@/lib/messageLibrary";
import { searchMessages } from "@/lib/messageSearch";
import { openMessageFromRow, resolveSetlist, staleNote, type MessageRow, type SongRow } from "@/lib/setlist";
import MessageList from "./MessageList";
import MessageView from "./MessageView";
import SetlistBar from "./SetlistBar";
import StartSetlist from "./StartSetlist";
import { addToast, type SetlistApi } from "./useSetlist";

type Copy = (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number) => Promise<boolean>;

interface Props {
  library: Library | null;
  failed: boolean;
  onRetry: () => void;
  setlistApi: SetlistApi;
  copied: ReadonlySet<string>;
  copyPart: Copy;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  pending: OpenMessage | null;
  onPendingDone: () => void;
  onOpenSong: (row: SongRow) => void;
}

export default function MessagesTab({ library, failed, onRetry, setlistApi, copied, copyPart, showToast, pending, onPendingDone, onOpenSong }: Props) {
  const { setlist, addItem, startSetlist } = setlistApi;
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [hit, setHit] = useState(0);
  const [open, setOpen] = useState<OpenMessage | null>(null);
  const [starting, setStarting] = useState<OpenMessage | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const partRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const byId = useMemo(() => messagesById(library), [library]);
  const hits = useMemo(() => (library && deferredQ.trim() ? searchMessages(library, deferredQ) : []), [library, deferredQ]);
  const groups = useMemo(() => (!library ? [] : deferredQ.trim() ? groupEntries(hits) : groupLibrary(library)), [library, deferredQ, hits]);
  const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, null, byId) : []), [setlist, byId]);

  const focusPart = useCallback((i: number) => {
    setCursor(i);
    requestAnimationFrame(() => partRefs.current[i]?.focus());
  }, []);

  const openMessage = useCallback(
    (m: OpenMessage) => {
      setOpen(m);
      setSent(new Set());
      partRefs.current = [];
      focusPart(0);
    },
    [focusPart],
  );

  const closeMessage = useCallback(() => {
    setOpen(null);
    if (hasFinePointer()) requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // A message sent here from elsewhere: a setlist row on the Songs tab, or ⌘K.
  useEffect(() => {
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a message handed over by the desk is the effect's whole job
    openMessage(pending);
    onPendingDone();
  }, [pending, openMessage, onPendingDone]);

  /** One part copies straight away; several open, to be sent in turn. */
  const pick = useCallback(
    (m: OpenMessage) => {
      if (m.parts.length === 1) void copyPart(m, 0);
      else openMessage(m);
    },
    [copyPart, openMessage],
  );

  const pickEntry = useCallback((entry: LibraryEntry) => pick(openMessageFor(entry)), [pick]);

  const pickRow = useCallback(
    (row: MessageRow) => {
      const m = openMessageFromRow(row, byId);
      if (m) pick(m);
    },
    [byId, pick],
  );

  const add = useCallback(
    async (m: OpenMessage) => {
      if (!setlist) return setStarting(m);
      const toast = addToast(await addItem({ kind: "message", id: m.id, title: m.label }), m.label, setlist.name);
      showToast(toast.text, toast.tone);
    },
    [setlist, addItem, showToast],
  );

  const addEntry = useCallback((entry: LibraryEntry) => void add(openMessageFor(entry)), [add]);

  async function copyOpenPart(i: number, advance: boolean) {
    if (!open) return;
    if (!(await copyPart(open, i))) return;
    setSent((prev) => new Set(prev).add(i));
    setFlash(i);
    window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 700);
    // Only advance on a keyboard send; a mouse user picked that part on purpose.
    focusPart(advance ? moveCursor(i, 1, open.parts.length) : i);
  }

  // Message-view keys. Safe on the document because the view renders no text field.
  useEffect(() => {
    if (!open) return;
    const count = open.parts.length;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target as HTMLElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return closeMessage();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return focusPart(moveCursor(cursor, e.key === "ArrowDown" ? 1 : -1, count));
      }
      const jump = digitToIndex(e.key, count);
      if (jump !== null) {
        e.preventDefault();
        void copyOpenPart(jump, false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (starting) {
    return (
      <StartSetlist
        what={starting.label}
        onCancel={() => setStarting(null)}
        onStart={async (name) => {
          const m = starting;
          setStarting(null);
          const result = await startSetlist(name, { kind: "message", id: m.id, title: m.label });
          showToast(result === "added" ? `Started ${name} with "${m.label}"` : addToast(result, m.label, name).text, result === "added" ? "ok" : "err");
        }}
      />
    );
  }

  if (open) {
    return (
      <MessageView
        label={open.label}
        parts={open.parts}
        edited={open.edited}
        sent={sent}
        cursor={cursor}
        flash={flash}
        addLabel={open.inService ? (setlist ? "+ Setlist" : "Start a setlist") : null}
        onCopy={(i, advance) => void copyOpenPart(i, advance)}
        onFocusPart={setCursor}
        onAdd={() => void add(open)}
        onBack={closeMessage}
        partRef={(i, el) => {
          partRefs.current[i] = el;
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {setlist && (
        <SetlistBar
          name={setlist.name}
          staleNote={staleNote(setlist.updatedAt, new Date())}
          rows={setlistRows}
          copied={copied}
          onOpen={onOpenSong}
          onMessage={pickRow}
        />
      )}
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setHit(0);
        }}
        onKeyDown={(e) => {
          if (!hits.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHit((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHit((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pickEntry(hits[Math.min(hit, hits.length - 1)]);
          }
        }}
        aria-label="Search messages"
        placeholder="Search messages — sound restored, sermon queen…"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-xl outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{library && `${library.messages.length} messages`}</span>
        <span className="flex shrink-0 gap-3">
          <Link href="/setlists" className="-my-1 py-1 underline hover:text-zinc-300">
            Setlists
          </Link>
          <Link href="/messages" className="-my-1 py-1 underline hover:text-zinc-300">
            Edit library
          </Link>
        </span>
      </div>
      {failed && (
        <p className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Couldn&rsquo;t load messages.
          <button onClick={onRetry} className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1 hover:bg-amber-500/10">
            Retry
          </button>
        </p>
      )}
      {!library && !failed && <p className="text-sm text-[var(--muted)]">Loading messages…</p>}
      {library && library.messages.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          The library is empty. <Link href="/messages" className="underline">Load the starter messages</Link> (admin PIN).
        </p>
      )}
      {library && deferredQ.trim() && hits.length === 0 && <p className="text-sm text-[var(--muted)]">No message has all of those words.</p>}
      {groups.length > 0 && (
        <MessageList
          groups={groups}
          active={deferredQ.trim() ? (hits[Math.min(hit, hits.length - 1)]?.message.id ?? null) : null}
          copied={copied}
          onPick={pickEntry}
          onAdd={addEntry}
          onHover={(id) => setHit(Math.max(0, hits.findIndex((h) => h.message.id === id)))}
        />
      )}
    </div>
  );
}
```

Nothing mounts this yet; Task 11 does.

- [ ] **Step 9: Run everything**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: tests PASS, no type errors, no lint errors. If lint flags `react-hooks/set-state-in-effect` on another line, add the same one-line disable comment the repo uses elsewhere (see `src/app/page.tsx`), with a reason.

- [ ] **Step 10: Commit**

```bash
git add src/lib/messageLibrary.ts src/lib/setlist.ts src/app/useMessages.ts src/app/useMessageCopy.ts src/app/useSetlist.ts src/app/StartSetlist.tsx src/app/MessagesTab.tsx src/app/SongsTab.tsx tests/messageLibrary.test.ts tests/setlist.test.ts
git commit -m "feat: Messages tab with search, part-by-part sending and adding to the setlist"
```

---
### Task 11: Wiring the desk — third tab, shared setlist, ⌘K

**Files:**
- Create: `src/lib/messageActions.ts`
- Modify: `src/app/page.tsx`, `src/app/SongsTab.tsx`
- Test: create `tests/messageActions.test.ts`

**Interfaces:**
- Consumes: `useSetlist`, `SetlistApi` (Task 7); `useMessages`, `useMessageCopy`, `MessagesTab`, `openMessageFromRow`, `openMessageFor`, `OpenMessage` (Task 10); `messagesById`, `libraryEntries`, `messageLabel` (Task 3); `Action` from `src/lib/shortcuts.ts`.
- Produces:
  ```ts
  // messageActions.ts
  export function messageActions(library: Library | null, run: (entry: LibraryEntry) => void): Action[];
  // SongsTab props become
  interface SongsTabProps {
    copyText; showToast; logSend;                  // unchanged
    setlistApi: SetlistApi;
    library: Library | null;
    copied: ReadonlySet<string>;
    onMessageRow: (row: MessageRow) => void;       // the desk copies or switches to Messages
    pendingSong: SongRow | null;                   // open this on arrival
    onPendingSongDone: () => void;
  }
  ```

- [ ] **Step 1: Write the failing palette test**

Create `tests/messageActions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { messageActions } from "../src/lib/messageActions";
import { filterActions } from "../src/lib/shortcuts";
import { library } from "./fixtures/library";

describe("messages in the command palette", () => {
  it("has none until the library has loaded", () => {
    expect(messageActions(null, () => {})).toEqual([]);
  });

  it("lists every message by its label, in service order, under Message", () => {
    const actions = messageActions(library, () => {});
    expect(actions.map((a) => a.title)).toEqual(["Apologies · Sound restored", "Welcoming Ambience Jewel · Sunday", "Welcoming Ambience Jewel · Sunday · Worship"]);
    expect(new Set(actions.map((a) => a.group))).toEqual(new Set(["Message"]));
  });

  it("finds a message by words from its text that are not in its title", () => {
    const found = filterActions(messageActions(library, () => {}), "for the interruption");
    expect(found.map((a) => a.title)).toEqual(["Apologies · Sound restored"]);
  });

  it("hands the chosen message back to the desk", () => {
    const picked: number[] = [];
    messageActions(library, (entry) => picked.push(entry.message.id))[0].run();
    expect(picked).toEqual([20]);
  });
});
```

Run: `npx vitest run tests/messageActions.test.ts`
Expected: FAIL — cannot resolve `../src/lib/messageActions`.

- [ ] **Step 2: Implement `src/lib/messageActions.ts`**

```ts
// Every library message as a ⌘K entry, so an apology is two keystrokes away
// from whichever tab the operator is on when the sound drops. The text is the
// keyword, because what the operator remembers is rarely the title.

import type { Action } from "./shortcuts";
import { libraryEntries, messageLabel, type Library, type LibraryEntry } from "./messageLibrary";

export function messageActions(library: Library | null, run: (entry: LibraryEntry) => void): Action[] {
  if (!library) return [];
  return libraryEntries(library).map((entry) => ({
    id: `message-${entry.message.id}`,
    title: messageLabel(entry.section, entry.message),
    group: "Message",
    keywords: [entry.message.parts.join(" ")],
    run: () => run(entry),
  }));
}
```

Run: `npx vitest run tests/messageActions.test.ts` — expected: PASS.

- [ ] **Step 3: The Songs tab takes the setlist and library from the desk**

In `src/app/SongsTab.tsx`:

- Change the imports: remove `import { useSetlist } from "./useSetlist";`, add `import { addToast, type SetlistApi } from "./useSetlist";` (merging with the Task 10 import), `import { messagesById, type Library } from "@/lib/messageLibrary";`, and add `type MessageRow, type SongRow` to the `@/lib/setlist` import.
- Replace `interface Props` with:

```ts
interface Props {
  copyText: (t: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
  /** Owned by the desk, so the Songs and Messages tabs show one setlist. */
  setlistApi: SetlistApi;
  library: Library | null;
  copied: ReadonlySet<string>;
  /** A message row in the bar: the desk copies it, or switches to Messages to send it in parts. */
  onMessageRow: (row: MessageRow) => void;
  /** A song row tapped on the Messages tab, to open on arrival. */
  pendingSong: SongRow | null;
  onPendingSongDone: () => void;
}
```

- Change the signature and first line to:

```ts
export default function SongsTab({ copyText, showToast, logSend, setlistApi, library, copied, onMessageRow, pendingSong, onPendingSongDone }: Props) {
  const [q, setQ] = useState("");
  const { setlist, addItem, startSetlist } = setlistApi;
```

- Change `setlistRows` to use the library:

```ts
  const libraryById = useMemo(() => messagesById(library), [library]);
  const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, byId, libraryById) : []), [setlist, byId, libraryById]);
```

- Change `openSetlistRow`'s parameter type to `SongRow`, and after its `useCallback` add:

```ts
  // A song row tapped on the Messages tab: the desk switched here to open it.
  useEffect(() => {
    if (!pendingSong) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a song handed over by the desk is the effect's whole job
    void openSetlistRow(pendingSong);
    onPendingSongDone();
  }, [pendingSong, openSetlistRow, onPendingSongDone]);
```

- In the `<SetlistBar … />` call, replace the Task 8 interim props with:

```tsx
              copied={copied}
              onMessage={onMessageRow}
```

- [ ] **Step 4: The desk**

In `src/app/page.tsx`:

Imports — add:

```ts
import MessagesTab from "./MessagesTab";
import { useSetlist } from "./useSetlist";
import { useMessages } from "./useMessages";
import { useMessageCopy } from "./useMessageCopy";
import { messageActions } from "@/lib/messageActions";
import { messagesById, openMessageFor, type LibraryEntry, type OpenMessage } from "@/lib/messageLibrary";
import { openMessageFromRow, type MessageRow, type SongRow } from "@/lib/setlist";
```

State — change the tab state and add, directly after it:

```ts
  const [tab, setTab] = useState<"verses" | "songs" | "messages">("verses");
```

and, after `logSend` is defined (they depend on `showToast` and `logSend`):

```ts
  // Owned here rather than in a tab: both tabs show the same setlist, and the
  // palette copies messages from any tab.
  const setlistApi = useSetlist();
  const { library, failed: libraryFailed, reload: reloadLibrary } = useMessages();
  const { copied, copyPart } = useMessageCopy({ copyText, showToast, logSend });
  const [pendingSong, setPendingSong] = useState<SongRow | null>(null);
  const [pendingMessage, setPendingMessage] = useState<OpenMessage | null>(null);
  const clearPendingSong = useCallback(() => setPendingSong(null), []);
  const clearPendingMessage = useCallback(() => setPendingMessage(null), []);

  /** One part copies where the operator is; several need the Messages tab to send in turn. */
  const sendMessage = useCallback(
    (m: OpenMessage) => {
      if (m.parts.length === 1) return void copyPart(m, 0);
      setPendingMessage(m);
      setTab("messages");
    },
    [copyPart],
  );

  const onMessageRow = useCallback(
    (row: MessageRow) => {
      const m = openMessageFromRow(row, messagesById(library));
      if (m) sendMessage(m);
    },
    [library, sendMessage],
  );

  const onPaletteMessage = useCallback((entry: LibraryEntry) => sendMessage(openMessageFor(entry)), [sendMessage]);
```

Palette — in the `actions` builder, after the `tab-songs` entry add:

```ts
    list.push({ id: "tab-messages", title: "Go to Messages", group: "Go to", keywords: ["apology", "greeting", "prayer", "announcement"], run: () => setTab("messages") });
    list.push({ id: "messages-edit", title: "Edit message library", group: "Go to", keywords: ["engagement", "document"], run: () => router.push("/messages") });
```

and just before `return list;` add:

```ts
    list.push(...messageActions(library, onPaletteMessage));
```

Guide — add a third group to `guide`:

```ts
    {
      group: "Sending a message",
      items: [
        { keys: "⌘K", label: "Find any message from any tab — Enter copies it" },
        { keys: "↑ ↓", label: "Pick a message in the search results" },
        { keys: "↵", label: "Copy it · a long one opens to send part by part" },
        { keys: "1–9", label: "Send that part" },
        { keys: "Esc", label: "Back to the library" },
      ],
    },
```

Nav — change the tab list and labels:

```tsx
        {(["verses", "songs", "messages"] as const).map((t) => (
```

```tsx
            {t === "verses" ? "📖 Verses" : t === "songs" ? "🎵 Songs" : "💬 Messages"}
```

Tabs — replace `{tab === "songs" && <SongsTab copyText={copyText} showToast={showToast} logSend={logSend} />}` with:

```tsx
      {tab === "songs" && (
        <SongsTab
          copyText={copyText}
          showToast={showToast}
          logSend={logSend}
          setlistApi={setlistApi}
          library={library}
          copied={copied}
          onMessageRow={onMessageRow}
          pendingSong={pendingSong}
          onPendingSongDone={clearPendingSong}
        />
      )}
      {tab === "messages" && (
        <MessagesTab
          library={library}
          failed={libraryFailed}
          onRetry={reloadLibrary}
          setlistApi={setlistApi}
          copied={copied}
          copyPart={copyPart}
          showToast={showToast}
          pending={pendingMessage}
          onPendingDone={clearPendingMessage}
          onOpenSong={(row) => {
            setPendingSong(row);
            setTab("songs");
          }}
        />
      )}
```

The verse keyboard handler already returns early when `tab !== "verses"`, so it needs no change.

- [ ] **Step 5: Run everything**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 6: Check it in the browser**

```bash
TURSO_DATABASE_URL=file:/tmp/lightdesk-desk-check.db npm run dev
```

Then `curl -s -XPOST localhost:3000/api/messages/seed` to load the starter library into the throwaway database. In the browser at `http://localhost:3000`:

1. **💬 Messages** tab lists Apologies first; typing `sound restored` narrows to that apology; Enter copies it and the toast says "Copied …".
2. Tapping **Confession · Full text** opens the part view; Enter copies part 1 and moves to part 2; `3` copies part 3; Esc returns.
3. `+` on **Welcoming Ambience Jewel · Sunday** with no setlist shows "Start a setlist"; starting it puts the message in the bar with no `+` on any Apologies row.
4. Switch to **🎵 Songs**: the same bar shows the message; tapping it copies and a ✓ appears on both tabs.
5. ⌘K, type `interruption`, Enter: copies the apology while on the Songs tab.
6. Open `/log`: the copies are there with kind `message` and labels like `Confession · Full text · part 2 of 7`.

Stop the server and `rm /tmp/lightdesk-desk-check.db`. Anything that does not behave as described is a bug in this task: fix it before committing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/messageActions.ts src/app/page.tsx src/app/SongsTab.tsx tests/messageActions.test.ts
git commit -m "feat: Messages tab on the desk, one shared setlist, every message in ⌘K"
```

---
### Task 12: Editing a message for one service

**Files:**
- Modify: `src/app/setlists/page.tsx`

**Interfaces:**
- Consumes: `useMessages` (Task 10); `messagesById`, `messageLabel` (Task 3); `withParts` (Task 8); `partsFromText`, `textFromParts` (Task 2); `itemKey` (Task 7).
- Produces: no new exports. The page sends the existing `PATCH /api/setlists/:id` with `items` and `updatedAt`.

The logic this page adds (`withParts`, `partsFromText`) is already unit-tested; this task is UI, verified in the browser.

- [ ] **Step 1: Load the library and track the item being edited**

In `src/app/setlists/page.tsx` add imports:

```ts
import { useMessages } from "../useMessages";
import { messageLabel, messagesById } from "@/lib/messageLibrary";
import { itemKey } from "@/lib/setlistEdit";
import { withParts } from "@/lib/setlist";
import { partsFromText, textFromParts } from "@/lib/messageEdit";
```

(`itemKey` is already imported from Task 7; merge rather than duplicate.) Inside the component, after the existing state:

```ts
  const { library } = useMessages();
  const byId = useMemo(() => messagesById(library), [library]);
  /** The message item whose text is being edited for its service: setlist id and item key. */
  const [editing, setEditing] = useState<{ setlistId: number; key: string; text: string } | null>(null);
```

(add `useMemo` to the `react` import).

- [ ] **Step 2: Replace the item row**

Replace the whole `{s.items.map((item, i) => ( <li …> … </li> ))}` block with:

```tsx
              {s.items.map((item, i) => {
                const entry = item.kind === "message" ? byId?.get(item.id) : undefined;
                const label = entry ? messageLabel(entry.section, entry.message) : item.title;
                const key = itemKey(item);
                const isEditing = editing?.setlistId === s.id && editing.key === key;
                return (
                  <li key={key} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-xs text-[var(--muted)]">{i + 1}</span>
                      <span className="shrink-0" aria-label={item.kind === "song" ? "Song" : "Message"}>
                        {item.kind === "song" ? "🎵" : "💬"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {label}
                        {item.kind === "message" && item.parts && (
                          <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
                        )}
                      </span>
                      {item.kind === "message" && !isEditing && (
                        <button
                          onClick={() => setEditing({ setlistId: s.id, key, text: textFromParts(item.parts ?? entry?.message.parts ?? []) })}
                          disabled={busy || (!item.parts && !entry)}
                          className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-30"
                        >
                          Edit for this service
                        </button>
                      )}
                      <button onClick={() => send(s.id, { items: moveItem(s.items, i, -1), updatedAt: s.updatedAt })} disabled={busy || i === 0} aria-label={`Move ${label} up`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                        ↑
                      </button>
                      <button onClick={() => send(s.id, { items: moveItem(s.items, i, 1), updatedAt: s.updatedAt })} disabled={busy || i === s.items.length - 1} aria-label={`Move ${label} down`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                        ↓
                      </button>
                      <button onClick={() => send(s.id, { items: s.items.filter((x) => itemKey(x) !== key), updatedAt: s.updatedAt })} disabled={busy} aria-label={`Remove ${label}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30">
                        ×
                      </button>
                    </div>
                    {isEditing && editing && (
                      <div className="mt-2 space-y-2 pl-7">
                        <textarea
                          autoFocus
                          value={editing.text}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                          aria-label={`Text of ${label} for this service`}
                          rows={6}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <p className="text-xs text-[var(--muted)]">Only this setlist changes. A blank line starts a new post. Once edited, fixes to the library no longer reach this item.</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              const parts = partsFromText(editing.text);
                              if (typeof parts === "string") return setError(parts);
                              setEditing(null);
                              void send(s.id, { items: withParts(s.items, i, parts), updatedAt: s.updatedAt });
                            }}
                            disabled={busy}
                            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
                          >
                            Save for this service
                          </button>
                          {item.kind === "message" && item.parts && entry && (
                            <button
                              onClick={() => {
                                setEditing(null);
                                void send(s.id, { items: withParts(s.items, i, undefined), updatedAt: s.updatedAt });
                              }}
                              disabled={busy}
                              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
                            >
                              Reset to library text
                            </button>
                          )}
                          <button onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
```

"Reset to library text" is only offered while the library still has the message — resetting a deleted message would leave a row with nothing to copy.

- [ ] **Step 3: Update the copy on the page**

- The intro paragraph becomes: "The active setlist is the one the operator sees at the top of the Songs and Messages tabs. Add songs and messages to it from there, with the + beside a search result or a message."
- The empty-setlist line becomes: "Nothing in it yet — add songs and messages from the desk."

- [ ] **Step 4: Check it in the browser**

With the dev server on a throwaway database (as in Task 11, seeded), add **Next Service · Midweek · Next Sunday, two services** to a setlist from the Messages tab, then open `/setlists`:

1. The item shows 💬 and its label.
2. **Edit for this service** opens the textarea with `[DATE]` in it; replace it with a date, **Save for this service**: the row shows *edited*.
3. Back on the desk, tapping the row copies the edited text (paste somewhere to check).
4. **Reset to library text** removes *edited*; the desk copies `[DATE]` again.
5. Empty the textarea and save: the amber error says "A message needs some text" and nothing is saved.

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc --noEmit -p . && npm run lint` — expected: clean.

```bash
git add src/app/setlists/page.tsx
git commit -m "feat: edit a message's text for one service from the setlist page"
```

---
### Task 13: The library editor

**Files:**
- Create: `src/app/messages/page.tsx`

**Interfaces:**
- Consumes: the Task 5 API; `groupLibrary`, `Library`, `LibraryMessage`, `LibrarySection` (Task 3); `longParts`, `partsFromText`, `textFromParts` (Task 2); `MAX_MESSAGE_CHARS` from `src/lib/format.ts`; `DeniedHint` from `src/app/SongEditor.tsx`.
- Produces: the `/messages` page. No exports besides the default component.

Every rule this page relies on is enforced and tested on the server (Tasks 2, 4). The page shows server errors as they come back.

- [ ] **Step 1: Write the page**

Create `src/app/messages/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DeniedHint } from "../SongEditor";
import { MAX_MESSAGE_CHARS } from "@/lib/format";
import { groupLibrary, type Library, type LibraryMessage, type LibrarySection } from "@/lib/messageLibrary";
import { longParts, partsFromText, textFromParts } from "@/lib/messageEdit";

type Draft = { id: number | "new"; sectionId: number; title: string; text: string };

/**
 * The engagement document, kept here instead of in a Google Doc. Admin only:
 * it changes the text every operator copies. Separate from the desk for the
 * same reason /setlists is — it is prepared ahead, not used mid-service.
 */
export default function MessagesPage() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  /** "section:3" or "message:12" whose Delete has been armed; a second press does it. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (!res.ok) return setError("Could not load the library");
    setLibrary((await res.json()) as Library);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every write: send, show the server's refusal if any, reload. True when it saved. */
  async function write(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 403) {
        setDenied(true);
        return false;
      }
      if (!res.ok) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not save");
        return false;
      }
      setDenied(false);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const ok =
      draft.id === "new"
        ? await write("/api/messages", "POST", { sectionId: draft.sectionId, title: draft.title, text: draft.text })
        : await write(`/api/messages/${draft.id}`, "PATCH", { sectionId: draft.sectionId, title: draft.title, text: draft.text });
    if (ok) setDraft(null);
  }

  const duplicate = (m: LibraryMessage) =>
    write("/api/messages", "POST", { sectionId: m.sectionId, title: `${m.title.slice(0, 113)} (copy)`, text: textFromParts(m.parts) });

  const draftParts = draft ? partsFromText(draft.text) : [];
  const warnings = Array.isArray(draftParts) ? longParts(draftParts, MAX_MESSAGE_CHARS) : [];

  function editor(sections: LibrarySection[]) {
    if (!draft) return null;
    return (
      <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label="Message title"
            placeholder="Title — e.g. Sunday · Worship, or the pastor's name"
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <select
            value={draft.sectionId}
            onChange={(e) => setDraft({ ...draft, sectionId: Number(e.target.value) })}
            aria-label="Section"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          aria-label="Message text"
          placeholder="The text exactly as it is posted. A blank line starts a new post."
          rows={8}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <p className="text-xs text-[var(--muted)]">
          {Array.isArray(draftParts) ? `${draftParts.length} post${draftParts.length === 1 ? "" : "s"}` : draftParts}
        </p>
        {warnings.map((i) => (
          <p key={i} className="text-xs text-amber-400">
            Post {i + 1} is over {MAX_MESSAGE_CHARS} characters — Mixlr may cut this. Split it with a blank line.
          </p>
        ))}
        <div className="flex gap-2">
          <button onClick={saveDraft} disabled={busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
            Save
          </button>
          <button onClick={() => setDraft(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const groups = library ? groupLibrary(library) : [];
  const sections = groups.map((g) => g.section);
  const small = "rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-30";
  const square = "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Message library</h1>
        <Link href="/" className="text-sm text-[var(--muted)] underline hover:text-zinc-300">
          ← Back to the desk
        </Link>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Everything the operator posts that is not a verse or a song. Sections that can go in a setlist show a + on the desk; switch that off for
        sections like Apologies, which happen whenever they happen.
      </p>

      {denied && <DeniedHint />}
      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}
      {!library && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {library && library.sections.length === 0 && library.messages.length === 0 && (
        <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
          <p className="text-sm">The library is empty. Load the starter messages taken from the engagement document?</p>
          <button onClick={() => write("/api/messages/seed", "POST")} disabled={busy} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
            Load starter messages
          </button>
        </div>
      )}

      {groups.map(({ section, messages }, si) => (
        <section key={section.id} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={section.name}
              defaultValue={section.name}
              onBlur={(e) => e.target.value.trim() !== section.name && write(`/api/message-sections/${section.id}`, "PATCH", { name: e.target.value })}
              aria-label={`Name of ${section.name}`}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={section.inService}
                onChange={(e) => write(`/api/message-sections/${section.id}`, "PATCH", { inService: e.target.checked })}
                disabled={busy}
              />
              Can go in a setlist
            </label>
            <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: -1 })} disabled={busy || si === 0} aria-label={`Move ${section.name} up`} className={square}>
              ↑
            </button>
            <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: 1 })} disabled={busy || si === groups.length - 1} aria-label={`Move ${section.name} down`} className={square}>
              ↓
            </button>
            <button
              onClick={() => (confirming === `section:${section.id}` ? write(`/api/message-sections/${section.id}`, "DELETE") : setConfirming(`section:${section.id}`))}
              disabled={busy || messages.length > 0}
              title={messages.length > 0 ? "Move or delete its messages first" : undefined}
              className={small}
            >
              {confirming === `section:${section.id}` ? "Sure?" : "Delete"}
            </button>
          </div>

          <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {messages.map((m, mi) => (
              <li key={m.id} className="space-y-2 px-2 py-2">
                {draft?.id === m.id ? (
                  editor(sections)
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {m.parts.length > 1 ? `${m.parts.length} posts · ` : ""}
                        {m.parts[0]}
                      </span>
                    </span>
                    <button onClick={() => setDraft({ id: m.id, sectionId: m.sectionId, title: m.title, text: textFromParts(m.parts) })} disabled={busy} className={small}>
                      Edit
                    </button>
                    <button onClick={() => duplicate(m)} disabled={busy} className={small}>
                      Duplicate
                    </button>
                    <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: -1 })} disabled={busy || mi === 0} aria-label={`Move ${m.title} up`} className={square}>
                      ↑
                    </button>
                    <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: 1 })} disabled={busy || mi === messages.length - 1} aria-label={`Move ${m.title} down`} className={square}>
                      ↓
                    </button>
                    <button
                      onClick={() => (confirming === `message:${m.id}` ? write(`/api/messages/${m.id}`, "DELETE") : setConfirming(`message:${m.id}`))}
                      disabled={busy}
                      className={small}
                    >
                      {confirming === `message:${m.id}` ? "Sure?" : "Delete"}
                    </button>
                  </div>
                )}
              </li>
            ))}
            <li className="px-2 py-2">
              {draft?.id === "new" && draft.sectionId === section.id ? (
                editor(sections)
              ) : (
                <button onClick={() => setDraft({ id: "new", sectionId: section.id, title: "", text: "" })} disabled={busy} className="text-sm text-[var(--muted)] underline hover:text-zinc-300">
                  + Add a message to {section.name}
                </button>
              )}
            </li>
          </ol>
        </section>
      ))}

      {library && (
        <div className="flex gap-2">
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            aria-label="New section name"
            placeholder="New section — e.g. Baby Dedication"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={async () => {
              if (newSection.trim() && (await write("/api/message-sections", "POST", { name: newSection }))) setNewSection("");
            }}
            disabled={busy || !newSection.trim()}
            className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            Add section
          </button>
        </div>
      )}
    </main>
  );
}
```

The section name input is keyed by `section.name` so that a rename that the server refuses (a duplicate) snaps back to the saved name when the library reloads.

- [ ] **Step 2: Check it in the browser**

On a throwaway database (`TURSO_DATABASE_URL=file:/tmp/lightdesk-editor-check.db npm run dev`), open `http://localhost:3000/messages`:

1. The empty library offers **Load starter messages**; pressing it fills the page, Apologies first.
2. **Duplicate** on *Prayer Before Sermon · Pastor Queen Okoye* adds "Pastor Queen Okoye (copy)" at the end; **Edit** it to another name and text; **Save**.
3. Paste a 1,200-character paragraph into a message: the amber "Mixlr may cut this" note appears; Save still works.
4. ↑/↓ reorder messages within a section and sections on the page; a reload keeps the order.
5. Rename a section to another section's name in different case: the error "There is already a section called …" shows and the name snaps back.
6. **Delete** on a section with messages is disabled; on an empty section it asks "Sure?" and then removes it.
7. Untick **Can go in a setlist** on *Welcoming Ambience Jewel*: on the desk its `+` disappears, but a message from it already in the active setlist still copies.
8. With `ADMIN_PIN=1234 CHURCH_PIN=0000` in the environment and the church PIN entered, any write shows the admin PIN hint.

Stop the server and `rm /tmp/lightdesk-editor-check.db`.

- [ ] **Step 3: Type-check, lint, commit**

Run: `npx tsc --noEmit -p . && npm run lint` — expected: clean.

```bash
git add src/app/messages/page.tsx
git commit -m "feat: message library editor with starter messages"
```

---

### Task 14: Documentation and the full check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

In `README.md`:

- The milestone line becomes: `Milestone 1: verses. Milestone 2: the message library (the engagement document). Milestone 3: songbook and setlists.`
- Under **How it works**, add a bullet after **Log**:

  `- **Messages**: the engagement document — greetings, prayer introductions, the confession, account details, next-service lines, apologies — lives in the 💬 Messages tab and in ⌘K. A one-post message copies on tap; a long one (the confession) sends part by part like a song. Service-order messages go into a setlist beside songs, and a setlist can carry its own text for one service (the date in a next-service line). The library is edited at \`/messages\` with the admin PIN; an empty library offers **Load starter messages**, seeded from \`src/data/messages.seed.json\`.`

- Under **Layout**, replace `src/db/schema.ts          verse_cache, sent_log, messages (M2)` with:

  ```
  src/db/schema.ts          verse_cache, sent_log, songs, message_sections, messages, setlists
  src/app/messages/page.tsx the message library editor (admin)
  src/lib/messageEdit.ts    what a message may hold; messageSearch.ts, messageLibrary.ts beside it
  ```

- Under **Still to do**, delete the line `- M2: import the Google Doc into \`messages\`, build the runsheet screen.`

- [ ] **Step 2: Run the whole suite, lint and a production build**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds. The build is the check that no route file exports anything Next does not allow.

- [ ] **Step 3: Confirm nothing private is staged**

Run: `git status --short`
Expected: only `README.md` modified; the untracked `docs/CLC ONLINE SERVICE ENGAGEMENT DOCUMENT.txt`, `docs/CLC_Engagement_ReStructured.docx` and `docs/IMG_*.heic` are still untracked and not staged.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: the message library in the README"
```

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch to decide how `message-library` is integrated.
