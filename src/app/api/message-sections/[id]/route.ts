import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { deleteSection, updateSection } from "@/db/messages";
import { parseSectionPatch } from "@/lib/messageEdit";
import { currentSession, isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Editing the message library needs the admin PIN";
const MISSING = "That section is gone — reload the page";

/** Route params arrive as a promise in this version of Next. */
async function sectionId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH { name?, inService?, move? } — admin. Switching a section out of
 * service does not touch setlists already holding its messages; the rule only
 * applies to new additions.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await sectionId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  const parsed = parseSectionPatch(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await updateSection(id, parsed);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "duplicate") return NextResponse.json({ error: `There's already a section called "${parsed.name}" — choose another name` }, { status: 409 });
  return NextResponse.json({ ok: true, section: result });
}

/** DELETE — admin, and only an empty section. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await sectionId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });

  await ensureSchema();
  const result = await deleteSection(id, session.branchId);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "not-empty-elsewhere") return NextResponse.json({ error: "Other branches still have messages in this section, so it can't be deleted" }, { status: 409 });
  if (result === "not-empty") return NextResponse.json({ error: "Move or delete this section's messages first" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
