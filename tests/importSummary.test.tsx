import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footnotes, LISTS, TitleList, type Summary } from "../src/app/songs/import/Footnotes";

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

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
const text = (s: Summary) => strip(renderToStaticMarkup(<Footnotes s={s} />));

describe("what the import reports", () => {
  it("says nothing when there is nothing to report", () => {
    expect(renderToStaticMarkup(<Footnotes s={summary()} />)).toBe("");
  });

  it("heads the list of songs it left alone with their count, in the plural", () => {
    const out = strip(renderToStaticMarkup(<TitleList noun={LISTS.editedHere} titles={["El Roi", "Army Arise"]} />));
    expect(out).toContain("2 songs edited here, kept as they are");
    expect(out).toContain("El Roi");
  });

  it("counts one song in the singular", () => {
    expect(strip(renderToStaticMarkup(<TitleList noun={LISTS.editedHere} titles={["El Roi"]} />))).toContain("1 song edited here, kept as it is");
    expect(strip(renderToStaticMarkup(<TitleList noun={LISTS.new} titles={["El Roi"]} />))).toMatch(/^1 new song(?!s)/);
  });

  it("draws no heading for an empty list", () => {
    expect(renderToStaticMarkup(<TitleList noun={LISTS.editedHere} titles={[]} />)).toBe("");
  });

  it("does not repeat the edited-here count that its list already shows", () => {
    expect(renderToStaticMarkup(<Footnotes s={summary({ skippedEdited: ["El Roi"] })} />)).toBe("");
  });

  it("reports the other outcomes with correct plurals", () => {
    expect(text(summary({ skippedEmpty: 3, repeatedGuids: 2 }))).toBe("3 entries without lyrics skipped · 2 entries reuse another entry's ID — only the last is kept.");
    expect(text(summary({ skippedEmpty: 1, collapsedDuplicates: 1, repeatedGuids: 1 }))).toBe(
      "1 entry without lyrics skipped · 1 exact duplicate counted once · 1 entry reuses another entry's ID — only the last is kept.",
    );
  });
});
