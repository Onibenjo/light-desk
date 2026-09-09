import { describe, it, expect } from "vitest";
import { parseSetlistCreate, parseSetlistPatch, MAX_ITEMS } from "../src/lib/setlistEdit";

const created = (body: unknown) => {
  const r = parseSetlistCreate(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};
const patched = (body: unknown) => {
  const r = parseSetlistPatch(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};
const song = (id: number, title = `Song ${id}`) => ({ id, title });

describe("naming a setlist", () => {
  it("trims it and collapses it to one line", () => {
    expect(created({ name: "  Sunday 14 Sept\n1st service " }).name).toBe("Sunday 14 Sept 1st service");
  });

  it("refuses a blank name", () => {
    expect(parseSetlistCreate({ name: "   " })).toMatch(/name/i);
    expect(parseSetlistCreate({})).toMatch(/name/i);
    expect(parseSetlistCreate(null)).toMatch(/name/i);
  });

  it("refuses a name past 80 characters", () => {
    expect(created({ name: "a".repeat(80) }).name.length).toBe(80);
    expect(parseSetlistCreate({ name: "a".repeat(81) })).toMatch(/name/i);
  });
});

describe("changing a setlist", () => {
  it("takes songs, with the setlist the client last read", () => {
    const p = patched({ items: [song(3), song(9)], updatedAt: "2026-09-09T10:00:00.000Z" });
    expect(p.items).toEqual([song(3), song(9)]);
    expect(p.updatedAt).toBe("2026-09-09T10:00:00.000Z");
  });

  it("refuses songs without it, since a blind overwrite would silently drop someone's addition", () => {
    expect(parseSetlistPatch({ items: [song(3)] })).toMatch(/last read/i);
    expect(parseSetlistPatch({ items: [song(3)], updatedAt: "" })).toMatch(/last read/i);
  });

  it("does not ask for it to rename or activate, which cannot lose anyone's work", () => {
    expect(patched({ name: "Rehearsal" })).toEqual({ name: "Rehearsal" });
    expect(patched({ active: true })).toEqual({ active: true });
  });

  it("keeps the first of a repeated song rather than listing it twice", () => {
    const p = patched({ items: [song(3, "Way Maker"), song(9), song(3, "Way Maker (2)")], updatedAt: "t" });
    expect(p.items).toEqual([song(3, "Way Maker"), song(9)]);
  });

  it("trims a cached title and cuts it at 200 characters", () => {
    const p = patched({ items: [{ id: 1, title: `  ${"x".repeat(300)}  ` }], updatedAt: "t" });
    expect(p.items?.[0].title.length).toBe(200);
  });

  it("refuses a song that is not an id and a title", () => {
    for (const bad of [[{ id: 0, title: "T" }], [{ id: 1.5, title: "T" }], [{ id: "1", title: "T" }], [{ id: 1 }], [{ id: 1, title: "  " }], ["Way Maker"], "nope"]) {
      expect(parseSetlistPatch({ items: bad, updatedAt: "t" })).toMatch(/song/i);
    }
  });

  it(`refuses more than ${MAX_ITEMS} songs`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => song(i + 1));
    expect(patched({ items: many(MAX_ITEMS), updatedAt: "t" }).items).toHaveLength(MAX_ITEMS);
    expect(parseSetlistPatch({ items: many(MAX_ITEMS + 1), updatedAt: "t" })).toMatch(/at most/i);
  });

  it("refuses a change that changes nothing", () => {
    expect(parseSetlistPatch({})).toMatch(/nothing/i);
    expect(parseSetlistPatch(null)).toMatch(/nothing/i);
    expect(parseSetlistPatch({ active: "yes" })).toMatch(/true or false/i);
  });
});
