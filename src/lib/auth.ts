// PIN gate. Two PINs: CHURCH_PIN opens the app (remembered for a year on the
// laptop), ADMIN_PIN will guard editing in M2/M3. The cookie holds an HMAC of
// the PIN so changing the PIN in Vercel logs everyone out. Uses Web Crypto so
// it runs both in proxy.ts (edge) and in route handlers.

export const SESSION_COOKIE = "ld_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

async function hmac(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionTokenFor(role: "church" | "admin"): Promise<string> {
  const pin = role === "admin" ? process.env.ADMIN_PIN : process.env.CHURCH_PIN;
  return hmac(`${role}:${pin ?? ""}`);
}

export async function checkPin(pin: string): Promise<"church" | "admin" | null> {
  const church = process.env.CHURCH_PIN;
  const admin = process.env.ADMIN_PIN;
  if (!church && !admin) return "admin"; // no PINs configured → open (local dev)
  if (admin && pin === admin) return "admin";
  if (church && pin === church) return "church";
  return null;
}

export async function roleFromToken(token: string | undefined): Promise<"church" | "admin" | null> {
  if (!process.env.CHURCH_PIN && !process.env.ADMIN_PIN) return "admin";
  if (!token) return null;
  if (token === (await sessionTokenFor("admin"))) return "admin";
  if (token === (await sessionTokenFor("church"))) return "church";
  return null;
}
