import { toHex } from "./constantTime";

/**
 * PIN hashing, edge-safe: Web Crypto only, no node: imports, no db client.
 * It deliberately does not depend on SESSION_SECRET, so rotating the secret
 * can't make stored PINs unusable.
 */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`lightdesk-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** Setting a PIN: 4 to 32 characters. */
export const SET_PIN = { min: 4, max: 32 };
/** Unlocking: any non-empty PIN up to a generous cap, so a short or long env-seeded PIN still works. */
export const UNLOCK_PIN = { min: 1, max: 256 };

/** A PIN as typed: trimmed, within the length bounds, otherwise null. */
export function cleanPin(value: unknown, { min, max }: { min: number; max: number }): string | null {
  if (typeof value !== "string") return null;
  const pin = value.trim();
  return pin.length >= min && pin.length <= max ? pin : null;
}
