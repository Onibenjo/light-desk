import { describe, it, expect } from "vitest";
import { searchMessages } from "../src/lib/messageSearch";
import { library } from "./fixtures/library";

const ids = (q: string) => searchMessages(library, q).map((e) => e.message.id);

describe("finding a message", () => {
  it("needs every word, in any order", () => {
    expect(ids("sound restored")).toEqual([20]);
    expect(ids("restored sound")).toEqual([20]);
    expect(ids("sound worship")).toEqual([]);
  });

  it("matches the text, not just the title", () => {
    expect(ids("interruption")).toEqual([20]);
  });

  it("matches the section name, so 'welcoming sunday' finds both Sunday lines", () => {
    expect(ids("welcoming sunday")).toEqual([10, 11]);
  });

  it("matches words from their start, ignoring case and accents", () => {
    expect(ids("RESTOR")).toEqual([20]);
    expect(ids("storED")).toEqual([]);
    expect(ids("apologíes")).toEqual([20]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(ids("   ")).toEqual([]);
  });
});
