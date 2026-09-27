import type { ReactNode } from "react";
import Icon from "./Icon";
import { SectionProgress } from "./SectionRow";
import { canOpenRow, type SetlistPlace } from "@/lib/setlist";

/**
 * The top of an open song or message, pinned while its sections scroll: the
 * way back, what is open, and how far through it the operator is. A long song
 * runs to thirty sections, and the choir moves on while the operator is at the
 * bottom of it; before this the only way back without scrolling was Esc, which
 * a phone doesn't have and a volunteer doesn't read about.
 */
export function OpenHeader({
  backLabel,
  onBack,
  title,
  badge,
  action,
  count,
  cursor,
  sent,
  label,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  badge?: ReactNode;
  /** One control beside the title, such as Copy title. */
  action?: ReactNode;
  count: number;
  cursor: number;
  sent: ReadonlySet<number>;
  label: "section" | "part";
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 space-y-3 border-b border-ink-700 bg-ink-950 px-1 pt-3 pb-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn btn-sm btn-quiet group -ml-1 shrink-0">
          <Icon name="back" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {backLabel}
        </button>
        {/* Two lines at most on a phone, where beside two buttons one line left a few letters; one on a wider screen. */}
        <h2 title={title} className="display line-clamp-2 min-w-0 flex-1 pb-0.5 text-[24px] wrap-break-word sm:line-clamp-1 sm:text-[30px]">
          {title}
        </h2>
        {badge}
        {action}
      </div>
      <SectionProgress count={count} cursor={cursor} sent={sent} label={label} />
    </div>
  );
}

function skippedNote(n: number): string {
  return n === 1
    ? "1 item after this one is no longer in the songbook or library, so it's skipped."
    : `${n} items after this one are no longer in the songbook or library, so they're skipped.`;
}

/**
 * Under the last section: where the operator's eyes already are when the song
 * ends. Offers the next item of the setlist when this one is in it, and the
 * way back either way.
 */
export function EndOfList({
  what,
  setlistName,
  place,
  onNext,
  backLabel,
  onBack,
}: {
  what: "song" | "message";
  setlistName: string | null;
  place: SetlistPlace | null;
  onNext: () => void;
  backLabel: string;
  onBack: () => void;
}) {
  const next = place?.next ?? null;
  const openable = next !== null && canOpenRow(next);
  return (
    <section aria-label={`End of the ${what}`} className="rise card space-y-3 p-5">
      <p className="eyebrow">End of the {what}</p>
      {next && (
        <button
          onClick={onNext}
          disabled={!openable}
          className="group flex min-h-16 w-full items-center gap-4 rounded-xl bg-accent px-5 py-3.5 text-left text-on-accent transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.99] disabled:bg-ink-800 disabled:text-ink-400"
        >
          <Icon name={next.kind === "song" ? "music" : "message"} className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-[11px] font-semibold tracking-[0.1em] uppercase opacity-80">
              Next in {setlistName} · {place!.nextPosition} of {place!.count}
            </span>
            <span className="mt-0.5 block truncate font-display text-[24px] leading-tight">
              <span className="sr-only">{next.kind === "song" ? "Song: " : "Message: "}</span>
              {next.title}
            </span>
          </span>
          <Icon name="forward" className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
        </button>
      )}
      {/* Outside the button, so the reason is reachable while the button is disabled. Only a message whose library hasn't loaded gets here: gone rows are skipped. */}
      {next && !openable && <p className="text-sm text-[var(--muted)]">Loading the library…</p>}
      {place && !next && <p className="text-[15px] text-ink-300">That was the last item in {setlistName}.</p>}
      {place && place.skipped > 0 && <p className="text-sm text-[var(--muted)]">{skippedNote(place.skipped)}</p>}
      <button onClick={onBack} className="btn">
        <Icon name="back" className="h-4 w-4" /> {backLabel}
      </button>
    </section>
  );
}
