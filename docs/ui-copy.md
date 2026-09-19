# Lightdesk interface copy

The words the interface uses, so every screen says the same thing the same way. This covers the app's own words only. Message text in the library and verse text are the church's and the Bible's; they are never edited to fit this sheet.

## Who is reading

- **During a service**: one media volunteer at the church laptop, listening to the pastor and pasting into Mixlr. Under time pressure, glancing, not reading. The fewest words that still say what happened and what to press.
- **The night before**: the same team on a phone, preparing setlists and the library. Calmer, but on a small screen with no keyboard shortcuts.

## Voice

- Plain, short, second person, sentence case. Say what happened, then what to do: "Copied Romans 8:28 (NKJV) — paste in Mixlr".
- An em dash with spaces (" — ") joins a fact to its instruction in toasts and errors. No hyphen-as-dash.
- Contractions: can't, couldn't, didn't, isn't.
- Loud only when the text on screen might be wrong (the AI-quoted verse). Everything else stays calm; errors are not alarms.
- Device-neutral verbs. Never "tap" or "click" in text that both a laptop and a phone can show. "Choose", "try again", "press" only for a named key.
- Correct plurals every time: "1 song", "2 songs", "1 part".
- No jokes, no exclamation marks, no "Oops".

## Terms

| Use | Means | Don't use |
|---|---|---|
| desk | the main screen with Verses, Songs, Engagement | home, dashboard |
| copy | what the app does: puts text on the clipboard | send (the app does not send anything) |
| paste in Mixlr | what the operator does next | post it, send it |
| verse, passage, chapter | Bible text; a passage is a range | |
| song | a songbook entry | track, hymn |
| section | one numbered part of a song, copied as one Mixlr post | verse (ambiguous with Bible verses), slide |
| message | one entry in the engagement library | announcement (that is one section of the library) |
| part | one Mixlr post of a message or a long passage | post (as a noun), chunk |
| engagement library, library | the engagement document, edited at /messages | message library, engagement document (in the UI) |
| Engagement | the tab holding the library. Never "Messages": in church speech "the message" is the sermon, so the old label sent operators to the wrong tab | messages, engage |
| section (of the library) | a group of messages, e.g. Apologies | category, group |
| service order | the order of service: the songs and messages for one service, in order | setlist, playlist, running order |
| active service order | the one shown at the top of Songs and Engagement | active setlist, current, live |
| edited for this service | a service-order item whose text differs from the library | override, custom |
| pin, pinned | the one song section kept for quick copying again (the chorus) | favourite |
| log | everything copied, by day | history |
| verse sources | the Bible text providers; the diagnostics page | diag, config |
| lock, locked, unlock | the PIN gate | log in, sign in, session |
| church PIN, admin PIN | the two PINs | password, passcode |

"Post" may appear once as an explanation of what a part is ("each part is one post in the Mixlr chat"). Everywhere else the noun is "part".

The code does not follow this sheet. Identifiers, files, routes and API paths stay `setlist` and `messages` (`/setlists`, `SetlistBar`, `/api/messages`); only what the operator reads says "service order" and "Engagement". Renaming both at once would have made the diff unreadable and the URLs people have bookmarked dead, and the code words are not wrong — they are just not the operator's.

## Recurring labels

| Situation | Label |
|---|---|
| Back from a secondary page | ← Desk |
| Back from an open song / message | ← Songs, ← Engagement |
| Retry after a failure | Try again |
| Unlock link, church | Enter the PIN |
| Unlock link, admin | Enter the admin PIN |
| Unlock button on /unlock | Unlock this device |
| Two-press delete, armed | Confirm delete |
| Clipboard refused | Couldn't copy — try again |
| Page titles (h1) | Log · Verse sources · Engagement library · Service orders · Import a songbook |

## States

- **Error**: what failed, why when known, what to do. "Couldn't load the log. This device is locked — enter the church PIN again." Never an internal code, never a raw server word.
- **Empty**: distinguish first use ("No setlists yet"), no results ("No song has all of those words"), and failure (an error, never an empty message).
- **Loading**: name the operation. "Loading the log…", not "Loading…".
- **Success**: brief, and only mention the next step when it changes what the operator does.

## Accuracy

Claims about where text comes from must match `src/lib/sources.ts`: bundled KJV, cache, YouVersion, API.Bible, a BibleGateway fallback, and a last-resort AI-quoted text that is marked in red and never copied automatically.
