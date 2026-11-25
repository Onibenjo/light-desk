# Paste setlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste the choir's setlist message, see each song as matched, pick-one
or missing, and save one plain service order per service.

**Architecture:** The text is read by the site's LLM (`complete`), and its
output is checked against a strict shape. The rule-based parser is the
fallback. Songs are matched on the server with the existing `searchSongs`. The
LLM never picks a song id. Saving updates the branch's order with the same
name, or creates a new one, using the existing item shape, so the desk doesn't
change.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching
routes or pages), drizzle/libsql, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-setlist-paste-design.md`

## Global Constraints

- No Claude/Anthropic attribution in commits or PR text (AGENTS.md).
- Order name: `<Ddd D Mon> · <Service>`, e.g. `Sun 29 Nov · First Service`. With no service heading: `<date> · Service`.
- Default date: the next Wednesday or Sunday, whichever comes first, counting today.
- Copy, verbatim:
  - "Read without AI; check the grouping."
  - "Couldn't find any songs"
  - "This will replace the existing order"
  - "Not in song bank yet"
- Routes use `gate()` from `@/lib/sessionGate` (church PIN), like `src/app/api/setlists/route.ts`.
- Songs are global. `loadSongs()` takes no branch. Setlists are per branch.
- Stored song item: `{ kind: "song", id: number, title: string }`.

## Review Focus

1. LLM returns prose or fenced JSON (```` ```json ````): strip the fences, and fall back on anything else. Test in Task 2.
2. The same song appears twice in one service: keep both, in order. Test in Task 1.
3. Two services resolve to the same name (e.g. no headings, pasted twice): add ` (2)` to the second name. Test in Task 4.
4. A huge paste (a whole chat export): cap input at 8,000 characters and return 400 above it. Test in Task 4.
5. Bullets as `•`, `-`, `*`, `1.`, `1)` and emoji: all count as songs. Test in Task 1.

---

### Task 1: Rule-based parser

**Files:**
- Create: `src/lib/setlistParse.ts`
- Test: `tests/setlistParse.test.ts` (fixture: the team's sample message, two services, three sections each)

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedSong { title: string; alternatives: string[]; artist?: string }
  export interface ParsedSection { name: string; songs: ParsedSong[] }
  export interface ParsedService { name: string; sections: ParsedSection[] }
  export function parseSetlistText(text: string): ParsedService[]
  ```

- [ ] **Step 1: Write the failing tests.**
  - `parses the sample into two services with First worship, Praise, Second worship`: assert the service names `["First Service", "Second Service"]`, the section names, and the first song title of each section.
  - `splits brackets into alternatives and " - Artist" / " by Artist" into artist`.
  - `ignores lyric lines and unbulleted chatter`.
  - `treats •, -, *, 1., 1) and emoji-led lines as songs`.
  - `keeps a repeated song twice`.
  - `gives one "Service" with one unnamed section when there are no headings`.
  - `returns [] for text with no songs`.
- [ ] **Step 2:** Run `npx vitest run tests/setlistParse.test.ts --reporter=dot`. Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement `parseSetlistText`.** Work line by line:
  - Service heading: `/\b(first|second|third|midweek|sunday)\s+service\b|^midweek\b/i`. The name is title-cased.
  - Section heading: a short line (≤ 4 words) ending in `:`, or one containing `worship|praise|hymn|offering|special`.
  - Song: a line starting with a bullet or number.
  - Drop sections and services left empty.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Parse a pasted setlist without AI`.

### Task 2: LLM read with fallback

**Files:**
- Create: `src/lib/setlistRead.ts`
- Test: `tests/setlistRead.test.ts` (mock `../src/lib/llm`)

**Interfaces:**
- Consumes: `parseSetlistText` and the types from Task 1, and `complete` from `src/lib/llm.ts`.
- Produces:
  ```ts
  export const SETLIST_SYSTEM_PROMPT: string
  export function checkLlmSetlist(raw: string): ParsedService[] | null
  export async function readSetlist(text: string): Promise<{ services: ParsedService[]; readWithoutAi: boolean }>
  ```

- [ ] **Step 1: Write the failing tests.**
  - `accepts valid JSON and trims strings`.
  - `strips json code fences`.
  - `returns null for prose, a wrong shape, or zero songs`.
  - `caps at 20 services × 20 sections × 40 songs`.
  - `readSetlist falls back with readWithoutAi=true when complete throws`.
  - `readSetlist falls back when the output fails the check`.
  - `readSetlist uses the LLM result with readWithoutAi=false`.
- [ ] **Step 2:** Run `npx vitest run tests/setlistRead.test.ts --reporter=dot`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The prompt carries the spec's rules (brackets become alternatives; drop lyrics and notes; fix obvious typos; keep the order; never invent songs; JSON only) and the exact JSON shape.
  - Call `complete({ system, user: text, maxTokens: 2000 })`, and race it against a 20-second timeout.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Read a setlist with the site's LLM, falling back to the parser`.

### Task 3: Matching

**Files:**
- Create: `src/lib/setlistMatch.ts`
- Test: `tests/setlistMatch.test.ts` (a small in-memory song list)

**Interfaces:**
- Consumes: `buildIndex` and `searchSongs` from `src/lib/songSearch.ts`, and `ParsedSong`.
- Produces:
  ```ts
  export type MatchStatus =
    | { status: "matched"; song: { id: number; title: string } }
    | { status: "pick"; candidates: { id: number; title: string }[] }
    | { status: "missing" };
  export function matchSong(index: IndexedSong[], song: ParsedSong): MatchStatus
  ```

