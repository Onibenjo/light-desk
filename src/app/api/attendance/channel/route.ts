import { NextResponse } from "next/server";
import { recordSnapshot, setChannel } from "@/db/attendance";
import { gate } from "@/lib/sessionGate";
import { cleanMixlrChannel, fetchChannel } from "@/lib/mixlr";

export const runtime = "nodejs";

const DENIED = "Setting the Mixlr channel needs the admin PIN";

/**
 * PUT /api/attendance/channel — { channel } — admin. Sets which Mixlr channel
 * this branch's attendance is read from; an empty value stops recording.
 *
 * The channel is looked up on Mixlr before it is saved. A typo here would
 * otherwise fail silently every five minutes, and be found out on the first
 * Sunday with no numbers. If the channel is live right now, its service is
 * opened with this request, so the page shows it at once — but no reading is
 * stored: readings are taken only by the five-minute round, on the clock, and
 * one taken now would sit in the next round's slot and push it out.
 */
export async function PUT(req: Request) {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;

  const body = (await req.json().catch(() => null)) as { channel?: unknown } | null;
  const raw = typeof body?.channel === "string" ? body.channel.trim() : null;
  if (raw === null) return NextResponse.json({ error: "Enter the channel's address, like clc-ilorin.mixlr.com" }, { status: 400 });
  if (raw === "") {
    await setChannel(s.branchId, null);
    return NextResponse.json({ ok: true, channel: null, live: false, listeners: null });
  }

  const channel = cleanMixlrChannel(raw);
  if (!channel) return NextResponse.json({ error: "That doesn't look like a Mixlr channel — enter its address, like clc-ilorin.mixlr.com" }, { status: 400 });

  const result = await fetchChannel(channel);
  if (result.kind === "not-found") return NextResponse.json({ error: `Mixlr has no channel at ${channel}.mixlr.com — check the address` }, { status: 400 });
  if (result.kind === "unreachable") return NextResponse.json({ error: "Couldn't reach Mixlr to check that channel — try again" }, { status: 502 });

  await setChannel(s.branchId, channel);
  const { snapshot } = result;
  const recorded = await recordSnapshot(s.branchId, { ...snapshot, broadcast: snapshot.broadcast && { ...snapshot.broadcast, listeners: null } }, Date.now());
  return NextResponse.json({ ok: true, channel, live: recorded.kind === "live", listeners: snapshot.broadcast?.listeners ?? null });
}
