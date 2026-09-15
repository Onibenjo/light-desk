"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatSection } from "@/lib/videopsalm";
import { moveCursor, digitToIndex, togglePin } from "@/lib/songKeys";
import { isTypingTarget } from "@/lib/shortcuts";
import { hasFinePointer } from "@/lib/pointer";
import { buildIndex, searchSongs, type IndexedSong, type SearchableSong, type SongMatch } from "@/lib/songSearch";
import { resolveSetlist, songsById, staleNote, type MessageRow, type SongRow } from "@/lib/setlist";
import { messagesById, type Library } from "@/lib/messageLibrary";
import { failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { MatchedLine } from "./MatchedLine";
import SongEditor, { readSong, songFromBody } from "./SongEditor";
import SongList from "./SongList";
import SetlistBar from "./SetlistBar";
import StartSetlist from "./StartSetlist";
import { addToast, type SetlistApi } from "./useSetlist";

/**
 * How long a request waits before the control that sent it comes back. Quick
 * add is longer because a paste with no blank lines goes to the model first.
 */
const OPEN_TIMEOUT_MS = 15_000;
const QUICK_ADD_TIMEOUT_MS = 60_000;

/** What the server search last answered, for the query it answered. */
type ServerSearch = { kind: "done"; q: string; songs: SongMatch[] } | { kind: "failed"; q: string; failure: Failure };

function readSnippet(value: unknown): SongMatch["snippet"] | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  if (!("text" in value) || typeof value.text !== "string") return undefined;
  if (!("translation" in value) || typeof value.translation !== "boolean") return undefined;
  if (!("ranges" in value) || !Array.isArray(value.ranges)) return undefined;
  const raw: unknown[] = value.ranges;
  const ranges: { start: number; end: number }[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null || !("start" in r) || !("end" in r) || typeof r.start !== "number" || typeof r.end !== "number") return undefined;
    ranges.push({ start: r.start, end: r.end });
  }
  return { text: value.text, ranges, translation: value.translation };
}

function readMatch(value: unknown): SongMatch | null {
  if (typeof value !== "object" || value === null || !("song" in value)) return null;
  const song = readSong(value.song);
  if (!song) return null;
  const tier = "tier" in value ? value.tier : null;
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4 && tier !== 5) return null;
  if (!("matched" in value) || typeof value.matched !== "number" || !("words" in value) || typeof value.words !== "number") return null;
  const fuzzy = "fuzzy" in value && value.fuzzy === true;
  const section = "section" in value && typeof value.section === "number" ? value.section : null;
  const snippet = readSnippet("snippet" in value ? value.snippet : null);
  if (snippet === undefined) return null;
  return { song, tier, matched: value.matched, words: value.words, fuzzy, section, snippet };
}

/** `{ songs, total }` from GET /api/songs, or null when the body is not that. */
function readServerSearch(body: unknown): { songs: SongMatch[]; total: number | null } | null {
  if (typeof body !== "object" || body === null || !("songs" in body) || !Array.isArray(body.songs)) return null;
  const raw: unknown[] = body.songs;
  const songs: SongMatch[] = [];
  for (const m of raw) {
    const match = readMatch(m);
    if (!match) return null;
    songs.push(match);
  }
  return { songs, total: "total" in body && typeof body.total === "number" ? body.total : null };
}

