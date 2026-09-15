"use client";

import { SectionProgress, SectionRow } from "./SectionRow";

interface Props {
  label: string;
  parts: string[];
  /** Showing text edited for this service rather than the library's. */
  edited: boolean;
  sent: ReadonlySet<number>;
  cursor: number;
  /** The part just copied, briefly highlighted where the operator is looking. */
  flash: number | null;
  /** "Add to the setlist" or "Start a setlist"; null when the section cannot go in a setlist. */
  addLabel: string | null;
  onCopy: (index: number, advance: boolean) => void;
  onFocusPart: (index: number) => void;
  onAdd: () => void;
  onBack: () => void;
  partRef: (index: number, el: HTMLButtonElement | null) => void;
}

/**
 * A message of several Mixlr posts — the confession, the account details —
 * sent one part at a time, the way a song is sent section by section. Keys are
 * handled by the tab (Esc, arrows, 1–9); Enter on a focused part copies it and
 * moves on, a click copies it and stays.
 */
export default function MessageView({ label, parts, edited, sent, cursor, flash, addLabel, onCopy, onFocusPart, onAdd, onBack, partRef }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 basis-full text-2xl font-semibold leading-tight wrap-anywhere sm:basis-auto">
          {label}
          {edited && (
            <span className="badge ml-2">
              edited<span className="sr-only"> for this service</span>
            </span>
          )}
        </h2>
        <span className="flex flex-wrap gap-2 sm:shrink-0">
          {addLabel && (
            <button onClick={onAdd} className="rounded-md border border-ink-700 px-3 py-1.5 text-sm hover:bg-ink-800 pointer-coarse:min-h-11">
              {addLabel}
            </button>
          )}
          <button onClick={onBack} className="rounded-md border border-ink-700 px-3 py-1.5 text-sm hover:bg-ink-800 pointer-coarse:min-h-11">
            ← Messages
          </button>
        </span>
      </div>
      <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
        <span className="kbd">↵</span> copy and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> copy that part · <span className="kbd">Esc</span> back
      </p>
      <SectionProgress count={parts.length} cursor={cursor} sent={sent} label="part" />
      <ol className="space-y-2">
        {parts.map((part, i) => (
          <SectionRow
            key={i}
            index={i}
            text={part}
            cursor={i === cursor}
            sent={sent.has(i)}
            flash={flash === i}
            buttonRef={(el) => partRef(i, el)}
            onClick={() => onCopy(i, false)}
            onFocus={() => onFocusPart(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCopy(i, true);
              }
            }}
          />
        ))}
      </ol>
    </div>
  );
}
