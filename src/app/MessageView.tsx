"use client";

import { SectionRow } from "./SectionRow";
import { EndOfList, OpenHeader } from "./OpenHeader";
import { canOpenRow, type SetlistPlace } from "@/lib/setlist";

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
  /** The active setlist's name, and where this message sits in it; null when it isn't in one. */
  setlistName: string | null;
  place: SetlistPlace | null;
  onNext: () => void;
  partRef: (index: number, el: HTMLButtonElement | null) => void;
}

/**
 * A message of several Mixlr posts — the confession, the account details —
 * sent one part at a time, the way a song is sent section by section. Keys are
 * handled by the tab (Esc, arrows, 1–9); Enter on a focused part copies it and
 * moves on, a click copies it and stays.
 */
export default function MessageView({ label, parts, edited, sent, cursor, flash, addLabel, onCopy, onFocusPart, onAdd, onBack, setlistName, place, onNext, partRef }: Props) {
  return (
    <div className="space-y-3">
      <OpenHeader
        backLabel="Messages"
        onBack={onBack}
        title={label}
        badge={
          edited && (
            <span className="badge shrink-0">
              edited<span className="sr-only"> for this service</span>
            </span>
          )
        }
        count={parts.length}
        cursor={cursor}
        sent={sent}
        label="part"
      />
      {addLabel && (
        <div>
          <button onClick={onAdd} className="btn btn-sm">
            {addLabel}
          </button>
        </div>
      )}
      <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
        <span className="kbd">↵</span> copy and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> copy that part ·{" "}
        {place?.next && canOpenRow(place.next) && (
          <>
            <span className="kbd">N</span> next in the setlist ·{" "}
          </>
        )}
        <span className="kbd">Esc</span> back
      </p>
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
      <EndOfList what="message" setlistName={setlistName} place={place} onNext={onNext} backLabel="Messages" onBack={onBack} />
    </div>
  );
}
