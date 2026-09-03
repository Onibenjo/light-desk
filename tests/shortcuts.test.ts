import { describe, it, expect } from "vitest";
import { matchesChord, formatChord, filterActions, isTypingTarget, type Action } from "../src/lib/shortcuts";

const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("matchesChord", () => {
  it("accepts either Cmd or Ctrl for a mod chord, so one binding covers both platforms", () => {
    expect(matchesChord(press("k", { metaKey: true }), { key: "k", mod: true })).toBe(true);
    expect(matchesChord(press("k", { ctrlKey: true }), { key: "k", mod: true })).toBe(true);
  });

  it("ignores case of the pressed key", () => {
    expect(matchesChord(press("K", { metaKey: true }), { key: "k", mod: true })).toBe(true);
  });

  it("does not fire a mod chord from the bare key", () => {
    expect(matchesChord(press("k"), { key: "k", mod: true })).toBe(false);
  });

  it("does not fire when an extra modifier is held", () => {
    expect(matchesChord(press("k", { metaKey: true, shiftKey: true }), { key: "k", mod: true })).toBe(false);
    expect(matchesChord(press("k", { metaKey: true, altKey: true }), { key: "k", mod: true })).toBe(false);
  });

  it("matches an unmodified key", () => {
    expect(matchesChord(press("?"), { key: "?" })).toBe(true);
    expect(matchesChord(press("Escape"), { key: "Escape" })).toBe(true);
  });

  it("does not fire an unmodified key while a mod is held", () => {
    expect(matchesChord(press("?", { metaKey: true }), { key: "?" })).toBe(false);
  });
});

describe("formatChord", () => {
  it("uses Mac glyphs on a Mac", () => {
    expect(formatChord({ key: "k", mod: true }, true)).toBe("⌘K");
  });

  it("spells modifiers out elsewhere", () => {
    expect(formatChord({ key: "k", mod: true }, false)).toBe("Ctrl+K");
  });

  it("names the keys that have no printable glyph", () => {
    expect(formatChord({ key: "Escape" }, true)).toBe("Esc");
    expect(formatChord({ key: "Enter" }, false)).toBe("↵");
  });

  it("leaves a plain printable key as itself, uppercased", () => {
    expect(formatChord({ key: "?" }, true)).toBe("?");
    expect(formatChord({ key: "l" }, false)).toBe("L");
  });
});

describe("filterActions", () => {
  const actions: Action[] = [
    { id: "log", title: "Open log", run: () => {} },
    { id: "songs", title: "Go to Songs", keywords: ["lyrics", "songbook"], run: () => {} },
    { id: "next", title: "Next verse", run: () => {} },
  ];

  it("returns everything for an empty query", () => {
    expect(filterActions(actions, "").map((a) => a.id)).toEqual(["log", "songs", "next"]);
  });

  it("matches on title, case-insensitively", () => {
    expect(filterActions(actions, "LOG").map((a) => a.id)).toEqual(["log"]);
  });

  it("matches on keywords too", () => {
    expect(filterActions(actions, "songbook").map((a) => a.id)).toEqual(["songs"]);
  });

  it("ranks a title match above a keyword-only match", () => {
    const withKeyword: Action[] = [
      { id: "a", title: "Import songbook", keywords: ["verse"], run: () => {} },
      { id: "b", title: "Next verse", run: () => {} },
    ];
    expect(filterActions(withKeyword, "verse").map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterActions(actions, "zzz")).toEqual([]);
  });
});

describe("isTypingTarget", () => {
  it("is true for text entry, so bare-key shortcuts stay out of the way", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for buttons and plain elements", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
