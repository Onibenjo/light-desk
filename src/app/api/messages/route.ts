import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createMessage, loadLibrary } from "@/db/messages";
import { parseMessageCreate } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit the message library";

/** GET — the whole library. Church PIN: it is what the operator copies from. */
export async function GET() {
  await ensureSchema();
  return NextResponse.json(await loadLibrary());
}

/** POST { sectionId, title, text } — admin. A blank line in text starts a new part. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const parsed = parseMessageCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createMessage(parsed);
  if (result === "no-section") return NextResponse.json({ error: "No such section" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}
