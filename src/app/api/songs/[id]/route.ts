import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { parseSongEdit } from "@/lib/songEdit";
import { roleFromToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit songs";

async function admin(): Promise<boolean> {
  return (await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value)) === "admin";
}

/** Route params arrive as a promise in this version of Next. */
async function songId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH /api/songs/:id — admin only. Body: { title, author, lyrics }, where
 * lyrics is the textarea with a blank line between sections. Stamps edited_at,
 * which is what keeps a songbook re-import from writing over the correction.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await admin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await songId(params);
  if (id === null) return NextResponse.json({ error: "No such song" }, { status: 404 });

  const parsed = parseSongEdit(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const now = new Date();
  const [row] = await db
    .update(songs)
    .set({ title: parsed.title, author: parsed.author, sections: JSON.stringify(parsed.sections), updatedAt: now, editedAt: now })
    .where(eq(songs.id, id))
    .returning({ id: songs.id, guid: songs.guid, source: songs.source });
  if (!row) return NextResponse.json({ error: "No such song" }, { status: 404 });

  return NextResponse.json({ ok: true, song: { ...row, title: parsed.title, author: parsed.author, sections: parsed.sections } });
}

/** DELETE /api/songs/:id — admin only. A songbook song comes back on the next import. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await admin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await songId(params);
  if (id === null) return NextResponse.json({ error: "No such song" }, { status: 404 });

  await ensureSchema();
  const [row] = await db.delete(songs).where(eq(songs.id, id)).returning({ id: songs.id });
  if (!row) return NextResponse.json({ error: "No such song" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
