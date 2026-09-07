import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { repairVideoPsalm, parseVideoPsalmSongbook, cleanSlideText, formatSection, regroupSlides, type Slide } from "../src/lib/videopsalm";
import { splitOnBlankLines } from "../src/lib/songSections";

describe("VideoPsalm repair", () => {
  it("quotes keys, escapes newlines and stray quotes", () => {
    const raw = '﻿{Description:"line one\nline "two"",Songs:[{Guid:"abc",Verses:[{\nText:"He said "yes" to me\nAmen"}],Text:"My Song"}]}';
    const parsed = JSON.parse(repairVideoPsalm(raw));
    expect(parsed.Songs[0].Verses[0].Text).toBe('He said "yes" to me\nAmen');
    expect(parsed.Songs[0].Text).toBe("My Song");
  });
  it("does not mangle colons inside strings", () => {
    const raw = '{Songs:[{Guid:"g",Verses:[{Text:"See [gen 17:23] and http://x.test"}],Text:"T"}]}';
    const parsed = JSON.parse(repairVideoPsalm(raw));
    expect(parsed.Songs[0].Verses[0].Text).toContain("[gen 17:23]");
    expect(parsed.Songs[0].Verses[0].Text).toContain("http://x.test");
  });
});

describe("songbook extraction", () => {
  it("skips empty songs and collapses exact duplicates", () => {
    const raw = '{Songs:[{Guid:"a",Verses:[],Text:"Empty"},{Guid:"b",Verses:[{Text:"La la"}],Text:"Dup"},{Guid:"c",Verses:[{Text:"La la"}],Text:"Dup"}]}';
    const r = parseVideoPsalmSongbook(raw);
    expect(r.songs.length).toBe(1);
    expect(r.skippedEmpty).toBe(1);
    expect(r.collapsedDuplicates).toBe(1);
  });
});

describe("slide cleaning + 🎵 formatting", () => {
  it("strips projection markup", () => {
    expect(cleanSlideText("<b><u><s846>It is final</s></u></b>\n‎It is written  ")).toBe("It is final\nIt is written");
  });
  it("wraps sections in music notes like the CLC chat", () => {
    expect(formatSection("It is final\nIt is written\nIt is settled\nIt is finished")).toBe("🎵 It is final\nIt is written\nIt is settled\nIt is finished 🎵");
    expect(formatSection("Hallelujah")).toBe("🎵 Hallelujah 🎵");
    expect(formatSection("A\nB")).toBe("🎵 A\nB 🎵");
  });
});

describe("grouping songbook slides", () => {
  const text = (...ts: string[]): Slide[] => ts.map((t) => ({ kind: "text", text: t }));
  const BREAK: Slide = { kind: "break" };

  it("packs consecutive one-line slides into fours", () => {
    expect(regroupSlides(text("a", "b", "c", "d", "e", "f", "g", "h", "i"))).toEqual(["a\nb\nc\nd", "e\nf\ng\nh", "i"]);
  });

  it("leaves a slide that already has its own lines alone", () => {
    const slides = ["one\ntwo", "three\nfour\nfive"];
    expect(regroupSlides(text(...slides))).toEqual(slides);
  });

  it("never merges two-line slides — that is the couplet the media team authored", () => {
    expect(regroupSlides(text("A o riri\n(Never seen)", "A o gbori\n(Nor heard before)"))).toEqual(["A o riri\n(Never seen)", "A o gbori\n(Nor heard before)"]);
  });

  it("flushes the packed lines when a multi-line slide interrupts them", () => {
    expect(regroupSlides(text("a", "b", "c\nd", "e"))).toEqual(["a\nb", "c\nd", "e"]);
  });

  it("starts a new section at a break, even mid-group", () => {
    expect(regroupSlides([...text("a", "b"), BREAK, ...text("c", "d")])).toEqual(["a\nb", "c\nd"]);
  });

  it("ignores a break that has nothing before or after it", () => {
    expect(regroupSlides([BREAK, ...text("a"), BREAK, BREAK])).toEqual(["a"]);
  });

  it("caps a slide that is longer than a chat message should be", () => {
    const long = Array.from({ length: 7 }, (_, i) => `l${i + 1}`).join("\n");
    expect(regroupSlides(text(long))).toEqual(["l1\nl2\nl3\nl4", "l5\nl6\nl7"]);
  });
});

