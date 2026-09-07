"use client";

import { useState } from "react";
import { tidyLyrics } from "@/lib/songSections";
import type { SearchableSong } from "@/lib/songSearch";

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

export default function SongEditor({ song, onSaved, onDeleted, onCancel, showToast }: Props) {
  const [title, setTitle] = useState(song.title);
  const [author, setAuthor] = useState(song.author ?? "");
  const [lyrics, setLyrics] = useState(lyricsFromSections(song.sections));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Kept separate from the toast: the PIN hint needs a link in it, and a toast
  // disappears before anyone has read a sentence with a link in it.
  const [denied, setDenied] = useState(false);

  async function save() {
    if (busy || !title.trim() || !lyrics.trim()) return;
    setBusy(true);
    setDenied(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, lyrics }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        return showToast(data.error ?? "Could not save the song", "err");
      }
      showToast(`Saved "${data.song.title}"`);
      onSaved({ ...song, ...data.song });
    } catch {
      showToast("Could not reach the server — the song is unchanged", "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setDenied(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        return showToast(data.error ?? "Could not delete the song", "err");
      }
      showToast(`Deleted "${song.title}"`);
      onDeleted();
    } catch {
      showToast("Could not reach the server — the song is unchanged", "err");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">Edit song</h2>
        <button onClick={onCancel} className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
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
        A blank line starts a new section — one section is one message in the chat. Tidy drops <span className="whitespace-nowrap">[Chorus]</span>-style labels and splits anything longer than six lines; Save keeps exactly what you see.
      </p>

      {denied && (
        <p className="text-sm text-amber-400">
          This browser is unlocked with the church PIN.{" "}
          {/* A full navigation, not a client route: the unlock page replaces this one and sends you back. */}
          <a href="/unlock?next=/" className="underline">
            Enter the admin PIN here
          </a>{" "}
          and try again.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !title.trim() || !lyrics.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setLyrics(tidyLyrics(lyrics))} disabled={busy} className="rounded-md border border-zinc-700 px-4 py-2 hover:bg-zinc-800 disabled:opacity-50">
          Tidy
        </button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-sm text-[var(--muted)]">Delete this song?</span>
            <button onClick={remove} disabled={busy} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
              Keep it
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} disabled={busy} className="rounded-md border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
