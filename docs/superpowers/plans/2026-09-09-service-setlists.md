# Service Setlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the media lead prepare a named, ordered list of songs before a service so the operator taps a row instead of searching the songbook live.

**Architecture:** One new `setlists` table holding a JSON array of `{ id, title }` items, with a partial unique index making "at most one active setlist" a database invariant. Four new routes under `/api/setlists` plus a `GET` on the existing song route. In the UI, a `SetlistBar` at the top of the Songs tab opens songs through the same `openSong` a search hit uses, and a separate `/setlists` page does the preparing. All non-trivial logic lives in two pure modules (`src/lib/setlistEdit.ts`, `src/lib/setlist.ts`) that test without a DOM or a database.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19, drizzle-orm over `@libsql/client` (local SQLite file in dev, Turso in production), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-service-setlists-design.md`

## Global Constraints

- **Read the Next.js docs before writing route or page code.** `AGENTS.md` requires it: this is not the Next.js in your training data. The relevant files are `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- **Route params are a promise.** Signature is `{ params }: { params: Promise<{ id: string }> }`, and you must `await params`. The existing `src/app/api/songs/[id]/route.ts` shows the house style.
- **Every route that touches the database** sets `export const runtime = "nodejs"` and calls `await ensureSchema()` before its first query.
- **No migration files.** Schema changes go in *both* `src/db/schema.ts` (drizzle, for queries) and `SCHEMA_SQL` in `src/db/schemaSql.ts` (raw DDL, run by `ensureSchema()` on boot and by the backup/restore scripts).
- **The word is "setlist"** — in the UI copy, the table name, the file names, the function names. Never "set", never "pin". **"Pin" is already taken** in this app: it pins one *section* of the open song so `C` re-sends it. Do not reuse that word or that icon.
- **Permissions: church PIN, not admin.** Every setlist route is available to any unlocked user. Do not copy the `admin()` gate from `PATCH`/`DELETE` in `src/app/api/songs/[id]/route.ts`.
- **Validation limits, verbatim:** name 1–80 characters; at most 50 items; each item title trimmed to at most 200 characters; item ids are positive integers, deduplicated keeping the first occurrence.
- **Staleness threshold:** 3 days.
- **Tests are vitest, run with `npm test`.** Component tests use `renderToStaticMarkup` from `react-dom/server` — there is no React Testing Library in this repo. Follow `tests/songList.test.tsx`.
- **Styling** is Tailwind v4 with the existing dark palette: `bg-zinc-900/60`, `border-zinc-800`, `var(--accent)`, `var(--muted)`. Touch targets are at least `min-h-11`.
- **Commit after every task**, with the message given in the task's final step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/setlistEdit.ts` | What a setlist is allowed to be. Pure request-body validation, mirroring `songEdit.ts`. |
| `src/lib/setlist.ts` | Turning a stored setlist into rows: resolving ids against the book, staleness, reordering, the default name. Pure. |
| `src/db/setlists.ts` | The only place setlist rows are read and written. Mirrors `src/db/songs.ts`. |
| `src/app/api/setlists/route.ts` | `GET` all, `POST` create. |
| `src/app/api/setlists/[id]/route.ts` | `PATCH`, `DELETE`. |
| `src/app/SetlistBar.tsx` | The operator's view: the active setlist at the top of the Songs tab. Presentational. |
| `src/app/useSetlist.ts` | Fetching the active setlist and adding a song to it, including the 409 retry. |
| `src/app/setlists/page.tsx` | The builder: create, rename, activate, reorder, remove, delete. |
| `tests/setlistEdit.test.ts`, `tests/setlist.test.ts`, `tests/setlistBar.test.tsx` | New tests. |

**Modified:**

| File | Change |
|---|---|
| `src/db/schema.ts` | Add the `setlists` table. |
| `src/db/schemaSql.ts` | Add the `setlists` DDL and its partial unique index to `SCHEMA_SQL`. |
| `src/app/api/songs/[id]/route.ts` | Add `GET`, church-PIN, alongside the existing admin-only `PATCH`/`DELETE`. |
| `src/app/SongsTab.tsx` | Mount `SetlistBar`, add the `+` button to search-result rows, `+ Setlist` to the song header, the "Start a setlist" panel, and a link to `/setlists`. |
| `tests/schema.test.ts` | Cover the new table and prove the one-active invariant. |

`SongsTab.tsx` is already 447 lines, which is why the bar, the hook and the builder page are their own files rather than more state in the tab.

---

### Task 1: The `setlists` table

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/schemaSql.ts:15-40` (the `SCHEMA_SQL` template literal)
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: `applySchema(client)` from `src/db/schemaSql.ts` (existing).
- Produces: drizzle table `setlists` with columns `id, name, items, active, createdAt, updatedAt`, exported from `src/db/schema.ts`. Raw table `setlists` and index `setlists_one_active` created by `applySchema`.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema.test.ts` (the file already has the `client` / `dir` fixtures and the `columnName` helper at the top — reuse them, do not redeclare):

```ts
describe("the setlists table", () => {
  const insertActive = (name: string, active: number) =>
    client.execute({
      sql: "INSERT INTO setlists (name, items, active, created_at, updated_at) VALUES (?,?,?,?,?)",
      args: [name, "[]", active, 1, 1],
    });

  it("is created with every column", async () => {
    await applySchema(client);
    const cols = (await client.execute("PRAGMA table_info(setlists)")).rows.map((r) => columnName(r.name));
    expect(cols).toEqual(["id", "name", "items", "active", "created_at", "updated_at"]);
  });

  it("refuses a second active setlist, so one-active is the database's rule and not the caller's", async () => {
    await applySchema(client);
    await insertActive("Sunday 1st service", 1);
    await expect(insertActive("Sunday 2nd service", 1)).rejects.toThrow(/UNIQUE/i);
  });

  it("allows any number of setlists that are not active", async () => {
    await applySchema(client);
    await insertActive("Last Sunday", 0);
    await insertActive("The Sunday before", 0);
    await insertActive("Rehearsal", 0);
    expect((await client.execute("SELECT count(*) AS n FROM setlists")).rows[0].n).toBe(3);
  });

  it("appears in a database made before setlists existed", async () => {
    await client.executeMultiple(`CREATE TABLE songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`);
    await applySchema(client);
    await insertActive("Sunday", 1);
    expect((await client.execute("SELECT name FROM setlists")).rows[0].name).toBe("Sunday");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `SQLITE_ERROR: no such table: setlists`.

- [ ] **Step 3: Add the DDL**

In `src/db/schemaSql.ts`, inside the `SCHEMA_SQL` template literal, after the `messages` table:

```sql
  CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, items TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS setlists_one_active ON setlists (active) WHERE active = 1;
```

Leave `ADDED_COLUMNS` alone — this is a whole new table, so `CREATE TABLE IF NOT EXISTS` covers both new and existing databases.

- [ ] **Step 4: Add the drizzle table**

Append to `src/db/schema.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests and the typechecker**

