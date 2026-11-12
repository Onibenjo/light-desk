import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, max, ne } from "drizzle-orm";
import { db } from "./index";
import { branches, listenerReadings, services, setlists } from "./schema";
import type { MixlrSnapshot } from "@/lib/mixlr";
import { POLL_MS, type Reading } from "@/lib/attendance";

/**
 * A service as it goes over the wire. Times are epoch milliseconds, not the ISO
 * strings setlists use: nothing here is echoed back as a version, and
 * everything done with these on either side is arithmetic.
 */
export interface ServiceRecord {
  id: number;
  title: string;
  startedAt: number;
  /** Null while the service is on air. */
  endedAt: number | null;
  scheduledStart: number | null;
  scheduledEnd: number | null;
  setlistId: number | null;
}

export interface ServiceWithReadings {
  service: ServiceRecord;
  /** Oldest first. */
  readings: Reading[];
}

type Row = typeof services.$inferSelect;

const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());
const date = (n: number | null): Date | null => (n === null ? null : new Date(n));

function toRecord(row: Row): ServiceRecord {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.startedAt.getTime(),
    endedAt: ms(row.endedAt),
    scheduledStart: ms(row.scheduledStart),
    scheduledEnd: ms(row.scheduledEnd),
    setlistId: row.setlistId,
  };
}

/** This service, and only if it belongs to this branch. */
function owned(branchId: number, id: number) {
  return and(eq(services.branchId, branchId), eq(services.id, id));
}

// ---------------------------------------------------------------------------
// The branch's Mixlr channel. Kept here rather than on `Branch`: only
// attendance reads it, and a session check has no use for it on every request.
// ---------------------------------------------------------------------------

export async function getChannel(branchId: number): Promise<string | null> {
  const [row] = await db.select({ channel: branches.mixlrChannel }).from(branches).where(eq(branches.id, branchId)).limit(1);
  return row?.channel ?? null;
}

/**
 * Null stops recording for the branch; what is already recorded stays. A
 * service still on air is ended at its last reading when the channel is
 * cleared or changed: nothing will read the old channel again to end it.
 */
export async function setChannel(branchId: number, channel: string | null): Promise<void> {
  if ((await getChannel(branchId)) !== channel) await closeOpen(branchId, null);
  await db.update(branches).set({ mixlrChannel: channel }).where(eq(branches.id, branchId));
}

/** Ends whatever the branch had on air: Mixlr says its channel no longer exists. */
export async function endOpenServices(branchId: number): Promise<void> {
  await closeOpen(branchId, null);
}

/** Every branch the poller has to look at. */
export async function branchesWithChannel(): Promise<{ branchId: number; channel: string }[]> {
  const rows = await db.select({ branchId: branches.id, channel: branches.mixlrChannel }).from(branches).where(isNotNull(branches.mixlrChannel)).orderBy(asc(branches.id));
  return rows.flatMap((r) => (r.channel ? [{ branchId: r.branchId, channel: r.channel }] : []));
}

// ---------------------------------------------------------------------------
// Recording what the poller saw.
// ---------------------------------------------------------------------------

/**
 * A broadcast that reappears under the same Mixlr event this soon after the
 * last reading is the same service coming back (the encoder dropped, the
 * laptop slept). Later than this it is another occasion using the same event —
 * Mixlr lets one be reused — and gets a record of its own.
 */
const REJOIN_MS = 3 * 60 * 60 * 1000;

export type Recorded =
  | { kind: "off-air" }
  /** `listeners` is null when Mixlr gave no count, so no reading was stored. `started` on the reading that opened the record. */
  | { kind: "live"; serviceId: number; listeners: number | null; started: boolean };

async function lastReadingAt(serviceId: number): Promise<number | null> {
  const [row] = await db.select({ at: max(listenerReadings.at) }).from(listenerReadings).where(eq(listenerReadings.serviceId, serviceId));
  return row?.at ?? null;
}

