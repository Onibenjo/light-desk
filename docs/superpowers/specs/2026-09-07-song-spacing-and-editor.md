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
