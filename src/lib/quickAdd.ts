// How a pasted song becomes sections. The blank lines in the paste are the
// author's own spacing and are trusted first; the model is only asked about a
// paste that has none, because it is the one case where there is nothing to go
// on. It has been observed rewriting lines when given more rope than that.

import { capSection, splitOnBlankLines, stripLabelLines, MAX_SECTION_LINES } from "./songSections";

/**
 * Only an undifferentiated block that is too long to send in one go. Measured
 * before the cap is applied, or the cap's own split would look like structure
 * the paste never had.
 */
export function needsLlm(lyrics: string): boolean {
  const blocks = splitOnBlankLines(stripLabelLines(lyrics));
  return blocks.length === 1 && blocks[0].split("\n").length > MAX_SECTION_LINES;
}

/**
 * The model is asked for a JSON array and usually obliges, but "usually" is not
 * something to build on mid-service: anything unreadable returns null and the
 * caller falls back to the mechanical split.
 */
export function sectionsFromLlmReply(reply: string): string[] | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  // Two guards, not one: `.every()` alone doesn't prove `parsed: string[]` to
  // the type system, so the narrowing has to come from a real type predicate
  // rather than an `as` cast asserting a claim nothing here verified.
  if (!Array.isArray(parsed)) return null;
  if (!parsed.every((x): x is string => typeof x === "string")) return null;
  const sections = parsed.flatMap((s) => splitOnBlankLines(stripLabelLines(s))).flatMap(capSection);
  return sections.length ? sections : null;
}