/**
 * Ends every service of the branch still marked on air, except `keep`. The end
 * is the last time it was seen live — its last reading — not now: the poller
 * may have been away, and a service that ended on Sunday did not last until
 * the server came back on Monday.
 */
async function closeOpen(branchId: number, keep: number | null): Promise<void> {
  const open = await db
    .select({ id: services.id, startedAt: services.startedAt })
    .from(services)
    .where(and(eq(services.branchId, branchId), isNull(services.endedAt), keep === null ? undefined : ne(services.id, keep)));
  for (const s of open) {
    const last = await lastReadingAt(s.id);
    await db
      .update(services)
      .set({ endedAt: new Date(last ?? s.startedAt.getTime()) })
      .where(eq(services.id, s.id));
  }
}

/** Half a slot: `listener_readings_slot` (schemaSql.ts) files a reading under the five-minute mark nearest it. */
const HALF_SLOT = POLL_MS / 2;

/**
 * One reading per service per five-minute slot. When the slot is taken (the
 * timer and a cron call both ran), the reading nearer the mark stays: a cron
 * call at 5:57:31 must not keep the 6:00 slot from the timer's 6:00 reading.
 */
async function storeReading(serviceId: number, at: number, listeners: number): Promise<void> {
  const inserted = await db.insert(listenerReadings).values({ serviceId, at, listeners }).onConflictDoNothing().returning({ id: listenerReadings.id });
  if (inserted.length > 0) return;
  const mark = Math.floor((at + HALF_SLOT) / POLL_MS) * POLL_MS;
  const [taken] = await db
    .select({ id: listenerReadings.id, at: listenerReadings.at })
    .from(listenerReadings)
    .where(and(eq(listenerReadings.serviceId, serviceId), gte(listenerReadings.at, mark - HALF_SLOT), lt(listenerReadings.at, mark + HALF_SLOT)))
    .limit(1);
  if (taken && Math.abs(at - mark) < Math.abs(taken.at - mark)) {
    await db.update(listenerReadings).set({ at, listeners }).where(eq(listenerReadings.id, taken.id));
  }
}

/**
 * Writes one look at a branch's channel into the record.
 *
 * Off air: any service still open is ended. Live: the service the broadcast
 * belongs to is found or made, anything else still open is ended, and the
 * listener count is stored as a reading.
 *
 * Safe to run twice at once (the in-process timer and a cron call landing
 * together, or two instances): the service row and the reading are both
 * written with INSERT … ON CONFLICT DO NOTHING against unique indexes, so the
 * loser of either race writes nothing and reads back the winner's row.
 *
 * A new service starts linked to the branch's active service order, since that
 * is the one on the desk as it goes live; the operator can change it after.
 */
export async function recordSnapshot(branchId: number, snapshot: MixlrSnapshot, now: number): Promise<Recorded> {
  const { broadcast, event } = snapshot;
  if (!snapshot.live || !broadcast) {
    await closeOpen(branchId, null);
    return { kind: "off-air" };
  }

  const key = event ? `event:${event.id}` : `broadcast:${broadcast.uid}`;
  const title = event?.title ?? broadcast.title;
  // Without Mixlr's start, every poller would use its own `now` and the once-only index could never catch two
  // pollers opening the same service; the start of the five-minute slot is the same for both.
  const startedAt = broadcast.startedAt ?? Math.floor(now / POLL_MS) * POLL_MS;

  const [latest] = await db
    .select()
    .from(services)
    .where(and(eq(services.branchId, branchId), eq(services.mixlrKey, key)))
    .orderBy(desc(services.startedAt))
    .limit(1);
  let row: Row | undefined;
  if (latest) {
    const lastSeen = (await lastReadingAt(latest.id)) ?? latest.startedAt.getTime();
    if (now - lastSeen <= REJOIN_MS) row = latest;
  }

  let started = false;
  if (!row) {
    const [active] = await db
      .select({ id: setlists.id })
      .from(setlists)
      .where(and(eq(setlists.branchId, branchId), eq(setlists.active, true)))
      .limit(1);
    const inserted = await db
      .insert(services)
      .values({ branchId, mixlrKey: key, title, startedAt: new Date(startedAt), setlistId: active?.id ?? null, createdAt: new Date(now) })
      .onConflictDoNothing()
      .returning({ id: services.id });
    started = inserted.length > 0;
    [row] = await db
      .select()
      .from(services)
      .where(and(eq(services.branchId, branchId), eq(services.mixlrKey, key), eq(services.startedAt, new Date(startedAt))))
      .limit(1);
    if (!row) throw new Error(`service ${key} for branch ${branchId} was neither inserted nor found`);
  }

  // The title and schedule follow Mixlr (someone fixes a typo mid-service), and a service that had ended is on air again.
  await db
    .update(services)
    .set({ title, scheduledStart: date(event?.startsAt ?? null), scheduledEnd: date(event?.endsAt ?? null), endedAt: null })
    .where(eq(services.id, row.id));
  await closeOpen(branchId, row.id);

  if (broadcast.listeners !== null) await storeReading(row.id, now, broadcast.listeners);
  return { kind: "live", serviceId: row.id, listeners: broadcast.listeners, started };
}

