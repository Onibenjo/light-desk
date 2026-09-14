# Lightdesk UI audit

Date: 2026-09-14. Branch: `ui-audit`. Scope: every page under `src/app` (desk with its three tabs, `/messages`, `/setlists`, `/log`, `/diag`, `/songs/import`, `/unlock`), the command palette and the shortcut guide.

Method: read every UI source file; ran the Impeccable mechanical detector over all of them (zero findings); drove the local dev server in a headless browser at 1280×800 and 390×844; measured touch targets, horizontal overflow, contrast and native-control theming in the DOM.

Mode: Operate. The operator is copying text into Mixlr mid-service, often on the venue wifi, sometimes on a phone. Scanability and reliability outrank expression.

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Import's file chooser is unreachable by keyboard; tabs are three plain buttons |
| 2 | Performance | 3 | `backdrop-blur` on 27 sticky headers over a 2,222-row list; status line causes layout shift |
| 3 | Responsive design | 2 | `/messages` shows one letter per title on a phone; `/log` date row wraps to four lines |
| 4 | Theming | 3 | No `color-scheme`, so native selects, scrollbars and the date picker render light |
| 5 | Implementation integrity | 3 | Coherent and product-specific; emoji icons and four different page headers are the drift |
| **Total** | | **14/20** | **Good. Address the weak dimensions.** |

## Implementation integrity verdict

**Pass.** The detector found nothing. The code expresses one product: a dark desk in the zinc scale with a single CLC orange accent, one tuned muted token, keyboard-first flows with real DOM focus, and copy that talks about Mixlr, Sirs and Mas, the media lead. Nothing here could be swapped into another product unchanged.

The drift is small and repeated rather than structural:

- Emoji used as icons (📖 🎵 💬 📌) render differently on every OS, cannot take the accent, and the pin glyph reads as a red pin on the pin button.
- Four page-header patterns and three "back" affordances across seven pages.
- Button styling is repeated inline about eighty times with no shared primitive, which is how the `/messages` action buttons ended up 26px tall while the same actions on `/setlists` are 34px.
- `copyText` and the toast exist twice (desk and log).

## Executive summary

- Audit health score: **14/20** (Good)
- Issues: 0 P0, 4 P1, 11 P2, 6 P3
- Top issues:
  1. The message library is unusable on a phone: every title truncates to a single letter and the section-name field is 30px wide. The README says setlists are prepared "the night before, on a phone".
  2. A song or message opened on a phone has its title crushed into a 5-line column beside three buttons.
  3. The log's day picker wraps the date label into four lines on a phone.
  4. The songbook import cannot be opened from the keyboard: the file input is `display: none`.
  5. Tabs, the "?" hint, and delete confirmations are invisible or misleading to screen readers and keyboard users.
- Recommended next steps: `/impeccable adapt` for the three phone breakages, `/impeccable harden` for the a11y gaps, `/impeccable polish` to close.

## Detailed findings

### P1 Major

**[P1] Message library rows lose their titles on a phone**
- Location: `src/app/messages/page.tsx:212-239` (row), `:168-180` (section header)
- Category: Responsive
- Impact: At 390px each row shows "V." or "S." and a truncated preview because five fixed-width buttons (Edit, Duplicate, ↑, ↓, Delete) take the whole row. The section name input measures 30×34px. The admin cannot tell messages apart, so cannot edit the right one.
- Standard: WCAG 1.4.10 Reflow
- Recommendation: Stack the row on narrow widths (title block full width, actions in a second row), or collapse the five actions into one overflow control. Give the section name a `min-w` and let the controls wrap below it.
- Suggested command: `/impeccable adapt`

**[P1] Open song and open message titles are crushed on a phone**
- Location: `src/app/SongsTab.tsx:442-455`, `src/app/MessageView.tsx:28-45`
- Category: Responsive
- Impact: "Amazing Grace (Victory) - Tim Godfrey" renders as five stacked lines in an 80px column because the three-button group is `shrink-0` on a `flex` row that never wraps. The operator reads the title to confirm they opened the right song.
- Standard: WCAG 1.4.10 Reflow
- Recommendation: `flex-wrap` the header so the buttons drop under the title below `sm`, or put the title on its own line on narrow widths.
- Suggested command: `/impeccable adapt`

