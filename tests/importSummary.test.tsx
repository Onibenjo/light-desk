import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footnotes, type Summary } from "../src/app/songs/import/Footnotes";

const summary = (over: Partial<Summary> = {}): Summary => ({
  totalEntries: 1966,
  skippedEmpty: 0,
  collapsedDuplicates: 0,
  repeatedGuids: 0,
  unchanged: 1900,
  added: [],
  updated: [],
  skippedEdited: [],
  ...over,
});

const text = (s: Summary) => renderToStaticMarkup(<Footnotes s={s} />).replace(/<[^>]+>/g, "");

describe("what the import reports", () => {
  it("says nothing when there is nothing to report", () => {
    expect(renderToStaticMarkup(<Footnotes s={summary()} />)).toBe("");
  });

  it("says how many songs it left alone because they were edited here", () => {
    expect(text(summary({ skippedEdited: ["El Roi", "Army Arise"] }))).toContain("2 songs were edited here and are left alone");
  });

  it("counts one skipped song in the singular", () => {
    expect(text(summary({ skippedEdited: ["El Roi"] }))).toContain("1 song was edited here and is left alone");
  });

  it("still reports the older outcomes alongside it", () => {
    const out = text(summary({ skippedEmpty: 3, skippedEdited: ["El Roi"] }));
    expect(out).toContain("3 entries");
    expect(out).toContain("left alone");
  });
});
