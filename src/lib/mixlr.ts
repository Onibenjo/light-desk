/**
 * Reading a Mixlr channel's public page data: is it live, what is on, and how
 * many people are listening right now.
 *
 * Mixlr has no documented API for this. The channel page itself
 * (`https://<channel>.mixlr.com`) loads one JSON:API document, and that is what
 * this reads — no account, no key. Because nobody promised the shape, the
 * parser below trusts nothing: every field is checked for its type, and a
 * document it cannot read is "off air" or "unreadable", never a thrown error
 * inside the poller.
 */

/** Where the channel page gets its data. Overridable so tests and local runs can point at a stand-in. */
const DEFAULT_API = "https://apicdn.mixlr.com/v3/channel_view/";

/** Mixlr answers in well under a second; a hung request must not hold up the next branch. */
const TIMEOUT_MS = 10_000;

export interface MixlrBroadcast {
  /** Mixlr's own id for this one stretch of audio. A dropped connection that comes back is a new broadcast. */
  uid: string;
  title: string;
  /** Null when Mixlr leaves the count out: the event's listener stats are hidden. */
  listeners: number | null;
  /** When the audio began, in epoch milliseconds. Null if Mixlr did not say. */
  startedAt: number | null;
}

export interface MixlrEvent {
  id: string;
  title: string;
  /** The times the event was scheduled for, in epoch milliseconds. */
  startsAt: number | null;
  endsAt: number | null;
}

/** One look at a channel. `broadcast` is set exactly when something real is on air. */
export interface MixlrSnapshot {
  live: boolean;
  broadcast: MixlrBroadcast | null;
  /** The scheduled event the broadcast belongs to, when there is one. */
  event: MixlrEvent | null;
}

export type MixlrResult = { kind: "ok"; snapshot: MixlrSnapshot } | { kind: "not-found" } | { kind: "unreachable"; reason: string };

export const OFF_AIR: MixlrSnapshot = { live: false, broadcast: null, event: null };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** JSON:API ids are strings, but `event_id` on a broadcast is a number: both become the same string. */
const idOf = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(v) : text(v));

