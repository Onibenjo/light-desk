# Song spacing and song editor

Confirmed design from the grilling session on 2026-09-07.

## Problem

Songs come into the desk two ways and both lose the spacing the lyrics were
written with:

- **Songbook import** packs consecutive VideoPsalm slides greedily up to 4
  lines. Songs the media team authored as two-line slides (a line plus its
  translation) get merged in pairs. `Tag` entries that mark a section change
  are ignored, so a chorus runs into the end of the intro.
- **Quick-add** hands the paste to an LLM asking for 4-6 line sections. The
  LLM regroups across stanzas and sometimes rewrites lines.

Once stored there is no way to fix a song: no edit, rename, or delete UI.

## Facts that shaped the design

CLC songbook (`SongBooks/CLC.json`): 1,966 songs, 40,714 non-empty slides.
745 songs are one line per slide, 59 are two lines per slide, 1,121 mix the
two. About 40 slides are 7+ lines; a handful are 50-110 line teaching
outlines.

`Tag` appears on 278 entries across 134 songs. 26 of those are empty
placeholder entries sitting between slides; the other 252 sit on slides that
have text. Inspecting them shows `Tag` marks the **first slide of a
section** — in "Forever He is Glorified" the tagged slides are exactly the
stanza and chorus starts. So a tagged entry is a section boundary whether or
not it carries text. (An earlier reading of this data called the 268
figure "empty markers"; it was not. The rule below is the corrected one.)

A regex for label-only lines matches 20 of the 40,714 slides' lines, all of
them genuine labels (`Chorus:`, `VAMP`, `[Pre chorus]`, `Verse 4`). No real
lyrics are at risk.

The app sends one section per clipboard copy into Mixlr chat. There is no
projector and no font scaling.

## Ingest rules (one implementation, used everywhere at ingest)

1. **Pack only one-line slides.** Consecutive one-line slides group into
   sections of up to 4 lines. A slide that already has 2 or more lines is
   always its own section.
2. **Tag entries are hard breaks.** Any entry carrying a `Tag` starts a new
   section. An empty tagged entry is a break and contributes no text; a
   tagged entry with text begins the next section.
3. **Balanced cap of 6.** Any section over 6 lines splits into near-equal
   chunks: 7 → 4+3, 8 → 4+4, 13 → 5+4+4. Never a 4+1 orphan.
4. **Label lines are dropped.** A line that is only a section label
   (`[Intro]`, `Chorus`, `Verse 1:`, `[Pre-Chorus]`) is removed. Labels are
   never stored or recognised as metadata.
5. **Quick-add:** blank line means new section. The LLM is called only when
   the paste has no blank lines at all, and its output goes through the same
   cap. On LLM failure the whole paste is one block, capped.

## Editor

- Lives inline in the song view on the desk, behind an Edit button next to
  the title. Replaces the section list while open.
- Admin role required (same cookie role as import). On 403 show the same
  "enter the admin PIN" hint the import page shows.
- Fields: title, author, one textarea holding the sections joined by blank
  lines.
- **Tidy** button applies label stripping and the balanced cap to the
  textarea in place. **Save** stores exactly what is shown, split on blank
  lines, with no cap and no label stripping. A deliberate 9-line section
  survives.
- Sections remain the stored truth. Saving sets `edited_at`.
- **Delete** is a hard delete behind a two-tap confirm.
- No per-section split or merge buttons in this version.

## Import and edited songs

- Import skips any song whose `edited_at` is set, and reports the count and
  titles as "edited here, left alone".
- Migration of the existing book is the operator re-uploading the CLC
  export on the existing import page. Quick-added songs are fixed in the
  editor.

## Out of scope

- Recognising section labels as metadata.
- Mapping VideoPsalm `Tag` values to verse or chorus names (1 looks like
  chorus, but the meaning is not documented and nothing depends on it).
- Per-section split and merge buttons.

## Re-import result

