import { NextResponse } from "next/server";
import { getChannel } from "@/db/attendance";
import { gate } from "@/lib/sessionGate";
import { fetchEventName } from "@/lib/mixlr";
import { fitName } from "@/lib/setlistEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/attendance/event-name — the Mixlr event a new service order can be
 * named after: the one on air now, else the next one scheduled. `{ title: null }`
 * when the branch has no channel, Mixlr has nothing coming, or Mixlr can't be
 * reached; the service order pages then simply don't offer it. Church PIN.
 */
export async function GET() {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const channel = await getChannel(s.branchId);
  const found = channel === null ? null : await fetchEventName(channel);
  return NextResponse.json(found ? { title: fitName(found.title), live: found.live, startsAt: found.startsAt } : { title: null, live: false, startsAt: null });
}
