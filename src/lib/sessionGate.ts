import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isOpenMode, sessionFromToken, SESSION_COOKIE, type Session } from "./auth";
import { ensureSchema } from "@/db";
import { getBranch, type Branch } from "@/db/branches";

/** A session checked against the database, with the branch row that check loaded. */
export interface Verified extends Session {
  branch: Branch;
}

/**
 * This request's session, checked against the database: null when the cookie
 * holds none, its branch is gone, or the branch's PINs changed since it was
 * issued. Route handlers only: it reads the request's cookies and the db. Kept
 * out of auth.ts, which proxy.ts imports and which must stay free of both.
 */
export async function currentSession(): Promise<Verified | null> {
  const found = await sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!found) return null;
  // The branches table must exist first on a cold instance. Open mode reads it
  // too: ensureSchema always creates branch 1, which is the branch it serves.
  await ensureSchema();
  const branch = await getBranch(found.session.branchId);
  if (!branch) return null;
  if (!isOpenMode() && branch.pinVersion !== found.session.pinVersion) return null;
  return { ...found.session, branch };
}

/**
 * The verified session, or the response to return: 401 "locked" with no valid
 * session, or 403 with `adminDenied` when it is given and the role isn't admin.
 * Callers: `const s = await gate(DENIED); if (s instanceof NextResponse) return s;`
 */
export async function gate(adminDenied?: string): Promise<Verified | NextResponse> {
  const s = await currentSession();
  if (!s) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (adminDenied && s.role !== "admin") return NextResponse.json({ error: adminDenied }, { status: 403 });
  return s;
}