**[P1] Log day picker breaks at phone width**
- Location: `src/app/log/page.tsx:128-176`
- Category: Responsive
- Impact: "Mon 14 Sep 2026" wraps into four lines between the arrows, and "All dates" drops to its own row. The control the operator uses to find last Sunday is the one that breaks.
- Standard: WCAG 1.4.10 Reflow
- Recommendation: Two rows on narrow widths: arrows and label on one, date input and Today and All dates on the next. Give the label `whitespace-nowrap` with a `min-w` that fits the longest date.
- Suggested command: `/impeccable adapt`

**[P1] Songbook import cannot be opened from the keyboard**
- Location: `src/app/songs/import/page.tsx:103-118`
- Category: Accessibility
- Impact: The file input is `className="hidden"` (display: none), so it is not focusable and the wrapping label is not a button. Keyboard and screen-reader users cannot choose a file.
- Standard: WCAG 2.1.1 Keyboard
- Recommendation: Use `sr-only` on the input so it stays focusable, and style the label with `focus-within:` so the dropzone shows the ring.
- Suggested command: `/impeccable harden`

### P2 Minor

**[P2] Tabs are three plain buttons**
- Location: `src/app/page.tsx:508-521`
- Category: Accessibility
- Impact: A screen reader announces "Verses, button" with no selected state and no relationship to the panel. `capitalize` is applied to text that is already capitalised.
- Standard: WCAG 4.1.2 Name, Role, Value
- Recommendation: `role="tablist"` on the nav, `role="tab"` + `aria-selected` + `aria-controls` on each button, `role="tabpanel"` on the content; arrow-key movement between tabs.
- Suggested command: `/impeccable harden`

**[P2] The "?" hint sits under an input that swallows "?"**
- Location: `src/app/page.tsx:620-624`, `src/app/CommandPalette.tsx:54`
- Category: Accessibility / copy
- Impact: The desk keeps focus in the reference box on purpose. Pressing "?" there types a question mark (verified). The hint directly beneath the box says "? all shortcuts", so the advertised key never works from where the operator always is.
- Recommendation: Either let "?" open the guide when the box is empty, or change the hint to the chord that does work from the box (⌘K, then "shortcuts").
- Suggested command: `/impeccable clarify`

**[P2] "Looking up…" status shoves the form down**
- Location: `src/app/page.tsx:543-547`
- Category: Performance / layout
- Impact: The busy line mounts above the form after 300ms, so the input and everything under it jump ~30px while the operator is looking at it, then jump back.
- Recommendation: Reserve the line's height, or put the busy state inside the input (a spinner at the right edge, or the placeholder) so nothing moves.
- Suggested command: `/impeccable layout`

**[P2] Native controls render in the light scheme**
- Location: `src/app/globals.css`, `src/app/layout.tsx:23`, `src/app/log/page.tsx:159`
- Category: Theming
- Impact: `color-scheme` is "normal" (verified), so the select popups on the desk header, scrollbars in the chapter and song lists, and the date picker open white on a black page. The log page patches one input with `[color-scheme:dark]`, which confirms the gap and fixes it in one place.
- Recommendation: `color-scheme: dark` on `:root` (and `<meta name="color-scheme" content="dark">`), remove the local patch.
- Suggested command: `/impeccable polish`

**[P2] Emoji as icons**
- Location: `src/app/page.tsx:518`, `src/app/SetlistBar.tsx:53,64`, `src/app/setlists/page.tsx:165-167`, `src/app/SongsTab.tsx:516`
- Category: Implementation integrity
- Impact: 📖 🎵 💬 📌 are OS glyphs: different shapes on the church laptop (Windows) and the operator's phone, full colour that ignores the accent, and no `aria-hidden` on the tab labels so screen readers read "open book Verses".
- Recommendation: Inline SVG icons (one small set) tinted with `currentColor`, `aria-hidden`, and the tab's text as the accessible name.
- Suggested command: `/impeccable polish`

