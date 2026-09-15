"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageShell from "../PageShell";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";

type Check = { name: string; ok: boolean; detail: string; ms?: number };
type Diag = { env: Record<string, string | boolean>; checks: Check[]; youversionBibles: string[]; hint?: string };

/** A server sentence after a lead-in: ends with exactly one full stop. */
const sentence = (message: string) => (/[.!?]$/.test(message) ? message : `${message}.`);

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
        setFailure(await failureFrom(res, "Try again"));
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
    <PageShell
      title="Verse sources"
      purpose="Which verse sources are working, and what is set up."
      actions={
        <>
          <button onClick={() => run(false)} disabled={busy} className="btn btn-primary">
            Check again
          </button>
          <button onClick={() => run(true)} disabled={busy} className="btn">
            {busy && deep ? "Looking up every translation…" : "Look up every translation (slow)"}
          </button>
        </>
      }
    >
      {failure && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-3 text-sm text-red-200">
          <p>Couldn&rsquo;t check the verse sources. {sentence(failure.message)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {failure.kind === "locked" ? (
              <Link href={unlockHref("/diag")} className="btn border-red-400/40 text-red-100 hover:bg-red-600/20">
                Enter the PIN
              </Link>
            ) : (
              <button onClick={() => run(deep)} className="btn border-red-400/40 text-red-100 hover:bg-red-600/20">
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      {!data && !failure && <p className="text-sm text-ink-400 animate-pulse">Checking the verse sources…</p>}
      {data && (
        <>
          <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
            <h2 className="eyebrow mb-2">Settings</h2>
            {/* Two columns at most so a key like LLM_MODEL is never cut to "LLM_…";
                a value that will not fit beside its key wraps under it, right-aligned. */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {Object.entries(data.env).map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-ink-800/60 py-1">
                  <dt className="break-all text-ink-400">{k}</dt>
                  <dd className={`ml-auto min-w-0 wrap-anywhere text-right ${typeof v === "boolean" ? (v ? "text-emerald-300" : "text-[var(--muted)]") : "text-ink-200"}`}>{typeof v === "boolean" ? (v ? "set" : "not set") : v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
            <h2 className="eyebrow mb-2">Results</h2>
            <ul className="divide-y divide-ink-800 text-sm">
              {data.checks.map((c) => (
                <li key={c.name} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                  <span className={`shrink-0 font-ui font-semibold ${c.ok ? "text-emerald-400" : "text-red-400"}`}>{c.ok ? "✓ OK" : "✗ Failing"}</span>
                  <span className="min-w-0 flex-1 break-words text-ink-200 sm:w-56 sm:flex-none">{c.name}</span>
                  <span className="min-w-0 basis-full wrap-anywhere text-ink-400 sm:basis-0 sm:flex-1">
                    {c.detail}
                    {c.ms !== undefined && <span className="ml-2 text-[var(--muted)]">{c.ms} ms</span>}
                  </span>
                </li>
              ))}
            </ul>
            {data.hint && <p className="mt-3 text-xs text-[var(--muted)]">{data.hint}</p>}
          </section>
          {data.youversionBibles.length > 0 && (
            <details className="rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm">
              <summary className="cursor-pointer text-ink-300">English Bibles your YouVersion key can use ({data.youversionBibles.length})</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-ink-400">{data.youversionBibles.join("\n")}</pre>
            </details>
          )}
        </>
      )}
    </PageShell>
  );
}
