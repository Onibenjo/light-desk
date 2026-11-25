// Naming and checking the orders a pasted setlist becomes.
import { describe, it, expect } from "vitest";
import { defaultServiceDate, orderName, parseImport, uniqueNames } from "../src/lib/setlistImport";

const d = (iso: string) => new Date(`${iso}T12:00:00`);
const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;

describe("defaultServiceDate", () => {
  it("is the next Wednesday or Sunday, counting today", () => {
    expect(ymd(defaultServiceDate(d("2026-11-23")))).toBe("2026-11-25");
    expect(ymd(defaultServiceDate(d("2026-11-25")))).toBe("2026-11-25");
    expect(ymd(defaultServiceDate(d("2026-11-26")))).toBe("2026-11-29");
  });
});

describe("orderName", () => {
  it('is "Sun 29 Nov · First Service"', () => {
    expect(orderName(d("2026-11-29"), "First Service")).toBe("Sun 29 Nov · First Service");
  });
});

describe("uniqueNames", () => {
  it("numbers a repeated name", () => {
    expect(uniqueNames(["A", "A", "B", "A"])).toEqual(["A", "A (2)", "B", "A (3)"]);
  });
});

describe("parseImport", () => {
  it("accepts orders of names and song ids", () => {
    expect(parseImport({ orders: [{ name: " X ", songIds: [1, 2] }] })).toEqual({ orders: [{ name: "X", songIds: [1, 2] }] });
  });
  it("rejects a missing name, a non-integer id, and more than 20 orders", () => {
    expect(typeof parseImport({ orders: [{ name: "", songIds: [] }] })).toBe("string");
    expect(typeof parseImport({ orders: [{ name: "X", songIds: [1.5] }] })).toBe("string");
    expect(typeof parseImport({ orders: Array.from({ length: 21 }, () => ({ name: "X", songIds: [] })) })).toBe("string");
    expect(typeof parseImport(null)).toBe("string");
  });
});
