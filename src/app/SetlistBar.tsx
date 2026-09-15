"use client";

import Icon from "./Icon";
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
  if (row.removed) return "no longer in the library";
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
    <section aria-label="Active setlist" className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-ink-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        <span className="min-w-0 wrap-anywhere">{name}</span>
        {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in it yet — add songs or messages with +.</p>
      ) : (
        <ol className="divide-y divide-ink-800">
          {rows.map((row, i) => (
            <li key={row.key}>
              {row.kind === "song" ? (
                <button
                  onClick={() => onOpen(row)}
                  disabled={row.missing}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-ink-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 wrap-break-word">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <Icon name="music" className="mr-2 h-4 w-4 -translate-y-px align-middle text-[var(--muted)]" />
                    <span className="sr-only">Song: </span>
                    <span className="font-medium">{row.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{row.missing ? "no longer in the songbook" : row.author}</span>
                </button>
              ) : (
                <button
                  onClick={() => onMessage(row)}
                  disabled={row.parts === null}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-ink-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 wrap-break-word">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <Icon name="message" className="mr-2 h-4 w-4 -translate-y-px align-middle text-[var(--muted)]" />
                    <span className="sr-only">Message: </span>
                    <span className="font-medium">{row.title}</span>
                    {row.edited && (
                      <span className="badge ml-2">
                        edited<span className="sr-only"> for this service</span>
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {messageNote(row) ?? (row.parts && row.parts.length > 1 ? `${row.parts.length} parts` : "")}
                    {copied.has(row.key) && (
                      <span className="ml-2 inline-flex text-emerald-400">
                        <Icon name="check" className="h-3.5 w-3.5 align-middle" />
                        <span className="sr-only">copied</span>
                      </span>
                    )}
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