Run: `npx vitest run tests/schema.test.ts && npx tsc --noEmit`
Expected: 4 new tests PASS, the existing ones still pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/schemaSql.ts tests/schema.test.ts
git commit -m "feat: add the setlists table, with one-active as a database invariant"
```

---

### Task 2: Validating a setlist

**Files:**
- Create: `src/lib/setlistEdit.ts`
- Test: `tests/setlistEdit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SetlistItem { id: number; title: string }`
  - `interface SetlistCreate { name: string }`
  - `interface SetlistPatch { name?: string; items?: SetlistItem[]; active?: boolean; updatedAt?: string }`
  - `parseSetlistCreate(body: unknown): SetlistCreate | string`
  - `parseSetlistPatch(body: unknown): SetlistPatch | string`
  - `const MAX_ITEMS = 50`

Both parsers return the parsed object on success and the message to show the operator on failure — the same convention as `parseSongEdit` in `src/lib/songEdit.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/setlistEdit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSetlistCreate, parseSetlistPatch, MAX_ITEMS } from "../src/lib/setlistEdit";

const created = (body: unknown) => {
  const r = parseSetlistCreate(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};
const patched = (body: unknown) => {
  const r = parseSetlistPatch(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};
const song = (id: number, title = `Song ${id}`) => ({ id, title });

describe("naming a setlist", () => {
  it("trims it and collapses it to one line", () => {
    expect(created({ name: "  Sunday 14 Sept\n1st service " }).name).toBe("Sunday 14 Sept 1st service");
  });

  it("refuses a blank name", () => {
    expect(parseSetlistCreate({ name: "   " })).toMatch(/name/i);
    expect(parseSetlistCreate({})).toMatch(/name/i);
    expect(parseSetlistCreate(null)).toMatch(/name/i);
  });

  it("refuses a name past 80 characters", () => {
    expect(created({ name: "a".repeat(80) }).name.length).toBe(80);
    expect(parseSetlistCreate({ name: "a".repeat(81) })).toMatch(/name/i);
  });
});

describe("changing a setlist", () => {
  it("takes songs, with the setlist the client last read", () => {
    const p = patched({ items: [song(3), song(9)], updatedAt: "2026-09-09T10:00:00.000Z" });
    expect(p.items).toEqual([song(3), song(9)]);
    expect(p.updatedAt).toBe("2026-09-09T10:00:00.000Z");
  });

  it("refuses songs without it, since a blind overwrite would silently drop someone's addition", () => {
    expect(parseSetlistPatch({ items: [song(3)] })).toMatch(/last read/i);
    expect(parseSetlistPatch({ items: [song(3)], updatedAt: "" })).toMatch(/last read/i);
  });

  it("does not ask for it to rename or activate, which cannot lose anyone's work", () => {
    expect(patched({ name: "Rehearsal" })).toEqual({ name: "Rehearsal" });
    expect(patched({ active: true })).toEqual({ active: true });
  });

  it("keeps the first of a repeated song rather than listing it twice", () => {
    const p = patched({ items: [song(3, "Way Maker"), song(9), song(3, "Way Maker (2)")], updatedAt: "t" });
    expect(p.items).toEqual([song(3, "Way Maker"), song(9)]);
  });

  it("trims a cached title and cuts it at 200 characters", () => {
    const p = patched({ items: [{ id: 1, title: `  ${"x".repeat(300)}  ` }], updatedAt: "t" });
    expect(p.items?.[0].title.length).toBe(200);
  });

  it("refuses a song that is not an id and a title", () => {
    for (const bad of [[{ id: 0, title: "T" }], [{ id: 1.5, title: "T" }], [{ id: "1", title: "T" }], [{ id: 1 }], [{ id: 1, title: "  " }], ["Way Maker"], "nope"]) {
      expect(parseSetlistPatch({ items: bad, updatedAt: "t" })).toMatch(/song/i);
    }
  });

  it(`refuses more than ${MAX_ITEMS} songs`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => song(i + 1));
    expect(patched({ items: many(MAX_ITEMS), updatedAt: "t" }).items).toHaveLength(MAX_ITEMS);
    expect(parseSetlistPatch({ items: many(MAX_ITEMS + 1), updatedAt: "t" })).toMatch(/at most/i);
  });

  it("refuses a change that changes nothing", () => {
    expect(parseSetlistPatch({})).toMatch(/nothing/i);
    expect(parseSetlistPatch(null)).toMatch(/nothing/i);
    expect(parseSetlistPatch({ active: "yes" })).toMatch(/true or false/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/setlistEdit.test.ts`
Expected: FAIL — cannot resolve `../src/lib/setlistEdit`.

- [ ] **Step 3: Write the module**

Create `src/lib/setlistEdit.ts`:

```ts
// What a setlist is allowed to be. Pure, so the routes stay thin and the rules
// live in exactly one place. Same convention as songEdit.ts: the parsed value
// on success, the message to show the operator on failure.

export interface SetlistItem {
  /** The song's row id. This is the reference; lyrics are always read live. */
  id: number;
  /** A cached label so the list can paint before the songbook has loaded. */
  title: string;
}

export interface SetlistCreate {
  name: string;
}

export interface SetlistPatch {
  name?: string;
  items?: SetlistItem[];
  active?: boolean;
  /** Sent with `items` only: the row's updatedAt as the client last read it. */
  updatedAt?: string;
}

export const MAX_ITEMS = 50;
const MAX_NAME = 80;
const MAX_TITLE = 200;

const NAME_ERROR = `A setlist needs a name of 1 to ${MAX_NAME} characters`;
const ITEM_ERROR = "Every song in a setlist needs an id and a title";

/** One line, trimmed. Null when there is nothing usable there. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= MAX_NAME ? name : null;
}

/** The songs, deduplicated by id keeping the first, or the message to show. */
function cleanItems(value: unknown): SetlistItem[] | string {
  if (!Array.isArray(value)) return ITEM_ERROR;
  const seen = new Set<number>();
  const items: SetlistItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return ITEM_ERROR;
    const { id, title } = raw as { id?: unknown; title?: unknown };
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return ITEM_ERROR;
    if (typeof title !== "string" || !title.trim()) return ITEM_ERROR;
    if (seen.has(id)) continue;
    seen.add(id);
    // Truncated rather than refused: it is only a cached label, and the live
    // title replaces it as soon as the songbook has loaded.
    items.push({ id, title: title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) });
  }
  return items.length > MAX_ITEMS ? `A setlist holds at most ${MAX_ITEMS} songs` : items;
}

export function parseSetlistCreate(body: unknown): SetlistCreate | string {
  if (typeof body !== "object" || body === null) return NAME_ERROR;
  const name = cleanName("name" in body ? body.name : undefined);
  return name === null ? NAME_ERROR : { name };
}

export function parseSetlistPatch(body: unknown): SetlistPatch | string {
  if (typeof body !== "object" || body === null) return "Nothing to change";
  const patch: SetlistPatch = {};

  if ("name" in body && body.name !== undefined) {
    const name = cleanName(body.name);
    if (name === null) return NAME_ERROR;
    patch.name = name;
  }

  if ("items" in body && body.items !== undefined) {
    const items = cleanItems(body.items);
    if (typeof items === "string") return items;
    // The whole array is replaced, so without knowing which version the client
    // started from, two people preparing at once lose each other's additions
    // with nothing to show for it.
    const updatedAt = "updatedAt" in body ? body.updatedAt : undefined;
    if (typeof updatedAt !== "string" || !updatedAt) return "Changing the songs needs the setlist you last read";
    patch.items = items;
    patch.updatedAt = updatedAt;
  }

  if ("active" in body && body.active !== undefined) {
    if (typeof body.active !== "boolean") return "Active is true or false";
    patch.active = body.active;
  }

  return Object.keys(patch).length ? patch : "Nothing to change";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/setlistEdit.test.ts`
Expected: PASS, all of them.

- [ ] **Step 5: Commit**

```bash
git add src/lib/setlistEdit.ts tests/setlistEdit.test.ts
git commit -m "feat: validate setlist bodies"
```

---

### Task 3: Resolving a setlist against the songbook

**Files:**
- Create: `src/lib/setlist.ts`
- Test: `tests/setlist.test.ts`

**Interfaces:**
- Consumes: `SetlistItem` from `src/lib/setlistEdit.ts`; `IndexedSong` and `SearchableSong` types from `src/lib/songSearch.ts`.
- Produces:
  - `interface SetlistRow { id: number; title: string; author: string | null; song: SearchableSong | null; missing: boolean }`
  - `songsById(book: IndexedSong[] | null): Map<number, SearchableSong> | null`
  - `resolveSetlist(items: SetlistItem[], byId: Map<number, SearchableSong> | null): SetlistRow[]`
  - `ageInDays(updatedAt: string, now: Date): number`
  - `staleNote(updatedAt: string, now: Date): string | null`
  - `moveItem<T>(items: T[], from: number, delta: number): T[]`
  - `comingSundayName(now: Date): string`
  - `const STALE_AFTER_DAYS = 3`

- [ ] **Step 1: Write the failing test**

Create `tests/setlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildIndex, type SearchableSong } from "../src/lib/songSearch";
import { ageInDays, comingSundayName, moveItem, resolveSetlist, songsById, staleNote, STALE_AFTER_DAYS } from "../src/lib/setlist";

const song = (id: number, title: string, author: string | null = null): SearchableSong => ({ id, guid: `g${id}`, title, author, sections: ["la la"] });
const book = buildIndex([song(1, "Way Maker", "Sinach"), song(2, "Oceans")]);

describe("resolving a setlist against the book", () => {
  it("shows the live title, not the one cached when the song was added", () => {
    const rows = resolveSetlist([{ id: 1, title: "Waymaker" }], songsById(book));
    expect(rows[0].title).toBe("Way Maker");
    expect(rows[0].author).toBe("Sinach");
    expect(rows[0].song).not.toBe(null);
    expect(rows[0].missing).toBe(false);
  });

  it("falls back to the cached title while the book is still loading, and calls nothing missing yet", () => {
    const rows = resolveSetlist([{ id: 1, title: "Waymaker" }], songsById(null));
    expect(rows[0].title).toBe("Waymaker");
    expect(rows[0].song).toBe(null);
    expect(rows[0].missing).toBe(false);
  });

  it("marks a song deleted from the book as missing rather than dropping the row", () => {
    const rows = resolveSetlist([{ id: 1, title: "Way Maker" }, { id: 99, title: "Deleted One" }], songsById(book));
    expect(rows).toHaveLength(2);
    expect(rows[1].missing).toBe(true);
    expect(rows[1].title).toBe("Deleted One");
  });

  it("keeps the order the setlist was prepared in", () => {
    const rows = resolveSetlist([{ id: 2, title: "Oceans" }, { id: 1, title: "Way Maker" }], songsById(book));
    expect(rows.map((r) => r.title)).toEqual(["Oceans", "Way Maker"]);
  });
});

describe("telling the operator a setlist is stale", () => {
  const now = new Date("2026-09-14T09:00:00.000Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("counts whole days since it was last touched", () => {
    expect(ageInDays(daysAgo(0), now)).toBe(0);
    expect(ageInDays(daysAgo(8), now)).toBe(8);
  });

  it("reads a clock that runs backwards as no age at all", () => {
    expect(ageInDays(new Date(now.getTime() + 86_400_000).toISOString(), now)).toBe(0);
  });

  it(`says nothing until ${STALE_AFTER_DAYS} days, then says how old it is`, () => {
    expect(staleNote(daysAgo(STALE_AFTER_DAYS - 1), now)).toBe(null);
    expect(staleNote(daysAgo(STALE_AFTER_DAYS), now)).toBe(`${STALE_AFTER_DAYS} days old`);
    expect(staleNote(daysAgo(8), now)).toBe("8 days old");
  });
});

describe("reordering", () => {
  it("moves a song one place", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("does nothing at either end, so the buttons are never a trap", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 7, 1)).toEqual(items);
  });
});

