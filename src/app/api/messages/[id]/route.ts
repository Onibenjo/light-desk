import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteMessage, updateMessage } from "@/db/messages";
import { parseMessagePatch } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit the message library";
const MISSING = "No such message";

/** Route params arrive as a promise in this version of Next. */
async function messageId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** PATCH { sectionId?, title?, text?, move? } — admin. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await messageId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  const parsed = parseMessagePatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateMessage(id, parsed);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "no-section") return NextResponse.json({ error: "No such section" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}

/**
 * DELETE — admin. A setlist that already holds this message keeps its row: with
 * edited text it still copies, without it the row greys out (src/lib/setlist.ts).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await messageId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  await ensureSchema();
  if (!(await deleteMessage(id))) return NextResponse.json({ error: MISSING }, { status: 404 });
  return NextResponse.json({ ok: true });
}
