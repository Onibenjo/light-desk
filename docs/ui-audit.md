# Lightdesk UI audit

Date: 2026-09-15 (second pass; first pass 2026-09-14). Branch: `ui-layout`. Scope: every page under `src/app` (desk with its three tabs, `/messages`, `/setlists`, `/log`, `/diag`, `/songs/import`, `/unlock`), the command palette and the shortcut guide.

Method: read every UI source file; drove the local dev server in Chrome through agent-browser at 1280×900 and at an emulated 390×844, on the desk, an open song, the message library, setlists, the log, verse sources and import; measured horizontal overflow, layout shift during a lookup, and contrast ratios by computation. The first pass also ran the Impeccable mechanical detector over every UI file (zero findings).

Mode: Operate. The operator is copying text into Mixlr mid-service, often on the venue wifi, sometimes on a phone. Scanability and reliability outrank expression.

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | Sound; the untested edge is how screen readers read the uppercase labels |
| 2 | Performance | 4 | Blur gone and fonts self-hosted; document keydown effects still re-subscribe every render |
| 3 | Responsive design | 4 | No overflow at 390px on any page; never checked on a real phone |
| 4 | Theming | 4 | One warm scale, `color-scheme: dark`, and the accent reserved for action and position |
| 5 | Implementation integrity | 3 | Shared shell, toast, row and button classes; page-level helpers still duplicated |
| **Total** | | **19/20** | **Strong. Finish the de-duplication, then verify on the real devices.** |

First pass scored 14/20 (3, 3, 2, 3, 3).

## Design direction

**Booth console** (chosen 2026-09-15, one of three options offered). Warm charcoal in place of Tailwind's cool zinc, tinted toward the CLC orange; a condensed face for the console and a legibility-first face for anything that gets copied; the accent kept for "act here" and "you are here".

