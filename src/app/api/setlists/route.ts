import { NextResponse } from "next/server";
import { createSetlist, loadSetlists } from "@/db/setlists";
import { gate } from "@/lib/sessionGate";
import { parseSetlistCreate } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/**
 * The setlists. Church PIN, not admin: a setlist touches no song, and a late
 * addition two minutes before a service must not need the admin PIN.
 */
export async function GET() {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ setlists: await loadSetlists(s.branchId) });
}

/** POST { name } — a new, empty, inactive setlist. */
export async function POST(req: Request) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const parsed = parseSetlistCreate(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  return NextResponse.json({ ok: true, setlist: await createSetlist(s.branchId, parsed.name) });
}
