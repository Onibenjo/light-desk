import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetlistBar from "../src/app/SetlistBar";
import type { SetlistRow } from "../src/lib/setlist";

const row = (over: Partial<SetlistRow> & { id: number; title: string }): SetlistRow => ({
  author: null,
  song: { id: over.id, title: over.title, sections: ["la la"] },
  missing: false,
  ...over,
});

const render = (rows: SetlistRow[], staleNote: string | null = null) =>
  renderToStaticMarkup(<SetlistBar name="Sunday 14 Sept" staleNote={staleNote} rows={rows} onOpen={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("the setlist the operator sees", () => {
  it("numbers the songs in the order they were prepared", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 2, title: "Oceans" })]);
    expect(text(html)).toContain("1\nWay Maker");
    expect(text(html)).toContain("2\nOceans");
  });

  it("credits the author on every row, which is the whole reason searching was ambiguous", () => {
    expect(render([row({ id: 1, title: "Way Maker", author: "Sinach" })])).toContain("Sinach");
  });

  it("names the setlist", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).toContain("Sunday 14 Sept");
  });

  it("says nothing about age when the setlist is fresh", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).not.toContain("days old");
  });

  it("warns in amber when it is last week's list", () => {
    const html = render([row({ id: 1, title: "Way Maker" })], "8 days old");
    expect(html).toContain("8 days old");
    expect(html).toContain("amber");
  });

  it("shows a deleted song as gone rather than dropping the row and losing the count", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 9, title: "Old One", song: null, missing: true })]);
    expect(text(html)).toContain("Old One");
    expect(html).toContain("no longer in the songbook");
  });

  it("makes a deleted song untappable, so it cannot look like a dead button", () => {
    const html = render([row({ id: 9, title: "Old One", song: null, missing: true })]);
    expect(html).toContain("disabled");
  });

  it("tells you what to do with a setlist that has no songs yet", () => {
    expect(render([])).toContain("No songs yet");
  });
});
