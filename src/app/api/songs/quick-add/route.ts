import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { complete } from "@/lib/llm";
import { cleanSlideText } from "@/lib/videopsalm";
import { sectionsFromLyrics } from "@/lib/songSections";
import { needsLlm, sectionsFromLlmReply } from "@/lib/quickAdd";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * POST { title, lyrics } — for a song that is not in the songbook. The blank
 * lines in what was pasted are the spacing the song was written with, so they
 * are used as they are; the model is only asked about a paste that has none.
 * Saved as source "manual" so it is reusable and editable.
 */
export async function POST(req: Request) {
  if (!rateLimit(`qa:${clientKey(req)}`, 10, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  const { title, lyrics } = (await req.json().catch(() => ({}))) as { title?: string; lyrics?: string };
  if (!title?.trim() || !lyrics?.trim()) return NextResponse.json({ error: "Title and lyrics are required" }, { status: 400 });

  const cleaned = cleanSlideText(lyrics);
  let sections: string[] | null = null;
  if (needsLlm(cleaned)) {
    try {
      const out = await complete({
        system:
          "Split pasted song lyrics into singable sections for a church livestream chat, following the verse/chorus structure. NEVER invent, reword, reorder or drop words — only decide where the breaks go. Reply with JSON only: an array of strings, each string one section with \\n between its lines.",
        user: cleaned.slice(0, 6000),
        maxTokens: 2000,
      });
      sections = sectionsFromLlmReply(out);
    } catch {
      // No key, or the model was unreachable. The mechanical split still works.
    }
  }
  if (!sections) sections = sectionsFromLyrics(cleaned);
  if (sections.length === 0) return NextResponse.json({ error: "No lyric lines found" }, { status: 400 });

  await ensureSchema();
  const now = new Date();
  const guid = `manual:${now.getTime()}`;
  const cleanTitle = cleanSlideText(title).replace(/\n+/g, " ");
  const [row] = await db
    .insert(songs)
    .values({ guid, title: cleanTitle, author: null, sections: JSON.stringify(sections), source: "manual", createdAt: now, updatedAt: now })
    .returning({ id: songs.id });
  return NextResponse.json({ ok: true, song: { id: row.id, guid, title: cleanTitle, sections, source: "manual" } });
}
