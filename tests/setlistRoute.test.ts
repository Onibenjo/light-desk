// The setlist PATCH route's one piece of its own logic: a message may be added
// only from a section that is in service. Called directly with a Request against
// a temp database; the setlist routes read no cookies, so no request scope is needed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let route: typeof import("../src/app/api/setlists/[id]/route");
let setlists: typeof import("../src/db/setlists");
let lib: typeof import("../src/db/messages");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-setlist-route-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  setlists = await import("../src/db/setlists");
  lib = await import("../src/db/messages");
  route = await import("../src/app/api/setlists/[id]/route");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

async function fixture() {
  const apologies = await lib.createSection({ name: "Apologies", inService: false });
  const welcoming = await lib.createSection({ name: "Welcoming Ambience Jewel", inService: true });
  if (apologies === "duplicate" || welcoming === "duplicate") throw new Error("duplicate");
  const sorry = await lib.createMessage({ sectionId: apologies.id, title: "Sound restored", parts: ["Sorry"] });
  const sunday = await lib.createMessage({ sectionId: welcoming.id, title: "Sunday", parts: ["As we gather"] });
  if (sorry === "no-section" || sunday === "no-section") throw new Error("no-section");
  return { welcoming, sorry, sunday, setlist: await setlists.createSetlist("Sunday") };
}

async function patch(id: number, body: unknown) {
  const res = await route.PATCH(new Request(`http://desk/api/setlists/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status, body: (await res.json()) as { error?: string; setlist?: { items: unknown[]; updatedAt: string } } };
}

describe("adding a message to a setlist", () => {
  it("accepts one from a section in service", async () => {
    const { sunday, setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: sunday.id, title: "Welcoming Ambience Jewel · Sunday" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(200);
    expect(res.body.setlist?.items).toHaveLength(1);
  });

  it("refuses an apology, naming its section", async () => {
    const { sorry, setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: sorry.id, title: "Apologies · Sound restored" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Apologies can't go in a setlist");
  });

  it("refuses a message that does not exist", async () => {
    const { setlist } = await fixture();
    const res = await patch(setlist.id, { items: [{ kind: "message", id: 999, title: "Gone" }], updatedAt: setlist.updatedAt });
    expect(res.status).toBe(400);
  });

  it("does not re-judge a message already there when its section is later switched off", async () => {
    const { welcoming, sunday, setlist } = await fixture();
    const item = { kind: "message", id: sunday.id, title: "Welcoming Ambience Jewel · Sunday" };
    const first = await patch(setlist.id, { items: [item], updatedAt: setlist.updatedAt });
    await lib.updateSection(welcoming.id, { inService: false });
    const reorder = await patch(setlist.id, { items: [item, { kind: "song", id: 1, title: "Way Maker" }], updatedAt: first.body.setlist?.updatedAt });
    expect(reorder.status).toBe(200);
  });
});
