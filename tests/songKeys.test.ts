import { describe, it, expect } from "vitest";
import { moveCursor, digitToIndex, togglePin } from "../src/lib/songKeys";

describe("moveCursor", () => {
  it("steps down and up one section at a time", () => {
    expect(moveCursor(0, 1, 5)).toBe(1);
    expect(moveCursor(3, -1, 5)).toBe(2);
  });

  it("stops at the first section instead of wrapping to the last", () => {
    expect(moveCursor(0, -1, 5)).toBe(0);
  });

  it("stops at the last section instead of wrapping to the first", () => {
    expect(moveCursor(4, 1, 5)).toBe(4);
  });

  it("clamps a jump that overshoots either end", () => {
    expect(moveCursor(1, 99, 5)).toBe(4);
    expect(moveCursor(3, -99, 5)).toBe(0);
  });

  it("has no cursor when the song has no sections", () => {
    expect(moveCursor(0, 1, 0)).toBe(-1);
  });
});

describe("digitToIndex", () => {
  it("maps the key you press to the number printed beside the section", () => {
    expect(digitToIndex("1", 5)).toBe(0);
    expect(digitToIndex("5", 5)).toBe(4);
  });

  it("ignores a digit past the end of the song", () => {
    expect(digitToIndex("5", 3)).toBe(null);
  });

  it("ignores zero, since sections are numbered from one", () => {
    expect(digitToIndex("0", 5)).toBe(null);
  });

  it("ignores anything that is not a digit", () => {
    expect(digitToIndex("a", 5)).toBe(null);
    expect(digitToIndex("Enter", 5)).toBe(null);
  });
});

describe("togglePin", () => {
  it("pins a section when nothing is pinned", () => {
    expect(togglePin(null, 2)).toBe(2);
  });

  it("replaces the pin rather than keeping both", () => {
    expect(togglePin(1, 4)).toBe(4);
  });

  it("unpins when you press it on the section already pinned", () => {
    expect(togglePin(3, 3)).toBe(null);
  });

  it("treats section 0 as pinnable, not as absent", () => {
    expect(togglePin(null, 0)).toBe(0);
    expect(togglePin(0, 0)).toBe(null);
  });
});
