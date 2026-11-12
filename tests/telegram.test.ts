// The Telegram reports and the Mixlr title offered to a service order. The
// pure parts are tested directly; posting is tested against a real temporary
// database with a fake bot, because "posted once, even with two pollers" lives
// in SQL (the claim), and a mock would prove nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MixlrSnapshot } from "../src/lib/mixlr";
import type { Bot } from "../src/lib/attendanceTelegram";
import { codesIn, newLinkCode, reportMessage } from "../src/lib/telegram";
import { eventName } from "../src/lib/mixlr";
import { fitName, MAX_NAME } from "../src/lib/setlistEdit";
import { attendanceReport, formatClock, formatDay } from "../src/lib/attendance";

const MIN = 60_000;
const at = (hhmm: string, day = "2026-11-11") => Date.parse(`${day}T${hhmm}:00.000Z`);
const liveDoc = () => JSON.parse(readFileSync(join(__dirname, "fixtures", "mixlr-channel-live.json"), "utf8"));

describe("report times in a set time zone", () => {
  it("writes Lagos time on a UTC server", () => {
    expect(formatClock(at("17:00"), "Africa/Lagos")).toBe("6:00pm");
    expect(formatClock(at("23:30"), "Africa/Lagos")).toBe("12:30am");
    expect(formatDay(at("23:30"), "Africa/Lagos")).toBe("Thu 12 Nov 2026");
  });

  it("uses the zone for every time in the report", () => {
    const text = attendanceReport({
      title: "Midweek Service",
      branch: "CLC Ilorin",
      startedAt: at("16:24"),
      marks: [{ at: at("17:00"), listeners: 40 }],
      summary: { average: 40, basis: "half-hour", peak: { at: at("17:05"), listeners: 44 } },
      timeZone: "Africa/Lagos",
    });
    expect(text).toContain("6:00pm — 40");
    expect(text).toContain("Peak: 44 (6:05pm)");
  });
});

describe("reportMessage", () => {
  it("puts the WhatsApp text in a code block, escaped, so a tap copies it with its asterisks", () => {
    const html = reportMessage("CLC <Ilorin>", "*Faith & Works*\n6:00pm — 40");
    expect(html).toContain("<b>CLC &lt;Ilorin&gt; · Mixlr attendance</b>");
    expect(html).toContain("<pre>*Faith &amp; Works*\n6:00pm — 40</pre>");
    expect(html).toContain("Tap the report to copy it");
  });

  it("carries a note instead of the copy hint when given one", () => {
    expect(reportMessage("CLC Ilorin", "x", "On air again")).toMatch(/<i>On air again<\/i>$/);
  });
});

