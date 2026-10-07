// Exercises src/db/messages.ts against a real temporary file database, the way
// tests/setlists.test.ts does: the reorder swap and the case-insensitive unique
// name both live in SQL, so a mock would only prove the mock.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSeed } from "../src/lib/messageSeed";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let lib: typeof import("../src/db/messages");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-messages-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  lib = await import("../src/db/messages");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

const branch = (id: number) => ({ id, name: "CLC Ilorin", pinVersion: 0, tokens: {} });
const section = async (name: string, inService = true) => {
  const s = await lib.createSection({ name, inService });
  if (s === "duplicate") throw new Error("unexpected duplicate");
  return s;
};
const message = async (sectionId: number, title: string, parts = ["text"]) => {
  const m = await lib.createMessage(1, { sectionId, title, parts, scope: "shared" });
  if (m === "no-section") throw new Error("unexpected no-section");
  return m;
};

describe("sections", () => {
  it("are created at the end, and a name that differs only in case is a duplicate", async () => {
    const a = await section("Apologies", false);
    const b = await section("Greetings");
    expect([a.sort, b.sort]).toEqual([0, 1]);
    expect(a.inService).toBe(false);
    expect(await lib.createSection({ name: "APOLOGIES", inService: true })).toBe("duplicate");
    expect(await lib.updateSection(b.id, { name: "apologies" })).toBe("duplicate");
  });

  it("move one place at a time, and moving past either end does nothing", async () => {
    const a = await section("A");
    const b = await section("B");
    const c = await section("C");
    await lib.updateSection(c.id, { move: -1 });
    await lib.updateSection(a.id, { move: -1 });
    expect((await lib.loadLibrary(branch(1))).sections.map((s) => s.name)).toEqual(["A", "C", "B"]);
    expect(b.id).toBeGreaterThan(0);
  });

  it("can be renamed and switched out of service", async () => {
    const a = await section("Apology");
    const saved = await lib.updateSection(a.id, { name: "Apologies", inService: false });
    expect(saved).toMatchObject({ name: "Apologies", inService: false });
    expect(await lib.updateSection(999, { name: "x" })).toBe("gone");
  });

  it("leaves order and name untouched when a combined move and rename is refused as a duplicate", async () => {
    await section("A");
    await section("B");
    const c = await section("C");
    expect(await lib.updateSection(c.id, { move: -1, name: "a" })).toBe("duplicate");
    expect((await lib.loadLibrary(branch(1))).sections.map((s) => s.name)).toEqual(["A", "B", "C"]);
    expect((await lib.loadLibrary(branch(1))).sections.find((s) => s.id === c.id)?.name).toBe("C");
  });

  it("cannot be deleted while they still hold messages, so one click never wipes twenty", async () => {
    const a = await section("Apologies");
    await message(a.id, "Sound restored");
    expect(await lib.deleteSection(a.id, 1)).toBe("not-empty");
    const empty = await section("Empty");
    expect(await lib.deleteSection(empty.id, 1)).toBe("deleted");
    expect(await lib.deleteSection(empty.id, 1)).toBe("gone");
  });

  it("say so when only other branches' private messages keep a section from being deleted", async () => {
    const a = await section("Apologies");
    const m = await lib.createMessage(2, { sectionId: a.id, title: "Private", parts: ["x"], scope: "branch" });
    if (m === "no-section") throw new Error("unexpected");
    expect(await lib.deleteSection(a.id, 1)).toBe("not-empty-elsewhere");
    expect(await lib.deleteSection(a.id, 2)).toBe("not-empty");
  });
});

describe("messages", () => {
  it("keep their parts, and are created at the end of their section", async () => {
    const a = await section("Confession");
    const first = await message(a.id, "Sunday", ["Sirs and Mas, join us"]);
    const second = await message(a.id, "Full text", ["Father we thank You", "Every son and daughter"]);
    expect([first.sort, second.sort]).toEqual([0, 1]);
    expect((await lib.loadLibrary(branch(1))).messages.find((m) => m.id === second.id)?.parts).toEqual(["Father we thank You", "Every son and daughter"]);
  });

  it("need a section that exists", async () => {
    expect(await lib.createMessage(1, { sectionId: 999, title: "x", parts: ["y"], scope: "shared" })).toBe("no-section");
  });

  it("move within their section only", async () => {
    const a = await section("A");
    const b = await section("B");
    const a1 = await message(a.id, "a1");
    const a2 = await message(a.id, "a2");
    await message(b.id, "b1");
    await lib.updateMessage(1, a2.id, { move: -1 });
    await lib.updateMessage(1, a2.id, { move: -1 });
    const inA = (await lib.loadLibrary(branch(1))).messages.filter((m) => m.sectionId === a.id).sort((x, y) => x.sort - y.sort);
    expect(inA.map((m) => m.title)).toEqual(["a2", "a1"]);
    expect(a1.id).toBeGreaterThan(0);
  });

  it("go to the end of another section when moved there", async () => {
    const a = await section("A");
    const b = await section("B");
    await message(b.id, "b1");
    const moving = await message(a.id, "a1");
    const saved = await lib.updateMessage(1, moving.id, { sectionId: b.id, title: "now in B" });
    expect(saved).toMatchObject({ sectionId: b.id, sort: 1, title: "now in B" });
    expect(await lib.updateMessage(1, moving.id, { sectionId: 999 })).toBe("no-section");
    expect(await lib.updateMessage(1, 999, { title: "x" })).toBe("gone");
  });

  it("can be deleted once", async () => {
    const a = await section("A");
    const m = await message(a.id, "a1");
    expect(await lib.deleteMessage(1, m.id)).toBe(true);
    expect(await lib.deleteMessage(1, m.id)).toBe(false);
  });

  it("report whether they may go in a setlist, for the setlist route", async () => {
    const apologies = await section("Apologies", false);
    const welcoming = await section("Welcoming Ambience Jewel");
    const sorry = await message(apologies.id, "Sound restored");
    const sunday = await message(welcoming.id, "Sunday");
    const facts = await lib.factsForMessages(1, [sorry.id, sunday.id, 999]);
    expect(facts.get(sorry.id)).toEqual({ inService: false, sectionName: "Apologies" });
    expect(facts.get(sunday.id)).toEqual({ inService: true, sectionName: "Welcoming Ambience Jewel" });
    expect(facts.has(999)).toBe(false);
    expect((await lib.factsForMessages(1, [])).size).toBe(0);
  });
});

