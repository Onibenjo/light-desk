// Turning a stored setlist into rows the operator can act on.
//
// A stored item is a song `{ kind, id, title }` or a message `{ kind, id, title, parts? }`.
// The id is the truth — lyrics are always read from the live song, so a typo
// fixed on Saturday reaches the operator on Sunday. The cached title exists
// only so the list can paint before the 323KB songbook has landed, which on
// venue wifi is exactly when the operator needs it. Once the book is here the
// live title wins, and an id the book does not have is a song deleted since
// the setlist was prepared. A message's text is read from the library unless
// it was edited for this service.

import type { IndexedSong, SearchableSong } from "./songSearch";
import { itemKey, type MessageItem, type SetlistItem } from "./setlistEdit";
import { messageLabel, type LibraryEntry, type OpenMessage } from "./messageLibrary";

export interface SongRow {
  kind: "song";
  key: string;
  id: number;
  title: string;
  author: string | null;
  /** The song to open. Null while the book is loading, and for a deleted song. */
  song: SearchableSong | null;
  /** True only once the book has loaded and this id is not in it. */
  missing: boolean;
}

export interface MessageRow {
  kind: "message";
  key: string;
  id: number;
  title: string;
  /** What a tap copies: the edited text, else the library's. Null when there is nothing to copy yet. */
  parts: string[] | null;
  /** The text was edited for this service, so library fixes no longer reach it. */
  edited: boolean;
  /** The library has loaded and this message is not in it. */
  removed: boolean;
  /** The library is still loading and there is no edited text to fall back on. */
  waiting: boolean;
}

export type SetlistRow = SongRow | MessageRow;

/** Song lookup for the rows, or null while the book is still loading. */
export function songsById(book: IndexedSong[] | null): Map<number, SearchableSong> | null {
  if (!book) return null;
  const byId = new Map<number, SearchableSong>();
  for (const { song } of book) if (song.id !== undefined) byId.set(song.id, song);
  return byId;
}

export function resolveSetlist(
  items: SetlistItem[],
  songs: Map<number, SearchableSong> | null,
  library: Map<number, LibraryEntry> | null,
): SetlistRow[] {
  return items.map((item): SetlistRow => {
    if (item.kind === "message") {
      const entry = library?.get(item.id);
      const parts = item.parts ?? entry?.message.parts ?? null;
      return {
        kind: "message",
        key: itemKey(item),
        id: item.id,
        title: entry ? messageLabel(entry.section, entry.message) : item.title,
        parts,
        edited: item.parts !== undefined,
        // Not knowing yet is not the same as knowing it is gone.
        removed: library !== null && !entry,
        waiting: library === null && parts === null,
      };
    }
    const song = songs?.get(item.id) ?? null;
    return {
      kind: "song",
      key: itemKey(item),
      id: item.id,
      title: song?.title ?? item.title,
      author: song?.author ?? null,
      song,
      missing: songs !== null && song === null,
    };
  });
}

/** Set (or, with undefined, remove) the text edited for this service on one message item. */
export function withParts(items: SetlistItem[], index: number, parts: string[] | undefined): SetlistItem[] {
  return items.map((item, i) => {
    if (i !== index || item.kind !== "message") return item;
    const next: MessageItem = { kind: "message", id: item.id, title: item.title };
    if (parts) next.parts = parts;
    return next;
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

/** What tapping a message row opens or copies. Null when the row has no text to offer. */
export function openMessageFromRow(row: MessageRow, library: Map<number, LibraryEntry> | null): OpenMessage | null {
  if (!row.parts) return null;
  return {
    key: row.key,
    id: row.id,
    label: row.title,
    parts: row.parts,
    edited: row.edited,
    inService: library?.get(row.id)?.section.inService ?? false,
  };
}
