// POST /api/unlock against a temp database seeded from env PINs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };
const KEYS = ["CHURCH_PIN", "ADMIN_PIN", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const;
const LONG_PIN = "church-pin-".padEnd(40, "x");

let dir: string;
let saved: Record<string, string | undefined>;
let POST: typeof import("../src/app/api/unlock/route").POST;

beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  dir = mkdtempSync(join(tmpdir(), "lightdesk-unlock-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.CHURCH_PIN = LONG_PIN;
  process.env.ADMIN_PIN = "9999";
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  POST = (await import("../src/app/api/unlock/route")).POST;
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const unlock = (body: string) => POST(new Request("http://localhost/api/unlock", { method: "POST", body, headers: { "x-forwarded-for": "10.1.1.1" } }));

describe("POST /api/unlock", () => {
  it("unlocks with a 40-character env-seeded PIN", async () => {
    const res = await unlock(JSON.stringify({ pin: LONG_PIN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, role: "church" });
  });

  it("says Wrong PIN to a wrong PIN and to a literal null body", async () => {
    for (const body of [JSON.stringify({ pin: "0000" }), "null", "not json"]) {
      const res = await unlock(body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Wrong PIN" });
    }
  });
});
