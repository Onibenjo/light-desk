import { Book, findBook } from "./books";
import { findTranslation, Translation } from "./translations";
import kjv from "@/data/kjv.json";

export interface Reference {
  book: Book;
  chapter: number;
  verseStart: number; // 1-based; 0 = whole chapter
  verseEnd: number; // inclusive
  translation?: Translation; // only if the operator typed a trailing token
}

export interface ParseResult {
  kind: "reference" | "description" | "empty";
  reference?: Reference;
  text: string; // the cleaned input, translation token removed
  translation?: Translation;
}

const KJV = kjv as string[][][];

export function chapterVerseCount(book: Book, chapter: number): number {
  return KJV[book.id]?.[chapter - 1]?.length ?? 0;
}

/**
 * Accepts the sloppy forms volunteers type:
 *   "rom 8 28", "rom8:28", "Romans 8:28-30", "1 cor 13 4-7", "ps 23", "john 3.16 amp",
 *   "exo 14.13-16", "1cor13v4", "jn 3 v 16", "romans chapter 8 verse 28"
 * Anything that doesn't fit is treated as a description for the LLM search.
 */
export function parseInput(rawInput: string): ParseResult {
  let text = rawInput.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "empty", text: "" };

  // Trailing translation token: "john 3 16 amp" / "john 3:16 (NLT)" / "john 3:16 in tpt"
  let translation: Translation | undefined;
  const tm = text.match(/^(.*?)(?:\s+in)?\s*[\s(]([a-z]{2,5})\)?$/i);
  if (tm) {
    const t = findTranslation(tm[2]);
    if (t) {
      translation = t;
      text = tm[1].trim();
    }
  }

  const ref = parseReference(text);
  if (ref) {
    ref.translation = translation;
    return { kind: "reference", reference: ref, text, translation };
  }
  return { kind: "description", text, translation };
}

export function parseReference(text: string): Reference | undefined {
  const t = text
    .toLowerCase()
    .replace(/\bchapter\b/g, " ")
    .replace(/\b(verses?|vs?|vv)\b\.?/g, " ")
    .replace(/(\d)\s*v\s*(\d)/g, "$1 $2") // "13v4"
    .replace(/[:.,;]/g, " ")
    .replace(/\s*[-–—]\s*(?:to\s+)?/g, "-") // "13 - 16", "13 to 16"
    .replace(/\s+to\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Separate the book part (may start with a digit: "1 cor") from the numbers.
  const m = t.match(/^((?:[1-3]\s?)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\s*(\d+)?\s*(?:(\d+)\s*(?:-\s*(\d+))?)?$/);
  // Also accept glued forms like "rom8" / "1cor13v4" by inserting a space before the first digit that follows letters.
  const m2 = !m ? t.replace(/([a-z])(\d)/, "$1 $2").replace(/(\d)([a-z])/, "$1 $2").match(/^((?:[1-3]\s?)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\s*(\d+)?\s*(?:(\d+)\s*(?:-\s*(\d+))?)?$/) : null;
  const mm = m ?? m2;
  if (!mm) return undefined;

  const book = findBook(mm[1]);
  if (!book) return undefined;

  // Single-chapter books typed as "jude 24" or "jude 24-25" mean verses, not a chapter.
  if (book.chapters === 1 && mm[2] && parseInt(mm[2], 10) > 1) {
    const vs = parseInt(mm[2], 10);
    const ve = mm[3] ? parseInt(mm[3], 10) : vs;
    return clamp({ book, chapter: 1, verseStart: vs, verseEnd: Math.max(vs, ve) }, chapterVerseCount(book, 1));
  }

  const chapter = mm[2] ? parseInt(mm[2], 10) : 1;
  if (chapter < 1 || chapter > book.chapters) return undefined;

  const maxV = chapterVerseCount(book, chapter);
  const verseStart = mm[3] ? parseInt(mm[3], 10) : 0;
  let verseEnd = mm[4] ? parseInt(mm[4], 10) : verseStart;

  // A bare book + chapter + nothing ("ps 23") is the whole chapter, but a book
  // with only a chapter number and a description-like remainder won't reach here.
  if (verseStart === 0) return { book, chapter, verseStart: 0, verseEnd: 0 };
  if (verseEnd < verseStart) verseEnd = verseStart;
  return clamp({ book, chapter, verseStart, verseEnd }, maxV);
}

function clamp(r: Reference, maxV: number): Reference | undefined {
  if (maxV && r.verseStart > maxV) return undefined;
  if (maxV && r.verseEnd > maxV) r.verseEnd = maxV;
  return r;
}

export function formatReference(r: Reference): string {
  if (r.verseStart === 0) return `${r.book.name} ${r.chapter}`;
  if (r.verseStart === r.verseEnd) return `${r.book.name} ${r.chapter}:${r.verseStart}`;
  return `${r.book.name} ${r.chapter}:${r.verseStart}-${r.verseEnd}`;
}

/** Expand a reference to a full verse range (whole chapter → 1..n). */
export function expandRange(r: Reference): { start: number; end: number } {
  if (r.verseStart === 0) return { start: 1, end: chapterVerseCount(r.book, r.chapter) };
  return { start: r.verseStart, end: r.verseEnd };
}

export function kjvVerses(r: Reference): { verse: number; text: string }[] {
  const { start, end } = expandRange(r);
  const ch = KJV[r.book.id][r.chapter - 1];
  const out: { verse: number; text: string }[] = [];
  for (let v = start; v <= end && v <= ch.length; v++) out.push({ verse: v, text: ch[v - 1] });
  return out;
}
