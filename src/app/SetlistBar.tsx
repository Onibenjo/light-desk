"use client";

import type { SetlistRow } from "@/lib/setlist";

interface Props {
  name: string;
  /** From staleNote(); shown in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** The tab decides whether to open row.song or fetch it by id first. */
  onOpen: (row: SetlistRow) => void;
}

/**
 * The songs for this service, at the top of the Songs tab, so the operator taps
 * instead of searching. A row opens the same song view a search hit opens —
 * this is a shortcut into machinery that already works, not a second way to
 * send lyrics.
 *
 * The author is on every row on purpose: it is the thing missing from a title
 * when two songs look the same in a list of search results.
 */
export default function SetlistBar({ name, staleNote, rows, onOpen }: Props) {
  return (
    <section aria-label="Setlist for this service" className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        {name}
        {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">No songs yet — find one below and press +.</p>
      ) : (
        <ol className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <li key={row.id}>
              <button
                onClick={() => onOpen(row)}
                disabled={row.missing}
                className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="min-w-0">
                  <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                  <span className="font-medium">{row.title}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {row.missing ? "no longer in the songbook" : row.author}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
