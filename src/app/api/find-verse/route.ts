import { NextResponse } from "next/server";
import { findVerseCandidates } from "@/lib/findVerse";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** POST { description } → { candidates: [{ label, why, ref }] } */
export async function POST(req: Request) {
  if (!rateLimit(`find:${clientKey(req)}`, 30, 60_000) || !rateLimit("find:global", 300, 3_600_000)) {
    return NextResponse.json({ error: "Slow down — too many searches." }, { status: 429 });
  }
  const { description } = (await req.json().catch(() => ({}))) as { description?: string };
  if (!description?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  const started = Date.now();
  try {
    const candidates = await findVerseCandidates(description.trim());
    return NextResponse.json({
      ms: Date.now() - started,
      candidates: candidates.map((c) => ({
        label: c.label,
        why: c.why,
        ref: { book: c.reference.book.id, chapter: c.reference.chapter, verseStart: c.reference.verseStart, verseEnd: c.reference.verseEnd },
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 502 });
  }
}
