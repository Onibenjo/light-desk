// What an import would actually do to the book, worked out before anything is
// written. The preview screen and the import itself both go through here, so
// what the operator approves is what lands.

import type { VpSong } from "./videopsalm";

/** A row as the songs table holds it: sections still JSON, author nullable. */
export interface StoredSong {
  title: string;
  author: string | null;
  sections: string;
  /** Set once someone corrected the song at the desk. */
  editedAt: Date | null;
}

export interface SongbookDiff {
  added: VpSong[];
  updated: VpSong[];
  unchanged: number;
  /** Corrected at the desk, so the songbook's version is not written over it. */
  skippedEdited: VpSong[];
  /** Entries dropped because a later entry claimed the same Guid. */
  repeatedGuids: number;
}

function changed(incoming: VpSong, current: StoredSong): boolean {
  return current.title !== incoming.title || current.author !== (incoming.author ?? null) || current.sections !== JSON.stringify(incoming.sections);
}

/**
 * Compare a parsed songbook against the rows already stored, keyed by Guid.
 * A Guid claimed twice in one file keeps the last entry — the row is unique, so
 * writing both would fail, and the last is what a sequential import would leave.
 *
 * A song someone fixed here is never overwritten: losing a correction made on a
 * Sunday morning to a routine re-import is worse than a stale songbook entry.
 */
export function diffSongbook(parsed: VpSong[], existing: Map<string, StoredSong>): SongbookDiff {
  const byGuid = new Map<string, VpSong>();
  for (const s of parsed) byGuid.set(s.guid, s);

  const diff: SongbookDiff = { added: [], updated: [], unchanged: 0, skippedEdited: [], repeatedGuids: parsed.length - byGuid.size };
  for (const song of byGuid.values()) {
    const current = existing.get(song.guid);
    if (!current) diff.added.push(song);
    else if (!changed(song, current)) diff.unchanged++;
    else if (current.editedAt) diff.skippedEdited.push(song);
    else diff.updated.push(song);
  }
  return diff;
}
