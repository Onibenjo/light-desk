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

function sameParts(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

export type EditSaveDecision = { kind: "skip" } | { kind: "reset" } | { kind: "save"; parts: string[] };

/**
 * What "Save for this service" on /setlists should do with the parts just
 * typed, given the library message's own parts (undefined when it is gone or
 * not loaded yet) and whether the item already carries text edited for this
 * service.
 *
 * Typing back the library's own words is not an edit: saving it anyway would
 * mark the item edited and cut it off from future library fixes. So text that
 * matches the library either does nothing (nothing was edited yet — `skip`)
 * or clears the edit (one was there before — `reset`) instead of being stored
 * as a redundant copy.
 */
export function planMessageEdit(parts: string[], libraryParts: string[] | undefined, alreadyEdited: boolean): EditSaveDecision {
  if (libraryParts !== undefined && sameParts(parts, libraryParts)) {
    return alreadyEdited ? { kind: "reset" } : { kind: "skip" };
  }
  return { kind: "save", parts };
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
  return days >= STALE_AFTER_DAYS ? `last changed ${days} days ago` : null;
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

/** The key an open song is known by in a setlist and in the session's copied sections. */
export function songKey(song: Pick<SearchableSong, "id" | "guid" | "title">): string {
  return song.id !== undefined ? itemKey({ kind: "song", id: song.id }) : `guid:${song.guid ?? song.title}`;
}

export interface SetlistPlace {
  /** 1-based, as the setlist bar numbers it. */
  position: number;
  count: number;
  /** The next row still there, or null when nothing after this one is. */
  next: SetlistRow | null;
  /** 1-based position of `next`, or null with it. */
  nextPosition: number | null;
  /** Rows passed over on the way to `next` because they were deleted since the setlist was prepared. */
  skipped: number;
}

/** A row known to be gone: a song deleted from the book, a message removed from the library. Still loading is not gone. */
export function isGoneRow(row: SetlistRow): boolean {
  return row.kind === "song" ? row.missing : row.removed;
}

/**
 * Where an open song or message sits in the setlist, and what comes next. Null
 * when it isn't in it. A row deleted since the setlist was prepared is skipped
 * rather than offered, so one missing song can't stop the service order.
 */
export function placeInSetlist(rows: SetlistRow[], key: string): SetlistPlace | null {
  const i = rows.findIndex((r) => r.key === key);
  if (i === -1) return null;
  let skipped = 0;
  for (let j = i + 1; j < rows.length; j++) {
    if (isGoneRow(rows[j])) {
      skipped++;
      continue;
    }
    return { position: i + 1, count: rows.length, next: rows[j], nextPosition: j + 1, skipped };
  }
  return { position: i + 1, count: rows.length, next: null, nextPosition: null, skipped };
}

/** A row that can be opened now: a song not deleted since, a message with text to show (not still loading). */
export function canOpenRow(row: SetlistRow): boolean {
  return row.kind === "song" ? !row.missing : row.parts !== null;
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