**[P2] Inconsistent page chrome**
- Location: `src/app/messages/page.tsx:141-146`, `src/app/setlists/page.tsx:96-101`, `src/app/log/page.tsx:116-124`, `src/app/diag/page.tsx:28-41,80-82`, `src/app/songs/import/page.tsx:95,175-179`
- Category: Implementation integrity
- Impact: Four header styles ("Lightdesk · log" with subtitle, "Message library" bare, brand block on the desk, plain h1 on import) and three back affordances: underlined "← Back to the desk", a bordered "← Desk" button, and a lowercase "← back to the desk" at the bottom of the page. Import has no way back until you scroll past the result.
- Recommendation: One shared page header (title, one-line purpose, back control) used by every non-desk page.
- Suggested command: `/impeccable layout`

**[P2] Delete confirmation is silent and never disarms**
- Location: `src/app/messages/page.tsx:196-203,232-238`, `src/app/setlists/page.tsx:142-148`
- Category: Accessibility
- Impact: The button label changes from "Delete" to "Sure?" with no live region, so a screen reader user presses twice without hearing the arming. There is no timeout, so an armed Delete stays armed until the next write.
- Standard: WCAG 4.1.3 Status Messages
- Recommendation: `aria-live` announcement, or `aria-describedby` on the armed button; disarm after a few seconds or on blur. The song editor's two-button pattern (`SongEditor.tsx`) is the better one already in the codebase.
- Suggested command: `/impeccable harden`

**[P2] Rename-in-place fields have no visible affordance on touch**
- Location: `src/app/messages/page.tsx:169-180`, `src/app/setlists/page.tsx:128-133`
- Category: Accessibility / clarity
- Impact: Section and setlist names are inputs with `border-transparent` that only show a border on hover. On a phone there is no hover, so nobody knows the name is editable. Saving on blur also means a phone user who taps away by accident saves.
- Recommendation: A faint underline or edit icon at rest; save on Enter or an explicit control.
- Suggested command: `/impeccable clarify`

**[P2] Touch targets are consistently under 44px on a phone**
- Location: desk tab bar (36px), header Log/Sources (34px), verse action buttons (34px), translation chips (30px), log chips (30px), `/messages` Edit/Duplicate/Delete (26px), "+ Add a message" links (20px), `/setlists` and `/messages` back links (20px)
- Category: Responsive
- Impact: Everything clears the 24px WCAG minimum, but the primary mid-service controls (Copy again, Next verse, the translation chips) are 30–34px. The one thing the desk does well, the 44px pin and + buttons, shows the intent.
- Standard: WCAG 2.5.8 (met); 44px is the mobile convention
- Recommendation: `min-h-11` on the action buttons and chips at `pointer-coarse`, or globally on the desk.
- Suggested command: `/impeccable adapt`

**[P2] 10px badges**
- Location: `src/app/SongsTab.tsx:501,503`, `src/app/MessageView.tsx:34`, `src/app/SetlistBar.tsx:70`, `src/app/setlists/page.tsx:171`
- Category: Accessibility / typography
- Impact: "YOUR LINE", "PINNED", "EDITED" are 10px uppercase. They carry state the operator acts on and are below a readable floor on a laptop across the room.
- Recommendation: 11px minimum with tracking, or 12px sentence case.
- Suggested command: `/impeccable typeset`

**[P2] `backdrop-blur` on every sticky letter header**
- Location: `src/app/SongList.tsx:40`
- Category: Performance
- Impact: 27 sticky headers each blur whatever scrolls beneath them over a 2,222-row list. The comment in this file shows the list was profiled carefully, but the blur was not part of that measurement. On the phone profile it is the most likely source of dropped frames while scrolling.
- Recommendation: Measure; a solid `bg-zinc-950` header loses nothing visible on this palette.
- Suggested command: `/impeccable optimize`

### P3 Polish

**[P3] Toast covers the last visible row**
- Location: `src/app/page.tsx:536-542`
- Impact: Fixed at the bottom, so it sits over the row the operator may be about to tap for 3.5s (verified on the song list). `pointer-events-none` lets the tap through, but the text underneath is hidden.
- Suggested command: `/impeccable polish`

