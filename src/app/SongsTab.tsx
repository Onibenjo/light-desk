"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatSection } from "@/lib/videopsalm";

export interface SongHit {
  id?: number;
  guid?: string;
  title: string;
  author?: string | null;
  sections: string[];
  source?: string;
}

interface Props {
  copyText: (t: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
}

export default function SongsTab({ copyText, showToast, logSend }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SongHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [song, setSong] = useState<SongHit | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [pinned, setPinned] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addLyrics, setAddLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  const search = useCallback(async (query: string) => {
    const res = await fetch(`/api/songs?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setHits(data.songs ?? []);
    setTotal(data.total ?? null);
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => search(q), 200);
    return () => window.clearTimeout(debounce.current);
  }, [q, search]);

  function openSong(s: SongHit) {
    setSong(s);
    setSent(new Set());
    setPinned([]);
  }

  async function copySection(i: number) {
    if (!song) return;
    const text = formatSection(song.sections[i]);
    const ok = await copyText(text);
    if (ok) {
      setSent((prev) => new Set(prev).add(i));
      showToast(`Copied section ${i + 1} of ${song.sections.length} — paste in Mixlr`);
      logSend("song", `${song.title} §${i + 1}`, text);
    } else {
      showToast("Clipboard blocked — tap again", "err");
    }
  }

  async function quickAdd() {
    if (!addTitle.trim() || !addLyrics.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/songs/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: addTitle, lyrics: addLyrics }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error ?? "Could not add the song", "err");
      showToast(`Saved "${addTitle}" — tap a section to send`);
      setAdding(false);
      setAddTitle("");
      setAddLyrics("");
      openSong(data.song as SongHit);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!song && !adding && (
        <>
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the songbook"
            placeholder="Search the songbook — title or a line of the lyrics"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-xl outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>{total !== null && `${total} songs in the book`}</span>
            <span className="flex gap-3">
              <button onClick={() => setAdding(true)} className="underline hover:text-zinc-300">
                + Quick add a song
              </button>
              <Link href="/songs/import" className="underline hover:text-zinc-300">
                Import songbook
              </Link>
            </span>
          </div>
          {hits.length > 0 && (
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60">
              {hits.map((s) => (
                <li key={s.guid ?? s.id}>
                  <button onClick={() => openSong(s)} className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/60">
                    <span className="font-medium">{s.title}</span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {s.author ? `${s.author} · ` : ""}
                      {s.sections.length} section{s.sections.length === 1 ? "" : "s"}
                      {s.source === "manual" ? " · added here" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && hits.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Nothing matched — try fewer words, or{" "}
              <button onClick={() => setAdding(true)} className="underline">
                quick add it
              </button>
              .
            </p>
          )}
        </>
      )}

      {adding && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Quick add a song</h2>
            <button onClick={() => setAdding(false)} className="text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
          </div>
          <input
            autoFocus
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            aria-label="Song title"
            placeholder="Song title"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={addLyrics}
            onChange={(e) => setAddLyrics(e.target.value)}
            aria-label="Song lyrics"
            placeholder="Paste the lyrics from anywhere — messy is fine, they'll be cleaned and split into sections"
            rows={10}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button onClick={quickAdd} disabled={busy || !addTitle.trim() || !addLyrics.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
            {busy ? "Cleaning up…" : "Save and open"}
          </button>
        </div>
      )}

      {song && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold leading-tight">{song.title}</h2>
            <button
              onClick={() => {
                setSong(null);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              ← Songs
            </button>
          </div>
          {pinned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pinned.map((i) => (
                <button key={i} onClick={() => copySection(i)} className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-medium text-black">
                  ↻ {song.sections[i].split("\n")[0].slice(0, 24)}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-[var(--muted)]">Tap a section to copy it with 🎵 · pin the chorus to re-send it fast · sent sections dim.</p>
          <ol className="space-y-2">
            {song.sections.map((sec, i) => (
              <li key={i} className={`flex gap-2 rounded-xl border p-1 ${sent.has(i) ? "border-zinc-800/60 opacity-45" : "border-zinc-800 bg-zinc-900/60"}`}>
                <button onClick={() => copySection(i)} className="flex-1 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/60">
                  <span className="mr-2 text-xs text-[var(--muted)]">{i + 1}</span>
                  <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{sec}</span>
                </button>
                <button
                  onClick={() => setPinned((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}
                  title="Pin for quick re-send (the chorus)"
                  className={`self-start rounded-md px-2 py-2 text-sm ${pinned.includes(i) ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-zinc-300"}`}
                >
                  📌
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
