import { describe, it, expect } from "vitest";
import seed from "../src/data/messages.seed.json";
import { parseSeed, type ParsedSeed } from "../src/lib/messageSeed";
import { MAX_MESSAGE_CHARS } from "../src/lib/format";

const parsed = parseSeed(seed);
const lib = (): ParsedSeed => {
  if (typeof parsed === "string") throw new Error(parsed);
  return parsed;
};
const section = (name: string) => {
  const s = lib().sections.find((x) => x.name === name);
  if (!s) throw new Error(`no section ${name}`);
  return s;
};

describe("the starter library", () => {
  it("passes every rule the editor enforces", () => {
    expect(parsed).not.toBeTypeOf("string");
  });

  it("has the doc's sections, with Apologies first because it is the one needed in a hurry", () => {
    expect(lib().sections.map((s) => s.name)).toEqual([
      "Apologies",
      "Greetings",
      "Prayer Before Ambience Jewel",
      "Welcoming Ambience Jewel",
      "Prayer Before Sermon",
      "Confession",
      "Testimony",
      "Recap",
      "Welcoming Pastor",
      "Altar Call",
      "Announcement",
      "Offerings and Tithe",
      "First Timer",
      "Apostolic Blessing",
      "Closing Charge",
      "Next Service",
      "Communion",
      "Special Programs",
    ]);
  });

  it("keeps Apologies and Special Programs out of setlists, and everything else in", () => {
    for (const s of lib().sections) expect([s.name, s.inService]).toEqual([s.name, !["Apologies", "Special Programs"].includes(s.name)]);
  });

  it("has one message per variant where the doc has variants", () => {
    expect(section("Welcoming Ambience Jewel").messages.map((m) => m.title)).toEqual([
      "Sunday",
      "Sunday · Worship",
      "Sunday · Praise",
      "Wednesday",
      "Wednesday · Worship",
      "Wednesday · Praise",
    ]);
    expect(section("Prayer Before Ambience Jewel").messages).toHaveLength(7);
    expect(section("Prayer Before Sermon").messages).toHaveLength(7);
    expect(section("Apologies").messages).toHaveLength(11);
  });

  it("names each prayer line after the person praying, spelled the same in both prayer sections", () => {
    const names = (s: string) => section(s).messages.map((m) => m.title).sort();
    expect(names("Prayer Before Ambience Jewel")).toEqual(names("Prayer Before Sermon"));
    for (const m of section("Prayer Before Sermon").messages) expect(m.parts.join(" ")).toContain(m.title);
  });

  it("splits the confession into several posts", () => {
    const full = section("Confession").messages.find((m) => m.title === "Full text");
    expect(full?.parts.length).toBeGreaterThan(1);
    expect(full?.parts[0].startsWith("Father we thank You")).toBe(true);
  });

  it("carries no broken emoji from the plain-text export", () => {
    expect(JSON.stringify(seed)).not.toContain("�");
  });

  it("leaves no stale dates in the next-service lines, only placeholders to fill in per setlist", () => {
    for (const m of section("Next Service").messages) expect(m.parts.join(" ")).not.toMatch(/\b20\d\d\b/);
  });

  it(`starts with no part long enough (over ${MAX_MESSAGE_CHARS} characters) to earn a Mixlr warning`, () => {
    for (const s of lib().sections) for (const m of s.messages) for (const p of m.parts) expect([s.name, m.title, p.length <= MAX_MESSAGE_CHARS]).toEqual([s.name, m.title, true]);
  });
});
