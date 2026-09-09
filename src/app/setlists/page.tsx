"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { comingSundayName, moveItem } from "@/lib/setlist";
import type { Setlist } from "../useSetlist";

/**
 * Preparing a service. Separate from the desk because this is done the night
 * before, on a phone, and the desk itself must stay a search box and a song.
 *
 * Every write sends the whole setlist back, so each one carries the updatedAt
 * it started from and a 409 means someone else got there first — the page
 * reloads rather than guessing how to merge.
 */
export default function SetlistsPage() {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The setlist whose Delete has been armed; a second press does it. */
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/setlists");
    if (!res.ok) return setError("Could not load the setlists");
    const data = (await res.json()) as { setlists: Setlist[] };
    setSetlists(data.setlists);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(comingSundayName(new Date()));
    void load();
  }, [load]);

  async function send(id: number, body: unknown) {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      const res = await fetch(`/api/setlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) setError("Someone else changed this setlist — reloaded it for you");
      else if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not save");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setConfirming(null);
    try {
      const res = await fetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not create it");
      setName(comingSundayName(new Date()));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/setlists/${id}`, { method: "DELETE" });
      setConfirming(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Setlists</h1>
        <Link href="/" className="text-sm underline text-[var(--muted)] hover:text-zinc-300">
          ← Back to the desk
        </Link>
      </div>

      <p className="text-sm text-[var(--muted)]">
        The active setlist is the one the operator sees at the top of the Songs tab. Add songs to it from there, with the
        + beside a search result.
      </p>

      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New setlist name"
          placeholder="Sunday 14 Sept — 1st service"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <button onClick={create} disabled={busy || !name.trim()} className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
          New setlist
        </button>
      </div>

      {setlists.length === 0 && <p className="text-sm text-[var(--muted)]">No setlists yet.</p>}

      {setlists.map((s) => (
        <section key={s.id} className={`space-y-2 rounded-xl border p-4 ${s.active ? "border-[var(--accent)]/60 bg-[var(--accent)]/5" : "border-zinc-800 bg-zinc-900/60"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              defaultValue={s.name}
              onBlur={(e) => e.target.value.trim() !== s.name && send(s.id, { name: e.target.value })}
              aria-label={`Name of ${s.name}`}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="flex shrink-0 gap-2">
              {s.active ? (
                <span className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold uppercase text-black">Active</span>
              ) : (
                <button onClick={() => send(s.id, { active: true })} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50">
                  Make active
                </button>
              )}
              <button
                onClick={() => (confirming === s.id ? remove(s.id) : setConfirming(s.id))}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {confirming === s.id ? "Sure?" : "Delete"}
              </button>
            </span>
          </div>

          {s.items.length === 0 ? (
            <p className="px-2 text-sm text-[var(--muted)]">No songs yet — add them from the Songs tab.</p>
          ) : (
            <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {s.items.map((item, i) => (
                <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="w-5 shrink-0 text-center text-xs text-[var(--muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <button onClick={() => send(s.id, { items: moveItem(s.items, i, -1), updatedAt: s.updatedAt })} disabled={busy || i === 0} aria-label={`Move ${item.title} up`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                    ↑
                  </button>
                  <button onClick={() => send(s.id, { items: moveItem(s.items, i, 1), updatedAt: s.updatedAt })} disabled={busy || i === s.items.length - 1} aria-label={`Move ${item.title} down`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                    ↓
                  </button>
                  <button onClick={() => send(s.id, { items: s.items.filter((x) => x.id !== item.id), updatedAt: s.updatedAt })} disabled={busy} aria-label={`Remove ${item.title}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30">
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </main>
  );
}
