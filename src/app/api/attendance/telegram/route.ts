import { NextResponse } from "next/server";
import { disconnectTelegram, startLink } from "@/db/telegram";
import { gate } from "@/lib/sessionGate";
import { collectCodes } from "@/lib/attendanceTelegram";
import { botUsername, newLinkCode, telegramConfigured } from "@/lib/telegram";
import { telegramStatus } from "@/lib/telegramStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DENIED = "Connecting Telegram needs the admin PIN";
const OFF = "Telegram isn't set up on this server — it needs TELEGRAM_BOT_TOKEN";

/** GET /api/attendance/telegram — where the branch's reports go. Church PIN; the waiting code only for the admin. */
export async function GET() {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await telegramStatus(s.branchId, s.role === "admin"));
}

/**
 * POST /api/attendance/telegram — admin.
 * `{ action: "link" }` makes a new code to send to the bot.
 * `{ action: "check" }` asks the bot whether a code has arrived, and connects the chat that sent it.
 * The page sends "check" every few seconds while it shows a code; the five-minute round does it too.
 */
export async function POST(req: Request) {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;
  if (!telegramConfigured()) return NextResponse.json({ error: OFF }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action === "link") {
    if (!(await botUsername())) return NextResponse.json({ error: "Couldn't reach the Telegram bot — check TELEGRAM_BOT_TOKEN, then try again" }, { status: 502 });
    await startLink(s.branchId, newLinkCode());
  } else if (body?.action === "check") {
    const linked = await collectCodes();
    if (typeof linked === "object") return NextResponse.json({ error: `Couldn't read the bot's messages: ${linked.error}` }, { status: 502 });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json(await telegramStatus(s.branchId, true));
}

/** DELETE /api/attendance/telegram — admin. Stops posting reports; those already posted stay in the chat. */
export async function DELETE() {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;
  await disconnectTelegram(s.branchId);
  return NextResponse.json(await telegramStatus(s.branchId, true));
}