Applied the new rules to the local dev database (`local.db`, 2,222 stored
songs) by parsing `SongBooks/CLC.json` and writing back matching guids
directly, bypassing the need for a running server. Backup taken first at
`backups/lightdesk-2026-09-07T20-36-37-245Z.json`.

**Step 2 — apply the new rules:**

```
{ added: 0, updated: 1144, unchanged: 800, skipped: 0 }
parsed.songs.length 1944
parsed meta { totalEntries: 1966, skippedEmpty: 17, collapsedDuplicates: 5 }
```

`skipped` is 0 as expected (nothing hand-edited yet). Arithmetic closes:
1944 + 17 + 5 = 1966. `added` is 0 because every guid in the current
songbook file already existed in the local database from a prior import.

**Step 3 — El Roi:** "El Roi- Prinx Emmanuel" section 1 is the four lines
ending "Ancient of days", section 2 is the two long "deepest secrets" /
"omega and alpha" lines, section 3 starts at "Jehovah elroi" — matches the
expected shape exactly. (A second, differently-worded song, "Jehovah el roi
- Prinx emmanuel", also matched the `LIKE` query; it is a distinct song
entry, unaffected.)

**Step 4 — whole book, restricted to the 1,944 songs actually re-imported
from the current `SongBooks/CLC.json`** (see note below on why the raw
`SELECT * FROM songs` count differs):

| Measure | Value |
| --- | --- |
| songs | 1,944 |
| sections | 17,647 |
| maxLines | 6 |
| over6 | 0 |
| empty | 0 |
| most sections in one song | 85 ("Jesu ni Logo") |

Top 5 by section count: "Jesu ni Logo" (85), "GBAGBE OSHI" (84), "Moyo
wanga - Gabriel Eziashi" (64), "Moyo wanga, Yesu moyo" (64), "Mo dinla"
(61). All five are genuinely long African praise/call-and-response songs —
each "section" is a short repeated call-and-response line or refrain
(e.g. "Logo" / "GBAGBE OSHI" as standalone one-line sections alternating
with response lines), not a normal song fragmented by a packing bug.

**Note — local.db has 278 rows `SongBooks/CLC.json` does not contain.**
Running the brief's Step 4 query unmodified against the full `songs` table
(2,222 rows, not 1,944) returns `maxLines: 27`, `over6: 69`. These 278 rows
are not stale garbage: they are real content from four other songbook
files this spec never accounted for — `New songbook.json` (172),
`Concordance.json` (101), `CONFESSIONS.vpc` (3), `Account Numbers.json`
(2). This spec's "Facts that shaped the design" section above only
profiled `CLC.json`; `local.db` was seeded at some point from all five
files. See "Re-import result: the other four songbooks" below for the
follow-up that closes this gap.

## Re-import result: the other four songbooks

`local.db`'s 278 non-CLC rows trace to four other songbook files in
`SongBooks/`, none of which this spec's design phase examined:
`New songbook.json`, `Concordance.json`, `CONFESSIONS.vpc` (a zip, read via
`readSongbookFile` from `src/lib/vpc.ts`), and `Account Numbers.json`.
Applied the same guid-matching re-import used for `CLC.json` to each, in
the same run against `local.db` (same backup as above covers this too):

| File | Songs in file | added | updated | unchanged | skipped |
| --- | --- | --- | --- | --- | --- |
| `New songbook.json` | 172 | 0 | 84 | 88 | 0 |
| `Concordance.json` | 101 | 0 | 19 | 82 | 0 |
| `CONFESSIONS.vpc` | 3 | 0 | 1 | 2 | 0 |
| `Account Numbers.json` | 2 | 0 | 0 | 2 | 0 |

172 + 101 + 3 + 2 = 278, exactly the row count that was previously
unaccounted for. `added` is 0 in every file because every guid already
existed in `local.db` from the original seed import; `skipped` is 0
everywhere (nothing hand-edited). `Concordance.json` and
`Account Numbers.json` hold non-song content (numbered outlines,
scripture-reference lists) which is grouped by the same section rules as
songs — expected, not a defect.

