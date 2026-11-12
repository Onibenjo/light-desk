/**
 * Posting attendance reports with a Telegram bot. The bot is made once with
 * @BotFather and its token set as TELEGRAM_BOT_TOKEN; without it the feature
 * is simply off. Each branch picks its chat (a group, or someone's own chat
 * with the bot) by sending the bot a one-time code from /attendance.
 *
 * Nothing here throws: Telegram being down or the bot being removed from the
 * group is an answer to show, not a crash in the poller.
 */

/** Overridable, like MIXLR_API_BASE, so a local run can point at a stand-in bot. */
const apiBase = () => process.env.TELEGRAM_API_BASE?.trim().replace(/\/$/, "") || "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function telegramConfigured(): boolean {
  return telegramToken() !== null;
}

/** The zone a report's times are written in. The server has no reader to take it from; the branches are in Nigeria. */
export function reportTimeZone(): string {
  const tz = process.env.ATTENDANCE_TIMEZONE?.trim();
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      // A typo in the setting falls back rather than stopping every report.
    }
  }
  return "Africa/Lagos";
}

export type BotResult<T> = { ok: true; result: T } | { ok: false; status: number; description: string };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/** One Bot API call. The token never appears in what is returned, so a failure can be shown or logged as it is. */
export async function botCall<T>(method: string, params: Rec): Promise<BotResult<T>> {
  const token = telegramToken();
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN is not set on the server" };
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "request failed";
    return { ok: false, status: 0, description: `Couldn't reach Telegram (${reason.replaceAll(token, "…")})` };
  }
  const body: unknown = await res.json().catch(() => null);
  if (isRec(body) && body.ok === true) return { ok: true, result: body.result as T };
  const description = isRec(body) && typeof body.description === "string" ? body.description : `Telegram answered ${res.status}`;
  return { ok: false, status: res.status, description };
}

let cachedUsername: string | null = null;

/** The bot's @name, for the links that open a chat with it. Asked once per process. */
export async function botUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const me = await botCall<{ username?: string }>("getMe", {});
  if (me.ok && typeof me.result.username === "string") cachedUsername = me.result.username;
  return cachedUsername;
}

const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The report as a Telegram message: a heading, then the WhatsApp text in a
 * code block. Tapping a code block in Telegram copies it as it is, asterisks
 * and all, so it pastes into WhatsApp with the title in bold, exactly as the
 * team sends it now. (Telegram's own bold would lose the asterisks on copy.)
 */
export function reportMessage(branch: string, report: string, note?: string): string {
  const head = `<b>${escapeHtml(branch)} · Mixlr attendance</b>`;
  const tail = note ? `\n<i>${escapeHtml(note)}</i>` : "\n<i>Tap the report to copy it for WhatsApp.</i>";
  return `${head}\n<pre>${escapeHtml(report)}</pre>${tail}`;
}

/** Sends `html` to the chat; the message id, so the report can be edited later. */
export async function sendHtml(chatId: string, html: string): Promise<BotResult<number>> {
  const sent = await botCall<{ message_id?: number }>("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  if (!sent.ok) return sent;
  return typeof sent.result.message_id === "number" ? { ok: true, result: sent.result.message_id } : { ok: false, status: 0, description: "Telegram didn't say which message it sent" };
}

/** Replaces a report already posted. Telegram refusing because nothing changed counts as done. */
export async function editHtml(chatId: string, messageId: number, html: string): Promise<BotResult<true>> {
  const edited = await botCall<unknown>("editMessageText", { chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  if (edited.ok || /message is not modified/i.test(edited.description)) return { ok: true, result: true };
  return edited;
}

// ---------------------------------------------------------------------------
// Connecting a chat: the admin's page shows a code, someone sends it to the
// bot (in a group, or in their own chat with it), and the page asks the bot
// what it has been sent.
// ---------------------------------------------------------------------------

/** Easy to read aloud and type on a phone: no 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export function newLinkCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** A chat that sent the bot a code: where reports for that code's branch will go. */
export interface CodeFromChat {
  code: string;
  chatId: string;
  chatTitle: string;
}

function chatTitle(chat: Rec): string {
  if (typeof chat.title === "string" && chat.title.trim()) return chat.title.trim();
  const name = [chat.first_name, chat.last_name].filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" ");
  if (name) return name;
  return typeof chat.username === "string" ? `@${chat.username}` : "Telegram chat";
}

/**
 * The codes found in a batch of updates. A code arrives as `/start CODE` (the
 * link opens the chat with it filled in), `/start@bot CODE` in a group, or the
 * code typed on its own. In a group the bot only sees commands, so the first
 * two are what a group sends.
 */
export function codesIn(updates: unknown[]): CodeFromChat[] {
  const found: CodeFromChat[] = [];
  for (const u of updates) {
    if (!isRec(u)) continue;
    const message = isRec(u.message) ? u.message : isRec(u.channel_post) ? u.channel_post : null;
    if (!message || !isRec(message.chat) || typeof message.text !== "string") continue;
    const chatId = message.chat.id;
    if (typeof chatId !== "number" && typeof chatId !== "string") continue;
    const match = /^(?:\/(?:start|link)(?:@\w+)?\s+)?([A-Za-z0-9]{6,12})\s*$/.exec(message.text.trim());
    if (!match) continue;
    found.push({ code: match[1].toUpperCase(), chatId: String(chatId), chatTitle: chatTitle(message.chat) });
  }
  return found;
}

/**
 * Everything sent to the bot since it last asked, and acknowledged, so the next
 * ask starts after it. Every branch's waiting code is matched against the same
 * batch (src/db/telegram.ts), so two branches connecting at once don't swallow
 * each other's codes.
 */
export async function takeUpdates(): Promise<BotResult<unknown[]>> {
  const all: unknown[] = [];
  let offset: number | undefined;
  for (let page = 0; page < 5; page++) {
    const got = await botCall<unknown[]>("getUpdates", { offset, limit: 100, timeout: 0, allowed_updates: ["message", "channel_post"] });
    if (!got.ok) return all.length > 0 ? { ok: true, result: all } : got;
    const batch = Array.isArray(got.result) ? got.result : [];
    if (batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1];
    if (!isRec(last) || typeof last.update_id !== "number") break;
    offset = last.update_id + 1;
  }
  // Acknowledge what was read: Telegram drops updates before the offset.
  if (offset !== undefined) await botCall("getUpdates", { offset, limit: 1, timeout: 0 });
  return { ok: true, result: all };
}
