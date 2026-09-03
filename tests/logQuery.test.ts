import { describe, it, expect } from "vitest";
import { dayBounds, toISODate, shiftDay, formatDayLabel, groupDays } from "../src/lib/logQuery";

const HOUR = 3600;

describe("dayBounds", () => {
  it("spans local midnight to local midnight", () => {
    const { from, to } = dayBounds("2026-08-30");
    expect(new Date(from * 1000).getHours()).toBe(0);
    expect(new Date(from * 1000).getDate()).toBe(30);
    expect(new Date(to * 1000).getDate()).toBe(31);
    expect(to - from).toBe(24 * HOUR);
  });

  it("is 23 hours on the spring-forward Sunday", () => {
    const { from, to } = dayBounds("2026-03-29");
    expect(to - from).toBe(23 * HOUR);
  });

  it("is 25 hours on the fall-back Sunday", () => {
    const { from, to } = dayBounds("2026-10-25");
    expect(to - from).toBe(25 * HOUR);
  });

  it("rolls over into the next year", () => {
    expect(dayBounds("2025-12-31").to).toBe(dayBounds("2026-01-01").from);
  });
});

describe("shiftDay", () => {
  it("steps across a month boundary", () => {
    expect(shiftDay("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDay("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("steps across a year boundary", () => {
    expect(shiftDay("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("does not skip or repeat a day across a DST switchover", () => {
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDay("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("toISODate", () => {
  it("uses the local date, not the UTC date", () => {
    // 23:30 local on 30 Aug is already 31 Aug in UTC during BST.
    expect(toISODate(new Date(2026, 7, 30, 23, 30))).toBe("2026-08-30");
  });
});

describe("formatDayLabel", () => {
  it("names the weekday so a Sunday is recognisable", () => {
    expect(formatDayLabel("2026-08-30")).toBe("Sun 30 Aug 2026");
    expect(formatDayLabel("2026-08-31")).toBe("Mon 31 Aug 2026");
  });
});

describe("groupDays", () => {
  it("counts entries per local day, newest day first", () => {
    const secs = [
      Math.floor(new Date(2026, 7, 30, 9, 14).getTime() / 1000),
      Math.floor(new Date(2026, 7, 30, 10, 2).getTime() / 1000),
      Math.floor(new Date(2026, 7, 23, 9, 40).getTime() / 1000),
    ];
    expect(groupDays(secs)).toEqual([
      { iso: "2026-08-30", count: 2 },
      { iso: "2026-08-23", count: 1 },
    ]);
  });

  it("keeps a late-evening entry on its own local day", () => {
    const secs = [Math.floor(new Date(2026, 7, 30, 23, 45).getTime() / 1000)];
    expect(groupDays(secs)).toEqual([{ iso: "2026-08-30", count: 1 }]);
  });

  it("returns nothing for no entries", () => {
    expect(groupDays([])).toEqual([]);
  });
});
