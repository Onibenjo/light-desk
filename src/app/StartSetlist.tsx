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
   * May return a promise: the button then reads "Starting the service order…" until it settles,
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
      // The caller owns the toast; all this form must do is never stay stuck on "Starting the service order…".
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="display text-[26px]">Start a service order</h2>
        <button type="button" onClick={onCancel} className="btn btn-sm btn-quiet -mr-2 shrink-0">
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
        aria-label="Service order name"
        placeholder="Service order name"
        className="field w-full"
      />
      <button type="submit" disabled={!trimmed || busy} className="btn btn-primary">
        {busy ? "Starting the service order…" : "Start the service order"}
      </button>
    </form>
  );
}
