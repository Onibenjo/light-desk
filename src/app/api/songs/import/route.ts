import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { parseVideoPsalmSongbook } from "@/lib/videopsalm";
import { roleFromToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/songs/import — admin only. Body: the raw VideoPsalm .json file.
 * Upserts by Guid: existing songs are updated, new ones added, nothing deleted.
 */
export async function POST(req: Request) {
  const role = await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (role !== "admin") return NextResponse.json({ error: "Admin PIN required to import" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 20_000_000) return NextResponse.json({ error: "File too large" }, { status: 413 });
  let parsed;
  try {
    parsed = parseVideoPsalmSongbook(raw);
  } catch (e) {
    return NextResponse.json({ error: `Could not read this file as a VideoPsalm songbook: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }
  await ensureSchema();
  const now = new Date();
  let added = 0;
  let updated = 0;
  for (const s of parsed.songs) {
    const sections = JSON.stringify(s.sections);
    const existing = await db.select({ id: songs.id, sections: songs.sections, title: songs.title }).from(songs).where(eq(songs.guid, s.guid));
    if (existing.length === 0) {
      await db.insert(songs).values({ guid: s.guid, title: s.title, author: s.author ?? null, sections, source: "videopsalm", createdAt: now, updatedAt: now });
      added++;
    } else if (existing[0].sections !== sections || existing[0].title !== s.title) {
      await db.update(songs).set({ title: s.title, author: s.author ?? null, sections, updatedAt: now }).where(eq(songs.guid, s.guid));
      updated++;
    }
  }
  return NextResponse.json({ ok: true, totalEntries: parsed.totalEntries, added, updated, unchanged: parsed.songs.length - added - updated, skippedEmpty: parsed.skippedEmpty, collapsedDuplicates: parsed.collapsedDuplicates });
}
