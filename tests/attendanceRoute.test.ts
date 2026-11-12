// The attendance routes, called directly with a Request against a temp
// database. The session gate is mocked (it reads cookies and needs a request
// scope); `session` below is what it lets through, so a test can be the church
// PIN, the admin PIN, or locked. Mixlr is a stubbed fetch.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { AttendanceList, ServiceDetail } from "../src/lib/attendanceView";

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
let list: typeof import("../src/app/api/attendance/route");
let one: typeof import("../src/app/api/attendance/[id]/route");
let channelRoute: typeof import("../src/app/api/attendance/channel/route");
let tick: typeof import("../src/app/api/attendance/tick/route");
let attendance: typeof import("../src/db/attendance");
let setlists: typeof import("../src/db/setlists");

const liveDoc = () => JSON.parse(readFileSync(join(__dirname, "fixtures", "mixlr-channel-live.json"), "utf8"));
const at = (hhmm: string) => Date.parse(`2026-11-11T${hhmm}:00.000Z`);

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-attendance-route-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.CRON_SECRET;
  delete (globalThis as GlobalWithClient).__ldClient;
  session.role = "admin";
  vi.resetModules();
  const { ensureSchema } = await import("../src/db");
  attendance = await import("../src/db/attendance");
  setlists = await import("../src/db/setlists");
  list = await import("../src/app/api/attendance/route");
  one = await import("../src/app/api/attendance/[id]/route");
  channelRoute = await import("../src/app/api/attendance/channel/route");
  tick = await import("../src/app/api/attendance/tick/route");
  await ensureSchema();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

/** A 5:30pm (16:30Z) service with a reading every five minutes from 16:25 to 18:35, rising by one each time. */
async function recordedService(): Promise<number> {
  let id = 0;
  for (let t = at("16:25"), n = 30; t <= at("18:35"); t += 5 * 60_000, n++) {
    const r = await attendance.recordSnapshot(
      1,
      { live: true, broadcast: { uid: "u", title: "Midweek Service", listeners: n, startedAt: at("16:24") }, event: { id: "5433702", title: "Midweek Service", startsAt: at("16:30"), endsAt: at("18:30") } },
      t,
    );
    if (r.kind === "live") id = r.serviceId;
  }
  await attendance.recordSnapshot(1, { live: false, broadcast: null, event: null }, at("18:40"));
  return id;
}

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const json = (method: string, body: unknown) => new Request("http://desk/api/attendance", { method, body: JSON.stringify(body) });

describe("GET /api/attendance", () => {
  it("lists the branch's services with their average and peak", async () => {
    const id = await recordedService();
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");
    await attendance.linkSetlist(1, id, order.id);
    session.role = "church";

    const res = await list.GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as AttendanceList;
    expect(body).toMatchObject({ branch: "CLC Ilorin", channel: null, admin: false });
    // Half-hour readings: 17:00 = 37, 17:30 = 43, 18:00 = 49, 18:30 = 55.
    expect(body.services).toEqual([
      { id, title: "Midweek Service", startedAt: at("16:24"), endedAt: at("18:35"), readings: 27, average: 46, basis: "half-hour", peak: 56, latest: { at: at("18:35"), listeners: 56 }, setlistName: "Midweek 11 Nov" },
    ]);
  });

  it("is locked without a PIN", async () => {
    session.role = null;
    expect((await list.GET()).status).toBe(401);
  });
});

describe("GET /api/attendance/:id", () => {
  it("gives the half-hour readings, the summary and the service order used", async () => {
    const id = await recordedService();
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");
    await setlists.updateSetlist(1, order.id, { items: [{ kind: "song", id: 4, title: "Way Maker" }], updatedAt: order.updatedAt });
    await attendance.linkSetlist(1, id, order.id);

    const res = await one.GET(new Request("http://desk"), ctx(id));
    const body = (await res.json()) as ServiceDetail;
    expect(body.marks).toEqual([
      { at: at("17:00"), listeners: 37 },
      { at: at("17:30"), listeners: 43 },
      { at: at("18:00"), listeners: 49 },
      { at: at("18:30"), listeners: 55 },
    ]);
    expect(body.summary).toEqual({ average: 46, basis: "half-hour", peak: { at: at("18:35"), listeners: 56 } });
    expect(body.readings).toHaveLength(27);
    expect(body.setlist).toEqual({ id: order.id, name: "Midweek 11 Nov", items: [{ kind: "song", title: "Way Maker" }] });
    expect(body.setlists).toEqual([{ id: order.id, name: "Midweek 11 Nov", active: false }]);
  });

  it("shows no service order once the linked one has been deleted", async () => {
    const id = await recordedService();
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");
    await attendance.linkSetlist(1, id, order.id);
    await setlists.deleteSetlist(1, order.id);
    const body = (await (await one.GET(new Request("http://desk"), ctx(id))).json()) as ServiceDetail;
    expect(body.setlist).toBeNull();
  });

  it.each(["9999", "abc", "0", "1.5"])("is a 404 for id %s", async (id) => {
    expect((await one.GET(new Request("http://desk"), ctx(id))).status).toBe(404);
  });
});

