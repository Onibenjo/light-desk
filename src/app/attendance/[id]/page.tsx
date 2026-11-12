"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import Icon from "../../Icon";
import PageShell from "../../PageShell";
import Problem from "../../Problem";
import Toast, { copyText, useToast } from "../../Toast";
import { useArmed } from "../../useArmed";
import { failureFrom, getJson, OFFLINE, type Failure } from "@/lib/apiError";
import { attendanceReport, formatClock, formatDay, STALE_MS } from "@/lib/attendance";
import { isServiceDetail, type ServiceDetail } from "@/lib/attendanceView";

type PageState = { kind: "loading" } | { kind: "loaded"; data: ServiceDetail } | { kind: "failed"; failure: Failure };

/** While the service is on air the page asks again this often, so new readings appear without a reload. */
const REFRESH_MS = 60_000;

/** One headline number: the average, the peak, how many are listening now. */
function Stat({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-700 bg-ink-950/40 px-3 py-3 sm:px-4">
      <p className="eyebrow">{label}</p>
      <p className="display mt-2 text-[34px] tabular-nums sm:text-[48px]">{value ?? "–"}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--muted)] sm:text-sm">{note}</p>
    </div>
  );
}

/**
 * One service: the listener count at each half hour, the average and the
 * peak, the report to send, and the service order that was used. Everything
 * the media team used to write down by hand during the service, already
 * written down.
 */
