// The rule-based setlist reader: the fallback when the LLM is unavailable.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSetlistText } from "../src/lib/setlistParse";

const sample = readFileSync(join(__dirname, "fixtures/setlist-sample.txt"), "utf8");

describe("parseSetlistText", () => {
  it("parses the sample into two services with First worship, Praise, Second worship", () => {
    const services = parseSetlistText(sample);
    expect(services.map((s) => s.name)).toEqual(["First Service", "Second Service"]);
    expect(services[0].sections.map((s) => s.name)).toEqual(["First worship", "Praise", "Second worship"]);
    expect(services[1].sections.map((s) => s.name)).toEqual(["First worship", "PRAISE", "Second worship"]);
    expect(services[0].sections[0].songs).toEqual([{ title: "Victor’s crown", alternatives: [], artist: "Darlene Zsech" }]);
    expect(services[0].sections[1].songs[0].title).toBe("Lord you are good and your mercies");
    expect(services[1].sections[2].songs[0]).toEqual({ title: "I speak Jesus", alternatives: [], artist: "Charity Gayle" });
  });

  it("splits brackets into alternatives and \" - Artist\" / \" by Artist\" into artist", () => {
    const [s] = parseSetlistText("Praise\n• Oh my God o (Almighty Father take all the glory)\n• His name is Jehovah(iron breaker)\n• Way Maker by Sinach\n• Joyful noise - Eben");
    expect(s.sections[0].songs).toEqual([
      { title: "Oh my God o", alternatives: ["Almighty Father take all the glory"] },
      { title: "His name is Jehovah", alternatives: ["iron breaker"] },
      { title: "Way Maker", alternatives: [], artist: "Sinach" },
      { title: "Joyful noise", alternatives: [], artist: "Eben" },
    ]);
  });

  it("ignores lyric lines and unbulleted chatter", () => {
    const praise = parseSetlistText(sample)[0].sections[1].songs.map((s) => s.title);
    expect(praise).not.toContain("He’s a mighty God");
    expect(praise).toHaveLength(9);
  });

  it("treats •, -, *, 1., 1) and emoji-led lines as songs", () => {
    const [s] = parseSetlistText("Praise\n• A\n- B\n* C\n1. D\n2) E\n🎵 F\nchatter");
    expect(s.sections[0].songs.map((x) => x.title)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("keeps a repeated song twice", () => {
    const [s] = parseSetlistText("Praise\n• Otuaka\n• Otuaka");
    expect(s.sections[0].songs).toHaveLength(2);
  });

  it('gives one "Service" with one unnamed section when there are no headings', () => {
    const services = parseSetlistText("• Otuaka\n• Oba tobi oku");
    expect(services).toEqual([{ name: "Service", sections: [{ name: "", songs: [{ title: "Otuaka", alternatives: [] }, { title: "Oba tobi oku", alternatives: [] }] }] }]);
  });

  it("returns [] for text with no songs", () => {
    expect(parseSetlistText("")).toEqual([]);
    expect(parseSetlistText("FIRST SERVICE\nPraise\n")).toEqual([]);
  });
});
