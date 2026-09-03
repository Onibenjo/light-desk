import { describe, it, expect } from "vitest";
import { normalize, tokenize, buildIndex, searchSongs, type SearchableSong } from "../src/lib/songSearch";

const AMAZING: SearchableSong = {
  guid: "1",
  title: "Amazing Grace",
  sections: ["Amazing grace how sweet the sound\nThat saved a wretch like me", "I once was lost but now am found\nWas blind but now I see"],
};

const YORUBA: SearchableSong = {
  guid: "2",
  title: "A o riri, A o gbori",
  sections: ["A o riri, A o gbori\n(Never seen, nor heard before)\nIru yin ko si", "Ọlọrun tobi\n(God is great)"],
};

const SCATTERED: SearchableSong = {
  guid: "3",
  title: "Scattered Song",
  sections: ["Amazing is the morning", "Grace falls on me", "Sweet is the evening rest"],
};

const HALLELUJAH: SearchableSong = {
  guid: "4",
  title: "Endless Song",
  sections: ["Hallelujah to the King\nForever and ever"],
};

const BOOK = buildIndex([AMAZING, YORUBA, SCATTERED, HALLELUJAH]);
const titles = (q: string, limit?: number) => searchSongs(BOOK, q, limit).map((m) => m.song.title);

describe("normalize", () => {
  it("folds case", () => {
    expect(normalize("Amazing GRACE")).toBe("amazing grace");
  });

  it("strips the diacritics of the Yoruba and Igbo lyrics, so Ọlọrun is findable as Olorun", () => {
    expect(normalize("Ọlọrun")).toBe("olorun");
    expect(normalize("Chinéké")).toBe("chineke");
  });

  it("drops apostrophes rather than splitting the word around them", () => {
    expect(normalize("we'll")).toBe("well");
    expect(normalize("God’s")).toBe("gods");
  });

  it("turns the remaining punctuation into separators and collapses the whitespace", () => {
    expect(normalize("A o riri,  A o gbori!")).toBe("a o riri a o gbori");
  });
});

