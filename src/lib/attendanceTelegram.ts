import { findService, type ServiceWithReadings } from "@/db/attendance";
import { anyCodeWaiting, applyCodes, branchesWithTelegram, claimReport, markEdited, markPosted, releaseReport, reportsDue, reportsPosted, setTelegramError } from "@/db/telegram";
import { attendanceReport } from "./attendance";
import { figures } from "./attendanceView";
import { codesIn, editHtml, reportMessage, reportTimeZone, sendHtml, takeUpdates, telegramConfigured, type BotResult } from "./telegram";

/** A report is posted for a service that ended up to this long ago: a server down over the service still posts it when it is back the same day. */
const POST_WINDOW_MS = 12 * 60 * 60 * 1000;

/** A posted report is kept up to date for services started this recently: long enough for any service that drops and comes back. */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What goes under the report while the service it is about is on air again. */
export const BACK_ON_AIR = "On air again — this report updates when the service ends.";

/** The Bot API calls the round makes, swappable in tests. */
export interface Bot {
  send: (chatId: string, html: string) => Promise<BotResult<number>>;
  edit: (chatId: string, messageId: number, html: string) => Promise<BotResult<true>>;
}

const realBot: Bot = { send: sendHtml, edit: editHtml };

/** The Telegram message for one service, as it stands at `now`. */
export function messageFor(entry: ServiceWithReadings, branchName: string, now: number): string {
  const { service } = entry;
  const { marks, summary } = figures(entry, now);
  const report = attendanceReport({ title: service.title, branch: branchName, startedAt: service.startedAt, marks, summary, timeZone: reportTimeZone() });
  return reportMessage(branchName, report, service.endedAt === null ? BACK_ON_AIR : undefined);
}

export type DeliveryOutcome = { branchId: number; posted: number[]; edited: number[]; error: string | null };

/**
 * Posts each ended service's report to its branch's Telegram chat, once, and
 * edits a posted report when its service has changed since: it came back on
 * air (a dropped encoder) and the report now says so, or it ended again with
 * more readings. Run at the end of every attendance round.
 *
 * A service with no readings has nothing to report and is skipped. A failed
 * post is let go and tried again next round, and the failure is shown on
 * /attendance until a post works.
 */
export async function deliverReports(now: number = Date.now(), bot: Bot = realBot): Promise<DeliveryOutcome[]> {
  if (!telegramConfigured()) return [];
  const targets = await branchesWithTelegram();
  const outcomes: DeliveryOutcome[] = [];
  for (const t of targets) {
    const outcome: DeliveryOutcome = { branchId: t.branchId, posted: [], edited: [], error: null };
    try {
      for (const id of await reportsDue(t.branchId, Math.max(now - POST_WINDOW_MS, t.linkedAt))) {
        const entry = await findService(t.branchId, id);
        if (!entry || entry.readings.length === 0) continue;
        if (!(await claimReport(id, now))) continue;
        const html = messageFor(entry, t.branchName, now);
        const sent = await bot.send(t.chatId, html);
        if (sent.ok) {
          await markPosted(id, t.chatId, sent.result, html);
          outcome.posted.push(id);
        } else {
          await releaseReport(id);
          outcome.error = sent.description;
        }
      }
      for (const p of await reportsPosted(t.branchId, now - EDIT_WINDOW_MS)) {
        const entry = await findService(t.branchId, p.id);
        if (!entry) continue;
        const html = messageFor(entry, t.branchName, now);
        if (html === p.text) continue;
        const edited = await bot.edit(p.chatId, p.messageId, html);
        if (edited.ok) {
          await markEdited(p.id, html);
          outcome.edited.push(p.id);
        } else {
          outcome.error = edited.description;
        }
      }
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : String(e);
    }
    if (outcome.error !== null) await setTelegramError(t.branchId, outcome.error);
    else if (outcome.posted.length > 0 || outcome.edited.length > 0) await setTelegramError(t.branchId, null);
    outcomes.push(outcome);
  }
  return outcomes;
}

/**
 * Sends one service's report now, from its page: a report wanted again, or one
 * for a service that ended before Telegram was connected. The new message is
 * the one kept up to date from then on.
 */
export async function sendReportNow(branchId: number, branchName: string, chatId: string, serviceId: number, now: number = Date.now(), bot: Bot = realBot): Promise<"gone" | "empty" | BotResult<number>> {
  const entry = await findService(branchId, serviceId);
  if (!entry) return "gone";
  if (entry.readings.length === 0) return "empty";
  const html = messageFor(entry, branchName, now);
  const sent = await bot.send(chatId, html);
  if (sent.ok) {
    await markPosted(serviceId, chatId, sent.result, html);
    await setTelegramError(branchId, null);
  }
  return sent;
}

/**
 * Looks for "Connect Telegram" codes sent to the bot and connects the chats
 * that sent them, telling each chat it worked. Only asks the bot while some
 * branch is waiting for a code. Run by the attendance page while it shows a
 * code, and by every round, so a code sent after the page closed still works.
 */
export async function collectCodes(now: number = Date.now(), send: Bot["send"] = sendHtml): Promise<number | { error: string }> {
  if (!telegramConfigured() || !(await anyCodeWaiting(now))) return 0;
  const updates = await takeUpdates();
  // Most likely a webhook set on the bot elsewhere: Telegram then refuses to hand messages over.
  if (!updates.ok) return { error: updates.description };
  const made = await applyCodes(codesIn(updates.result), now);
  for (const m of made) {
    await send(m.chatId, `<b>Connected to Lightdesk.</b>\n${escape(m.branchName)}'s Mixlr attendance report will be posted here after each service.`);
  }
  return made.length;
}

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
