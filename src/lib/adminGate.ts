import { cookies } from "next/headers";
import { isOpenMode, sessionFromToken, SESSION_COOKIE, type Session } from "./auth";
import { ensureSchema } from "@/db";
import { getBranch } from "@/db/branches";

/**
 * This request's session, checked against the database: null when the cookie
 * holds none, its branch is gone, or the branch's PINs changed since it was
 * issued. Route handlers only: it reads the request's cookies and the db. Kept
 * out of auth.ts, which proxy.ts imports and which must stay free of both.
 */
export async function currentSession(): Promise<Session | null> {
  const found = await sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!found) return null;
  if (isOpenMode()) return found.session;
  // Callers may check the session before touching the db themselves; the
  // branches table must exist first on a cold instance.
  await ensureSchema();
  const branch = await getBranch(found.session.branchId);
  if (!branch || branch.pinVersion !== found.session.pinVersion) return null;
  return found.session;
}

/** True when this request's session carries admin rights for its branch. */
export async function isAdmin(): Promise<boolean> {
  return (await currentSession())?.role === "admin";
}
