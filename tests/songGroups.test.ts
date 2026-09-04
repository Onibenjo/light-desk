import { describe, it, expect } from "vitest";
import { groupByLetter } from "../src/lib/songGroups";

const s = (title: string) => ({ title });
const shape = (groups: { letter: string; songs: { title: string }[] }[]) => groups.map((g) => [g.letter, g.songs.map((x) => x.title)]);

describe("grouping the songbook for browsing", () => {
  it("groups by the first letter of the title", () => {
    expect(shape(groupByLetter([s("Above All"), s("Blessed Assurance"), s("Abide With Me")]))).toEqual([
      ["A", ["Abide With Me", "Above All"]],
      ["B", ["Blessed Assurance"]],
    ]);
  });

  it("sorts the letters alphabetically however the book was ordered", () => {
    expect(groupByLetter([s("Zion"), s("Mercy"), s("Amazing")]).map((g) => g.letter)).toEqual(["A", "M", "Z"]);
  });

  it("files a lowercase title under the same letter as an uppercase one", () => {
    expect(shape(groupByLetter([s("all hail"), s("Amazing")]))).toEqual([["A", ["all hail", "Amazing"]]]);
  });

  it("files an accented title under its plain letter", () => {
    expect(shape(groupByLetter([s("Ọlọ́run dára"), s("Jésus règne")]))).toEqual([
      ["J", ["Jésus règne"]],
      ["O", ["Ọlọ́run dára"]],
    ]);
  });

  it("puts titles with no letter to file them under in a # group, after the letters", () => {
    expect(groupByLetter([s("10,000 Reasons"), s("Amazing")]).map((g) => g.letter)).toEqual(["A", "#"]);
  });

  it("looks past leading punctuation, where someone browsing would look", () => {
    expect(shape(groupByLetter([s("!Shout")]))).toEqual([["S", ["!Shout"]]]);
  });

  it("keeps every song exactly once", () => {
    const titles = ["10,000 Reasons", "Amazing", "!Shout", "Zion", "abide"];
    const out = groupByLetter(titles.map(s)).flatMap((g) => g.songs.map((x) => x.title));
    expect(out.slice().sort()).toEqual(titles.slice().sort());
  });

  it("returns nothing for an empty book", () => {
    expect(groupByLetter([])).toEqual([]);
  });
});
