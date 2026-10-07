import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { updateBranch } from "@/db/branches";
import { NAME_TAKEN, parseBranchPatch, PIN_TAKEN, WRONG_NETWORK_PIN } from "@/lib/branchInput";
import { networkPinOk } from "@/lib/networkGate";

export const runtime = "nodejs";

const MISSING = "That branch is gone — reload the page";

/** Route params arrive as a promise in this version of Next. */
async function branchId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH { name?, churchPin?, adminPin? } — network PIN. A changed PIN locks
 * every device of that branch until it unlocks with the new one.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  if (!networkPinOk(req)) return NextResponse.json({ error: WRONG_NETWORK_PIN }, { status: 401 });
  const id = await branchId(params);
  if (id === null) return NextResponse.json({ error: MISSING }, { status: 404 });
  const parsed = parseBranchPatch(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateBranch(id, parsed);
  if (result === "gone") return NextResponse.json({ error: MISSING }, { status: 404 });
  if (result === "pin-taken") return NextResponse.json({ error: PIN_TAKEN }, { status: 409 });
  if (result === "name-taken") return NextResponse.json({ error: NAME_TAKEN }, { status: 409 });
  return NextResponse.json({ ok: true, branch: { id: result.id, name: result.name } });
}
