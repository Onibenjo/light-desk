// Matching a setlist's song names to the song bank. The LLM never picks the song; this does.
import { describe, it, expect } from "vitest";
import { buildIndex, type SearchableSong } from "../src/lib/songSearch";
import { matchSong } from "../src/lib/setlistMatch";

const songs: SearchableSong[] = [
  { id: 1, title: "Victor's Crown", sections: ["You are always fighting for us"] },
  { id: 2, title: "Iron Breaker", sections: ["His name is Jehovah, iron breaker"] },
  { id: 3, title: "Way Maker", sections: ["Way maker miracle worker"] },
  { id: 4, title: "Great Is Your Mercy", sections: ["Great is your mercy towards me"] },
  { id: 5, title: "Great Is Your Faithfulness", sections: ["Great is your faithfulness oh God"] },
  { title: "No Id Song", sections: ["Unmatched words here"] },
];
const index = buildIndex(songs);
const song = (title: string, alternatives: string[] = []) => ({ title, alternatives });

describe("matchSong", () => {
  it("matches an exact title", () => {
    expect(matchSong(index, song("Victor’s crown"))).toEqual({ status: "matched", song: { id: 1, title: "Victor's Crown" } });
  });

  it("matches through an alternative name", () => {
    expect(matchSong(index, song("His name is Jehovah", ["iron breaker"]))).toEqual({ status: "matched", song: { id: 2, title: "Iron Breaker" } });
  });

  it("matches despite a small typo", () => {
    expect(matchSong(index, song("Way Makerr"))).toMatchObject({ status: "matched", song: { id: 3 } });
  });

  it("offers up to 3 candidates when two titles tie", () => {
    const m = matchSong(index, song("Great is your"));
    expect(m.status).toBe("pick");
    if (m.status === "pick") {
      expect(m.candidates.map((c) => c.id).sort()).toEqual([4, 5]);
      expect(m.candidates.length).toBeLessThanOrEqual(3);
    }
  });

  it("is missing when nothing is found", () => {
    expect(matchSong(index, song("Otuaka"))).toEqual({ status: "missing" });
  });

  it("ignores songs without an id", () => {
    expect(matchSong(index, song("No Id Song"))).toEqual({ status: "missing" });
  });
});
