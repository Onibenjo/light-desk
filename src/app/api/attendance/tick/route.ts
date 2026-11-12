import { NextResponse } from "next/server";
import { cronSecretOk } from "@/lib/cronGate";
import { pollAttendance } from "@/lib/attendancePoll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/attendance/tick — one attendance round, for hosts with no
 * long-lived process to hold the timer (see src/instrumentation.ts). A
 * scheduler calls it every five minutes with CRON_SECRET. It is outside the
 * PIN gate (src/proxy.ts): a scheduler has no device to unlock.
 *
 * Calling it as well as the timer is harmless: a second reading in the same
 * five-minute slot is dropped by the database.
 */
export async function POST(req: Request) {
  if (!cronSecretOk(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return NextResponse.json({ ok: true, branches: await pollAttendance() });
}

/** Vercel Cron can only GET. */
export const GET = POST;
