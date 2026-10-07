import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { createBranch, listBranches } from "@/db/branches";
import { NAME_TAKEN, parseBranchCreate, PIN_TAKEN, WRONG_NETWORK_PIN } from "@/lib/branchInput";
import { networkPinOk } from "@/lib/networkGate";

export const runtime = "nodejs";

/**
 * The network's branches. Past the device lock on purpose (src/proxy.ts): the
 * network PIN in the x-network-pin header is the only gate, and it is never a
 * cookie, so nobody stays signed in to this.
 */
export async function GET(req: Request) {
  await ensureSchema();
  if (!networkPinOk(req)) return NextResponse.json({ error: WRONG_NETWORK_PIN }, { status: 401 });
  const branches = await listBranches();
  return NextResponse.json({ branches: branches.map((b) => ({ id: b.id, name: b.name })) });
}

/** POST { name, churchPin, adminPin? } — a new branch with an empty set of values. */
export async function POST(req: Request) {
  await ensureSchema();
  if (!networkPinOk(req)) return NextResponse.json({ error: WRONG_NETWORK_PIN }, { status: 401 });
  const parsed = parseBranchCreate(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createBranch(parsed);
  if (result === "pin-taken") return NextResponse.json({ error: PIN_TAKEN }, { status: 409 });
  if (result === "name-taken") return NextResponse.json({ error: NAME_TAKEN }, { status: 409 });
  return NextResponse.json({ ok: true, branch: { id: result.id, name: result.name } });
}
