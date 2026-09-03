import { NextResponse } from "next/server";
import { and, desc, eq, gte, lt, or, sql, type Column, type SQL } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { sentLog } from "@/db/schema";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
// Enough to build the "days with entries" list for years of Sundays, while still
// bounding the response if this ever runs somewhere busier than one church desk.
const DAYS_SCAN_LIMIT = 5000;

export async function POST(req: Request) {
  await ensureSchema();
  const { kind, label, body, meta } = (await req.json().catch(() => ({}))) as { kind?: string; label?: string; body?: string; meta?: unknown };
  if (!kind || !label) return NextResponse.json({ error: "kind and label required" }, { status: 400 });
  await db.insert(sentLog).values({ kind, label, body: body ?? null, meta: meta ? JSON.stringify(meta) : null, createdAt: new Date() });
  return NextResponse.json({ ok: true });
}

/** Epoch seconds from a query param, or undefined if absent/junk. */
function epoch(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

export async function GET(req: Request) {
  await ensureSchema();
  const p = new URL(req.url).searchParams;

  // The caller works out the day boundaries in its own timezone and sends epoch
  // seconds, so the server never has to guess a timezone (and DST stays correct).
  const from = epoch(p.get("from"));
  const to = epoch(p.get("to"));
  const q = p.get("q")?.trim();
  const kind = p.get("kind")?.trim();

  // Day list for the date sidebar: raw timestamps, grouped into local days by the
  // client for the same reason — only it knows which day a UTC instant fell on.
  if (p.get("days")) {
    const rows = await db.select({ createdAt: sentLog.createdAt }).from(sentLog).orderBy(desc(sentLog.id)).limit(DAYS_SCAN_LIMIT);
    return NextResponse.json({ days: rows.map((r) => Math.floor(r.createdAt.getTime() / 1000)) });
  }

  const where: SQL[] = [];
  if (from !== undefined) where.push(gte(sentLog.createdAt, new Date(from * 1000)));
  if (to !== undefined) where.push(lt(sentLog.createdAt, new Date(to * 1000)));
  if (kind && kind !== "all") where.push(eq(sentLog.kind, kind));
  if (q) {
    // SQLite LIKE is already case-insensitive for ASCII. Searches body as well as
    // label, so a verse is findable by its words and not only by its reference.
    // The ESCAPE clause is spelled out because drizzle's like() omits it, which
    // would leave a search for "100%" hunting for a literal backslash.
    const needle = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const hit = (col: Column) => sql`${col} LIKE ${needle} ESCAPE '\\'`;
    where.push(or(hit(sentLog.label), hit(sentLog.body))!);
  }

  const limit = Math.min(epoch(p.get("limit")) ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await db
    .select()
    .from(sentLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sentLog.id))
    .limit(limit);
  return NextResponse.json({ rows });
}
