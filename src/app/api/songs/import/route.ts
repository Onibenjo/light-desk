import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { parseVideoPsalmSongbook } from "@/lib/videopsalm";
import { readSongbookFile } from "@/lib/vpc";
import { diffSongbook, type StoredSong } from "@/lib/songbookDiff";
import { roleFromToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/songs/import — admin only. Body: the raw bytes of the VideoPsalm
 * export, either a .json file or a .vpc (a zip wrapping that same .json).
 *
 * With ?preview=1 it reports what the import would do and writes nothing; the
 * page then posts the same bytes again to commit. Both passes run the same
 * parse and the same diff, so the screen that was approved is what lands.
 *
 * Upserts by Guid: existing songs are updated, new ones added, nothing deleted.
 */
export async function POST(req: Request) {
  const role = await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (role !== "admin") return NextResponse.json({ error: "Admin PIN required to import" }, { status: 403 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > 20_000_000) return NextResponse.json({ error: "File too large" }, { status: 413 });
  let parsed;
  try {
    parsed = parseVideoPsalmSongbook(readSongbookFile(bytes));
  } catch (e) {
    return NextResponse.json({ error: `Could not read this file as a VideoPsalm songbook: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  await ensureSchema();
  // The whole book in one read: a select per song was 1,900 round trips, and
  // the preview cannot afford them at all.
  const existing = new Map<string, StoredSong>();
  for (const r of await db.select({ guid: songs.guid, title: songs.title, author: songs.author, sections: songs.sections }).from(songs)) {
    existing.set(r.guid, r);
  }
  const diff = diffSongbook(parsed.songs, existing);

  const summary = {
    totalEntries: parsed.totalEntries,
    skippedEmpty: parsed.skippedEmpty,
    collapsedDuplicates: parsed.collapsedDuplicates,
    repeatedGuids: diff.repeatedGuids,
    unchanged: diff.unchanged,
    added: diff.added.map((s) => s.title),
    updated: diff.updated.map((s) => s.title),
  };

  if (new URL(req.url).searchParams.get("preview") === "1") return NextResponse.json({ preview: true, ...summary });

  const now = new Date();
  for (const s of diff.added) {
    await db.insert(songs).values({ guid: s.guid, title: s.title, author: s.author ?? null, sections: JSON.stringify(s.sections), source: "videopsalm", createdAt: now, updatedAt: now });
  }
  for (const s of diff.updated) {
    await db.update(songs).set({ title: s.title, author: s.author ?? null, sections: JSON.stringify(s.sections), updatedAt: now }).where(eq(songs.guid, s.guid));
  }
  return NextResponse.json({ ok: true, ...summary });
}
