import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { repairVideoPsalm, parseVideoPsalmSongbook, cleanSlideText, formatSection, regroupSections } from "../src/lib/videopsalm";

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

describe("regrouping one-line slides", () => {
  it("merges one-line slides into 4-line sections", () => {
    const slides = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    expect(regroupSections(slides)).toEqual(["a\nb\nc\nd", "e\nf\ng\nh", "i"]);
  });
  it("leaves multi-line slides alone", () => {
    const slides = ["one\ntwo\nthree\nfour", "five\nsix\nseven"];
    expect(regroupSections(slides)).toEqual(slides);
  });
  it("regroups when at least half the slides are single lines (Army Arise case)", () => {
    const slides = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k\nl", "m\nn"];
    const out = regroupSections(slides);
    expect(out.length).toBeLessThan(slides.length / 2);
    expect(out[0]).toBe("a\nb\nc\nd");
  });
  it("never splits an existing slide across sections", () => {
    const slides = ["a", "b\nc", "d", "e"];
    expect(regroupSections(slides)).toEqual(["a\nb\nc\nd", "e"]);
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
});
