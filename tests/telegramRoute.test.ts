// The Telegram and event-name routes, called directly against a temp database,
// with the session gate mocked as in attendanceRoute.test.ts and Telegram and
// Mixlr as a stubbed fetch.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { AttendanceList, TelegramStatus } from "../src/lib/attendanceView";

const session = { role: "admin" as "admin" | "church" | null };

vi.mock("../src/lib/sessionGate", () => ({
  gate: async (adminDenied?: string) => {
    if (session.role === null) return NextResponse.json({ error: "locked" }, { status: 401 });
    if (adminDenied && session.role !== "admin") return NextResponse.json({ error: adminDenied }, { status: 403 });
    return { branchId: 1, role: session.role, pinVersion: 1, branch: { id: 1, name: "CLC Ilorin" } };
  },
}));

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let telegramRoute: typeof import("../src/app/api/attendance/telegram/route");
let sendRoute: typeof import("../src/app/api/attendance/[id]/telegram/route");
let eventRoute: typeof import("../src/app/api/attendance/event-name/route");
let list: typeof import("../src/app/api/attendance/route");
let attendance: typeof import("../src/db/attendance");
let telegramDb: typeof import("../src/db/telegram");

const liveDoc = () => JSON.parse(readFileSync(join(__dirname, "fixtures", "mixlr-channel-live.json"), "utf8"));
const post = (body: unknown) => new Request("http://x/api/attendance/telegram", { method: "POST", body: JSON.stringify(body) });
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

/** Telegram and Mixlr, stubbed: Mixlr answers with the live fixture, Telegram with success. Returns what Telegram was asked. */
function stubNetwork() {
  const telegram: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("mixlr")) return Response.json(liveDoc());
    const method = url.split("/").pop()!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    telegram.push({ method, body });
    if (method === "getMe") return Response.json({ ok: true, result: { username: "LightdeskBot" } });
    if (method === "getUpdates") return Response.json({ ok: true, result: [] });
    return Response.json({ ok: true, result: { message_id: 55 } });
  });
  return telegram;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-telegram-route-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.MIXLR_API_BASE;
  delete (globalThis as GlobalWithClient).__ldClient;
  session.role = "admin";
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  telegramRoute = await import("../src/app/api/attendance/telegram/route");
  sendRoute = await import("../src/app/api/attendance/[id]/telegram/route");
  eventRoute = await import("../src/app/api/attendance/event-name/route");
  list = await import("../src/app/api/attendance/route");
  attendance = await import("../src/db/attendance");
  telegramDb = await import("../src/db/telegram");
  await ensureSchema();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

describe("/api/attendance/telegram", () => {
  it("gives the admin a code and the bot's name; the church PIN can't ask for one", async () => {
    stubNetwork();
    session.role = "church";
    expect((await telegramRoute.POST(post({ action: "link" }))).status).toBe(403);

    session.role = "admin";
    const res = await telegramRoute.POST(post({ action: "link" }));
    const body = (await res.json()) as TelegramStatus;
    expect(body).toMatchObject({ configured: true, chat: null, bot: "LightdeskBot" });
    expect(body.code).toMatch(/^[A-Z2-9]{8}$/);
  });

  it("keeps the waiting code from a church-PIN device", async () => {
    stubNetwork();
    await telegramRoute.POST(post({ action: "link" }));
    session.role = "church";
    const body = (await (await telegramRoute.GET()).json()) as TelegramStatus;
    expect(body.code).toBeNull();
    const listed = (await (await list.GET()).json()) as AttendanceList;
    expect(listed.telegram.code).toBeNull();
  });

  it("says why when the bot's messages can't be read", async () => {
    stubNetwork();
    await telegramRoute.POST(post({ action: "link" }));
    vi.stubGlobal("fetch", async () => Response.json({ ok: false, description: "Conflict: can't use getUpdates method while webhook is active" }, { status: 409 }));
    const res = await telegramRoute.POST(post({ action: "check" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/webhook is active/);
  });

  it("says the feature is off without TELEGRAM_BOT_TOKEN", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(((await (await telegramRoute.GET()).json()) as TelegramStatus).configured).toBe(false);
    expect((await telegramRoute.POST(post({ action: "link" }))).status).toBe(400);
  });

  it("disconnects, for the admin only", async () => {
    await telegramDb.startLink(1, "ABCD2345");
    await telegramDb.applyCodes([{ code: "ABCD2345", chatId: "-100", chatTitle: "Media team" }]);
    session.role = "church";
    expect((await telegramRoute.DELETE()).status).toBe(403);
    session.role = "admin";
    expect(((await (await telegramRoute.DELETE()).json()) as TelegramStatus).chat).toBeNull();
  });
});

describe("/api/attendance/:id/telegram", () => {
  it("sends the service's report to the connected chat, from a church-PIN device", async () => {
    const telegram = stubNetwork();
    await telegramDb.startLink(1, "ABCD2345");
    await telegramDb.applyCodes([{ code: "ABCD2345", chatId: "-100", chatTitle: "Media team" }]);
    const t = Date.parse("2026-11-11T17:00:00.000Z");
    const snap = { live: true, broadcast: { uid: "u", title: "Midweek", listeners: 40, startedAt: t }, event: null };
    await attendance.recordSnapshot(1, snap, t);
    const id = (await attendance.listServices(1))[0].service.id;

    session.role = "church";
    const res = await sendRoute.POST(new Request("http://x", { method: "POST" }), ctx(id));
    expect(await res.json()).toEqual({ ok: true, chat: "Media team" });
    const sent = telegram.find((c) => c.method === "sendMessage");
    expect(sent?.body.chat_id).toBe("-100");
    expect(String(sent?.body.text)).toContain("*Midweek*");

    expect((await sendRoute.POST(new Request("http://x", { method: "POST" }), ctx(9999))).status).toBe(404);
  });

  it("says so when no chat is connected", async () => {
    const res = await sendRoute.POST(new Request("http://x", { method: "POST" }), ctx(1));
    expect(res.status).toBe(400);
  });
});

describe("/api/attendance/event-name", () => {
  it("offers the live Mixlr event's title, fitted to a service order name", async () => {
    stubNetwork();
    await attendance.setChannel(1, "clc-ilorin");
    const body = await (await eventRoute.GET()).json();
    expect(body).toMatchObject({ title: "Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026", live: true });
  });

  it("offers nothing without a channel, or when Mixlr can't be reached", async () => {
    expect(await (await eventRoute.GET()).json()).toMatchObject({ title: null });
    await attendance.setChannel(1, "clc-ilorin");
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await (await eventRoute.GET()).json()).toMatchObject({ title: null });
  });

  it("needs a session", async () => {
    session.role = null;
    expect((await eventRoute.GET()).status).toBe(401);
  });
});
