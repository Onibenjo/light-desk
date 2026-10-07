import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createMessage, loadLibrary } from "@/db/messages";
import { parseMessageCreate } from "@/lib/messageEdit";
import { getBranch } from "@/db/branches";
import { currentSession, isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

const DENIED = "Editing the message library needs the admin PIN";

/** GET — the whole library. Church PIN: it is what the operator copies from. */
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "locked" }, { status: 401 });
  const branch = await getBranch(session.branchId);
  if (!branch) return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.json(await loadLibrary(branch));
}

/** POST { sectionId, title, text, scope? } — admin. A blank line in text starts a new part. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "locked" }, { status: 401 });
  const parsed = parseMessageCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createMessage(session.branchId, parsed);
  if (result === "no-section") return NextResponse.json({ error: "That section is gone — reload the page" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}
