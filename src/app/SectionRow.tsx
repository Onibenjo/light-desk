"use client";

import type { KeyboardEvent, ReactNode } from "react";
import Icon from "./Icon";

/**
 * One numbered song section or message part, as the operator works down it.
 * Three states have to be told apart across the booth at a glance:
 *
 * - where you are (the cursor): an orange bar and number, the only orange here;
 * - already copied: a green check in the number, text still at full weight —
 *   dimming it read as disabled, and a section is often copied twice;
 * - just copied: a brief warm flash, where the operator is looking.
 */
export function SectionRow({
  index,
  text,
  cursor,
  sent,
  flash,
  badges,
  note,
  trailing,
  buttonRef,
  onClick,
  onFocus,
  onKeyDown,
}: {
  index: number;
  text: string;
  cursor: boolean;
  sent: boolean;
  flash: boolean;
  badges?: ReactNode;
  /** A line beneath the text, for something wrong with this row. */
  note?: ReactNode;
  trailing?: ReactNode;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onFocus: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <li
      className={`relative flex gap-1 rounded-2xl border p-1 transition-[background-color,border-color,box-shadow] duration-300 ${flash ? "copied-flash border-ok-line bg-ink-900" : cursor ? "border-ink-600 bg-ink-800 shadow-[var(--lift)]" : "border-ink-700 bg-ink-900 shadow-[var(--bevel)]"}`}
    >
      {cursor && <span aria-hidden="true" className="pop absolute inset-y-3 -left-px w-[3px] rounded-r-full bg-accent shadow-[0_0_12px_var(--accent-glow)]" />}
      <button
        ref={buttonRef}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        tabIndex={cursor ? 0 : -1}
        // Focus scrolls the cursor's row into view; the margin keeps it clear of the pinned header.
        className="flex min-w-0 flex-1 scroll-mt-32 scroll-mb-4 gap-4 rounded-xl px-3 py-3 text-left font-text transition-colors hover:bg-ink-800"
      >
        <span
          className={`mt-0.5 inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-lg px-1.5 font-mono text-[12.5px] font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-300 ${
            cursor ? "bg-accent text-on-accent shadow-[inset_0_-2px_0_var(--accent-deep),0_4px_14px_-4px_var(--accent-glow)]" : sent ? "bg-ok-bg text-ok-fg" : "border border-ink-700 bg-ink-950/40 text-ink-400"
          }`}
        >
          {sent && <Icon name="check" className="h-3 w-3" />}
          {index + 1}
          {sent && <span className="sr-only">, copied</span>}
        </span>
        <span className="min-w-0 flex-1">
          {badges && <span className="mb-1 flex flex-wrap gap-1.5">{badges}</span>}
          <span className={`block whitespace-pre-wrap text-[17px] leading-[1.7] wrap-break-word ${cursor ? "text-ink-50" : "text-ink-200"}`}>
            {text}
          </span>
          {note}
        </span>
        {/* Enter copies the row the cursor is on, so the key is shown on that row. */}
        {cursor && (
          <span aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 self-start pt-1 font-mono text-[11px] text-[var(--muted)] pointer-fine:flex">
            <span className="kbd">↵</span> copy
          </span>
        )}
      </button>
      {trailing}
    </li>
  );
}

/**
 * Where the operator is in a long song or message: one cell per section, the
 * same three states as the rows. Kept in view by the pinned OpenHeader it sits
 * in. The cells are a picture of the sentence beside them, so only the
 * sentence is read out.
 */
export function SectionProgress({ count, cursor, sent, label }: { count: number; cursor: number; sent: ReadonlySet<number>; label: "section" | "part" }) {
  if (count < 2) return null;
  const title = label === "section" ? "Section" : "Part";
  return (
    <div className="flex items-center gap-3">
      <p className="shrink-0 font-mono text-[11.5px] font-medium tracking-wide text-ink-100 uppercase tabular-nums">
        {title} {Math.min(cursor, count - 1) + 1} of {count}
        <span className="ml-2 text-[var(--muted)]">· {sent.size} copied</span>
      </p>
      <span aria-hidden="true" className="flex h-3 min-w-0 flex-1 items-center gap-[3px]">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`h-2 min-w-0 flex-1 origin-center rounded-[2px] transition-[background-color,transform,box-shadow] duration-300 ${i === cursor ? "scale-y-150 bg-accent shadow-[0_0_8px_var(--accent-glow)]" : sent.has(i) ? "bg-ok-fg/70" : "bg-ink-700"}`}
          />
        ))}
      </span>
    </div>
  );
}
