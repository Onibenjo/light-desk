import { describe, it, expect } from "vitest";
import { BUSY_DELAY_MS } from "../src/lib/timing";

// Measured over 89 real lookups recorded in sent_log:
//   local (bundled KJV)  0–4ms      cache  2–12ms
//   gateway 336ms+   apibible 882ms+   youversion 1000ms+   llm 3451ms+
// The delay has to sit inside that empty band, or the indicator either flashes
// on instant lookups or never shows on slow ones.
const SLOWEST_INSTANT_SOURCE_MS = 12;
const FASTEST_NETWORK_SOURCE_MS = 336;

describe("busy indicator delay", () => {
  it("outlasts the slowest instant lookup, so KJV and cache hits never flash it", () => {
    expect(BUSY_DELAY_MS).toBeGreaterThan(SLOWEST_INSTANT_SOURCE_MS);
  });

  it("elapses before the fastest network lookup returns, so slow fetches still show it", () => {
    expect(BUSY_DELAY_MS).toBeLessThan(FASTEST_NETWORK_SOURCE_MS);
  });

  it("keeps a wide margin on both sides rather than sitting at a boundary", () => {
    expect(BUSY_DELAY_MS).toBeGreaterThan(SLOWEST_INSTANT_SOURCE_MS * 5);
    expect(BUSY_DELAY_MS).toBeLessThan(FASTEST_NETWORK_SOURCE_MS / 1.5);
  });
});
