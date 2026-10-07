import { clientKey, isLimited, rateLimit } from "./ratelimit";

const MAX_WRONG = 10;
const WINDOW_MS = 60_000;

/** Compares without stopping at the first different character. */
function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % Math.max(b.length, 1));
  return diff === 0;
}

/**
 * True only when NETWORK_PIN is set and this request's `x-network-pin` header
 * is exactly it. Wrong PINs count against the same limit as unlocking (10 a
 * minute from one address); once it is used up, even the right PIN is refused
 * until the minute passes, so guessing can't go on behind the limit. Right PINs
 * don't count, so a busy session on /branches never locks itself out.
 */
export function networkPinOk(req: Request): boolean {
  const pin = process.env.NETWORK_PIN;
  if (!pin) return false;
  const key = `network:${clientKey(req)}`;
  if (isLimited(key, MAX_WRONG, WINDOW_MS)) return false;
  if (sameString(req.headers.get("x-network-pin") ?? "", pin)) return true;
  rateLimit(key, MAX_WRONG, WINDOW_MS);
  return false;
}
