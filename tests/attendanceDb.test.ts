// Exercises src/db/attendance.ts and the poll round against a real temporary
// file database. What makes a reading belong to a service, and what stops two
// pollers writing the same one twice, both live in SQL (unique indexes and
// ON CONFLICT), so a mock would prove nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MixlrResult, MixlrSnapshot } from "../src/lib/mixlr";

type GlobalWithClient = { __ldClient?: { close?: () => unknown } };

let dir: string;
let attendance: typeof import("../src/db/attendance");
let setlists: typeof import("../src/db/setlists");
let branches: typeof import("../src/db/branches");
let poll: typeof import("../src/lib/attendancePoll");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-attendance-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete (globalThis as GlobalWithClient).__ldClient;
  vi.resetModules();

  const { ensureSchema } = await import("../src/db");
  attendance = await import("../src/db/attendance");
  setlists = await import("../src/db/setlists");
  branches = await import("../src/db/branches");
  poll = await import("../src/lib/attendancePoll");
  await ensureSchema();
});

afterEach(() => {
  (globalThis as GlobalWithClient).__ldClient?.close?.();
  delete (globalThis as GlobalWithClient).__ldClient;
  rmSync(dir, { recursive: true, force: true });
});

const MIN = 60_000;
const at = (hhmm: string, day = "2026-11-11") => Date.parse(`${day}T${hhmm}:00.000Z`);

/** The midweek service: event 5433702, on air from 16:24, scheduled 16:30 to 18:30. */
function live(listeners: number | null, change: { uid?: string; eventId?: string | null; title?: string; startedAt?: number | null } = {}): MixlrSnapshot {
  const title = change.title ?? "Midweek Service";
  const eventId = change.eventId === undefined ? "5433702" : change.eventId;
  return {
    live: true,
    broadcast: { uid: change.uid ?? "uid-1", title, listeners, startedAt: change.startedAt === undefined ? at("16:24") : change.startedAt },
    event: eventId === null ? null : { id: eventId, title, startsAt: at("16:30"), endsAt: at("18:30") },
  };
}
const OFF: MixlrSnapshot = { live: false, broadcast: null, event: null };

