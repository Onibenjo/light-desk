import { describe, it, expect } from "vitest";
import {
  cleanParts,
  longParts,
  MAX_PART_CHARS,
  MAX_PARTS,
  parseMessageCreate,
  parseMessagePatch,
  parseSectionCreate,
  parseSectionPatch,
  partsFromText,
  textFromParts,
} from "../src/lib/messageEdit";

const ok = <T>(r: T | string): T => {
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};

describe("a section", () => {
  it("is named on one trimmed line, and is in service unless it says otherwise", () => {
    expect(ok(parseSectionCreate({ name: "  Welcoming\nAmbience Jewel " }))).toEqual({ name: "Welcoming Ambience Jewel", inService: true });
    expect(ok(parseSectionCreate({ name: "Apologies", inService: false }))).toEqual({ name: "Apologies", inService: false });
  });

  it("refuses a blank or over-long name", () => {
    expect(parseSectionCreate({ name: "  " })).toMatch(/name/i);
    expect(parseSectionCreate(null)).toMatch(/name/i);
    expect(ok(parseSectionCreate({ name: "a".repeat(80) })).name).toHaveLength(80);
    expect(parseSectionCreate({ name: "a".repeat(81) })).toMatch(/name/i);
  });

  it("refuses an in-service flag that is not true or false", () => {
    expect(parseSectionCreate({ name: "Apologies", inService: "no" })).toMatch(/true or false/i);
  });

  it("can be renamed, switched, or moved one place, and a change must change something", () => {
    expect(ok(parseSectionPatch({ name: "Apologies" }))).toEqual({ name: "Apologies" });
    expect(ok(parseSectionPatch({ inService: false }))).toEqual({ inService: false });
    expect(ok(parseSectionPatch({ move: -1 }))).toEqual({ move: -1 });
    expect(parseSectionPatch({ move: 2 })).toMatch(/move/i);
    expect(parseSectionPatch({})).toMatch(/nothing/i);
  });
});

describe("a message's text", () => {
  it("splits into parts at blank lines, one Mixlr post each", () => {
    expect(ok(partsFromText("Father we thank You\nBy the eternal law\n\n  \nEvery son and daughter\n"))).toEqual([
      "Father we thank You\nBy the eternal law",
      "Every son and daughter",
    ]);
  });

  it("round-trips through the editor's textarea", () => {
    const parts = ["one\ntwo", "three"];
    expect(ok(partsFromText(textFromParts(parts)))).toEqual(parts);
  });

  it("refuses no text at all", () => {
    expect(partsFromText("   \n\n ")).toMatch(/text/i);
    expect(partsFromText(undefined)).toMatch(/text/i);
  });

  it(`refuses more than ${MAX_PARTS} parts or a part over ${MAX_PART_CHARS} characters`, () => {
    expect(ok(cleanParts(Array.from({ length: MAX_PARTS }, (_, i) => `p${i}`)))).toHaveLength(MAX_PARTS);
    expect(cleanParts(Array.from({ length: MAX_PARTS + 1 }, (_, i) => `p${i}`))).toMatch(/parts/i);
    expect(ok(cleanParts(["x".repeat(MAX_PART_CHARS)]))).toHaveLength(1);
    expect(cleanParts(["x".repeat(MAX_PART_CHARS + 1)])).toMatch(/characters/i);
  });

  it("drops blank parts and refuses anything that is not a string", () => {
    expect(ok(cleanParts([" a ", "", "  ", "b"]))).toEqual(["a", "b"]);
    expect(cleanParts(["a", 3])).toMatch(/text/i);
    expect(cleanParts("a")).toMatch(/text/i);
  });

  it("points out parts Mixlr may cut, without refusing them", () => {
    expect(longParts(["short", "x".repeat(1001), "y".repeat(1000)], 1000)).toEqual([1]);
  });
});

describe("a message", () => {
  it("needs a section, a one-line title and some text", () => {
    expect(ok(parseMessageCreate({ sectionId: 3, title: " Sunday ·\nWorship ", text: "Arms wide" }))).toEqual({
      sectionId: 3,
      title: "Sunday · Worship",
      parts: ["Arms wide"],
    });
    expect(parseMessageCreate({ title: "Sunday", text: "x" })).toMatch(/section/i);
    expect(parseMessageCreate({ sectionId: 1.5, title: "Sunday", text: "x" })).toMatch(/section/i);
    expect(parseMessageCreate({ sectionId: 3, title: " ", text: "x" })).toMatch(/title/i);
    expect(parseMessageCreate({ sectionId: 3, title: "a".repeat(121), text: "x" })).toMatch(/title/i);
    expect(parseMessageCreate({ sectionId: 3, title: "Sunday", text: "" })).toMatch(/text/i);
  });

  it("can change any one thing, and a change must change something", () => {
    expect(ok(parseMessagePatch({ title: "Wednesday" }))).toEqual({ title: "Wednesday" });
    expect(ok(parseMessagePatch({ text: "a\n\nb" }))).toEqual({ parts: ["a", "b"] });
    expect(ok(parseMessagePatch({ sectionId: 4 }))).toEqual({ sectionId: 4 });
    expect(ok(parseMessagePatch({ move: 1 }))).toEqual({ move: 1 });
    expect(parseMessagePatch({ sectionId: 0 })).toMatch(/section/i);
    expect(parseMessagePatch({})).toMatch(/nothing/i);
    expect(parseMessagePatch(null)).toMatch(/nothing/i);
  });
});
