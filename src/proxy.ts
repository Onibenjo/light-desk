import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { roleFromToken, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/unlock" || pathname.startsWith("/api/unlock")) return NextResponse.next();

  const role = await roleFromToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (role) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js).*)"],
};
