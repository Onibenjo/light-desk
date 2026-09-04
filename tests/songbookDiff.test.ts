import { describe, it, expect } from "vitest";
import { diffSongbook, type StoredSong } from "../src/lib/songbookDiff";
import type { VpSong } from "../src/lib/videopsalm";

const song = (over: Partial<VpSong> = {}): VpSong => ({ guid: "g1", title: "Abide With Me", author: "H.F. Lyte", sections: ["Abide with me"], ...over });

/** The book as it sits in the database: sections already JSON, author nullable. */
const stored = (over: Partial<StoredSong> = {}): StoredSong => ({ title: "Abide With Me", author: "H.F. Lyte", sections: JSON.stringify(["Abide with me"]), ...over });

const book = (entries: Record<string, StoredSong>) => new Map(Object.entries(entries));

describe("diffing an import against the book", () => {
  it("counts a song the book has never seen as added", () => {
    const d = diffSongbook([song()], book({}));
    expect(d.added.map((s) => s.title)).toEqual(["Abide With Me"]);
    expect(d.updated).toEqual([]);
    expect(d.unchanged).toBe(0);
  });

  it("counts an identical song as unchanged", () => {
    const d = diffSongbook([song()], book({ g1: stored() }));
    expect(d.added).toEqual([]);
    expect(d.updated).toEqual([]);
    expect(d.unchanged).toBe(1);
  });

  it("counts changed lyrics as updated", () => {
    const d = diffSongbook([song({ sections: ["Abide with me", "fast falls the eventide"] })], book({ g1: stored() }));
    expect(d.updated.map((s) => s.guid)).toEqual(["g1"]);
    expect(d.unchanged).toBe(0);
  });

  it("counts a retitled song as updated", () => {
    const d = diffSongbook([song({ title: "Abide With Me (2026)" })], book({ g1: stored() }));
    expect(d.updated.map((s) => s.title)).toEqual(["Abide With Me (2026)"]);
  });

  it("counts a corrected author as updated", () => {
    const d = diffSongbook([song({ author: "Henry Francis Lyte" })], book({ g1: stored() }));
    expect(d.updated.map((s) => s.author)).toEqual(["Henry Francis Lyte"]);
  });

  it("treats a missing author and a null author as the same thing", () => {
    const d = diffSongbook([song({ author: undefined })], book({ g1: stored({ author: null }) }));
    expect(d.unchanged).toBe(1);
    expect(d.updated).toEqual([]);
  });

  it("does not confuse two different songs", () => {
    const d = diffSongbook([song(), song({ guid: "g2", title: "Above All", sections: ["Above all powers"] })], book({ g1: stored() }));
    expect(d.added.map((s) => s.title)).toEqual(["Above All"]);
    expect(d.unchanged).toBe(1);
  });
});

describe("a songbook that repeats a guid", () => {
  const twice = [song({ sections: ["first version"] }), song({ sections: ["second version"] })];

  it("keeps one entry per guid, so the import cannot break the unique constraint", () => {
    const d = diffSongbook(twice, book({}));
    expect(d.added.length).toBe(1);
    expect(d.added[0].sections).toEqual(["second version"]);
  });

  it("reports how many entries it collapsed", () => {
    expect(diffSongbook(twice, book({})).repeatedGuids).toBe(1);
    expect(diffSongbook([song()], book({})).repeatedGuids).toBe(0);
  });
});
