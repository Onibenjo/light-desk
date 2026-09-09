# Service setlists

Confirmed design from the brainstorming session on 2026-09-09.

## Problem

Before a service the worship team sends the list of songs to be sung. The
media lead reads it, checks each title against the songbook, and quick-adds
whatever is missing. That work is done and then thrown away: on Sunday the
operator still finds every song by searching, live, mid-service.

Searching is the wrong tool for a list you already know:

- Song lyrics repeat across songs, so a remembered line matches several.
- Not every title carries the author, so two songs with the same or similar
  title can't be told apart at a glance in the results.
- It costs keystrokes and attention at the one moment there is none to spare.

The list exists before the service. Nothing in the app holds it.

## What this adds

A **setlist**: a named, ordered list of songs from the book, prepared ahead,
shown at the top of the Songs tab so the operator taps instead of searching.

"Setlist" is the word the team already uses, so it is the word in the UI, the
schema, and the code. Note that **"pin" is already taken** in this app — it
pins one *section* of the open song so `C` re-sends it. No pinning language
goes anywhere near setlists.

## Decisions

| Question | Decision |
|---|---|
| Where it lives | Server. One person prepares, another operates. |
| How it is built | Search and add, one song at a time. No paste-and-match importer. |
| How many | Many named setlists, exactly one marked active. |
| Where the operator sees it | Top of the Songs tab, above the search box. |
| Live progress tracking | None. It is a list of shortcuts. |
| Which setlist is live | A manual `active` flag, with a staleness warning. |
| Storage shape | One row per setlist with a JSON array of items. |

### Why a JSON array rather than a join table

`songs.sections` and `sent_log.meta` are already JSON columns; nothing in this
codebase joins. A setlist is about six items and is always read whole, so
normalising buys nothing and costs a join the rest of the code doesn't have.
Reordering is rewriting one array.

### Why items cache the title

An item is `{ id, title }`, not a bare id.

The **id is the reference** — lyrics are always read from the live song, so a
typo fixed on Saturday reaches the operator on Sunday. Snapshotting lyrics
into the setlist was considered and rejected for exactly that reason.

The **title is a cached label** so the setlist paints as soon as
`/api/setlists` answers, without waiting on the 323KB songbook. On bad venue
wifi the setlist is precisely the thing that should already be on screen.
Where the book has loaded, the live title wins over the cached one; the cached
copy converges on the next write. There is no sync job.

## Data model

```sql
CREATE TABLE IF NOT EXISTS setlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  items TEXT NOT NULL,              -- JSON [{ id, title }]
  active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS setlists_one_active ON setlists (active) WHERE active = 1;
```

Added to both `src/db/schema.ts` (drizzle) and `SCHEMA_SQL` in
`src/db/schemaSql.ts`, so `ensureSchema()` creates it on boot and the
backup/restore scripts carry it. No migration files, consistent with the rest
of the schema.

The partial unique index makes "at most one active setlist" a database
invariant rather than something several code paths have to remember.
Activating is therefore clear-then-set, in that order, inside a transaction:
setting the new active row before clearing the old one violates the index.

`setlists` is safe as a table name; `sets` would not have been, since `SET` is
a SQL keyword and the raw DDL in `schemaSql.ts` would have needed quoting.

## Validation

New pure module `src/lib/setlistEdit.ts`, mirroring `songEdit.ts`: returns
either the parsed value or the message to show the operator.

- `name` — required, trimmed, 1–80 characters
- `items` — an array of `{ id: positive integer, title: string }`
- each `title` trimmed, 1-200 characters
- duplicate ids are removed, keeping the first occurrence
- at most 50 items

No database access, so it unit-tests directly.

## API

Shaped like `api/songs/*`: `runtime = "nodejs"`, `ensureSchema()` before use,
JSON errors.

| Route | Body / effect |
|---|---|
| `GET /api/setlists` | every setlist, `created_at` descending |
| `POST /api/setlists` | `{ name }` → the created setlist |
| `PATCH /api/setlists/:id` | `{ name?, items?, active?, updatedAt }` |
| `DELETE /api/setlists/:id` | removes one |
| `GET /api/songs/:id` | **new** — one song with its sections |

`GET /api/songs/:id` is added to the existing `api/songs/[id]/route.ts`, which
today has only PATCH and DELETE. It exists so a setlist row is tappable before
the songbook has finished loading.

### Permissions

Unlocked (church PIN) is enough for every setlist route — **not** admin.
Editing a song is admin-gated because it rewrites the songbook; a setlist
touches no song, and a late addition two minutes before a service must not
require the admin PIN. `quick-add` already works this way.

`GET /api/songs/:id` is likewise church-PIN, the same level as
`/api/songs/all`, which already returns every song's full text.

### Concurrent edits

`items` is replaced wholesale, so a naive last-write-wins would silently drop
one person's addition — and a setlist is the only shared mutable object in the
app. A `PATCH` that sends `items` must therefore also send the `updatedAt` the
client last read, and is rejected with 400 without it. A mismatch returns 409;
the client refetches and re-applies its single pending add automatically, once.

