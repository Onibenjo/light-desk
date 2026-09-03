// Date helpers for the log page. sent_log.created_at is Unix *seconds* (UTC),
// but "a particular Sunday" is a local day — so every boundary here is computed
// with local-time arithmetic. That makes the DST switchover Sundays (23h and
// 25h long) come out right, which matters: those are service days too.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);

/** Epoch-second bounds of a local day: [from, to). */
export function dayBounds(iso: string): { from: number; to: number } {
  const { y, m, d } = parseISO(iso);
  // Day + 1 rather than +86400s, so a DST day is its true length.
  return { from: secs(new Date(y, m - 1, d)), to: secs(new Date(y, m - 1, d + 1)) };
}

/** "2026-08-30" for the *local* date of d, not its UTC date. */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day delta days after iso (negative to go back). */
export function shiftDay(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso);
  return toISODate(new Date(y, m - 1, d + delta));
}

/** "Sun 30 Aug 2026" — weekday first, so a Sunday is spottable at a glance. */
export function formatDayLabel(iso: string): string {
  const { y, m, d } = parseISO(iso);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** Entry counts per local day, newest day first. */
export function groupDays(seconds: number[]): { iso: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of seconds) {
    const iso = toISODate(new Date(s * 1000));
    counts.set(iso, (counts.get(iso) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([iso, count]) => ({ iso, count }))
    .sort((a, b) => b.iso.localeCompare(a.iso));
}
