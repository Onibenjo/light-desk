// The session cookie: signed {branch, role, pinVersion}, plus the pre-branch
// cookie (an HMAC of role:PIN) still accepted so devices stay unlocked across
// the deploy. Pure Web Crypto, so no database here.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const KEYS = ["NODE_ENV", "CHURCH_PIN", "ADMIN_PIN", "SESSION_SECRET"] as const;
const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;
let auth: typeof import("../src/lib/auth");

beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  env.NODE_ENV = "test";
  env.CHURCH_PIN = "1111";
  env.ADMIN_PIN = "9999";
  env.SESSION_SECRET = "test-secret";
  vi.resetModules();
  auth = await import("../src/lib/auth");
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe("sessions", () => {
  it("round-trips a signed session", async () => {
    const s = { branchId: 3, role: "church" as const, pinVersion: 2 };
    expect((await auth.sessionFromToken(await auth.signSession(s)))?.session).toEqual(s);
    expect((await auth.sessionFromToken(await auth.signSession(s)))?.legacy).toBe(false);
  });

  it("rejects a token whose payload was edited", async () => {
    const [, sig] = (await auth.signSession({ branchId: 3, role: "church", pinVersion: 0 })).split(".");
    const forged = `${Buffer.from(JSON.stringify({ b: 4, r: "admin", v: 0 })).toString("base64url")}.${sig}`;
    expect(await auth.sessionFromToken(forged)).toBeNull();
  });

  it("rejects missing, garbage and wrong-secret tokens", async () => {
    expect(await auth.sessionFromToken(undefined)).toBeNull();
    expect(await auth.sessionFromToken("")).toBeNull();
    expect(await auth.sessionFromToken("not-a-token")).toBeNull();
    const token = await auth.signSession({ branchId: 1, role: "admin", pinVersion: 0 });
    env.SESSION_SECRET = "another-secret";
    expect(await auth.sessionFromToken(token)).toBeNull();
  });

  it("maps a pre-branch cookie to branch 1 and flags it legacy", async () => {
    const old = (value: string) => createHmac("sha256", "test-secret").update(value).digest("hex");
    expect(await auth.sessionFromToken(old("church:1111"))).toEqual({
      session: { branchId: 1, role: "church", pinVersion: 0 },
      legacy: true,
    });
    expect(await auth.sessionFromToken(old("admin:9999"))).toEqual({
      session: { branchId: 1, role: "admin", pinVersion: 0 },
      legacy: true,
    });
    expect(await auth.sessionFromToken(old("church:2222"))).toBeNull();
  });

  it("maps a single-PIN admin cookie (no ADMIN_PIN) to branch 1 admin", async () => {
    delete env.ADMIN_PIN;
    const old = createHmac("sha256", "test-secret").update("admin:").digest("hex");
    expect(await auth.sessionFromToken(old)).toEqual({
      session: { branchId: 1, role: "admin", pinVersion: 0 },
      legacy: true,
    });
    env.ADMIN_PIN = "9999";
    expect(await auth.sessionFromToken(old)).toBeNull();
  });

  it("fails closed in production without SESSION_SECRET", async () => {
    const token = await auth.signSession({ branchId: 1, role: "admin", pinVersion: 0 });
    const devDefault = createHmac("sha256", "dev-secret-change-me").update("church:1111").digest("hex");
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    await expect(auth.signSession({ branchId: 1, role: "admin", pinVersion: 0 })).rejects.toThrow(/SESSION_SECRET/);
    expect(await auth.sessionFromToken(token)).toBeNull();
    expect(await auth.sessionFromToken(devDefault)).toBeNull();
    env.SESSION_SECRET = "test-secret";
    expect((await auth.sessionFromToken(token))?.session.role).toBe("admin");
  });

  it("is open only outside production when no PINs are set", async () => {
    delete env.CHURCH_PIN;
    delete env.ADMIN_PIN;
    expect(auth.isOpenMode()).toBe(true);
    expect(await auth.sessionFromToken(undefined)).toEqual({
      session: { branchId: 1, role: "admin", pinVersion: 0 },
      legacy: false,
    });
    env.NODE_ENV = "production";
    expect(auth.isOpenMode()).toBe(false);
    expect(await auth.sessionFromToken(undefined)).toBeNull();
    env.NODE_ENV = "test";
    env.CHURCH_PIN = "1111";
    expect(auth.isOpenMode()).toBe(false);
  });
});
