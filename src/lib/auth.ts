// The session cookie. It carries a signed { branch, role, pinVersion }: the PIN
// a device unlocked with decides its branch, and bumping a branch's pinVersion
// (any PIN change) logs that branch's devices out. Web Crypto only and no db
// client, so it runs both in proxy.ts (edge) and in route handlers; the
// pinVersion check against the database happens in adminGate.ts.

export const SESSION_COOKIE = "ld_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

/** The options every session cookie is set with, by the unlock route and by proxy.ts upgrading a legacy cookie. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_MAX_AGE,
  path: "/",
};

export type Role = "church" | "admin";

export interface Session {
  branchId: number;
  role: Role;
  pinVersion: number;
}

const OPEN_SESSION: Session = { branchId: 1, role: "admin", pinVersion: 0 };

/** No PINs configured outside production: local dev runs unlocked, as branch 1's admin. */
export function isOpenMode(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.CHURCH_PIN && !process.env.ADMIN_PIN;
}

/**
 * The signing secret, or null in production when none is set: the signed
 * payload alone decides branch and role, so the public dev fallback would let
 * anyone mint an admin session. Fail closed instead.
 */
function secret(): string | null {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "dev-secret-change-me";
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time over the whole string, so a signature can't be guessed a character at a time. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export async function signSession(s: Session): Promise<string> {
  const key = secret();
  if (key === null) throw new Error("SESSION_SECRET is not set");
  const payload = base64url(JSON.stringify({ b: s.branchId, r: s.role, v: s.pinVersion }));
  return `${payload}.${await hmac(payload, key)}`;
}

function parsePayload(json: string): Session | null {
  try {
    const { b, r, v } = JSON.parse(json) as { b?: unknown; r?: unknown; v?: unknown };
    if (!Number.isInteger(b) || (b as number) < 1) return null;
    if (r !== "church" && r !== "admin") return null;
    if (!Number.isInteger(v) || (v as number) < 0) return null;
    return { branchId: b as number, role: r, pinVersion: v as number };
  } catch {
    return null;
  }
}

/**
 * The cookie before branches: an HMAC of `${role}:${envPin}`. Accepted as
 * branch 1 (whose PINs came from those same env vars) so devices stay unlocked
 * across the deploy; proxy.ts swaps it for a signed session.
 */
async function legacyRole(token: string, key: string): Promise<Role | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const admin = process.env.ADMIN_PIN;
  const church = process.env.CHURCH_PIN;
  if (admin && sameString(token, await hmac(`admin:${admin}`, key))) return "admin";
  // Single-PIN mode: the church PIN unlocked as admin, and the old cookie was
  // minted from an empty ADMIN_PIN, i.e. hmac("admin:").
  if (!admin && church && sameString(token, await hmac("admin:", key))) return "admin";
  if (church && sameString(token, await hmac(`church:${church}`, key))) return "church";
  return null;
}

/**
 * The session a cookie holds, or null when it holds none. Only proves the
 * cookie was signed by us: whether the branch still exists and its PINs are
 * unchanged is currentSession()'s job (adminGate.ts), which can reach the db.
 */
export async function sessionFromToken(token: string | undefined): Promise<{ session: Session; legacy: boolean } | null> {
  if (isOpenMode()) return { session: { ...OPEN_SESSION }, legacy: false };
  if (!token) return null;
  const key = secret();
  if (key === null) return null;

  const dot = token.indexOf(".");
  if (dot === -1) {
    const role = await legacyRole(token, key);
    return role ? { session: { branchId: 1, role, pinVersion: 0 }, legacy: true } : null;
  }

  const payload = token.slice(0, dot);
  if (!sameString(token.slice(dot + 1), await hmac(payload, key))) return null;
  const json = fromBase64url(payload);
  const session = json === null ? null : parsePayload(json);
  return session ? { session, legacy: false } : null;
}
