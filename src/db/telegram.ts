import { and, asc, eq, gt, gte, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "./index";
import { branches, services } from "./schema";
import type { CodeFromChat } from "@/lib/telegram";

/** How long a "Connect Telegram" code works. Long enough to find the group on a phone; short enough not to linger. */
export const CODE_TTL_MS = 30 * 60 * 1000;

/** A poller that claimed a report and then died lets go after this, so another can post it. */
export const CLAIM_TTL_MS = 2 * 60 * 1000;

export interface TelegramLink {
  /** The chat reports go to, by name. Null until one is connected. */
  chatTitle: string | null;
  /** Why the last post failed, until one works. */
  error: string | null;
  /** The code waiting to be sent to the bot, while it still works. */
  code: string | null;
  codeExpires: number | null;
}

export async function getTelegramLink(branchId: number, now: number = Date.now()): Promise<TelegramLink> {
  const [row] = await db
    .select({ chatId: branches.telegramChatId, chatTitle: branches.telegramChatTitle, error: branches.telegramError, code: branches.telegramCode, expires: branches.telegramCodeExpires })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  const live = row?.code && row.expires && row.expires.getTime() > now;
  return {
    chatTitle: row?.chatId ? (row.chatTitle ?? "Telegram chat") : null,
    error: row?.chatId ? (row.error ?? null) : null,
    code: live ? row.code : null,
    codeExpires: live && row.expires ? row.expires.getTime() : null,
  };
}

/** Starts connecting: a fresh code replaces any earlier one. The chat already connected keeps getting reports until a new one sends the code. */
export async function startLink(branchId: number, code: string, now: number = Date.now()): Promise<number> {
  const expires = now + CODE_TTL_MS;
  await db.update(branches).set({ telegramCode: code, telegramCodeExpires: new Date(expires) }).where(eq(branches.id, branchId));
  return expires;
}

/** Whether any branch is waiting for its code, so the bot is only asked when someone is connecting. */
export async function anyCodeWaiting(now: number = Date.now()): Promise<boolean> {
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(isNotNull(branches.telegramCode), gt(branches.telegramCodeExpires, new Date(now))))
    .limit(1);
  return row !== undefined;
}

/**
 * Connects each chat that sent a branch's waiting code. A code works once:
 * it is cleared as the chat is saved. Returns the connections made, so each
 * chat can be told it worked.
 */
export async function applyCodes(found: CodeFromChat[], now: number = Date.now()): Promise<{ branchId: number; branchName: string; chatId: string; chatTitle: string }[]> {
  const made: { branchId: number; branchName: string; chatId: string; chatTitle: string }[] = [];
  for (const f of found) {
    const [row] = await db
      .update(branches)
      .set({ telegramChatId: f.chatId, telegramChatTitle: f.chatTitle, telegramLinkedAt: new Date(now), telegramError: null, telegramCode: null, telegramCodeExpires: null })
      .where(and(eq(branches.telegramCode, f.code), gt(branches.telegramCodeExpires, new Date(now))))
      .returning({ id: branches.id, name: branches.name });
    if (row) made.push({ branchId: row.id, branchName: row.name, chatId: f.chatId, chatTitle: f.chatTitle });
  }
  return made;
}

/** Stops posting the branch's reports. Reports already posted stay in the chat. */
export async function disconnectTelegram(branchId: number): Promise<void> {
  await db
    .update(branches)
    .set({ telegramChatId: null, telegramChatTitle: null, telegramLinkedAt: null, telegramError: null, telegramCode: null, telegramCodeExpires: null })
    .where(eq(branches.id, branchId));
}

export async function setTelegramError(branchId: number, error: string | null): Promise<void> {
  await db.update(branches).set({ telegramError: error }).where(eq(branches.id, branchId));
}

export interface TelegramBranch {
  branchId: number;
  branchName: string;
  chatId: string;
  /** Services that ended before this are not posted: connecting must not flood the chat with old reports. */
  linkedAt: number;
}

export async function branchesWithTelegram(): Promise<TelegramBranch[]> {
  const rows = await db
    .select({ branchId: branches.id, branchName: branches.name, chatId: branches.telegramChatId, linkedAt: branches.telegramLinkedAt })
    .from(branches)
    .where(isNotNull(branches.telegramChatId))
    .orderBy(asc(branches.id));
  return rows.flatMap((r) => (r.chatId ? [{ branchId: r.branchId, branchName: r.branchName, chatId: r.chatId, linkedAt: r.linkedAt?.getTime() ?? 0 }] : []));
}

/** Ended services of the branch, ended since `since`, whose report has not been posted. */
export async function reportsDue(branchId: number, since: number): Promise<number[]> {
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.branchId, branchId), isNotNull(services.endedAt), gte(services.endedAt, new Date(since)), isNull(services.telegramMessageId)))
    .orderBy(asc(services.startedAt));
  return rows.map((r) => r.id);
}

/** Services of the branch started since `since` whose report is out: kept up to date if the service comes back. */
export async function reportsPosted(branchId: number, since: number): Promise<{ id: number; chatId: string; messageId: number; text: string | null }[]> {
  const rows = await db
    .select({ id: services.id, chatId: services.telegramChatId, messageId: services.telegramMessageId, text: services.telegramText })
    .from(services)
    .where(and(eq(services.branchId, branchId), gte(services.startedAt, new Date(since)), isNotNull(services.telegramMessageId)))
    .orderBy(asc(services.startedAt));
  return rows.flatMap((r) => (r.chatId && r.messageId !== null ? [{ id: r.id, chatId: r.chatId, messageId: r.messageId, text: r.text }] : []));
}

/**
 * Takes the job of posting one service's report. Only one poller gets it (the
 * timer and a cron call, or two instances, land together), so the report is
 * posted once. A claim older than CLAIM_TTL_MS was left by a poller that died
 * mid-post and can be taken over.
 */
export async function claimReport(serviceId: number, now: number): Promise<boolean> {
  const claimed = await db
    .update(services)
    .set({ telegramClaimedAt: now })
    .where(and(eq(services.id, serviceId), isNull(services.telegramMessageId), or(isNull(services.telegramClaimedAt), lt(services.telegramClaimedAt, now - CLAIM_TTL_MS))))
    .returning({ id: services.id });
  return claimed.length > 0;
}

export async function releaseReport(serviceId: number): Promise<void> {
  await db.update(services).set({ telegramClaimedAt: null }).where(eq(services.id, serviceId));
}

/** Records the message a report went out as. A report sent again by hand replaces the one kept up to date. */
export async function markPosted(serviceId: number, chatId: string, messageId: number, text: string): Promise<void> {
  await db.update(services).set({ telegramChatId: chatId, telegramMessageId: messageId, telegramText: text, telegramClaimedAt: null }).where(eq(services.id, serviceId));
}

export async function markEdited(serviceId: number, text: string): Promise<void> {
  await db.update(services).set({ telegramText: text }).where(eq(services.id, serviceId));
}
