// Finding a song from the one line you remember.
//
// The operator usually knows a fragment of the lyrics and not the title, so
// matching is deliberately forgiving: diacritics folded (the songbook is mostly
// Yoruba and Igbo), apostrophes dropped, words matched from the start, and a
// query that is partly wrong still returns its song rather than nothing. What
// ranks a hit is *proximity* — you remember a line, not scattered words — so a
// phrase sitting contiguously in one line beats the same words spread around.

export interface SearchableSong {
  id?: number;
  guid?: string;
  title: string;
  author?: string | null;
  sections: string[];
  source?: string;
}

export interface SnippetRange {
  start: number;
  end: number;
}

export interface Snippet {
  /** The lyric line as it is sung, unnormalized — this is what gets shown. */
  text: string;
  /** Character ranges of the matched words, for highlighting. */
  ranges: SnippetRange[];
  /** True when the line is a "(parenthetical translation)" rather than sung text. */
  translation: boolean;
}

export interface SongMatch {
  song: SearchableSong;
  /** 1 title phrase · 2 contiguous in a line · 3 within a section · 4 anywhere · 5 partial. */
  tier: 1 | 2 | 3 | 4 | 5;
  matched: number;
  words: number;
  /** True when a word only matched by tolerating a misspelling. */
  fuzzy: boolean;
  section: number | null;
  snippet: Snippet | null;
}

/** A match beside the tightness that ranks it, which callers have no use for. */
interface Ranked {
  match: SongMatch;
  /** Width in words of the tightest run covering the match. Smaller is better. */
  window: number;
}

interface IndexedLine {
  section: number;
  line: number;
  text: string;
  tokens: string[];
  spans: SnippetRange[];
  /** Where this line's first token sits in its section's token stream. */
  offset: number;
  translation: boolean;
}

export interface IndexedSong {
  song: SearchableSong;
  titleNorm: string;
  titleTokens: string[];
  lines: IndexedLine[];
  /** Token count per section, so a section-wide window can be measured. */
  sectionCount: number;
}