Re-ran Step 4's whole-book query unmodified (no guid filtering needed
now) against the full, unfiltered `songs` table:

| Measure | Value |
| --- | --- |
| songs | 2,222 |
| sections | 18,766 |
| maxLines | 6 |
| over6 | 0 |
| empty | 0 |

Clean across all 2,222 rows — the `over6`/`maxLines` values that showed up
in the earlier unfiltered run are gone now that all five source files have
been re-imported. Top of the most-sections list picked up one new entry
from the other books: "FMA" (66 sections) — a leadership-training outline
("Class Assessment", "Five Levels of Leadership", "Burden of Leadership",
...) from one of the non-CLC books, correctly split into many short
numbered-point sections, not a fragmented song.

## Re-import result: the blank-line invariant (final whole-branch review)

The final whole-branch review found that `cleanSlideText` collapsed 3+
newlines to 2 but never removed a blank line sitting *inside* a single
slide, and a multi-line slide is stored whole. The editor joins sections
with a blank line and Save splits back on one, so a surviving internal
blank line was indistinguishable from a real section break: opening a song
in the editor and pressing Save with no edit could silently change its
section count. `toSlides()` in `src/lib/videopsalm.ts` now collapses any
run of blank lines inside a slide's cleaned text to a single newline,
holding the invariant that no stored section ever contains a blank line.

Measured against `SongBooks/CLC.json` (1,944 songs), before and after that
fix:

| Measure | Before | After |
| --- | --- | --- |
| `blankInside` (sections containing an internal blank line) | 32 | 0 |
| `rtFail` (songs whose section count changes on open-and-Save with no edit) | 15 | 0 |
| `untrimmed` (sections starting or ending with a blank line) | 11 | 0 |

`rtFail` reproduces exactly, including the reported case: one of the two
songs titled "Elu agogo" (there are two distinct entries) went from 20
sections to 24 on an open-and-Save round trip before the fix, and stays at
20 after it.

The quick-add path was checked, not assumed safe: `sectionsFromLyrics`
(mechanical split) and `sectionsFromLlmReply` (the LLM path) both route
every candidate section through `splitOnBlankLines` before it is stored,
which by construction cannot leave a blank line inside a returned piece —
splitting always happens exactly at the blank line. Confirmed by
inspection and by 20,000-trial fuzzing over newline-heavy input in each
path; no code change was needed there.

**Repair of the already-stored data.** Backed up first
(`npm run db:backup` → `backups/lightdesk-2026-09-07T21-03-54-439Z.json`),
then re-imported all five songbook files against `local.db` through the
fixed parser, the same guid-matching method Task 8 used. `edited_at` is
still unset on every row, so nothing was skipped:

| File | Songs in file | added | updated | unchanged | skipped |
| --- | --- | --- | --- | --- | --- |
| `CLC.json` | 1,944 | 0 | 15 | 1,929 | 0 |
| `New songbook.json` | 172 | 0 | 6 | 166 | 0 |
| `Concordance.json` | 101 | 0 | 0 | 101 | 0 |
| `CONFESSIONS.vpc` | 3 | 0 | 0 | 3 | 0 |
| `Account Numbers.json` | 2 | 0 | 0 | 2 | 0 |

`updated` (15 for `CLC.json`, 6 for `New songbook.json`) lines up with the
songs that actually held an internal blank line under the old code; every
other row was already byte-identical under the new rules. `added` is 0
everywhere because every guid already existed from the prior re-import.

Final unfiltered whole-book statistics, over all 2,222 stored rows:

| Measure | Value |
| --- | --- |
| songs | 2,222 |
| sections | 18,760 |
| maxLines | 6 |
| over6 | 0 |
| empty | 0 |
| blankInside | 0 |
| rtFail | 0 |
| untrimmed | 0 |

Clean across the whole table, including the two invariant checks the
brief's original Step 4 query didn't cover.
