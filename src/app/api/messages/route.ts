import { NextResponse } from "next/server";
import { createMessage, loadLibrary } from "@/db/messages";
import { parseMessageCreate } from "@/lib/messageEdit";
import { gate } from "@/lib/sessionGate";

export const runtime = "nodejs";

const DENIED = "Editing the message library needs the admin PIN";

/** GET — the whole library. Church PIN: it is what the operator copies from. */
export async function GET() {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await loadLibrary(s.branch));
}

/** POST { sectionId, title, text, scope? } — admin. A blank line in text starts a new part. */
export async function POST(req: Request) {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;
  const parsed = parseMessageCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  const result = await createMessage(s.branchId, parsed);
  if (result === "no-section") return NextResponse.json({ error: "That section is gone — reload the page" }, { status: 400 });
  return NextResponse.json({ ok: true, message: result });
}
