// The attendance arithmetic: which readings are the half-hour ones, and what
// the average and peak are. TZ is pinned to Europe/London (vitest.config.ts),
// which is on GMT in November, so 16:30Z prints as 4:30pm here.
import { describe, it, expect } from "vitest";
import { attendanceReport, formatClock, formatDay, halfHourMarks, listenersLabel, summarise, MINUTE, type Reading } from "../src/lib/attendance";

const at = (hhmm: string, day = "2026-11-11") => Date.parse(`${day}T${hhmm}:00.000Z`);

/** A reading every five minutes from `from` to `to` inclusive; the count is given by `count(minutesSinceFrom)`. */
function every5(from: string, to: string, count: (minute: number) => number): Reading[] {
  const out: Reading[] = [];
  // A quarter of a second late, as the real timer is.
  for (let t = at(from); t <= at(to); t += 5 * MINUTE) out.push({ at: t + 250, listeners: count((t - at(from)) / MINUTE) });
  return out;
}

describe("halfHourMarks", () => {
  it("logs 6:00, 6:30, 7:00, 7:30 for a 5:30 service, as the team does by hand", () => {
    const readings = every5("17:30", "19:40", (m) => 20 + m);
    const marks = halfHourMarks(readings, at("17:30"), at("17:30"));
    expect(marks.map((m) => formatClock(m.at))).toEqual(["6:00pm", "6:30pm", "7:00pm", "7:30pm"]);
    expect(marks.map((m) => m.listeners)).toEqual([50, 80, 110, 140]);
  });

  it("counts from the scheduled start when the broadcast went live a few minutes early", () => {
    const readings = every5("16:25", "18:35", () => 30);
    const marks = halfHourMarks(readings, at("16:24"), at("16:30"));
    expect(marks.map((m) => formatClock(m.at))).toEqual(["5:00pm", "5:30pm", "6:00pm", "6:30pm"]);
  });

  it("uses the real start, to the nearest half hour, when there is no schedule", () => {
    const marks = halfHourMarks(every5("09:10", "10:35", () => 12), at("09:07"), null);
    expect(marks.map((m) => formatClock(m.at))).toEqual(["9:30am", "10:00am", "10:30am"]);
  });

  it("ignores a schedule that is hours away from the real start", () => {
    const marks = halfHourMarks(every5("14:00", "15:05", () => 12), at("14:00"), at("09:00"));
    expect(marks.map((m) => formatClock(m.at))).toEqual(["2:30pm", "3:00pm"]);
  });

  it("drops the marks from before a late start, which have no number to give", () => {
    // Scheduled 5:30, on air at 6:10: there is no 6:00 reading and never was.
    const marks = halfHourMarks(every5("18:10", "19:05", () => 40), at("18:10"), at("17:30"));
    expect(marks.map((m) => formatClock(m.at))).toEqual(["6:30pm", "7:00pm"]);
  });

  it("borrows the neighbouring reading when the one on the half hour was missed", () => {
    const readings = every5("17:30", "18:35", (m) => m).filter((r) => formatClock(r.at) !== "6:00pm");
    const marks = halfHourMarks(readings, at("17:30"), at("17:30"));
    // 5:55 (25) and 6:05 (35) are equally near; the earlier one is taken.
    expect(marks[0]).toEqual({ at: at("18:00"), listeners: 25 });
  });

  it("leaves a mark with no reading where the record has a real gap", () => {
    const readings = [...every5("17:30", "17:45", () => 10), ...every5("18:20", "19:05", () => 20)];
    const marks = halfHourMarks(readings, at("17:30"), at("17:30"));
    expect(marks).toEqual([
      { at: at("18:00"), listeners: null },
      { at: at("18:30"), listeners: 20 },
      { at: at("19:00"), listeners: 20 },
    ]);
  });

  it("gives no half hour that hasn't come yet, while the service is still on air", () => {
    const readings = every5("17:30", "18:55", () => 30);
    const marks = halfHourMarks(readings, at("17:30"), at("17:30"), at("18:56"));
    expect(marks.map((m) => formatClock(m.at))).toEqual(["6:00pm", "6:30pm"]);
  });

  it("has no marks for a service shorter than half an hour, or with no readings", () => {
    expect(halfHourMarks(every5("17:30", "17:50", () => 9), at("17:30"), null)).toEqual([]);
    expect(halfHourMarks([], at("17:30"), null)).toEqual([]);
  });
});

