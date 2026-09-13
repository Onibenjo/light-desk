"use client";

import { useState } from "react";
import { comingSundayName } from "@/lib/setlist";

interface Props {
  /** What will be first in it: a song title or a message label. */
  what: string;
  onCancel: () => void;
  onStart: (name: string) => void;
}

/** Naming a new setlist, prefilled with the coming Sunday. Shared by the Songs and Messages tabs. */
export default function StartSetlist({ what, onCancel, onStart }: Props) {
  const [name, setName] = useState(() => comingSundayName(new Date()));
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Start a setlist</h2>
        <button onClick={onCancel} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
          Cancel
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">&ldquo;{what}&rdquo; will be first.</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Setlist name"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
      />
      <button onClick={() => name.trim() && onStart(name.trim())} disabled={!name.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
        Start it
      </button>
    </div>
  );
}
