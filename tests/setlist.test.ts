import { describe, it, expect } from "vitest";
import { buildIndex, type SearchableSong } from "../src/lib/songSearch";
import { ageInDays, comingSundayName, moveItem, openMessageFromRow, planMessageEdit, resolveSetlist, songsById, staleNote, withParts, STALE_AFTER_DAYS } from "../src/lib/setlist";
import { messagesById } from "../src/lib/messageLibrary";
import { library } from "./fixtures/library";

const song = (id: number, title: string, author: string | null = null): SearchableSong => ({ id, guid: `g${id}`, title, author, sections: ["la la"] });
const book = buildIndex([song(1, "Way Maker", "Sinach"), song(2, "Oceans")]);

describe("resolving a setlist against the book", () => {
  it("shows the live title, not the one cached when the song was added", () => {
    const [row] = resolveSetlist([{ kind: "song", id: 1, title: "Waymaker" }], songsById(book), null);
    expect(row).toMatchObject({ title: "Way Maker", author: "Sinach", missing: false });
    if (row.kind !== "song") throw new Error("expected a song row");
    expect(row.song).not.toBe(null);
  });

  it("falls back to the cached title while the book is still loading, and calls nothing missing yet", () => {
    const [row] = resolveSetlist([{ kind: "song", id: 1, title: "Waymaker" }], songsById(null), null);
    expect(row).toMatchObject({ title: "Waymaker", song: null, missing: false });
  });

  it("marks a song deleted from the book as missing rather than dropping the row", () => {
    const rows = resolveSetlist([{ kind: "song", id: 1, title: "Way Maker" }, { kind: "song", id: 99, title: "Deleted One" }], songsById(book), null);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ missing: true, title: "Deleted One" });
  });

  it("keeps the order the setlist was prepared in", () => {
    const rows = resolveSetlist([{ kind: "song", id: 2, title: "Oceans" }, { kind: "song", id: 1, title: "Way Maker" }], songsById(book), null);
    expect(rows.map((r) => r.title)).toEqual(["Oceans", "Way Maker"]);
  });
});

describe("telling the operator a setlist is stale", () => {
  const now = new Date("2026-09-14T09:00:00.000Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("counts whole days since it was last touched", () => {
    expect(ageInDays(daysAgo(0), now)).toBe(0);
    expect(ageInDays(daysAgo(8), now)).toBe(8);
  });

  it("reads a clock that runs backwards as no age at all", () => {
    expect(ageInDays(new Date(now.getTime() + 86_400_000).toISOString(), now)).toBe(0);
  });

  it(`says nothing until ${STALE_AFTER_DAYS} days, then says how old it is`, () => {
    expect(staleNote(daysAgo(STALE_AFTER_DAYS - 1), now)).toBe(null);
    expect(staleNote(daysAgo(STALE_AFTER_DAYS), now)).toBe(`${STALE_AFTER_DAYS} days old`);
    expect(staleNote(daysAgo(8), now)).toBe("8 days old");
  });
});

describe("reordering", () => {
  it("moves a song one place", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("does nothing at either end, so the buttons are never a trap", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 7, 1)).toEqual(items);
  });
});

describe("naming a new setlist", () => {
  it("suggests the coming Sunday", () => {
    expect(comingSundayName(new Date("2026-09-09T12:00:00"))).toBe("Sunday 13 Sept");
  });

  it("suggests today when today is Sunday", () => {
    expect(comingSundayName(new Date("2026-09-13T12:00:00"))).toBe("Sunday 13 Sept");
  });

  it("crosses a month end", () => {
    expect(comingSundayName(new Date("2026-09-28T12:00:00"))).toBe("Sunday 4 Oct");
  });
});

