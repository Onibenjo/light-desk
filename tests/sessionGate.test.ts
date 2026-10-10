// The gate every route goes through: the signed cookie decides who you are, the
// branch row decides whether that is still true. Runs against a temp database,
// with only the request's cookies faked, since they need a request scope.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

let cookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "ld_session" && cookie !== undefined ? { name, value: cookie } : undefined) }),
}));

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };
const KEYS = ["CHURCH_PIN", "ADMIN_PIN", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const;

let dir: string;
let saved: Record<string, string | undefined>;
let gateLib: typeof import("../src/lib/sessionGate");
let auth: typeof import("../src/lib/auth");
let branches: typeof import("../src/db/branches");

beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  dir = mkdtempSync(join(tmpdir(), "lightdesk-gate-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.CHURCH_PIN = "1111";
  process.env.ADMIN_PIN = "9999";
  delete (globalThis as GlobalWithClient).__ldClient;
  cookie = undefined;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  gateLib = await import("../src/lib/sessionGate");
  auth = await import("../src/lib/auth");
  branches = await import("../src/db/branches");
  await ensureSchema();
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

const signIn = async (role: "church" | "admin", pinVersion = 0) => {
  cookie = await auth.signSession({ branchId: 1, role, pinVersion });
};

describe("sessionGate", () => {
  it("a valid cookie gives the session with its branch", async () => {
    await signIn("church");
    expect(await gateLib.currentSession()).toMatchObject({ branchId: 1, role: "church", pinVersion: 0, branch: { id: 1 } });
    const s = await gateLib.gate();
    expect(s).not.toBeInstanceOf(NextResponse);
    expect(s).toMatchObject({ branchId: 1, branch: { id: 1 } });
  });

  it("no cookie is locked", async () => {
    expect(await gateLib.currentSession()).toBeNull();
    const res = (await gateLib.gate()) as NextResponse;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "locked" });
  });

  it("a cookie from before a PIN change is locked out", async () => {
    await signIn("admin");
    await branches.updateBranch(1, { churchPin: "4444" });
    expect(await gateLib.currentSession()).toBeNull();
    const res = (await gateLib.gate("needs admin")) as NextResponse;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "locked" });
  });

  it("a church session is refused an admin route with the route's message", async () => {
    await signIn("church");
    const res = (await gateLib.gate("Editing needs the admin PIN")) as NextResponse;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Editing needs the admin PIN" });
  });

  it("an admin session passes an admin route", async () => {
    await signIn("admin");
    expect(await gateLib.gate("Editing needs the admin PIN")).toMatchObject({ role: "admin", branch: { id: 1 } });
  });

  it("open mode is branch 1's admin without a cookie", async () => {
    delete process.env.CHURCH_PIN;
    delete process.env.ADMIN_PIN;
    expect(await gateLib.gate("needs admin")).toMatchObject({ branchId: 1, role: "admin", branch: { id: 1 } });
  });
});
