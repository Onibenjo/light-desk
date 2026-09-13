import { describe, it, expect } from "vitest";
import { groupLibrary, libraryEntries, messageLabel, messagesById } from "../src/lib/messageLibrary";
import { library } from "./fixtures/library";

describe("the library in order", () => {
  it("lists sections by sort, each with its messages by sort, empty sections included", () => {
    const groups = groupLibrary(library);
    expect(groups.map((g) => g.section.name)).toEqual(["Apologies", "Welcoming Ambience Jewel", "Empty"]);
    expect(groups[1].messages.map((m) => m.title)).toEqual(["Sunday", "Sunday · Worship"]);
    expect(groups[2].messages).toEqual([]);
  });

  it("flattens to entries in that same order, leaving out a message whose section is gone", () => {
    expect(libraryEntries(library).map((e) => e.message.id)).toEqual([20, 10, 11]);
  });

  it("labels a message by its section, which is how it reads in a setlist and the log", () => {
    expect(messageLabel({ name: "Apologies" }, { title: "Sound restored" })).toBe("Apologies · Sound restored");
  });

  it("looks messages up by id, and knows nothing while the library is loading", () => {
    expect(messagesById(null)).toBe(null);
    expect(messagesById(library)?.get(11)?.section.name).toBe("Welcoming Ambience Jewel");
    expect(messagesById(library)?.has(99)).toBe(false);
  });
});