const MAX_WORDS = 8;
const DEFAULT_LIMIT = 20;
/** Reverse-prefix ("gods" finding "god") only for real words, never "a" finding everything. */
const MIN_STEM = 3;
const MAX_STEM_DIFF = 2;
/** One letter is the whole word when the word is short, so only guess at longer ones. */
const MIN_FUZZY = 5;
/** How many rows a query is padded out to before partial matches stop being useful. */
const MIN_RESULTS = 5;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’‘`]*/gu;

/** Lowercase, diacritics folded, apostrophes dropped, everything else a separator. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The query as distinct words. Capped, because past eight the operator is
 * pasting a verse. Repeats are dropped: a line that sings "a" once still
 * answers a query that says it twice, and counting it twice would stop the
 * phrase ever being judged contiguous.
 */
export function tokenize(q: string): string[] {
  const n = normalize(q);
  return n ? [...new Set(n.split(" ").filter(Boolean))].slice(0, MAX_WORDS) : [];
}

function tokensWithSpans(text: string): { tokens: string[]; spans: SnippetRange[] } {
  const tokens: string[] = [];
  const spans: SnippetRange[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const t = normalize(m[0]);
    if (!t) continue;
    tokens.push(t);
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return { tokens, spans };
}

export function buildIndex(songs: SearchableSong[]): IndexedSong[] {
  return songs.map((song) => {
    const lines: IndexedLine[] = [];
    let sectionCount = 0;
    song.sections.forEach((section, si) => {
      let offset = 0;
      section.split("\n").forEach((raw, li) => {
        const text = raw.trim();
        if (!text) return;
        const { tokens, spans } = tokensWithSpans(text);
        if (!tokens.length) return;
        lines.push({ section: si, line: li, text, tokens, spans, offset, translation: text.startsWith("("), });
        offset += tokens.length;
      });
      sectionCount = Math.max(sectionCount, offset);
    });
    return { song, titleNorm: normalize(song.title), titleTokens: tokensWithSpans(song.title).tokens, lines, sectionCount };
  });
}

/** 0 no match · 1 matched as written · 2 matched only by tolerating a misspelling. */
function tokenHit(lineTok: string, qTok: string, fuzzy: boolean): 0 | 1 | 2 {
  if (lineTok.startsWith(qTok)) return 1;
  if (qTok.startsWith(lineTok) && lineTok.length >= MIN_STEM && qTok.length - lineTok.length <= MAX_STEM_DIFF) return 1;
  if (fuzzy && qTok.length >= MIN_FUZZY && Math.abs(lineTok.length - qTok.length) <= 1 && withinOneEdit(lineTok, qTok)) return 2;
  return 0;
}

/** True when one insertion, deletion or substitution turns a into b. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

interface MatchEvent {
  pos: number;
  qis: number[];
}

/** Width of the tightest run of words covering `need`, in words. Infinity if never covered. */
function windowFor(events: MatchEvent[], need: Set<number>): number {
  if (!need.size) return Infinity;
  const count = new Map<number, number>();
  let covered = 0;
  let best = Infinity;
  let l = 0;
  for (let r = 0; r < events.length; r++) {
    for (const qi of events[r].qis) {
      if (!need.has(qi)) continue;
      const n = (count.get(qi) ?? 0) + 1;
      count.set(qi, n);
      if (n === 1) covered++;
    }
    while (covered === need.size) {
      best = Math.min(best, events[r].pos - events[l].pos + 1);
      for (const qi of events[l].qis) {
        if (!need.has(qi)) continue;
        const n = count.get(qi)! - 1;
        count.set(qi, n);
        if (n === 0) covered--;
      }
      l++;
    }
  }
  return best;
}

interface LineScan {
  ref: IndexedLine;
  events: MatchEvent[];
  matched: Set<number>;
  ranges: SnippetRange[];
  window: number;
}

function scanSong(entry: IndexedSong, qTokens: string[], fuzzy: boolean, floor: number): Ranked | null {
  const m = qTokens.length;
  const songMatched = new Set<number>();
  const fuzzyOnly = new Set<number>();
  const exactHit = new Set<number>();

  for (let qi = 0; qi < m; qi++) {
    for (const t of entry.titleTokens) {
      const hit = tokenHit(t, qTokens[qi], fuzzy);
      if (!hit) continue;
      songMatched.add(qi);
      if (hit === 1) exactHit.add(qi);
      else fuzzyOnly.add(qi);
    }
  }

  const scans: LineScan[] = [];
  for (const ref of entry.lines) {
    const events: MatchEvent[] = [];
    const matched = new Set<number>();
    const ranges: SnippetRange[] = [];
    for (let p = 0; p < ref.tokens.length; p++) {
      const qis: number[] = [];
      for (let qi = 0; qi < m; qi++) {
        const hit = tokenHit(ref.tokens[p], qTokens[qi], fuzzy);
        if (!hit) continue;
        qis.push(qi);
        matched.add(qi);
        songMatched.add(qi);
        if (hit === 1) exactHit.add(qi);
        else fuzzyOnly.add(qi);
      }
      if (qis.length) {
        events.push({ pos: ref.offset + p, qis });
        ranges.push(ref.spans[p]);
      }
    }
    if (matched.size) scans.push({ ref, events, matched, ranges, window: windowFor(events, matched) });
  }

  const matchedCount = songMatched.size;
  if (matchedCount < floor) return null;

  // The tightest run of words covering everything this song matched: on one
  // line if it can be, otherwise inside one section, otherwise nowhere. This is
  // the same measure for a complete match and a near miss, so a near miss with
  // its words on one line ranks above one with them three sections apart.
  const onOneLine = scans.filter((s) => s.matched.size === matchedCount);
  let window = onOneLine.length ? Math.min(...onOneLine.map((s) => s.window)) : sectionWindow(scans, songMatched);

  let tier: SongMatch["tier"] = 5;
  if (matchedCount === m) {
    if (onOneLine.length) tier = window === m ? 2 : 3;
    else tier = window === Infinity ? 4 : 3;
    if (entry.titleNorm.includes(qTokens.join(" "))) {
      tier = 1;
      window = 0;
    }
  }

  const snippet = pickSnippet(scans);
  return {
    match: {
      song: entry.song,
      tier,
      matched: matchedCount,
      words: m,
      fuzzy: [...fuzzyOnly].some((qi) => !exactHit.has(qi)),
      section: snippet?.ref.section ?? null,
      snippet: snippet ? { text: snippet.ref.text, ranges: snippet.ranges, translation: snippet.ref.translation } : null,
    },
    window,
  };
}

/** The tightest run covering `need` within any one section, or Infinity. */
function sectionWindow(scans: LineScan[], need: Set<number>): number {
  const bySection = new Map<number, MatchEvent[]>();
  for (const s of scans) bySection.set(s.ref.section, (bySection.get(s.ref.section) ?? []).concat(s.events));
  let best = Infinity;
  for (const events of bySection.values()) best = Math.min(best, windowFor(events, need));
  return best;
}

/** The line that best shows why this song matched: most words, sung over glossed, tightest. */
function pickSnippet(scans: LineScan[]): LineScan | null {
  let best: LineScan | null = null;
  for (const s of scans) {
    if (!best) {
      best = s;
      continue;
    }
    const better =
      s.matched.size !== best.matched.size
        ? s.matched.size > best.matched.size
        : s.ref.translation !== best.ref.translation
          ? !s.ref.translation
          : s.window < best.window;
    if (better) best = s;
  }
  return best;
}

/**
 * How many of your words a song accounted for comes first; then whether it
 * needed a spelling guess to do it; only then how tightly they sit. Ordering
 * spelling above tier is what stops a guessed match outranking one that matched
 * as typed, without letting it outrank a song that understood more of you.
 */
function compare(a: Ranked, b: Ranked): number {
  return (
    b.match.matched - a.match.matched ||
    Number(a.match.fuzzy) - Number(b.match.fuzzy) ||
    a.match.tier - b.match.tier ||
    Number(a.match.snippet?.translation ?? false) - Number(b.match.snippet?.translation ?? false) ||
    a.window - b.window ||
    a.match.song.title.localeCompare(b.match.song.title)
  );
}

/**
 * Rank the songbook against a remembered fragment. A hit needs at least half
 * the words — one common word in a query of five is noise, not a memory — and
 * misspellings are only tolerated once the query has failed to match as typed.
 *
 * Partial matches rescue a query that would otherwise come back empty; they do
 * not pad one that already worked. So when songs matched every word, only a few
 * near-misses follow them, and when nothing matched fully, near-misses are all
 * there is and the list is filled with them.
 */
export function searchSongs(index: IndexedSong[], query: string, limit = DEFAULT_LIMIT): SongMatch[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const floor = Math.ceil(qTokens.length / 2);

  const exact: Ranked[] = [];
  for (const entry of index) {
    const hit = scanSong(entry, qTokens, false, floor);
    if (hit) exact.push(hit);
  }

  const understood = exact.some((h) => h.match.matched === qTokens.length);
  const guessable = qTokens.some((t) => t.length >= MIN_FUZZY);
  if (guessable && (!understood || exact.length < 3)) {
    const byKey = new Map(exact.map((h) => [keyOf(h), h]));
    for (const entry of index) {
      const hit = scanSong(entry, qTokens, true, floor);
      if (!hit) continue;
      const prev = byKey.get(keyOf(hit));
      // A tolerated misspelling only counts if it understood more of the query.
      if (!prev || hit.match.matched > prev.match.matched) byKey.set(keyOf(hit), hit);
    }
    return trim([...byKey.values()].sort(compare), qTokens.length, limit);
  }

  return trim(exact.sort(compare), qTokens.length, limit);
}

const keyOf = (r: Ranked) => r.match.song.guid ?? r.match.song.id ?? r.match.song.title;

function trim(sorted: Ranked[], words: number, limit: number): SongMatch[] {
  const full = sorted.filter((h) => h.match.matched === words);
  const near = full.length ? sorted.filter((h) => h.match.matched < words).slice(0, Math.max(0, MIN_RESULTS - full.length)) : [];
  const kept = full.length ? full.concat(near) : sorted;
  return kept.slice(0, limit).map((h) => h.match);
}
