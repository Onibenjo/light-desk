import { describe, it, expect } from "vitest";
import { hashPin, cleanPin, SET_PIN, UNLOCK_PIN } from "../src/lib/pinHash";

describe("pinHash", () => {
  it("hashes the same PIN the same way and different PINs differently", async () => {
    expect(await hashPin("1234")).toBe(await hashPin("1234"));
    expect(await hashPin("1234")).not.toBe(await hashPin("1235"));
    expect(await hashPin("1234")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("cleanPin trims and bounds length", () => {
    expect(cleanPin(" 2468 ", SET_PIN)).toBe("2468");
    expect(cleanPin("123", SET_PIN)).toBeNull();
    expect(cleanPin("x".repeat(33), SET_PIN)).toBeNull();
    expect(cleanPin(1234, SET_PIN)).toBeNull();
  });

  it("unlock accepts any trimmed PIN of 1 to 256 characters", () => {
    expect(cleanPin(" 123 ", UNLOCK_PIN)).toBe("123");
    expect(cleanPin("1", UNLOCK_PIN)).toBe("1");
    expect(cleanPin("", UNLOCK_PIN)).toBeNull();
    expect(cleanPin("   ", UNLOCK_PIN)).toBeNull();
    expect(cleanPin("x".repeat(257), UNLOCK_PIN)).toBeNull();
    expect(cleanPin("x".repeat(40), UNLOCK_PIN)).toBe("x".repeat(40));
    expect(cleanPin(5, UNLOCK_PIN)).toBeNull();
  });
});
