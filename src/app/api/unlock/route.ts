import { NextResponse } from "next/server";
import { checkPin, sessionTokenFor, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (!rateLimit(`unlock:${clientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts, wait a minute." }, { status: 429 });
  }
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  const role = await checkPin(String(pin ?? ""));
  if (!role) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
