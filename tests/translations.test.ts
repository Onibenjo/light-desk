import { describe, it, expect } from "vitest";
import { translationFromInput } from "../src/lib/translations";

describe("translationFromInput", () => {
  it("recognises a bare code, however it is typed", () => {
    expect(translationFromInput("tpt")).toBe("TPT");
    expect(translationFromInput("TPT")).toBe("TPT");
    expect(translationFromInput("  tpt  ")).toBe("TPT");
  });

  it("resolves an alias to the canonical code", () => {
    expect(translationFromInput("gnb")).toBe("GNT");
    expect(translationFromInput("niv11")).toBe("NIV");
  });

  it("leaves a real reference alone", () => {
    expect(translationFromInput("heb 12 1")).toBe(null);
    expect(translationFromInput("john 3:16")).toBe(null);
    expect(translationFromInput("rom8:28")).toBe(null);
  });

  it("does not hijack a reference that ends in a translation", () => {
    // This form already works as a lookup; it must not be treated as a switch.
    expect(translationFromInput("john 3 16 amp")).toBe(null);
    expect(translationFromInput("heb 12 1 tpt")).toBe(null);
  });

  it("ignores an empty or blank box", () => {
    expect(translationFromInput("")).toBe(null);
    expect(translationFromInput("   ")).toBe(null);
  });

  it("ignores words that are not translations", () => {
    expect(translationFromInput("john")).toBe(null);
    expect(translationFromInput("walk on snakes")).toBe(null);
    expect(translationFromInput("xyz")).toBe(null);
  });
});
