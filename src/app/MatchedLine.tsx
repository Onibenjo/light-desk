import type { SnippetRange } from "@/lib/songSearch";

/**
 * The lyric line a search matched, with the matched words picked out of it.
 * Kept apart from the songbook tab so the offset arithmetic can be tested
 * without mounting the tab and its keyboard handling.
 */
export function MatchedLine({ text, ranges }: { text: string; ranges: SnippetRange[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (r.start > at) parts.push(text.slice(at, r.start));
    parts.push(
      <mark key={i} className="bg-transparent font-medium text-[var(--accent)]">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}
