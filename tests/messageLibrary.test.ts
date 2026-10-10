import { describe, it, expect } from "vitest";
import { groupLibrary, groupEntries, libraryEntries, messageLabel, messagesById, openMessageFor, partLabel } from "../src/lib/messageLibrary";
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

describe("grouping search results", () => {
  it("groups consecutive results under their section, in the order given", () => {
    const entries = libraryEntries(library);
    const groups = groupEntries([entries[1], entries[2], entries[0]]);
    expect(groups.map((g) => [g.section.name, g.messages.map((m) => m.id)])).toEqual([
      ["Welcoming Ambience Jewel", [10, 11]],
      ["Apologies", [20]],
    ]);
  });
});

describe("opening and logging a message", () => {
  it("opens a library message with its key, label and whether it can go in a setlist", () => {
    const [sorry] = libraryEntries(library);
    expect(openMessageFor(sorry, {})).toEqual({
      key: "message:20",
      id: 20,
      label: "Apologies · Sound restored",
      source: sorry.message.parts,
      parts: sorry.message.parts.map((text) => ({ text, missing: [] })),
      edited: false,
      inService: false,
    });
  });

  it("fills the branch's values into each part and reports the ones it has none for", () => {
    const [sorry] = libraryEntries(library);
    const entry = { ...sorry, message: { ...sorry.message, parts: ["Give via {offeringAccounts}", "Email {testimonyEmail}", "Plain"] } };
    expect(openMessageFor(entry, { offeringAccounts: "Zenith 123" }).parts).toEqual([
      { text: "Give via Zenith 123", missing: [] },
      { text: "Email {testimonyEmail}", missing: ["testimonyEmail"] },
      { text: "Plain", missing: [] },
    ]);
  });

  it("logs which part of a long message was sent, and nothing extra for a short one", () => {
    expect(partLabel("Apologies · Sound restored", 0, 1)).toBe("Apologies · Sound restored");
    expect(partLabel("Confession · Full text", 1, 3)).toBe("Confession · Full text · part 2 of 3");
  });
});
