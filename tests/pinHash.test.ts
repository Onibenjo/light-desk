import { describe, it, expect } from "vitest";
import { hashPin, cleanPin } from "../src/lib/pinHash";

describe("pinHash", () => {
  it("hashes the same PIN the same way and different PINs differently", async () => {
    expect(await hashPin("1234")).toBe(await hashPin("1234"));
    expect(await hashPin("1234")).not.toBe(await hashPin("1235"));
    expect(await hashPin("1234")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("cleanPin trims and bounds length", () => {
    expect(cleanPin(" 2468 ")).toBe("2468");
    expect(cleanPin("123")).toBeNull();
    expect(cleanPin("x".repeat(33))).toBeNull();
    expect(cleanPin(1234)).toBeNull();
  });
});
