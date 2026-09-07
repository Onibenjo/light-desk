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

**Note — local.db has 278 rows the current songbook file no longer
contains.** Running the brief's Step 4 query unmodified against the full
`songs` table (2,222 rows, not 1,944) returns `maxLines: 27`, `over6: 69`.
Splitting the table by whether each row's guid appears in the freshly
parsed `SongBooks/CLC.json` shows this is entirely explained by 278 rows
whose guid is absent from the current file (e.g. "ACCOUNT NUMBER",
"CITIZENS OF LIFE CHURCH HONOUR", "Power", "Hope", "Faith", "Love", "Peace
- eiréné" — these read as church admin/word-study entries from an older or
different import, not songs the current songbook re-import touches at
all). The 1,944 guids that ARE in the current file all landed exactly on
the expected shape (maxLines 6, over6 0). The 278 orphaned rows were left
untouched, per instructions not to patch data — they are outside the
scope of this migration since they have no corresponding entry to
re-import from.
