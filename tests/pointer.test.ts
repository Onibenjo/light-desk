import { describe, it, expect, afterEach } from "vitest";
import { hasFinePointer } from "../src/lib/pointer";

// These run with no DOM, so `window` is whatever a test puts there.
const g = globalThis as { window?: unknown };

function withPointer(kind: "fine" | "coarse" | "missing-api") {
  g.window =
    kind === "missing-api"
      ? {}
      : { matchMedia: (q: string) => ({ matches: q === `(pointer: ${kind})` }) };
}

afterEach(() => {
  delete g.window;
});

describe("deciding whether to pull focus into the search box", () => {
  it("is true on a laptop, where the cursor has somewhere to go", () => {
    withPointer("fine");
    expect(hasFinePointer()).toBe(true);
  });

  it("is false on a touchscreen, so a send doesn't bury the verse under the keyboard", () => {
    withPointer("coarse");
    expect(hasFinePointer()).toBe(false);
  });

  it("stays false while rendering on the server, rather than throwing", () => {
    expect(hasFinePointer()).toBe(false);
  });

  it("stays false in a browser too old to answer the query", () => {
    withPointer("missing-api");
    expect(hasFinePointer()).toBe(false);
  });
});
