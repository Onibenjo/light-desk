import { describe, it, expect } from "vitest";
import { isLabelLine, stripLabelLines, capSection, splitOnBlankLines, sectionsFromLyrics, tidyLyrics, MAX_SECTION_LINES } from "../src/lib/songSections";

describe("label-only lines", () => {
  it("recognises the shapes lyric sites actually use", () => {
    for (const l of ["[Intro]", "[Chorus]", "Chorus:", "chorus", "VAMP", "[Verse 1]", "Verse 4", "[Pre-Chorus]", "Pre chorus:", "Refrain", "bridge", "outro", "interlude", "Solo:", "[Interlude]"]) {
      expect(isLabelLine(l), l).toBe(true);
    }
  });

  it("leaves sung lines alone, including ones that start with a label word", () => {
    for (const l of ["Chorus of angels sing", "You are the bridge over troubled water", "Verse after verse of Your goodness", "Jehovah elroi", "Parara parararara parara", "Na u dey see wetin eyes no see"]) {
      expect(isLabelLine(l), l).toBe(false);
    }
  });

  it("drops label lines and keeps the lyrics around them", () => {
    expect(stripLabelLines("[Intro]\nYou sit in heaven\nAncient of days")).toBe("You sit in heaven\nAncient of days");
    expect(stripLabelLines("Chorus:")).toBe("");
  });
});

describe("the balanced cap", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
  const shape = (n: number) => capSection(lines(n)).map((s) => s.split("\n").length);

  it("leaves anything within the cap whole", () => {
    expect(shape(1)).toEqual([1]);
    expect(shape(5)).toEqual([5]);
    expect(shape(MAX_SECTION_LINES)).toEqual([6]);
  });

  it("splits evenly rather than leaving an orphan", () => {
    expect(shape(7)).toEqual([4, 3]);
    expect(shape(8)).toEqual([4, 4]);
    expect(shape(13)).toEqual([5, 4, 4]);
  });

  it("keeps every line, in order, when it splits", () => {
    expect(capSection(lines(7)).join("\n")).toBe(lines(7));
  });

  it("handles the songbook's 110-line teaching outline", () => {
    const out = capSection(lines(110));
    expect(Math.max(...out.map((s) => s.split("\n").length))).toBeLessThanOrEqual(MAX_SECTION_LINES);
    expect(out.join("\n")).toBe(lines(110));
  });
});

describe("splitting a paste", () => {
  it("starts a new section at a blank line", () => {
    expect(splitOnBlankLines("a\nb\n\nc\nd")).toEqual(["a\nb", "c\nd"]);
  });

  it("treats a run of blank lines as one break", () => {
    expect(splitOnBlankLines("a\n\n\n\nb")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty paste", () => {
    expect(splitOnBlankLines("   \n\n  ")).toEqual([]);
  });
});

describe("ingesting pasted lyrics", () => {
  it("drops labels, splits on blank lines and caps the long ones", () => {
    const pasted = ["[Intro]", "You sit in heaven", "You made the earth Your footstool", "", "[Chorus]", "a", "b", "c", "d", "e", "f", "g"].join("\n");
    expect(sectionsFromLyrics(pasted)).toEqual(["You sit in heaven\nYou made the earth Your footstool", "a\nb\nc\nd", "e\nf\ng"]);
  });

  it("drops a section that was only a label", () => {
    expect(sectionsFromLyrics("[Interlude]\n\nEverybody blow your trumpet")).toEqual(["Everybody blow your trumpet"]);
  });

  it("caps a paste that has no blank lines at all", () => {
    expect(sectionsFromLyrics("a\nb\nc\nd\ne\nf\ng\nh").length).toBe(2);
  });
});

describe("the Tidy button", () => {
  it("rewrites the textarea as blank-line separated sections", () => {
    expect(tidyLyrics("[Verse 1]\na\nb\nc\nd\ne\nf\ng")).toBe("a\nb\nc\nd\n\ne\nf\ng");
  });

  it("is idempotent, so tapping it twice changes nothing", () => {
    const once = tidyLyrics("[Chorus]\na\nb\n\n\nc");
    expect(tidyLyrics(once)).toBe(once);
  });
});
