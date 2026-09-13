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

const section = async (name: string, inService = true) => {
  const s = await lib.createSection({ name, inService });
  if (s === "duplicate") throw new Error("unexpected duplicate");
  return s;
};
const message = async (sectionId: number, title: string, parts = ["text"]) => {
  const m = await lib.createMessage({ sectionId, title, parts });
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
    expect((await lib.loadLibrary()).sections.map((s) => s.name)).toEqual(["A", "C", "B"]);
    expect(b.id).toBeGreaterThan(0);
  });

  it("can be renamed and switched out of service", async () => {
    const a = await section("Apology");
    const saved = await lib.updateSection(a.id, { name: "Apologies", inService: false });
    expect(saved).toMatchObject({ name: "Apologies", inService: false });
    expect(await lib.updateSection(999, { name: "x" })).toBe("gone");
  });

  it("cannot be deleted while they still hold messages, so one click never wipes twenty", async () => {
    const a = await section("Apologies");
    await message(a.id, "Sound restored");
    expect(await lib.deleteSection(a.id)).toBe("not-empty");
    const empty = await section("Empty");
    expect(await lib.deleteSection(empty.id)).toBe("deleted");
    expect(await lib.deleteSection(empty.id)).toBe("gone");
  });
});

describe("messages", () => {
  it("keep their parts, and are created at the end of their section", async () => {
    const a = await section("Confession");
    const first = await message(a.id, "Sunday", ["Sirs and Mas, join us"]);
    const second = await message(a.id, "Full text", ["Father we thank You", "Every son and daughter"]);
    expect([first.sort, second.sort]).toEqual([0, 1]);
    expect((await lib.loadLibrary()).messages.find((m) => m.id === second.id)?.parts).toEqual(["Father we thank You", "Every son and daughter"]);
  });

  it("need a section that exists", async () => {
    expect(await lib.createMessage({ sectionId: 999, title: "x", parts: ["y"] })).toBe("no-section");
  });

  it("move within their section only", async () => {
    const a = await section("A");
    const b = await section("B");
    const a1 = await message(a.id, "a1");
    const a2 = await message(a.id, "a2");
    await message(b.id, "b1");
    await lib.updateMessage(a2.id, { move: -1 });
    await lib.updateMessage(a2.id, { move: -1 });
    const inA = (await lib.loadLibrary()).messages.filter((m) => m.sectionId === a.id).sort((x, y) => x.sort - y.sort);
    expect(inA.map((m) => m.title)).toEqual(["a2", "a1"]);
    expect(a1.id).toBeGreaterThan(0);
  });

  it("go to the end of another section when moved there", async () => {
    const a = await section("A");
    const b = await section("B");
    await message(b.id, "b1");
    const moving = await message(a.id, "a1");
    const saved = await lib.updateMessage(moving.id, { sectionId: b.id, title: "now in B" });
    expect(saved).toMatchObject({ sectionId: b.id, sort: 1, title: "now in B" });
    expect(await lib.updateMessage(moving.id, { sectionId: 999 })).toBe("no-section");
    expect(await lib.updateMessage(999, { title: "x" })).toBe("gone");
  });

  it("can be deleted once", async () => {
    const a = await section("A");
    const m = await message(a.id, "a1");
    expect(await lib.deleteMessage(m.id)).toBe(true);
    expect(await lib.deleteMessage(m.id)).toBe(false);
  });

  it("report whether they may go in a setlist, for the setlist route", async () => {
    const apologies = await section("Apologies", false);
    const welcoming = await section("Welcoming Ambience Jewel");
    const sorry = await message(apologies.id, "Sound restored");
    const sunday = await message(welcoming.id, "Sunday");
    const facts = await lib.factsForMessages([sorry.id, sunday.id, 999]);
    expect(facts.get(sorry.id)).toEqual({ inService: false, sectionName: "Apologies" });
    expect(facts.get(sunday.id)).toEqual({ inService: true, sectionName: "Welcoming Ambience Jewel" });
    expect(facts.has(999)).toBe(false);
    expect((await lib.factsForMessages([])).size).toBe(0);
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
    const loaded = await lib.loadLibrary();
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
    expect((await lib.loadLibrary()).sections.map((s) => s.name)).toEqual(["Mine"]);
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
