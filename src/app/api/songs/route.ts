import { NextResponse } from "next/server";
import { and, like, or, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { loadSongs } from "@/db/songs";
import { songs } from "@/db/schema";
import { buildIndex, searchSongs, tokenize } from "@/lib/songSearch";

export const runtime = "nodejs";

/** Enough rows for the scorer to rank properly without reading the whole book. */
const CANDIDATES = 300;
const THIN = 5;

/**
 * GET /api/songs?q=army — the search for the moment before the client has its
 * own copy of the songbook. SQL narrows the field and songSearch ranks what
 * comes back, so the results are shaped and ordered like the local ones.
 *
 * It is not identical to them, and can't be: LIKE matches the stored text, so
 * it can't fold the diacritics of "Ọlọrun", can't reach "god" from "gods", and
 * can't see through a misspelling. This is a stopgap measured in seconds, and
 * the local search behind it has none of those limits.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const words = q ? tokenize(q) : [];
  if (!words.length) return NextResponse.json({ songs: [], total: await count() });

  const pattern = (w: string) => `%${w.replace(/[%_]/g, " ")}%`;
  const perWord = words.map((w) => or(like(songs.title, pattern(w)), like(songs.sections, pattern(w))));

  // Every word first, which is precise and usually enough; only widen to "any
  // word" when that came back thin, so a common word can't flood the candidates.
  let rows = await loadSongs(and(...perWord), CANDIDATES);
  if (rows.length < THIN && words.length > 1) rows = await loadSongs(or(...perWord), CANDIDATES);

  return NextResponse.json({ songs: searchSongs(buildIndex(rows), q), total: await count() });
}

async function count(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(songs);
  return n;
}