- **Type**: Barlow Semi Condensed for buttons, tabs, headings and badges; Atkinson Hyperlegible Next (Braille Institute; I/l/1 and rn/m can't be confused) for verse, lyric and message text, and as the body default. Both self-hosted by `next/font` at build time, so the venue wifi never decides whether the desk has its fonts. Set in `layout.tsx`, with roles assigned in `globals.css`.
- **Colour**: `--color-ink-50…950` in `globals.css`, replacing every `zinc-*` class. Page #0c0b0a, panels #171513, raised #221f1c, borders #3a3530. Measured on the page: body text 17.5:1, `--muted` 7.8:1, accent 6.5:1, black on accent 6.9:1; `--muted` is 6.5:1 on a raised panel. `ink-500` is for borders and disabled states only, never text.
- **Accent discipline**: orange now marks only a primary button, the cursor in a song or message, the selected tab's icon, the focused field, and the active-setlist dot. Selected toggles are white-on-ink (`.btn-on`). Matched words in song search are bold on a grey highlight. Log kinds are neutral badges with icons, so green keeps meaning "copied".
- **Identity**: the CLC mark from the church website (`public/brand/clc-logo.png`) on the desk, the lock screen and every page header. `proxy.ts` lets `brand/` through the PIN gate so it loads before unlocking.

## Executive summary

- Audit health score: **19/20** (Strong)
- Issues: 0 P0, 0 P1, 3 P2, 6 P3
- All 21 findings from the first pass are closed. The three P1 phone breakages and the P1 keyboard trap were fixed on 2026-09-14/15; the remaining first-pass items (emoji icons, `color-scheme`, 10px badges, `backdrop-blur`, the busy line's layout shift, page chrome, duplicated toast and `copyText`) were closed by the three redesign commits.
- What is left is tidying, not repair: page-level helpers duplicated between the two admin pages, thirteen inline button class strings in the desk components, and a handful of P3s.
- Recommended next steps: finish moving the desk components onto `.btn`, share `Problem`/`RenameField`, then check the church laptop and a real phone.

## What changed since the first pass

Three commits on `ui-layout`:

- `60fb0de` — the booth console look; the verse card as a preview of the Mixlr post; song and message rows sharing `SectionRow` with a cursor, copied checks and a progress strip.
- `2ef0f4d` — `PageShell` across the five non-desk pages; the message library's row actions behind a "More" disclosure; shared button, field and badge classes; one `Toast` and one `copyText`; accent discipline.
- `4febdd5` — the busy spinner inside the reference box; "Earlier today" on the Verses tab.

Verified on screen: the verse card and its banners, an open song (cursor, checks, progress, pinned, matched), song search, the message library including an armed Delete disarming itself after 4s, setlists, the log, verse sources, import, the lock screen, and every page at 390px.

Measured rather than assumed:
- The reference box does not move during a slow lookup: its top stayed at 150px before and during a 2.5s lookup (the first-pass finding was a ~30px jump).
- `document.documentElement.scrollWidth === innerWidth` (390) on the desk, `/messages`, `/log`, `/setlists` and `/diag`.
- `getComputedStyle(document.documentElement).colorScheme` is now `dark` (it was `normal`).
- Both font families report `status: "loaded"`.

## Detailed findings

### P2 Minor

**[P2] Page-level helpers are duplicated between the two admin pages**
- Location: `src/app/messages/page.tsx:55,86,125,135` and `src/app/setlists/page.tsx:48,79,118` — `Problem`, `RenameField`, `sentence`, `tidy`
- Category: Implementation integrity
- Impact: `RenameField` (37 lines, including the comment explaining why it saves on blur) and `tidy` are byte-identical in both files, so a fix to one will miss the other. `Problem` differs in exactly the ways a prop would cover: the message library names the admin PIN and falls back to `DeniedHint`, setlists names the church PIN. `sentence` exists in the message library; setlists inlines the same expression instead.
- Recommendation: Move `RenameField` and `tidy` to shared files beside `PageShell`, and `Problem` with the PIN wording and the denied branch as props.

**[P2] Thirteen inline button class strings remain in the desk components**
- Location: `src/app/page.tsx` (3), `src/app/SongsTab.tsx` (3), `src/app/SongEditor.tsx` (3), `src/app/MessageView.tsx` (2), `src/app/CommandPalette.tsx` (1)
- Category: Implementation integrity
- Impact: The five admin pages now use `.btn`; the desk does not, so the same control can drift again — the drift that produced 26px and 34px versions of the same action in the first pass.
- Recommendation: Move them onto `.btn` and its modifiers. The verse card's action row is the one place where a size other than the default may be worth keeping, and it should then be a named modifier.

**[P2] The song and message view headers are built twice**
- Location: `src/app/SongsTab.tsx:596-609`, `src/app/MessageView.tsx:32-45`
- Category: Implementation integrity
- Impact: Title plus a button group, written out in both files, already differing in their wrap rules (`wrap-break-word` against `wrap-anywhere`).
- Recommendation: One small header component, the way `SectionRow` now serves both lists.

### P3 Polish

**[P3] Document keydown effects re-subscribe on every render**
- Location: `src/app/page.tsx:508`, `src/app/SongsTab.tsx:407`, `src/app/MessagesTab.tsx:175`
- Impact: No dependency array, so the listener is torn down and re-added on every render, including every keystroke in a search box. Carried over from the first pass; cheap, but still wrong.

**[P3] The toast still covers the bottom row**
- Location: `src/app/Toast.tsx`
- Impact: Fixed at the bottom for 3.5s over the row the operator may be about to tap. `pointer-events-none` lets the tap through, but the text underneath is hidden.

**[P3] Uppercase labels are exposed uppercase to the accessibility tree**
- Location: the desk tabs (`page.tsx`), `.badge`, `.eyebrow`
- Impact: Chrome reports the tab's name as "VERSES", because the accessible name takes the transformed text. Some screen readers spell short all-caps words out letter by letter.
- Recommendation: Check with VoiceOver and NVDA. If it reads badly, keep sentence case in the markup and uppercase only in CSS via `font-variant-caps`, or give the tabs an explicit `aria-label`.

**[P3] Atkinson draws zero with a slash**
- Impact: References read "3Ø" rather than "30". The font does this deliberately to separate 0 from O, and it suits a booth, but nobody has seen it on the church laptop yet.
- Recommendation: Ask the operator. `font-feature-settings: "zero" 0` would undo it if it reads as a glyph error.

**[P3] Two font families are now downloaded**
- Impact: About 200 KB of woff2 across both families in the dev build; a production build subsets further, and this has not been measured. Self-hosted and cached, so it costs the first load in the booth only.
- Recommendation: Measure after `next build`; drop unused Barlow weights (400, 500, 600 and 700 are requested) if any are unused.

**[P3] `/setlists` has never been seen with real data**
- Impact: The local database has no setlists, so the redesigned rows, the "Edit for this service" editor and the active-setlist marker were only checked empty.

**[P3] Real devices are unverified**
- Impact: Everything responsive was checked in an emulated 390×844 viewport. iOS safe-area insets, the 16px input floor, touch targets and the installed-app chrome need the church laptop and a phone.

## Patterns and systemic issues

- **Duplication has moved up a level.** The repeated button strings and copies of the toast are gone; what is left is whole helpers duplicated between the two admin pages, which is easier to see and to fix.
- **Two type roles are now load-bearing.** Every `<button>` takes the console face from a base rule, so a button that carries copyable text has to ask for `font-text`. Five list rows needed it during this pass; a new one will need it too.
- **Trust the words, not the colour.** Badges, log kinds and selected states carry a word or an icon, so the palette is free to mean one thing at a time.

## Positive findings

- The verse result reads as the Mixlr post it will become: reference and translation as a header, verses at 18–19px, sources in a banner only when the text might be wrong.
- Song sections show three states at a glance across the booth: orange bar and number for the cursor, green check for copied, and a sticky "Section 3 of 13 · 2 copied" strip.
- "Earlier today" re-runs the lookup rather than re-copying logged text, so a returning verse still passes every source check and the AI-quoted warning. Confirmed with Jude 24 (MSG): red banner, nothing copied.
- Copied sections keep full-contrast text instead of the old `opacity-60`, which read as disabled.
- The busy state no longer moves the page.
- A global `:focus-visible` ring in `@layer base`, with a comment explaining the cascade decision.
- Live regions stay mounted, so announcements are not missed; the two-press Delete announces its arming and disarms after 4s.
- Roving `tabIndex` with real DOM focus on song sections and message parts; the command palette is a proper `combobox` + `listbox`.
- Safe-area insets and a 16px input floor on coarse pointers to stop iOS zoom.
- 425 tests pass, including 9 covering the log parsing behind "Earlier today".

## Recommended actions

1. **[P2]** Share `Problem` and `RenameField` (and `sentence`, `tidy`) between `/messages` and `/setlists`.
2. **[P2]** Move the desk components onto `.btn`; add the one modifier the verse card needs.
3. **[P2]** One header component for the song and message views.
4. **[P3]** Dependency arrays on the three document keydown effects.
5. **[P3]** Screen-reader check of the uppercase labels; ask the operator about the slashed zero.
6. **[P3]** Check the church laptop and a real phone, and `/setlists` with a real setlist in it.
