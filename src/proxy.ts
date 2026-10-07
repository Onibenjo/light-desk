import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromToken, signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/unlock" || pathname.startsWith("/api/unlock")) return NextResponse.next();

  const found = await sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (found) {
    const res = NextResponse.next();
    // A cookie from before branches: swap it for a signed branch-1 session so
    // the device stays unlocked once the legacy path is gone.
    if (found.legacy) res.cookies.set(SESSION_COOKIE, await signSession(found.session), SESSION_COOKIE_OPTIONS);
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|brand/|sw.js).*)"],
};
