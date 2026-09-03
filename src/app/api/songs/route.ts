import { NextResponse } from "next/server";
import { and, like, or, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";

export const runtime = "nodejs";

/** GET /api/songs?q=army — title matches first, then lyrics matches. Empty q = none. */
export async function GET(req: Request) {
  await ensureSchema();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ songs: [], total: await count() });
  // Every word must appear somewhere in the title or lyrics, so a phrase that
  // spans a line break ("final it is written") still finds its song.
  const words = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const clauses = words.map((w) => {
    const pat = `%${w.replace(/[%_]/g, " ")}%`;
    return or(like(songs.title, pat), like(songs.sections, pat));
  });
  const rows = await db
    .select({ id: songs.id, title: songs.title, author: songs.author, sections: songs.sections, source: songs.source })
    .from(songs)
    .where(and(...clauses))
    .limit(30);
  const ql = q.toLowerCase();
  rows.sort((a, b) => Number(b.title.toLowerCase().includes(ql)) - Number(a.title.toLowerCase().includes(ql)) || a.title.localeCompare(b.title));
  return NextResponse.json({
    songs: rows.slice(0, 20).map((r) => ({ ...r, sections: JSON.parse(r.sections) as string[] })),
    total: await count(),
  });
}

async function count(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(songs);
  return n;
}
