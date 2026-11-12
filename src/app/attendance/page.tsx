"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "../Icon";
import PageShell from "../PageShell";
import Problem from "../Problem";
import { failureFrom, getJson, OFFLINE, type Failure } from "@/lib/apiError";
import { formatClock, formatDay, listenersLabel, STALE_MS } from "@/lib/attendance";
import { isAttendanceList, type AttendanceList, type ServiceSummary } from "@/lib/attendanceView";
import { channelUrl } from "@/lib/mixlr";

type PageState = { kind: "loading" } | { kind: "loaded"; data: AttendanceList } | { kind: "failed"; failure: Failure };

/** While a service is on air the page asks again this often, so "listening now" keeps up with the five-minute readings. */
const REFRESH_MS = 60_000;

/** "5:24pm – 7:35pm", or "5:24pm – now" while it is on air. */
function span(s: ServiceSummary): string {
  return `${formatClock(s.startedAt)} – ${s.endedAt === null ? "now" : formatClock(s.endedAt)}`;
}

/** One number with its caption: beside it under the title on a phone, above it at the row's right edge from sm up. */
function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[17px] leading-tight font-medium text-ink-50 tabular-nums sm:text-[19px]">{value ?? "–"}</span>
    </span>
  );
}

/**
 * The branch's attendance record: every service its Mixlr channel has
 * broadcast since the channel was set, with the average and peak number of
 * listeners. The readings are taken by the server on its own; this page only
 * shows them, so it works the same from the church laptop or a phone at home.
 */
