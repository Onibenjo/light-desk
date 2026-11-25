// The paste routes against a temp database, with the session gate mocked and the LLM failing,
// so the rule-based parser reads the text.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/lib/sessionGate", () => ({
  gate: async () => ({ branchId: 1, role: "admin", pinVersion: 1, branch: { id: 1 } }),
}));
vi.mock("../src/lib/llm", () => ({
  complete: async () => {
    throw new Error("no LLM in tests");
  },
}));

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let parseRoute: typeof import("../src/app/api/setlists/parse/route");
let importRoute: typeof import("../src/app/api/setlists/import/route");
let setlists: typeof import("../src/db/setlists");
let ids: { crown: number; breaker: number };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-setlist-import-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema, db } = await import("../src/db");
  const { songs } = await import("../src/db/schema");
  setlists = await import("../src/db/setlists");
  parseRoute = await import("../src/app/api/setlists/parse/route");
  importRoute = await import("../src/app/api/setlists/import/route");
  await ensureSchema();
  const now = new Date();
  const add = async (title: string, line: string) =>
    (await db.insert(songs).values({ guid: `manual:${title}`, title, sections: JSON.stringify([line]), source: "manual", createdAt: now, updatedAt: now }).returning())[0].id;
  ids = { crown: await add("Victor's Crown", "You are always fighting for us"), breaker: await add("Iron Breaker", "His name is Jehovah") };
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

const post = async (route: { POST: (r: Request) => Promise<Response> }, body: unknown) => {
  const res = await route.POST(new Request("http://desk/api", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

describe("POST /api/setlists/parse", () => {
  it("reads without AI and matches against the song bank", async () => {
    const res = await post(parseRoute, { text: "FIRST SERVICE\nFirst worship\nVictor’s crown – Darlene Zschech\nPraise\n• Otuaka", date: "2026-11-29" });
    expect(res.status).toBe(200);
    expect(res.body.readWithoutAi).toBe(true);
    const [service] = res.body.services;
    expect(service.name).toBe("Sun 29 Nov · First Service");
    expect(service.exists).toBe(false);
    expect(service.sections[0].songs[0].match).toEqual({ status: "matched", song: { id: ids.crown, title: "Victor's Crown" } });
    expect(service.sections[1].songs[0].match).toEqual({ status: "missing" });
  });

  it("rejects text over 8000 chars with 400", async () => {
    expect((await post(parseRoute, { text: "• a\n".repeat(2001), date: "2026-11-29" })).status).toBe(400);
  });

  it('returns 400 "Couldn\'t find any songs" for chatter', async () => {
    const res = await post(parseRoute, { text: "Good morning all, see you Sunday", date: "2026-11-29" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Couldn't find any songs");
  });

  it("flags exists:true when the branch has that order name", async () => {
    await setlists.createSetlist(1, "Sun 29 Nov · First Service");
    const res = await post(parseRoute, { text: "FIRST SERVICE\n• Iron breaker", date: "2026-11-29" });
    expect(res.body.services[0].exists).toBe(true);
  });
});

describe("POST /api/setlists/import", () => {
  it('creates a new order with { kind:"song", id, title } items, titles from the book', async () => {
    const res = await post(importRoute, { orders: [{ name: "Sun 29 Nov · First Service", songIds: [ids.breaker, ids.crown] }] });
    expect(res.status).toBe(200);
    const [saved] = await setlists.loadSetlists(1);
    expect(saved.name).toBe("Sun 29 Nov · First Service");
    expect(saved.items).toEqual([
      { kind: "song", id: ids.breaker, title: "Iron Breaker" },
      { kind: "song", id: ids.crown, title: "Victor's Crown" },
    ]);
  });

  it("replaces the items of an existing order with the same name, keeping its id", async () => {
    const existing = await setlists.createSetlist(1, "Sun 29 Nov · First Service");
    await post(importRoute, { orders: [{ name: "Sun 29 Nov · First Service", songIds: [ids.crown] }] });
    const all = await setlists.loadSetlists(1);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(existing.id);
    expect(all[0].items).toEqual([{ kind: "song", id: ids.crown, title: "Victor's Crown" }]);
  });

  it("rejects an unknown song id with 400", async () => {
    expect((await post(importRoute, { orders: [{ name: "X", songIds: [9999] }] })).status).toBe(400);
    expect(await setlists.loadSetlists(1)).toEqual([]);
  });
});
