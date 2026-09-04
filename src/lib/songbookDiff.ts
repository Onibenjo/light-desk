// What an import would actually do to the book, worked out before anything is
// written. The preview screen and the import itself both go through here, so
// what the operator approves is what lands.

import type { VpSong } from "./videopsalm";

/** A row as the songs table holds it: sections still JSON, author nullable. */
export interface StoredSong {
  title: string;
  author: string | null;
  sections: string;
}

export interface SongbookDiff {
  added: VpSong[];
  updated: VpSong[];
  unchanged: number;
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
 */
export function diffSongbook(parsed: VpSong[], existing: Map<string, StoredSong>): SongbookDiff {
  const byGuid = new Map<string, VpSong>();
  for (const s of parsed) byGuid.set(s.guid, s);

  const diff: SongbookDiff = { added: [], updated: [], unchanged: 0, repeatedGuids: parsed.length - byGuid.size };
  for (const song of byGuid.values()) {
    const current = existing.get(song.guid);
    if (!current) diff.added.push(song);
    else if (changed(song, current)) diff.updated.push(song);
    else diff.unchanged++;
  }
  return diff;
}
