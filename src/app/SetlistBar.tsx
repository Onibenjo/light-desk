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
  /** From staleNote(); shown as a caution badge beside the name when not null. */
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
    <span className="pop ml-2.5 inline-grid h-5 w-5 place-items-center rounded-md bg-ok-bg text-ok-fg">
      <Icon name="check" className="h-3 w-3" />
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
    <section aria-label="Service order" className="rise relative overflow-hidden rounded-2xl border border-dashed border-ink-600 px-5 py-5">
      <h2 className="eyebrow flex items-center gap-2">
        <span aria-hidden="true" className="tally tally-off" />
        Service order
      </h2>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-300">
        The songs and messages for one service, in the order they&rsquo;re needed — so nothing is searched for while the service is running.
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/setlists" className="btn">
          <Icon name="list" className="h-4 w-4" />
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

  // The rundown's playhead: the first row nothing has been copied from yet.
  const nextKey = rows.find((row) => !copied.has(row.key))?.key ?? null;
  const done = rows.filter((row) => copied.has(row.key)).length;

  const rowClass = (key: string) =>
    `group relative flex min-h-12 w-full items-center justify-between gap-3 py-3 pr-4 pl-3 text-left font-text transition-colors hover:bg-ink-800 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
      key === nextKey ? "bg-accent-soft/50 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent before:shadow-[0_0_10px_var(--accent-glow)]" : ""
    }`;
  const number = (i: number, key: string) => (
    <span className={`mr-3 inline-block w-6 text-right font-mono text-[12px] tabular-nums ${key === nextKey ? "text-accent-ink" : copied.has(key) ? "text-ink-500" : "text-[var(--muted)]"}`}>{String(i + 1).padStart(2, "0")}</span>
  );
  const nextTag = (key: string) =>
    key === nextKey && (
      <span className="badge badge-accent ml-2.5 hidden sm:inline-flex">
        <span aria-hidden="true" className="tally h-1.5 w-1.5" />
        Up next
      </span>
    );

  return (
    <section aria-label="Active service order" className="rise card overflow-hidden">
      {/* The name alone never said what kind of thing this is; the words beside it are
          how anyone who has not met the feature learns what the rows below are. The row
          must not wrap: on a phone a long name pushed Change onto a line of its own,
          where it read as a stray row rather than an action on the header. Hide/Change
          share one shrink-0 group so a second control doesn't reopen that bug. */}
      <div className="relative flex items-start justify-between gap-x-3 border-b border-ink-700 px-4 pt-3.5 pb-4">
        <h2 className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <ActiveBadge />
            <span className="eyebrow">Service order</span>
            {staleNote && <span className="badge badge-warn normal-case tracking-normal">{staleNote}</span>}
          </span>
          <span className="display mt-2 block text-[24px] wrap-anywhere sm:text-[28px]">{name}</span>
        </h2>
        <div className="-my-0.5 flex shrink-0 items-center gap-x-2">
          {rows.length > 0 && (
            <span aria-hidden="true" className="mr-1 hidden font-mono text-[11px] text-[var(--muted)] tabular-nums sm:inline">
              <span className="text-ink-100">{done}</span>/{rows.length}
            </span>
          )}
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
        {/* The meter along the header's foot: green for what's been copied, orange for what's next. */}
        {rows.length > 0 && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-[2px] gap-px">
            {rows.map((row) => (
              <span key={row.key} className={`flex-1 transition-colors duration-500 ${copied.has(row.key) ? "bg-ok-fg/80" : row.key === nextKey ? "bg-accent" : "bg-transparent"}`} />
            ))}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in it yet — add songs or messages with +.</p>
      ) : collapsed ? null : (
        <ol id={listId} ref={listRef} className="relative max-h-[45vh] divide-y divide-ink-700/70 overflow-y-auto">
          {rows.map((row, i) => (
            <li
              key={row.key}
              ref={(el) => {
                if (el) rowElements.current.set(row.key, el);
                else rowElements.current.delete(row.key);
              }}
            >
              {row.kind === "song" ? (
                <button onClick={() => onOpen(row)} disabled={row.missing} className={rowClass(row.key)}>
                  <span className="min-w-0 wrap-break-word">
                    {number(i, row.key)}
                    <Icon name="music" className="mr-2 h-4 w-4 -translate-y-px align-middle text-[var(--muted)]" />
                    <span className="sr-only">Song: </span>
                    <span className={`font-ui font-medium ${copied.has(row.key) ? "text-ink-300" : "text-ink-50"}`}>{row.title}</span>
                    {nextTag(row.key)}
                  </span>
                  <span className="flex shrink-0 items-center font-ui text-xs text-[var(--muted)]">
                    {row.missing ? "no longer in the songbook" : row.author}
                    {copied.has(row.key) && <CopiedTick />}
                  </span>
                </button>
              ) : (
                <button onClick={() => onMessage(row)} disabled={row.parts === null} className={rowClass(row.key)}>
                  <span className="min-w-0 wrap-break-word">
                    {number(i, row.key)}
                    <Icon name="message" className="mr-2 h-4 w-4 -translate-y-px align-middle text-[var(--muted)]" />
                    <span className="sr-only">Message: </span>
                    <span className={`font-ui font-medium ${copied.has(row.key) ? "text-ink-300" : "text-ink-50"}`}>{row.title}</span>
                    {row.edited && (
                      <span className="badge ml-2">
                        edited<span className="sr-only"> for this service</span>
                      </span>
                    )}
                    {nextTag(row.key)}
                  </span>
                  <span className="flex shrink-0 items-center font-mono text-[11px] text-[var(--muted)]">
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
