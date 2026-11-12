import { NextResponse } from "next/server";
import { branchesWithTelegram, getTelegramLink } from "@/db/telegram";
import { gate } from "@/lib/sessionGate";
import { sendReportNow } from "@/lib/attendanceTelegram";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/attendance/:id/telegram — sends this service's report to the
 * branch's Telegram chat now. Church PIN: it is the same report anyone at the
 * desk can copy. Reports are posted on their own when a service ends; this is
 * for sending one again, or one from before Telegram was connected.
 */
export async function POST(_req: Request, { params }: Context) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const id = Number((await params).id);
  const link = (await branchesWithTelegram()).find((b) => b.branchId === s.branchId);
  if (!link) return NextResponse.json({ error: "No Telegram chat is connected — connect one on the Attendance page" }, { status: 400 });
  const result = Number.isInteger(id) && id > 0 ? await sendReportNow(s.branchId, s.branch.name, link.chatId, id) : "gone";
  if (result === "gone") return NextResponse.json({ error: "That service is gone — go back to Attendance" }, { status: 404 });
  if (result === "empty") return NextResponse.json({ error: "This service has no readings, so there is no report to send" }, { status: 400 });
  if (!result.ok) return NextResponse.json({ error: `Telegram didn't take it: ${result.description}` }, { status: 502 });
  return NextResponse.json({ ok: true, chat: (await getTelegramLink(s.branchId)).chatTitle });
}
