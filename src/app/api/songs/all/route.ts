import { NextResponse } from "next/server";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { loadSongs } from "@/db/songs";

export const runtime = "nodejs";

/** 323KB in 100ms, against 295KB in 1.8s at the top level. Paid once per change. */
const BROTLI_QUALITY = 9;

/** The songbook compresses ~4x, and only has to be built once per change. Keyed
 *  by encoding too, so a gzip-only client can't evict the brotli everyone else gets. */
const cached = new Map<string, Buffer>();

/**
 * GET /api/songs/all — the whole songbook in one response, so searching a
 * remembered lyric happens on the device instead of over the venue's wifi.
 *
 * It is compressed here rather than left to the server in front, which in this
 * deployment does not compress it at all: 1.4MB on church wifi is the problem
 * this endpoint exists to avoid. The ETag turns every later load into a 304, so
 * the whole thing is paid for once.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const [{ n, updated }] = await db
    .select({ n: sql<number>`count(*)`, updated: sql<number>`coalesce(max(updated_at), 0)` })
    .from(songs);

  const etag = `W/"${n}-${updated}"`;
  const headers: Record<string, string> = { ETag: etag, "Cache-Control": "private, no-cache", Vary: "Accept-Encoding" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const accepts = req.headers.get("accept-encoding") ?? "";
  const encoding = accepts.includes("br") ? "br" : accepts.includes("gzip") ? "gzip" : "identity";

  const key = `${etag}:${encoding}`;
  if (!cached.has(key)) {
    const raw = Buffer.from(JSON.stringify({ songs: await loadSongs(), total: n }));
    const body =
      encoding === "br"
        ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } })
        : encoding === "gzip"
          ? gzipSync(raw)
          : raw;
    for (const stale of cached.keys()) if (!stale.startsWith(`${etag}:`)) cached.delete(stale);
    cached.set(key, body);
  }

  if (encoding !== "identity") headers["Content-Encoding"] = encoding;
  return new NextResponse(new Uint8Array(cached.get(key)!), { headers: { ...headers, "Content-Type": "application/json" } });
}