**[P3] Unlock error is not linked to the input**
- Location: `src/app/unlock/page.tsx:32-42`
- Impact: "Wrong PIN" is a sibling paragraph; `aria-describedby` and `aria-invalid` would announce it.
- Suggested command: `/impeccable harden`

**[P3] Document keydown effects re-subscribe every render**
- Location: `src/app/page.tsx:316-341`, `src/app/SongsTab.tsx:253-284`, `src/app/MessagesTab.tsx:140-161`
- Impact: No dependency array, so every render tears down and re-adds the listener. Cheap, but it runs on every keystroke in the search boxes.
- Suggested command: `/impeccable optimize`

**[P3] Duplicated toast and clipboard code**
- Location: `src/app/log/page.tsx:22-56` vs `src/app/page.tsx:56-72,133-137`
- Impact: Two toasts with different timings and tones; the log's `copyText` has no execCommand fallback.
- Suggested command: `/impeccable polish`

**[P3] Meta rows and placeholders clip at phone width**
- Location: `src/app/SongsTab.tsx:324-337`, `:321`, `src/app/MessagesTab.tsx:232`
- Impact: "2222 songs in the book" wraps against three links; "Search messages — sound restored, sermon queen…" and the songbook keyboard hint are cut mid-word at 390px.
- Suggested command: `/impeccable adapt`

**[P3] Diagnostics config grid truncates keys**
- Location: `src/app/diag/page.tsx:47-53`
- Impact: "LLM_…" at 1280px in the three-column grid; the value is readable, the key is not.
- Suggested command: `/impeccable layout`

## Patterns and systemic issues

- **Fixed-width action groups on flex rows** cause all three P1 layout breaks (`/messages` rows, song/message header, log day picker). The pattern is `flex items-center justify-between` with a `shrink-0` group and no wrap.
- **No shared primitives** for buttons, page headers, toasts or badges. Sizes and styles drift per file: 20, 26, 30, 34, 36, 44px controls for equivalent actions.
- **Hover-only affordances** (rename fields, the `+` add button's hover background) do nothing on the phone the README says the admin pages are used on.
- **Emoji as iconography** repeats in five files.

## Positive findings

- A global `:focus-visible` ring in `@layer base`, with a comment explaining the cascade decision. Keyboard users can always see where they are.
- The muted token was tuned to contrast and documented in place; measured 7.66:1 on the body and 6.91:1 on panels. No text on any page falls below AA.
- Roving `tabIndex` with real DOM focus on song sections and message parts, so the browser scrolls and screen readers announce.
- The command palette is a proper `combobox` + `listbox` with `aria-activedescendant`, focus restore on close, and Tab held inside the dialog.
- Live regions stay mounted so announcements are not missed; the toast is solid rather than translucent, for predictable contrast.
- Safe-area insets, a 16px input floor on coarse pointers to stop iOS zoom, and a pointer-aware hint swap so phones never see keyboard advice.
- No horizontal overflow on any page at 390px (verified).
- The 9,000-node browse list is memoised with measurements in the comment, and hidden rather than unmounted on search.
- AI-quoted verse text is shown with a red warning and never auto-copied.
- The detector found zero mechanical anti-patterns across every UI file.

## Recommended actions

1. **[P1] `/impeccable adapt`**: `/messages` rows and section header, song/message view header, and the log day picker at phone width; then the 44px floor for mid-service controls.
2. **[P1] `/impeccable harden`**: focusable file input on import, tablist semantics on the desk, announced delete confirmations, unlock error association.
3. **[P2] `/impeccable clarify`**: the "?" hint that cannot work from the reference box; visible rename affordances on `/messages` and `/setlists`.
4. **[P2] `/impeccable layout`**: one shared page header and back control across the six non-desk pages; reserve space for the busy line; diag key truncation.
5. **[P2] `/impeccable typeset`**: lift the 10px badges.
6. **[P2] `/impeccable optimize`**: measure and likely drop `backdrop-blur` on the letter headers; add dependency arrays to the document keydown effects.
7. **[P2] `/impeccable polish`**: `color-scheme: dark`, SVG icons in place of emoji, one toast and one `copyText`, toast placement.
