/**
 * The arithmetic of an attendance record, kept free of the database and the
 * network so it can be tested on its own.
 *
 * The media team's manual routine: a service starts at 5:30pm, someone opens
 * Mixlr at 6:00, 6:30, 7:00, 7:30… and writes down how many are listening, and
 * afterwards the numbers are averaged. Lightdesk takes a reading every five
 * minutes instead (`POLL_MS`), and this file picks the half-hour ones back out
 * of them, so the report it produces is the one the team already sends.
 *
 * Everything here works in epoch milliseconds. Half-hour marks fall on the same
 * instants in every time zone whose offset is a whole or half hour, which
 * includes Nigeria (UTC+1), so the server never needs to know where the branch is.
 */

export const MINUTE = 60_000;
export const HALF_HOUR = 30 * MINUTE;

/** How often a reading is taken, on the clock: :00, :05, :10… so the half-hour ones land on the half hour. */
export const POLL_MS = 5 * MINUTE;

/**
 * How far from a half-hour mark a reading may be and still stand for it. A
 * little over one poll, so a single missed reading (Mixlr slow, the server
 * restarting) borrows its neighbour rather than leaving a hole in the report.
 */
export const MARK_TOLERANCE_MS = 6 * MINUTE;

/**
 * A scheduled start this close to the real one is the service's start. Further
 * apart than this, the schedule is about some other occasion (an event left
 * running, a broadcast started under the wrong event) and the real start is used.
 */
const SCHEDULE_TRUST_MS = 60 * MINUTE;

/** An open service with no reading for this long has probably lost its poller, not its listeners. */
export const STALE_MS = 12 * MINUTE;

export interface Reading {
  /** When the count was read, epoch milliseconds. */
  at: number;
  listeners: number;
}

/** One half-hour line of the report. `listeners` is null when no reading was taken near that time. */
export interface Mark {
  at: number;
  listeners: number | null;
}

export interface Summary {
  /** Rounded to a whole person. Null when there is nothing to average. */
  average: number | null;
  /**
   * What `average` is the average of: the half-hour readings, as the team has
   * always done it, or every reading when the service was too short to have any.
   */
  basis: "half-hour" | "all" | null;
  /** The highest reading of all, not just of the half-hour ones, and when it was. */
  peak: Reading | null;
}

/**
 * The half-hour times the team would have logged, with the reading for each.
 *
 * The marks are on the clock's hour and half hour. The first is half an hour
 * after the service's start, where "start" is the scheduled time when Mixlr has
 * one near the real start (a 5:30pm service that went live at 5:24 is still a
 * 5:30 service, first mark 6:00), and the real start otherwise, taken to the
 * nearest half hour. Marks stop at the last reading, and at `until` (now, for a
 * service still on air). Marks from before the
 * first reading are dropped — a service that went live late has no number for
 * them — but a gap in the middle stays, as a mark with no reading, so a hole in
 * the record is visible rather than averaged away.
 */
export function halfHourMarks(readings: Reading[], startedAt: number, scheduledStart: number | null, until: number = Infinity): Mark[] {
  if (readings.length === 0) return [];
  const sorted = [...readings].sort((a, b) => a.at - b.at);
  const first = sorted[0].at;
  const last = sorted[sorted.length - 1].at;

  const start = scheduledStart !== null && Math.abs(scheduledStart - startedAt) <= SCHEDULE_TRUST_MS ? scheduledStart : startedAt;
  const reference = Math.round(start / HALF_HOUR) * HALF_HOUR;

  const marks: Mark[] = [];
  // `until` is now while the service is on air: a reading at 6:55 must not stand in for a 7:00 that hasn't come.
  const stop = Math.min(last + MARK_TOLERANCE_MS, until);
  for (let at = reference + HALF_HOUR; at <= stop; at += HALF_HOUR) {
    if (at < first - MARK_TOLERANCE_MS) continue;
    let nearest: Reading | null = null;
    for (const r of sorted) {
      const distance = Math.abs(r.at - at);
      if (distance <= MARK_TOLERANCE_MS && (nearest === null || distance < Math.abs(nearest.at - at))) nearest = r;
    }
    marks.push({ at, listeners: nearest ? nearest.listeners : null });
  }
  return marks;
}

/** Average and peak for one service. */
export function summarise(readings: Reading[], marks: Mark[]): Summary {
  if (readings.length === 0) return { average: null, basis: null, peak: null };
  const marked = marks.flatMap((m) => (m.listeners === null ? [] : [m.listeners]));
  const basis = marked.length > 0 ? "half-hour" : "all";
  const counted = basis === "half-hour" ? marked : readings.map((r) => r.listeners);
  const average = Math.round(counted.reduce((sum, n) => sum + n, 0) / counted.length);
  // The earliest of equal highs: "it peaked at 6:45" is when it first got there.
  const peak = readings.reduce((best, r) => (r.listeners > best.listeners || (r.listeners === best.listeners && r.at < best.at) ? r : best));
  return { average, basis, peak };
}

/** The wall-clock parts of an instant: in the reader's own time zone, or in `timeZone` (the server writing a Telegram report). */
function wall(ms: number, timeZone?: string): { year: number; month: number; day: number; weekday: number; hours: number; minutes: number } {
  const d = new Date(ms);
  if (!timeZone) return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes() };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(part("year")),
    month: Number(part("month")) - 1,
    day: Number(part("day")),
    weekday: WEEKDAYS.indexOf(part("weekday")),
    hours: Number(part("hour")) % 24,
    minutes: Number(part("minute")),
  };
}

/** "6:00pm", "11:05am", "12:30pm" — the way the team writes a time, in the reader's own time zone unless one is given. */
export function formatClock(ms: number, timeZone?: string): string {
  const { hours: h, minutes } = wall(ms, timeZone);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minutes).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Wed 11 Nov 2026" for the reader's local day, the same shape the log uses. */
export function formatDay(ms: number, timeZone?: string): string {
  const d = wall(ms, timeZone);
  return `${WEEKDAYS[d.weekday]} ${d.day} ${MONTHS[d.month]} ${d.year}`;
}

/** "1 listener", "37 listeners". */
export function listenersLabel(n: number): string {
  return `${n} ${n === 1 ? "listener" : "listeners"}`;
}

export interface ReportInput {
  title: string;
  branch: string;
  startedAt: number;
  marks: Mark[];
  summary: Summary;
  /** Write the times in this zone rather than the reader's: the server has no reader. */
  timeZone?: string;
}

/**
 * The attendance report as the team sends it on WhatsApp: the service, the
 * day, one line per half hour, then the average and the peak. `*…*` is
 * WhatsApp's bold. A half hour with no reading is left out of the lines, as it
 * is left out of the average — a dash would be read as zero.
 */
export function attendanceReport({ title, branch, startedAt, marks, summary, timeZone }: ReportInput): string {
  const lines = [`*${title}*`, `${formatDay(startedAt, timeZone)} · ${branch}`, "Mixlr listeners", ""];
  const marked = marks.filter((m): m is Mark & { listeners: number } => m.listeners !== null);
  for (const m of marked) lines.push(`${formatClock(m.at, timeZone)} — ${m.listeners}`);
  if (marked.length > 0) lines.push("");
  if (summary.average !== null) lines.push(`Average: ${summary.average}${summary.basis === "all" ? " (every reading)" : ""}`);
  if (summary.peak) lines.push(`Peak: ${summary.peak.listeners} (${formatClock(summary.peak.at, timeZone)})`);
  if (summary.average === null) lines.push("No readings were taken.");
  return lines.join("\n");
}
