# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the media-team volunteer running the Mixlr chat during a Citizens of Light Church (CLC) service.** One person at a time, on a rota, on the church laptop in the media booth, with Lightdesk installed as a Chrome app in its own window beside Mixlr. Their job is to post the right text into the Mixlr chat at the right moment: the verse the pastor just quoted, the next song section, the greeting, the prayer introduction, the account details, an apology when the sound drops. Both halves of the service matter equally: songs and greetings come from a prepared order, sermon verses arrive live and unpredictably.

**Secondary: the same team preparing a service the night before, on a phone.** Setlists (`/setlists`) and the message library (`/messages`) are prepared ahead, not mid-service, and are used on a phone at least as often as on the laptop.

**Audience the copy is written for: the online congregation on Mixlr**, addressed as "Sirs and Mas". They never see Lightdesk itself, only what it copies.

No pastor or non-technical lead uses the desk directly (confirmed 2026-09-14).

## Product Purpose

Lightdesk replaces a Google Doc, a Bible website and a lot of alt-tabbing with one text box. Type a reference the way you would say it, press Enter, and the verse is on the clipboard formatted exactly as the CLC chat already posts it. Songs, greetings, prayers and apologies are one tap away in the same window. Success is a chat where the verse appears seconds after the pastor says it, every song section lands in order, and nothing is ever posted with the wrong wording.

It exists because the previous workflow (find the verse on BibleGateway, copy, reformat, paste; scroll a long engagement document for the right greeting) was too slow for a live service and easy to get wrong.

## Positioning

A single-church tool, not a product for the market: it is built around CLC's exact chat format, CLC's engagement document, CLC's songbook (2,222 songs imported from VideoPsalm) and the Mixlr paste loop. What a generic Bible app could not truthfully copy:

- Verse text comes only from licensed or public-domain sources, never from an AI. The AI is used only to turn a description ("walk on snakes and not be bitten") into a reference, and an AI-quoted verse is the last-last resort, shown with a red warning and never auto-copied.
- The output format is the church's own: reference on line 1, full translation name on line 2, then one numbered verse per line, split into parts at the Mixlr message limit.
- The message library is the engagement document, section by section, with the church's own voice intact.

## Operating Context

- **Live service**: Wednesday evenings and Sunday mornings. The operator hears a reference, types it, pastes into Mixlr, and is already listening for the next one. Every send is logged with a timestamp for handover and re-sends.
- **Prepared order**: the active setlist sits at the top of the Songs and Messages tabs so the operator taps instead of searching. A setlist can carry its own text for one service (the date in a next-service line) without changing the library.
- **Tools beside it**: Mixlr (the chat), VideoPsalm (the songbook source, exported as `.json` or `.vpc`), the church's engagement document (now the message library).
- **Network**: the venue wifi is unreliable. The whole songbook is loaded once and searched locally; verses are cached so nothing is fetched twice; the database is warmed when the desk opens.
- **Access**: one church PIN unlocks a device for a year; an admin PIN guards editing and import. A device unlocked with the church PIN is refused edits with a hint to unlock the admin PIN in a new tab, so unsaved text is never lost.
- **Devices**: the church laptop (Chrome, installed as an app) for the service; phones for preparation. iOS zoom-on-focus and safe-area insets are handled because of the phone use.
- **Rituals in the library**: Greetings, Prayer Before Ambience Jewel, Welcoming Ambience Jewel, Prayer Before Sermon, Confession, Testimony, Recap, Welcoming Pastor, Altar Call, Announcement, Offerings and Tithe, First Timer, Apostolic Blessing, Closing Charge, Next Service, Communion, Special Programs, Apologies.

## Capabilities and Constraints

