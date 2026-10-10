import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createSection } from "@/db/messages";
import { parseSectionCreate } from "@/lib/messageEdit";
import { gate } from "@/lib/sessionGate";

export const runtime = "nodejs";

/** POST { name, inService? } — admin. New sections go to the end. */
export async function POST(req: Request) {
  const s = await gate("Editing the message library needs the admin PIN");
  if (s instanceof NextResponse) return s;
  const parsed = parseSectionCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createSection(parsed);
  if (result === "duplicate") return NextResponse.json({ error: `There's already a section called "${parsed.name}" — choose another name` }, { status: 409 });
  return NextResponse.json({ ok: true, section: result });
}