function instant(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** The id a JSON:API relationship points at: `relationships.<name>.data.id`. */
function related(resource: Rec, name: string): string | null {
  const rels = resource.relationships;
  if (!isRec(rels)) return null;
  const rel = rels[name];
  if (!isRec(rel) || !isRec(rel.data)) return null;
  return idOf(rel.data.id);
}

/**
 * What a `channel_view` document says is on air. Anything unexpected reads as
 * off air: a missed reading is recoverable, a made-up one is not.
 *
 * A "fallback" broadcast is Mixlr playing the channel's stand-by audio while
 * nobody is broadcasting. It has listeners, but it is not a service, so it
 * counts as off air.
 */
export function parseChannelView(json: unknown): MixlrSnapshot {
  if (!isRec(json) || !isRec(json.data)) return OFF_AIR;
  const channel = json.data;
  const included = Array.isArray(json.included) ? json.included.filter(isRec) : [];
  const find = (type: string, id: string | null) => (id === null ? undefined : included.find((r) => r.type === type && idOf(r.id) === id));
  const attrs = (r: Rec | undefined): Rec => (r && isRec(r.attributes) ? r.attributes : {});

  const channelAttrs = attrs(channel);
  // The channel names its current broadcast; if that pointer is missing, any included broadcast marked live will do.
  const broadcastRes = find("broadcast", related(channel, "current_broadcast")) ?? included.find((r) => r.type === "broadcast" && attrs(r).live === true);
  const b = attrs(broadcastRes);
  if (channelAttrs.live !== true || !broadcastRes || b.live === false || b.fallback === true) return OFF_AIR;

  // The event names the service, so its id matters more than its details: try the channel's pointer, then the
  // broadcast's own event_id, and keep the id even when Mixlr leaves the event itself out of the document.
  const pointer = related(channel, "live_event");
  const ownEvent = idOf(b.event_id);
  const eventRes = find("event", pointer) ?? find("event", ownEvent);
  const e = attrs(eventRes);
  const eventId = (eventRes ? idOf(eventRes.id) : null) ?? ownEvent ?? pointer;
  const count = b.listener_count;

  return {
    live: true,
    broadcast: {
      uid: text(b.uid) ?? idOf(broadcastRes.id) ?? "unknown",
      title: text(b.title) ?? text(e.title) ?? "Untitled broadcast",
      listeners: typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.round(count) : null,
      startedAt: instant(b.started_at),
    },
    event: eventId === null ? null : { id: eventId, title: text(e.title) ?? text(b.title) ?? "Untitled event", startsAt: instant(e.starts_at), endsAt: instant(e.ends_at) },
  };
}

/** A Mixlr channel name: the part before `.mixlr.com`. Letters, digits, hyphens and underscores. */
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/**
 * The channel name out of whatever was typed or pasted: `clc-ilorin`,
 * `clc-ilorin.mixlr.com`, `https://clc-ilorin.mixlr.com/events/123`, or the
 * older `mixlr.com/clc-ilorin`. Null when it is none of those.
 */
export function cleanMixlrChannel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const sub = /^([a-z0-9_-]+)\.mixlr\.com(?:[/?#].*)?$/.exec(value);
  const path = /^mixlr\.com\/([a-z0-9_-]+)(?:[/?#].*)?$/.exec(value);
  if (sub) value = sub[1];
  else if (path) value = path[1];
  return CHANNEL.test(value) ? value : null;
}

/** The address people open to listen, for links and for saying which channel is being read. */
export function channelUrl(channel: string): string {
  return `https://${channel}.mixlr.com`;
}

type Fetched = { kind: "ok"; body: Rec } | { kind: "not-found" } | { kind: "unreachable"; reason: string };

/** The channel's `channel_view` document, or why there isn't one. Never throws. */
async function fetchChannelView(channel: string): Promise<Fetched> {
  const base = process.env.MIXLR_API_BASE?.trim() || DEFAULT_API;
  let res: Response;
  try {
    res = await fetch(`${base}${encodeURIComponent(channel)}`, {
      headers: { accept: "application/json", "user-agent": "Lightdesk (church attendance record)" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { kind: "unreachable", reason: e instanceof Error ? e.message : "request failed" };
  }
  if (res.status === 404) return { kind: "not-found" };
  if (!res.ok) return { kind: "unreachable", reason: `Mixlr answered ${res.status}` };
  const body: unknown = await res.json().catch(() => null);
  if (!isRec(body) || !isRec(body.data)) return { kind: "unreachable", reason: "Mixlr's answer was not the channel data" };
  return { kind: "ok", body };
}

/**
 * One look at a channel. Never throws: a channel Mixlr does not have is
 * "not-found" (worth telling whoever typed it), and everything else that goes
 * wrong — no network, a timeout, a server error, a body that is not JSON — is
 * "unreachable" (worth trying again in five minutes, and nothing else).
 */
export async function fetchChannel(channel: string): Promise<MixlrResult> {
  const got = await fetchChannelView(channel);
  return got.kind === "ok" ? { kind: "ok", snapshot: parseChannelView(got.body) } : got;
}

/** What a service order can be named after: the event on air now, or the next one scheduled. */
export interface EventName {
  title: string;
  /** True when it is on air now; false for a scheduled one still to come. */
  live: boolean;
  startsAt: number | null;
}

/**
 * Mixlr keeps an event in `upcoming_events` long after it has passed (Ilorin's
 * listed one 1 July in November), so a scheduled event counts only from a
 * little before its start to a week ahead.
 */
const UPCOMING_FROM_MS = 3 * 60 * 60 * 1000;
const UPCOMING_UNTIL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The title to offer for a service order: the event on air now, else the
 * soonest upcoming event that is really still to come. Null when there is
 * neither, so the offer is not made.
 */
export function eventName(json: unknown, now: number): EventName | null {
  const snapshot = parseChannelView(json);
  if (snapshot.live && snapshot.broadcast) {
    const title = snapshot.event?.title ?? snapshot.broadcast.title;
    return { title, live: true, startsAt: snapshot.event?.startsAt ?? snapshot.broadcast.startedAt };
  }
  if (!isRec(json) || !isRec(json.data)) return null;
  const rels = json.data.relationships;
  const listed = isRec(rels) && isRec(rels.upcoming_events) && Array.isArray(rels.upcoming_events.data) ? rels.upcoming_events.data : [];
  const ids = new Set(listed.flatMap((r) => (isRec(r) ? [idOf(r.id)] : [])).filter((id): id is string => id !== null));
  const included = Array.isArray(json.included) ? json.included.filter(isRec) : [];
  const upcoming = included
    .filter((r) => r.type === "event" && ids.has(idOf(r.id) ?? ""))
    .map((r) => {
      const a = isRec(r.attributes) ? r.attributes : {};
      return { title: text(a.title), startsAt: instant(a.starts_at) };
    })
    .filter((e): e is { title: string; startsAt: number } => e.title !== null && e.startsAt !== null && e.startsAt >= now - UPCOMING_FROM_MS && e.startsAt <= now + UPCOMING_UNTIL_MS)
    .sort((a, b) => a.startsAt - b.startsAt);
  return upcoming[0] ? { title: upcoming[0].title, live: false, startsAt: upcoming[0].startsAt } : null;
}

/** The title to offer for a service order, from the channel itself. Null when Mixlr has none to give or can't be reached. */
export async function fetchEventName(channel: string, now: number = Date.now()): Promise<EventName | null> {
  const got = await fetchChannelView(channel);
  return got.kind === "ok" ? eventName(got.body, now) : null;
}
