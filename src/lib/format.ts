export interface Verse {
  verse: number;
  text: string;
}

export interface Passage {
  reference: string; // "Romans 8:28-30"
  translationCode: string; // "NKJV"
  translationName: string; // "New King James Version"
  verses: Verse[];
  source: "local" | "cache" | "youversion" | "apibible" | "gateway" | "llm";
  attempts?: string[]; // why earlier sources in the chain failed, for the operator/dev
}

export const MAX_MESSAGE_CHARS = Number(process.env.NEXT_PUBLIC_MAX_MESSAGE_CHARS ?? 1000);

/** Plain text, one line per verse, exactly the style already used in the CLC chat. */
export function formatPassage(p: Passage): string {
  const header = `${p.reference}\n${p.translationName}`;
  const body = p.verses.map((v) => `${v.verse}. ${cleanVerseText(v.text)}`).join("\n");
  return `${header}\n${body}`;
}

/** Strip markup remnants, italics markers, footnote letters, poetry indents. */
export function cleanVerseText(s: string): string {
  return s
    .replace(/[{}]/g, "") // KJV italics braces; AMP square brackets are kept on purpose
    .replace(/\[([a-z])\]/g, "") // footnote markers like [a]
    .replace(/[\u00a0\u2009\u200a\u202f]/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Split a formatted passage into chat-sized messages. Each chunk repeats the
 * header so latecomers reading a later chunk still know what it is.
 */
export function splitForChat(p: Passage, max = MAX_MESSAGE_CHARS): string[] {
  const full = formatPassage(p);
  if (full.length <= max) return [full];
  const header = `${p.reference}\n${p.translationName}`;
  const chunks: string[] = [];
  let current = header;
  for (const v of p.verses) {
    const line = `${v.verse}. ${cleanVerseText(v.text)}`;
    if ((current + "\n" + line).length > max && current !== header) {
      chunks.push(current);
      current = `${p.reference} (cont.)\n${p.translationName}\n${line}`;
    } else {
      current += "\n" + line;
    }
  }
  chunks.push(current);
  return chunks;
}
