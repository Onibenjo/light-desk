// Edge-safe helpers for secrets: plain JS only, so proxy.ts can use them.

/**
 * Compares without stopping at the first different character. Different
 * lengths still walk the whole of `a`, so the time follows the caller's string,
 * not the secret `b`.
 */
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % Math.max(b.length, 1));
  return diff === 0;
}

/** Lowercase hex of some bytes, e.g. a digest or signature. */
export function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
