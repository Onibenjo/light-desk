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
 * - just copied: the green flash, where the operator is looking.
 */
export function SectionRow({
  index,
  text,
  cursor,
  sent,
  flash,
  badges,
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
  trailing?: ReactNode;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onFocus: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <li
      className={`relative flex gap-1 rounded-xl border p-1 transition-colors ${
        flash ? "border-emerald-500/60 bg-emerald-500/10" : cursor ? "border-ink-600 bg-ink-800" : "border-ink-800 bg-ink-900"
      }`}
    >
      {cursor && <span aria-hidden="true" className="absolute inset-y-2 -left-px w-1 rounded-full bg-[var(--accent)]" />}
      <button
        ref={buttonRef}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        tabIndex={cursor ? 0 : -1}
        className="flex min-w-0 flex-1 gap-3 rounded-lg px-3 py-2.5 text-left font-text hover:bg-ink-700/40"
      >
        <span
          className={`mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-0.5 rounded px-1 font-ui text-[13px] font-semibold tabular-nums ${
            cursor ? "bg-[var(--accent)] text-black" : sent ? "bg-emerald-950 text-emerald-300" : "bg-ink-800 text-ink-300"
          }`}
        >
          {sent && <Icon name="check" className="h-3 w-3" />}
          {index + 1}
          {sent && <span className="sr-only">, copied</span>}
        </span>
        <span className="min-w-0 flex-1">
          {badges && <span className="mb-1 flex flex-wrap gap-1.5">{badges}</span>}
          <span className={`block whitespace-pre-wrap text-[17px] leading-relaxed wrap-break-word ${cursor ? "text-ink-50" : "text-ink-200"}`}>
            {text}
          </span>
        </span>
      </button>
      {trailing}
    </li>
  );
}

/**
 * Where the operator is in a long song or message, kept in view while the list
 * scrolls: one cell per section, the same three states as the rows. The cells
 * are a picture of the sentence beside them, so only the sentence is read out.
 */
export function SectionProgress({ count, cursor, sent, label }: { count: number; cursor: number; sent: ReadonlySet<number>; label: "section" | "part" }) {
  if (count < 2) return null;
  const title = label === "section" ? "Section" : "Part";
  return (
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-3 bg-ink-950 px-1 py-2">
      <p className="shrink-0 font-ui text-[13px] font-semibold tracking-wider uppercase text-ink-200 tabular-nums">
        {title} {Math.min(cursor, count - 1) + 1} of {count}
        <span className="ml-2 font-medium text-[var(--muted)]">· {sent.size} copied</span>
      </p>
      <span aria-hidden="true" className="flex min-w-0 flex-1 gap-0.5">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`h-2 min-w-0 flex-1 rounded-sm ${i === cursor ? "bg-[var(--accent)]" : sent.has(i) ? "bg-emerald-500/70" : "bg-ink-700"}`}
          />
        ))}
      </span>
    </div>
  );
}
