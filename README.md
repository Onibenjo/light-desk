# Lightdesk — CLC Mixlr chat desk

One text box. Type a Bible reference the way you'd say it (`rom 8 28`, `1 cor 13 4-7`, `ps 23`, `john 3 16 amp`) or describe the verse (`walk on snakes and not be bitten`), press **Enter**, and the verse is on your clipboard formatted exactly the way the CLC chat already posts it. Alt+Tab to Mixlr, Ctrl+V, Enter.

Milestone 1: verses. Milestone 2: the message library (the engagement document). Milestone 3: songbook and setlists.

## How it works

- **Reference parsing** is local and instant. Sloppy input is fine; single-chapter books (`jude 24`) and glued forms (`1cor13v4`) work. Anything that isn't a reference goes to the description search.
- **Description search** sends the phrase to an LLM through OpenRouter (Claude Haiku by default; any model via `LLM_MODEL`) and gets back up to 3 candidate references. Press `1`, `2` or `3` to pick. The model never supplies verse text — only the reference.
- **Verse text** comes from, in order: bundled KJV (public domain, offline) → the Turso cache → YouVersion Platform API → API.Bible → BibleGateway page scrape (last resort; see below) → AI-quoted from the model's memory (last-last resort: shown with a red warning, never auto-copied, never cached — the operator must read it and click Copy; `DISABLE_LLM_FALLBACK=1` turns it off). Everything fetched from a real source is cached, so a verse is only ever fetched once.
- **Formatting**: line 1 reference, line 2 full translation name, then `28. text` one verse per line. Plain text. Passages longer than `MAX_MESSAGE_CHARS` (default 1000) are split into parts with the header repeated.
- **Keys**: `+` copies the next verse as its own message. **Whole passage** re-copies everything looked up in that range. **Chapter** opens the full chapter so you can click any verse. **Esc** clears.
- **Log**: everything copied is stored with a timestamp (handover, re-send, and pilot metrics).
- **Messages**: the engagement document — greetings, prayer introductions, the confession, account details, next-service lines, apologies — lives in the 💬 Messages tab and in ⌘K. A one-post message copies on tap; a long one (the confession) sends part by part like a song. Service-order messages go into a setlist beside songs, and a setlist can carry its own text for one service (the date in a next-service line). The library is edited at `/messages` with the admin PIN; an empty library offers **Load starter messages**, seeded from `src/data/messages.seed.json`.
- **Branches**: one deployment serves several church branches. Each branch has its own church PIN and optional admin PIN, and the PIN a device unlocks with decides its branch. With no admin PIN, the branch's church PIN carries admin rights. PINs are 4–32 characters, unique across all branches, and may not equal `NETWORK_PIN`. Service orders and the copy log are per branch; the songbook is shared (any branch admin can import or edit, and an edit reaches every branch).
- **Engagement library and branches**: each message is either "All branches" (shared; any branch admin may edit it) or "<branch> only". Shared messages can hold `{key}` tokens such as `{testimonyEmail}`, `{offeringAccounts}` or `{midweekTime}`; the branch's own values are set at `/branch` (Branch settings) and filled in on copy. A message that uses a key the branch hasn't set is not copied, and the operator is told which key. `[DATE]`-style placeholders are still typed by hand.
- **Access**: a PIN unlocks a device for a year (cookie). API routes refuse without it. Search endpoints are rate-limited. Changing a branch's PIN locks that branch's devices on their next request; other branches are unaffected.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you have; everything is optional locally
npm run dev                  # http://localhost:3000
npm test                     # parser + formatter tests
```

With no keys at all you still get KJV and the log (SQLite file `local.db`). With no PIN set the app is open in development only; a production deploy with no PINs stays locked.

## Deploy (Vercel + Turso)

1. **Turso**: `turso db create lightdesk` → `turso db show lightdesk --url` and `turso db tokens create lightdesk`. Put them in `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Tables are created on first request; no migration step.
2. **Vercel**: import the GitHub repo, add the environment variables from `.env.example`, deploy. Node runtime is used for API routes (cheerio + libsql).
3. **PINs and secrets**:
   - `SESSION_SECRET` (any long random string) is required in production: without it no device can unlock, because sessions are refused rather than signed with a known default. Changing it logs every device out.
   - `CHURCH_PIN` (give to the media lead) and optional `ADMIN_PIN` only seed branch 1 on first boot, when the database has no branch. After that, PINs are changed at `/branches`. Devices unlocked before the upgrade stay unlocked. `FIRST_BRANCH_NAME` (default "CLC Ilorin") names branch 1 on that first boot only.
   - `NETWORK_PIN` opens `/branches`, where you add a branch, rename it or change its PINs. It is typed into the page each visit and never stored; keep it off church devices. Wrong guesses are capped at 10 a minute per client and 30 a minute across all clients.
   - A production deploy with no PINs stays locked.
   - PIN hashes are unsalted SHA-256 and are included in database backups, so treat backups as secret.
