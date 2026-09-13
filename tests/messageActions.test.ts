import { describe, it, expect } from "vitest";
import { messageActions } from "../src/lib/messageActions";
import { filterActions } from "../src/lib/shortcuts";
import { library } from "./fixtures/library";

describe("messages in the command palette", () => {
  it("has none until the library has loaded", () => {
    expect(messageActions(null, () => {})).toEqual([]);
  });

  it("lists every message by its label, in service order, under Message", () => {
    const actions = messageActions(library, () => {});
    expect(actions.map((a) => a.title)).toEqual(["Apologies · Sound restored", "Welcoming Ambience Jewel · Sunday", "Welcoming Ambience Jewel · Sunday · Worship"]);
    expect(new Set(actions.map((a) => a.group))).toEqual(new Set(["Message"]));
  });

  it("finds a message by words from its text that are not in its title", () => {
    const found = filterActions(messageActions(library, () => {}), "for the interruption");
    expect(found.map((a) => a.title)).toEqual(["Apologies · Sound restored"]);
  });

  it("hands the chosen message back to the desk", () => {
    const picked: number[] = [];
    messageActions(library, (entry) => picked.push(entry.message.id))[0].run();
    expect(picked).toEqual([20]);
  });
});
