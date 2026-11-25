import { NextResponse } from "next/server";
import { loadSetlists } from "@/db/setlists";
import { loadSongs } from "@/db/songs";
import { gate } from "@/lib/sessionGate";
import { buildIndex } from "@/lib/songSearch";
import { matchSong } from "@/lib/setlistMatch";
import { readSetlist } from "@/lib/setlistRead";
import { MAX_PASTE, orderName, parseDate, uniqueNames } from "@/lib/setlistImport";

export const runtime = "nodejs";

/**
 * POST { text, date } — read a pasted choir setlist and match each song to the
 * song bank. Nothing is saved; the paste screen shows this for a person to check.
 */
export async function POST(req: Request) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const body = (await req.json().catch(() => null)) as { text?: unknown; date?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const date = parseDate(body?.date);
  if (!text.trim()) return NextResponse.json({ error: "Paste the setlist first" }, { status: 400 });
  if (text.length > MAX_PASTE) return NextResponse.json({ error: `That's too long; paste just the setlist (up to ${MAX_PASTE} characters)` }, { status: 400 });
  if (!date) return NextResponse.json({ error: "Pick the service date" }, { status: 400 });

  const { services, readWithoutAi } = await readSetlist(text);
  if (services.length === 0) return NextResponse.json({ error: "Couldn't find any songs" }, { status: 400 });

  const [songs, existing] = await Promise.all([loadSongs(), loadSetlists(s.branchId)]);
  const index = buildIndex(songs);
  const taken = new Set(existing.map((x) => x.name));
  const names = uniqueNames(services.map((svc) => orderName(date, svc.name)));

  return NextResponse.json({
    readWithoutAi,
    services: services.map((svc, i) => ({
      name: names[i],
      exists: taken.has(names[i]),
      sections: svc.sections.map((sec) => ({ name: sec.name, songs: sec.songs.map((song) => ({ ...song, match: matchSong(index, song) })) })),
    })),
  });
}