// ---------------------------------------------------------------------------
// Reading the record back.
// ---------------------------------------------------------------------------

async function readingsFor(ids: number[]): Promise<Map<number, Reading[]>> {
  const byService = new Map<number, Reading[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return byService;
  const rows = await db
    .select({ serviceId: listenerReadings.serviceId, at: listenerReadings.at, listeners: listenerReadings.listeners })
    .from(listenerReadings)
    .where(inArray(listenerReadings.serviceId, ids))
    .orderBy(asc(listenerReadings.at));
  for (const r of rows) byService.get(r.serviceId)?.push({ at: r.at, listeners: r.listeners });
  return byService;
}

/** How many services the list shows. Two a week for a year; older ones are still in the database and its backups. */
export const SERVICE_LIMIT = 120;

/** The branch's services, newest first, each with its readings. */
export async function listServices(branchId: number, limit = SERVICE_LIMIT): Promise<ServiceWithReadings[]> {
  const rows = await db.select().from(services).where(eq(services.branchId, branchId)).orderBy(desc(services.startedAt)).limit(limit);
  const readings = await readingsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ service: toRecord(r), readings: readings.get(r.id) ?? [] }));
}

export async function findService(branchId: number, id: number): Promise<ServiceWithReadings | null> {
  const [row] = await db.select().from(services).where(owned(branchId, id)).limit(1);
  if (!row) return null;
  const readings = await readingsFor([row.id]);
  return { service: toRecord(row), readings: readings.get(row.id) ?? [] };
}

/**
 * Says which service order a service used, or (null) that none is recorded.
 * "no-setlist" when the service order is not this branch's or is gone.
 */
export async function linkSetlist(branchId: number, id: number, setlistId: number | null): Promise<ServiceRecord | "gone" | "no-setlist"> {
  if (setlistId !== null) {
    const [found] = await db
      .select({ id: setlists.id })
      .from(setlists)
      .where(and(eq(setlists.branchId, branchId), eq(setlists.id, setlistId)))
      .limit(1);
    if (!found) return "no-setlist";
  }
  const [row] = await db.update(services).set({ setlistId }).where(owned(branchId, id)).returning();
  return row ? toRecord(row) : "gone";
}

/** Removes a service and its readings: a sound check that went out on air, a test broadcast. */
export async function deleteService(branchId: number, id: number): Promise<boolean> {
  const [row] = await db.select({ id: services.id }).from(services).where(owned(branchId, id)).limit(1);
  if (!row) return false;
  // Readings first: they reference the service. One batch, so a service is never left without its readings or the other way round.
  await db.batch([db.delete(listenerReadings).where(eq(listenerReadings.serviceId, id)), db.delete(services).where(owned(branchId, id))]);
  return true;
}