- Sloppy reference parsing, local and instant (`rom 8 28`, `1cor13v4`, `jude 24`, `john 3 16 amp`); anything else goes to the description search.
- Thirteen translations (NKJV default; KJV bundled offline). One click re-sends the verse on screen in another translation; typing just `tpt` does the same.
- Verse sources in order: bundled KJV, cache, YouVersion, API.Bible, BibleGateway scrape (against its terms; amber-labelled; to be removed before the repo is ever public), AI-quoted from memory (red warning, manual copy only, can be disabled).
- Passages longer than the Mixlr limit (`MAX_MESSAGE_CHARS`, default 1000, not yet calibrated) split into parts with the header repeated; `+` copies the next verse; the whole chapter can be opened and any verse clicked.
- Songs: whole-book local search with fuzzy matching and the matched line shown; sections sent one per message; a pinned section (the chorus) re-sent with one key; quick-add from pasted lyrics; edit and tidy; import from VideoPsalm with a preview before anything is written and songs edited here left alone.
- Messages: the library by section; one-post messages copy on tap, long ones (the Confession) send part by part like a song; searchable from any tab through the command palette.
- Setlists: songs and messages in service order, one active at a time, editable for one service without touching the library; concurrent edits are detected and reloaded rather than merged.
- Log: everything copied, by day, searchable, with a jump to the last Sunday.
- Keyboard-first on the laptop: Enter, `+`, 1 to 9, P, C, Esc, `?`, ⌘K. Touch-first on the phone: no automatic focus stealing, a Go button, 44px targets where they have been added.
- Terminology: "desk" (the main screen), "send" (copy to clipboard for pasting), "section" (one song message), "part" (one message post), "setlist" (the service order), "library" (the message document), "Sources" (the verse-source diagnostics page).
- Constraints: Next.js 16 App Router, Tailwind 4, Turso/libSQL, deployed standalone in Docker (Coolify) or on Vercel. The tree is small: seven pages, no component library.
- Undecided: the Mixlr message limit (to be calibrated by pasting a long block); YouVersion and API.Bible translation ids once keys are approved.

## Brand Commitments

- **Name**: Lightdesk. Church: Citizens of Light Church, abbreviated CLC.
- **Colour**: keep the CLC orange (`#f26b3a`, taken from the church's Mixlr avatar) and the dark scheme; both are deliberate, the dark for the booth. Binding (confirmed 2026-09-14).
- **Logo**: a white flame rising from a ring-and-bar mark on an orange-red gradient disc. The church's own logo file has not arrived yet and must not block work; the version on the church website is on hand at `public/brand/clc-logo.png` (368×368, fetched from https://citizensoflightchurch.org/images/clc-logo.png on 2026-09-14). `public/icons/icon.svg` is a placeholder drawn for the app, not the church mark. A brand guide exists and can be shared later.
- **Voice**: the congregation is addressed as "Sirs and Mas". This is the church's own voice and is binding in all message copy; it is never rewritten, shortened or made generic. Message text is copied to the chat verbatim, so the library is the church's words, not the app's.
- **App voice** (the interface itself): plain, short, second person, tells the operator what happens next ("paste in Mixlr, then copy part 2"). Warnings are loud only when the text on screen might be wrong.

## Evidence on Hand

- The engagement document: `docs/CLC ONLINE SERVICE ENGAGEMENT DOCUMENT.txt` and `docs/CLC_Engagement_ReStructured.docx`, seeded into `src/data/messages.seed.json` (18 sections, 115 messages in the local library).
- The songbook: `SongBooks/` (VideoPsalm exports), 2,222 songs in the local database.
- Bundled KJV text: `src/data/kjv.json` (public domain).
- Photos in `docs/IMG_1476-1479.heic`, content not reviewed.
- The church logo from the website: `public/brand/clc-logo.png`.
- The UI audit of 2026-09-14: `docs/ui-audit.md`.
- No testimonials, metrics, screenshots of the chat, or brand guide in the repo. Do not invent any.

## Product Principles

1. **The verse is never wrong.** Text comes from a real source or is marked as unverified in red; the operator must read it before it can be sent. Speed never overrides this.
2. **One box, one key.** The fastest path is typing a reference and pressing Enter. Every feature is judged by whether it keeps the operator's hands on the keyboard and eyes on the service.
3. **The prepared order is a shortcut into machinery that already works.** A setlist row opens the same song view a search hit opens; nothing is learned twice.
4. **Copy is the church's, not the app's.** Message and verse text is posted verbatim; the interface's own words stay short and out of the way.
5. **Built for the booth and the night before.** A laptop with a keyboard during the service, a phone in the hand the evening before; both are first-class, and neither steals focus from the other.

## Accessibility & Inclusion

No formal standard has been set. Established needs: full keyboard operation on the laptop with visible focus at all times; touch-sized targets and no focus stealing on the phone; text contrast above AA on the dark background (the muted tone is tuned for this in `globals.css`); screen-reader announcements for copy confirmations. A screen-reader operator is not a known user today.
