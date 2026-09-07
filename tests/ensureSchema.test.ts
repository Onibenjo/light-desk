// ensureSchema() memoises its init promise so every request after the first
// doesn't re-run the schema setup. That memoisation must not survive a
// rejection: a network blip on a cold start would otherwise wedge the whole
// process into 500ing forever, since every later call would re-throw the
// same stale rejection instead of trying again.
import { describe, it, expect, vi, beforeEach } from "vitest";

const applySchemaMock = vi.fn();
vi.mock("../src/db/schemaSql", () => ({ applySchema: (...args: unknown[]) => applySchemaMock(...args) }));
// getClient() only needs something to hand to applySchema — the mock above
// never touches it — so a plain stub keeps this test off the real local.db.
vi.mock("@libsql/client", () => ({ createClient: () => ({}) }));

beforeEach(() => {
  vi.resetModules();
  applySchemaMock.mockReset();
});

describe("ensureSchema", () => {
  it("retries after a rejected attempt instead of caching the failure forever", async () => {
    applySchemaMock.mockRejectedValueOnce(new Error("network blip")).mockResolvedValueOnce(undefined);
    const { ensureSchema } = await import("../src/db/index");

    await expect(ensureSchema()).rejects.toThrow("network blip");
    await expect(ensureSchema()).resolves.toBeUndefined();

    expect(applySchemaMock).toHaveBeenCalledTimes(2);
  });

  it("still memoises a successful attempt, so schema setup runs once", async () => {
    applySchemaMock.mockResolvedValue(undefined);
    const { ensureSchema } = await import("../src/db/index");

    await ensureSchema();
    await ensureSchema();

    expect(applySchemaMock).toHaveBeenCalledTimes(1);
  });
});
