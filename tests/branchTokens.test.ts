import { describe, it, expect } from "vitest";
import { fillTokens, cleanTokens } from "../src/lib/branchTokens";

describe("branch tokens", () => {
  it("fills known keys and reports missing ones", () => {
    expect(fillTokens("Email {testimonyEmail}. Accounts: {offeringAccounts}", { testimonyEmail: "a@b.c" })).toEqual({
      text: "Email a@b.c. Accounts: {offeringAccounts}",
      missing: ["offeringAccounts"],
    });
  });
  it("leaves braces that are not keys, and [DATE], alone", () => {
    expect(fillTokens("{ not a key } {Upper} [DATE]", {})).toEqual({ text: "{ not a key } {Upper} [DATE]", missing: [] });
  });
  it("lists a missing key once", () => {
    expect(fillTokens("{a} {a}", {}).missing).toEqual(["a"]);
  });
  it("cleanTokens validates keys and values", () => {
    expect(cleanTokens({ midweekTime: " 5:30pm " })).toEqual({ midweekTime: "5:30pm" });
    expect(cleanTokens({ "bad key": "x" })).toMatch(/bad key/);
    expect(cleanTokens({ a: "" })).toMatch(/a/);
  });
  it("cleanTokens refuses non-objects and too many entries", () => {
    expect(typeof cleanTokens([1])).toBe("string");
    expect(typeof cleanTokens(null)).toBe("string");
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, "v"]));
    expect(typeof cleanTokens(many)).toBe("string");
    expect(typeof cleanTokens({ a: "x".repeat(4001) })).toBe("string");
  });
});
