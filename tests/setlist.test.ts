import { describe, it, expect } from "vitest";
import { buildIndex, type SearchableSong } from "../src/lib/songSearch";
import { ageInDays, comingSundayName, moveItem, resolveSetlist, songsById, staleNote, STALE_AFTER_DAYS } from "../src/lib/setlist";

const song = (id: number, title: string, author: string | null = null): SearchableSong => ({ id, guid: `g${id}`, title, author, sections: ["la la"] });
const book = buildIndex([song(1, "Way Maker", "Sinach"), song(2, "Oceans")]);

describe("resolving a setlist against the book", () => {
  it("shows the live title, not the one cached when the song was added", () => {
    const rows = resolveSetlist([{ id: 1, title: "Waymaker" }], songsById(book));
    expect(rows[0].title).toBe("Way Maker");
    expect(rows[0].author).toBe("Sinach");
    expect(rows[0].song).not.toBe(null);
    expect(rows[0].missing).toBe(false);
  });

  it("falls back to the cached title while the book is still loading, and calls nothing missing yet", () => {
    const rows = resolveSetlist([{ id: 1, title: "Waymaker" }], songsById(null));
    expect(rows[0].title).toBe("Waymaker");
    expect(rows[0].song).toBe(null);
    expect(rows[0].missing).toBe(false);
  });

  it("marks a song deleted from the book as missing rather than dropping the row", () => {
    const rows = resolveSetlist([{ id: 1, title: "Way Maker" }, { id: 99, title: "Deleted One" }], songsById(book));
    expect(rows).toHaveLength(2);
    expect(rows[1].missing).toBe(true);
    expect(rows[1].title).toBe("Deleted One");
  });

  it("keeps the order the setlist was prepared in", () => {
    const rows = resolveSetlist([{ id: 2, title: "Oceans" }, { id: 1, title: "Way Maker" }], songsById(book));
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
    expect(comingSundayName(new Date("2026-09-09T12:00:00"))).toBe("Sunday 13 Sep");
  });

  it("suggests today when today is Sunday", () => {
    expect(comingSundayName(new Date("2026-09-13T12:00:00"))).toBe("Sunday 13 Sep");
  });

  it("crosses a month end", () => {
    expect(comingSundayName(new Date("2026-09-28T12:00:00"))).toBe("Sunday 4 Oct");
  });
});
