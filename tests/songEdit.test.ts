import { describe, it, expect } from "vitest";
import { parseSongEdit } from "../src/lib/songEdit";

const ok = (body: unknown) => {
  const r = parseSongEdit(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};

describe("validating an edit", () => {
  it("splits the textarea on blank lines, exactly as typed", () => {
    expect(ok({ title: "El Roi", lyrics: "a\nb\n\nc\nd" }).sections).toEqual(["a\nb", "c\nd"]);
  });

  it("keeps a long section the operator deliberately left long", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `l${i + 1}`).join("\n");
    expect(ok({ title: "T", lyrics: nine }).sections).toEqual([nine]);
  });

  it("keeps a label line the operator chose to leave in", () => {
    expect(ok({ title: "T", lyrics: "[Chorus]\na" }).sections).toEqual(["[Chorus]\na"]);
  });

  it("trims the title and collapses it to one line", () => {
    expect(ok({ title: "  El Roi\nPrinx  ", lyrics: "a" }).title).toBe("El Roi Prinx");
  });

  it("stores a blank author as null, not an empty string", () => {
    expect(ok({ title: "T", lyrics: "a", author: "   " }).author).toBe(null);
    expect(ok({ title: "T", lyrics: "a", author: " Prinx Emmanuel " }).author).toBe("Prinx Emmanuel");
  });

  it("refuses an edit with no title", () => {
    expect(parseSongEdit({ title: "  ", lyrics: "a" })).toMatch(/title/i);
  });

  it("refuses an edit with no lyrics left", () => {
    expect(parseSongEdit({ title: "T", lyrics: "  \n\n " })).toMatch(/lyric/i);
  });

  it("refuses a body that is not an object", () => {
    expect(parseSongEdit(null)).toMatch(/title/i);
    expect(parseSongEdit({ title: 5, lyrics: "a" })).toMatch(/title/i);
  });
});