describe("message rows", () => {
  const lib = messagesById(library);
  const msg = (id: number, title: string, parts?: string[]) => ({ kind: "message" as const, id, title, ...(parts ? { parts } : {}) });

  it("shows the live label and copies the library's text", () => {
    const [row] = resolveSetlist([msg(10, "old label")], null, lib);
    expect(row).toMatchObject({ kind: "message", key: "message:10", title: "Welcoming Ambience Jewel · Sunday", parts: ["As we gather to honour"], edited: false, removed: false, waiting: false });
  });

  it("copies the text edited for this service instead, and says so", () => {
    const [row] = resolveSetlist([msg(10, "x", ["As we gather this Easter"])], null, lib);
    expect(row).toMatchObject({ parts: ["As we gather this Easter"], edited: true });
  });

  it("waits for the library, unless its edited text needs nothing from it", () => {
    const [plain, edited] = resolveSetlist([msg(10, "Welcoming Ambience Jewel · Sunday"), msg(11, "cached", ["mine"])], null, null);
    expect(plain).toMatchObject({ title: "Welcoming Ambience Jewel · Sunday", parts: null, waiting: true, removed: false });
    expect(edited).toMatchObject({ parts: ["mine"], waiting: false, removed: false });
  });

  it("keeps a message deleted from the library: dead without edited text, still working with it", () => {
    const [dead, alive] = resolveSetlist([msg(77, "Gone"), msg(78, "Gone too", ["kept"])], null, lib);
    expect(dead).toMatchObject({ title: "Gone", parts: null, removed: true, waiting: false });
    expect(alive).toMatchObject({ title: "Gone too", parts: ["kept"], removed: true });
  });

  it("keeps songs and messages in the order they were prepared", () => {
    const rows = resolveSetlist([msg(20, "a"), { kind: "song", id: 2, title: "Oceans" }, msg(10, "b")], songsById(book), lib);
    expect(rows.map((r) => r.key)).toEqual(["message:20", "song:2", "message:10"]);
  });
});

describe("editing a message for one service", () => {
  const items = [{ kind: "song" as const, id: 1, title: "Way Maker" }, { kind: "message" as const, id: 10, title: "Sunday" }];

  it("puts edited text on that item only", () => {
    expect(withParts(items, 1, ["Easter morning"])).toEqual([items[0], { kind: "message", id: 10, title: "Sunday", parts: ["Easter morning"] }]);
  });

  it("resets to the library's text by removing it", () => {
    const edited = withParts(items, 1, ["Easter morning"]);
    expect(withParts(edited, 1, undefined)).toEqual(items);
  });

  it("never puts text on a song", () => {
    expect(withParts(items, 0, ["nope"])).toEqual(items);
  });
});

describe("deciding what Save for this service does", () => {
  it("saves text that differs from the library's", () => {
    expect(planMessageEdit(["new words"], ["old words"], false)).toEqual({ kind: "save", parts: ["new words"] });
  });

  it("skips a save that only retypes the library's own words", () => {
    expect(planMessageEdit(["As we gather"], ["As we gather"], false)).toEqual({ kind: "skip" });
  });

  it("resets rather than storing a copy when the retyped text matches the library and an edit was already there", () => {
    expect(planMessageEdit(["As we gather"], ["As we gather"], true)).toEqual({ kind: "reset" });
  });

  it("saves when the library's text is unknown — the message is gone, or the library has not loaded", () => {
    expect(planMessageEdit(["whatever was typed"], undefined, false)).toEqual({ kind: "save", parts: ["whatever was typed"] });
  });

  it("compares parts in order, not just as a set", () => {
    expect(planMessageEdit(["b", "a"], ["a", "b"], false)).toEqual({ kind: "save", parts: ["b", "a"] });
  });
});

describe("opening a message from its setlist row", () => {
  const lib = messagesById(library);

  it("carries the row's text, edited or not, and the section's setlist rule", () => {
    const [row] = resolveSetlist([{ kind: "message", id: 11, title: "x", parts: ["Easter worship"] }], null, lib);
    if (row.kind !== "message") throw new Error("expected a message row");
    expect(openMessageFromRow(row, lib)).toEqual({
      key: "message:11",
      id: 11,
      label: "Welcoming Ambience Jewel · Sunday · Worship",
      parts: ["Easter worship"],
      edited: true,
      inService: true,
    });
  });

  it("opens nothing for a row with nothing to copy", () => {
    const [row] = resolveSetlist([{ kind: "message", id: 77, title: "Gone" }], null, lib);
    if (row.kind !== "message") throw new Error("expected a message row");
    expect(openMessageFromRow(row, lib)).toBe(null);
  });
});
