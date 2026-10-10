// A gated route answers 401 "locked" when there is no valid session. Called
// directly with the request's cookies faked, as no cookie is sent here.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const KEYS = ["CHURCH_PIN", "ADMIN_PIN"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.CHURCH_PIN = "1111";
  process.env.ADMIN_PIN = "9999";
  vi.resetModules();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("a gated route without a session", () => {
  it("answers 401 locked", async () => {
    const route = await import("../src/app/api/songs/route");
    const res = await route.GET(new Request("http://localhost/api/songs"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "locked" });
  });
});
