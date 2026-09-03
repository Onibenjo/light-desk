"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatSection } from "@/lib/videopsalm";
import { moveCursor, digitToIndex, togglePin } from "@/lib/songKeys";
import { isTypingTarget } from "@/lib/shortcuts";
import { buildIndex, searchSongs, type IndexedSong, type SearchableSong, type SongMatch } from "@/lib/songSearch";
import { MatchedLine } from "./MatchedLine";

interface Props {
  copyText: (t: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
}

export default function SongsTab({ copyText, showToast, logSend }: Props) {
  const [q, setQ] = useState("");
  // Searching the local copy is fast but not free; deferring it keeps the
  // keystrokes themselves instant on a phone.
  const deferredQ = useDeferredValue(q);
  const [book, setBook] = useState<IndexedSong[] | null>(null);
  // Results from the server, used only until the local book has arrived.
  const [remote, setRemote] = useState<SongMatch[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [song, setSong] = useState<SearchableSong | null>(null);
  // The section the remembered line was found in, marked but not jumped to.
  const [found, setFound] = useState<number | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  // One pin at a time, so there is never a question which section C sends.
  const [pinned, setPinned] = useState<number | null>(null);
  // Briefly flashes the row that was just copied, where the operator is looking.
  const [flash, setFlash] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addLyrics, setAddLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  // Which section the keyboard is pointing at. Real DOM focus follows it, so the
  // browser handles scrolling it into view and screen readers announce it.
  const [cursor, setCursor] = useState(0);
  const [hit, setHit] = useState(0); // highlighted row in the search results
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const debounce = useRef<number | undefined>(undefined);

  // The whole songbook, once. From here on a search costs no network at all,
  // which is what makes it usable on the venue's wifi.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/songs/all");
        // An expired PIN answers 401 with a body that parses cleanly. Taking it
        // would leave an empty book shadowing the server path for the rest of
        // the service, so anything but a real songbook stays on that path.
        if (!res.ok) return;
        const data = await res.json();
        if (!live || !Array.isArray(data.songs) || !data.songs.length) return;
        setBook(buildIndex(data.songs));
        setTotal(data.total ?? null);
      } catch {
        // Stay on the server path; it answers the same way, just slower.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Once the book is here the results are simply a function of what was typed;
  // nothing to store, and no round-trip.
  const local = useMemo(() => (book ? searchSongs(book, deferredQ) : null), [book, deferredQ]);
  const hits = local ?? (q.trim() ? remote : []);

  // Until the book has arrived, the server runs the same search for us.
  useEffect(() => {
    if (book || !q.trim()) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      const res = await fetch(`/api/songs?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      setRemote(data.songs ?? []);
      setTotal((t) => data.total ?? t);
    }, 200);
    return () => window.clearTimeout(debounce.current);
  }, [q, book]);

  const focusSection = useCallback((i: number) => {
    setCursor(i);
    requestAnimationFrame(() => sectionRefs.current[i]?.focus());
  }, []);

  const openSong = useCallback(
    (s: SearchableSong, matchedSection: number | null = null) => {
      setSong(s);
      setFound(matchedSection);
      setSent(new Set());
      setPinned(null);
      sectionRefs.current = [];
      // Land on section 1 so the first Enter sends it, with no click needed —
      // a song is nearly always sent from the top, whichever line found it.
      focusSection(0);
    },
    [focusSection],
  );

  async function copySection(i: number, advance = false) {
    if (!song) return;
    const text = formatSection(song.sections[i]);
    const ok = await copyText(text);
    if (ok) {
      setSent((prev) => new Set(prev).add(i));
      showToast(`Copied section ${i + 1} of ${song.sections.length} — paste in Mixlr`);
      logSend("song", `${song.title} §${i + 1}`, text);
      setFlash(i);
      window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 700);
      // Only advance on a keyboard send; a mouse user picked that section on purpose.
      focusSection(advance ? moveCursor(i, 1, song.sections.length) : i);
    } else {
      // Don't move on: they need to retry this same section.
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
      const saved = data.song as SearchableSong;
      // Into the local index too, or it would be unsearchable until a reload.
      setBook((b) => (b ? [...b, ...buildIndex([saved])] : b));
      setTotal((t) => (t === null ? t : t + 1));
      openSong(saved);
    } finally {
      setBusy(false);
    }
  }

  function pin(i: number) {
    const next = togglePin(pinned, i);
    setPinned(next);
    showToast(next === null ? `Unpinned section ${i + 1}` : `Pinned section ${i + 1} — press C to re-send it`);
  }

  const closeSong = useCallback(() => {
    setSong(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Song-view keys. Safe on the document because this view renders no text field.
  useEffect(() => {
    if (!song) return;
    const count = song.sections.length;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target as HTMLElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return closeSong();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return focusSection(moveCursor(cursor, e.key === "ArrowDown" ? 1 : -1, count));
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        return pin(cursor);
      }
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (pinned !== null) copySection(pinned);
        else showToast("Pin a section first (P), then C re-sends it", "warn");
        return;
      }
      const jump = digitToIndex(e.key, count);
      if (jump !== null) {
        e.preventDefault();
        copySection(jump);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      {!song && !adding && (
        <>
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (!hits.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHit((i) => Math.min(hits.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHit((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                openSong(hits[hit].song, hits[hit].section);
              }
            }}
            aria-label="Search the songbook"
            placeholder="Search the songbook — ↑↓ to pick, ↵ to open"
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
              {hits.map((m, hi) => (
                <li key={m.song.guid ?? m.song.id}>
                  <button
                    onClick={() => openSong(m.song, m.section)}
                    onMouseEnter={() => setHit(hi)}
                    aria-current={hi === hit ? "true" : undefined}
                    className={`w-full px-4 py-3 text-left hover:bg-zinc-800/60 ${hi === hit ? "bg-zinc-800/60" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{m.song.title}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        {m.matched < m.words && <span className="text-amber-400/80">{m.matched} of {m.words} words · </span>}
                        {m.fuzzy && <span className="text-amber-400/80">spelling · </span>}
                        {m.song.author ? `${m.song.author} · ` : ""}
                        {m.song.sections.length} section{m.song.sections.length === 1 ? "" : "s"}
                        {m.song.source === "manual" ? " · added here" : ""}
                      </span>
                    </span>
                    {m.snippet && (
                      <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">
                        <MatchedLine text={m.snippet.text} ranges={m.snippet.ranges} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && hits.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Nothing matched — even part of it. Check a word, or{" "}
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
            <button onClick={closeSong} className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
              ← Songs
            </button>
          </div>
          {pinned !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-2">
              <span className="px-1 text-xs uppercase tracking-wide text-[var(--muted)]">Pinned</span>
              <button onClick={() => copySection(pinned)} className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-medium text-black">
                <span className="sr-only">Re-send </span>↻ {pinned + 1} · {song.sections[pinned].split("\n")[0].slice(0, 28)}
              </button>
              <span className="kbd">C</span>
            </div>
          )}
          <p className="text-xs text-[var(--muted)]">
            <span className="kbd">↵</span> send and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> jump ·{" "}
            <span className="kbd">P</span> pin this one · <span className="kbd">C</span> re-send the pinned one · <span className="kbd">Esc</span> back
          </p>
          <ol className="space-y-2">
            {song.sections.map((sec, i) => (
              <li
                key={i}
                className={`flex gap-2 rounded-xl border p-1 transition-colors ${
                  flash === i
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : pinned === i
                      ? "border-[var(--accent)]/60 bg-zinc-900/60"
                      : sent.has(i)
                        ? "border-zinc-800/60 opacity-60"
                        : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                <button
                  ref={(el) => {
                    sectionRefs.current[i] = el;
                  }}
                  onClick={() => copySection(i)}
                  onFocus={() => setCursor(i)}
                  onKeyDown={(e) => {
                    // Handled here rather than by native activation so a keyboard
                    // send advances the cursor and a mouse click doesn't.
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      copySection(i, true);
                    }
                  }}
                  tabIndex={i === cursor ? 0 : -1}
                  className={`flex-1 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/60 ${i === cursor ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
                >
                  <span className="mr-2 text-xs text-[var(--muted)]">{i + 1}</span>
                  {pinned === i && <span className="mr-2 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black">Pinned</span>}
                  {found === i && (
                    <span className="mr-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                      Your line
                    </span>
                  )}
                  <span className="whitespace-pre-wrap text-[15px] leading-relaxed">{sec}</span>
                </button>
                <button
                  onClick={() => pin(i)}
                  aria-pressed={pinned === i}
                  aria-label={`${pinned === i ? "Unpin" : "Pin"} section ${i + 1} for quick re-send`}
                  title="Pin for quick re-send (the chorus)"
                  className={`self-start rounded-md px-2 py-2 text-sm ${pinned === i ? "bg-[var(--accent)]" : "hover:bg-zinc-800"}`}
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
