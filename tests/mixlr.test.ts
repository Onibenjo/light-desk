// The Mixlr reader. The fixture is the channel page's own data as it looked
// during a midweek service; Mixlr documents none of it, so most of these tests
// are about what happens when the shape is not what the fixture shows.
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanMixlrChannel, fetchChannel, parseChannelView, OFF_AIR } from "../src/lib/mixlr";

const live = () => JSON.parse(readFileSync(join(__dirname, "fixtures", "mixlr-channel-live.json"), "utf8"));

describe("parseChannelView", () => {
  it("reads the broadcast on air, its listener count, and the event it belongs to", () => {
    expect(parseChannelView(live())).toEqual({
      live: true,
      broadcast: {
        uid: "f5ad63456c88135d3c237d70007e397b",
        title: "Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026",
        listeners: 37,
        startedAt: Date.parse("2026-11-11T16:24:00.000Z"),
      },
      event: {
        id: "5433702",
        title: "Prayers; The Handle of the Supernatural || Midweek Service || 11th November, 2026",
        startsAt: Date.parse("2026-11-11T16:30:00.000Z"),
        endsAt: Date.parse("2026-11-11T18:30:00.000Z"),
      },
    });
  });

  it("is off air when the channel says it is not live", () => {
    const doc = live();
    doc.data.attributes.live = false;
    expect(parseChannelView(doc)).toEqual(OFF_AIR);
  });

  it("is off air when the channel is live but names no broadcast", () => {
    const doc = live();
    delete doc.data.relationships.current_broadcast;
    doc.included = doc.included.filter((r: { type: string }) => r.type !== "broadcast");
    expect(parseChannelView(doc)).toEqual(OFF_AIR);
  });

  it("treats Mixlr's stand-by audio as off air: it has listeners but it is not a service", () => {
    const doc = live();
    doc.included[0].attributes.fallback = true;
    expect(parseChannelView(doc)).toEqual(OFF_AIR);
  });

  it("finds the live broadcast even when the channel's pointer to it is missing", () => {
    const doc = live();
    delete doc.data.relationships.current_broadcast;
    expect(parseChannelView(doc).broadcast?.listeners).toBe(37);
  });

  it("keeps a broadcast with no event, so an unscheduled service is still recorded", () => {
    const doc = live();
    delete doc.data.relationships.live_event;
    doc.included[0].attributes.event_id = null;
    const snapshot = parseChannelView(doc);
    expect(snapshot.live).toBe(true);
    expect(snapshot.event).toBeNull();
  });

  it("gives no count, rather than zero, when Mixlr leaves the listener count out", () => {
    const doc = live();
    delete doc.included[0].attributes.listener_count;
    const snapshot = parseChannelView(doc);
    expect(snapshot.live).toBe(true);
    expect(snapshot.broadcast?.listeners).toBeNull();
  });

  it.each([null, undefined, "<html>", 42, [], {}, { data: [] }, { data: { attributes: { live: true } }, included: "nope" }])("is off air for %j rather than throwing", (doc) => {
    expect(parseChannelView(doc)).toEqual(OFF_AIR);
  });
});

describe("cleanMixlrChannel", () => {
  it.each([
    ["clc-ilorin", "clc-ilorin"],
    ["  CLC-Ilorin ", "clc-ilorin"],
    ["clc-ilorin.mixlr.com", "clc-ilorin"],
    ["https://clc-ilorin.mixlr.com", "clc-ilorin"],
    ["https://clc-ilorin.mixlr.com/events/5433702?x=1", "clc-ilorin"],
    ["http://www.mixlr.com/citizensoflightchurch/", "citizensoflightchurch"],
    ["mixlr.com/citizensoflightchurch", "citizensoflightchurch"],
  ])("reads %j as %j", (typed, channel) => {
    expect(cleanMixlrChannel(typed)).toBe(channel);
  });

  it.each(["", "   ", "clc ilorin", "https://example.com/clc-ilorin", "clc-ilorin.mixlr.com.evil.example", "../etc/passwd", "a/b", 7, null])("refuses %j", (typed) => {
    expect(cleanMixlrChannel(typed)).toBeNull();
  });
});

describe("fetchChannel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MIXLR_API_BASE;
  });

  it("asks Mixlr for the channel and reads the answer", async () => {
    const fetched = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(live()), { status: 200 }));
    vi.stubGlobal("fetch", fetched);
    const result = await fetchChannel("clc-ilorin");
    expect(fetched.mock.calls[0][0]).toBe("https://apicdn.mixlr.com/v3/channel_view/clc-ilorin");
    expect(result.kind === "ok" && result.snapshot.broadcast?.listeners).toBe(37);
  });

  it("says so when Mixlr has no such channel", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    expect(await fetchChannel("no-such-channel")).toEqual({ kind: "not-found" });
  });

  it.each([
    ["the network is down", async () => Promise.reject(new TypeError("fetch failed"))],
    ["Mixlr has a server error", async () => new Response("oops", { status: 503 })],
    ["the answer is not JSON", async () => new Response("<html>captive portal</html>", { status: 200 })],
    ["the answer is some other JSON", async () => new Response('{"hello":"world"}', { status: 200 })],
  ])("is unreachable, not off air, when %s", async (_name, impl) => {
    vi.stubGlobal("fetch", impl);
    expect((await fetchChannel("clc-ilorin")).kind).toBe("unreachable");
  });
});
