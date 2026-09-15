import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createSection } from "@/db/messages";
import { parseSectionCreate } from "@/lib/messageEdit";
import { isAdmin } from "@/lib/adminGate";

export const runtime = "nodejs";

/** POST { name, inService? } — admin. New sections go to the end. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Editing the message library needs the admin PIN" }, { status: 403 });
  const parsed = parseSectionCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const result = await createSection(parsed);
  if (result === "duplicate") return NextResponse.json({ error: `There's already a section called "${parsed.name}" — choose another name` }, { status: 409 });
  return NextResponse.json({ ok: true, section: result });
}