describe("summarise", () => {
  it("averages the half-hour readings and finds the peak among all of them", () => {
    const readings = every5("17:30", "19:10", (m) => (m === 45 ? 99 : 20 + m));
    const marks = halfHourMarks(readings, at("17:30"), at("17:30"));
    // Marks: 6:00 = 50, 6:30 = 80, 7:00 = 110.
    expect(summarise(readings, marks)).toEqual({ average: 80, basis: "half-hour", peak: { at: at("19:10") + 250, listeners: 120 } });
  });

  it("rounds the average to a whole person", () => {
    const readings = [
      { at: at("18:00"), listeners: 10 },
      { at: at("18:30"), listeners: 11 },
    ];
    expect(summarise(readings, halfHourMarks(readings, at("17:30"), null)).average).toBe(11);
  });

  it("leaves a missed half hour out of the average rather than counting it as nobody", () => {
    const readings = [...every5("17:30", "17:45", () => 10), ...every5("18:20", "19:05", () => 20)];
    expect(summarise(readings, halfHourMarks(readings, at("17:30"), null)).average).toBe(20);
  });

  it("averages every reading, and says so, when the service was too short for a half-hour one", () => {
    const readings = every5("17:30", "17:50", (m) => m);
    expect(summarise(readings, [])).toEqual({ average: 10, basis: "all", peak: { at: at("17:50") + 250, listeners: 20 } });
  });

  it("gives the first time the peak was reached", () => {
    const readings = [
      { at: at("18:00"), listeners: 40 },
      { at: at("18:05"), listeners: 52 },
      { at: at("18:10"), listeners: 52 },
    ];
    expect(summarise(readings, []).peak).toEqual({ at: at("18:05"), listeners: 52 });
  });

  it("has nothing to say with no readings", () => {
    expect(summarise([], [])).toEqual({ average: null, basis: null, peak: null });
  });
});

describe("formatting", () => {
  it("writes times the way the team does", () => {
    expect([at("00:05"), at("09:30"), at("12:00"), at("12:30"), at("18:00"), at("23:59")].map((t) => formatClock(t))).toEqual(["12:05am", "9:30am", "12:00pm", "12:30pm", "6:00pm", "11:59pm"]);
  });

  it("writes the day weekday first", () => {
    expect(formatDay(at("16:30"))).toBe("Wed 11 Nov 2026");
  });

  it("uses the right plural", () => {
    expect([0, 1, 2].map(listenersLabel)).toEqual(["0 listeners", "1 listener", "2 listeners"]);
  });
});

describe("attendanceReport", () => {
  it("is the message the team sends: the service, the day, each half hour, the average and the peak", () => {
    const readings = every5("16:25", "18:35", (m) => 30 + Math.floor(m / 10));
    const marks = halfHourMarks(readings, at("16:24"), at("16:30"));
    const report = attendanceReport({ title: "Midweek Service", branch: "CLC Ilorin", startedAt: at("16:24"), marks, summary: summarise(readings, marks) });
    expect(report).toBe(["*Midweek Service*", "Wed 11 Nov 2026 · CLC Ilorin", "Mixlr listeners", "", "5:00pm — 33", "5:30pm — 36", "6:00pm — 39", "6:30pm — 42", "", "Average: 38", "Peak: 43 (6:35pm)"].join("\n"));
  });

  it("leaves out a half hour with no reading", () => {
    const readings = [...every5("17:30", "17:45", () => 10), ...every5("18:20", "18:35", () => 20)];
    const marks = halfHourMarks(readings, at("17:30"), null);
    const report = attendanceReport({ title: "Sunday", branch: "CLC Ilorin", startedAt: at("17:30"), marks, summary: summarise(readings, marks) });
    expect(report).not.toContain("6:00pm");
    expect(report).toContain("6:30pm — 20");
  });

  it("says what a short service's average is the average of", () => {
    const readings = every5("17:30", "17:50", () => 8);
    const report = attendanceReport({ title: "Vigil", branch: "CLC Ilorin", startedAt: at("17:30"), marks: [], summary: summarise(readings, []) });
    expect(report).toBe(["*Vigil*", "Wed 11 Nov 2026 · CLC Ilorin", "Mixlr listeners", "", "Average: 8 (every reading)", "Peak: 8 (5:30pm)"].join("\n"));
  });

  it("says so when there were no readings at all", () => {
    const report = attendanceReport({ title: "Vigil", branch: "CLC Ilorin", startedAt: at("17:30"), marks: [], summary: summarise([], []) });
    expect(report.endsWith("No readings were taken.")).toBe(true);
  });
});
