import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { complete } from "@/lib/llm";
import { cleanSlideText } from "@/lib/videopsalm";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * POST { title, lyrics } — for an impromptu song not in the songbook. The LLM
 * only splits/cleans what was pasted; with no key (or on failure) we fall back
 * to splitting on blank lines. Saved as source "manual" so it's reusable.
 */
export async function POST(req: Request) {
  if (!rateLimit(`qa:${clientKey(req)}`, 10, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  const { title, lyrics } = (await req.json().catch(() => ({}))) as { title?: string; lyrics?: string };
  if (!title?.trim() || !lyrics?.trim()) return NextResponse.json({ error: "Title and lyrics are required" }, { status: 400 });

  let sections: string[] | null = null;
  try {
    const out = await complete({
      system:
        'Split pasted song lyrics into singable sections for a church livestream chat (4-6 lines each, following verse/chorus structure when visible). Fix casing and obvious duplication artifacts but NEVER invent or reorder words. Reply with JSON only: an array of strings, each string one section with \\n between its lines.',
      user: lyrics.slice(0, 6000),
      maxTokens: 2000,
    });
    const arr = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1)) as string[];
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string") && arr.length > 0) sections = arr.map(cleanSlideText).filter(Boolean);
  } catch {
    // fall through to the mechanical split
  }
  if (!sections || sections.length === 0) {
    sections = cleanSlideText(lyrics)
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (sections.length === 0) return NextResponse.json({ error: "No lyric lines found" }, { status: 400 });

  await ensureSchema();
  const now = new Date();
  const guid = `manual:${now.getTime()}`;
  await db.insert(songs).values({ guid, title: cleanSlideText(title).replace(/\n+/g, " "), author: null, sections: JSON.stringify(sections), source: "manual", createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, song: { guid, title, sections } });
}
