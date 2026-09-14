"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { comingSundayName, moveItem, planMessageEdit, withParts } from "@/lib/setlist";
import { itemKey } from "@/lib/setlistEdit";
import { useMessages } from "../useMessages";
import { messageLabel, messagesById } from "@/lib/messageLibrary";
import { partsFromText, textFromParts } from "@/lib/messageEdit";
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
  const { library } = useMessages();
  const byId = useMemo(() => messagesById(library), [library]);
  /** The message item whose text is being edited for its service: setlist id and item key. */
  const [editing, setEditing] = useState<{ setlistId: number; key: string; text: string } | null>(null);

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

  /** PATCHes the setlist and reloads it either way. Returns whether it saved, so a caller that closes an editor on success does not lose the operator's text on a 409 or a 400. */
  async function send(id: number, body: unknown): Promise<boolean> {
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
      return res.ok;
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
        <Link href="/" className="inline-flex items-center text-sm underline text-[var(--muted)] hover:text-zinc-300 pointer-coarse:min-h-11">
          ← Back to the desk
        </Link>
      </div>

      <p className="text-sm text-[var(--muted)]">
        The active setlist is the one the operator sees at the top of the Songs and Messages tabs. Add songs and messages
        to it from there, with the + beside a search result or a message.
      </p>

      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New setlist name"
          placeholder="Sunday 14 Sept — 1st service"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)] pointer-coarse:min-h-11"
        />
        <button onClick={create} disabled={busy || !name.trim()} className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11">
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
              className="min-w-48 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none pointer-coarse:min-h-11"
            />
            <span className="flex flex-wrap items-center gap-2">
              {s.active ? (
                <span className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold uppercase text-black">Active</span>
              ) : (
                <button onClick={() => send(s.id, { active: true })} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50 pointer-coarse:min-h-11">
                  Make active
                </button>
              )}
              <button
                onClick={() => (confirming === s.id ? remove(s.id) : setConfirming(s.id))}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {confirming === s.id ? "Sure?" : "Delete"}
              </button>
            </span>
          </div>

          {s.items.length === 0 ? (
            <p className="px-2 text-sm text-[var(--muted)]">Nothing in it yet — add songs and messages from the desk.</p>
          ) : (
            <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {s.items.map((item, i) => {
                const entry = item.kind === "message" ? byId?.get(item.id) : undefined;
                const label = entry ? messageLabel(entry.section, entry.message) : item.title;
                const key = itemKey(item);
                const isEditing = editing?.setlistId === s.id && editing.key === key;
                return (
                  <li key={key} className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                        <span className="w-5 shrink-0 text-center text-xs text-[var(--muted)]">{i + 1}</span>
                        <span className="shrink-0" aria-label={item.kind === "song" ? "Song" : "Message"}>
                          {item.kind === "song" ? "🎵" : "💬"}
                        </span>
                        <span className="min-w-0 flex-1 text-sm sm:truncate">
                          {label}
                          {item.kind === "message" && item.parts && (
                            <span className="ml-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">edited</span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 pl-7 sm:pl-0">
                        {item.kind === "message" && !isEditing && (
                          <button
                            onClick={() => setEditing({ setlistId: s.id, key, text: textFromParts(item.parts ?? entry?.message.parts ?? []) })}
                            disabled={busy || (!item.parts && !entry)}
                            className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-30 pointer-coarse:min-h-11"
                          >
                            Edit for this service
                          </button>
                        )}
                        <button onClick={() => send(s.id, { items: moveItem(s.items, i, -1), updatedAt: s.updatedAt })} disabled={busy || i === 0} aria-label={`Move ${label} up`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                          ↑
                        </button>
                        <button onClick={() => send(s.id, { items: moveItem(s.items, i, 1), updatedAt: s.updatedAt })} disabled={busy || i === s.items.length - 1} aria-label={`Move ${label} down`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30">
                          ↓
                        </button>
                        <button onClick={() => send(s.id, { items: s.items.filter((x) => itemKey(x) !== key), updatedAt: s.updatedAt })} disabled={busy} aria-label={`Remove ${label}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30">
                          ×
                        </button>
                      </span>
                    </div>
                    {isEditing && editing && (
                      <div className="mt-2 space-y-2 pl-7">
                        <textarea
                          autoFocus
                          value={editing.text}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                          aria-label={`Text of ${label} for this service`}
                          rows={6}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <p className="text-xs text-[var(--muted)]">Only this setlist changes. A blank line starts a new post. Once edited, fixes to the library no longer reach this item.</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={async () => {
                              const parts = partsFromText(editing.text);
                              if (typeof parts === "string") return setError(parts);
                              const alreadyEdited = item.kind === "message" && item.parts !== undefined;
                              const plan = planMessageEdit(parts, entry?.message.parts, alreadyEdited);
                              // Typed back the library's own words: nothing to
                              // save, or an edit to undo — either way, no PATCH
                              // needed and the editor can close right away.
                              if (plan.kind === "skip") return setEditing(null);
                              const nextParts = plan.kind === "save" ? plan.parts : undefined;
                              const ok = await send(s.id, { items: withParts(s.items, i, nextParts), updatedAt: s.updatedAt });
                              // A 409 or a 400 leaves the editor open with what was typed, rather than losing it.
                              if (ok) setEditing(null);
                            }}
                            disabled={busy}
                            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11"
                          >
                            Save for this service
                          </button>
                          {item.kind === "message" && item.parts && entry && (
                            <button
                              onClick={() => {
                                setEditing(null);
                                void send(s.id, { items: withParts(s.items, i, undefined), updatedAt: s.updatedAt });
                              }}
                              disabled={busy}
                              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50 pointer-coarse:min-h-11"
                            >
                              Reset to library text
                            </button>
                          )}
                          <button onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 pointer-coarse:min-h-11">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </main>
  );
}
