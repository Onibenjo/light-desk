"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Check = { name: string; ok: boolean; detail: string; ms?: number };
type Diag = { env: Record<string, string | boolean>; checks: Check[]; youversionBibles: string[]; hint?: string };

export default function DiagPage() {
  const [data, setData] = useState<Diag | null>(null);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(d: boolean) {
    setBusy(true);
    setDeep(d);
    const res = await fetch(`/api/diag${d ? "?deep=1" : ""}`);
    setData(await res.json());
    setBusy(false);
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
          <p className="text-xs text-zinc-500">Which verse sources are working for this deployment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run(false)} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-50">
            Quick check
          </button>
          <button onClick={() => run(true)} disabled={busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
            {busy && deep ? "Looking up…" : "Live lookup, every translation"}
          </button>
        </div>
      </header>
      {!data && <p className="text-sm text-zinc-400 animate-pulse">Checking…</p>}
      {data && (
        <>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Config</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-3">
              {Object.entries(data.env).map(([k, v]) => (
                <div key={k} className="flex min-w-0 justify-between gap-2 border-b border-zinc-800/60 py-1">
                  <dt className="min-w-0 truncate text-zinc-400">{k}</dt>
                  <dd className={`min-w-0 break-all text-right ${typeof v === "boolean" ? (v ? "text-emerald-300" : "text-zinc-500") : "text-zinc-200"}`}>{typeof v === "boolean" ? (v ? "set" : "—") : v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Checks</h2>
            <ul className="divide-y divide-zinc-800 text-sm">
              {data.checks.map((c) => (
                <li key={c.name} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                  <span className={`shrink-0 ${c.ok ? "text-emerald-400" : "text-red-400"}`}>{c.ok ? "✓" : "✗"}</span>
                  <span className="min-w-0 flex-1 break-words text-zinc-200 sm:w-56 sm:flex-none">{c.name}</span>
                  <span className="min-w-0 basis-full break-all text-zinc-400 sm:basis-0 sm:flex-1">
                    {c.detail}
                    {c.ms !== undefined && <span className="ml-2 text-zinc-600">{c.ms} ms</span>}
                  </span>
                </li>
              ))}
            </ul>
            {data.hint && <p className="mt-3 text-xs text-zinc-500">{data.hint}</p>}
          </section>
          {data.youversionBibles.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
              <summary className="cursor-pointer text-zinc-300">All English bibles visible to your YouVersion key ({data.youversionBibles.length})</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{data.youversionBibles.join("\n")}</pre>
            </details>
          )}
        </>
      )}
      <p className="text-xs text-zinc-600">
        <Link href="/" className="underline">← back to the desk</Link>
      </p>
    </main>
  );
}
