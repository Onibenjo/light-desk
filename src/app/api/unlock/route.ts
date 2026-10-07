import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { findBranchByPin, getBranch } from "@/db/branches";
import { isOpenMode, signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { cleanPin } from "@/lib/pinHash";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** POST /api/unlock — body { pin }. The PIN decides both the branch and the role. */
export async function POST(req: Request) {
  if (!rateLimit(`unlock:${clientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts — wait a minute and try again" }, { status: 429 });
  }
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: unknown };
  if (isOpenMode()) {
    // Local dev with no PINs: everything is already open as branch 1's admin.
    await ensureSchema();
    return NextResponse.json({ ok: true, role: "admin", branch: (await getBranch(1))?.name ?? "" });
  }
  const cleaned = cleanPin(pin);
  if (!cleaned) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  await ensureSchema();
  const found = await findBranchByPin(cleaned);
  if (!found) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  const { branch, role } = found;
  let token: string;
  try {
    token = await signSession({ branchId: branch.id, role, pinVersion: branch.pinVersion });
  } catch (e) {
    console.error("unlock: cannot sign a session", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "This desk isn't set up to unlock yet — ask whoever runs it to set SESSION_SECRET" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, role, branch: branch.name });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return res;
}
