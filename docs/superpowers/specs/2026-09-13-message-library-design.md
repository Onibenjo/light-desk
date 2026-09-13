# Message library

Confirmed design from the brainstorming session on 2026-09-13. This is
milestone 2 in the README: "import the Google Doc into `messages`, build the
runsheet screen."

## Problem

Everything the chat operator posts that is not a verse or a song lives in one
Google Doc, the *CLC Online Service Engagement Document*: greetings, the prayer
introductions, welcoming Ambience Jewel (the choir), the confession, offering
and tithe account details, the closing charge, the next-service announcement,
and a list of apologies for when the sound drops.

Mid-service the operator scrolls that doc, finds the right paragraph, selects
exactly it, copies, and pastes into Mixlr. It is the same problem setlists
solved for songs, only worse:

- The doc is long (650 lines) and ordered for reading, not for finding. An
  apology is needed *now*, while the operator is in the middle of a song.
- Near-identical lines sit next to each other (seven prayer introductions that
  differ only by the pastor's name), so selecting the wrong one is easy.
- Long entries (the confession, the account details) are posted in several
  chunks, so one entry means several careful selections.
- Nothing of it can go into the service's setlist, which is the one place the
  service order is already prepared.

## What the doc actually looks like

Read from an export of the doc on 2026-09-13. It shapes the model below.

- **Numbered sections 1–15 are the service order.** Greetings, Prayer before
  Ambience Jewel, Welcoming Ambience Jewel, Prayer before Sermon, Confession,
  Testimony, Recap, Welcoming Pastor, Announcement, Offerings and Tithe, First
  Timer, Apologies, Apostolic Blessing, Closing Charge, Announcement of Next
  Service.
- **Two sections are not part of any order.** 12 Apologies (technical issues,
  posted whenever they happen) and 16 Special Programs (Easter, Love Choices,
  Father's Day, communion, marathon prayer).
- **Most sections hold variants, not one text.** By day (Sunday / Wednesday /
  Family Meeting), by person (one prayer line per pastor; Welcoming Pastor also
  varies *he* / *she*), or by who blesses (father / mother / both).
- **Next-service announcements carry a date,** and the doc has accumulated 20+
  near-copies of them because each week an old one is edited.
- **Per-person copies have drifted:** "Pastor Charles Olumorin" vs "Mr. Charles
  Olumorin", "Pastor Ayomidotun Fayode" vs "Pastor John Fayode", "Ajibowo" vs
  "Ajibowu". Cleaning these up is part of seeding.
- **Account details have not changed in over six years.** The prayer sections
  change most, and only by the name.

## Decisions

| Question | Decision |
|---|---|
| Source of the text | Seeded once from the doc by hand, then the app is the source. No Google Docs sync. |
| Per-person lines | One message per person. No templates, no people list. |
| Messages in a setlist | Linked to the library, with the text optionally edited for that service only. |
| Which messages can go in a setlist | Decided per section (`in_service`). Apologies and Special Programs cannot. |
| Where the operator reaches them | A third "💬 Messages" tab, and every message in the ⌘K palette. |
| Where the setlist bar shows | Songs tab and Messages tab. |
| Long entries | A message holds ordered parts, one Mixlr post each, sent like song sections. |
| Storage shape | Own tables beside songs, not songs with a different `source`. |

### Why one message per person rather than a template

A template (`…as {name} leads us.`) plus a people list would fix the name drift,
but it costs a People entity, a name picker at copy time, and setlist items that
reference both a message and a person. One message per person keeps search by
name working (`sermon queen` finds exactly one line), makes a setlist item point
at the exact line for that service, and a new pastor is one Duplicate. The drift
is visible in one list rather than hidden in a doc.

### Why messages are not songs

Storing messages in `songs` with `source = "message"` would reuse search, the
section view and the editor for free, but lyric search would start returning
apologies, the songbook re-import would have to learn to skip them, `author`
means nothing for a message, and sections and the setlist rule would be bolted
on. The piece genuinely worth sharing is part-by-part sending, and that is
already its own module (`songKeys.ts`).

### Why a linked item with an optional edited copy

A pure link means a date can only change by editing the library, which is how
the doc grew its 20+ dated copies. A pure snapshot means a typo fixed in the
library never reaches a setlist already prepared. The linked item reads the
library until someone edits it for that service; from then on it keeps its own
text and says so.

## Data model

The `messages` table has existed since the first release as an M2 placeholder
(`section`, `title`, `body`, `sort`) and nothing has ever written to it — the
only reference outside the schema is the backup/restore table list. It is
replaced rather than bent to fit.

```sql
CREATE TABLE IF NOT EXISTS message_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort INTEGER NOT NULL,
  in_service INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES message_sections(id),
  title TEXT NOT NULL,              -- "Sunday · Worship", "Pastor Queen Okoye"
  parts TEXT NOT NULL,              -- JSON string[], one Mixlr post each
  sort INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Added to both `src/db/schema.ts` (drizzle) and `SCHEMA_SQL` in
`src/db/schemaSql.ts`. `message_sections` is added to `DATA_TABLES` in
`src/lib/dbTransfer.ts`, ahead of `messages` so a restore inserts sections
before the messages that reference them.

**Replacing the placeholder.** Before `SCHEMA_SQL` runs, `applySchema` checks
`PRAGMA table_info(messages)`. If the table exists with a `body` column, it is
the placeholder: when it has no rows it is dropped, so `CREATE TABLE IF NOT
EXISTS` then creates the new shape. When it has rows, `applySchema` throws with
a message naming the table, rather than dropping data. Once replaced the check
finds no `body` column and does nothing, so it stays idempotent.

- `in_service` belongs to the section, not the message: Apologies are ad hoc as
  a group.
- `parts` mirrors `songs.sections`: a JSON array, read whole.
- `name` is unique regardless of case. `COLLATE NOCASE` puts that in the
  database, so two admins creating "Apologies" and "apologies" at once cannot
  both succeed; the route turns the constraint error into a 409 with a readable
  message.

## Seeding

The doc is not parsed at runtime. The text is cleaned by hand, once, into
`src/data/messages.seed.json`:

- Sections in doc order with their `in_service` flag.
- One message per variant. Welcoming Ambience Jewel becomes six: Sunday,
  Sunday · Worship, Sunday · Praise, and the same three for Wednesday.
- The broken emoji in the plain-text export (`����`) restored from the `.docx`
  copy.
- Name drift resolved to one spelling per person, with the choices listed for
  the user to confirm during review.
- The dated next-service copies collapsed to one message per service type
  (Sunday First Service, Sunday Second Service, Midweek, Apostolic, Family
  Meeting, Cross Over) with an obvious `[DATE]` placeholder, meant to be edited
  per setlist.
- Multi-post entries (the confession, each account block) split into parts
  where a blank line falls.

`npm run db:seed-messages` (`scripts/db-seed-messages.mts`, shaped like the
backup scripts) inserts the seed only when both tables are empty; a second run
reports that and does nothing.

The seed JSON is reviewed by the user before it is committed, because it is an
interpretation of the doc. The raw export, the `.docx` and the photos in
`docs/` are **not** committed. The account numbers in the seed are posted in the
public chat every service, so they are not secret, and the repository is
private.

## Setlist items

`SetlistItem` in `src/lib/setlistEdit.ts` becomes a tagged union:

```ts
type SetlistItem =
  | { kind: "song"; id: number; title: string }
  | { kind: "message"; id: number; title: string; parts?: string[] };
```

- **Old rows keep working.** A stored item with no `kind` parses as a song, both
  in `parseSetlistPatch` and when `src/db/setlists.ts` reads a row. It is
  written back with `kind` on the next change. No migration.
- **`title` stays a cached label.** For a message it is `Section · Title`
  (`Welcoming Ambience Jewel · Sunday · Worship`), so the bar paints before the
  library has loaded.
- **`parts` is present only when edited for this service.** Absent, the text is
  read from the library at copy time.
- **Duplicates are keyed by `kind` + `id`.** Song 12 and message 12 are
  different things. The same message cannot appear twice in one setlist.
- **`MAX_ITEMS` stays 50.** Edited `parts` go through the same rules as library
  parts.

### Edit for this service

In `/setlists`, a message item has **Edit for this service**, opening a textarea
pre-filled with its current text (edited copy if any, else the library's). A
blank line separates parts. Saving writes `parts` onto the item through the
existing `items` PATCH and its `updatedAt` guard. An edited item shows an
*edited* tag and **Reset to library text**, which removes `parts`.

Once edited, later library fixes do not reach that item. That is the chosen
trade-off, and the tag keeps it visible.

### Server-side rule

`PATCH /api/setlists/:id` looks up every message item **not already present in
the stored setlist** and rejects the request with 400 when:

- the message does not exist, or
- its section has `in_service = 0` — "Apologies can't go in a setlist", with the
  section's name.

Items already in the setlist are not re-checked, so toggling a section's flag
or deleting a message later never makes an existing setlist unsaveable. The
check lives in the route, not in `setlistEdit.ts`, because it needs the
database; `setlistEdit.ts` stays pure.

### Resolution

`resolveSetlist` in `src/lib/setlist.ts` takes the library as a second lookup
(`messagesById`, null while loading) alongside `songsById`. A message row:

- Before the library loads: the cached title. Copyable if it has edited
  `parts`; otherwise not yet.
- After: the live `Section · Title`, and text `item.parts ?? message.parts`.
- Message deleted from the library, **no** edited parts: greyed, "no longer in
  the library", not tappable — the same treatment as a deleted song.
- Message deleted, **with** edited parts: still works, since its text travels
  with it; a quiet "removed from library" note.

## Validation

New pure module `src/lib/messageEdit.ts`, the same convention as
`setlistEdit.ts`: the parsed value, or the message to show.

- Section `name` — trimmed, one line, 1–80 characters (uniqueness is the
  database's job; see Data model)
- Message `title` — one line, trimmed, 1–120 characters
- `parts` — from `splitOnBlankLines` (`src/lib/songSections.ts`), 1–20 parts,
  each trimmed and at most 4,000 characters
- Edited `parts` on a setlist item — the same rule, reused by `setlistEdit.ts`

## API

Shaped like `api/songs/*` and `api/setlists/*`: `runtime = "nodejs"`,
`ensureSchema()` first, JSON errors.

| Route | Level | Effect |
|---|---|---|
| `GET /api/messages` | church | every section and message, one payload |
| `POST /api/messages` | admin | `{ sectionId, title, text }` → the created message |
| `PATCH /api/messages/:id` | admin | `{ title?, text?, sectionId?, sort? }` |
| `DELETE /api/messages/:id` | admin | removes one |
| `POST /api/message-sections` | admin | `{ name, inService }` → the created section |
| `PATCH /api/message-sections/:id` | admin | `{ name?, sort?, inService? }` |
| `DELETE /api/message-sections/:id` | admin | only when empty; 409 otherwise |

`text` is the textarea's contents; the route splits it into `parts`. Reordering
swaps the `sort` of two rows in one `db.batch`, the same way activating a
setlist does.

### Permissions

- **Reading and copying** — church PIN, the level of `/api/songs/all`.
- **Changing the library** — admin, like editing a song: it rewrites shared
  text. `ADMIN_PIN` was introduced for exactly this ("will guard editing in
  M2/M3").
- **Putting a message in a setlist, editing its text for a service** — church
  PIN, like every setlist route. It never touches the library.

### Concurrent edits

Library writes carry no `updatedAt` guard. Only an admin edits the library, and
last-write-wins on one message loses little. The setlist guard is unchanged and
covers edited parts, since they travel inside `items`.

## UI

### The Messages tab — `MessagesTab`

A third tab, `💬 Messages`, beside Verses and Songs in `page.tsx`.

```
[ 📖 Verses ][ 🎵 Songs ][ 💬 Messages ]
┌─ SUNDAY 14 SEPT ─────────────── (setlist bar) ┐
[ Search messages ]                  Edit library
APOLOGIES
  Sound restored       "Sirs and Mas, we apologize…"
  Volume increased     "Thank you Sirs and Mas for…"
WELCOMING AMBIENCE JEWEL
  Sunday               "As we gather to honour…"      [+]
  Sunday · Worship     "Arms wide, hearts bowed…"     [+]
CONFESSION
  Full text  3 parts   "Father we thank You…"         [+]
```

- Sections in `sort` order. **The seed gives Apologies the lowest `sort`**, so it
  is listed first: it is the only section needed in a hurry. This is data, not a
  special case in code — the editor can move it like any other section.
- One fetch of `/api/messages` when the tab or palette first needs it; search
  runs locally.
- **Search** matches every typed word against section name, title and full
  text, case- and accent-insensitive. Pure, in `src/lib/messageSearch.ts`.
- **Tap a single-part message: it is copied**, with the existing toast. **Tap a
  multi-part message: it opens** in a part view like the song view — Enter
  copies the current part and moves on, `1`–`9` jumps to a part, Esc goes back
  — reusing `songKeys.ts`.
- ↑ ↓ picks a result, Enter copies or opens, as in Songs.
- `+` appears on rows of `in_service` sections and in an open message's header.
  It adds to the active setlist with the same **Start a setlist** and "Already
  in the setlist" behaviour as songs.
- Every copy is logged as kind `message`, label `Section · Title` (plus
  `· part 2 of 3` when multi-part). The log page gains a `message` filter chip.

The row is a flex container of sibling buttons (copy/open, `+`), the pattern
the song's section rows use with the 📌 button. Nested buttons are invalid
HTML.

### The ⌘K palette

Once the library has loaded, every message is an `Action` in a **Message**
group, titled `Section · Title`, with its text as keywords so `work in
progress` finds the apology whose title does not say it. Running one copies a
single-part message immediately from any tab; a multi-part one switches to the
Messages tab and opens it.

### The setlist bar on both tabs

- `useSetlist` moves from `SongsTab` up to `page.tsx`, so both tabs share one
  setlist rather than fetching and holding two.
- `SetlistBar` renders on Songs and Messages, still only when no song or message
  is open.
- 🎵 song rows are unchanged (author shown). 💬 message rows show
  `Section · Title` and an *edited* tag.
- A song row tapped on the Messages tab switches to Songs and opens that song; a
  multi-part message row tapped on Songs switches to Messages and opens it.
  `page.tsx` passes the item to open down to the tab it switched to.
- Rows copied during this page session get a ✓. This is client state for this
  screen only — not shared, not stored — so the setlist spec's "no live
  progress" still holds.
- `useSetlist.addSong` generalises to `addItem`, keeping its single automatic
  retry on 409.

### The library editor — `/messages`

Admin. Linked from **Edit library** on the tab and from ⌘K ("Edit message
library"), modelled on `/setlists`.

- **Sections:** add, rename, move up/down, toggle **Can go in a setlist**.
  Delete only when empty, so no click wipes twenty messages.
- **Messages:** add, edit (title and a textarea where a blank line starts a new
  part), **Duplicate** (how a new pastor's line is made), move up/down, move to
  another section, delete.
- A part longer than `MAX_MESSAGE_CHARS` (default 1000) shows an amber note,
  "Mixlr may cut this — split it with a blank line". A warning, not a block: the
  real limit is still uncalibrated (README, Still to do).
- Without the admin PIN the page shows the same 403 hint the song editor does.

### File layout

`page.tsx` is 658 lines and `SongsTab.tsx` 539. New UI goes in its own files:
`MessagesTab.tsx`, `MessageView.tsx` (the part view), `app/messages/page.tsx`
(the editor), and a `useMessages` hook for loading the library. Pure logic —
validation, search, resolution — lives in `src/lib` and tests without a DOM.

## Failure behaviour

**`/api/messages` fails, or the PIN has expired.** The Messages tab shows
"Couldn't load messages" with Retry. The palette has no Message group. Verses,
songs and the setlist's song rows are untouched.

**The setlist loads but the library does not.** Message rows show their cached
titles. Those with edited parts still copy; the rest are greyed "library not
loaded" until a retry succeeds.

**A section is switched to not-in-service while its messages sit in a
setlist.** They stay and keep working. The rule applies only to new additions,
so flipping a toggle cannot break Sunday's prepared order.

**The clipboard write fails.** The existing `copyText` error toast, as for
verses and songs.

**The placeholder `messages` table has rows.** `ensureSchema()` throws naming
the table. Nothing is dropped.

## Tests

Written first, as usual for this repo.

- `tests/messageEdit.test.ts` — section names (empty, over-long), titles with
  newlines, part splitting, the 20-part and 4,000-character limits
- `tests/messageSearch.test.ts` — every word must match, body text matches
  where the title does not, accents and case ignored, `sort` order kept
- `tests/setlistEdit.test.ts` (extended) — an item without `kind` parses as a
  song, duplicates keyed by `kind` + `id`, edited parts validated
- `tests/setlist.test.ts` (extended) — edited parts win over library parts, a
  deleted message with and without edited parts, library not loaded
- `tests/schema.test.ts` (extended) — an empty placeholder `messages` table is
  replaced; one with rows is refused and left intact; a second run is a no-op;
  a section name differing only in case is rejected by the database
- `tests/setlists.test.ts` (extended) — adding a message from an
  `in_service = 0` section is rejected; one already in the setlist is not
  re-checked
- `tests/setlistBar.test.tsx` (extended) — a message row copies, shows the
  *edited* tag, and gets its ✓
- `tests/dbTransfer.test.ts` (extended) — `message_sections` dumped and restored
  before `messages`
- the seed script — a second run inserts nothing

## Explicitly out of scope

- **Syncing with the Google Doc.** A one-time seed; the app is the source after.
- **Templates for names or dates.** One message per person; dates are a
  `[DATE]` placeholder edited per setlist.
- **Shared "already posted" progress** across devices.
- **Calibrating the Mixlr character limit.** The warning uses the current
  default until someone measures it.
- **Prayer focus lines,** which are typed live and differ every time.
