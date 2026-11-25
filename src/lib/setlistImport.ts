// Naming the orders a pasted setlist becomes, and checking a save request.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAX_PASTE = 8000;
const MAX_ORDERS = 20;
const MAX_SONGS = 200;
const MAX_NAME = 120;

/** The next Wednesday or Sunday, counting today: the service the choir's list is for. */
export function defaultServiceDate(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (d.getDay() !== 0 && d.getDay() !== 3) d.setDate(d.getDate() + 1);
  return d;
}

/** "Sun 29 Nov · First Service". */
export function orderName(date: Date, service: string): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${service}`;
}

/** "YYYY-MM-DD" as a local date, or null. */
export function parseDate(s: unknown): Date | null {
  const m = typeof s === "string" ? s.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** A second "A" becomes "A (2)", so two cards never save over each other. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    return count === 1 ? n : `${n} (${count})`;
  });
}

export interface ImportRequest {
  orders: { name: string; songIds: number[] }[];
}

export function parseImport(body: unknown): ImportRequest | string {
  const orders = (body as { orders?: unknown } | null)?.orders;
  if (!Array.isArray(orders) || orders.length === 0) return "Nothing to save";
  if (orders.length > MAX_ORDERS) return `At most ${MAX_ORDERS} orders at once`;
  const out: ImportRequest["orders"] = [];
  for (const o of orders) {
    const name = typeof o?.name === "string" ? o.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > MAX_NAME) return "Each order needs a name";
    if (!Array.isArray(o.songIds) || o.songIds.length > MAX_SONGS || !o.songIds.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)) return "Invalid songs";
    if (out.some((x) => x.name === name)) return "Two service orders have the same name; rename one";
    out.push({ name, songIds: o.songIds });
  }
  return { orders: out };
}
