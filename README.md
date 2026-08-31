# Lightdesk — CLC Mixlr chat desk

One text box. Type a Bible reference the way you'd say it (`rom 8 28`, `1 cor 13 4-7`, `ps 23`, `john 3 16 amp`) or describe the verse (`walk on snakes and not be bitten`), press **Enter**, and the verse is on your clipboard formatted exactly the way the CLC chat already posts it. Alt+Tab to Mixlr, Ctrl+V, Enter.

Milestone 1 (this repo): verses. Milestone 2: canned-message runsheet. Milestone 3: songbook.

## How it works

- **Reference parsing** is local and instant. Sloppy input is fine; single-chapter books (`jude 24`) and glued forms (`1cor13v4`) work. Anything that isn't a reference goes to the description search.
- **Description search** sends the phrase to an LLM through OpenRouter (Claude Haiku by default; any model via `LLM_MODEL`) and gets back up to 3 candidate references. Press `1`, `2` or `3` to pick. The model never supplies verse text — only the reference.
- **Verse text** comes from, in order: bundled KJV (public domain, offline) → the Turso cache → YouVersion Platform API → API.Bible → BibleGateway page scrape (last resort; see below) → AI-quoted from the model's memory (last-last resort: shown with a red warning, never auto-copied, never cached — the operator must read it and click Copy; `DISABLE_LLM_FALLBACK=1` turns it off). Everything fetched from a real source is cached, so a verse is only ever fetched once.
- **Formatting**: line 1 reference, line 2 full translation name, then `28. text` one verse per line. Plain text. Passages longer than `NEXT_PUBLIC_MAX_MESSAGE_CHARS` (default 1000) are split into parts with the header repeated.
- **Keys**: `+` copies the next verse as its own message. **Whole passage** re-copies everything looked up in that range. **Chapter** opens the full chapter so you can click any verse. **Esc** clears.
- **Log**: everything copied is stored with a timestamp (handover, re-send, and pilot metrics).
- **Access**: one church PIN unlocks the laptop for a year (cookie). API routes refuse without it. Search endpoints are rate-limited.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you have; everything is optional locally
npm run dev                  # http://localhost:3000
npm test                     # parser + formatter tests
```

With no keys at all you still get KJV and the log (SQLite file `local.db`). With no PIN set the app is open.

## Deploy (Vercel + Turso)

1. **Turso**: `turso db create lightdesk` → `turso db show lightdesk --url` and `turso db tokens create lightdesk`. Put them in `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Tables are created on first request; no migration step.
2. **Vercel**: import the GitHub repo, add the environment variables from `.env.example`, deploy. Node runtime is used for API routes (cheerio + libsql).
3. **PINs**: set `CHURCH_PIN` (give to the media lead) and `SESSION_SECRET` (any long random string). Changing either logs every device out.
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
src/db/schema.ts          verse_cache, sent_log, messages (M2)
src/data/kjv.json         KJV text, public domain
tests/                    vitest
```

## Still to do

- Calibrate the Mixlr message limit (paste one long block and see) and set `NEXT_PUBLIC_MAX_MESSAGE_CHARS`.
- Confirm YouVersion / API.Bible translation ids once keys are approved.
- M2: import the Google Doc into `messages`, build the runsheet screen.
- M3: songbook, WhatsApp set import, quick-add.
