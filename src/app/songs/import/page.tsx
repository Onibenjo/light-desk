"use client";

import { useState } from "react";
import Link from "next/link";

/** What the import would do, or did. Titles, not just counts. */
interface Summary {
  totalEntries: number;
  skippedEmpty: number;
  collapsedDuplicates: number;
  repeatedGuids: number;
  unchanged: number;
  added: string[];
  updated: string[];
}

/** Enough titles to recognise the book at a glance; the rest are one tap away. */
const SHOWN = 20;

function TitleList({ heading, titles }: { heading: string; titles: string[] }) {
  const [all, setAll] = useState(false);
  if (!titles.length) return null;
  const shown = all ? titles : titles.slice(0, SHOWN);

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">
        {titles.length} {heading}
      </h3>
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        {shown.map((title, i) => (
          <li key={i} className="truncate px-3 py-1.5 text-sm text-zinc-300">
            {title}
          </li>
        ))}
      </ul>
      {!all && titles.length > SHOWN && (
        <button onClick={() => setAll(true)} className="text-xs text-[var(--muted)] underline hover:text-zinc-300">
          Show all {titles.length}
        </button>
      )}
    </div>
  );
}

function Footnotes({ s }: { s: Summary }) {
  const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
  const notes = [
    s.skippedEmpty ? `${entries(s.skippedEmpty)} ${s.skippedEmpty === 1 ? "has" : "have"} no lyrics and ${s.skippedEmpty === 1 ? "is" : "are"} skipped` : "",
    s.collapsedDuplicates ? `${s.collapsedDuplicates} exact ${s.collapsedDuplicates === 1 ? "duplicate" : "duplicates"} collapsed` : "",
    s.repeatedGuids ? `${entries(s.repeatedGuids)} reuse another entry's ID — only the last is kept` : "",
  ].filter(Boolean);
  if (!notes.length) return null;
  return <p className="text-xs text-[var(--muted)]">{notes.join(" · ")}.</p>;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The same bytes twice: once to look, once to commit. No half-written book. */
  async function send(f: File, dryRun: boolean): Promise<Summary | null> {
    setError(null);
    setBusy(dryRun ? "preview" : "import");
    try {
      const res = await fetch(`/api/songs/import${dryRun ? "?preview=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await f.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return null;
      }
      return data as Summary;
    } catch {
      setError("Could not read that file");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function choose(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    const summary = await send(f, true);
    if (summary) setPreview(summary);
  }

  async function commit() {
    if (!file) return;
    const summary = await send(file, false);
    if (summary) {
      setResult(summary);
      setPreview(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  const changes = preview ? preview.added.length + preview.updated.length : 0;

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-lg font-semibold">Import a VideoPsalm songbook</h1>

      {!preview && !result && (
        <>
          <p className="text-sm text-zinc-400">
            Pick the songbook file the media team exported — <span className="font-mono">.json</span> or <span className="font-mono">.vpc</span> (e.g. <span className="font-mono">CLC.json</span>). You&rsquo;ll see exactly what would change before anything is
            saved. Existing songs are updated, new ones added — nothing is deleted. Admin PIN required.
          </p>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 p-10 text-center text-zinc-400 hover:border-[var(--accent)]">
            {busy === "preview" ? "Reading the file…" : "Tap to choose the .json or .vpc file"}
            <input
              type="file"
              aria-label="VideoPsalm songbook file"
              accept=".json,.vpc,application/json"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared so picking the same file again still re-reads it.
                e.target.value = "";
                if (f) choose(f);
              }}
            />
          </label>
        </>
      )}

      {error && (
        <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-3 text-sm text-red-200">
          <p>{error}</p>
          {/Admin PIN/i.test(error) && (
            <p>
              This browser is unlocked with the church PIN. <Link href="/unlock?next=/songs/import" className="underline">Enter the admin PIN here</Link> and try again — or, if no separate admin PIN is set on the server, update to the latest code (the church
              PIN now carries admin rights when ADMIN_PIN is empty) and restart.
            </p>
          )}
        </div>
      )}

      {preview && file && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <h2 className="font-medium">{file.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              {preview.totalEntries} entries read · {preview.added.length} new · {preview.updated.length} to update · {preview.unchanged} already up to date · nothing saved yet
            </p>
          </div>

          <TitleList heading="new songs" titles={preview.added} />
          <TitleList heading="songs that would change" titles={preview.updated} />
          <Footnotes s={preview} />

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={commit} disabled={busy !== null || changes === 0} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
              {busy === "import" ? "Importing…" : changes === 0 ? "Nothing to import" : `Import these ${changes}`}
            </button>
            <button onClick={reset} disabled={busy !== null} className="rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50">
              Choose a different file
            </button>
          </div>
          {changes === 0 && <p className="text-xs text-[var(--muted)]">The book already matches this file.</p>}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-4 py-3 text-sm text-emerald-200">
            Done. {result.added.length} added, {result.updated.length} updated, {result.unchanged} unchanged.
          </div>
          <TitleList heading="songs added" titles={result.added} />
          <TitleList heading="songs updated" titles={result.updated} />
          <Footnotes s={result} />
          <button onClick={reset} className="rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
            Import another file
          </button>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        <Link href="/" className="underline">
          ← back to the desk
        </Link>
      </p>
    </main>
  );
}
