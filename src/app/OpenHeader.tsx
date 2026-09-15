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
    <div className="sticky top-0 z-10 -mx-1 space-y-2 border-b border-ink-800 bg-ink-950 px-1 pt-2 pb-2.5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn btn-sm shrink-0">
          <span aria-hidden="true">←</span> {backLabel}
        </button>
        {/* Two lines at most on a phone, where beside two buttons one line left a few letters; one on a wider screen. */}
        <h2 title={title} className="line-clamp-2 min-w-0 flex-1 text-xl leading-tight font-semibold wrap-break-word sm:line-clamp-1 sm:text-2xl">
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
    <section aria-label={`End of the ${what}`} className="space-y-3 rounded-xl border border-ink-800 bg-ink-900 p-4">
      <p className="eyebrow">End of the {what}</p>
      {next && (
        <button
          onClick={onNext}
          disabled={!openable}
          className="flex min-h-14 w-full items-center gap-3 rounded-lg bg-[var(--accent)] px-4 py-3 text-left text-black hover:brightness-110 disabled:bg-ink-800 disabled:text-ink-400"
        >
          <Icon name={next.kind === "song" ? "music" : "message"} className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-xs font-semibold tracking-wider uppercase">
              Next in {setlistName} · {place!.nextPosition} of {place!.count}
            </span>
            <span className="block truncate font-text text-lg font-bold">
              <span className="sr-only">{next.kind === "song" ? "Song: " : "Message: "}</span>
              {next.title}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-xl">
            →
          </span>
        </button>
      )}
      {/* Outside the button, so the reason is reachable while the button is disabled. Only a message whose library hasn't loaded gets here: gone rows are skipped. */}
      {next && !openable && <p className="text-sm text-[var(--muted)]">Loading the library…</p>}
      {place && !next && <p className="text-[15px] text-ink-300">That was the last item in {setlistName}.</p>}
      {place && place.skipped > 0 && <p className="text-sm text-[var(--muted)]">{skippedNote(place.skipped)}</p>}
      <button onClick={onBack} className="btn">
        <span aria-hidden="true">←</span> {backLabel}
      </button>
    </section>
  );
}
