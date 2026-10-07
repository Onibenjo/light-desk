import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { getBranch, setBranchTokens } from "@/db/branches";
import { currentSession } from "@/lib/adminGate";
import { cleanTokens } from "@/lib/branchTokens";

export const runtime = "nodejs";

const DENIED = "Changing branch settings needs the admin PIN";

/** GET — this device's branch: its name and the values filled into shared messages. Any PIN. */
export async function GET() {
  await ensureSchema();
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "locked" }, { status: 401 });
  const branch = await getBranch(session.branchId);
  if (!branch) return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.json({ id: branch.id, name: branch.name, tokens: branch.tokens });
}

/** PUT { tokens } — admin. Replaces every value of this device's branch at once. */
export async function PUT(req: Request) {
  await ensureSchema();
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: DENIED }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { tokens?: unknown } | null;
  const tokens = cleanTokens(body?.tokens);
  if (typeof tokens === "string") return NextResponse.json({ error: tokens }, { status: 400 });

  const branch = await setBranchTokens(session.branchId, tokens);
  if (branch === "gone") return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.json({ ok: true, branch: { id: branch.id, name: branch.name, tokens: branch.tokens } });
}
