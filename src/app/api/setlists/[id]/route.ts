import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteSetlist, findSetlist, updateSetlist } from "@/db/setlists";
import { parseSetlistPatch } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/** Route params arrive as a promise in this version of Next. */
async function setlistId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH /api/setlists/:id — { name?, items?, active?, updatedAt }.
 *
 * A change to `items` replaces the whole array, so it must say which version it
 * started from. If someone else has changed the setlist since, the answer is a
 * 409 carrying the setlist as it now stands, and the client re-applies its own
 * single addition to that.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await setlistId(params);
  if (id === null) return NextResponse.json({ error: "No such setlist" }, { status: 404 });

  const parsed = parseSetlistPatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateSetlist(id, parsed);
  if (result === "gone") return NextResponse.json({ error: "No such setlist" }, { status: 404 });
  if (result === "stale") {
    return NextResponse.json({ error: "Someone else changed this setlist", setlist: await findSetlist(id) }, { status: 409 });
  }
  return NextResponse.json({ ok: true, setlist: result });
}

/** DELETE /api/setlists/:id. If it was the active one, nothing is promoted in its place. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await setlistId(params);
  if (id === null) return NextResponse.json({ error: "No such setlist" }, { status: 404 });

  await ensureSchema();
  if (!(await deleteSetlist(id))) return NextResponse.json({ error: "No such setlist" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
