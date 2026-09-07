// The rules every song goes through on the way in, whichever door it came
// through: the songbook importer, a quick add, and the Tidy button in the
// editor all call these so a song is shaped the same way regardless.
//
// Deliberately pure and free of any database or React import — the editor
// runs them in the browser and the import route runs them on the server.

/**
 * A line that names a section rather than being sung. The shapes below are what
 * lyric sites emit; against the 40,714 slides of the CLC songbook this matches
 * 20 lines, every one of them a real label, so it is safe to simply drop them.
 */
const LABEL_LINE = /^\[?\s*(?:intro|verses?|pre[\s-]?chorus|chorus|refrain|bridge|interlude|outro|hook|vamp|instrumental|ending|coda|tag|solo|repeat)(?:\s*\d+)?\s*\]?\s*:?\s*$/i;

/** Above this a section is split; a wall of text is a bad clipboard message. */
export const MAX_SECTION_LINES = 6;

export function isLabelLine(line: string): boolean {
  return LABEL_LINE.test(line.trim());
}

export function stripLabelLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !isLabelLine(l))
    .join("\n")
    .trim();
}

/**
 * Split an oversized section into near-equal parts rather than greedily, so a
 * 7-line stanza becomes 4+3 and never 6+1: a single orphaned line reads as a
 * mistake in the chat.
 */
export function capSection(section: string): string[] {
  const lines = section.split("\n");
  if (lines.length <= MAX_SECTION_LINES) return [section];

  const chunks = Math.ceil(lines.length / MAX_SECTION_LINES);
  const base = Math.floor(lines.length / chunks);
  const extra = lines.length % chunks;
  const out: string[] = [];
  let i = 0;
  for (let c = 0; c < chunks; c++) {
    const take = base + (c < extra ? 1 : 0);
    out.push(lines.slice(i, i + take).join("\n"));
    i += take;
  }
  return out;
}

/** A blank line means a new section — the convention every lyric site uses. */
export function splitOnBlankLines(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pasted lyrics to sections: labels gone, blank lines respected, long ones capped. */
export function sectionsFromLyrics(text: string): string[] {
  return splitOnBlankLines(stripLabelLines(text)).flatMap(capSection);
}

/** What the editor's Tidy button leaves in the textarea. */
export function tidyLyrics(text: string): string {
  return sectionsFromLyrics(text).join("\n\n");
}
