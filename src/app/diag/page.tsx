"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";

type Check = { name: string; ok: boolean; detail: string; ms?: number };
type Diag = { env: Record<string, string | boolean>; checks: Check[]; youversionBibles: string[]; hint?: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isCheck(v: unknown): v is Check {
  return isRecord(v) && typeof v.name === "string" && typeof v.ok === "boolean" && typeof v.detail === "string" && (v.ms === undefined || typeof v.ms === "number");
}

/** The report as the page draws it, or null when the body is not one (a proxy page, a half-deployed route). */
function parseDiag(body: unknown): Diag | null {
  if (!isRecord(body) || !isRecord(body.env) || !Array.isArray(body.checks) || !body.checks.every(isCheck)) return null;
  const env: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(body.env)) if (typeof v === "string" || typeof v === "boolean") env[k] = v;
  const bibles = Array.isArray(body.youversionBibles) ? body.youversionBibles.filter((b): b is string => typeof b === "string") : [];
  return { env, checks: body.checks, youversionBibles: bibles, hint: typeof body.hint === "string" ? body.hint : undefined };
}

export default function DiagPage() {
  const [data, setData] = useState<Diag | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function run(d: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDeep(d);
    setFailure(null);
    try {
      const res = await fetch(`/api/diag${d ? "?deep=1" : ""}`);
      if (!res.ok) {
        setFailure(await failureFrom(res, "The source check did not run — try again"));
        setData(null);
        return;
      }
      const report = parseDiag(await res.json().catch(() => null));
      // A result from an earlier run would read as this one's, so it goes too.
      setData(report);
      if (!report) setFailure(describeFailure(500));
    } catch {
      setFailure(OFFLINE);
      setData(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = setTimeout(() => run(false), 0); // kick off the first check after mount
    return () => clearTimeout(id);
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Lightdesk · source check</h1>
          <p className="text-xs text-[var(--muted)]">Which verse sources are working for this deployment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run(false)} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-50 pointer-coarse:min-h-11">
            Quick check
          </button>
          <button onClick={() => run(true)} disabled={busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11">
            {busy && deep ? "Looking up…" : "Live lookup, every translation"}
          </button>
        </div>
      </header>
      {failure && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-3 text-sm text-red-200">
          <p>{failure.message}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {failure.kind === "locked" ? (
              <Link href={unlockHref("/diag")} className="inline-flex items-center py-1.5 font-medium underline pointer-coarse:min-h-11">
                Enter the PIN
              </Link>
            ) : (
              <button onClick={() => run(deep)} className="inline-flex items-center py-1.5 font-medium underline pointer-coarse:min-h-11">
                Run the check again
              </button>
            )}
          </div>
        </div>
      )}
      {!data && !failure && <p className="text-sm text-zinc-400 animate-pulse">Checking…</p>}
      {data && (
        <>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Config</h2>
            {/* Two columns at most so a key like LLM_MODEL is never cut to "LLM_…";
                a value that will not fit beside its key wraps under it, right-aligned. */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {Object.entries(data.env).map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-zinc-800/60 py-1">
                  <dt className="break-all text-zinc-400">{k}</dt>
                  <dd className={`ml-auto min-w-0 break-all text-right ${typeof v === "boolean" ? (v ? "text-emerald-300" : "text-[var(--muted)]") : "text-zinc-200"}`}>{typeof v === "boolean" ? (v ? "set" : "—") : v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Checks</h2>
            <ul className="divide-y divide-zinc-800 text-sm">
              {data.checks.map((c) => (
                <li key={c.name} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                  <span className={`shrink-0 ${c.ok ? "text-emerald-400" : "text-red-400"}`}>{c.ok ? "✓" : "✗"}</span>
                  <span className="min-w-0 flex-1 break-words text-zinc-200 sm:w-56 sm:flex-none">{c.name}</span>
                  <span className="min-w-0 basis-full break-all text-zinc-400 sm:basis-0 sm:flex-1">
                    {c.detail}
                    {c.ms !== undefined && <span className="ml-2 text-[var(--muted)]">{c.ms} ms</span>}
                  </span>
                </li>
              ))}
            </ul>
            {data.hint && <p className="mt-3 text-xs text-[var(--muted)]">{data.hint}</p>}
          </section>
          {data.youversionBibles.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
              <summary className="cursor-pointer text-zinc-300">All English bibles visible to your YouVersion key ({data.youversionBibles.length})</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{data.youversionBibles.join("\n")}</pre>
            </details>
          )}
        </>
      )}
      <p className="text-xs text-[var(--muted)]">
        <Link href="/" className="inline-flex items-center py-1.5 underline pointer-coarse:min-h-11">← back to the desk</Link>
      </p>
    </main>
  );
}
