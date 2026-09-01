import { describe, it, expect } from "vitest";
import { parseInput, parseReference, formatReference } from "../src/lib/reference";
import { splitForChat, formatPassage, cleanVerseText } from "../src/lib/format";
import { splitNumberedBlob, parseGatewayHtml } from "../src/lib/sources";

const fmt = (s: string) => {
  const r = parseReference(s);
  return r ? formatReference(r) : undefined;
};

describe("reference parser", () => {
  it("handles the sloppy forms volunteers type", () => {
    expect(fmt("rom 8 28")).toBe("Romans 8:28");
    expect(fmt("rom8:28")).toBe("Romans 8:28");
    expect(fmt("Romans 8:28-30")).toBe("Romans 8:28-30");
    expect(fmt("1 cor 13 4-7")).toBe("1 Corinthians 13:4-7");
    expect(fmt("1cor13v4")).toBe("1 Corinthians 13:4");
    expect(fmt("exo 14.13-16")).toBe("Exodus 14:13-16");
    expect(fmt("jn 3 v 16")).toBe("John 3:16");
    expect(fmt("romans chapter 8 verse 28")).toBe("Romans 8:28");
    expect(fmt("ps 23")).toBe("Psalms 23");
    expect(fmt("psalm 91 1 to 2")).toBe("Psalms 91:1-2");
    expect(fmt("song of solomon 2 1")).toBe("Song of Solomon 2:1");
    expect(fmt("first corinthians 13 13")).toBe("1 Corinthians 13:13");
    expect(fmt("II Tim 1:7")).toBe("2 Timothy 1:7");
    expect(fmt("jude 24")).toBe("Jude 1:24");
    expect(fmt("philipp 4 13")).toBe("Philippians 4:13");
  });

  it("rejects things that are not references", () => {
    expect(fmt("walk on snakes and not be bitten")).toBeUndefined();
    expect(fmt("a verse that says they will walk on snakes")).toBeUndefined();
    expect(fmt("rom 99 1")).toBeUndefined();
    expect(fmt("john 3 999")).toBeUndefined();
    expect(fmt("")).toBeUndefined();
  });

  it("clamps ranges that run past the chapter", () => {
    expect(fmt("john 3 35-40")).toBe("John 3:35-36");
  });

  it("peels a trailing translation token", () => {
    const p = parseInput("john 3 16 amp");
    expect(p.kind).toBe("reference");
    expect(p.translation?.code).toBe("AMP");
    expect(formatReference(p.reference!)).toBe("John 3:16");
    expect(parseInput("john 3:16 (NLT)").translation?.code).toBe("NLT");
    expect(parseInput("john 3:16 in tpt").translation?.code).toBe("TPT");
    // "is" is a book alias (Isaiah) not a translation — must not be eaten
    expect(parseInput("is 53 5").kind).toBe("reference");
  });

  it("routes descriptions to the search path", () => {
    const p = parseInput("they will walk on snakes and not be bitten");
    expect(p.kind).toBe("description");
  });
});

describe("formatter", () => {
  const passage = {
    reference: "Numbers 23:10",
    translationCode: "KJV",
    translationName: "King James Version",
    verses: [{ verse: 10, text: "Who can count the dust of Jacob, and the number of the fourth part of Israel? Let me die the death of the righteous, and let my last end be like his!" }],
    source: "local" as const,
  };
  it("matches the style already used in the CLC chat", () => {
    expect(formatPassage(passage)).toBe(
      "Numbers 23:10\nKing James Version\n10. Who can count the dust of Jacob, and the number of the fourth part of Israel? Let me die the death of the righteous, and let my last end be like his!",
    );
  });
  it("strips KJV braces, footnotes and line breaks but keeps AMP brackets", () => {
    expect(cleanVerseText("darkness {was} upon the\n  face [a] of the deep [of chaos]")).toBe("darkness was upon the face of the deep [of chaos]");
  });
  it("splits long passages and repeats the header", () => {
    const long = { ...passage, reference: "Psalms 119:1-20", verses: Array.from({ length: 20 }, (_, i) => ({ verse: i + 1, text: "x".repeat(120) })) };
    const chunks = splitForChat(long, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    expect(chunks[1].startsWith("Psalms 119:1-20 (cont.)\nKing James Version\n")).toBe(true);
    expect(chunks.join("\n")).toContain("20. ");
  });
});

describe("numbered blob splitter", () => {
  it("splits API text with inline verse numbers", () => {
    const blob = "28 And we know that all things work together for good. 29 For whom He foreknew, He also predestined. 30 Moreover whom He predestined, these He also called.";
    const v = splitNumberedBlob(blob, 28, 30);
    expect(v.map((x) => x.verse)).toEqual([28, 29, 30]);
    expect(v[1].text).toBe("For whom He foreknew, He also predestined.");
  });
  it("handles [n] style and single verses", () => {
    expect(splitNumberedBlob("[16] For God so loved the world", 16, 16)[0].text).toBe("For God so loved the world");
    const v = splitNumberedBlob("[1] a b c [2] d e f", 1, 2);
    expect(v[1].text).toBe("d e f");
  });
});

describe("BibleGateway page parser", () => {
  const page = `<html><head><title>John 1:3 AMPC - All things were made - Bible Gateway</title></head><body>
  <div class="passage-text"><div class="passage-content"><div class="version-AMPC result-text-style-normal text-html">
  <h1 class="passage-display"><span class="passage-display-bcv">John 1:3</span><span class="passage-display-version">Amplified Bible, Classic Edition</span></h1>
  <p><span id="en-AMPC-26047" class="text John-1-3"><sup class="versenum">3 </sup>All things were made and came into existence through Him; and without Him was not even one thing made that has come into being.<sup data-fn="#fen-AMPC-26047a" class="footnote">[<a href="#fen-AMPC-26047a">a</a>]</sup></span>
  <span id="en-AMPC-26048" class="text John-1-4"><sup class="versenum">4 </sup>In Him was Life, and the Life was the Light of men.</span></p>
  <div class="footnotes"><h4>Footnotes</h4><ol><li id="fen-AMPC-26047a">John 1:3 Note</li></ol></div>
  </div></div></div></body></html>`;
  it("extracts verses and drops footnotes", () => {
    const v = parseGatewayHtml(page, 3, 4);
    expect(v).toEqual([
      { verse: 3, text: "All things were made and came into existence through Him; and without Him was not even one thing made that has come into being." },
      { verse: 4, text: "In Him was Life, and the Life was the Light of men." },
    ]);
  });
  it("handles numbered books like 1 John", () => {
    const p2 = page.replace(/John-1-/g, "1John-1-");
    expect(parseGatewayHtml(p2, 3, 3)[0].verse).toBe(3);
  });
  it("reports a missing passage block with the page title", () => {
    expect(() => parseGatewayHtml("<html><head><title>Just a moment...</title></head><body></body></html>", 1, 1)).toThrow(/Just a moment/);
  });
});
