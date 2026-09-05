"use client";

import { memo, useMemo } from "react";
import { groupByLetter } from "@/lib/songGroups";
import type { IndexedSong, SearchableSong } from "@/lib/songSearch";

interface Props {
  book: IndexedSong[];
  onOpen: (song: SearchableSong) => void;
}

/**
 * The whole book, A–Z, for the moment you don't yet know what to search for.
 * Rows open the same song view a search hit does, so nothing is learned twice.
 *
 * Memoised, and that is load-bearing: at 2,222 songs this is ~8,900 elements,
 * and without it React reconciles all of them on every keystroke in the search
 * box. Measured on a 4x-throttled phone profile, median of three runs:
 * a keystroke 618ms -> 145ms, clearing the box 688ms -> 175ms.
 *
 * `content-visibility: auto` was tried on these rows and measured worse. The
 * rows are one line each, so laying all 2,222 out at once is cheap: 21ms to
 * first paint against 46ms, 13 layout passes against 83, and a worst frame of
 * 18ms against 71ms. It only won on re-showing the list after a search
 * (75ms against 175ms), which is not where the scrolling is.
 */
/** "#" is a fine thing to show and a useless thing to put in an id. */
const groupId = (letter: string) => `letter-${/^[A-Z]$/.test(letter) ? letter.toLowerCase() : "other"}`;

function SongList({ book, onOpen }: Props) {
  const groups = useMemo(() => groupByLetter(book.map((b) => b.song)), [book]);
  if (!groups.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      {groups.map((group) => (
        <section key={group.letter} aria-labelledby={groupId(group.letter)}>
          <h3 id={groupId(group.letter)} className="sticky top-0 z-10 border-y border-zinc-800 bg-zinc-950/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] backdrop-blur">
            {group.letter}
          </h3>
          <ul className="divide-y divide-zinc-800">
            {group.songs.map((song) => (
              <li key={song.guid ?? song.id}>
                <button onClick={() => onOpen(song)} className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60">
                  <span className="font-medium">{song.title}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {song.author ? `${song.author} · ` : ""}
                    {song.sections.length} section{song.sections.length === 1 ? "" : "s"}
                    {song.source === "manual" ? " · added here" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default memo(SongList);
