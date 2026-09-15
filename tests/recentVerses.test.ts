import { describe, it, expect } from "vitest";
import { recentVerses, withRecent } from "../src/lib/recentVerses";

const row = (id: number, label: string, kind = "verse", createdAt = "2026-09-20T09:00:00.000Z") => ({ id, kind, label, createdAt });

describe("recentVerses", () => {
  it("reads the reference and translation out of a verse log label", () => {
    expect(recentVerses([row(1, "Romans 8:28-30 (NKJV)")])).toEqual([{ reference: "Romans 8:28-30", translation: "NKJV", at: "2026-09-20T09:00:00.000Z" }]);
  });

  it("treats a whole-passage copy as the same verse", () => {
    expect(recentVerses([row(2, "Romans 8 (KJV) whole"), row(1, "Romans 8 (KJV)")])).toEqual([{ reference: "Romans 8", translation: "KJV", at: "2026-09-20T09:00:00.000Z" }]);
  });

  it("keeps the newest of a verse copied twice, in the order the rows came (newest first)", () => {
    const got = recentVerses([row(3, "John 3:16 (NKJV)", "verse", "c"), row(2, "Psalm 23:1 (KJV)", "verse", "b"), row(1, "John 3:16 (NKJV)", "verse", "a")]);
    expect(got.map((r) => `${r.reference} ${r.at}`)).toEqual(["John 3:16 c", "Psalm 23:1 b"]);
  });

  it("keeps one row per reference, in the translation it was last looked up in", () => {
    // Trying a verse in four translations is one verse to come back to, not four.
    expect(recentVerses([row(2, "John 3:16 (TPT)"), row(1, "John 3:16 (NKJV)")]).map((r) => r.translation)).toEqual(["TPT"]);
  });

  it("ignores songs, messages, description searches and labels it can't read", () => {
    expect(recentVerses([row(4, "Way Maker §2", "song"), row(3, "walk on snakes", "search"), row(2, "Greetings · Sunday", "message"), row(1, "garbled label")])).toEqual([]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i, `Psalm ${i + 1}:1 (KJV)`));
    expect(recentVerses(rows, 4)).toHaveLength(4);
  });
});

describe("withRecent", () => {
  it("puts a new copy first and drops its older twin", () => {
    const list = [
      { reference: "Psalm 23:1", translation: "KJV", at: "b" },
      { reference: "John 3:16", translation: "NKJV", at: "a" },
    ];
    expect(withRecent(list, { reference: "John 3:16", translation: "NKJV", at: "c" }).map((r) => r.reference)).toEqual(["John 3:16", "Psalm 23:1"]);
  });

  it("replaces a reference looked up in another translation", () => {
    const list = [{ reference: "John 3:16", translation: "NKJV", at: "a" }];
    expect(withRecent(list, { reference: "John 3:16", translation: "AMP", at: "b" })).toEqual([{ reference: "John 3:16", translation: "AMP", at: "b" }]);
  });

  it("keeps to the limit", () => {
    const list = Array.from({ length: 6 }, (_, i) => ({ reference: `Psalm ${i + 1}:1`, translation: "KJV", at: "a" }));
    expect(withRecent(list, { reference: "John 1:1", translation: "KJV", at: "b" }, 6)).toHaveLength(6);
  });
});
