import { NextResponse } from "next/server";
import { setBranchTokens } from "@/db/branches";
import { gate } from "@/lib/sessionGate";
import { cleanTokens } from "@/lib/branchTokens";

export const runtime = "nodejs";

const DENIED = "Changing branch settings needs the admin PIN";

/** PUT { tokens } — admin. Replaces every value of this device's branch at once. */
export async function PUT(req: Request) {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;

  const body = (await req.json().catch(() => null)) as { tokens?: unknown } | null;
  const tokens = cleanTokens(body?.tokens);
  if (typeof tokens === "string") return NextResponse.json({ error: tokens }, { status: 400 });

  const branch = await setBranchTokens(s.branchId, tokens);
  if (branch === "gone") return NextResponse.json({ error: "locked" }, { status: 401 });
  return NextResponse.json({ ok: true, branch: { id: branch.id, name: branch.name, tokens: branch.tokens } });
}
