"use client";

import { useRef, useState } from "react";
import { failureFrom, OFFLINE, unlockHref } from "@/lib/apiError";
import { tidyLyrics } from "@/lib/songSections";
import type { SearchableSong } from "@/lib/songSearch";

/**
 * How long Save or Delete waits for an answer. On the venue wifi a request can
 * hang for minutes, and the form is inert while it does; after this the
 * buttons come back, with the typed text still in them.
 */
const WRITE_TIMEOUT_MS = 20_000;

interface Props {
  song: SearchableSong;
  onSaved: (song: SearchableSong) => void;
  onDeleted: () => void;
  onCancel: () => void;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
}

/** Sections as one editable body of text: the blank lines are the section breaks. */
export function lyricsFromSections(sections: string[]): string {
  return sections.join("\n\n");
}

/**
 * A song as the API sends it, or null when the value is not one. Only the keys
 * actually present are set, so spreading the result over a song already on
 * screen keeps what the response left out.
 */
export function readSong(value: unknown): SearchableSong | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("title" in value) || typeof value.title !== "string") return null;
  if (!("sections" in value) || !Array.isArray(value.sections)) return null;
  const sections: unknown[] = value.sections;
  if (!sections.every((s): s is string => typeof s === "string")) return null;

  const song: SearchableSong = { title: value.title, sections };
  if ("id" in value && typeof value.id === "number") song.id = value.id;
  if ("guid" in value && typeof value.guid === "string") song.guid = value.guid;
  if ("author" in value && (typeof value.author === "string" || value.author === null)) song.author = value.author;
  if ("source" in value && typeof value.source === "string") song.source = value.source;
  if ("editedAt" in value && (typeof value.editedAt === "string" || value.editedAt === null)) song.editedAt = value.editedAt;
  return song;
}

/** The `song` in a `{ song }` response body. */
export function songFromBody(body: unknown): SearchableSong | null {
  return typeof body === "object" && body !== null && "song" in body ? readSong(body.song) : null;
}

/**
 * Shown after a 403 on Save or Delete. A new tab, not a full navigation: this
 * is the one screen guaranteed to have unsaved text sitting on it, and
 * sending it to /unlock in place would throw that text away. Unlock over
 * there, then come back and press Save again with the text untouched.
 */
export function DeniedHint() {
  return (
    <p className="text-sm text-amber-400">
      This device is unlocked with the church PIN.{" "}
      <a href="/unlock?next=/" target="_blank" rel="noopener noreferrer" className="underline">
        Enter the admin PIN in a new tab
      </a>
      , then try again here.
    </p>
  );
}

/** Shown after a 401 on Save or Delete. A new tab for the same reason as DeniedHint. */
function LockedHint() {
  return (
    <p className="text-sm text-amber-400">
      This device is locked.{" "}
      <a href={unlockHref("/")} target="_blank" rel="noopener noreferrer" className="underline">
        Enter the admin PIN in a new tab
      </a>
      , then try again here.
    </p>
  );
}

export default function SongEditor({ song, onSaved, onDeleted, onCancel, showToast }: Props) {
  const [title, setTitle] = useState(song.title);
  const [author, setAuthor] = useState(song.author ?? "");
  const [lyrics, setLyrics] = useState(lyricsFromSections(song.sections));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Kept separate from the toast: the PIN hint needs a link in it, and a toast
  // disappears before anyone has read a sentence with a link in it.
  const [denied, setDenied] = useState(false);
  // The PIN changed or the cookie is gone: every route answers 401. Same
  // reasoning as `denied` — the way out is a link, and the text must survive it.
  const [locked, setLocked] = useState(false);
  // `busy` lands a render late; a second tap in that gap must not send twice.
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current || !title.trim() || !lyrics.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setDenied(false);
    setLocked(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, lyrics }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        const failure = await failureFrom(res, "Couldn't save the song");
        if (failure.kind === "locked") setLocked(true);
        return showToast(failure.message, "err");
      }
      const saved = songFromBody(await res.json());
      // A 200 that is not our answer is a captive portal or a proxy, not Lightdesk.
      if (!saved) return showToast(OFFLINE.message, "err");
      showToast(`Saved "${saved.title}"`);
      onSaved({ ...song, ...saved });
    } catch {
      showToast(OFFLINE.message, "err");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDenied(false);
    setLocked(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE", signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        const failure = await failureFrom(res, "Couldn't delete the song");
        if (failure.kind === "locked") setLocked(true);
        return showToast(failure.message, "err");
      }
      showToast(`Deleted "${song.title}"`);
      onDeleted();
    } catch {
      showToast(OFFLINE.message, "err");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">Edit song</h2>
        {/* Disabled while a save or delete is in flight: that request cannot be
            un-sent, so letting Cancel dismiss the form here would let its
            result land on a screen that already told the operator it didn't happen. */}
        <button onClick={onCancel} disabled={busy} className="shrink-0 rounded-md border border-ink-700 px-3 py-1.5 text-sm hover:bg-ink-800 disabled:opacity-50">
          Cancel
        </button>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" placeholder="Song title" className={field} />
      <input value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author" placeholder="Author (optional)" className={field} />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        aria-label="Song lyrics"
        rows={16}
        className={`${field} text-sm leading-relaxed`}
      />
      <p className="text-xs text-[var(--muted)]">
        A blank line starts a new section, and each section is copied on its own. Tidy removes labels like <span className="whitespace-nowrap">[Chorus]</span> and splits sections over six lines. Save keeps exactly what you see.
      </p>

      {denied && <DeniedHint />}
      {locked && <LockedHint />}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !title.trim() || !lyrics.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setLyrics(tidyLyrics(lyrics))} disabled={busy} className="rounded-md border border-ink-700 px-4 py-2 hover:bg-ink-800 disabled:opacity-50">
          Tidy
        </button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-sm text-[var(--muted)]">Delete this song?</span>
            <button onClick={remove} disabled={busy} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Confirm delete
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={busy} className="rounded-md border border-ink-700 px-3 py-2 text-sm hover:bg-ink-800 disabled:opacity-50">
              Don&rsquo;t delete
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} disabled={busy} className="rounded-md border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
