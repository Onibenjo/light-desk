"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { Footnotes, type Summary } from "./Footnotes";

/** Enough titles to recognise the book at a glance; the rest are one tap away. */
const SHOWN = 20;
/** The server's own limit, checked here too so a huge file is refused before it crawls up the venue wifi. */
const MAX_BYTES = 20_000_000;

/** A request failure, or the browser failing to read the chosen file before anything was sent. */
type ImportError = Failure | { kind: "file"; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTitles = (v: unknown): v is string[] => Array.isArray(v) && v.every((t) => typeof t === "string");
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseSummary(body: unknown): Summary | null {
  if (!isRecord(body)) return null;
  const { totalEntries, skippedEmpty, collapsedDuplicates, repeatedGuids, unchanged, added, updated, skippedEdited } = body;
  if (!isCount(totalEntries) || !isCount(skippedEmpty) || !isCount(collapsedDuplicates) || !isCount(repeatedGuids) || !isCount(unchanged)) return null;
  if (!isTitles(added) || !isTitles(updated) || !isTitles(skippedEdited)) return null;
  return { totalEntries, skippedEmpty, collapsedDuplicates, repeatedGuids, unchanged, added, updated, skippedEdited };
}

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

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  // busy lands a render late; a double click in that gap must not post the book twice.
  const inFlight = useRef(false);

  async function upload(f: File, dryRun: boolean): Promise<Summary | ImportError> {
    if (f.size > MAX_BYTES) return describeFailure(413, "File too large");
    let bytes: ArrayBuffer;
    try {
      bytes = await f.arrayBuffer();
    } catch {
      // Moved, deleted or still syncing since it was picked: nothing was sent.
      return { kind: "file", message: "Could not read that file — choose it again" };
    }
    let res: Response;
    try {
      res = await fetch(`/api/songs/import${dryRun ? "?preview=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      });
    } catch {
      return OFFLINE;
    }
    if (!res.ok) return failureFrom(res, res.status === 413 ? "File too large" : "Import failed");
    return parseSummary(await res.json().catch(() => null)) ?? describeFailure(500);
  }

  /** The same bytes twice: once to look, once to commit. No half-written book. */
  async function send(f: File, dryRun: boolean): Promise<Summary | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setError(null);
    setBusy(dryRun ? "preview" : "import");
    try {
      const outcome = await upload(f, dryRun);
      if ("totalEntries" in outcome) return outcome;
      setError(outcome);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function choose(f: File) {
    if (inFlight.current) return;
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
    <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Import a VideoPsalm songbook</h1>

      {!preview && !result && (
        <>
          <p className="text-sm text-zinc-400">
            Pick the songbook file the media team exported — <span className="font-mono">.json</span> or <span className="font-mono">.vpc</span> (e.g. <span className="font-mono">CLC.json</span>). You&rsquo;ll see exactly what would change before anything is
            saved. Existing songs are updated, new ones added, songs you edited here are left as you left them — nothing is deleted. Admin PIN required.
          </p>
          {/* The input stays in the tab order (sr-only, not display:none) so Enter or
              Space opens the picker; the dashed box draws the focus ring for it. */}
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-zinc-700 p-10 text-center text-zinc-400 hover:border-[var(--accent)] has-focus-visible:border-[var(--accent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--accent)]">
            <span aria-live="polite">{busy === "preview" ? "Reading the file…" : "Tap to choose the .json or .vpc file"}</span>
            <input
              type="file"
              aria-label="VideoPsalm songbook file"
              accept=".json,.vpc,application/json"
              className="sr-only"
              // Not disabled while busy: that would throw keyboard focus off the page. The picker just does not open.
              aria-disabled={busy !== null}
              onClick={(e) => {
                if (busy !== null) e.preventDefault();
              }}
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
        <div role="alert" className="space-y-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-3 text-sm text-red-200">
          <p className="wrap-anywhere">{error.message}</p>
          {error.kind === "denied" && (
            <p>
              This browser is unlocked with the church PIN. <Link href={unlockHref("/songs/import")} className="underline">Enter the admin PIN here</Link> and try again — or, if no separate admin PIN is set on the server, update to the latest code (the church
              PIN now carries admin rights when ADMIN_PIN is empty) and restart.
            </p>
          )}
          {error.kind === "locked" && (
            <p>
              <Link href={unlockHref("/songs/import")} className="underline">
                Enter the PIN
              </Link>
              , then choose the file again.
            </p>
          )}
          {file && !preview && error.kind !== "file" && error.kind !== "refused" && error.kind !== "locked" && (
            <button onClick={() => choose(file)} disabled={busy !== null} className="rounded-md border border-red-400/40 px-3 py-1.5 text-sm hover:bg-red-600/20 disabled:opacity-50 pointer-coarse:min-h-11">
              Try again
            </button>
          )}
        </div>
      )}

      {preview && file && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <h2 className="font-medium wrap-anywhere">{file.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              {preview.totalEntries} entries read · {preview.added.length} new · {preview.updated.length} to update · {preview.unchanged} already up to date · nothing saved yet
            </p>
          </div>

          <TitleList heading="new songs" titles={preview.added} />
          <TitleList heading="songs that would change" titles={preview.updated} />
          <TitleList heading="songs left alone (edited here)" titles={preview.skippedEdited} />
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
          <TitleList heading="songs left alone (edited here)" titles={result.skippedEdited} />
          <Footnotes s={result} />
          <button onClick={reset} className="rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
            Import another file
          </button>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        <Link href="/" className="inline-block py-1.5 underline">
          ← back to the desk
        </Link>
      </p>
    </main>
  );
}