describe("seeding", () => {
  const seed = parseSeed({
    sections: [
      { name: "Apologies", inService: false, messages: [{ title: "Sound restored", text: "Sorry." }] },
      { name: "Confession", inService: true, messages: [{ title: "Full text", text: "Father\n\nEvery son" }] },
    ],
  });

  it("fills an empty library in order", async () => {
    if (typeof seed === "string") throw new Error(seed);
    expect(await lib.seedLibrary(seed)).toEqual({ sections: 2, messages: 2 });
    const loaded = await lib.loadLibrary(branch(1));
    expect(loaded.sections.map((s) => [s.name, s.sort, s.inService])).toEqual([
      ["Apologies", 0, false],
      ["Confession", 1, true],
    ]);
    expect(loaded.messages.find((m) => m.title === "Full text")?.parts).toEqual(["Father", "Every son"]);
  });

  it("does nothing to a library that already has anything in it", async () => {
    if (typeof seed === "string") throw new Error(seed);
    await section("Mine");
    expect(await lib.seedLibrary(seed)).toBe("not-empty");
    expect((await lib.loadLibrary(branch(1))).sections.map((s) => s.name)).toEqual(["Mine"]);
  });
});

describe("parseSeed", () => {
  it("names the section and message that break a rule", () => {
    expect(parseSeed({ sections: [{ name: "", inService: true, messages: [] }] })).toMatch(/section 1/i);
    expect(parseSeed({ sections: [{ name: "A", inService: true, messages: [{ title: "t", text: "" }] }] })).toMatch(/A, message 1/);
    expect(parseSeed({ sections: [{ name: "A", inService: "yes", messages: [] }] })).toMatch(/true or false/i);
    expect(parseSeed({ sections: [{ name: "A", inService: true, messages: [] }, { name: "a", inService: true, messages: [] }] })).toMatch(/twice/);
    expect(parseSeed({})).toMatch(/sections/);
  });
});

describe("branch-only and shared messages", () => {
  it("a branch sees shared messages and its own, not another branch's", async () => {
    const s = await section("Prayer Before Sermon");
    await lib.createMessage(1, { sectionId: s.id, title: "Shared", parts: ["x"], scope: "shared" });
    await lib.createMessage(1, { sectionId: s.id, title: "Ilorin pastor", parts: ["x"], scope: "branch" });
    await lib.createMessage(2, { sectionId: s.id, title: "Lagos pastor", parts: ["x"], scope: "branch" });
    const titles = (await lib.loadLibrary(branch(1))).messages.map((m) => m.title);
    expect(titles).toEqual(["Shared", "Ilorin pastor"]);
    expect((await lib.loadLibrary(branch(1))).messages.map((m) => m.shared)).toEqual([true, false]);
    expect((await lib.loadLibrary(branch(1))).branch).toEqual({ id: 1, name: "CLC Ilorin", tokens: {} });
  });
  it("another branch's message is gone to this branch", async () => {
    const s = await section("Prayer Before Sermon");
    const m = await lib.createMessage(1, { sectionId: s.id, title: "Mine", parts: ["x"], scope: "branch" });
    if (m === "no-section") throw new Error("no-section");
    expect(await lib.updateMessage(2, m.id, { title: "Hijack" })).toBe("gone");
    expect(await lib.deleteMessage(2, m.id)).toBe(false);
    expect((await lib.factsForMessages(2, [m.id])).has(m.id)).toBe(false);
    expect((await lib.loadLibrary(branch(1))).messages.map((x) => x.title)).toEqual(["Mine"]);
  });
  it("moving a message to branch-only hides it from setlist checks in other branches", async () => {
    const s = await section("Prayer Before Sermon");
    const m = await message(s.id, "Was shared");
    expect((await lib.factsForMessages(2, [m.id])).has(m.id)).toBe(true);
    await lib.updateMessage(1, m.id, { scope: "branch" });
    expect((await lib.factsForMessages(2, [m.id])).has(m.id)).toBe(false);
    expect((await lib.factsForMessages(1, [m.id])).has(m.id)).toBe(true);
  });
  it("any branch can edit a shared message, and every branch sees the edit", async () => {
    const s = await section("Prayer Before Sermon");
    const m = await message(s.id, "Old");
    await lib.updateMessage(2, m.id, { title: "New" });
    expect((await lib.loadLibrary(branch(1))).messages.map((x) => x.title)).toEqual(["New"]);
  });
  it("a move never swaps places with another branch's private message", async () => {
    const s = await section("Prayer Before Sermon");
    const a = await message(s.id, "A");
    const x = await lib.createMessage(2, { sectionId: s.id, title: "X", parts: ["x"], scope: "branch" });
    if (x === "no-section") throw new Error("no-section");
    const b = await message(s.id, "B");
    await lib.updateMessage(1, b.id, { move: -1 });
    expect((await lib.loadLibrary(branch(1))).messages.map((m) => m.title)).toEqual(["B", "A"]);
    expect((await lib.loadLibrary(branch(2))).messages.find((m) => m.id === x.id)?.sort).toBe(x.sort);
  });
});
