// A–Z grouping for browsing the whole book, so the list has landmarks to scroll
// against instead of being 1,900 undifferentiated rows.

import { normalize } from "./songSearch";

export interface SongGroup<T> {
  letter: string;
  songs: T[];
}

/** Titles that start with a digit or a symbol; there is no letter to file them under. */
const OTHER = "#";

function letterOf(title: string): string {
  const first = normalize(title)[0];
  return first >= "a" && first <= "z" ? first.toUpperCase() : OTHER;
}

/**
 * Group songs by first letter, alphabetically, with # last. Titles sort by
 * their normalized form so case and accents don't scatter neighbours.
 */
export function groupByLetter<T extends { title: string }>(songs: T[]): SongGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const song of songs) {
    const letter = letterOf(song.title);
    const group = groups.get(letter);
    if (group) group.push(song);
    else groups.set(letter, [song]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a < b ? -1 : 1))
    .map(([letter, songs]) => ({
      letter,
      songs: songs.sort((a, b) => (normalize(a.title) < normalize(b.title) ? -1 : 1)),
    }));
}
