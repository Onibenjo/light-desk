import { cookies } from "next/headers";
import { roleFromToken, SESSION_COOKIE } from "./auth";

/**
 * True when this request's session carries the admin PIN. Route handlers only:
 * it reads the request's cookies. Kept out of auth.ts, which proxy.ts imports
 * and which must stay free of next/headers.
 */
export async function isAdmin(): Promise<boolean> {
  return (await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value)) === "admin";
}
