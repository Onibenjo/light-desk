"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette from "../CommandPalette";
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

const KIND_STYLE: Record<string, string> = {
  verse: "bg-emerald-900/50 text-emerald-300",
  search: "bg-sky-900/50 text-sky-300",
  song: "bg-violet-900/50 text-violet-300",
  message: "bg-amber-900/50 text-amber-300",
};

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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Same fallback as the desk for odd permission states: a hidden textarea + execCommand.
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
      // Selecting the textarea took focus off the Copy button; a keyboard user keeps their place.
      back?.focus();
    }
  }
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
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Debounce the search box so typing doesn't fire a query per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const flash = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ok ? 2500 : 4000);
  }, []);

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
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <CommandPalette actions={actions} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Log</h1>
          <p className="text-xs text-[var(--muted)]">Everything copied, by day.</p>
        </div>
        <Link href="/" className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 pointer-coarse:min-h-11">
          ← Desk
        </Link>
      </header>

      {/* Day picker */}
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
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
              className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm hover:bg-zinc-800 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              aria-label="Previous day"
            >
              ←
            </button>
            <span className={`min-w-0 flex-1 whitespace-nowrap text-center text-sm font-medium sm:min-w-[10.5rem] sm:flex-none ${scope === "all" ? "text-[var(--muted)]" : ""}`}>{scope === "all" ? "All dates" : formatDayLabel(date)}</span>
            <button
              onClick={() => {
                setScope("day");
                setDate((d) => shiftDay(d, 1));
              }}
              className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm hover:bg-zinc-800 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
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
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm [color-scheme:dark] pointer-coarse:min-h-11"
          />
          <button
            onClick={() => {
              setScope("day");
              setDate(today);
            }}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 pointer-coarse:min-h-11"
          >
            Today
          </button>
          <button
            onClick={() => setScope(scope === "all" ? "day" : "all")}
            aria-pressed={scope === "all"}
            className={`ml-auto rounded-md border px-2.5 py-1.5 text-sm pointer-coarse:min-h-11 ${scope === "all" ? "border-[var(--accent)] text-[var(--accent)]" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
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
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs pointer-coarse:min-h-11 ${
                  scope === "day" && d.iso === date
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : isSunday(d.iso)
                      ? "border-zinc-700 bg-zinc-800/60 text-zinc-200"
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {formatDayLabel(d.iso).slice(0, 10)}
                <span className="ml-1.5 text-[var(--muted)]">{d.count}</span>
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
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)] pointer-coarse:min-h-11"
          />
          {query && (
            <button onClick={() => setQuery("")} className="rounded-md border border-zinc-700 px-3 text-sm text-zinc-400 hover:bg-zinc-800 pointer-coarse:min-h-11">
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
              className={`rounded-full border px-3 py-1.5 text-xs pointer-coarse:min-h-11 ${kind === k ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
            >
              {KIND_CHIP[k]}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-xs text-[var(--muted)]">
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
                <Link href={unlockHref("/log")} className="inline-flex items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black pointer-coarse:min-h-11">
                  Enter the PIN
                </Link>
              )}
              <button onClick={() => setAttempt((n) => n + 1)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 pointer-coarse:min-h-11">
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
              <button onClick={() => setScope("all")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 pointer-coarse:min-h-11">
                Search all dates
              </button>
            )}
            {scope === "day" && !debounced && countForDate === 0 && days.length > 0 && (
              <button onClick={() => setDate(days[0].iso)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 pointer-coarse:min-h-11">
                Jump to {formatDayLabel(days[0].iso)}
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-zinc-800">
          {!failure && rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] uppercase ${KIND_STYLE[row.kind] ?? "bg-zinc-800 text-zinc-400"}`}>{KIND_BADGE[row.kind] ?? row.kind}</span>
                  <span className="min-w-0 wrap-anywhere">{row.label}</span>
                </div>
                {row.body && <p className="mt-1 line-clamp-2 text-xs wrap-anywhere text-[var(--muted)]">{row.body}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-[var(--muted)]">
                  {scope === "all" && <span className="mr-1.5">{formatDayLabel(toISODate(new Date(row.createdAt))).slice(0, 10)}</span>}
                  {time(row.createdAt)}
                </span>
                {row.body && (
                  <button
                    onClick={() => {
                      if (row.body === null) return;
                      copyText(row.body).then((ok) => flash(ok ? `Copied ${row.label} — paste in Mixlr` : "Couldn't copy — try again", ok));
                    }}
                    className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  >
                    Copy
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toast && (
          <div className={`max-w-md rounded-lg border px-4 py-2 text-sm wrap-anywhere shadow-lg ${toast.ok ? "border-emerald-500/40 bg-emerald-950 text-emerald-200" : "border-red-500/40 bg-red-950 text-red-200"}`}>{toast.text}</div>
        )}
      </div>
    </main>
  );
}
