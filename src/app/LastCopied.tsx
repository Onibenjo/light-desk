"use client";

import Icon from "./Icon";
import { useNow } from "./LiveClock";

export type LastCopy = { label: string; text: string; at: number };

/** "just now", "4 min ago", then the clock time once it's an hour old. */
export function copiedAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `at ${new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * What the desk last put on the clipboard, wherever the operator's eyes come
 * back to after pasting in Mixlr: the answer to "did I copy the right one?"
 * without scrolling. Pressing it copies the same text again.
 *
 * "Last copied", never "on the clipboard": the desk can't see what was copied
 * anywhere else since, and it never claims what it can't know.
 *
 * Two shapes: a chip for the bar along the top (and its own row on a phone),
 * and a panel for the rail that also shows the text as it will paste.
 */
export default function LastCopied({ last, onCopyAgain, variant = "chip" }: { last: LastCopy | null; onCopyAgain: (last: LastCopy) => void; variant?: "chip" | "panel" }) {
  const now = useNow() ?? 0;
  const ago = last ? copiedAgo(last.at, now || last.at) : "";

  if (variant === "panel") {
    const lines = last ? last.text.split("\n").filter((l) => l.trim()) : [];
    return (
      <section aria-label="Last copied" className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-3.5 py-2.5">
          <span className="flex items-center gap-2">
            <span key={last?.at ?? 0} className={last ? "tally tally-ok pop" : "tally tally-off"} />
            <span className="eyebrow text-ink-200">Last copied</span>
          </span>
          {last && <span className="font-mono text-[10.5px] text-ok-fg">{ago}</span>}
        </div>
        {last ? (
          <button
            key={last.at}
            type="button"
            onClick={() => onCopyAgain(last)}
            title="Copy it again"
            aria-label={`Last copied: ${last.label}. Copy it again`}
            className="fade-in group block w-full space-y-1 px-3.5 py-3 text-left transition-colors hover:bg-ink-800"
          >
            <span className="line-clamp-2 font-ui text-[13px] leading-snug font-semibold text-ink-50">{last.label}</span>
            {lines.length > 1 && <span className="line-clamp-3 font-text text-[12.5px] leading-relaxed text-ink-400">{lines.slice(1).join(" ")}</span>}
            <span className="flex items-center justify-between pt-1 font-mono text-[10px] tracking-wide text-[var(--muted)]">
              <span>{last.text.length.toLocaleString("en")} chars</span>
              <span className="flex items-center gap-1.5 text-ink-300 transition-colors group-hover:text-ok-fg">
                <Icon name="copy" className="h-3 w-3" /> Copy again
              </span>
            </span>
          </button>
        ) : (
          <p className="px-3.5 py-3 font-text text-[12.5px] leading-relaxed text-[var(--muted)]">Nothing copied since the desk opened. What you copy shows here, and one press copies it again.</p>
        )}
      </section>
    );
  }

  if (!last) {
    return (
      <span className="hidden items-center gap-2 rounded-full border border-dashed border-ink-700 px-3 py-1.5 font-ui text-[13px] whitespace-nowrap text-[var(--muted)] md:inline-flex">
        <Icon name="copy" className="h-3.5 w-3.5" />
        Nothing copied yet
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onCopyAgain(last)}
      title="Copy it again"
      aria-label={`Last copied: ${last.label}. Copy it again`}
      className="group flex max-w-full min-w-0 items-center gap-2 rounded-full border border-ok-line bg-ok-bg py-1 pr-3.5 pl-1 text-left transition-colors hover:border-ok-fg/50 pointer-coarse:min-h-11"
    >
      <span key={last.at} className="pop grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ok-fg text-ok-bg">
        {/* Wrapped: the icon's own inline-block would beat `hidden` on the svg itself. */}
        <span className="group-hover:hidden">
          <Icon name="check" className="block h-3.5 w-3.5" />
        </span>
        <span className="hidden group-hover:block">
          <Icon name="copy" className="block h-3.5 w-3.5" />
        </span>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-mono text-[10px] tracking-wide text-ok-fg uppercase">Copied {ago}</span>
        <span className="block truncate font-ui text-[13px] font-semibold text-ink-50">{last.label}</span>
      </span>
    </button>
  );
}