describe("recordSnapshot", () => {
  it("opens a service on the first live reading and adds to it on the next", async () => {
    const first = await attendance.recordSnapshot(1, live(37), at("16:25"));
    const second = await attendance.recordSnapshot(1, live(41), at("16:30"));
    expect(first).toMatchObject({ kind: "live", listeners: 37, started: true });
    expect(second).toMatchObject({ kind: "live", listeners: 41, started: false });

    const all = await attendance.listServices(1);
    expect(all).toHaveLength(1);
    expect(all[0].service).toMatchObject({ title: "Midweek Service", startedAt: at("16:24"), endedAt: null, scheduledStart: at("16:30"), scheduledEnd: at("18:30") });
    expect(all[0].readings).toEqual([
      { at: at("16:25"), listeners: 37 },
      { at: at("16:30"), listeners: 41 },
    ]);
  });

  it("stores one reading per five-minute slot, so the timer and a cron call can both run", async () => {
    await attendance.recordSnapshot(1, live(37), at("18:00") + 250);
    await attendance.recordSnapshot(1, live(38), at("18:00") + 4_000);
    // A timer that fired a moment early is still the 6:00 reading, and the nearest to it.
    await attendance.recordSnapshot(1, live(39), at("18:00") - 40);
    const [{ readings }] = await attendance.listServices(1);
    expect(readings).toEqual([{ at: at("18:00") - 40, listeners: 39 }]);
  });

  it("keeps the reading nearest the mark when a late cron call got to the slot first", async () => {
    await attendance.recordSnapshot(1, live(10), at("17:57") + 31_000);
    await attendance.recordSnapshot(1, live(20), at("18:00") + 250);
    const [{ readings }] = await attendance.listServices(1);
    expect(readings).toEqual([{ at: at("18:00") + 250, listeners: 20 }]);
  });

  it("makes one service when two pollers see a broadcast Mixlr gives no start time for", async () => {
    await Promise.all([
      attendance.recordSnapshot(1, live(37, { startedAt: null }), at("16:25") + 250),
      attendance.recordSnapshot(1, live(37, { startedAt: null }), at("16:25") + 40_000),
    ]);
    expect(await attendance.listServices(1)).toHaveLength(1);
  });

  it("makes one service when two pollers see it go live at the same moment", async () => {
    const results = await Promise.all([attendance.recordSnapshot(1, live(37), at("16:25")), attendance.recordSnapshot(1, live(37), at("16:25") + 30)]);
    expect(results.filter((r) => r.kind === "live" && r.started)).toHaveLength(1);
    const all = await attendance.listServices(1);
    expect(all).toHaveLength(1);
    expect(all[0].readings).toHaveLength(1);
  });

  it("ends the service at its last reading once the channel is off air", async () => {
    await attendance.recordSnapshot(1, live(37), at("18:25"));
    await attendance.recordSnapshot(1, live(30), at("18:30"));
    expect(await attendance.recordSnapshot(1, OFF, at("18:35"))).toEqual({ kind: "off-air" });
    const [{ service }] = await attendance.listServices(1);
    expect(service.endedAt).toBe(at("18:30"));
  });

  it("ends a service the poller lost sight of at its last reading, not when the poller came back", async () => {
    await attendance.recordSnapshot(1, live(37), at("18:30"));
    await attendance.recordSnapshot(1, OFF, at("09:00", "2026-11-12"));
    const [{ service }] = await attendance.listServices(1);
    expect(service.endedAt).toBe(at("18:30"));
  });

  it("carries on the same service when the broadcast drops and comes back under the same event", async () => {
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    await attendance.recordSnapshot(1, OFF, at("17:05"));
    await attendance.recordSnapshot(1, live(35, { uid: "uid-2", startedAt: at("17:08") }), at("17:10"));
    const all = await attendance.listServices(1);
    expect(all).toHaveLength(1);
    expect(all[0].service).toMatchObject({ startedAt: at("16:24"), endedAt: null });
    expect(all[0].readings.map((r) => r.listeners)).toEqual([37, 35]);
  });

  it("starts a new service when Mixlr reuses the event on another day", async () => {
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    await attendance.recordSnapshot(1, OFF, at("18:35"));
    await attendance.recordSnapshot(1, live(50, { uid: "uid-9", startedAt: at("16:20", "2026-11-18") }), at("16:25", "2026-11-18"));
    const all = await attendance.listServices(1);
    expect(all.map((s) => s.service.startedAt)).toEqual([at("16:20", "2026-11-18"), at("16:24")]);
    expect(all.map((s) => s.readings.length)).toEqual([1, 1]);
  });

  it("ends the last service when a different one is on air", async () => {
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    await attendance.recordSnapshot(1, live(12, { eventId: "777", uid: "uid-3", title: "Night Vigil", startedAt: at("21:58") }), at("22:00"));
    const all = await attendance.listServices(1);
    expect(all.map((s) => [s.service.title, s.service.endedAt])).toEqual([
      ["Night Vigil", null],
      ["Midweek Service", at("17:00")],
    ]);
  });

  it("keys an unscheduled broadcast by the broadcast itself", async () => {
    await attendance.recordSnapshot(1, live(5, { eventId: null, uid: "adhoc-1" }), at("17:00"));
    await attendance.recordSnapshot(1, live(6, { eventId: null, uid: "adhoc-1" }), at("17:05"));
    await attendance.recordSnapshot(1, live(7, { eventId: null, uid: "adhoc-2", startedAt: at("17:08") }), at("17:10"));
    expect((await attendance.listServices(1)).map((s) => s.readings.length)).toEqual([1, 2]);
  });

  it("records the service but no reading when Mixlr gives no listener count", async () => {
    expect(await attendance.recordSnapshot(1, live(null), at("17:00"))).toMatchObject({ kind: "live", listeners: null });
    const [entry] = await attendance.listServices(1);
    expect(entry.readings).toEqual([]);
    // With no reading to end at, it ends where it began.
    await attendance.recordSnapshot(1, OFF, at("17:05"));
    expect((await attendance.listServices(1))[0].service.endedAt).toBe(at("16:24"));
  });

  it("follows a title corrected on Mixlr mid-service", async () => {
    await attendance.recordSnapshot(1, live(37, { title: "Midwek Service" }), at("17:00"));
    await attendance.recordSnapshot(1, live(37, { title: "Midweek Service" }), at("17:05"));
    expect((await attendance.listServices(1))[0].service.title).toBe("Midweek Service");
  });

  it("links a new service to the branch's active service order, and to none when there isn't one", async () => {
    await attendance.recordSnapshot(1, live(3, { eventId: "1" }), at("09:00"));
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");
    await setlists.updateSetlist(1, order.id, { active: true });
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    expect((await attendance.listServices(1)).map((s) => s.service.setlistId)).toEqual([order.id, null]);
  });

  it("keeps each branch's services to itself", async () => {
    const other = await branches.createBranch({ name: "CLC Lagos", churchPin: "lagos-church-1", adminPin: null });
    if (typeof other === "string") throw new Error(other);
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    await attendance.recordSnapshot(other.id, live(12, { eventId: "900", uid: "lagos-1" }), at("17:00"));
    // Lagos going off air does not end Ilorin's service.
    await attendance.recordSnapshot(other.id, OFF, at("17:05"));

    const ilorin = await attendance.listServices(1);
    const lagos = await attendance.listServices(other.id);
    expect(ilorin).toHaveLength(1);
    expect(ilorin[0].service.endedAt).toBeNull();
    expect(lagos).toHaveLength(1);
    expect(lagos[0].service.endedAt).toBe(at("17:00"));
    expect(await attendance.findService(other.id, ilorin[0].service.id)).toBeNull();
  });
});

