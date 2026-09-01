import * as cheerio from "cheerio";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { verseCache } from "@/db/schema";
import { Reference, expandRange, formatReference, kjvVerses } from "./reference";
import { Translation, applyEnvOverrides, findTranslation, DEFAULT_TRANSLATION } from "./translations";
import { Passage, Verse, cleanVerseText } from "./format";
import { complete } from "./llm";

export class SourceError extends Error {}

type Fetched = { verses: Verse[]; source: Passage["source"] };

/**
 * Resolve a reference to text. Order: bundled KJV → DB cache → YouVersion →
 * API.Bible → BibleGateway (last resort, see README). Whatever is fetched is
 * cached so the same verse never leaves the building twice.
 */
export async function getPassage(ref: Reference, translationCode?: string): Promise<Passage> {
  applyEnvOverrides();
  const t = ref.translation ?? findTranslation(translationCode) ?? findTranslation(DEFAULT_TRANSLATION)!;
  const reference = formatReference(ref);

  if (t.local) {
    return { reference, translationCode: t.code, translationName: t.name, verses: kjvVerses(ref), source: "local" };
  }

  await ensureSchema();
  const { start, end } = expandRange(ref);
  const cached = await db
    .select()
    .from(verseCache)
    .where(and(eq(verseCache.translation, t.code), eq(verseCache.book, ref.book.id), eq(verseCache.chapter, ref.chapter), gte(verseCache.verse, start), lte(verseCache.verse, end)));
  if (cached.length === end - start + 1) {
    return {
      reference,
      translationCode: t.code,
      translationName: t.name,
      verses: cached.sort((a, b) => a.verse - b.verse).map((r) => ({ verse: r.verse, text: r.text })),
      source: "cache",
    };
  }

  const errors: string[] = [];
  const attempts: (() => Promise<Fetched>)[] = [
    () => fromYouVersion(ref, t),
    () => fromApiBible(ref, t),
    () => fromBibleGateway(ref, t),
    () => fromLLM(ref, t), // last-last resort: AI-quoted, flagged in the UI, never cached
  ];
  for (const attempt of attempts) {
    try {
      const got = await attempt();
      if (got.verses.length === 0) throw new SourceError("empty result");
      if (got.source !== "llm") {
        const now = new Date();
        await db
          .insert(verseCache)
          .values(got.verses.map((v) => ({ translation: t.code, book: ref.book.id, chapter: ref.chapter, verse: v.verse, text: v.text, source: got.source, fetchedAt: now })))
          .onConflictDoNothing();
      }
      if (errors.length) console.warn(`[lightdesk] ${reference} ${t.code} served by ${got.source} after: ${errors.join(" | ")}`);
      return { reference, translationCode: t.code, translationName: t.name, verses: got.verses, source: got.source, attempts: errors };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new SourceError(`No source could supply ${reference} (${t.code}): ${errors.join(" | ")}`);
}

// ---------- YouVersion Platform ----------
// Docs: https://developers.youversion.com — header X-YVP-App-Key, plain text via format=text.
async function fromYouVersion(ref: Reference, t: Translation): Promise<Fetched> {
  const key = process.env.YOUVERSION_APP_KEY;
  if (!key) throw new SourceError("youversion: no key");
  if (!t.youversionId) throw new SourceError(`youversion: no version id for ${t.code}`);
  const { start, end } = expandRange(ref);
  const usfm = `${ref.book.usfm}.${ref.chapter}.${start}${end > start ? `-${end}` : ""}`;
  const url = `https://api.youversion.com/v1/bibles/${t.youversionId}/passages/${usfm}?format=text`;
  const res = await fetch(url, { headers: { "X-YVP-App-Key": key, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new SourceError(`youversion: HTTP ${res.status}`);
  const data = (await res.json()) as { content?: string; text?: string; verses?: { verse?: number; number?: number; content?: string; text?: string }[] };
  if (Array.isArray(data.verses) && data.verses.length) {
    return {
      source: "youversion",
      verses: data.verses.map((v, i) => ({ verse: v.verse ?? v.number ?? start + i, text: cleanVerseText(v.content ?? v.text ?? "") })),
    };
  }
  const blob = data.content ?? data.text ?? "";
  return { source: "youversion", verses: splitNumberedBlob(blob, start, end) };
}

// ---------- API.Bible ----------
// Docs: https://docs.api.bible — header api-key, /v1/bibles/{id}/passages/{ROM.8.28-ROM.8.30}
async function fromApiBible(ref: Reference, t: Translation): Promise<Fetched> {
  const key = process.env.APIBIBLE_KEY;
  if (!key) throw new SourceError("apibible: no key");
  if (!t.apiBibleId) throw new SourceError(`apibible: no bible id for ${t.code}`);
  const { start, end } = expandRange(ref);
  const id = `${ref.book.usfm}.${ref.chapter}.${start}${end > start ? `-${ref.book.usfm}.${ref.chapter}.${end}` : ""}`;
  const url = `https://api.scripture.api.bible/v1/bibles/${t.apiBibleId}/passages/${id}?content-type=text&include-verse-numbers=true&include-notes=false&include-titles=false&include-chapter-numbers=false`;
  const res = await fetch(url, { headers: { "api-key": key }, cache: "no-store" });
  if (!res.ok) throw new SourceError(`apibible: HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { content?: string } };
  return { source: "apibible", verses: splitNumberedBlob(data.data?.content ?? "", start, end) };
}

// ---------- BibleGateway (last resort) ----------
// URL shape the volunteers already use: /passage/?search=exo%2014.13-16&version=NLT
// Not an API; markup can change without notice. Everything it returns is cached.
async function fromBibleGateway(ref: Reference, t: Translation): Promise<Fetched> {
  if (process.env.DISABLE_GATEWAY_FALLBACK === "1") throw new SourceError("gateway: disabled");
  const { start, end } = expandRange(ref);
  // Full book name: BibleGateway does not understand USFM codes like "jhn" or "php".
  const search = encodeURIComponent(`${ref.book.name} ${ref.chapter}:${start}${end > start ? `-${end}` : ""}`);
  const url = `https://www.biblegateway.com/passage/?search=${search}&version=${t.gatewayCode}&interface=print`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new SourceError(`gateway: HTTP ${res.status}`);
  const html = await res.text();
  return { source: "gateway", verses: parseGatewayHtml(html, start, end) };
}

/** Exported for tests. Pulls verse text out of a BibleGateway passage page. */
export function parseGatewayHtml(html: string, start: number, end: number): Verse[] {
  const $ = cheerio.load(html);
  const passage = $(".passage-text").first();
  if (!passage.length) {
    const title = $("title").text().trim().slice(0, 60);
    throw new SourceError(`gateway: passage block not found (page title: "${title}")`);
  }
  passage.find("sup.footnote, sup.crossreference, .footnotes, .crossrefs, h1, h3, h4, .chapternum, .full-chap-link, .passage-other-trans, .publisher-info-bottom").remove();

  // Each verse's words are in spans with class "text Book-Ch-V"; the verse number sits in sup.versenum.
  const byVerse = new Map<number, string[]>();
  passage.find("span.text").each((_, el) => {
    const cls = $(el).attr("class") ?? "";
    const m = cls.match(/(?:^|\s)[A-Za-z0-9]+-(\d+)-(\d+)(?:\s|$)/);
    if (!m) return;
    const v = parseInt(m[2], 10);
    const clone = $(el).clone();
    clone.find("sup.versenum, span.chapternum").remove();
    const txt = clone.text();
    if (!byVerse.has(v)) byVerse.set(v, []);
    byVerse.get(v)!.push(txt);
  });
  const verses: Verse[] = [];
  for (let v = start; v <= end; v++) {
    const parts = byVerse.get(v);
    if (parts) verses.push({ verse: v, text: cleanVerseText(parts.join(" ")) });
  }
  if (!verses.length) throw new SourceError("gateway: no verses parsed");
  return verses;
}

// ---------- LLM quote (last-last resort) ----------
// Only reached when every real source failed on an uncached verse. The model
// recites the verse from memory, which is USUALLY right and sometimes subtly
// wrong. So the result is flagged as source "llm", the UI refuses to
// auto-copy it, and it is never written to the cache. Set
// DISABLE_LLM_FALLBACK=1 to turn it off.
async function fromLLM(ref: Reference, t: Translation): Promise<Fetched> {
  if (process.env.DISABLE_LLM_FALLBACK === "1") throw new SourceError("llm: disabled");
  const { start, end } = expandRange(ref);
  if (end - start > 9) throw new SourceError("llm: range too long to trust");
  const raw = await complete({
    system:
      'You quote Bible verses verbatim. Reply with JSON only: an array of objects {"v": <verse number>, "text": "exact verse text"} ' +
      "for the requested verses in the requested translation, no verse numbers inside the text, no notes. " +
      'If you are not confident you know the exact wording in that translation, reply with the JSON string "unsure".',
    user: `${ref.book.name} ${ref.chapter}:${start}${end > start ? `-${end}` : ""} in the ${t.name} (${t.code})`,
    maxTokens: 1200,
  });
  if (raw.includes('"unsure"')) throw new SourceError("llm: model unsure");
  const json = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
  let items: { v?: number; text?: string }[];
  try {
    items = JSON.parse(json);
  } catch {
    throw new SourceError("llm: unreadable reply");
  }
  const verses: Verse[] = [];
  for (let v = start; v <= end; v++) {
    const it = items.find((i) => i.v === v);
    if (!it?.text) throw new SourceError("llm: incomplete range");
    verses.push({ verse: v, text: cleanVerseText(it.text) });
  }
  return { source: "llm", verses };
}

/** "28 And we know … 29 For whom …" → per-verse entries. Tolerates [28] and 28. styles. */
export function splitNumberedBlob(blob: string, start: number, end: number): Verse[] {
  const text = blob.replace(/\s+/g, " ").trim();
  const verses: Verse[] = [];
  if (!text) return verses;
  if (start === end) return [{ verse: start, text: cleanVerseText(text.replace(new RegExp(`^\\[?${start}\\]?\\.?\\s*`), "")) }];
  // Find positions of each expected verse number, in order.
  let cursor = 0;
  const positions: { verse: number; index: number; len: number }[] = [];
  for (let v = start; v <= end; v++) {
    const re = new RegExp(`(?:^|\\s|\\[)${v}(?:\\]|\\.)?\\s`, "g");
    re.lastIndex = cursor;
    const m = re.exec(text);
    if (!m) break;
    positions.push({ verse: v, index: m.index, len: m[0].length });
    cursor = m.index + m[0].length;
  }
  if (!positions.length) return [{ verse: start, text: cleanVerseText(text) }];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const from = p.index + p.len;
    const to = i + 1 < positions.length ? positions[i + 1].index : text.length;
    verses.push({ verse: p.verse, text: cleanVerseText(text.slice(from, to)) });
  }
  return verses;
}
