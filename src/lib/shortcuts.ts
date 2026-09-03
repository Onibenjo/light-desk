// Keyboard plumbing for the command palette. Kept free of React and the DOM so
// the fiddly parts — modifier matching, platform glyphs, ranking — are testable.

/** `mod` means Cmd on a Mac and Ctrl everywhere else, so one binding covers both. */
export type Chord = { key: string; mod?: boolean };

export type Action = {
  id: string;
  title: string;
  keywords?: string[];
  chord?: Chord;
  group?: string;
  run: () => void;
};

type KeyPress = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

export function matchesChord(e: KeyPress, chord: Chord): boolean {
  if (e.key.toLowerCase() !== chord.key.toLowerCase()) return false;
  const mod = e.metaKey || e.ctrlKey;
  if (mod !== Boolean(chord.mod)) return false;
  // Any modifier the chord didn't ask for means the user meant something else.
  if (e.altKey) return false;
  // "?" is Shift+/ on most layouts, so shift is only disqualifying for mod chords.
  if (chord.mod && e.shiftKey) return false;
  return true;
}

const NAMED: Record<string, { mac: string; other: string }> = {
  Escape: { mac: "Esc", other: "Esc" },
  Enter: { mac: "↵", other: "↵" },
  ArrowUp: { mac: "↑", other: "↑" },
  ArrowDown: { mac: "↓", other: "↓" },
};

export function formatChord(chord: Chord, isMac: boolean): string {
  const named = NAMED[chord.key];
  const key = named ? (isMac ? named.mac : named.other) : chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  if (!chord.mod) return key;
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

/** Title matches first, then keyword-only matches; original order kept within each. */
export function filterActions(actions: Action[], query: string): Action[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  const byTitle: Action[] = [];
  const byKeyword: Action[] = [];
  for (const a of actions) {
    if (a.title.toLowerCase().includes(q)) byTitle.push(a);
    else if (a.keywords?.some((k) => k.toLowerCase().includes(q))) byKeyword.push(a);
  }
  return [...byTitle, ...byKeyword];
}

/** True where a bare-key shortcut would steal a character the user is typing. */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName ?? "");
}