describe("naming a new setlist", () => {
  it("suggests the coming Sunday", () => {
    expect(comingSundayName(new Date("2026-09-09T12:00:00"))).toBe("Sunday 13 Sep");
  });

  it("suggests today when today is Sunday", () => {
    expect(comingSundayName(new Date("2026-09-13T12:00:00"))).toBe("Sunday 13 Sep");
  });

  it("crosses a month end", () => {
    expect(comingSundayName(new Date("2026-09-28T12:00:00"))).toBe("Sunday 4 Oct");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/setlist.test.ts`
Expected: FAIL — cannot resolve `../src/lib/setlist`.

- [ ] **Step 3: Write the module**

Create `src/lib/setlist.ts`:

```ts
// Turning a stored setlist into rows the operator can act on.
//
// A stored item is `{ id, title }`. The id is the truth — lyrics are always read
// from the live song, so a typo fixed on Saturday reaches the operator on
// Sunday. The cached title exists only so the list can paint before the 323KB
// songbook has landed, which on venue wifi is exactly when the operator needs
// it. Once the book is here the live title wins, and an id the book does not
// have is a song deleted since the setlist was prepared.

import type { IndexedSong, SearchableSong } from "./songSearch";
import type { SetlistItem } from "./setlistEdit";

export interface SetlistRow {
  id: number;
  title: string;
  author: string | null;
  /** The song to open. Null while the book is loading, and for a deleted song. */
  song: SearchableSong | null;
  /** True only once the book has loaded and this id is not in it. */
  missing: boolean;
}

/** Song lookup for the rows, or null while the book is still loading. */
export function songsById(book: IndexedSong[] | null): Map<number, SearchableSong> | null {
  if (!book) return null;
  const byId = new Map<number, SearchableSong>();
  for (const { song } of book) if (song.id !== undefined) byId.set(song.id, song);
  return byId;
}

export function resolveSetlist(items: SetlistItem[], byId: Map<number, SearchableSong> | null): SetlistRow[] {
  return items.map((item) => {
    const song = byId?.get(item.id) ?? null;
    return {
      id: item.id,
      title: song?.title ?? item.title,
      author: song?.author ?? null,
      song,
      // Not knowing yet is not the same as knowing it is gone.
      missing: byId !== null && song === null,
    };
  });
}

export const STALE_AFTER_DAYS = 3;
const DAY = 86_400_000;

/** Whole days since the setlist was last touched. A clock skewed forward reads as 0. */
export function ageInDays(updatedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(updatedAt).getTime()) / DAY));
}

/** The note beside the name warning that this is last week's list, or null. */
export function staleNote(updatedAt: string, now: Date): string | null {
  const days = ageInDays(updatedAt, now);
  return days >= STALE_AFTER_DAYS ? `${days} days old` : null;
}

/** Move one song by `delta`. Out of range is a no-op, so the end buttons are safe. */
export function moveItem<T>(items: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The default name for a new setlist: the coming Sunday, or today if it is Sunday. */
export function comingSundayName(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `Sunday ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/setlist.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/setlist.ts tests/setlist.test.ts
git commit -m "feat: resolve a setlist against the songbook"
```

---

### Task 4: Reading and creating setlists

**Files:**
- Create: `src/db/setlists.ts`
- Create: `src/app/api/setlists/route.ts`
- Verify: `curl` against `npm run dev`

**Interfaces:**
- Consumes: `db`, `ensureSchema` from `src/db/index.ts`; `setlists` from `src/db/schema.ts`; `SetlistItem`, `parseSetlistCreate` from `src/lib/setlistEdit.ts`.
- Produces:
  - `interface SetlistRecord { id: number; name: string; items: SetlistItem[]; active: boolean; createdAt: string; updatedAt: string }` — dates are ISO strings, because this is the shape that goes over the wire
  - `loadSetlists(): Promise<SetlistRecord[]>`
  - `createSetlist(name: string): Promise<SetlistRecord>`
  - `GET /api/setlists` → `{ setlists: SetlistRecord[] }`, `created_at` descending
  - `POST /api/setlists` `{ name }` → `{ ok: true, setlist: SetlistRecord }`

- [ ] **Step 1: Read the route-handler docs**

Run: `sed -n '1,140p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

`AGENTS.md` requires this before writing route code — the conventions in this version differ from older Next.js.

- [ ] **Step 2: Write the data access module**

Create `src/db/setlists.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { setlists } from "./schema";
import type { SetlistItem } from "@/lib/setlistEdit";

/**
 * A setlist as it goes over the wire. Timestamps are ISO strings rather than
 * Dates because `updatedAt` is round-tripped by the client as the version it
 * last read, and JSON has no date type to round-trip through.
 */
export interface SetlistRecord {
  id: number;
  name: string;
  items: SetlistItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = { id: number; name: string; items: string; active: boolean; createdAt: Date; updatedAt: Date };

/** One shape for a setlist, so the routes cannot drift apart on what one is. */
function toRecord(row: Row): SetlistRecord {
  return {
    id: row.id,
    name: row.name,
    items: JSON.parse(row.items) as SetlistItem[],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Newest first: the one you are about to use is the one you just made. */
export async function loadSetlists(): Promise<SetlistRecord[]> {
  const rows = await db.select().from(setlists).orderBy(desc(setlists.createdAt));
  return rows.map(toRecord);
}

export async function findSetlist(id: number): Promise<SetlistRecord | null> {
  const [row] = await db.select().from(setlists).where(eq(setlists.id, id));
  return row ? toRecord(row) : null;
}

/** Created empty and inactive; activating is a separate, deliberate decision. */
export async function createSetlist(name: string): Promise<SetlistRecord> {
  const now = new Date();
  const [row] = await db
    .insert(setlists)
    .values({ name, items: "[]", active: false, createdAt: now, updatedAt: now })
    .returning();
  return toRecord(row);
}
```

- [ ] **Step 3: Write the collection route**

Create `src/app/api/setlists/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createSetlist, loadSetlists } from "@/db/setlists";
import { parseSetlistCreate } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/**
 * The setlists. Church PIN, not admin: a setlist touches no song, and a late
 * addition two minutes before a service must not need the admin PIN.
 */
export async function GET() {
  await ensureSchema();
  return NextResponse.json({ setlists: await loadSetlists() });
}

/** POST { name } — a new, empty, inactive setlist. */
export async function POST(req: Request) {
  const parsed = parseSetlistCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  return NextResponse.json({ ok: true, setlist: await createSetlist(parsed.name) });
}
```

- [ ] **Step 4: Start the dev server and unlock a cookie jar**

The app is PIN-gated (`src/proxy.ts`), and `.env.local` here has `CHURCH_PIN` set, so every `curl` needs a session cookie. This reads the PIN from the file without printing it:

```bash
npm run dev &
sleep 4
PIN=$(grep '^CHURCH_PIN=' .env.local | cut -d= -f2-)
curl -s -c /tmp/ld.jar -X POST localhost:3000/api/unlock \
  -H 'content-type: application/json' -d "{\"pin\":\"$PIN\"}"
```

Expected: `{"ok":true,"role":"church"}`

- [ ] **Step 5: Verify the route by hand**

```bash
curl -s -b /tmp/ld.jar localhost:3000/api/setlists
curl -s -b /tmp/ld.jar -X POST localhost:3000/api/setlists \
  -H 'content-type: application/json' -d '{"name":"  Sunday 14 Sept\n1st service "}'
curl -s -b /tmp/ld.jar -X POST localhost:3000/api/setlists \
  -H 'content-type: application/json' -d '{"name":"  "}'
curl -s -b /tmp/ld.jar localhost:3000/api/setlists
```

Expected, in order:
1. `{"setlists":[]}`
2. `{"ok":true,"setlist":{"id":1,"name":"Sunday 14 Sept 1st service","items":[],"active":false,"createdAt":"…","updatedAt":"…"}}` — note the name collapsed to one line
3. `{"error":"A setlist needs a name of 1 to 80 characters"}` with status 400
4. the one setlist, in an array

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/db/setlists.ts src/app/api/setlists/route.ts
git commit -m "feat: list and create setlists"
```

---

### Task 5: Changing and deleting a setlist

**Files:**
- Modify: `src/db/setlists.ts` (append)
- Create: `src/app/api/setlists/[id]/route.ts`
- Verify: `curl` against `npm run dev`

**Interfaces:**
- Consumes: `SetlistRecord`, `findSetlist`, `toRecord`'s output shape from Task 4; `SetlistPatch`, `parseSetlistPatch` from `src/lib/setlistEdit.ts`.
- Produces:
  - `updateSetlist(id: number, patch: SetlistPatch): Promise<SetlistRecord | "gone" | "stale">`
  - `deleteSetlist(id: number): Promise<boolean>`
  - `PATCH /api/setlists/:id` → `{ ok: true, setlist }` / 400 / 404 / 409 `{ error, setlist }`
  - `DELETE /api/setlists/:id` → `{ ok: true }` / 404

- [ ] **Step 1: Append the writes to the data module**

Add to `src/db/setlists.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";
import type { SetlistPatch } from "@/lib/setlistEdit";

/**
 * Apply a change. "gone" if the setlist is not there; "stale" if the client's
 * songs were built on a version someone else has since replaced.
 *
 * Activating clears the old active row first and does it in one batch. The
 * order is not optional: `setlists_one_active` is a unique index, so setting a
 * second active row before clearing the first is rejected. A batch is used
 * rather than an interactive transaction because libsql runs a batch inside an
 * implicit transaction over plain HTTP, which is how Turso is reached in
 * production.
 */
export async function updateSetlist(id: number, patch: SetlistPatch): Promise<SetlistRecord | "gone" | "stale"> {
  const current = await findSetlist(id);
  if (!current) return "gone";
  if (patch.items && current.updatedAt !== patch.updatedAt) return "stale";

  const values: { updatedAt: Date; name?: string; items?: string; active?: boolean } = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.items !== undefined) values.items = JSON.stringify(patch.items);

  if (patch.active === true) {
    await db.batch([
      db.update(setlists).set({ active: false }).where(and(eq(setlists.active, true), ne(setlists.id, id))),
      db.update(setlists).set({ ...values, active: true }).where(eq(setlists.id, id)),
    ]);
  } else {
    if (patch.active === false) values.active = false;
    await db.update(setlists).set(values).where(eq(setlists.id, id));
  }

  const saved = await findSetlist(id);
  return saved ?? "gone";
}

export async function deleteSetlist(id: number): Promise<boolean> {
  const [row] = await db.delete(setlists).where(eq(setlists.id, id)).returning({ id: setlists.id });
  return !!row;
}
```

Merge the new `drizzle-orm` import into the existing one at the top of the file rather than adding a second import line — `import { and, desc, eq, ne } from "drizzle-orm";`.

- [ ] **Step 2: Write the route**

Create `src/app/api/setlists/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteSetlist, findSetlist, updateSetlist } from "@/db/setlists";
import { parseSetlistPatch } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/** Route params arrive as a promise in this version of Next. */
async function setlistId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH /api/setlists/:id — { name?, items?, active?, updatedAt }.
 *
 * A change to `items` replaces the whole array, so it must say which version it
 * started from. If someone else has changed the setlist since, the answer is a
 * 409 carrying the setlist as it now stands, and the client re-applies its own
 * single addition to that.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await setlistId(params);
  if (id === null) return NextResponse.json({ error: "No such setlist" }, { status: 404 });

  const parsed = parseSetlistPatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateSetlist(id, parsed);
  if (result === "gone") return NextResponse.json({ error: "No such setlist" }, { status: 404 });
  if (result === "stale") {
    return NextResponse.json({ error: "Someone else changed this setlist", setlist: await findSetlist(id) }, { status: 409 });
  }
  return NextResponse.json({ ok: true, setlist: result });
}

/** DELETE /api/setlists/:id. If it was the active one, nothing is promoted in its place. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await setlistId(params);
  if (id === null) return NextResponse.json({ error: "No such setlist" }, { status: 404 });

  await ensureSchema();
  if (!(await deleteSetlist(id))) return NextResponse.json({ error: "No such setlist" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify by hand, including the two rules that matter**

With the dev server running and `/tmp/ld.jar` unlocked (Task 4, Step 4 — repeat it if the server was restarted):

```bash
# two setlists to play with
A=$(curl -s -b /tmp/ld.jar -X POST localhost:3000/api/setlists -H 'content-type: application/json' -d '{"name":"Sunday 1st"}')
B=$(curl -s -b /tmp/ld.jar -X POST localhost:3000/api/setlists -H 'content-type: application/json' -d '{"name":"Sunday 2nd"}')
AID=$(echo "$A" | sed 's/.*"id":\([0-9]*\).*/\1/')
BID=$(echo "$B" | sed 's/.*"id":\([0-9]*\).*/\1/')
AAT=$(echo "$A" | sed 's/.*"updatedAt":"\([^"]*\)".*/\1/')

# add a song, quoting the version we read
curl -s -b /tmp/ld.jar -X PATCH localhost:3000/api/setlists/$AID -H 'content-type: application/json' \
  -d "{\"items\":[{\"id\":1,\"title\":\"Way Maker\"}],\"updatedAt\":\"$AAT\"}"

# the same stale version again — must be refused, not silently applied
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ld.jar -X PATCH localhost:3000/api/setlists/$AID \
  -H 'content-type: application/json' -d "{\"items\":[],\"updatedAt\":\"$AAT\"}"

# activate both in turn, then count active rows
curl -s -b /tmp/ld.jar -X PATCH localhost:3000/api/setlists/$AID -H 'content-type: application/json' -d '{"active":true}' > /dev/null
curl -s -b /tmp/ld.jar -X PATCH localhost:3000/api/setlists/$BID -H 'content-type: application/json' -d '{"active":true}' > /dev/null
curl -s -b /tmp/ld.jar localhost:3000/api/setlists | grep -o '"active":true' | wc -l

# delete
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ld.jar -X DELETE localhost:3000/api/setlists/$BID
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ld.jar -X DELETE localhost:3000/api/setlists/$BID
```

Expected, in order:
1. `{"ok":true,"setlist":{…,"items":[{"id":1,"title":"Way Maker"}],…}}` with a new `updatedAt`
2. `409` — the stale write is refused
3. `1` — activating the second cleared the first
4. `200` then `404`

If step 3 prints `2`, the index or the clear-first order is wrong; if it errors with `UNIQUE constraint failed`, the two statements are the wrong way round.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/db/setlists.ts "src/app/api/setlists/[id]/route.ts"
git commit -m "feat: change, activate and delete a setlist"
```

---

### Task 6: Fetching one song

**Files:**
- Modify: `src/app/api/songs/[id]/route.ts` (add `GET`; leave `PATCH` and `DELETE` untouched)
- Verify: `curl`

**Interfaces:**
- Consumes: `loadSongs(where, limit)` from `src/db/songs.ts` (existing), `songId(params)` (already in this file).
- Produces: `GET /api/songs/:id` → `{ song: SearchableSong }` / 404.

This exists so a setlist row is tappable before the 323KB songbook has finished loading.

- [ ] **Step 1: Add the handler**

Add to `src/app/api/songs/[id]/route.ts`, above the existing `PATCH`:

```ts
/**
 * GET /api/songs/:id — one song with its sections. Unlocked, not admin-gated:
 * /api/songs/all already returns every song's full text to the same reader.
 * It exists so a setlist row can be opened before the whole book has loaded.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await songId(params);
  if (id === null) return NextResponse.json({ error: "No such song" }, { status: 404 });

  await ensureSchema();
  const [song] = await loadSongs(eq(songs.id, id), 1);
  if (!song) return NextResponse.json({ error: "No such song" }, { status: 404 });
  return NextResponse.json({ song });
}
```

`eq`, `songs`, `ensureSchema` and `NextResponse` are already imported in this file. Add `loadSongs` to the imports: `import { loadSongs } from "@/db/songs";`.

- [ ] **Step 2: Verify by hand**

```bash
curl -s -b /tmp/ld.jar localhost:3000/api/songs/1 | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ld.jar localhost:3000/api/songs/999999
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/ld.jar localhost:3000/api/songs/abc
```

Expected: a song object with `title` and `sections`; then `404`; then `404`.

- [ ] **Step 3: Confirm editing is still admin-only**

The new `GET` must not have loosened the other two handlers:

```bash
grep -n "admin()" "src/app/api/songs/[id]/route.ts"
```

Expected: two hits, one in `PATCH` and one in `DELETE`, and none in `GET`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/songs/[id]/route.ts"
git commit -m "feat: fetch one song, so a setlist row opens before the book loads"
```

---

### Task 7: The operator's setlist bar

**Files:**
- Create: `src/app/SetlistBar.tsx`
- Test: `tests/setlistBar.test.tsx`

**Interfaces:**
- Consumes: `SetlistRow` from `src/lib/setlist.ts`.
- Produces: default export `SetlistBar` with props

```ts
interface Props {
  name: string;
  /** From staleNote(); rendered in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** The tab decides whether to open row.song or fetch it by id first. */
  onOpen: (row: SetlistRow) => void;
}
```

Presentational only: no fetching, no state. That is what makes it testable with `renderToStaticMarkup`.

- [ ] **Step 1: Write the failing test**

Create `tests/setlistBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetlistBar from "../src/app/SetlistBar";
import type { SetlistRow } from "../src/lib/setlist";

const row = (over: Partial<SetlistRow> & { id: number; title: string }): SetlistRow => ({
  author: null,
  song: { id: over.id, title: over.title, sections: ["la la"] },
  missing: false,
  ...over,
});

const render = (rows: SetlistRow[], staleNote: string | null = null) =>
  renderToStaticMarkup(<SetlistBar name="Sunday 14 Sept" staleNote={staleNote} rows={rows} onOpen={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("the setlist the operator sees", () => {
  it("numbers the songs in the order they were prepared", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 2, title: "Oceans" })]);
    expect(text(html)).toContain("1\nWay Maker");
    expect(text(html)).toContain("2\nOceans");
  });

  it("credits the author on every row, which is the whole reason searching was ambiguous", () => {
    expect(render([row({ id: 1, title: "Way Maker", author: "Sinach" })])).toContain("Sinach");
  });

  it("names the setlist", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).toContain("Sunday 14 Sept");
  });

  it("says nothing about age when the setlist is fresh", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).not.toContain("days old");
  });

  it("warns in amber when it is last week's list", () => {
    const html = render([row({ id: 1, title: "Way Maker" })], "8 days old");
    expect(html).toContain("8 days old");
    expect(html).toContain("amber");
  });

  it("shows a deleted song as gone rather than dropping the row and losing the count", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 9, title: "Old One", song: null, missing: true })]);
    expect(text(html)).toContain("Old One");
    expect(html).toContain("no longer in the songbook");
  });

  it("makes a deleted song untappable, so it cannot look like a dead button", () => {
    const html = render([row({ id: 9, title: "Old One", song: null, missing: true })]);
    expect(html).toContain("disabled");
  });

  it("tells you what to do with a setlist that has no songs yet", () => {
    expect(render([])).toContain("No songs yet");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/setlistBar.test.tsx`
Expected: FAIL — cannot resolve `../src/app/SetlistBar`.

- [ ] **Step 3: Write the component**

Create `src/app/SetlistBar.tsx`:

```tsx
"use client";

import type { SetlistRow } from "@/lib/setlist";

interface Props {
  name: string;
  /** From staleNote(); shown in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** The tab decides whether to open row.song or fetch it by id first. */
  onOpen: (row: SetlistRow) => void;
}

/**
 * The songs for this service, at the top of the Songs tab, so the operator taps
 * instead of searching. A row opens the same song view a search hit opens —
 * this is a shortcut into machinery that already works, not a second way to
 * send lyrics.
 *
 * The author is on every row on purpose: it is the thing missing from a title
 * when two songs look the same in a list of search results.
 */
export default function SetlistBar({ name, staleNote, rows, onOpen }: Props) {
  return (
    <section aria-label="Setlist for this service" className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        {name}
        {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">No songs yet — find one below and press +.</p>
      ) : (
        <ol className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <li key={row.id}>
              <button
                onClick={() => onOpen(row)}
                disabled={row.missing}
                className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="min-w-0">
                  <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                  <span className="font-medium">{row.title}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {row.missing ? "no longer in the songbook" : row.author}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/setlistBar.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/SetlistBar.tsx tests/setlistBar.test.tsx
git commit -m "feat: show the active setlist to the operator"
```

---

### Task 8: Wiring the setlist into the Songs tab

**Files:**
- Create: `src/app/useSetlist.ts`
- Modify: `src/app/SongsTab.tsx`
- Verify: browser, plus the full test suite

**Interfaces:**
- Consumes: `SetlistRecord` shape from Task 4 (over the wire), `SetlistItem` from `src/lib/setlistEdit.ts`, `resolveSetlist`/`songsById`/`staleNote`/`comingSundayName` from `src/lib/setlist.ts`, `SetlistBar` from Task 7, `GET /api/songs/:id` from Task 6.
- Produces:
  - `interface Setlist { id: number; name: string; items: SetlistItem[]; active: boolean; createdAt: string; updatedAt: string }`
  - `type AddResult = "added" | "duplicate" | "failed"`
  - `useSetlist(): { setlist: Setlist | null; addSong(song): Promise<AddResult>; startSetlist(name, song): Promise<AddResult> }`

- [ ] **Step 1: Write the hook**

Create `src/app/useSetlist.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SetlistItem } from "@/lib/setlistEdit";
import type { SearchableSong } from "@/lib/songSearch";

export interface Setlist {
  id: number;
  name: string;
  items: SetlistItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AddResult = "added" | "duplicate" | "failed";

async function patch(id: number, body: unknown): Promise<{ status: number; setlist?: Setlist }> {
  const res = await fetch(`/api/setlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { setlist?: Setlist } | null;
  return { status: res.status, setlist: data?.setlist };
}

/**
 * The active setlist, and adding a song to it.
 *
 * Kept out of SongsTab because that file is already long, and because the one
 * awkward part — a second person having changed the setlist between our read
 * and our write — is easier to see on its own.
 */
export function useSetlist() {
  const [setlist, setSetlist] = useState<Setlist | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/setlists");
        // A 401 from an expired PIN parses cleanly; taking it would leave the
        // bar hidden for the rest of the service with no way to notice.
        if (!res.ok) return;
        const data = (await res.json()) as { setlists?: Setlist[] };
        if (live) setSetlist(data.setlists?.find((s) => s.active) ?? null);
      } catch {
        // No bar. Search and browse are untouched, which is the point.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const addSong = useCallback(
    async (song: SearchableSong): Promise<AddResult> => {
      if (!setlist || song.id === undefined) return "failed";
      const item = { id: song.id, title: song.title };
      if (setlist.items.some((i) => i.id === item.id)) return "duplicate";

      // Two goes: ours, and one more on top of whatever the other person saved.
      let target = setlist;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { status, setlist: saved } = await patch(target.id, {
          items: [...target.items, item],
          updatedAt: target.updatedAt,
        });
        if (status === 200 && saved) {
          setSetlist(saved);
          return "added";
        }
        if (status === 409 && saved) {
          // They may have added the very song we are adding.
          if (saved.items.some((i) => i.id === item.id)) {
            setSetlist(saved);
            return "duplicate";
          }
          target = saved;
          continue;
        }
        return "failed";
      }
      return "failed";
    },
    [setlist],
  );

  /** Create a setlist, make it the active one, and put this song in it. */
  const startSetlist = useCallback(async (name: string, song: SearchableSong): Promise<AddResult> => {
    if (song.id === undefined) return "failed";
    const res = await fetch("/api/setlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return "failed";
    const { setlist: created } = (await res.json()) as { setlist: Setlist };

    const activated = await patch(created.id, { active: true });
    if (!activated.setlist) return "failed";

    const added = await patch(activated.setlist.id, {
      items: [{ id: song.id, title: song.title }],
      updatedAt: activated.setlist.updatedAt,
    });
    if (!added.setlist) return "failed";

    setSetlist(added.setlist);
    return "added";
  }, []);

  return { setlist, addSong, startSetlist };
}
```

- [ ] **Step 2: Mount the bar in the Songs tab**

In `src/app/SongsTab.tsx`:

Add to the imports:

```ts
import { comingSundayName, resolveSetlist, songsById, staleNote } from "@/lib/setlist";
import SetlistBar from "./SetlistBar";
import { useSetlist } from "./useSetlist";
```

Add beside the other state, near `const [q, setQ] = useState("")`:

```ts
const { setlist, addSong, startSetlist } = useSetlist();
// The song waiting for a setlist to exist, and the name being typed for it.
const [starting, setStarting] = useState<SearchableSong | null>(null);
const [startName, setStartName] = useState("");

const byId = useMemo(() => songsById(book), [book]);
const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, byId) : []), [setlist, byId]);
```

Add the two handlers, after `openSong`:

```ts
/** A setlist row: open the song from the book, or fetch that one song if the book is still loading. */
const openSetlistRow = useCallback(
  async (row: { id: number; song: SearchableSong | null; missing: boolean }) => {
    if (row.missing) return;
    if (row.song) return openSong(row.song);
    const res = await fetch(`/api/songs/${row.id}`);
    if (!res.ok) return showToast("Could not open that song — search for it", "err");
    const { song: fetched } = (await res.json()) as { song: SearchableSong };
    openSong(fetched);
  },
  [openSong, showToast],
);

/** + on a search row or in the song header. With no setlist yet, ask for a name first. */
const addToSetlist = useCallback(
  async (song: SearchableSong) => {
    if (!setlist) {
      setStartName(comingSundayName(new Date()));
      return setStarting(song);
    }
    const result = await addSong(song);
    if (result === "added") showToast(`Added "${song.title}" to ${setlist.name}`);
    else if (result === "duplicate") showToast("Already in the setlist", "warn");
    else showToast("Could not add to the setlist", "err");
  },
  [setlist, addSong, showToast],
);
```

Render the bar as the first child inside the `{!song && !adding && (` fragment, immediately **above** the search `<input>`:

```tsx
{setlist && (
  <SetlistBar
    name={setlist.name}
    staleNote={staleNote(setlist.updatedAt, new Date())}
    rows={setlistRows}
    onOpen={openSetlistRow}
  />
)}
```

- [ ] **Step 3: Add the + button to each search-result row**

The result row is currently one `<button>` wrapping everything, and a `<button>` cannot contain a `<button>`. Restructure the `<li>` the way the song's section rows already do — a flex container with two sibling buttons. Replace the `<li>` in the `hits.map(...)` block with:

```tsx
<li key={m.song.guid ?? m.song.id} className="flex items-stretch">
  <button
    onClick={() => openSong(m.song, m.section)}
    onMouseEnter={() => setHit(hi)}
    aria-current={hi === hit ? "true" : undefined}
    className={`min-w-0 flex-1 px-4 py-3 text-left hover:bg-zinc-800/60 ${hi === hit ? "bg-zinc-800/60" : ""}`}
  >
    <span className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 font-medium">{m.song.title}</span>
      <span className="shrink-0 text-xs text-[var(--muted)]">
        {m.matched < m.words && <span className="text-amber-400/80">{m.matched} of {m.words} words · </span>}
        {m.fuzzy && <span className="text-amber-400/80">spelling · </span>}
        {m.song.author ? `${m.song.author} · ` : ""}
        {m.song.sections.length} section{m.song.sections.length === 1 ? "" : "s"}
        {m.song.source === "manual" ? " · added here" : ""}
      </span>
    </span>
    {m.snippet && (
      <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">
        <MatchedLine text={m.snippet.text} ranges={m.snippet.ranges} />
      </span>
    )}
  </button>
  <button
    onClick={() => addToSetlist(m.song)}
    aria-label={`Add ${m.song.title} to the setlist`}
    title="Add to the setlist"
    className="grid min-h-11 min-w-11 shrink-0 place-items-center self-start text-lg text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200"
  >
    +
  </button>
</li>
```

The row's contents are unchanged from what is there now — only the `<li>` wrapper, the first button's className, and the new second button are different.

- [ ] **Step 4: Add `+ Setlist` to the open song's header**

In the `{song && !editing && (` block, in the `<span className="flex shrink-0 gap-2">` beside Edit and ← Songs, as the first child:

```tsx
<button onClick={() => addToSetlist(song)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
  + Setlist
</button>
```

- [ ] **Step 5: Add the "Start a setlist" panel**

Render it as a sibling of the `{adding && (` panel, following the same shape:

```tsx
{starting && (
  <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
    <div className="flex items-center justify-between">
      <h2 className="font-medium">Start a setlist</h2>
      <button onClick={() => setStarting(null)} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
        Cancel
      </button>
    </div>
    <p className="text-sm text-[var(--muted)]">&ldquo;{starting.title}&rdquo; will be the first song.</p>
    <input
      autoFocus
      value={startName}
      onChange={(e) => setStartName(e.target.value)}
      aria-label="Setlist name"
      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
    />
    <button
      onClick={async () => {
        const song = starting;
        const name = startName.trim();
        if (!song || !name) return;
        setStarting(null);
        const result = await startSetlist(name, song);
        showToast(result === "added" ? `Started ${name} with "${song.title}"` : "Could not start the setlist", result === "added" ? "ok" : "err");
      }}
      disabled={!startName.trim()}
      className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50"
    >
      Start it
    </button>
  </div>
)}
```

Also add `!starting &&` to the condition on the `{!song && !adding && (` fragment, so the panel is not shown behind the search box.

- [ ] **Step 6: Link to the builder**

In the small links row that already holds "+ Quick add a song" and "Import songbook", add as the first link:

```tsx
<Link href="/setlists" className="-my-1 py-1 underline hover:text-zinc-300">
  Setlists
</Link>
```

- [ ] **Step 7: Verify in the browser**

With `npm run dev` running, open `http://localhost:3000`, unlock, go to the Songs tab, and check each of these:

1. Search a song, press `+` → the "Start a setlist" panel appears, pre-filled with the coming Sunday's date.
2. Press "Start it" → the toast confirms, and the bar appears at the top with that one song, showing its author.
3. Search another song, press `+` → toast "Added …", and it appears as row 2.
4. Press `+` on the same song again → toast "Already in the setlist", and no second row.
5. Tap row 1 in the bar → the song view opens, with its sections, pinning and `1`–`9` all working as before.
6. Press `Esc` → back to the list, bar still there.
7. Open a song by searching, press `+ Setlist` in its header → added.
8. Reload the page → the bar is still there, from the server.

- [ ] **Step 8: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the whole suite passes, no type errors, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/useSetlist.ts src/app/SongsTab.tsx
git commit -m "feat: show and build the setlist from the songs tab"
```

---

### Task 9: The builder page

**Files:**
- Create: `src/app/setlists/page.tsx`
- Verify: browser

**Interfaces:**
- Consumes: `Setlist` from `src/app/useSetlist.ts`, `moveItem` from `src/lib/setlist.ts`, all four `/api/setlists` handlers.
- Produces: the page at `/setlists`. Nothing imports from it.

- [ ] **Step 1: Read the page-file docs**

Run: `sed -n '1,80p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`

`AGENTS.md` requires it before writing page code.

- [ ] **Step 2: Write the page**

Create `src/app/setlists/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { comingSundayName, moveItem } from "@/lib/setlist";
import type { Setlist } from "../useSetlist";

/**
 * Preparing a service. Separate from the desk because this is done the night
 * before, on a phone, and the desk itself must stay a search box and a song.
 *
 * Every write sends the whole setlist back, so each one carries the updatedAt
 * it started from and a 409 means someone else got there first — the page
 * reloads rather than guessing how to merge.
 */
export default function SetlistsPage() {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The setlist whose Delete has been armed; a second press does it. */
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/setlists");
    if (!res.ok) return setError("Could not load the setlists");
    const data = (await res.json()) as { setlists: Setlist[] };
    setSetlists(data.setlists);
  }, []);

  useEffect(() => {
    setName(comingSundayName(new Date()));
    void load();
  }, [load]);

  async function send(id: number, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/setlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) setError("Someone else changed this setlist — reloaded it for you");
      else if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not save");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not create it");
      setName(comingSundayName(new Date()));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/setlists/${id}`, { method: "DELETE" });
      setConfirming(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Setlists</h1>
        <Link href="/" className="text-sm underline text-[var(--muted)] hover:text-zinc-300">
          ← Back to the desk
        </Link>
      </div>

      <p className="text-sm text-[var(--muted)]">
        The active setlist is the one the operator sees at the top of the Songs tab. Add songs to it from there, with the
        + beside a search result.
      </p>

      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New setlist name"
          placeholder="Sunday 14 Sept — 1st service"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <button onClick={create} disabled={busy || !name.trim()} className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
          New setlist
        </button>
      </div>

      {setlists.length === 0 && <p className="text-sm text-[var(--muted)]">No setlists yet.</p>}

      {setlists.map((s) => (
        <section key={s.id} className={`space-y-2 rounded-xl border p-4 ${s.active ? "border-[var(--accent)]/60 bg-[var(--accent)]/5" : "border-zinc-800 bg-zinc-900/60"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              defaultValue={s.name}
              onBlur={(e) => e.target.value.trim() !== s.name && send(s.id, { name: e.target.value })}
              aria-label={`Name of ${s.name}`}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="flex shrink-0 gap-2">
              {s.active ? (
                <span className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold uppercase text-black">Active</span>
              ) : (
                <button onClick={() => send(s.id, { active: true })} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50">
                  Make active
                </button>
              )}
              <button
                onClick={() => (confirming === s.id ? remove(s.id) : setConfirming(s.id))}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {confirming === s.id ? "Sure?" : "Delete"}
              </button>
            </span>
          </div>

          {s.items.length === 0 ? (
            <p className="px-2 text-sm text-[var(--muted)]">No songs yet — add them from the Songs tab.</p>
          ) : (
            <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {s.items.map((item, i) => (
                <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="w-5 shrink-0 text-center text-xs text-[var(--muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <button onClick={() => send(s.id, { items: moveItem(s.items, i, -1), updatedAt: s.updatedAt })} disabled={busy || i === 0} aria-label={`Move ${item.title} up`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                    ↑
                  </button>
                  <button onClick={() => send(s.id, { items: moveItem(s.items, i, 1), updatedAt: s.updatedAt })} disabled={busy || i === s.items.length - 1} aria-label={`Move ${item.title} down`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                    ↓
                  </button>
                  <button onClick={() => send(s.id, { items: s.items.filter((x) => x.id !== item.id), updatedAt: s.updatedAt })} disabled={busy} aria-label={`Remove ${item.title}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30">
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </main>
  );
}
```

Deleting is armed by a first press and done by a second, rather than `window.confirm` — a modal dialog blocks the page, and this is the same tap either way.

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:3000/setlists` and check:

1. The name box is pre-filled with the coming Sunday. "New setlist" creates it and the box refills.
2. "Make active" on a second setlist moves the Active badge off the first — never two.
3. Editing a name and clicking away saves it; reloading the page shows the new name.
4. `↑` / `↓` reorder songs, and the buttons are disabled at the ends.
5. `×` removes a song.
6. "Delete" arms, the second press deletes.
7. Back on the desk, the Songs tab bar reflects the active setlist and its order.
8. Deleting the active setlist makes the bar disappear, and no other setlist is promoted.

- [ ] **Step 4: Verify the deleted-song case, which is the one no test can reach end to end**

```bash
# add a song to the active setlist through the UI first, then note its id from:
curl -s -b /tmp/ld.jar localhost:3000/api/setlists
```

Delete that song from the songbook (open it on the desk, Edit → Delete — this needs the admin PIN), then reload the desk. Expected: the setlist row is still there, greyed, reading "no longer in the songbook", and not tappable.

- [ ] **Step 5: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. `npm run build` is included here because this is the last task and a page that only fails at build time is the kind of thing that surfaces on deploy.

- [ ] **Step 6: Commit**

```bash
git add src/app/setlists/page.tsx
git commit -m "feat: prepare setlists on their own page"
```

---

## Done when

- A setlist prepared on one device shows at the top of the Songs tab on another.
- Tapping a row opens the song exactly as a search hit does.
- Only one setlist can be active, enforced by the database.
- A song deleted from the songbook shows as gone rather than vanishing from the setlist.
- `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` are all clean.
