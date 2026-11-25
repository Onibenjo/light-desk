# Paste setlist — design

## Why

The choir sends the setlist as a chat message: on Saturday for Sunday, and on
Tuesday night or Wednesday morning for midweek. Someone then builds the service
orders by hand and finds out during service which songs aren't in the song
bank. This screen turns the pasted message into service orders and shows the
missing songs ahead of time.

A Telegram bot that does the same can come later. It is out of scope here.

## What you see

- **Service orders** gets a **Paste setlist** button. It opens a screen with a
  text box, a date and a **Read setlist** button. The date defaults to the next
  Wednesday or Sunday, whichever comes first, counting today.
- After reading, each service in the message is a card named
  `<Ddd D Mon> · <Service>`, for example `Sun 29 Nov · First Service`. A
  message with no service heading gives one card, named `<date> · Service`.
  Each card can be renamed.
- Inside a card, songs are grouped under the choir's section headings (First
  worship, Praise, …). The sections only appear on this screen. Saved orders are
  plain lists.
- Each song has one status:
  - **Matched** (green): shows the song bank title. It can be changed.
  - **Pick one** (amber): up to three candidates to choose from. The song stays
    unsaved until one is picked.
  - **Missing** (red): an **Add to song bank** button opens the existing
    quick-add (`POST /api/songs/quick-add`), with the title filled in. When it
    saves, the song becomes matched with the new song's id.
- Any song can be removed from a card.
- **Save orders** writes one order per card, with songs in order. If an order
  with the same name exists in the branch, the card shows "This will replace
  the existing order" before saving, and saving replaces its items. Songs still
  missing or unpicked are left out. After saving, the screen lists them under
  each order as "Not in song bank yet".

## How it works

### Reading: `POST /api/setlists/parse`

Request `{ text, date }`. The response is the parsed services with each song's
match status (below), plus `readWithoutAi: boolean`.

1. **LLM.** `complete({ system, user: text })` from `src/lib/llm.ts`, with a
   setlist system prompt. It asks for JSON only:
   `{ services: [{ name, sections: [{ name, songs: [{ title, alternatives: string[], artist?: string }] }] }] }`.
   The prompt says to:
   - take names in brackets as alternatives;
   - drop lyric lines and other notes;
   - fix obvious typos;
   - keep the order;
   - never invent songs.
2. **Check.** The output is validated against that exact shape: strings
   trimmed, empty songs dropped, a size cap. If it fails, or the LLM isn't
   configured or errors or times out, the rule-based parser is used instead and
   `readWithoutAi` is true.
3. **Rule-based parser** (`src/lib/setlistParse.ts`, pure):
   - A line that names a service (e.g. `FIRST SERVICE`, `SECOND SERVICE`,
     `MIDWEEK`) starts a service.
   - A short line ending in `:`, or a known heading such as `worship` or
     `praise`, starts a section.
   - Bulleted or numbered lines are songs. `(…)` gives alternatives and
     ` - Artist` / ` by Artist` gives the artist.
   - Other lines are ignored.

### Matching (server, `src/lib/setlistMatch.ts`)

For each song, `searchSongs(buildIndex(songs), name)` is run for the title and
each alternative, over the branch's song bank (`loadSongs`). The best score for
each song id is kept.

- **Matched:** the top score is above a threshold and clearly ahead of the
  second.
- **Pick one:** there are candidates, but no clear winner. Up to three are
  offered.
- **Missing:** no candidate.

The thresholds are set from the sample setlist in the tests. The LLM never
chooses a song id.

### Saving: `POST /api/setlists/import`

Request `{ orders: [{ name, songIds: string[] }] }`.

- For each order, find the branch's setlist with that exact name. Update its
  items if found, and create it otherwise.
- Items use the existing shape `{ kind: "song", id, title }`, with titles taken
  from the song bank. Unknown ids are rejected.
- Branch auth works as it does for the existing setlist routes.

The desk and the existing order screens don't change.

## Errors

- **LLM unavailable or bad output:** the rule-based parser is used, and the
  screen says "Read without AI; check the grouping."
- **No songs found:** the screen shows "Couldn't find any songs" and keeps the
  pasted text.
- **Save fails:** the screen shows the error, and the cards stay as they were so
  the save can be retried.

## Testing

- `setlistParse`: the team's sample (two services, three sections each); lines
  with brackets and artists; lyric lines ignored; no headings.
- LLM output check: valid JSON is accepted. Malformed JSON, the wrong shape and
  an empty result fall back to the rule-based parser.
- `setlistMatch`: matched, pick one and missing, and a match through an
  alternative name.
- Routes: parse with the LLM stubbed and with no LLM; import creates, replaces
  an existing order by name, and rejects unknown ids.
