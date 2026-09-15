"use client";

import { useRef, useState, type SubmitEvent } from "react";
import { comingSundayName } from "@/lib/setlist";
// The server's own cap, so the field stops where the server would refuse.
import { MAX_NAME } from "@/lib/setlistEdit";

interface Props {
  /** What will be first in it: a song title or a message label. */
  what: string;
  onCancel: () => void;
  /**
   * May return a promise: the button then reads "Starting the setlist…" until it settles,
   * and a second Enter or tap in the meantime does nothing.
   */
  onStart: (name: string) => unknown;
}

/** Naming a new setlist, prefilled with the coming Sunday. Shared by the Songs and Messages tabs. */
export default function StartSetlist({ what, onCancel, onStart }: Props) {
  const [name, setName] = useState(() => comingSundayName(new Date()));
  const [busy, setBusy] = useState(false);
  // State alone cannot stop a double Enter: both keydowns land before the re-render.
  const submitting = useRef(false);
  const trimmed = name.trim();

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trimmed || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await onStart(trimmed);
    } catch {
      // The caller owns the toast; all this form must do is never stay stuck on "Starting the setlist…".
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Start a setlist</h2>
        <button type="button" onClick={onCancel} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 pointer-coarse:min-h-11">
          Cancel
        </button>
      </div>
      <p className="text-sm wrap-break-word text-[var(--muted)]">&ldquo;{what}&rdquo; goes first.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME}
        enterKeyHint="go"
        aria-label="Setlist name"
        placeholder="Setlist name"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
      />
      <button type="submit" disabled={!trimmed || busy} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11">
        {busy ? "Starting the setlist…" : "Start the setlist"}
      </button>
    </form>
  );
}
