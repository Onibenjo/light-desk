import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { createSetlist, findSetlistByName, replaceSetlistItems, type SetlistRecord } from "@/db/setlists";
import { loadSongs } from "@/db/songs";
import { songs } from "@/db/schema";
import { gate } from "@/lib/sessionGate";
import { parseImport } from "@/lib/setlistImport";
import type { SongItem } from "@/lib/setlistEdit";

export const runtime = "nodejs";

/**
 * POST { orders: [{ name, songIds }] } — save a pasted setlist. Each order
 * replaces the items of the branch's order with the same name, or is created.
 * Every id must be in the song bank, checked before anything is written.
 */
export async function POST(req: Request) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const parsed = parseImport(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  const wanted = [...new Set(parsed.orders.flatMap((o) => o.songIds))];
  const found = wanted.length ? await loadSongs(inArray(songs.id, wanted)) : [];
  const titles = new Map(found.map((song) => [song.id!, song.title]));
  if (wanted.some((id) => !titles.has(id))) return NextResponse.json({ error: "A song is no longer in the song bank; read the setlist again" }, { status: 400 });

  const saved: SetlistRecord[] = [];
  for (const order of parsed.orders) {
    // Nothing matched: saving would empty an order someone may have built by hand.
    if (order.songIds.length === 0) continue;
    const items: SongItem[] = order.songIds.map((id) => ({ kind: "song", id, title: titles.get(id)! }));
    const target = (await findSetlistByName(s.branchId, order.name)) ?? (await createSetlist(s.branchId, order.name));
    const record = await replaceSetlistItems(s.branchId, target.id, items);
    if (record) saved.push(record);
  }
  return NextResponse.json({ ok: true, setlists: saved });
}