describe("the songbook's own section markers", () => {
  it("starts a new section at a tagged entry that carries no text", () => {
    const raw = '{Songs:[{Guid:"g",Text:"El Roi",Verses:[{Text:"You sit in heaven"},{ID:2,Text:"Ancient of days"},{Tag:1,ID:0},{ID:3,Text:"Jehovah elroi"},{ID:4,Text:"Na u dey see"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["You sit in heaven\nAncient of days", "Jehovah elroi\nNa u dey see"]);
  });

  it("starts a new section at a tagged entry that does carry text", () => {
    const raw = '{Songs:[{Guid:"g",Text:"Forever",Verses:[{Text:"a"},{ID:2,Text:"b"},{Tag:3,ID:3,Text:"the chorus starts"},{ID:4,Text:"d"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb", "the chorus starts\nd"]);
  });

  it("drops an untagged empty entry without breaking the group", () => {
    const raw = '{Songs:[{Guid:"g",Text:"T",Verses:[{Text:"a"},{ID:2},{ID:3,Text:"b"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb"]);
  });

  it("drops a label-only slide", () => {
    const raw = '{Songs:[{Guid:"g",Text:"T",Verses:[{Text:"[Chorus]"},{ID:2,Text:"a"},{ID:3,Text:"b"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb"]);
  });
});

describe("real CLC songbook", () => {
  const path = "/mnt/user-data/uploads/light-desk/SongBooks/CLC.json";
  it.skipIf(!fs.existsSync(path))("parses all songs", () => {
    const r = parseVideoPsalmSongbook(fs.readFileSync(path, "utf8"));
    expect(r.totalEntries).toBe(1966);
    expect(r.songs.length).toBeGreaterThan(1800);
    const army = r.songs.find((s) => s.title.toLowerCase().includes("army arise"));
    expect(army).toBeDefined();
    expect(army!.sections.length).toBeGreaterThan(0);
    for (const s of r.songs) {
      expect(s.title.length).toBeGreaterThan(0);
      for (const sec of s.sections) expect(sec).not.toMatch(/<[a-z]+\d*>/i);
    }
  });

  // The Task 8 migration re-imports through this exact file — a repo-relative
  // path, not the sandbox upload path above — so this check runs against
  // whatever songbook the operator's machine actually has.
  const repoPath = "SongBooks/CLC.json";
  it.skipIf(!fs.existsSync(repoPath))("round-trips every song through the editor's join and Save split", () => {
    const r = parseVideoPsalmSongbook(fs.readFileSync(repoPath, "utf8"));
    for (const s of r.songs) {
      expect(splitOnBlankLines(s.sections.join("\n\n")), s.title).toEqual(s.sections);
      for (const sec of s.sections) {
        const lines = sec.split("\n");
        expect(lines[0].trim(), `${s.title}: leading blank line`).not.toBe("");
        expect(lines[lines.length - 1].trim(), `${s.title}: trailing blank line`).not.toBe("");
      }
    }
  });
});

describe("no stored section ever contains a blank line", () => {
  // The regression this catches: "Elu agogo" had a slide whose own Text held
  // an internal blank line (media team formatting, not a section break VideoPsalm
  // marked). cleanSlideText used to only collapse 3+ newlines to 2, so that one
  // blank line survived into the stored section. The editor joins sections with
  // "\n\n" and Save splits back on a blank line — so that surviving blank line
  // was indistinguishable from a real section break the moment anyone opened the
  // song and pressed Save without changing anything: splitOnBlankLines would cut
  // the song into more sections than it started with, silently, on every open.
  //
  // The invariant this test holds the parser to, not one example of it: for
  // every song this parser produces, joining its sections with "\n\n" and
  // splitting that back on blank lines must reproduce those exact sections.
  // Swept across a spread of where a blank line can hide inside one slide's
  // raw Text — leading, trailing, doubled, tripled, whitespace-only, and more
  // than one break in a single slide.
  const blankShapes = [
    "a\n\nb",
    "a\n\n\nb",
    "a\n\n\n\nb",
    "\na\nb",
    "a\nb\n",
    "\n\na\nb\n\n",
    "a\n \nb", // whitespace-only line, not literally empty
    "a\n\nb\n\nc",
    "a\nb\n\nc\nd",
  ];

  for (const shape of blankShapes) {
    it(`holds for a slide shaped ${JSON.stringify(shape)}`, () => {
      const raw = `{Songs:[{Guid:"g",Text:"T",Verses:[{Text:"${shape}"},{ID:2,Text:"trailer"}]}]}`;
      const { songs } = parseVideoPsalmSongbook(raw);
      for (const s of songs) {
        for (const sec of s.sections) expect(sec, shape).not.toMatch(/\n\s*\n/);
        expect(splitOnBlankLines(s.sections.join("\n\n")), shape).toEqual(s.sections);
      }
    });
  }

  it("holds across a whole song built from every shape above, packed together", () => {
    const verses = blankShapes.map((shape, i) => `{ID:${i},Text:"${shape}"}`).join(",");
    const raw = `{Songs:[{Guid:"g",Text:"T",Verses:[${verses}]}]}`;
    const { songs } = parseVideoPsalmSongbook(raw);
    for (const s of songs) {
      for (const sec of s.sections) expect(sec).not.toMatch(/\n\s*\n/);
      expect(splitOnBlankLines(s.sections.join("\n\n"))).toEqual(s.sections);
    }
  });
});
