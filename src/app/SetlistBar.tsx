"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import ActiveBadge from "./ActiveBadge";
import Icon from "./Icon";
import type { MessageRow, SetlistRow, SongRow } from "@/lib/setlist";

/** Stable across reloads and across the two tabs this bar renders in, so the choice sticks. */
const COLLAPSE_KEY = "lightdesk:setlistBar:collapsed";

/** Exported for its own pluralisation test — reachable only after mount otherwise, once localStorage has restored a collapsed session. */
export function itemCount(n: number): string {
  return `${n} item${n === 1 ? "" : "s"}`;
}

interface Props {
  name: string;
  /** From staleNote(); shown in amber beside the name when not null. */
  staleNote: string | null;
  rows: SetlistRow[];
  /** Keys of rows copied during this page session: a message part, or any section of a song. Local to this screen; never shared. */
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

/** Something in this row has been copied during this page session. */
function CopiedTick() {
  return (
    <span className="ml-2 inline-flex text-emerald-400">
      <Icon name="check" className="h-3.5 w-3.5 align-middle" />
      <span className="sr-only">copied</span>
    </span>
  );
}

/**
 * Where the service order sits before there is one. Without it the feature is
 * invisible to anyone who has not already found it: the bar below only renders
 * once a setlist exists, and the only other mention used to be a 12px link
 * under the search box. It says what a service order is at the one moment the
 * operator can act on it, and disappears for good once one is active.
 */
export function NoSetlistBar() {
  return (
    <section aria-label="Service order" className="rounded-xl border border-dashed border-ink-700 bg-ink-900/40 px-4 py-3">
      <h2 className="eyebrow">Service order</h2>
      <p className="mt-1.5 text-sm text-ink-300">
        The songs and messages for one service, in the order they&rsquo;re needed — so nothing is searched for while the service is running.
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/setlists" className="btn btn-sm">
          Set one up
        </Link>
        <span className="text-xs text-[var(--muted)]">or add the first item with + beside a result below</span>
      </p>
    </section>
  );
}

/**
 * The service order, at the top of the Songs and Engagement tabs, so the operator
 * taps instead of searching. A song row opens the same song view a search hit
 * opens; a message row copies. It is a shortcut into machinery that already
 * works, not a second way to send anything.
 *
 * The author is on every song row on purpose: it is the thing missing from a
 * title when two songs look the same in a list of search results.
 */
export default function SetlistBar({ name, staleNote, rows, copied, onOpen, onMessage }: Props) {
  // Starts expanded on every render up to and including the first one in the browser,
  // matching what the server sent; only after mount do we know what this device chose
  // last time, so hydration never has to reconcile two different trees.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading storage after mount is the effect's whole job; see the comment above
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // A private-browsing device with storage disabled just keeps the default: expanded.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      const next = !was;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Nothing to persist to; the toggle still works for this render.
      }
      return next;
    });
  };

  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const rowElements = useRef(new Map<string, HTMLLIElement>());

  // Brings the operator back to where the service has reached, so a phone put down mid-song
  // and picked up again doesn't open on row 1. Runs on mount and on every copy, deliberately
  // not on every re-render — reordering the list without copying anything shouldn't yank the
  // scroll position out from under someone who is reading it.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    // Nothing is clipped below this height, so there is nothing to scroll to.
    if (container.scrollHeight <= container.clientHeight) return;
    const next = rows.find((row) => !copied.has(row.key));
    if (!next) return;
    const el = rowElements.current.get(next.key);
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      container.scrollTop = el.offsetTop;
    } else {
      container.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes `rows`; see comment above.
  }, [copied]);

  return (
    <section aria-label="Active service order" className="rounded-xl border border-ink-600 bg-ink-900">
      {/* The name alone never said what kind of thing this is; the words beside it are
          how anyone who has not met the feature learns what the rows below are. The row
          must not wrap: on a phone a long name pushed Change onto a line of its own,
          where it read as a stray row rather than an action on the header. Hide/Change
          share one shrink-0 group so a second control doesn't reopen that bug. */}
      <div className="flex items-start justify-between gap-x-3 border-b border-ink-800 px-4 py-2">
        <h2 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold uppercase tracking-widest text-ink-200">
          <ActiveBadge />
          <span className="text-[var(--muted)]">Service order</span>
          <span className="min-w-0 wrap-anywhere">{name}</span>
          {staleNote && <span className="font-medium normal-case tracking-normal text-amber-400">· {staleNote}</span>}
        </h2>
        <div className="-my-0.5 flex shrink-0 items-center gap-x-2">
          {rows.length > 0 && (
            // A disclosure control: without aria-expanded a screen reader hears "Hide"
            // as a plain button and is never told the list came back.
            <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls={listId} className="btn btn-sm btn-quiet">
              {collapsed ? `Show ${itemCount(rows.length)}` : "Hide"}
            </button>
          )}
          <Link href="/setlists" className="btn btn-sm btn-quiet">
            Change
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in it yet — add songs or messages with +.</p>
      ) : collapsed ? null : (
        <ol id={listId} ref={listRef} className="relative max-h-[45vh] divide-y divide-ink-800 overflow-y-auto">
          {rows.map((row, i) => (
            <li
              key={row.key}
              ref={(el) => {
                if (el) rowElements.current.set(row.key, el);
                else rowElements.current.delete(row.key);
              }}
            >
              {row.kind === "song" ? (
                <button
                  onClick={() => onOpen(row)}
                  disabled={row.missing}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left font-text hover:bg-ink-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 wrap-break-word">
                    <span className="mr-3 text-xs text-[var(--muted)]">{i + 1}</span>
                    <Icon name="music" className="mr-2 h-4 w-4 -translate-y-px align-middle text-[var(--muted)]" />
                    <span className="sr-only">Song: </span>
                    <span className="font-medium">{row.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {row.missing ? "no longer in the songbook" : row.author}
                    {copied.has(row.key) && <CopiedTick />}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => onMessage(row)}
                  disabled={row.parts === null}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-3 text-left font-text hover:bg-ink-800/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
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
                    {copied.has(row.key) && <CopiedTick />}
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
