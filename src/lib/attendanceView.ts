/**
 * What the attendance routes send and the attendance pages read: one place for
 * the shapes, the code that builds them, and the guards that check them on
 * arrival, so the two sides cannot drift apart.
 */
import type { ServiceRecord, ServiceWithReadings } from "@/db/attendance";
import { halfHourMarks, summarise, type Mark, type Reading, type Summary } from "./attendance";

/** One row of the list at /attendance. */
export interface ServiceSummary {
  id: number;
  title: string;
  startedAt: number;
  endedAt: number | null;
  /** How many readings were taken. */
  readings: number;
  average: number | null;
  basis: Summary["basis"];
  peak: number | null;
  /** The most recent reading: what "listening now" shows while the service is on air. */
  latest: Reading | null;
  /** The service order used, by name. Null when none is recorded or it has since been deleted. */
  setlistName: string | null;
}

export interface AttendanceList {
  branch: string;
  /** The branch's Mixlr channel name. Null until an admin sets it; nothing is recorded before then. */
  channel: string | null;
  /** True on a device unlocked with the admin PIN: it may set the channel and delete a service. */
  admin: boolean;
  services: ServiceSummary[];
}

export interface ServiceDetail {
  branch: string;
  admin: boolean;
  service: ServiceRecord;
  readings: Reading[];
  marks: Mark[];
  summary: Summary;
  /** The service order used, with its items' titles in order. */
  setlist: { id: number; name: string; items: { kind: string; title: string }[] } | null;
  /** Every service order of the branch, to choose from. */
  setlists: { id: number; name: string; active: boolean }[];
}

/** The half-hour marks and the summary for one service: the one place both routes get them from. */
export function figures({ service, readings }: ServiceWithReadings, now: number = Date.now()): { marks: Mark[]; summary: Summary } {
  const marks = halfHourMarks(readings, service.startedAt, service.scheduledStart, service.endedAt === null ? now : Infinity);
  return { marks, summary: summarise(readings, marks) };
}

export function toSummary(entry: ServiceWithReadings, setlistName: string | null): ServiceSummary {
  const { service, readings } = entry;
  const { summary } = figures(entry);
  return {
    id: service.id,
    title: service.title,
    startedAt: service.startedAt,
    endedAt: service.endedAt,
    readings: readings.length,
    average: summary.average,
    basis: summary.basis,
    peak: summary.peak?.listeners ?? null,
    latest: readings.length > 0 ? readings[readings.length - 1] : null,
    setlistName,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Enough to tell the list from a proxy's page or someone else's JSON. */
export function isAttendanceList(v: unknown): v is AttendanceList {
  return isRecord(v) && typeof v.branch === "string" && (v.channel === null || typeof v.channel === "string") && Array.isArray(v.services);
}

export function isServiceDetail(v: unknown): v is ServiceDetail {
  return isRecord(v) && isRecord(v.service) && typeof v.service.id === "number" && Array.isArray(v.readings) && Array.isArray(v.marks) && isRecord(v.summary) && Array.isArray(v.setlists);
}
