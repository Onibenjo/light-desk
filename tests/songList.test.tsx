import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SongList from "../src/app/SongList";
import { buildIndex, type SearchableSong } from "../src/lib/songSearch";

const song = (title: string, sections = ["la la"]): SearchableSong => ({ guid: `guid-${title}`, title, sections });
const render = (songs: SearchableSong[]) => renderToStaticMarkup(<SongList book={buildIndex(songs)} onOpen={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("browsing the whole songbook", () => {
  it("lists every song under its letter, alphabetically", () => {
    expect(text(render([song("Zion"), song("Abide With Me"), song("Above All")]))).toBe(
      ["A", "Abide With Me", "1 section", "Above All", "1 section", "Z", "Zion", "1 section"].join("\n"),
    );
  });

  it("shows how many sections a song has, so a stub is obvious", () => {
    expect(render([song("Amazing", ["one", "two", "three"])])).toContain("3 sections");
  });

  it("credits the author when the book has one", () => {
    expect(render([{ ...song("Abide With Me"), author: "H.F. Lyte" }])).toContain("H.F. Lyte");
  });

  it("marks a song added at the desk, as the search results do", () => {
    expect(render([{ ...song("Quick One"), source: "manual" }])).toContain("added here");
  });

  it("stays memoised, or every keystroke reconciles ~8,900 elements", () => {
    // Measured on a throttled phone with the real 2,222-song book: 830ms per
    // keystroke without this, 20ms with it. Losing it is silent, hence the test.
    expect((SongList as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("labels every group with an id a selector or anchor can address", () => {
    const html = render([song("Amazing"), song("10,000 Reasons")]);
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(labelled.sort());
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("renders nothing at all for an empty book", () => {
    expect(text(render([]))).toBe("");
  });
});