export default function AttendancePage() {
  const pathname = usePathname();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Failure | null>(null);
  const [saved, setSaved] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const result = await getJson("/api/attendance", isAttendanceList);
    setNow(Date.now());
    // A refresh that fails keeps the numbers already on screen: a dropped connection mid-service must not blank the page.
    setState((prev) => (result.ok ? { kind: "loaded", data: result.data } : prev.kind === "loaded" ? prev : { kind: "failed", failure: result.failure }));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the record on mount is the effect's whole job
    void load();
  }, [load]);

  const data = state.kind === "loaded" ? state.data : null;
  const live = data?.services.find((s) => s.endedAt === null) ?? null;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  async function saveChannel() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setSaved("");
    try {
      let res: Response;
      try {
        res = await fetch("/api/attendance/channel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: draft }) });
      } catch {
        setNotice(OFFLINE);
        return;
      }
      if (!res.ok) {
        setNotice(await failureFrom(res));
        return;
      }
      const body = (await res.json().catch(() => null)) as { channel?: string | null; live?: boolean; listeners?: number | null } | null;
      setEditing(false);
      if (!body?.channel) setSaved("Saved — no channel is set, so nothing more is recorded");
      else if (body.live) setSaved(`Saved — the channel is live now${typeof body.listeners === "number" ? ` with ${listenersLabel(body.listeners)}` : ""}. The first reading is taken within five minutes`);
      else setSaved("Saved — recording starts by itself when the channel next goes live");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const showField = data !== null && (data.channel === null || editing);
  const stale = live?.latest ? now - live.latest.at > STALE_MS : false;

  return (
    <PageShell title="Attendance" purpose="How many people listened on Mixlr at each service, read every five minutes while it is live and reported every half hour.">
      {state.kind === "loading" && <p className="text-sm text-[var(--muted)]">Loading the attendance record…</p>}
      {state.kind === "failed" && <Problem failure={state.failure} lead="Couldn't load the attendance record." onRetry={() => void load()} next={pathname} newTab={false} pin="church" />}

      {data && (
        <>
          <section className="card rise space-y-3 p-4">
            <p className="eyebrow">Mixlr channel</p>
            {data.channel !== null && !editing && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="min-w-0 text-[15px] wrap-anywhere">
                  Reading{" "}
                  <a href={channelUrl(data.channel)} target="_blank" rel="noopener noreferrer" className="link">
                    {data.channel}.mixlr.com
                  </a>{" "}
                  for {data.branch}.
                </p>
                <button
                  onClick={() => {
                    setDraft(data.channel ?? "");
                    setNotice(null);
                    setSaved("");
                    setEditing(true);
                  }}
                  className="btn btn-sm"
                >
                  Change
                </button>
              </div>
            )}
            {showField && (
              <>
                {data.channel === null && (
                  <p className="max-w-prose text-[15px] leading-relaxed text-ink-300">
                    Enter the address of {data.branch}&apos;s Mixlr channel. From then on, whenever the channel is live, Lightdesk reads the number of listeners every five minutes and keeps it here. Nobody has to have this page open.
                  </p>
                )}
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveChannel();
                  }}
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Mixlr channel address"
                    placeholder="e.g. clc-ilorin.mixlr.com"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="field min-w-0 flex-1 font-mono"
                  />
                  <button type="submit" disabled={busy || (data.channel === null && !draft.trim())} className="btn btn-primary shrink-0">
                    {busy ? "Checking with Mixlr…" : "Save"}
                  </button>
                  {editing && (
                    <button type="button" onClick={() => setEditing(false)} disabled={busy} className="btn shrink-0">
                      Cancel
                    </button>
                  )}
                </form>
                {editing && <p className="text-sm text-[var(--muted)]">Leave it empty and save to stop recording. Services already recorded stay.</p>}
              </>
            )}
            {notice && <Problem failure={notice} lead="Not saved." next={pathname} newTab />}
            <p role="status" className="text-sm text-[var(--muted)] empty:hidden">
              {saved}
            </p>
          </section>

          {live && (
            <section className="card rise border-ink-600 p-4">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <p className="eyebrow flex items-center gap-2">
                    <span aria-hidden="true" className="tally tally-live" />
                    On air now
                  </p>
                  <Link href={`/attendance/${live.id}`} className="link mt-2 block text-[17px] leading-snug font-semibold wrap-anywhere">
                    {live.title}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--muted)]">Since {formatClock(live.startedAt)}</p>
                </div>
                {live.latest ? (
                  <p className="sm:text-right">
                    <span className="display block text-[44px] tabular-nums">{live.latest.listeners}</span>
                    <span className="text-sm text-[var(--muted)]">listening at {formatClock(live.latest.at)}</span>
                  </p>
                ) : (
                  <p className="text-sm text-[var(--muted)]">First reading within five minutes</p>
                )}
              </div>
              {stale && live.latest && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                  <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
                  No reading since {formatClock(live.latest.at)} — Lightdesk can&apos;t reach Mixlr, or the service has just ended.
                </p>
              )}
            </section>
          )}

          <section className="card rise overflow-hidden">
            <div className="border-b border-ink-700 px-4 py-2 text-sm text-[var(--muted)]">
              {data.services.length} {data.services.length === 1 ? "service" : "services"} · newest first
            </div>
            {data.services.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                {data.channel === null ? "No services recorded yet. Set the Mixlr channel above to start." : "No services recorded yet. The first appears here when the channel next goes live."}
              </p>
            )}
            <ul className="divide-y divide-ink-700">
              {data.services.map((s, i) => (
                <li key={s.id} style={{ "--i": i } as React.CSSProperties} className="rise">
                  <Link href={`/attendance/${s.id}`} className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-ink-800/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="min-w-0">
                      <span className="block text-[15px] leading-snug font-bold wrap-anywhere">
                        {s.title}
                        {s.endedAt === null && <span className="badge badge-accent ml-2">On air</span>}
                      </span>
                      <span className="mt-1 block text-sm wrap-anywhere text-[var(--muted)]">
                        {formatDay(s.startedAt)} · {span(s)}
                        {s.setlistName && <> · {s.setlistName}</>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-5 sm:gap-4">
                      <Figure label="Average" value={s.average} />
                      <Figure label="Peak" value={s.peak} />
                      <span aria-hidden="true" className="hidden text-[var(--muted)] transition-transform group-hover:translate-x-0.5 sm:block">
                        <Icon name="forward" className="h-4 w-4" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  );
}
