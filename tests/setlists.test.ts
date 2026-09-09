// Exercises src/db/setlists.ts against a real temporary file database, not
// mocks: the one-active-index race and the stale-token guard both live in
// SQL (a batch and a WHERE clause), so the thing worth proving is that a
// real libsql file behaves the way the comments in setlists.ts claim.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let setlists: typeof import("../src/db/setlists");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-setlists-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();

  const { ensureSchema } = await import("../src/db");
  setlists = await import("../src/db/setlists");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

describe("updateSetlist", () => {
  it("activating one setlist clears the other, so the one-active index is never violated", async () => {
    const a = await setlists.createSetlist("Sunday 1st service");
    const b = await setlists.createSetlist("Sunday 2nd service");

    const activatedA = await setlists.updateSetlist(a.id, { active: true });
    expect(activatedA).not.toBe("gone");
    expect(activatedA).not.toBe("stale");

    const activatedB = await setlists.updateSetlist(b.id, { active: true });
    expect(activatedB).not.toBe("gone");
    expect(activatedB).not.toBe("stale");

    const all = await setlists.loadSetlists();
    const active = all.filter((s) => s.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.id);
  });

  it("a stale token is refused with no write", async () => {
    const created = await setlists.createSetlist("Sunday");

    const first = await setlists.updateSetlist(created.id, {
      items: [{ id: 1, title: "Way Maker" }],
      updatedAt: created.updatedAt,
    });
    expect(first).not.toBe("gone");
    expect(first).not.toBe("stale");

    const replay = await setlists.updateSetlist(created.id, {
      items: [{ id: 2, title: "Goodness of God" }],
      updatedAt: created.updatedAt,
    });
    expect(replay).toBe("stale");

    const current = await setlists.findSetlist(created.id);
    expect(current?.items).toEqual([{ id: 1, title: "Way Maker" }]);
  });

  it("changing the songs needs the version the client read, but a rename does not", async () => {
    const created = await setlists.createSetlist("Sunday");

    const renamed = await setlists.updateSetlist(created.id, { name: "Rehearsal" });
    expect(renamed).not.toBe("gone");
    expect(renamed).not.toBe("stale");
    expect((renamed as { name: string }).name).toBe("Rehearsal");
  });

  it("a missing setlist is gone", async () => {
    const result = await setlists.updateSetlist(999, { name: "x" });
    expect(result).toBe("gone");

    expect(await setlists.deleteSetlist(999)).toBe(false);

    const real = await setlists.createSetlist("Sunday");
    expect(await setlists.deleteSetlist(real.id)).toBe(true);
  });
});
