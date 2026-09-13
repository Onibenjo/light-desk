"use client";

interface Props {
  label: string;
  parts: string[];
  /** Showing text edited for this service rather than the library's. */
  edited: boolean;
  sent: ReadonlySet<number>;
  cursor: number;
  /** The part just copied, briefly highlighted where the operator is looking. */
  flash: number | null;
  /** "+ Setlist" or "Start a setlist"; null when the section cannot go in a setlist. */
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">
          {label}
          {edited && (
            <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
          )}
        </h2>
        <span className="flex shrink-0 gap-2">
          {addLabel && (
            <button onClick={onAdd} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
              {addLabel}
            </button>
          )}
          <button onClick={onBack} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            ← Messages
          </button>
        </span>
      </div>
      <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
        <span className="kbd">↵</span> send and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> jump · <span className="kbd">Esc</span> back
      </p>
      <ol className="space-y-2">
        {parts.map((part, i) => (
          <li
            key={i}
            className={`rounded-xl border p-1 transition-colors ${
              flash === i ? "border-emerald-500/60 bg-emerald-500/10" : sent.has(i) ? "border-zinc-800/60 opacity-60" : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <button
              ref={(el) => partRef(i, el)}
              onClick={() => onCopy(i, false)}
              onFocus={() => onFocusPart(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCopy(i, true);
                }
              }}
              tabIndex={i === cursor ? 0 : -1}
              className={`w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800/60 ${i === cursor ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
            >
              <span className="mr-2 text-xs text-[var(--muted)]">{i + 1}</span>
              <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{part}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
