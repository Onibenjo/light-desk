// Exercises src/db/branches.ts against a real temporary file database, the way
// tests/messages.test.ts does: PIN and name uniqueness live partly in SQL.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };
const KEYS = ["CHURCH_PIN", "ADMIN_PIN", "NETWORK_PIN", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const;

let dir: string;
let saved: Record<string, string | undefined>;
let lib: typeof import("../src/db/branches");

beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  dir = mkdtempSync(join(tmpdir(), "lightdesk-branches-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.CHURCH_PIN = "1111";
  process.env.ADMIN_PIN = "9999";
  process.env.NETWORK_PIN = "network-pin-7777";
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  lib = await import("../src/db/branches");
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

const create = async (input: Parameters<typeof lib.createBranch>[0]) => {
  const b = await lib.createBranch(input);
  if (typeof b === "string") throw new Error(`unexpected ${b}`);
  return b;
};

describe("branches", () => {
  it("finds branch 1 by its church and admin PINs", async () => {
    expect(await lib.findBranchByPin("1111")).toMatchObject({ branch: { id: 1 }, role: "church" });
    expect(await lib.findBranchByPin("9999")).toMatchObject({ branch: { id: 1 }, role: "admin" });
    expect(await lib.findBranchByPin("0000")).toBeNull();
    expect(await lib.findBranchByPin("")).toBeNull();
  });

  it("a branch without an admin PIN gets admin from its church PIN", async () => {
    const lagos = await create({ name: "CLC Lagos", churchPin: "2222", adminPin: null });
    expect(await lib.findBranchByPin("2222")).toMatchObject({ branch: { id: lagos.id, name: "CLC Lagos" }, role: "admin" });
  });

  it("refuses a PIN another branch or the network uses", async () => {
    expect(await lib.createBranch({ name: "CLC Lagos", churchPin: "9999", adminPin: null })).toBe("pin-taken");
    expect(await lib.createBranch({ name: "CLC Lagos", churchPin: "network-pin-7777", adminPin: null })).toBe("pin-taken");
    expect(await lib.createBranch({ name: "CLC Lagos", churchPin: "2222", adminPin: "1111" })).toBe("pin-taken");
    expect(await lib.createBranch({ name: "clc ilorin", churchPin: "3333", adminPin: null })).toBe("name-taken");
    const lagos = await create({ name: "CLC Lagos", churchPin: "2222", adminPin: "3333" });
    expect(await lib.updateBranch(1, { churchPin: "3333" })).toBe("pin-taken");
    expect(await lib.updateBranch(1, { name: "clc lagos" })).toBe("name-taken");
    expect(await lib.updateBranch(lagos.id, { churchPin: "2222" })).toMatchObject({ pinVersion: 0 });
    expect(await lib.updateBranch(999, { name: "Nowhere" })).toBe("gone");
  });

  it("changing a PIN bumps pinVersion; renaming does not", async () => {
    expect(await lib.updateBranch(1, { name: "X" })).toMatchObject({ name: "X", pinVersion: 0 });
    expect(await lib.updateBranch(1, { churchPin: "4444" })).toMatchObject({ pinVersion: 1 });
    expect(await lib.findBranchByPin("1111")).toBeNull();
    expect(await lib.findBranchByPin("4444")).toMatchObject({ branch: { id: 1 }, role: "church" });
    expect(await lib.updateBranch(1, { adminPin: null })).toMatchObject({ pinVersion: 2 });
    expect(await lib.findBranchByPin("4444")).toMatchObject({ role: "admin" });
  });

  it("lists, gets and stores tokens", async () => {
    const lagos = await create({ name: "CLC Lagos", churchPin: "2222", adminPin: null });
    expect((await lib.listBranches()).map((b) => b.name)).toEqual(["CLC Ilorin", "CLC Lagos"]);
    expect(await lib.getBranch(lagos.id)).toEqual({ id: lagos.id, name: "CLC Lagos", pinVersion: 0, tokens: {} });
    expect(await lib.getBranch(999)).toBeNull();
    expect(await lib.setBranchTokens(lagos.id, { youtube: "abc" })).toMatchObject({ tokens: { youtube: "abc" } });
    expect((await lib.getBranch(lagos.id))?.tokens).toEqual({ youtube: "abc" });
    expect(await lib.setBranchTokens(999, {})).toBe("gone");
  });
});
