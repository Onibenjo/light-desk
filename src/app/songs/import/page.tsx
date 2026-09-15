"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { count, ENTRY, Footnotes, LISTS, SONG, TitleList, type Summary } from "./Footnotes";

/** The server's own limit, checked here too so a huge file is refused before it crawls up the venue wifi. */
const MAX_BYTES = 20_000_000;
const TOO_LARGE = `That file is too large — the limit is ${MAX_BYTES / 1_000_000} MB`;

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

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  // busy lands a render late; a double click in that gap must not post the book twice.
  const inFlight = useRef(false);

  async function upload(f: File, dryRun: boolean): Promise<Summary | ImportError> {
    if (f.size > MAX_BYTES) return describeFailure(413, TOO_LARGE);
    let bytes: ArrayBuffer;
    try {
      bytes = await f.arrayBuffer();
    } catch {
      // Moved, deleted or still syncing since it was picked: nothing was sent.
      return { kind: "file", message: "Couldn't read that file — choose it again" };
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
    if (!res.ok) return failureFrom(res, res.status === 413 ? TOO_LARGE : dryRun ? "Couldn't check that file — try again" : "Couldn't import — try again");
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
      <h1 className="text-lg font-semibold">Import a songbook</h1>

      {!preview && !result && (
        <>
          <p className="text-sm text-ink-400">
            Choose a songbook exported from VideoPsalm. You&rsquo;ll see what would change before anything is saved. Import adds new songs and updates changed ones; it never deletes a song or
            overwrites one edited here. Needs the admin PIN.
          </p>
          {/* The input stays in the tab order (sr-only, not display:none) so Enter or
              Space opens the picker; the dashed box draws the focus ring for it. */}
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-ink-700 p-10 text-center text-ink-400 hover:border-[var(--accent)] has-focus-visible:border-[var(--accent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--accent)]">
            <span aria-live="polite">{busy === "preview" ? "Reading the file…" : "Choose a .json or .vpc file"}</span>
            <input
              type="file"
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
              <Link href={unlockHref("/songs/import")} className="underline">
                Enter the admin PIN
              </Link>
              , then choose the file again.
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
          {file && !preview && error.kind !== "file" && error.kind !== "refused" && error.kind !== "locked" && error.kind !== "denied" && (
            <button onClick={() => choose(file)} disabled={busy !== null} className="rounded-md border border-red-400/40 px-3 py-1.5 text-sm hover:bg-red-600/20 disabled:opacity-50 pointer-coarse:min-h-11">
              Try again
            </button>
          )}
        </div>
      )}

      {preview && file && (
        <div className="space-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div>
            <h2 className="font-medium wrap-anywhere">{file.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              {count(preview.totalEntries, ENTRY)} in the file · {preview.unchanged} already up to date · nothing saved yet
            </p>
          </div>

          <TitleList noun={LISTS.new} titles={preview.added} />
          <TitleList noun={LISTS.toUpdate} titles={preview.updated} />
          <TitleList noun={LISTS.editedHere} titles={preview.skippedEdited} />
          <Footnotes s={preview} />

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={commit} disabled={busy !== null || changes === 0} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
              {busy === "import" ? "Importing…" : changes === 0 ? "Nothing to import" : `Import ${count(changes, SONG)}`}
            </button>
            <button onClick={reset} disabled={busy !== null} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:bg-ink-800 disabled:opacity-50">
              Choose a different file
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-4 py-3 text-sm text-emerald-200">
            Imported {count(result.added.length + result.updated.length, SONG)}.
          </div>
          <TitleList noun={LISTS.added} titles={result.added} />
          <TitleList noun={LISTS.updated} titles={result.updated} />
          <TitleList noun={LISTS.editedHere} titles={result.skippedEdited} />
          <Footnotes s={result} />
          <button onClick={reset} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:bg-ink-800">
            Import another file
          </button>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        <Link href="/" className="inline-block py-1.5 underline">
          ← Desk
        </Link>
      </p>
    </main>
  );
}
