"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette from "../CommandPalette";
import Icon, { type IconName } from "../Icon";
import PageShell from "../PageShell";
import Toast, { copyText, useToast } from "../Toast";
import { type Action } from "@/lib/shortcuts";
import { dayBounds, toISODate, shiftDay, formatDayLabel, groupDays } from "@/lib/logQuery";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";

type LogRow = { id: number; kind: string; label: string; body: string | null; createdAt: string };
type Scope = "day" | "all";
/** Loading keeps the previous rows on screen; a failure must never read as an empty day. */
type Load = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; failure: Failure };

/** /api/log returns at most this many rows when no limit is asked for; a full page is not the whole log. */
const SERVER_LIMIT = 200;

const KINDS = ["all", "verse", "search", "song", "message"] as const;

/** Filter chips name a group; a row's badge names the one entry. "search" is a verse found by description. */
const KIND_CHIP: Record<(typeof KINDS)[number], string> = {
  all: "All",
  verse: "Verses",
  search: "Description searches",
  song: "Songs",
  message: "Messages",
};
const KIND_BADGE: Record<string, string> = { verse: "verse", search: "description search", song: "song", message: "message" };

/** Kinds are told apart by icon and word, not colour: green already means "copied", amber "check this". */
const KIND_ICON: Record<string, IconName> = { verse: "book", search: "book", song: "music", message: "message" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isLogRow(v: unknown): v is LogRow {
  return (
    isRecord(v) &&
    typeof v.id === "number" &&
    typeof v.kind === "string" &&
    typeof v.label === "string" &&
    (v.body === null || typeof v.body === "string") &&
    typeof v.createdAt === "string"
  );
}


/** A server sentence after a lead-in: ends with exactly one full stop. */
const sentence = (message: string) => (/[.!?]$/.test(message) ? message : `${message}.`);

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function LogPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [scope, setScope] = useState<Scope>("day");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [days, setDays] = useState<{ iso: string; count: number }[]>([]);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const busy = load.kind === "loading";
  const failure = load.kind === "failed" ? load.failure : null;
  // Bumped by Try again so both fetches run again with the same filters.
  const [attempt, setAttempt] = useState(0);
  const { toast, showToast } = useToast();

  // Debounce the search box so typing doesn't fire a query per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Which days have anything at all — grouped here, in the browser, because only
  // it knows which local day a stored UTC instant belongs to.
  useEffect(() => {
    let live = true;
    // Quiet on failure: the strip is a shortcut, and the rows below report the real problem.
    fetch("/api/log?days=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (!live || !isRecord(d) || !Array.isArray(d.days)) return;
        setDays(groupDays(d.days.filter((n): n is number => typeof n === "number" && Number.isFinite(n))));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    let live = true;
    // Syncing with an external system (the API); busy has to flip before the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad({ kind: "loading" });
    const p = new URLSearchParams();
    if (scope === "day") {
      const { from, to } = dayBounds(date);
      p.set("from", String(from));
      p.set("to", String(to));
    }
    if (debounced) p.set("q", debounced);
    if (kind !== "all") p.set("kind", kind);
    (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/log?${p}`);
      } catch {
        if (live) setLoad({ kind: "failed", failure: OFFLINE });
        return;
      }
      if (!res.ok) {
        const f = await failureFrom(res, "Try again");
        if (live) setLoad({ kind: "failed", failure: f });
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      if (!live) return;
      if (!isRecord(body) || !Array.isArray(body.rows)) {
        setLoad({ kind: "failed", failure: describeFailure(500) });
        return;
      }
      setRows(body.rows.filter(isLogRow));
      setLoad({ kind: "ready" });
    })();
    return () => {
      live = false;
    };
  }, [date, scope, debounced, kind, attempt]);

  const today = toISODate(new Date());
  const isSunday = (iso: string) => formatDayLabel(iso).startsWith("Sun");
  const recentDays = useMemo(() => days.slice(0, 30), [days]);
  const countForDate = days.find((d) => d.iso === date)?.count ?? 0;

  const actions: Action[] = useMemo(
    () => [
      { id: "today", title: "Today", group: "Log", keywords: ["now"], run: () => { setScope("day"); setDate(toISODate(new Date())); } },
      { id: "prev-day", title: "Previous day", group: "Log", run: () => { setScope("day"); setDate((d) => shiftDay(d, -1)); } },
      { id: "next-day", title: "Next day", group: "Log", run: () => { setScope("day"); setDate((d) => shiftDay(d, 1)); } },
      { id: "last-sunday", title: "Last Sunday with entries", group: "Log", keywords: ["service", "church"], run: () => { const s = days.find((d) => formatDayLabel(d.iso).startsWith("Sun")); if (s) { setScope("day"); setDate(s.iso); } } },
      { id: "all-dates", title: "All dates", group: "Log", keywords: ["everything", "history"], run: () => setScope("all") },
      { id: "clear", title: "Clear search and filters", group: "Log", run: () => { setQuery(""); setKind("all"); } },
      { id: "desk", title: "Desk", group: "Go to", keywords: ["verses", "home"], run: () => router.push("/") },
      { id: "sources", title: "Verse sources", group: "Go to", keywords: ["diagnostics"], run: () => router.push("/diag") },
    ],
    [days, router],
  );

  return (
    <PageShell title="Log" purpose="Everything copied, by day.">
      <CommandPalette actions={actions} />

      {/* Day picker */}
      <section className="space-y-3 rounded-xl border border-ink-800 bg-ink-900 p-3 sm:p-4">
        {/* Below sm the arrows and the label take a row of their own, so
            "Wed 30 Sep 2026" never wraps; the date input, Today and All dates
            drop to a second row. From sm up everything sits on one row. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              onClick={() => {
                setScope("day");
                setDate((d) => shiftDay(d, -1));
              }}
              className="btn btn-icon"
              aria-label="Previous day"
            >
              ←
            </button>
            <span className={`min-w-0 flex-1 whitespace-nowrap text-center font-ui text-lg font-semibold sm:min-w-[11rem] sm:flex-none ${scope === "all" ? "text-[var(--muted)]" : ""}`}>{scope === "all" ? "All dates" : formatDayLabel(date)}</span>
            <button
              onClick={() => {
                setScope("day");
                setDate((d) => shiftDay(d, 1));
              }}
              className="btn btn-icon"
              aria-label="Next day"
            >
              →
            </button>
          </div>
          <input
            type="date"
            aria-label="Show entries for this day"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setScope("day");
              setDate(e.target.value);
            }}
            className="field px-2 py-1.5"
          />
          <button
            onClick={() => {
              setScope("day");
              setDate(today);
            }}
            className="btn"
          >
            Today
          </button>
          <button
            onClick={() => setScope(scope === "all" ? "day" : "all")}
            aria-pressed={scope === "all"}
            className={`btn ml-auto ${scope === "all" ? "btn-on" : ""}`}
          >
            All dates
          </button>
        </div>

        {/* Days that actually have entries — the fast way to reach a given Sunday. */}
        {recentDays.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {recentDays.map((d) => (
              <button
                key={d.iso}
                onClick={() => {
                  setScope("day");
                  setDate(d.iso);
                }}
                title={`${formatDayLabel(d.iso)} · ${d.count} ${d.count === 1 ? "entry" : "entries"}`}
                aria-pressed={scope === "day" && d.iso === date}
                className={`btn btn-sm shrink-0 ${scope === "day" && d.iso === date ? "btn-on" : isSunday(d.iso) ? "bg-ink-800 text-ink-100" : "border-ink-800 text-ink-400"}`}
              >
                {formatDayLabel(d.iso).slice(0, 10)}
                <span className={`ml-1.5 tabular-nums ${scope === "day" && d.iso === date ? "text-ink-700" : "text-[var(--muted)]"}`}>{d.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Search + kind */}
      <section className="space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the log"
            placeholder="Reference, title or words"
            className="field w-full"
          />
          {query && (
            <button onClick={() => setQuery("")} className="btn">
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`btn btn-sm rounded-full ${kind === k ? "btn-on" : "border-ink-800 text-ink-300"}`}
            >
              {KIND_CHIP[k]}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      <section className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
        <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-2 text-sm text-[var(--muted)]">
          <span role="status" aria-live="polite" className="shrink-0">
            {busy ? "Loading the log…" : `${failure ? "" : `${rows.length >= SERVER_LIMIT ? "Latest " : ""}${rows.length} ${rows.length === 1 ? "entry" : "entries"} · `}${scope === "day" ? formatDayLabel(date) : "all dates"}`}
          </span>
          {debounced && <span className="min-w-0 truncate">matching “{debounced}”</span>}
        </div>

        {failure && (
          <div role="alert" className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-red-300">Couldn&rsquo;t load the log. {sentence(failure.message)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {failure.kind === "locked" && (
                <Link href={unlockHref("/log")} className="btn btn-primary">
                  Enter the PIN
                </Link>
              )}
              <button onClick={() => setAttempt((n) => n + 1)} className="btn">
                Try again
              </button>
            </div>
          </div>
        )}

        {load.kind === "ready" && rows.length === 0 && (
          <div className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--muted)]">
              {debounced || kind !== "all" ? `No matches${scope === "day" ? ` on ${formatDayLabel(date)}` : ""}.` : scope === "day" ? `Nothing logged on ${formatDayLabel(date)}.` : "Nothing in the log yet."}
            </p>
            {scope === "day" && debounced && (
              <button onClick={() => setScope("all")} className="btn">
                Search all dates
              </button>
            )}
            {scope === "day" && !debounced && countForDate === 0 && days.length > 0 && (
              <button onClick={() => setDate(days[0].iso)} className="btn">
                Jump to {formatDayLabel(days[0].iso)}
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-ink-800">
          {!failure && rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge">
                    {KIND_ICON[row.kind] && <Icon name={KIND_ICON[row.kind]} className="h-3 w-3" />}
                    {KIND_BADGE[row.kind] ?? row.kind}
                  </span>
                  <span className="min-w-0 text-[15px] font-bold wrap-anywhere">{row.label}</span>
                </div>
                {row.body && <p className="mt-1 line-clamp-2 text-sm wrap-anywhere text-[var(--muted)]">{row.body}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-ui text-sm text-[var(--muted)] tabular-nums">
                  {scope === "all" && <span className="mr-1.5">{formatDayLabel(toISODate(new Date(row.createdAt))).slice(0, 10)}</span>}
                  {time(row.createdAt)}
                </span>
                {row.body && (
                  <button
                    onClick={() => {
                      if (row.body === null) return;
                      copyText(row.body).then((ok) => showToast(ok ? `Copied ${row.label} — paste in Mixlr` : "Couldn't copy — try again", ok ? "ok" : "err"));
                    }}
                    className="btn btn-sm shrink-0"
                  >
                    Copy
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Toast toast={toast} />
    </PageShell>
  );
}
