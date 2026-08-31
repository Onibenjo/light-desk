import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { sentLog } from "@/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureSchema();
  const { kind, label, body, meta } = (await req.json().catch(() => ({}))) as { kind?: string; label?: string; body?: string; meta?: unknown };
  if (!kind || !label) return NextResponse.json({ error: "kind and label required" }, { status: 400 });
  await db.insert(sentLog).values({ kind, label, body: body ?? null, meta: meta ? JSON.stringify(meta) : null, createdAt: new Date() });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(sentLog).orderBy(desc(sentLog.id)).limit(50);
  return NextResponse.json({ rows });
}
