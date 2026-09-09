// Turning a stored setlist into rows the operator can act on.
//
// A stored item is `{ id, title }`. The id is the truth — lyrics are always read
// from the live song, so a typo fixed on Saturday reaches the operator on
// Sunday. The cached title exists only so the list can paint before the 323KB
// songbook has landed, which on venue wifi is exactly when the operator needs
// it. Once the book is here the live title wins, and an id the book does not
// have is a song deleted since the setlist was prepared.

import type { IndexedSong, SearchableSong } from "./songSearch";
import type { SetlistItem } from "./setlistEdit";

export interface SetlistRow {
  id: number;
  title: string;
  author: string | null;
  /** The song to open. Null while the book is loading, and for a deleted song. */
  song: SearchableSong | null;
  /** True only once the book has loaded and this id is not in it. */
  missing: boolean;
}

/** Song lookup for the rows, or null while the book is still loading. */
export function songsById(book: IndexedSong[] | null): Map<number, SearchableSong> | null {
  if (!book) return null;
  const byId = new Map<number, SearchableSong>();
  for (const { song } of book) if (song.id !== undefined) byId.set(song.id, song);
  return byId;
}

export function resolveSetlist(items: SetlistItem[], byId: Map<number, SearchableSong> | null): SetlistRow[] {
  return items.map((item) => {
    const song = byId?.get(item.id) ?? null;
    return {
      id: item.id,
      title: song?.title ?? item.title,
      author: song?.author ?? null,
      song,
      // Not knowing yet is not the same as knowing it is gone.
      missing: byId !== null && song === null,
    };
  });
}

export const STALE_AFTER_DAYS = 3;
const DAY = 86_400_000;

/** Whole days since the setlist was last touched. A clock skewed forward reads as 0. */
export function ageInDays(updatedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(updatedAt).getTime()) / DAY));
}

/** The note beside the name warning that this is last week's list, or null. */
export function staleNote(updatedAt: string, now: Date): string | null {
  const days = ageInDays(updatedAt, now);
  return days >= STALE_AFTER_DAYS ? `${days} days old` : null;
}

/** Move one song by `delta`. Out of range is a no-op, so the end buttons are safe. */
export function moveItem<T>(items: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** The default name for a new setlist: the coming Sunday, or today if it is Sunday. */
export function comingSundayName(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `Sunday ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