describe("tokenize", () => {
  it("splits a query into normalized words", () => {
    expect(tokenize("Amazing Grace!")).toEqual(["amazing", "grace"]);
  });

  it("caps a runaway query at eight words", () => {
    expect(tokenize("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("has no words for an empty or punctuation-only query", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("!!!")).toEqual([]);
  });
});

describe("searchSongs", () => {
  it("finds a song from a line of its lyrics when you don't know the title", () => {
    expect(titles("wretch like me")).toEqual(["Amazing Grace"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchSongs(BOOK, "")).toEqual([]);
  });

  it("matches whole words from the start, so 'art' does not match 'heart'", () => {
    const book = buildIndex([{ guid: "x", title: "Heartsong", sections: ["My heart is full"] }]);
    expect(searchSongs(book, "art")).toEqual([]);
  });

  it("matches a half-typed word as a prefix, so results appear while you type", () => {
    expect(titles("wretch li")).toEqual(["Amazing Grace"]);
  });

  it("matches a plural against the singular in the lyrics", () => {
    const book = buildIndex([{ guid: "x", title: "Praise", sections: ["The god of heaven"] }]);
    expect(searchSongs(book, "gods")).toHaveLength(1);
  });

  it("ignores diacritics in both the query and the lyrics", () => {
    expect(titles("olorun tobi")).toEqual(["A o riri, A o gbori"]);
    expect(titles("Ọlọrun")).toEqual(["A o riri, A o gbori"]);
  });
});

describe("ranking", () => {
  it("puts a title match above a lyric match", () => {
    expect(titles("amazing grace")[0]).toBe("Amazing Grace");
  });

  it("puts words contiguous in one line above words merely in the same section", () => {
    const contiguous = { guid: "a", title: "A", sections: ["hold me close tonight"] };
    const sameSection = { guid: "b", title: "B", sections: ["hold on my friend\nkeep me safe\nclose the door tonight"] };
    const book = buildIndex([sameSection, contiguous]);
    expect(searchSongs(book, "hold me close").map((m) => m.song.title)).toEqual(["A", "B"]);
  });

  it("puts words in one section above words scattered across a whole song", () => {
    const oneSection = { guid: "a", title: "A", sections: ["amazing morning\nand sweet grace"] };
    const wholeSong = { guid: "b", title: "B", sections: ["amazing dawn", "the grace of it", "sweet rest"] };
    const book = buildIndex([wholeSong, oneSection]);
    expect(searchSongs(book, "amazing grace sweet").map((m) => m.song.title)).toEqual(["A", "B"]);
  });

  it("puts every complete match above a partial one", () => {
    const complete = { guid: "a", title: "A", sections: ["hold me close tonight"] };
    const partial = { guid: "b", title: "B", sections: ["hold me now"] };
    const hits = searchSongs(buildIndex([partial, complete]), "hold me close");
    expect(hits.map((m) => m.song.title)).toEqual(["A", "B"]);
    expect(hits.map((m) => m.matched)).toEqual([3, 2]);
  });

  it("reports the tier so the ordering can be explained", () => {
    expect(searchSongs(BOOK, "amazing grace")[0].tier).toBe(1);
    expect(searchSongs(BOOK, "wretch like me")[0].tier).toBe(2);
  });
});

describe("partial matches", () => {
  it("still finds the song when one remembered word is wrong", () => {
    const hits = searchSongs(BOOK, "saved a sinner like me");
    expect(hits[0].song.title).toBe("Amazing Grace");
    expect(hits[0].matched).toBe(4);
    expect(hits[0].words).toBe(5);
  });

  it("orders partial matches by how many words they matched", () => {
    const three = { guid: "a", title: "Three", sections: ["red green blue lines"] };
    const two = { guid: "b", title: "Two", sections: ["red green only"] };
    const hits = searchSongs(buildIndex([two, three]), "red green blue yellow");
    expect(hits.map((m) => m.song.title)).toEqual(["Three", "Two"]);
    expect(hits.map((m) => m.matched)).toEqual([3, 2]);
  });

  it("ignores a song that matched only one word of three, which is noise rather than a memory", () => {
    // SCATTERED has "me", and nothing else of this query.
    expect(titles("wretch like me")).toEqual(["Amazing Grace"]);
  });

  it("returns nothing when not a single word matches", () => {
    expect(searchSongs(BOOK, "zzzz qqqq")).toEqual([]);
  });
});

describe("translations", () => {
  it("finds a Yoruba song by the English of its parenthetical translation", () => {
    expect(titles("never seen nor heard")).toEqual(["A o riri, A o gbori"]);
  });

  it("shows the translation line as the snippet when that is what matched", () => {
    const hit = searchSongs(BOOK, "never seen nor heard")[0];
    expect(hit.snippet!.text).toBe("(Never seen, nor heard before)");
    expect(hit.snippet!.translation).toBe(true);
  });

  it("ranks a sung line above a translation gloss in the same tier", () => {
    const sung = { guid: "a", title: "A", sections: ["God is great today"] };
    const gloss = { guid: "b", title: "B", sections: ["Olorun tobi\n(God is great)"] };
    const book = buildIndex([gloss, sung]);
    expect(searchSongs(book, "god is great").map((m) => m.song.title)).toEqual(["A", "B"]);
  });
});

describe("misspellings", () => {
  it("finds a long word that was misspelt by one letter", () => {
    expect(titles("hallelujeh to the king")).toEqual(["Endless Song"]);
  });

  it("marks a misspelt match as fuzzy so it can be ranked and shown as one", () => {
    expect(searchSongs(BOOK, "hallelujeh to the king")[0].fuzzy).toBe(true);
  });

  it("never lets a misspelt match outrank an exact one", () => {
    const exact = { guid: "a", title: "A", sections: ["hallelujah forever"] };
    const typo = { guid: "b", title: "B", sections: ["hallelujoh forever"] };
    const book = buildIndex([typo, exact]);
    const hits = searchSongs(book, "hallelujah");
    expect(hits[0].song.title).toBe("A");
    expect(hits[0].fuzzy).toBe(false);
  });

  it("does not guess at short words, where one letter changes the word entirely", () => {
    const book = buildIndex([{ guid: "x", title: "X", sections: ["the lord is here"] }]);
    expect(searchSongs(book, "word")).toEqual([]);
  });
});

describe("snippets", () => {
  it("returns the matching lyric line with the matched words marked for highlighting", () => {
    const hit = searchSongs(BOOK, "wretch like me")[0];
    expect(hit.snippet!.text).toBe("That saved a wretch like me");
    const marked = hit.snippet!.ranges.map(({ start, end }) => hit.snippet!.text.slice(start, end));
    expect(marked).toEqual(["wretch", "like", "me"]);
  });

  it("points at the section the line came from", () => {
    expect(searchSongs(BOOK, "now am found")[0].section).toBe(1);
  });

  it("has no snippet when only the title matched", () => {
    const book = buildIndex([{ guid: "x", title: "Doxology", sections: ["Praise him all creatures"] }]);
    expect(searchSongs(book, "doxology")[0].snippet).toBe(null);
  });

  it("prefers the tightest line when several lines match", () => {
    const book = buildIndex([{ guid: "x", title: "X", sections: ["hold on and keep me close\nhold me close"] }]);
    expect(searchSongs(book, "hold me close")[0].snippet!.text).toBe("hold me close");
  });
});

describe("limits", () => {
  it("returns at most the requested number of songs", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ guid: `g${i}`, title: `Song ${i}`, sections: ["praise the lord"] }));
    expect(searchSongs(buildIndex(many), "praise", 20)).toHaveLength(20);
  });
});