describe("PATCH /api/attendance/:id", () => {
  it("lets the church PIN choose the service order, and clear it", async () => {
    const id = await recordedService();
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");
    session.role = "church";

    expect((await one.PATCH(json("PATCH", { setlistId: order.id }), ctx(id))).status).toBe(200);
    expect((await attendance.findService(1, id))?.service.setlistId).toBe(order.id);
    expect((await one.PATCH(json("PATCH", { setlistId: null }), ctx(id))).status).toBe(200);
    expect((await attendance.findService(1, id))?.service.setlistId).toBeNull();
  });

  it.each([{}, { setlistId: "3" }, { setlistId: 1.5 }, { setlistId: -1 }, null])("refuses %j", async (body) => {
    const id = await recordedService();
    expect((await one.PATCH(json("PATCH", body), ctx(id))).status).toBe(400);
  });

  it("refuses a service order that does not exist", async () => {
    const id = await recordedService();
    const res = await one.PATCH(json("PATCH", { setlistId: 4242 }), ctx(id));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("That service order is gone — reload the page");
  });
});

describe("DELETE /api/attendance/:id", () => {
  it("needs the admin PIN", async () => {
    const id = await recordedService();
    session.role = "church";
    const res = await one.DELETE(new Request("http://desk", { method: "DELETE" }), ctx(id));
    expect(res.status).toBe(403);
    expect(await attendance.findService(1, id)).not.toBeNull();
  });

  it("removes the service", async () => {
    const id = await recordedService();
    expect((await one.DELETE(new Request("http://desk", { method: "DELETE" }), ctx(id))).status).toBe(200);
    expect(await attendance.findService(1, id)).toBeNull();
    expect((await one.DELETE(new Request("http://desk", { method: "DELETE" }), ctx(id))).status).toBe(404);
  });
});

describe("PUT /api/attendance/channel", () => {
  const put = (body: unknown) => channelRoute.PUT(json("PUT", body));

  it("checks the channel on Mixlr, saves its name, and opens the service if it is live", async () => {
    const fetched = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(liveDoc()), { status: 200 }));
    vi.stubGlobal("fetch", fetched);

    const res = await put({ channel: "https://CLC-Ilorin.mixlr.com/" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, channel: "clc-ilorin", live: true, listeners: 37 });
    expect(String(fetched.mock.calls[0][0])).toContain("/channel_view/clc-ilorin");
    expect(await attendance.getChannel(1)).toBe("clc-ilorin");
    // The service is open, but readings are left to the five-minute round.
    const services = await attendance.listServices(1);
    expect(services).toHaveLength(1);
    expect(services[0].service.endedAt).toBeNull();
    expect(services[0].readings).toEqual([]);
  });

  it("refuses a channel Mixlr does not have, and saves nothing", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    const res = await put({ channel: "clc-ilorn" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Mixlr has no channel at clc-ilorn.mixlr.com — check the address");
    expect(await attendance.getChannel(1)).toBeNull();
  });

  it("saves nothing when Mixlr can't be reached to check", async () => {
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("fetch failed")));
    expect((await put({ channel: "clc-ilorin" })).status).toBe(502);
    expect(await attendance.getChannel(1)).toBeNull();
  });

  it.each([{ channel: "not a channel" }, { channel: "https://example.com/x" }, { channel: 5 }, {}, null])("refuses %j without asking Mixlr", async (body) => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    expect((await put(body)).status).toBe(400);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("clears the channel with an empty value", async () => {
    await attendance.setChannel(1, "clc-ilorin");
    expect(await (await put({ channel: "  " })).json()).toMatchObject({ ok: true, channel: null });
    expect(await attendance.getChannel(1)).toBeNull();
  });

  it("needs the admin PIN", async () => {
    session.role = "church";
    const res = await put({ channel: "clc-ilorin" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("Setting the Mixlr channel needs the admin PIN");
  });
});

describe("POST /api/attendance/tick", () => {
  const SECRET = "a-long-cron-secret-0123456789";
  const call = (headers: Record<string, string> = {}) => tick.POST(new Request("http://desk/api/attendance/tick", { method: "POST", headers }));

  it("is closed when CRON_SECRET is not set, whatever is sent", async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer " })).status).toBe(401);
    expect((await call({ "x-cron-secret": "" })).status).toBe(401);
  });

  it("is closed to the wrong secret, and to a secret too short to be one", async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call()).status).toBe(401);
    process.env.CRON_SECRET = "short";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call({ authorization: "Bearer short" })).status).toBe(401);
  });

  it("runs a round with the secret, as a bearer token or its own header", async () => {
    process.env.CRON_SECRET = SECRET;
    await attendance.setChannel(1, "clc-ilorin");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(liveDoc()), { status: 200 }));

    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, branches: [{ branchId: 1, channel: "clc-ilorin", kind: "live", listeners: 37 }] });
    expect((await call({ "x-cron-secret": SECRET })).status).toBe(200);
    // Two rounds in the same five minutes: still one reading.
    expect((await attendance.listServices(1))[0].readings).toHaveLength(1);
  });
});
