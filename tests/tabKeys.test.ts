import { describe, it, expect } from "vitest";
import { tabIndexForKey } from "../src/lib/tabKeys";

describe("tabIndexForKey", () => {
  it("steps right and left one tab at a time", () => {
    expect(tabIndexForKey("ArrowRight", 0, 3)).toBe(1);
    expect(tabIndexForKey("ArrowLeft", 2, 3)).toBe(1);
  });

  it("wraps past either end, as the tabs pattern expects", () => {
    expect(tabIndexForKey("ArrowRight", 2, 3)).toBe(0);
    expect(tabIndexForKey("ArrowLeft", 0, 3)).toBe(2);
  });

  it("jumps to the first and last tab with Home and End", () => {
    expect(tabIndexForKey("Home", 2, 3)).toBe(0);
    expect(tabIndexForKey("End", 0, 3)).toBe(2);
  });

  it("leaves every other key alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "1", "+", "Escape", "Tab"]) {
      expect(tabIndexForKey(key, 1, 3)).toBeNull();
    }
  });

  it("has nowhere to go without tabs", () => {
    expect(tabIndexForKey("ArrowRight", 0, 0)).toBeNull();
  });
});
