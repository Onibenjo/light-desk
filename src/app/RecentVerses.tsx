"use client";

import type { RecentVerse } from "@/lib/recentVerses";
import Icon from "./Icon";

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
    <section aria-labelledby="recent-verses" className="space-y-2.5">
      <h2 id="recent-verses" className="eyebrow flex items-center gap-2">
        Earlier today <span className="font-mono tracking-normal text-ink-500 normal-case">{verses.length}</span>
      </h2>
      <ul className="card divide-y divide-ink-700 overflow-hidden">
        {verses.map((v, i) => (
          <li key={`${v.reference} ${v.translation}`} style={{ "--i": i } as React.CSSProperties} className="rise">
            <button
              onClick={() => onChoose(v)}
              disabled={disabled}
              title={`Copy ${v.reference} (${v.translation}) again`}
              className="group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-800 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate font-display text-[21px] leading-tight text-ink-50">{v.reference}</span>
              <span className="badge shrink-0">{v.translation}</span>
              <span className="w-12 shrink-0 text-right font-mono text-xs text-[var(--muted)] tabular-nums">{time(v.at)}</span>
              <Icon name="copy" className="h-4 w-4 shrink-0 text-ink-500 transition-colors group-hover:text-accent-ink" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
