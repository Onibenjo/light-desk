"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette from "../CommandPalette";
import { type Action } from "@/lib/shortcuts";
import { dayBounds, toISODate, shiftDay, formatDayLabel, groupDays } from "@/lib/logQuery";

type LogRow = { id: number; kind: string; label: string; body: string | null; createdAt: string };
type Scope = "day" | "all";

const KINDS = ["all", "verse", "search", "song", "message"] as const;

const KIND_STYLE: Record<string, string> = {
  verse: "bg-emerald-900/50 text-emerald-300",
  search: "bg-sky-900/50 text-sky-300",
  song: "bg-violet-900/50 text-violet-300",
  message: "bg-amber-900/50 text-amber-300",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function LogPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [scope, setScope] = useState<Scope>("day");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [days, setDays] = useState<{ iso: string; count: number }[]>([]);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Debounce the search box so typing doesn't fire a query per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // Which days have anything at all — grouped here, in the browser, because only
  // it knows which local day a stored UTC instant belongs to.
  useEffect(() => {
    let live = true;
    fetch("/api/log?days=1")
      .then((r) => r.json())
      .then((d) => live && setDays(groupDays(d.days ?? [])))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    // Syncing with an external system (the API); busy has to flip before the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    const p = new URLSearchParams();
    if (scope === "day") {
      const { from, to } = dayBounds(date);
      p.set("from", String(from));
      p.set("to", String(to));
    }
    if (debounced) p.set("q", debounced);
    if (kind !== "all") p.set("kind", kind);
    fetch(`/api/log?${p}`)
      .then((r) => r.json())
      .then((d) => live && setRows(d.rows ?? []))
      .catch(() => live && setRows([]))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [date, scope, debounced, kind]);

  const today = toISODate(new Date());
  const isSunday = (iso: string) => formatDayLabel(iso).startsWith("Sun");
  const recentDays = useMemo(() => days.slice(0, 30), [days]);
  const countForDate = days.find((d) => d.iso === date)?.count ?? 0;

  const actions: Action[] = useMemo(
    () => [
      { id: "today", title: "Jump to today", group: "Log", keywords: ["now"], run: () => { setScope("day"); setDate(toISODate(new Date())); } },
      { id: "prev-day", title: "Previous day", group: "Log", run: () => { setScope("day"); setDate((d) => shiftDay(d, -1)); } },
      { id: "next-day", title: "Next day", group: "Log", run: () => { setScope("day"); setDate((d) => shiftDay(d, 1)); } },
      { id: "last-sunday", title: "Jump to the last Sunday with entries", group: "Log", keywords: ["service", "church"], run: () => { const s = days.find((d) => formatDayLabel(d.iso).startsWith("Sun")); if (s) { setScope("day"); setDate(s.iso); } } },
      { id: "all-dates", title: "Search across all dates", group: "Log", keywords: ["everything", "history"], run: () => setScope("all") },
      { id: "clear", title: "Clear the search and filters", group: "Log", run: () => { setQuery(""); setKind("all"); } },
      { id: "desk", title: "Back to the desk", group: "Go to", keywords: ["verses", "home"], run: () => router.push("/") },
      { id: "sources", title: "Check verse sources", group: "Go to", keywords: ["diagnostics"], run: () => router.push("/diag") },
    ],
    [days, router],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <CommandPalette actions={actions} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Lightdesk · log</h1>
          <p className="text-xs text-[var(--muted)]">Everything copied to chat, by day.</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
          ← Desk
        </Link>
      </header>

      {/* Day picker */}
      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setScope("day");
              setDate((d) => shiftDay(d, -1));
            }}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm hover:bg-zinc-800"
            aria-label="Previous day"
          >
            ←
          </button>
          <span className={`min-w-[10.5rem] text-center text-sm font-medium ${scope === "all" ? "text-[var(--muted)] line-through" : ""}`}>{formatDayLabel(date)}</span>
          <button
            onClick={() => {
              setScope("day");
              setDate((d) => shiftDay(d, 1));
            }}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm hover:bg-zinc-800"
            aria-label="Next day"
          >
            →
          </button>
          <input
            type="date"
            aria-label="Show entries for this day"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setScope("day");
              setDate(e.target.value);
            }}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm [color-scheme:dark]"
          />
          <button
            onClick={() => {
              setScope("day");
              setDate(today);
            }}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Today
          </button>
          <button
            onClick={() => setScope(scope === "all" ? "day" : "all")}
            className={`ml-auto rounded-md border px-2.5 py-1.5 text-sm ${scope === "all" ? "border-[var(--accent)] text-[var(--accent)]" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
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
                className={`shrink-0 rounded-md border px-2 py-1 text-xs ${
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
            placeholder="Search a reference, a song title, or words in the text…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          {query && (
            <button onClick={() => setQuery("")} className="rounded-md border border-zinc-700 px-3 text-sm text-zinc-400 hover:bg-zinc-800">
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${kind === k ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-xs text-[var(--muted)]">
          <span role="status" aria-live="polite">
            {busy ? "Loading…" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
            {!busy && scope === "day" && ` · ${formatDayLabel(date)}`}
            {!busy && scope === "all" && " · all dates"}
          </span>
          {debounced && <span className="truncate">matching “{debounced}”</span>}
        </div>

        {!busy && rows.length === 0 && (
          <div className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--muted)]">
              {scope === "day" ? `Nothing ${debounced ? "matching" : "logged"} on ${formatDayLabel(date)}.` : "No matches."}
            </p>
            {scope === "day" && debounced && (
              <button onClick={() => setScope("all")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                Search all dates instead
              </button>
            )}
            {scope === "day" && !debounced && countForDate === 0 && days.length > 0 && (
              <button onClick={() => setDate(days[0].iso)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                Jump to {formatDayLabel(days[0].iso)}
              </button>
            )}
          </div>
        )}

        <ul className="divide-y divide-zinc-800">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] uppercase ${KIND_STYLE[row.kind] ?? "bg-zinc-800 text-zinc-400"}`}>{row.kind}</span>
                  <span className="break-words">{row.label}</span>
                </div>
                {row.body && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{row.body}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-[var(--muted)]">
                  {scope === "all" && <span className="mr-1.5">{formatDayLabel(toISODate(new Date(row.createdAt))).slice(0, 10)}</span>}
                  {time(row.createdAt)}
                </span>
                {row.body && (
                  <button
                    onClick={() => copyText(row.body!).then((ok) => flash(ok ? `Copied ${row.label}` : "Copy failed"))}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800"
                  >
                    Copy
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950 px-4 py-2 text-sm text-emerald-200 shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
