// Matching one setlist song to the song bank, with the desk's own search. The
// title and every alternative name are searched, and the best showing of each
// song is kept. Only a clear winner is "matched"; a close call is left for a
// person to pick, since a wrong song on the screen mid-service is worse than
// asking.

import { searchSongs, type IndexedSong, type SongMatch } from "./songSearch";
import type { ParsedSong } from "./setlistParse";

export type MatchStatus =
  | { status: "matched"; song: { id: number; title: string } }
  | { status: "pick"; candidates: { id: number; title: string }[] }
  | { status: "missing" };

const PER_QUERY = 5;
const MAX_CANDIDATES = 3;

/** Lower is better: tier first, then how much of the name matched, then exact before fuzzy. */
function rank(m: SongMatch): [number, number, number] {
  return [m.tier, -(m.matched / m.words), m.fuzzy ? 1 : 0];
}

function compare(a: SongMatch, b: SongMatch): number {
  const [x, y] = [rank(a), rank(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export function matchSong(index: IndexedSong[], song: ParsedSong): MatchStatus {
  const best = new Map<number, SongMatch>();
  for (const name of [song.title, ...song.alternatives]) {
    for (const m of searchSongs(index, name, PER_QUERY)) {
      const id = m.song.id;
      if (id === undefined) continue;
      const seen = best.get(id);
      if (!seen || compare(m, seen) < 0) best.set(id, m);
    }
  }
  const ranked = [...best.values()].sort(compare);
  if (ranked.length === 0) return { status: "missing" };
  const [top, next] = ranked;
  const whole = top.matched === top.words;
  if (top.tier <= 2 && whole && (!next || compare(top, next) < 0)) {
    return { status: "matched", song: { id: top.song.id!, title: top.song.title } };
  }
  return { status: "pick", candidates: ranked.slice(0, MAX_CANDIDATES).map((m) => ({ id: m.song.id!, title: m.song.title })) };
}