describe("how far partial matches go", () => {
  const book = buildIndex([
    { guid: "a", title: "Whole", sections: ["never seen nor heard before"] },
    ...Array.from({ length: 30 }, (_, i) => ({ guid: `n${i}`, title: `Near ${i}`, sections: ["never say i have not seen"] })),
  ]);

  it("does not bury a complete match under near misses", () => {
    const hits = searchSongs(book, "never seen nor heard");
    expect(hits[0].song.title).toBe("Whole");
    expect(hits).toHaveLength(5);
  });

  it("fills the list with near misses when nothing matched every word", () => {
    const hits = searchSongs(book, "never seen nor spoken");
    expect(hits.length).toBeGreaterThan(5);
    expect(hits.every((h) => h.matched < h.words)).toBe(true);
  });
});

describe("the bugs the review found", () => {
  it("still calls a phrase contiguous when the phrase repeats a word", () => {
    // "a" and "o" each appear twice; one "a" in the line answers both.
    const book = buildIndex([{ guid: "x", title: "X", sections: ["A o riri, A o gbori"] }]);
    expect(searchSongs(book, "a o riri a o gbori")[0].tier).toBe(2);
  });

  it("counts a repeated query word once when reporting how much it understood", () => {
    const book = buildIndex([{ guid: "x", title: "X", sections: ["praise the lord"] }]);
    const hit = searchSongs(book, "praise praise the lord")[0];
    expect(hit.words).toBe(3);
    expect(hit.matched).toBe(3);
  });

  it("orders near misses by how tightly the words it did match sit together", () => {
    const tight = { guid: "a", title: "Tight", sections: ["red green blue"] };
    const loose = { guid: "b", title: "Loose", sections: ["red is here", "green is there", "blue is everywhere"] };
    const hits = searchSongs(buildIndex([loose, tight]), "red green blue purple");
    expect(hits.map((h) => h.song.title)).toEqual(["Tight", "Loose"]);
  });

  it("does not let a spelling guess outrank a song that matched as typed", () => {
    const guessed = { guid: "a", title: "Guessed", sections: ["hallelujoh king"] }; // contiguous, but misspelt
    const typed = { guid: "b", title: "Typed", sections: ["hallelujah be praised", "he is king"] }; // scattered, exact
    const hits = searchSongs(buildIndex([guessed, typed]), "hallelujah king");
    expect(hits[0].song.title).toBe("Typed");
    expect(hits[0].fuzzy).toBe(false);
  });

  it("still prefers a spelling guess that understood more of the query", () => {
    const guessed = { guid: "a", title: "Guessed", sections: ["hallelujoh to the king"] };
    const typed = { guid: "b", title: "Typed", sections: ["the king of nowhere"] };
    const hits = searchSongs(buildIndex([guessed, typed]), "hallelujah to the king");
    expect(hits[0].song.title).toBe("Guessed");
    expect(hits[0].matched).toBe(4);
  });
});
