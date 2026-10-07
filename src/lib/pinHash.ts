/**
 * PIN hashing, edge-safe: Web Crypto only, no node: imports, no db client.
 * It deliberately does not depend on SESSION_SECRET, so rotating the secret
 * can't make stored PINs unusable.
 */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`lightdesk-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A PIN as typed: trimmed, 4 to 32 characters, otherwise null. */
export function cleanPin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const pin = value.trim();
  return pin.length >= 4 && pin.length <= 32 ? pin : null;
}
