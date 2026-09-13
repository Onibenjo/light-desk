"use client";

import type { MessageRow, SetlistRow, SongRow } from "@/lib/setlist";

interface Props {
  name: string;
  /** From staleNote(); shown in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** Keys of rows copied during this page session. Local to this screen; never shared. */
  copied: ReadonlySet<string>;
  /** The tab decides whether to open row.song or fetch it by id first. */
  onOpen: (row: SongRow) => void;
  /** The desk decides: one part copies at once, several open the message. */
  onMessage: (row: MessageRow) => void;
}

function messageNote(row: MessageRow): string | null {
  if (row.waiting) return "library not loaded";
  if (row.removed) return row.parts ? "removed from library" : "no longer in the library";
  return null;
}

/**
 * The service order, at the top of the Songs and Messages tabs, so the operator
 * taps instead of searching. A song row opens the same song view a search hit
 * opens; a message row copies. It is a shortcut into machinery that already
 * works, not a second way to send anything.
 *
 * The author is on every song row on purpose: it is the thing missing from a
 * title when two songs look the same in a list of search results.
 */
export default function SetlistBar({ name, staleNote, rows, copied, onOpen, onMessage }: Props) {
  return (
    <section aria-label="Setlist for this service" className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        {name}
        {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in it yet — add songs or messages with +.</p>
      ) : (
        <ol className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <li key={row.key}>
              {row.kind === "song" ? (
                <button
                  onClick={() => onOpen(row)}
                  disabled={row.missing}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <span className="mr-2" aria-label="Song">🎵</span>
                    <span className="font-medium">{row.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{row.missing ? "no longer in the songbook" : row.author}</span>
                </button>
              ) : (
                <button
                  onClick={() => onMessage(row)}
                  disabled={row.parts === null}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <span className="mr-2" aria-label="Message">💬</span>
                    <span className="font-medium">{row.title}</span>
                    {row.edited && (
                      <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {messageNote(row) ?? (row.parts && row.parts.length > 1 ? `${row.parts.length} parts` : "")}
                    {copied.has(row.key) && <span className="ml-2 text-emerald-400">✓</span>}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
