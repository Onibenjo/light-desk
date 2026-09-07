/** What the import would do, or did. Titles, not just counts. */
export interface Summary {
  totalEntries: number;
  skippedEmpty: number;
  collapsedDuplicates: number;
  repeatedGuids: number;
  unchanged: number;
  added: string[];
  updated: string[];
  /** Corrected at the desk, so the songbook's version was not written over them. */
  skippedEdited: string[];
}

/** The outcomes that are worth a line but not a list. */
export function Footnotes({ s }: { s: Summary }) {
  const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
  const edited = s.skippedEdited.length;
  const notes = [
    s.skippedEmpty ? `${entries(s.skippedEmpty)} ${s.skippedEmpty === 1 ? "has" : "have"} no lyrics and ${s.skippedEmpty === 1 ? "is" : "are"} skipped` : "",
    s.collapsedDuplicates ? `${s.collapsedDuplicates} exact ${s.collapsedDuplicates === 1 ? "duplicate" : "duplicates"} collapsed` : "",
    s.repeatedGuids ? `${entries(s.repeatedGuids)} reuse another entry's ID — only the last is kept` : "",
    edited ? `${edited} ${edited === 1 ? "song was" : "songs were"} edited here and ${edited === 1 ? "is" : "are"} left alone` : "",
  ].filter(Boolean);
  if (!notes.length) return null;
  return <p className="text-xs text-[var(--muted)]">{notes.join(" · ")}.</p>;
}