4. On the church laptop: open the URL in Chrome, enter the PIN once, then Chrome menu → *Install Lightdesk* so it opens as its own window next to Mixlr.

## Verse source keys

| Env | Where | Notes |
| --- | --- | --- |
| `YOUVERSION_APP_KEY` | https://developers.youversion.com | Free for non-commercial use. Translations are enabled per app key — after approval call `GET https://api.youversion.com/v1/bibles?all_available=true` with header `X-YVP-App-Key` and confirm NKJV/AMP/AMPC/NLT/TPT are listed; if the numeric ids differ from `src/lib/translations.ts`, override with `YOUVERSION_IDS=NKJV=114,NLT=116,…`. |
| `APIBIBLE_KEY` | https://scripture.api.bible | Free key; licensed translations need a request. Set the bible ids with `APIBIBLE_IDS=NKJV=<id>,…` (from `GET /v1/bibles`). KJV id is pre-filled. |
| `LLM_API_KEY` (+ `LLM_MODEL`) | https://openrouter.ai/keys | Description search only. OpenRouter is the default provider: one key, any model, prepaid credits act as a spend cap. Default model `anthropic/claude-haiku-4.5`; `meta-llama/llama-3.3-70b-instruct:free` runs on the free tier (50 req/day, 1,000/day once you have bought $10 of credits). `LLM_PROVIDER=anthropic` or `openai` (any OpenAI-compatible host, including a local Ollama) are also supported — see `src/lib/llm.ts`. A Sunday of searches costs a few cents. |
| `DISABLE_GATEWAY_FALLBACK=1` | — | Switches the scraper off. |

### About the BibleGateway fallback

`src/lib/sources.ts → fromBibleGateway` fetches the same page URL the volunteers already use (`/passage/?search=exo 14.13-16&version=NLT`) and reads the `span.text.Book-Ch-V` spans. It is not an API, it is against BibleGateway's terms of use, and it will break whenever they change their markup. It is tried **only** after both APIs fail, the UI shows an amber "BibleGateway fallback" label when it was used, and every result is cached so the same verse is never scraped twice. It could not be exercised from the sandbox this was built in (BibleGateway answered 403 there), so treat the selectors as best-effort until tested from the church laptop. Remove it before ever making the repo public.

## Layout

```
src/app/page.tsx          the desk UI (client)
src/app/unlock/page.tsx   PIN screen
src/app/api/*             passage, chapter, find-verse, log, unlock
src/proxy.ts              PIN gate (cookie check) for every route
src/lib/reference.ts      sloppy-reference parser
src/lib/format.ts         chat formatting + splitting
src/lib/sources.ts        KJV → cache → YouVersion → API.Bible → BibleGateway
src/lib/findVerse.ts      description → candidates
src/lib/llm.ts            provider switch (Anthropic / OpenAI-compatible)
src/lib/books.ts          66 books, aliases, USFM/OSIS codes
src/lib/translations.ts   codes, names, API ids
src/db/schema.ts          verse_cache, sent_log, songs, message_sections, messages, setlists
src/app/messages/page.tsx the message library editor (admin)
src/lib/messageEdit.ts    what a message may hold; messageSearch.ts, messageLibrary.ts beside it
src/data/kjv.json         KJV text, public domain
tests/                    vitest
```

## Still to do

- Calibrate the Mixlr message limit (paste one long block and see) and set `MAX_MESSAGE_CHARS`.
- Confirm YouVersion / API.Bible translation ids once keys are approved.
- M3: songbook, WhatsApp set import, quick-add.
