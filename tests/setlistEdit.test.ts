import { describe, it, expect } from "vitest";
import { addedMessageIds, itemKey, parseSetlistCreate, parseSetlistPatch, refusedMessage, storedItems, MAX_ITEMS } from "../src/lib/setlistEdit";

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
const song = (id: number, title = `Song ${id}`) => ({ kind: "song" as const, id, title });
const message = (id: number, title = `Message ${id}`, parts?: string[]) => ({ kind: "message" as const, id, title, ...(parts ? { parts } : {}) });

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

describe("messages in a setlist", () => {
  it("reads an item with no kind as a song, which is how every setlist before messages was saved", () => {
    expect(patched({ items: [{ id: 3, title: "Way Maker" }], updatedAt: "t" }).items).toEqual([song(3, "Way Maker")]);
    expect(storedItems([{ id: 3, title: "Way Maker" }, message(4)])).toEqual([song(3, "Way Maker"), message(4)]);
    expect(storedItems("not an array")).toEqual([]);
  });

  it("takes a message, with or without text edited for this service", () => {
    const p = patched({ items: [message(12, "Next Service · Midweek"), message(13, "Greetings · Sunday", [" Good morning ", ""])], updatedAt: "t" });
    expect(p.items).toEqual([message(12, "Next Service · Midweek"), message(13, "Greetings · Sunday", ["Good morning"])]);
  });

  it("refuses edited text that breaks the library's rules", () => {
    expect(parseSetlistPatch({ items: [message(12, "x", [])], updatedAt: "t" })).toMatch(/edited text/i);
    expect(parseSetlistPatch({ items: [message(12, "x", ["a".repeat(4001)])], updatedAt: "t" })).toMatch(/edited text/i);
  });

  it("tells a song from a message with the same id, but not a message from itself", () => {
    expect(patched({ items: [song(12), message(12), message(12, "again")], updatedAt: "t" }).items).toEqual([song(12), message(12)]);
    expect(itemKey(song(12))).not.toBe(itemKey(message(12)));
  });

  it("refuses an unknown kind", () => {
    expect(parseSetlistPatch({ items: [{ kind: "verse", id: 1, title: "John 3:16" }], updatedAt: "t" })).toMatch(/song or message/i);
  });

  it("finds only the messages being added, so a setlist saved earlier is never re-judged", () => {
    expect(addedMessageIds([song(1), message(5)], [message(5), song(1), message(7), song(9)])).toEqual([7]);
  });

  it("refuses an apology by its section's name, and a message that is gone", () => {
    const facts = new Map([
      [7, { inService: false, sectionName: "Apologies" }],
      [8, { inService: true, sectionName: "Greetings" }],
    ]);
    expect(refusedMessage([8], facts)).toBe(null);
    expect(refusedMessage([8, 7], facts)).toBe("Apologies can't go in a setlist");
    expect(refusedMessage([99], facts)).toMatch(/no longer in the library/);
  });
});