interface Props {
  copyText: (t: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
  /** Owned by the desk, so the Songs and Messages tabs show one setlist. */
  setlistApi: SetlistApi;
  library: Library | null;
  copied: ReadonlySet<string>;
  /** A message row in the bar: the desk copies it, or switches to Messages to send it in parts. */
  onMessageRow: (row: MessageRow) => void;
  /** A song row tapped on the Messages tab, to open on arrival. */
  pendingSong: SongRow | null;
  onPendingSongDone: () => void;
}

export default function SongsTab({ copyText, showToast, logSend, setlistApi, library, copied, onMessageRow, pendingSong, onPendingSongDone }: Props) {
  const [q, setQ] = useState("");
  const { setlist, addItem, startSetlist } = setlistApi;
  // The song waiting for a setlist to exist.
  const [starting, setStarting] = useState<SearchableSong | null>(null);
  // Searching the local copy is fast but not free; deferring it keeps the
  // keystrokes themselves instant on a phone.
  const deferredQ = useDeferredValue(q);
  const [book, setBook] = useState<IndexedSong[] | null>(null);
  const byId = useMemo(() => songsById(book), [book]);
  const libraryById = useMemo(() => messagesById(library), [library]);
  const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, byId, libraryById) : []), [setlist, byId, libraryById]);
  // Results from the server, used only until the local book has arrived.
  const [remote, setRemote] = useState<ServerSearch | null>(null);
  // Bumped by "Search again" after a failed server search, to run the same query once more.
  const [retry, setRetry] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [song, setSong] = useState<SearchableSong | null>(null);
  // The section the remembered line was found in, marked but not jumped to.
  const [found, setFound] = useState<number | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  // One pin at a time, so there is never a question which section C sends.
  const [pinned, setPinned] = useState<number | null>(null);
  // Briefly flashes the row that was just copied, where the operator is looking.
  const [flash, setFlash] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addLyrics, setAddLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  // `busy` lands a render late; a second tap in that gap must not add the song twice.
  const addInFlight = useRef(false);
  // Read when a quick add answers: if the panel was cancelled meanwhile, the
  // saved song is not opened over whatever the operator moved on to.
  const addOpen = useRef(false);
  // Only the latest setlist-row tap may open its song when the fetch returns.
  const openSeq = useRef(0);
  // Which section the keyboard is pointing at. Real DOM focus follows it, so the
  // browser handles scrolling it into view and screen readers announce it.
  const [cursor, setCursor] = useState(0);
  const [hit, setHit] = useState(0); // highlighted row in the search results
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
  // What the server is asked, trimmed so a trailing space does not search again.
  const serverQ = book ? "" : q.trim();
  // The answer for exactly what is in the box; null while that is still on its way.
  const answered = remote?.q === serverQ ? remote : null;
  // While a new query is on its way the last results stay up, rather than flickering out.
  const hits = local ?? (serverQ && remote?.kind === "done" ? remote.songs : []);

  // Until the book has arrived, the server runs the same search for us. Each
  // query aborts the one before it, so a slow early answer cannot land on top
  // of a newer one.
  useEffect(() => {
    if (!serverQ) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      let failure: Failure;
      try {
        const res = await fetch(`/api/songs?q=${encodeURIComponent(serverQ)}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = readServerSearch(await res.json());
          if (ctrl.signal.aborted) return;
          if (data) {
            setRemote({ kind: "done", q: serverQ, songs: data.songs });
            setTotal((t) => data.total ?? t);
            return;
          }
          // A 200 that is not our answer is a captive portal or a proxy, not Lightdesk.
          failure = OFFLINE;
        } else {
          failure = await failureFrom(res, "The search did not run");
        }
      } catch {
        failure = OFFLINE;
      }
      if (!ctrl.signal.aborted) setRemote({ kind: "failed", q: serverQ, failure });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [serverQ, retry]);

  // Once a song is open its section buttons are already mounted, so a direct
  // focus (no rAF) always lands — the race is only ever on the *first* render
  // of a freshly opened song, handled below by the effect keyed on `song`.
  const focusSection = useCallback((i: number) => {
    setCursor(i);
    sectionRefs.current[i]?.focus();
  }, []);

  const openSong = useCallback((s: SearchableSong, matchedSection: number | null = null) => {
    // Any song opened supersedes a setlist row still fetching its own.
    openSeq.current++;
    setEditing(false);
    setSong(s);
    setFound(matchedSection);
    setSent(new Set());
    setPinned(null);
    sectionRefs.current = [];
    // Land on section 1 so the first Enter sends it, with no click needed — a
    // song is nearly always sent from the top, whichever line found it. The
    // actual DOM focus happens in the effect below, once the section buttons
    // have committed.
    setCursor(0);
  }, []);

  // Focuses the opened song's current section once React has committed its
  // buttons, instead of racing requestAnimationFrame against that commit.
  // Keyed on `song` itself, not `cursor`, so a mouse click that deliberately
  // stays put does not steal focus back.
  useEffect(() => {
    if (song) sectionRefs.current[cursor]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the opened song only, see comment above
  }, [song]);

  /** A setlist row: open the song from the book, or fetch that one song if the book is still loading. */
  const openSetlistRow = useCallback(
    async (row: SongRow) => {
      if (row.missing) return;
      if (row.song) return openSong(row.song);
      const seq = ++openSeq.current;
      const fallback = "Could not open that song — search for it";
      let message: string;
      try {
        const res = await fetch(`/api/songs/${row.id}`, { signal: AbortSignal.timeout(OPEN_TIMEOUT_MS) });
        if (res.ok) {
          const fetched = songFromBody(await res.json());
          if (seq !== openSeq.current) return;
          if (fetched) return openSong(fetched);
          message = fallback;
        } else {
          message = (await failureFrom(res, fallback)).message;
        }
      } catch {
        message = OFFLINE.message;
      }
      if (seq === openSeq.current) showToast(message, "err");
    },
    [openSong, showToast],
  );

  // A song row tapped on the Messages tab: the desk switched here to open it.
  useEffect(() => {
    if (!pendingSong) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a song handed over by the desk is the effect's whole job
    void openSetlistRow(pendingSong);
    onPendingSongDone();
  }, [pendingSong, openSetlistRow, onPendingSongDone]);

  /** + on a search row or in the song header. With no setlist yet, ask for a name first. */
  const addToSetlist = useCallback(
    async (song: SearchableSong) => {
      if (!setlist) return setStarting(song);
      if (song.id === undefined) return showToast("Save the song before adding it to a setlist", "err");
      const result = await addItem({ kind: "song", id: song.id, title: song.title });
      const toast = addToast(result, song.title, setlist.name);
      showToast(toast.text, toast.tone);
    },
    [setlist, addItem, showToast],
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

  useEffect(() => {
    addOpen.current = adding;
  }, [adding]);

  async function quickAdd() {
    if (addInFlight.current || !addTitle.trim() || !addLyrics.trim()) return;
    addInFlight.current = true;
    setBusy(true);
    const sentTitle = addTitle;
    const sentLyrics = addLyrics;
    // On any failure the panel and both fields stay as they are, so a retry is one tap.
    try {
      const res = await fetch("/api/songs/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sentTitle, lyrics: sentLyrics }),
        signal: AbortSignal.timeout(QUICK_ADD_TIMEOUT_MS),
      });
      if (!res.ok) return showToast((await failureFrom(res, "Could not add the song")).message, "err");
      const saved = songFromBody(await res.json());
      if (!saved) return showToast(OFFLINE.message, "err");
      showToast(`Saved "${saved.title}" — tap a section to send`);
      // Only what was sent: text typed into a reopened panel meanwhile is not this song.
      setAddTitle((t) => (t === sentTitle ? "" : t));
      setAddLyrics((l) => (l === sentLyrics ? "" : l));
      // Into the local index too, or it would be unsearchable until a reload.
      setBook((b) => (b ? [...b, ...buildIndex([saved])] : b));
      setTotal((t) => (t === null ? t : t + 1));
      if (addOpen.current) {
        setAdding(false);
        openSong(saved);
      }
    } catch {
      showToast(OFFLINE.message, "err");
    } finally {
      addInFlight.current = false;
      setBusy(false);
    }
  }

  function pin(i: number) {
    // A song with no sections has nothing to pin, and C would read past the end.
    if (!song || i < 0 || i >= song.sections.length) return;
    const next = togglePin(pinned, i);
    setPinned(next);
    showToast(next === null ? `Unpinned section ${i + 1}` : `Pinned section ${i + 1} — press C to re-send it`);
  }

  // Resolved after mount so the server and the first client render agree; the
  // keys it advertises only exist on a device that has them.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    // The hint is 43 characters and clips mid-word below the `sm` breakpoint,
    // so it also waits for a window wide enough to show all of it.
    const room = window.matchMedia("(min-width: 40rem)");
    const update = () => setKeyboard(hasFinePointer() && room.matches);
    update();
    room.addEventListener("change", update);
    return () => room.removeEventListener("change", update);
  }, []);

  const focusSearch = useCallback(() => {
    if (!hasFinePointer()) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closeSong = useCallback(() => {
    setSong(null);
    focusSearch();
  }, [focusSearch]);

  useEffect(() => {
    // A song is about to be handed over from the Messages tab: it wins the
    // focus once it opens, rather than the search box briefly grabbing it
    // just before that view replaces it.
    if (!pendingSong) focusSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; `pendingSong` is only checked, not tracked
  }, [focusSearch]);

  // Song-view keys. Safe on the document because this view renders no text field.
  useEffect(() => {
    if (!song || editing) return;
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
      {!song && !adding && !starting && (
        <>
          {setlist && (
            <SetlistBar
              name={setlist.name}
              staleNote={staleNote(setlist.updatedAt, new Date())}
              rows={setlistRows}
              copied={copied}
              onOpen={openSetlistRow}
              onMessage={onMessageRow}
            />
          )}
          <input
            ref={inputRef}
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
                // The results can shrink under a highlight that was moved down first.
                const pick = hits[Math.min(hit, hits.length - 1)];
                openSong(pick.song, pick.section);
              }
            }}
            aria-label="Search the songbook"
            placeholder={keyboard ? "Search the songbook — ↑↓ to pick, ↵ to open" : "Search the songbook"}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-xl outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            <span className="whitespace-nowrap">{total !== null && `${total} songs in the book`}</span>
            <span className="flex flex-wrap items-center gap-x-3">
              <Link href="/setlists" className="-my-1 inline-flex items-center py-1 underline hover:text-zinc-300 pointer-coarse:my-0 pointer-coarse:min-h-11">
                Setlists
              </Link>
              <button onClick={() => setAdding(true)} className="-my-1 inline-flex items-center py-1 underline hover:text-zinc-300 pointer-coarse:my-0 pointer-coarse:min-h-11">
                + Quick add a song
              </button>
              <Link href="/songs/import" className="-my-1 inline-flex items-center py-1 underline hover:text-zinc-300 pointer-coarse:my-0 pointer-coarse:min-h-11">
                Import songbook
              </Link>
            </span>
          </div>
          {hits.length > 0 && (
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60">
              {hits.map((m, hi) => (
                <li key={m.song.guid ?? m.song.id} className="flex items-stretch">
                  <button
                    onClick={() => openSong(m.song, m.section)}
                    onMouseEnter={() => setHit(hi)}
                    aria-current={hi === hit ? "true" : undefined}
                    className={`min-w-0 flex-1 px-4 py-3 text-left hover:bg-zinc-800/60 ${hi === hit ? "bg-zinc-800/60" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-medium wrap-break-word">{m.song.title}</span>
                      <span className="max-w-1/2 shrink-0 text-right text-xs wrap-break-word text-[var(--muted)]">
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
                  <button
                    onClick={() => addToSetlist(m.song)}
                    aria-label={`Add ${m.song.title} to the setlist`}
                    title="Add to the setlist"
                    className="grid min-h-11 min-w-11 shrink-0 place-items-center self-start text-lg text-[var(--muted)] hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Hidden rather than unmounted: the browse list is ~9,000 nodes, and
              rebuilding them every time the search box is cleared is the one
              cost `content-visibility` cannot skip. */}
          {book && book.length > 0 && (
            <div hidden={!!q.trim()}>
              <SongList book={book} onOpen={openSong} />
            </div>
          )}
          {answered?.kind === "failed" && (
            <p role="status" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="text-amber-400">The search did not run. {answered.failure.message.replace(/[.!]$/, "")}.</span>
              {answered.failure.kind === "locked" && (
                <Link href={unlockHref("/")} className="-my-1 inline-flex items-center py-1 underline pointer-coarse:my-0 pointer-coarse:min-h-11">
                  Unlock
                </Link>
              )}
              <button
                onClick={() => {
                  setRemote(null);
                  setRetry((n) => n + 1);
                }}
                className="-my-1 inline-flex items-center py-1 underline pointer-coarse:my-0 pointer-coarse:min-h-11"
              >
                Search again
              </button>
            </p>
          )}
          {serverQ && !answered && hits.length === 0 && <p className="text-sm text-[var(--muted)]">Searching the songbook…</p>}
          {q.trim() && hits.length === 0 && (local !== null || answered?.kind === "done") && (
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
            <button onClick={() => setAdding(false)} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 pointer-coarse:min-h-11">
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

      {starting && (
        <StartSetlist
          what={starting.title}
          onCancel={() => setStarting(null)}
          onStart={async (name) => {
            const song = starting;
            if (song.id === undefined) {
              setStarting(null);
              return showToast("Save the song before adding it to a setlist", "err");
            }
            const result = await startSetlist(name, { kind: "song", id: song.id, title: song.title });
            // The form stays up, with the name as typed, only when nothing was
            // created: Start again is then safe. Otherwise it closes, or a second
            // try would make a second setlist of the same name.
            const nothingMade = typeof result === "object" && result.created === undefined;
            if (!nothingMade) setStarting((s) => (s === song ? null : s));
            showToast(result === "added" ? `Started ${name} with "${song.title}"` : addToast(result, song.title, name).text, result === "added" ? "ok" : "err");
          }}
        />
      )}

      {song && !editing && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 basis-full text-lg font-semibold leading-tight wrap-break-word sm:basis-auto">{song.title}</h2>
            <span className="flex flex-wrap gap-2 sm:shrink-0">
              <button onClick={() => addToSetlist(song)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 pointer-coarse:min-h-11">
                {setlist ? "+ Setlist" : "Start a setlist"}
              </button>
              <button onClick={() => setEditing(true)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 pointer-coarse:min-h-11">
                Edit
              </button>
              <button onClick={closeSong} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 pointer-coarse:min-h-11">
                ← Songs
              </button>
            </span>
          </div>
          {pinned !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-2">
              <span className="px-1 text-xs uppercase tracking-wide text-[var(--muted)]">Pinned</span>
              <button onClick={() => copySection(pinned)} className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-medium text-black pointer-coarse:min-h-11">
                <span className="sr-only">Re-send </span>↻ {pinned + 1} · {Array.from(song.sections[pinned].split("\n")[0]).slice(0, 28).join("")}
              </button>
              <span className="kbd">C</span>
            </div>
          )}
          <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
            <span className="kbd">↵</span> send and move on · <span className="kbd">↑</span> <span className="kbd">↓</span> pick · <span className="kbd">1</span>–<span className="kbd">9</span> jump ·{" "}
            <span className="kbd">P</span> pin this one · <span className="kbd">C</span> re-send the pinned one · <span className="kbd">Esc</span> back
          </p>
          {song.sections.length === 0 && <p className="text-sm text-[var(--muted)]">This song has no sections to send. Edit it to add the lyrics.</p>}
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
                  className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/60 ${i === cursor ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
                >
                  <span className="mr-2 text-xs text-[var(--muted)]">{i + 1}</span>
                  {pinned === i && <span className="mr-2 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black">Pinned</span>}
                  {found === i && (
                    <span className="mr-2 rounded border border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                      Your line
                    </span>
                  )}
                  <span className="whitespace-pre-wrap text-[15px] leading-relaxed wrap-break-word">{sec}</span>
                </button>
                <button
                  onClick={() => pin(i)}
                  aria-pressed={pinned === i}
                  aria-label={`${pinned === i ? "Unpin" : "Pin"} section ${i + 1} for quick re-send`}
                  title="Pin for quick re-send (the chorus)"
                  className={`grid min-h-11 min-w-11 shrink-0 place-items-center self-start rounded-md text-sm ${pinned === i ? "bg-[var(--accent)]" : "hover:bg-zinc-800"}`}
                >
                  📌
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {song && editing && (
        <SongEditor
          song={song}
          showToast={showToast}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setSong(saved);
            setSent(new Set());
            setPinned(null);
            // An edit can move section boundaries, so the old index no longer points
            // at the line that matched the search — same reason openSong resets it.
            setFound(null);
            sectionRefs.current = [];
            // The local index is the search: without this the old lyrics keep
            // answering searches until the page is reloaded.
            setBook((b) => (b ? [...b.filter((i) => i.song.id !== saved.id), ...buildIndex([saved])] : b));
            // The section buttons remount for the saved song; the effect keyed
            // on `song` focuses section 0 once they have.
            setCursor(0);
          }}
          onDeleted={() => {
            setEditing(false);
            setBook((b) => (b ? b.filter((i) => i.song.id !== song.id) : b));
            setTotal((t) => (t === null ? t : t - 1));
            closeSong();
          }}
        />
      )}
    </div>
  );
}
