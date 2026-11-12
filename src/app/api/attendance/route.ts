import { NextResponse } from "next/server";
import { getChannel, listServices } from "@/db/attendance";
import { loadSetlists } from "@/db/setlists";
import { gate } from "@/lib/sessionGate";
import { toSummary, type AttendanceList } from "@/lib/attendanceView";
import { telegramStatus } from "@/lib/telegramStatus";

export const runtime = "nodejs";

/**
 * GET /api/attendance — this branch's services, newest first, with each one's
 * average and peak. Church PIN: the numbers are the media team's own report,
 * and the people who send it are the people at the desk.
 */
export async function GET() {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const [channel, entries, setlists, telegram] = await Promise.all([getChannel(s.branchId), listServices(s.branchId), loadSetlists(s.branchId), telegramStatus(s.branchId, s.role === "admin")]);
  const names = new Map(setlists.map((l) => [l.id, l.name]));
  const body: AttendanceList = {
    branch: s.branch.name,
    channel,
    admin: s.role === "admin",
    services: entries.map((e) => toSummary(e, e.service.setlistId === null ? null : (names.get(e.service.setlistId) ?? null))),
    telegram,
  };
  return NextResponse.json(body);
}
