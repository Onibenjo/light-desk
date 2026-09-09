import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createSetlist, loadSetlists } from "@/db/setlists";
import { parseSetlistCreate } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/**
 * The setlists. Church PIN, not admin: a setlist touches no song, and a late
 * addition two minutes before a service must not need the admin PIN.
 */
export async function GET() {
  await ensureSchema();
  return NextResponse.json({ setlists: await loadSetlists() });
}

/** POST { name } — a new, empty, inactive setlist. */
export async function POST(req: Request) {
  const parsed = parseSetlistCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  return NextResponse.json({ ok: true, setlist: await createSetlist(parsed.name) });
}