describe("link codes", () => {
  it("are eight characters with no look-alikes", () => {
    const code = newLinkCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it("are found as /start CODE, /start@bot CODE, or the code on its own, in any case", () => {
    const msg = (text: string, chat: Record<string, unknown>) => ({ update_id: 1, message: { text, chat } });
    const found = codesIn([
      msg("/start ABCD2345", { id: 11, type: "private", first_name: "Ada", last_name: "Obi" }),
      msg("/start@LightdeskBot WXYZ6789", { id: -100200, type: "supergroup", title: "Media team" }),
      msg("  qrst7890 ", { id: 12, type: "private", username: "tunde" }),
      msg("Good evening everyone", { id: -100200, title: "Media team" }),
      { update_id: 5, edited_message: { text: "ABCD2345", chat: { id: 1 } } },
      "nonsense",
    ]);
    expect(found).toEqual([
      { code: "ABCD2345", chatId: "11", chatTitle: "Ada Obi" },
      { code: "WXYZ6789", chatId: "-100200", chatTitle: "Media team" },
      { code: "QRST7890", chatId: "12", chatTitle: "@tunde" },
    ]);
  });
});

describe("the Mixlr title for a service order", () => {
  it("is the event on air now", () => {
    expect(eventName(liveDoc(), at("17:00"))).toMatchObject({ title: "Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026", live: true });
  });

  it("is the next scheduled event when off air, ignoring ones long past", () => {
    const doc = liveDoc();
    doc.data.attributes.live = false;
    doc.data.relationships.current_broadcast = { data: null };
    doc.data.relationships.live_event = { data: null };
    for (const i of doc.included) {
      if (i.id === "5145329") i.attributes.starts_at = "2026-07-01T16:30:00.000Z"; // Mixlr still lists it in November
      if (i.id === "5433702") {
        i.attributes.title = "Sunday Service || 15th November, 2026";
        i.attributes.starts_at = "2026-11-15T08:00:00.000Z";
      }
    }
    expect(eventName(doc, at("10:00", "2026-11-12"))).toEqual({ title: "Sunday Service || 15th November, 2026", live: false, startsAt: Date.parse("2026-11-15T08:00:00.000Z") });
    // More than a week ahead is not "next": nothing is offered.
    expect(eventName(doc, at("10:00", "2026-11-01"))).toBeNull();
  });

  it("is nothing for a document it cannot read", () => {
    expect(eventName(null, 0)).toBeNull();
    expect(eventName({ data: {} }, 0)).toBeNull();
  });

  it("is cut at a word to fit a service order name", () => {
    expect(fitName("  Sunday   Service  ")).toBe("Sunday Service");
    // Ilorin's real titles fit whole.
    expect(fitName("Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026")).toBe("Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026");
    const long = "Prayers; The Handle of the Supernatural, Part Two || Midweek Service with the Choir and the Youth Fellowship || 11th November, 2026";
    const fitted = fitName(long);
    expect(fitted.length).toBeLessThanOrEqual(MAX_NAME);
    expect(fitted).toMatch(/^Prayers; The Handle of the Supernatural, Part Two \|\| Midweek Service with the Choir and the Youth Fellowship \|\| 11th…$/);
  });
});

// ---------------------------------------------------------------------------
// Posting, against a real database.
// ---------------------------------------------------------------------------

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let attendance: typeof import("../src/db/attendance");
let telegramDb: typeof import("../src/db/telegram");
let delivery: typeof import("../src/lib/attendanceTelegram");
let poll: typeof import("../src/lib/attendancePoll");

function live(listeners: number, uid = "uid-1"): MixlrSnapshot {
  return {
    live: true,
    broadcast: { uid, title: "Midweek Service", listeners, startedAt: at("16:24") },
    event: { id: "5433702", title: "Midweek Service", startsAt: at("16:30"), endsAt: at("18:30") },
  };
}
const OFF: MixlrSnapshot = { live: false, broadcast: null, event: null };

/** A bot that records what it was asked to do. `fail` makes the next calls fail with that description. */
function fakeBot() {
  const calls: { kind: "send" | "edit"; chatId: string; html: string; messageId?: number }[] = [];
  let next = 100;
  const state = { fail: null as string | null };
  const bot: Bot = {
    send: async (chatId, html) => {
      if (state.fail) return { ok: false, status: 403, description: state.fail };
      calls.push({ kind: "send", chatId, html });
      return { ok: true, result: next++ };
    },
    edit: async (chatId, messageId, html) => {
      if (state.fail) return { ok: false, status: 400, description: state.fail };
      calls.push({ kind: "edit", chatId, html, messageId });
      return { ok: true, result: true };
    },
  };
  return { bot, calls, state };
}

/** Branch 1 connected to chat -100 at `linkedAt`. */
async function connect(linkedAt: number) {
  await telegramDb.startLink(1, "ABCD2345", linkedAt);
  await telegramDb.applyCodes([{ code: "ABCD2345", chatId: "-100", chatTitle: "Media team" }], linkedAt);
}

/** The midweek service, 16:25 to 16:35, then off air at 16:40. */
async function service() {
  await attendance.recordSnapshot(1, live(37), at("16:25"));
  await attendance.recordSnapshot(1, live(41), at("16:30"));
  await attendance.recordSnapshot(1, live(39), at("16:35"));
  await attendance.recordSnapshot(1, OFF, at("16:40"));
}

describe("posting reports", () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "lightdesk-telegram-"));
    process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.ATTENDANCE_TIMEZONE;
    delete (globalThis as GlobalWithClient).__ldClient;
    vi.resetModules();
    const { ensureSchema } = await import("../src/db");
    attendance = await import("../src/db/attendance");
    telegramDb = await import("../src/db/telegram");
    delivery = await import("../src/lib/attendanceTelegram");
    poll = await import("../src/lib/attendancePoll");
    await ensureSchema();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    (globalThis as GlobalWithClient).__ldClient?.close?.();
    delete (globalThis as GlobalWithClient).__ldClient;
    rmSync(dir, { recursive: true, force: true });
  });

  it("posts an ended service's report once, in Lagos time", async () => {
    await connect(at("12:00"));
    await service();
    const { bot, calls } = fakeBot();
    const [first] = await delivery.deliverReports(at("16:40"), bot);
    const [second] = await delivery.deliverReports(at("16:45"), bot);
    expect(first.posted).toHaveLength(1);
    expect(second).toMatchObject({ posted: [], edited: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe("-100");
    expect(calls[0].html).toContain("*Midweek Service*");
    expect(calls[0].html).toContain("Wed 11 Nov 2026 · CLC Ilorin");
    expect(calls[0].html).toContain("Peak: 41 (5:30pm)");
  });

  it("posts nothing for a service still on air, or one with no readings", async () => {
    await connect(at("12:00"));
    await attendance.recordSnapshot(1, live(37), at("16:25"));
    const { bot, calls } = fakeBot();
    await delivery.deliverReports(at("16:30"), bot);
    expect(calls).toHaveLength(0);

    await attendance.recordSnapshot(1, OFF, at("16:30"));
    await attendance.deleteService(1, (await attendance.listServices(1))[0].service.id);
    await attendance.recordSnapshot(1, { ...live(0, "uid-2"), broadcast: { ...live(0, "uid-2").broadcast!, listeners: null } }, at("19:00"));
    await attendance.recordSnapshot(1, OFF, at("19:05"));
    await delivery.deliverReports(at("19:05"), bot);
    expect(calls).toHaveLength(0);
  });

  it("does not post services that ended before Telegram was connected", async () => {
    await service();
    await connect(at("17:00"));
    const { bot, calls } = fakeBot();
    await delivery.deliverReports(at("17:05"), bot);
    expect(calls).toHaveLength(0);
  });

  it("posts once when two pollers deliver at the same moment", async () => {
    await connect(at("12:00"));
    await service();
    const { bot, calls } = fakeBot();
    await Promise.all([delivery.deliverReports(at("16:40"), bot), delivery.deliverReports(at("16:40"), bot)]);
    expect(calls.filter((c) => c.kind === "send")).toHaveLength(1);
  });

  it("shows a failed post on the page and tries again next round", async () => {
    await connect(at("12:00"));
    await service();
    const { bot, calls, state } = fakeBot();
    state.fail = "Forbidden: bot was kicked from the supergroup chat";
    const [failed] = await delivery.deliverReports(at("16:40"), bot);
    expect(failed.error).toBe(state.fail);
    expect((await telegramDb.getTelegramLink(1)).error).toBe(state.fail);

    state.fail = null;
    await delivery.deliverReports(at("16:45"), bot);
    expect(calls).toHaveLength(1);
    expect((await telegramDb.getTelegramLink(1)).error).toBeNull();
  });

  it("edits the posted report when the service comes back on air, and again when it ends", async () => {
    await connect(at("12:00"));
    await service();
    const { bot, calls } = fakeBot();
    await delivery.deliverReports(at("16:40"), bot);

    // The encoder dropped; the same event is back.
    await attendance.recordSnapshot(1, live(45, "uid-2"), at("16:50"));
    await delivery.deliverReports(at("16:50"), bot);
    expect(calls[1]).toMatchObject({ kind: "edit", messageId: 100 });
    expect(calls[1].html).toContain(delivery.BACK_ON_AIR);

    await attendance.recordSnapshot(1, OFF, at("16:55"));
    await delivery.deliverReports(at("16:55"), bot);
    expect(calls[2]).toMatchObject({ kind: "edit", messageId: 100 });
    expect(calls[2].html).not.toContain(delivery.BACK_ON_AIR);
    expect(calls[2].html).toContain("Peak: 45 (5:50pm)");

    // Nothing changed since: no edit.
    await delivery.deliverReports(at("17:00"), bot);
    expect(calls).toHaveLength(3);
  });

  it("is posted by the attendance round itself", async () => {
    await connect(at("12:00"));
    const { bot, calls } = fakeBot();
    const { setChannel } = attendance;
    await setChannel(1, "clc-ilorin");
    const look = (snapshot: MixlrSnapshot) => async () => ({ kind: "ok" as const, snapshot });
    await poll.pollAttendance(at("16:25"), look(live(37)), bot);
    await poll.pollAttendance(at("16:30"), look(live(41)), bot);
    expect(calls).toHaveLength(0);
    await poll.pollAttendance(at("16:35"), look(OFF), bot);
    expect(calls).toHaveLength(1);
  });

  it("does nothing without TELEGRAM_BOT_TOKEN", async () => {
    await connect(at("12:00"));
    await service();
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { bot, calls } = fakeBot();
    expect(await delivery.deliverReports(at("16:40"), bot)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("sends a report again by hand, and keeps that message up to date from then on", async () => {
    await connect(at("12:00"));
    await service();
    const { bot, calls } = fakeBot();
    await delivery.deliverReports(at("16:40"), bot);
    const id = (await attendance.listServices(1))[0].service.id;
    const sent = await delivery.sendReportNow(1, "CLC Ilorin", "-100", id, at("16:45"), bot);
    expect(sent).toEqual({ ok: true, result: 101 });
    await attendance.recordSnapshot(1, live(50, "uid-2"), at("16:50"));
    await delivery.deliverReports(at("16:50"), bot);
    expect(calls[2]).toMatchObject({ kind: "edit", messageId: 101 });
    expect(await delivery.sendReportNow(1, "CLC Ilorin", "-100", 9999, at("16:50"), bot)).toBe("gone");
  });
});

describe("connecting a chat", () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "lightdesk-telegram-link-"));
    process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    delete process.env.TURSO_AUTH_TOKEN;
    delete (globalThis as GlobalWithClient).__ldClient;
    vi.resetModules();
    const { ensureSchema } = await import("../src/db");
    telegramDb = await import("../src/db/telegram");
    delivery = await import("../src/lib/attendanceTelegram");
    await ensureSchema();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    (globalThis as GlobalWithClient).__ldClient?.close?.();
    delete (globalThis as GlobalWithClient).__ldClient;
    rmSync(dir, { recursive: true, force: true });
  });

  it("connects the chat that sent the waiting code, once, and only before it runs out", async () => {
    const now = at("12:00");
    await telegramDb.startLink(1, "ABCD2345", now);
    expect(await telegramDb.getTelegramLink(1, now)).toMatchObject({ chatTitle: null, code: "ABCD2345" });

    expect(await telegramDb.applyCodes([{ code: "WRONG123", chatId: "-1", chatTitle: "Other" }], now)).toEqual([]);
    const made = await telegramDb.applyCodes([{ code: "ABCD2345", chatId: "-100", chatTitle: "Media team" }], now + MIN);
    expect(made).toEqual([{ branchId: 1, branchName: "CLC Ilorin", chatId: "-100", chatTitle: "Media team" }]);
    // Used up: another chat sending it later changes nothing.
    expect(await telegramDb.applyCodes([{ code: "ABCD2345", chatId: "-999", chatTitle: "Stranger" }], now + 2 * MIN)).toEqual([]);
    expect(await telegramDb.getTelegramLink(1, now)).toMatchObject({ chatTitle: "Media team", code: null });

    await telegramDb.startLink(1, "LATE2345", now);
    expect(await telegramDb.applyCodes([{ code: "LATE2345", chatId: "-5", chatTitle: "Late" }], now + telegramDb.CODE_TTL_MS + 1)).toEqual([]);
    expect((await telegramDb.getTelegramLink(1, now)).chatTitle).toBe("Media team");
  });

  it("reads the bot's messages, connects the chat, tells it so, and acknowledges what it read", async () => {
    const now = Date.now();
    await telegramDb.startLink(1, "ABCD2345", now);
    const asked: { method: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const method = url.split("/").pop()!;
      const body = JSON.parse(String(init.body));
      asked.push({ method, body });
      if (method === "getUpdates" && body.offset === undefined) {
        return Response.json({ ok: true, result: [{ update_id: 7, message: { text: "/start@LightdeskBot ABCD2345", chat: { id: -100, title: "Media team" } } }] });
      }
      if (method === "getUpdates") return Response.json({ ok: true, result: [] });
      return Response.json({ ok: true, result: { message_id: 1 } });
    });
    expect(await delivery.collectCodes(now)).toBe(1);
    expect((await telegramDb.getTelegramLink(1, now)).chatTitle).toBe("Media team");
    expect(asked.some((a) => a.method === "getUpdates" && a.body.offset === 8)).toBe(true);
    const told = asked.find((a) => a.method === "sendMessage");
    expect(told?.body.chat_id).toBe("-100");
    expect(String(told?.body.text)).toContain("CLC Ilorin's Mixlr attendance report will be posted here");
  });

  it("doesn't ask the bot when no branch is waiting for a code", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await delivery.collectCodes(Date.now())).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