`updatedAt` is not required on a `PATCH` that only renames or activates.
Renaming cannot lose anyone's work, and activating is a deliberate single
decision — the last person to press it meant it.

## UI

Two surfaces, matching how `/songs/import` already splits off from the tab.

### The operator's view — `SetlistBar`

New component, rendered at the top of the Songs tab, above the search box,
only when a setlist is active and no song is open. It never sits between the
operator and the song they are reading.

```
┌─ SUNDAY 14 SEPT · 1ST SERVICE ─────────────────┐
│ 1  Way Maker                     Sinach         │
│ 2  Great Is Thy Faithfulness     Chisholm       │
│ 3  Oceans                        Hillsong       │
└─────────────────────────────────────────────────┘
[ Search the songbook ]
```

- Tapping a row calls the same `openSong` a search hit calls. The song view,
  its section list, section pinning, `1`–`9` and `Esc` are all unchanged. The
  setlist is a shortcut into machinery that already works, not a second way to
  send lyrics.
- The author is shown on every row. This is the "not all have the author in
  the title" problem: the setlist row is the one place it can be guaranteed.
- Before the book has loaded, rows still paint from the cached titles, and a
  tap fetches that one song from `GET /api/songs/:id`. Authors are not cached,
  so they appear as the book resolves; the row does not reserve space for
  them, so nothing shifts when they arrive.
- The setlist's name is always shown. If it has not been touched for 3 or more
  days, its age is shown in amber next to the name
  (`Sunday 7 Sept · 8 days old`), so a stale list is visible rather than
  silently trusted.

### The builder — `/setlists`

New page, linked from the small row beside "Import songbook" in the Songs tab.
Create a setlist, rename it, make it active, reorder its songs, remove a song,
delete the setlist.

Reordering is up/down buttons, not drag: it is a six-item list, and up/down
works with a keyboard and with a thumb.

### Adding songs

"Add to setlist" always means **the active setlist**, so there is no picker to
get wrong and no second decision during preparation. Two entry points:

- A `+` button on each search-result row. The row is currently one `<button>`
  wrapping its whole contents, so it is restructured into a flex container
  with two sibling buttons — the pattern the song's section rows already use
  with the 📌 button. Nested buttons are invalid HTML.
- `+ Setlist` in the open song's header, for a song found by reading rather
  than by title.

With no active setlist, that button reads "Start a setlist": it prompts for a
name, pre-filled with the coming Sunday's date (`Sunday 14 Sept`), creates the
setlist active, and adds the song.

Adding a song already present is not a silent no-op: the toast says "Already
in the setlist".

### File layout

`SongsTab.tsx` is already 447 lines. `SetlistBar` and the `/setlists` page are
their own files, and the "which setlist is active, and add to it" state lives
in a small `useSetlist` hook rather than five more `useState`s in the tab.

Pure logic — resolving ids against the book, spotting missing songs,
live-title-wins, staleness — goes in `src/lib/setlist.ts`, the way
`songSearch.ts` and `songGroups.ts` are pure, so it tests without a DOM.

## Failure behaviour

**A song deleted from the book after being added.** Its id stops resolving.
The row renders greyed with its cached title and "no longer in the songbook",
and is not tappable; `/setlists` offers a Remove button. Dropping it silently
would leave the operator with five rows where six were prepared and no idea
which one went.

**`/api/setlists` fails, or the PIN has expired.** The bar does not render.
Search and browse are untouched. The setlist is an accelerator and must never
be able to break the thing it accelerates — the rule `/api/songs/all` already
follows on a 401.

**The active setlist is deleted.** The bar disappears and no other setlist is
promoted. Guessing which old one was meant is worse than showing none.

**A song is renamed after being added.** The live title wins on screen; the
cached copy converges on the next write.

## Tests

Written first, as usual for this repo.

- `tests/setlistEdit.test.ts` — empty name, over-long name, non-array items,
  duplicate ids, the 50-item cap, non-integer ids
- `tests/setlist.test.ts` — resolution against a book, missing songs,
  live-title-wins, the stale-age boundary
- `tests/schema.test.ts` (existing) — extended to assert the partial unique
  index actually **rejects** a second active row; that invariant is the whole
  reason the index exists
- `tests/setlistBar.test.tsx` — mirrors `songList.test.tsx`: rows render, a tap
  opens the song, a missing song is greyed and inert

## Explicitly out of scope

- **Paste-and-match import** of the WhatsApp message. Considered and deferred;
  search-and-add is needed regardless, and the matcher is the expensive half.
  The README still lists it as an M3 goal.
- **Live progress** ("we're on song 3") shared across devices. Needs polling
  or SSE and a rule for who wins; nobody has asked for it.
- **Dating setlists** and keeping them as browsable history. A name carries
  the date well enough today.
- **Per-song notes** on a setlist row (key, "chorus only").
