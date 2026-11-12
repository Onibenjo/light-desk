import { getTelegramLink } from "@/db/telegram";
import type { TelegramStatus } from "./attendanceView";
import { botUsername, telegramConfigured } from "./telegram";

/** The branch's Telegram status for the attendance page. The waiting code is the admin's alone: whoever has it can take the reports. */
export async function telegramStatus(branchId: number, admin: boolean): Promise<TelegramStatus> {
  if (!telegramConfigured()) return { configured: false, chat: null, error: null, code: null, codeExpires: null, bot: null };
  const link = await getTelegramLink(branchId);
  const code = admin ? link.code : null;
  return { configured: true, chat: link.chatTitle, error: link.error, code, codeExpires: code ? link.codeExpires : null, bot: code ? await botUsername() : null };
}
