import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/warm — the cheapest query that proves the database is awake.
 *
 * On Turso an idle database suspends, and this desk is used for a few hours
 * twice a week, so it would be cold every single time. The desk pings this on
 * load, minutes before anyone is waiting on a lookup, so the wake-up happens
 * while the operator is still finding their place rather than mid-service.
 */
export async function GET() {
  const started = Date.now();
  try {
    await ensureSchema();
    await db.get(sql`SELECT 1`);
    return NextResponse.json({ ok: true, ms: Date.now() - started });
  } catch (e) {
    // Never surface as a failure: the desk works from cache either way, and a
    // red error on load would be more alarming than useful.
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: String(e) });
  }
}