describe("the service order a service used", () => {
  it("can be changed and cleared", async () => {
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    const [{ service }] = await attendance.listServices(1);
    const order = await setlists.createSetlist(1, "Midweek 11 Nov");

    expect(await attendance.linkSetlist(1, service.id, order.id)).toMatchObject({ id: service.id, setlistId: order.id });
    expect(await attendance.linkSetlist(1, service.id, null)).toMatchObject({ setlistId: null });
  });

  it("refuses another branch's service order, and a service that is gone", async () => {
    const other = await branches.createBranch({ name: "CLC Lagos", churchPin: "lagos-church-1", adminPin: null });
    if (typeof other === "string") throw new Error(other);
    const theirs = await setlists.createSetlist(other.id, "Lagos Sunday");
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    const [{ service }] = await attendance.listServices(1);

    expect(await attendance.linkSetlist(1, service.id, theirs.id)).toBe("no-setlist");
    expect(await attendance.linkSetlist(1, 9999, null)).toBe("gone");
    expect(await attendance.linkSetlist(other.id, service.id, theirs.id)).toBe("gone");
  });
});

describe("deleteService", () => {
  it("removes the service and its readings, and only for its own branch", async () => {
    await attendance.recordSnapshot(1, live(37), at("17:00"));
    const [{ service }] = await attendance.listServices(1);
    expect(await attendance.deleteService(2, service.id)).toBe(false);
    expect(await attendance.deleteService(1, service.id)).toBe(true);
    expect(await attendance.listServices(1)).toEqual([]);
    expect(await attendance.deleteService(1, service.id)).toBe(false);
  });
});

