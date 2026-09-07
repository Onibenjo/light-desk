import { describe, it, expect } from "vitest";
import { needsLlm, sectionsFromLlmReply } from "../src/lib/quickAdd";

describe("deciding whether the model is needed at all", () => {
  it("does not call it when the paste already has blank lines", () => {
    expect(needsLlm("a\nb\n\nc\nd")).toBe(false);
  });

  it("calls it for one undifferentiated block", () => {
    expect(needsLlm("a\nb\nc\nd\ne\nf\ng\nh")).toBe(true);
  });

  it("does not call it for something short enough to send as one section", () => {
    expect(needsLlm("a\nb\nc")).toBe(false);
  });

  it("ignores a paste whose only blank lines are leading or trailing", () => {
    expect(needsLlm("\n\na\nb\nc\nd\ne\nf\ng\n\n")).toBe(true);
  });
});

describe("reading the model's reply", () => {
  it("takes a JSON array of sections and caps them", () => {
    expect(sectionsFromLlmReply('["a\\nb", "c\\nd\\ne\\nf\\ng\\nh\\ni"]')).toEqual(["a\nb", "c\nd\ne\nf", "g\nh\ni"]);
  });

  it("finds the array when the model wrapped it in prose", () => {
    expect(sectionsFromLlmReply('Sure!\n```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
  });

  it("strips labels the model echoed back", () => {
    expect(sectionsFromLlmReply('["[Chorus]\\nJehovah elroi"]')).toEqual(["Jehovah elroi"]);
  });

  it("returns null for anything that is not a usable array", () => {
    expect(sectionsFromLlmReply("I could not do that")).toBe(null);
    expect(sectionsFromLlmReply("[]")).toBe(null);
    expect(sectionsFromLlmReply('[1, 2]')).toBe(null);
    expect(sectionsFromLlmReply('["   "]')).toBe(null);
  });
});
