"use client";

import type { RecentVerse } from "@/lib/recentVerses";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * What fills the Verses tab between lookups: the verses looked up today, so
 * the one the pastor comes back to is a press away. Choosing one looks it up
 * again (see recentVerses.ts), which copies it the way pressing Enter would —
 * or, for AI-quoted text, shows the warning and copies nothing.
 */
export default function RecentVerses({ verses, disabled, onChoose }: { verses: RecentVerse[]; disabled: boolean; onChoose: (v: RecentVerse) => void }) {
  if (verses.length === 0) return null;
  return (
    <section aria-labelledby="recent-verses" className="space-y-2">
      <h2 id="recent-verses" className="eyebrow">
        Earlier today
      </h2>
      <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
        {verses.map((v) => (
          <li key={`${v.reference} ${v.translation}`}>
            <button
              onClick={() => onChoose(v)}
              disabled={disabled}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-800 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate font-text text-[17px] font-bold text-ink-50">{v.reference}</span>
              <span className="shrink-0 text-[13px] font-semibold tracking-wide text-ink-300">{v.translation}</span>
              <span className="w-12 shrink-0 text-right text-sm text-[var(--muted)] tabular-nums">{time(v.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
