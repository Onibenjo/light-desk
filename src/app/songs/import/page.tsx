"use client";

import { useState } from "react";
import Link from "next/link";

type Result = { totalEntries: number; added: number; updated: number; unchanged: number; skippedEmpty: number; collapsedDuplicates: number };

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const raw = await file.text();
      const res = await fetch("/api/songs/import", { method: "POST", headers: { "Content-Type": "text/plain" }, body: raw });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Import failed");
      else setResult(data as Result);
    } catch {
      setError("Could not read that file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-lg font-semibold">Import a VideoPsalm songbook</h1>
      <p className="text-sm text-zinc-400">
        Pick the songbook file the media team exported (e.g. <span className="font-mono">CLC.json</span>). Existing songs are updated, new ones added — nothing is deleted. Admin PIN required.
      </p>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 p-10 text-center text-zinc-400 hover:border-[var(--accent)]">
        {busy ? "Importing…" : "Tap to choose the .json file"}
        <input type="file" aria-label="VideoPsalm songbook file" accept=".json,.vpc,application/json" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {error && (
        <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-3 text-sm text-red-200">
          <p>{error}</p>
          {/Admin PIN/i.test(error) && (
            <p>
              This browser is unlocked with the church PIN. <Link href="/unlock?next=/songs/import" className="underline">Enter the admin PIN here</Link> and try again — or, if no separate admin PIN is set on the server, update to the latest code (the church PIN now carries admin rights when ADMIN_PIN is empty) and restart.
            </p>
          )}
        </div>
      )}
      {result && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-4 py-3 text-sm text-emerald-200">
          Done. {result.added} added, {result.updated} updated, {result.unchanged} unchanged
          {result.skippedEmpty ? ` · ${result.skippedEmpty} entries had no lyrics and were skipped` : ""}
          {result.collapsedDuplicates ? ` · ${result.collapsedDuplicates} exact duplicates collapsed` : ""}.
        </div>
      )}
      <p className="text-xs text-[var(--muted)]">
        <Link href="/" className="underline">← back to the desk</Link>
      </p>
    </main>
  );
}