describe("pollAttendance", () => {
  const answer = (snapshot: MixlrSnapshot): MixlrResult => ({ kind: "ok", snapshot });

  it("looks at no channel until a branch has one", async () => {
    const look = vi.fn(async () => answer(live(37)));
    expect(await poll.pollAttendance(at("17:00"), look)).toEqual([]);
    expect(look).not.toHaveBeenCalled();
  });

  it("records each branch from its own channel", async () => {
    const other = await branches.createBranch({ name: "CLC Lagos", churchPin: "lagos-church-1", adminPin: null });
    if (typeof other === "string") throw new Error(other);
    await attendance.setChannel(1, "clc-ilorin");
    await attendance.setChannel(other.id, "clc-lagos");

    const outcomes = await poll.pollAttendance(at("17:00"), async (channel) => answer(channel === "clc-ilorin" ? live(37) : OFF));
    expect(outcomes).toMatchObject([
      { branchId: 1, channel: "clc-ilorin", kind: "live", listeners: 37 },
      { branchId: other.id, channel: "clc-lagos", kind: "off-air" },
    ]);
    expect(await attendance.listServices(1)).toHaveLength(1);
    expect(await attendance.listServices(other.id)).toHaveLength(0);
  });

  it("leaves a service open when Mixlr can't be reached: couldn't look is not off air", async () => {
    await attendance.setChannel(1, "clc-ilorin");
    await poll.pollAttendance(at("17:00"), async () => answer(live(37)));
    const outcomes = await poll.pollAttendance(at("17:05"), async () => ({ kind: "unreachable", reason: "timeout" }));
    expect(outcomes).toEqual([{ branchId: 1, channel: "clc-ilorin", kind: "unreachable", reason: "timeout" }]);
    expect((await attendance.listServices(1))[0].service.endedAt).toBeNull();

    await poll.pollAttendance(at("17:10"), async () => answer(live(40)));
    expect((await attendance.listServices(1))[0].readings.map((r) => r.listeners)).toEqual([37, 40]);
  });

  it("carries on with the other branches when one throws", async () => {
    const other = await branches.createBranch({ name: "CLC Lagos", churchPin: "lagos-church-1", adminPin: null });
    if (typeof other === "string") throw new Error(other);
    await attendance.setChannel(1, "clc-ilorin");
    await attendance.setChannel(other.id, "clc-lagos");
    const outcomes = await poll.pollAttendance(at("17:00"), async (channel) => {
      if (channel === "clc-ilorin") throw new Error("boom");
      return answer(live(12, { eventId: "900" }));
    });
    expect(outcomes.map((o) => o.kind)).toEqual(["failed", "live"]);
  });

  it("ends the open service when Mixlr says the channel no longer exists", async () => {
    await attendance.setChannel(1, "clc-ilorin");
    await poll.pollAttendance(at("17:00"), async () => answer(live(37)));
    await poll.pollAttendance(at("17:05"), async () => ({ kind: "not-found" }));
    expect((await attendance.listServices(1))[0].service.endedAt).toBe(at("17:00"));
  });

  it("ends the open service when the channel is cleared or changed", async () => {
    await attendance.setChannel(1, "clc-ilorin");
    await poll.pollAttendance(at("17:00"), async () => answer(live(37)));
    await attendance.setChannel(1, null);
    expect((await attendance.listServices(1))[0].service.endedAt).toBe(at("17:00"));
  });

  it("stops looking once the channel is cleared", async () => {
    await attendance.setChannel(1, "clc-ilorin");
    await attendance.setChannel(1, null);
    expect(await attendance.getChannel(1)).toBeNull();
    expect(await poll.pollAttendance(at("17:00"), async () => answer(live(37)))).toEqual([]);
  });
});

describe("startAttendanceTimer", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps one loop when it is restarted while a round is running (a dev reload)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    poll.startAttendanceTimer();
    vi.advanceTimersByTime(5 * MIN + 1_000); // the first round starts
    poll.startAttendanceTimer(); // reload while it runs
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("untilNextPoll", () => {
  it("waits for the next five-minute mark on the clock, and a hair past it", () => {
    expect(poll.untilNextPoll(at("17:58"))).toBe(2 * MIN + 250);
    expect(poll.untilNextPoll(at("18:00"))).toBe(5 * MIN + 250);
    expect(poll.untilNextPoll(at("18:04") + 59_999)).toBe(251);
  });
});