- [ ] **Step 1: Write the failing tests.**
  - `matches an exact title`.
  - `matches through an alternative name`.
  - `matches despite a small typo`.
  - `offers up to 3 candidates when two titles tie`.
  - `is missing when nothing is found`.
  - `ignores songs without an id`.
- [ ] **Step 2:** Run `npx vitest run tests/setlistMatch.test.ts --reporter=dot`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Search the title and each alternative (limit 5), and keep the best match per id.
  - Rank by the lower `tier`, then the higher `matched/words`, with non-fuzzy first.
  - It's **matched** when the best has tier ≤ 2 and the next one is worse (a higher tier, or a lower ratio). Otherwise it's **pick** when there are candidates, and **missing** when there are none.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Match setlist songs against the song bank`.

### Task 4: Routes and order naming

**Files:**
- Create: `src/lib/setlistImport.ts` (pure: names, dates, request checking)
- Create: `src/app/api/setlists/parse/route.ts`
- Create: `src/app/api/setlists/import/route.ts`
- Modify: `src/db/setlists.ts` (add `findSetlistByName`, `replaceSetlistItems`)
- Test: `tests/setlistImport.test.ts`, `tests/setlistImportRoute.test.ts` (copy the temp-DB and mocked-`gate` setup from `tests/setlistRoute.test.ts`)

**Interfaces:**
- Consumes: Tasks 2 and 3, `loadSongs`, `createSetlist`.
- Produces:
  ```ts
  // setlistImport.ts
  export function defaultServiceDate(now: Date): Date
  export function orderName(date: Date, service: string): string
  export function uniqueNames(names: string[]): string[]
  export function parseImport(body: unknown): { orders: { name: string; songIds: number[] }[] } | string
  // db/setlists.ts
  export async function findSetlistByName(branchId: number, name: string): Promise<SetlistRecord | null>
  export async function replaceSetlistItems(branchId: number, id: number, items: SetlistItem[]): Promise<SetlistRecord>
  ```
  - `POST /api/setlists/parse` takes `{ text, date }` (date as `YYYY-MM-DD`). It returns:
    ```ts
    { readWithoutAi: boolean,
      services: [{ name, exists: boolean, sections: [{ name, songs: [{ title, alternatives, artist?, match: MatchStatus }] }] }] }
    ```
  - `POST /api/setlists/import` takes `{ orders }` and returns `{ ok: true, setlists: SetlistRecord[] }`.

- [ ] **Step 1: Write the failing pure tests.**
  - `defaultServiceDate`:
    - Mon 23 Nov → Wed 25 Nov.
    - Wed 25 Nov → itself.
    - Thu 26 Nov → Sun 29 Nov.
  - `orderName(29 Nov 2026, "First Service")` = `"Sun 29 Nov · First Service"`.
  - `uniqueNames(["A","A"])` = `["A","A (2)"]`.
  - `parseImport` rejects a missing name, a non-integer id, and more than 20 orders.
- [ ] **Step 2: Write the failing route tests.**
  - The parse test mocks `../src/lib/llm` to throw, so `readWithoutAi` is true and the songs are matched against seeded songs.
  - `parse rejects text over 8000 chars with 400`.
  - `parse returns 400 "Couldn't find any songs" for chatter`.
  - `parse flags exists:true when the branch has that order name`.
  - `import creates a new order with { kind:"song", id, title } items, titles from the book`.
  - `import replaces the items of an existing order with the same name, keeping its id`.
  - `import rejects an unknown song id with 400`.
- [ ] **Step 3:** Run `npx vitest run tests/setlistImport.test.ts tests/setlistImportRoute.test.ts --reporter=dot`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `replaceSetlistItems` writes `items` and `updatedAt` directly. Import is a full replace, so there's no version check.
  - Both routes use `gate()` and `export const runtime = "nodejs"`, following `src/app/api/setlists/route.ts`.
- [ ] **Step 5:** Run the same command. Expected: PASS.
- [ ] **Step 6:** Commit: `Add the setlist parse and import routes`.

### Task 5: Paste screen

**Files:**
- Create: `src/app/setlists/paste/page.tsx` (client component)
- Modify: `src/app/setlists/page.tsx` (add a **Paste setlist** link next to the new-order control)
- Modify: `docs/ui-copy.md` (add the four strings)

**Interfaces:**
- Consumes: both routes from Task 4, `POST /api/songs/quick-add` (`{ title, lyrics }`, which returns the saved song), and `defaultServiceDate`/`orderName` for the date field.

- [ ] **Step 1: Build the screen as the spec describes.**
  - Before reading: a textarea, a date input and **Read setlist**.
  - After reading, cards with:
    - an editable name;
    - the replace warning when `exists`;
    - sections, with each song shown green, amber (a candidate select) or red (**Add to song bank** opens the quick-add with the title filled in; on success the song becomes matched);
    - a remove button per song.
  - **Save orders** sends only matched songs, then lists the left-out songs per order under "Not in song bank yet".
  - The `readWithoutAi` note and errors show inline, and the pasted text and cards are kept on error.
- [ ] **Step 2: Check it in the browser.**
  - Run `npm run dev`.
  - Paste the sample with no LLM key. Check that two cards and the fallback note appear.
  - Save, then confirm the orders on `/setlists`.
  - Save again and confirm each order is replaced, not duplicated.
- [ ] **Step 3: Run all checks.** Run `npx vitest run && npx eslint && npx tsc --noEmit && npm run build`. Expected: all pass.
- [ ] **Step 4:** Commit: `Paste the choir's setlist into service orders`.