export default function ServicePage() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ failure: Failure; lead: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { toast, showToast } = useToast();
  const armed = useArmed<number>();

  const load = useCallback(async () => {
    const result = await getJson(`/api/attendance/${encodeURIComponent(id)}`, isServiceDetail);
    setNow(Date.now());
    // A refresh that fails keeps the numbers already on screen.
    setState((prev) => (result.ok ? { kind: "loaded", data: result.data } : prev.kind === "loaded" ? prev : { kind: "failed", failure: result.failure }));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the service on mount is the effect's whole job
    void load();
  }, [load]);

  const data = state.kind === "loaded" ? state.data : null;
  const onAir = data !== null && data.service.endedAt === null;

  useEffect(() => {
    if (!onAir) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [onAir, load]);

  /** Sends one change to this service; true when it went through. */
  async function send(init: RequestInit, lead: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/attendance/${encodeURIComponent(id)}`, { ...init, headers: { "Content-Type": "application/json" } });
      } catch {
        setNotice({ failure: OFFLINE, lead });
        return false;
      }
      if (!res.ok) {
        setNotice({ failure: await failureFrom(res), lead });
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function chooseSetlist(value: string) {
    const setlistId = value === "" ? null : Number(value);
    if (await send({ method: "PATCH", body: JSON.stringify({ setlistId }) }, "Not saved.")) {
      await load();
      showToast(setlistId === null ? "Saved — no service order for this service" : "Saved the service order for this service", "ok");
    }
  }

  async function remove() {
    if (await send({ method: "DELETE" }, "Not deleted.")) router.push("/attendance");
  }

  const back = (
    <Link href="/attendance" className="btn btn-quiet btn-sm -ml-2 self-start">
      <Icon name="back" className="h-4 w-4" />
      Attendance
    </Link>
  );

  if (!data) {
    return (
      <PageShell title="Attendance">
        {back}
        {state.kind === "loading" && <p className="text-sm text-[var(--muted)]">Loading the service…</p>}
        {state.kind === "failed" && (
          <Problem failure={state.failure} lead="Couldn't load the service." onRetry={state.failure.kind === "refused" ? undefined : () => void load()} next={pathname} newTab={false} pin="church" />
        )}
      </PageShell>
    );
  }

  const { service, readings, marks, summary, setlist, setlists, branch } = data;
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  const stale = onAir && latest !== null && now - latest.at > STALE_MS;
  const highest = Math.max(1, ...marks.map((m) => m.listeners ?? 0));
  const report = attendanceReport({ title: service.title, branch, startedAt: service.startedAt, marks, summary });

  return (
    <PageShell title="Attendance">
      {back}

      <section className="card rise space-y-5 p-4 sm:p-5">
        <div>
          {onAir && (
            <p className="eyebrow mb-2 flex items-center gap-2">
              <span aria-hidden="true" className="tally tally-live" />
              On air now
            </p>
          )}
          <h2 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em] wrap-anywhere text-ink-50 sm:text-[26px]">{service.title}</h2>
          <p className="mt-2 text-[15px] text-ink-300">
            {formatDay(service.startedAt)} · {formatClock(service.startedAt)} – {service.endedAt === null ? "now" : formatClock(service.endedAt)} · {branch}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat
            label="Average"
            value={summary.average}
            note={summary.basis === "half-hour" ? "of the half-hour readings" : summary.basis === "all" ? "of every reading" : "no readings"}
          />
          <Stat label="Peak" value={summary.peak?.listeners ?? null} note={summary.peak ? `at ${formatClock(summary.peak.at)}` : "no readings"} />
          {onAir ? (
            <Stat label="Now" value={latest?.listeners ?? null} note={latest ? `listening at ${formatClock(latest.at)}` : "no reading yet"} />
          ) : (
            <Stat label="Readings" value={readings.length} note="every five minutes" />
          )}
        </div>

        {stale && latest && (
          <p className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
            No reading since {formatClock(latest.at)} — Lightdesk can&apos;t reach Mixlr, or the service has just ended.
          </p>
        )}
        {readings.length === 0 && !onAir && <p className="text-sm text-[var(--muted)]">Mixlr gave no listener count for this service, so there is nothing to report.</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              void copyText(report).then((ok) => showToast(ok ? "Copied the attendance report — paste in WhatsApp" : "Couldn't copy — try again", ok ? "ok" : "err"));
            }}
            disabled={readings.length === 0}
            className="btn btn-primary"
          >
            <Icon name="copy" className="h-4 w-4" />
            Copy report
          </button>
          {onAir && <p className="text-sm text-[var(--muted)]">The service is still on air — the report so far.</p>}
        </div>
      </section>

      <section className="card rise overflow-hidden">
        <div className="border-b border-ink-700 px-4 py-2 text-sm text-[var(--muted)]">Every half hour</div>
        {marks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            {readings.length === 0 ? "No readings yet." : onAir ? "The first half-hour reading hasn't come round yet." : "This service ended before its first half-hour reading, so the average is of every reading."}
          </p>
        ) : (
          <table className="w-full text-[15px]">
            <thead className="sr-only">
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Listeners</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {marks.map((m) => (
                <tr key={m.at}>
                  <th scope="row" className="w-24 px-4 py-2.5 text-left font-mono text-[14px] font-medium whitespace-nowrap text-ink-200 tabular-nums">
                    {formatClock(m.at)}
                  </th>
                  <td className="py-2.5 pr-4">
                    {m.listeners === null ? (
                      <span className="text-sm text-[var(--muted)]">No reading</span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (m.listeners / highest) * 100)}%` }} />
                        </span>
                        <span className="w-12 shrink-0 text-right font-mono font-medium text-ink-50 tabular-nums">{m.listeners}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {readings.length > 0 && (
          <details className="border-t border-ink-700">
            <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink-300 select-none hover:text-ink-50">
              Every reading ({readings.length})
            </summary>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 pb-4 font-mono text-[13px] tabular-nums sm:grid-cols-4">
              {readings.map((r) => (
                <li key={r.at} className="flex justify-between gap-3">
                  <span className="text-[var(--muted)]">{formatClock(r.at)}</span>
                  <span className="text-ink-100">{r.listeners}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card rise overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink-700 px-4 py-3">
          <label htmlFor="service-order" className="text-sm text-[var(--muted)]">
            Service order used
          </label>
          <select id="service-order" value={service.setlistId !== null && setlist ? String(service.setlistId) : ""} onChange={(e) => void chooseSetlist(e.target.value)} disabled={busy} className="field max-w-full min-w-0 py-1.5">
            <option value="">None</option>
            {setlists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.active ? " (active)" : ""}
              </option>
            ))}
          </select>
        </div>
        {setlist === null ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">
            {setlists.length === 0 ? (
              <>
                No service orders yet —{" "}
                <Link href="/setlists" className="link">
                  make one
                </Link>
                , then choose it here.
              </>
            ) : (
              "Choose the service order this service used, to keep the two together."
            )}
          </p>
        ) : setlist.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">Nothing in {setlist.name}.</p>
        ) : (
          <ol className="divide-y divide-ink-700">
            {setlist.items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 shrink-0 text-right font-mono text-[12px] text-[var(--muted)] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <Icon name={item.kind === "message" ? "message" : "music"} className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <span className="sr-only">{item.kind === "message" ? "Message: " : "Song: "}</span>
                <span className="min-w-0 flex-1 text-[15px] wrap-anywhere">{item.title}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {notice && <Problem failure={notice.failure} lead={notice.lead} next={pathname} newTab />}

      {data.admin && (
        <div className="flex flex-wrap items-center gap-3">
          <button {...armed.buttonProps(service.id, `this service and its ${readings.length === 1 ? "reading" : "readings"}`, () => void remove())} disabled={busy} className={`btn btn-sm ${armed.isArmed(service.id) ? "btn-armed" : "btn-danger"}`}>
            {armed.isArmed(service.id) ? "Confirm delete" : "Delete this service"}
          </button>
          <p className="text-sm text-[var(--muted)]">For a sound check or a test that went out on air.</p>
        </div>
      )}
      <p id={armed.regionId} role="status" aria-live="polite" className="sr-only">
        {armed.announcement}
      </p>

      <Toast toast={toast} />
    </PageShell>
  );
}
