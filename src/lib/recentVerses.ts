// The verses looked up today, for the empty Verses tab. Read from the log, whose
// verse labels are "Romans 8:28 (NKJV)" or "Romans 8:28 (NKJV) whole".
//
// Only the reference and translation are kept, never the logged text: choosing
// one runs the lookup again, through the same sources and the same AI-quoted
// warning, so a verse is never re-copied without the checks a typed one gets.

export type RecentVerse = { reference: string; translation: string; at: string };

export const RECENT_LIMIT = 6;

const LABEL = /^(.+) \(([A-Z0-9]+)\)(?: whole)?$/;

/** One row per reference: trying a verse in four translations is one verse to come back to, in the last of them. */
const same = (a: RecentVerse, b: RecentVerse) => a.reference === b.reference;

/** Newest first, one entry per reference. `rows` come newest first, as /api/log returns them. */
export function recentVerses(rows: { kind: string; label: string; createdAt: string }[], limit = RECENT_LIMIT): RecentVerse[] {
  const out: RecentVerse[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (row.kind !== "verse") continue;
    const m = LABEL.exec(row.label);
    if (!m) continue;
    const entry = { reference: m[1], translation: m[2], at: row.createdAt };
    if (!out.some((r) => same(r, entry))) out.push(entry);
  }
  return out;
}

/** The list after one more copy: it goes first, and its older twin goes. */
export function withRecent(list: RecentVerse[], entry: RecentVerse, limit = RECENT_LIMIT): RecentVerse[] {
  return [entry, ...list.filter((r) => !same(r, entry))].slice(0, limit);
}
