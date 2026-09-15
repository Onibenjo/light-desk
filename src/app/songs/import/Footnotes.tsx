import { useState } from "react";

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

/** A noun in both numbers, so a count never reads "1 songs". */
export type Noun = { one: string; many: string };

/** A count with its noun in the right number: "1 song", "2 songs", "1 entry", "3 entries". */
export function count(n: number, noun: Noun): string {
  return `${n} ${n === 1 ? noun.one : noun.many}`;
}

export const ENTRY: Noun = { one: "entry", many: "entries" };
export const SONG: Noun = { one: "song", many: "songs" };

/** The headings over each list of titles, before and after the import. */
export const LISTS = {
  new: { one: "new song", many: "new songs" },
  toUpdate: { one: "song to update", many: "songs to update" },
  added: { one: "song added", many: "songs added" },
  updated: { one: "song updated", many: "songs updated" },
  editedHere: { one: "song edited here, kept as it is", many: "songs edited here, kept as they are" },
} satisfies Record<string, Noun>;

/** Enough titles to recognise the book at a glance; the rest are one press away. */
const SHOWN = 20;

/** A counted heading ("1 new song", "2 new songs") over the titles it counts. */
export function TitleList({ noun, titles }: { noun: Noun; titles: string[] }) {
  const [all, setAll] = useState(false);
  if (!titles.length) return null;
  const shown = all ? titles : titles.slice(0, SHOWN);

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{count(titles.length, noun)}</h3>
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        {shown.map((title, i) => (
          <li key={i} className="truncate px-3 py-1.5 text-sm text-zinc-300">
            {title}
          </li>
        ))}
      </ul>
      {!all && titles.length > SHOWN && (
        <button onClick={() => setAll(true)} className="text-xs text-[var(--muted)] underline hover:text-zinc-300">
          Show all {titles.length}
        </button>
      )}
    </div>
  );
}

/** The outcomes that are worth a line but not a list. Songs edited here have their own list. */
export function Footnotes({ s }: { s: Summary }) {
  const notes = [
    s.skippedEmpty ? `${count(s.skippedEmpty, ENTRY)} without lyrics skipped` : "",
    s.collapsedDuplicates ? `${count(s.collapsedDuplicates, { one: "exact duplicate", many: "exact duplicates" })} counted once` : "",
    s.repeatedGuids ? `${count(s.repeatedGuids, ENTRY)} ${s.repeatedGuids === 1 ? "reuses" : "reuse"} another entry's ID — only the last is kept` : "",
  ].filter(Boolean);
  if (!notes.length) return null;
  return <p className="text-xs text-[var(--muted)]">{notes.join(" · ")}.</p>;
}
