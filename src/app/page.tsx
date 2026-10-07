"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette, { openPalette, PaletteKey, type ShortcutGuide } from "./CommandPalette";
import { isTypingTarget, type Action } from "@/lib/shortcuts";
import { BUSY_DELAY_MS } from "@/lib/timing";
import { hasFinePointer } from "@/lib/pointer";
import { TRANSLATIONS, DEFAULT_TRANSLATION, translationFromInput } from "@/lib/translations";
import { BOOKS } from "@/lib/books";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";
import Toast, { copyText, useToast } from "./Toast";
import RecentVerses from "./RecentVerses";
import { dayBounds, toISODate } from "@/lib/logQuery";
import { recentVerses, withRecent, type RecentVerse } from "@/lib/recentVerses";
import SongsTab from "./SongsTab";
import WhatsNew from "./WhatsNew";
import LiveClock from "./LiveClock";
import LastCopied, { type LastCopy } from "./LastCopied";
import HowItWorks, { HOW_IT_WORKS_ID } from "./HowItWorks";
import { useFirstRun } from "./useFirstRun";
import MessagesTab from "./MessagesTab";
import { useSetlist } from "./useSetlist";
import { useMessages } from "./useMessages";
import { useMessageCopy } from "./useMessageCopy";
import { useSongProgress } from "./useSongProgress";
import { messageActions } from "@/lib/messageActions";
import { messagesById, openMessageFor, type LibraryEntry, type OpenMessage } from "@/lib/messageLibrary";
import { openMessageFromRow, type MessageRow, type SongRow } from "@/lib/setlist";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { tabIndexForKey } from "@/lib/tabKeys";

const TABS = [
  { id: "verses", icon: "book", label: "Verses" },
  { id: "songs", icon: "music", label: "Songs" },
  { id: "messages", icon: "message", label: "Engagement" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Ref = { book: number; chapter: number; verseStart: number; verseEnd: number };
type Passage = {
  reference: string;
  translationCode: string;
  translationName: string;
  verses: { verse: number; text: string }[];
  source: "local" | "cache" | "youversion" | "apibible" | "gateway" | "llm";
  attempts?: string[];
};
type PassageResult = { passage: Passage; text: string; chunks: string[]; ms: number; ref: Ref };
type Candidate = { label: string; why: string; ref: Ref };

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "youversion", label: "YouVersion" },
  { value: "apibible", label: "API.Bible" },
  { value: "gateway", label: "BibleGateway" },
  { value: "llm", label: "AI-quoted" },
];

const SOURCE_LABEL: Record<Passage["source"], string> = {
  local: "bundled KJV",
  cache: "saved copy",
  youversion: "YouVersion",
  apibible: "API.Bible",
  gateway: "BibleGateway fallback",
  llm: "AI-quoted, may be wrong — read it before you copy",
};

/**
 * A part as it will read in the Mixlr chat: the reference and translation lines
 * set as its header, the verses at reading size. Styling only — the string is
 * the one on the clipboard, and anything not starting with the header is shown
 * whole rather than guessed at.
 */
function PostPreview({ text, header, children }: { text: string; header: string; children?: React.ReactNode }) {
  const hasHeader = text.startsWith(header + "\n");
  const [reference, translation] = header.split("\n");
  const body = hasHeader ? text.slice(header.length + 1) : text;
  const lines = body.split("\n");
  return (
    <div className="px-5 pt-5 pb-7 sm:px-7 sm:pt-6 sm:pb-8">
      {hasHeader && (
        <p className="mb-5">
          <span className="display block text-[40px] sm:text-[56px]">{reference}</span>
          <span className="mt-3 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] text-[var(--muted)] uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-ink-500" />
            {translation}
          </span>
        </p>
      )}
      {/* The actions come before the text, so on a phone Copy again and Next
          verse are on screen without scrolling past a long passage. */}
      {children}
      {/* Each verse's number is set apart so the eye can find verse 29 in a
          long passage. Display only: the characters are the clipboard's. */}
      <pre className="mt-6 wrap-anywhere whitespace-pre-wrap font-text text-lg leading-[1.7] text-ink-100 sm:text-[20px]">
        {lines.map((line, i) => {
          const m = /^(\d+)\./.exec(line);
          return (
            <span key={i}>
              {i > 0 && "\n"}
              {m ? (
                <>
                  <span className="font-mono text-[0.78em] font-semibold text-[var(--muted)] tabular-nums">{m[1]}.</span>
                  {line.slice(m[0].length)}
                </>
              ) : (
                line
              )}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function refToQuery(r: Ref): string {
  const b = BOOKS[r.book];
  if (r.verseStart === 0) return `${b.name} ${r.chapter}`;
  return `${b.name} ${r.chapter}:${r.verseStart}${r.verseEnd > r.verseStart ? `-${r.verseEnd}` : ""}`;
}


function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

/** The fields the desk reads from a passage or chapter; anything short of them is a broken reply. */
function isPassage(data: unknown): data is Passage {
  return isRecord(data) && typeof data.reference === "string" && typeof data.translationCode === "string" && Array.isArray(data.verses);
}

function isRef(data: unknown): data is Ref {
  return isRecord(data) && [data.book, data.chapter, data.verseStart, data.verseEnd].every((n) => typeof n === "number");
}

function isCandidate(data: unknown): data is Candidate {
  return isRecord(data) && typeof data.label === "string" && typeof data.why === "string" && isRef(data.ref);
}

function isPassageResult(data: unknown): data is PassageResult {
  return (
    isRecord(data) &&
    isPassage(data.passage) &&
    typeof data.text === "string" &&
    Array.isArray(data.chunks) &&
    data.chunks.length > 0 &&
    data.chunks.every((c) => typeof c === "string") &&
    isRef(data.ref)
  );
}

/** A 200 whose body could not be read, such as a wifi login page answering in the server's place. */
const UNREADABLE: Failure = describeFailure(500);

const TOO_LONG: Failure = { kind: "refused", message: "That's too long to look up — shorten it and try again" };

/** The glossary's one line for a refused clipboard. */
const COPY_FAILED = "Couldn't copy — try again";

/** How many suggestions came back, and how to pick one on this device. Only keys that exist are named. */
function candidatesToast(count: number, keyboard: boolean): string {
  const what = `${count} possible ${count === 1 ? "verse" : "verses"}`;
  if (!keyboard) return `${what} — choose ${count === 1 ? "it" : "one"} to copy`;
  const keys = Array.from({ length: count }, (_, i) => String(i + 1));
  const said = keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(", ")} or ${keys.at(-1)}`;
  return `${what} — press ${said}`;
}

export default function Desk() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("verses");
  const [input, setInput] = useState("");
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [sourceChoice, setSourceChoice] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  // Deferred so instant lookups never flash it — see BUSY_DELAY_MS.
  const [showBusy, setShowBusy] = useState(false);
  const [result, setResult] = useState<PassageResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const { toast, showToast } = useToast();
  // The last thing the desk copied, from any tab, for the Last copied chip and panel.
  const [lastCopy, setLastCopy] = useState<LastCopy | null>(null);
  /** The same text again, from the Last copied chip. Like Copy again on a verse, it is not logged a second time. */
  const copyAgain = useCallback(
    async (last: LastCopy) => {
      const ok = await copyText(last.text);
      if (ok) setLastCopy({ ...last, at: Date.now() });
      showToast(ok ? `Copied ${last.label} again — paste in Mixlr` : COPY_FAILED, ok ? "ok" : "err");
    },
    [showToast],
  );
  const copyTracked = useCallback(async (text: string, label?: string) => {
    const ok = await copyText(text);
    if (ok) setLastCopy({ text, label: label ?? text.split("\n").find((l) => l.trim()) ?? text, at: Date.now() });
    return ok;
  }, []);
  // Opens itself on a device that has not seen this version of the panel, and
  // stays one press away in the header for the next person on the rota.
  const [howOpen, toggleHow] = useFirstRun("ld_howitworks_seen", "how-it-works-1");
  const [copiedChunk, setCopiedChunk] = useState(0);
  // Whether the part on screen reached the clipboard, and a counter that
  // replays the card's "copied" flash each time it does.
  const [copiedOk, setCopiedOk] = useState(false);
  const [copyPulse, setCopyPulse] = useState(0);
  const [chapter, setChapter] = useState<Passage | null>(null);
  const [recent, setRecent] = useState<RecentVerse[]>([]);
  // Set when a request is refused by the PIN gate (the PIN changed, or the
  // cookie is gone); cleared by the next request that gets through.
  const [locked, setLocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  // The tab just reached with an arrow key, for the frames in which its panel may still grab focus.
  const arrowedTo = useRef<Tab | null>(null);
  // `busy` is state, so two presses in the same frame both read it as idle.
  // This is what actually stops a second lookup racing the first.
  const inFlight = useRef(false);

  // Wake the database as soon as the desk opens. On Turso an idle database
  // suspends, and this is used twice a week — without this the first lookup of
  // the morning pays the cold start, with someone waiting on it.
  useEffect(() => {
    fetch("/api/warm").catch(() => {});
  }, []);

  // Remember the dropdown choice on this laptop (read after hydration to avoid a mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ld_translation");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && TRANSLATIONS.some((t) => t.code === saved)) setTranslation(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ld_translation", translation);
    } catch {}
  }, [translation]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ld_source");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && SOURCE_OPTIONS.some((o) => o.value === saved)) setSourceChoice(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ld_source", sourceChoice);
    } catch {}
  }, [sourceChoice]);

  // Today's verses from the log, once. Quiet on failure: the list is a
  // shortcut, and a locked device already says so in its own banner.
  useEffect(() => {
    let live = true;
    const { from, to } = dayBounds(toISODate(new Date()));
    fetch(`/api/log?kind=verse&from=${from}&to=${to}&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (live && isRecord(d) && Array.isArray(d.rows)) setRecent(recentVerses(d.rows.filter((row): row is { kind: string; label: string; createdAt: string } => isRecord(row) && typeof row.kind === "string" && typeof row.label === "string" && typeof row.createdAt === "string")));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setShowBusy(true), BUSY_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setShowBusy(false);
    };
  }, [busy]);


  /** Tells the operator what went wrong, and remembers a lock for the banner (a toast can't hold a link). */
  const fail = useCallback(
    (f: Failure) => {
      if (f.kind === "locked") setLocked(true);
      showToast(f.message, "err");
    },
    [showToast],
  );

  /** A request that got through proves the device is unlocked again. */
  const noteResponse = useCallback((res: Response) => {
    if (res.ok) setLocked(false);
    else if (describeFailure(res.status).kind === "locked") setLocked(true);
  }, []);

  const logSend = useCallback(
    (kind: string, label: string, body: string, meta?: unknown) => {
      fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label, body, meta }) })
        .then(noteResponse)
        .catch(() => {});
    },
    [noteResponse],
  );

  // Owned here rather than in a tab: both tabs show the same setlist, and the
  // palette copies messages from any tab.
  const setlistApi = useSetlist();
  const { reload: reloadSetlist } = setlistApi;
  // Someone else can prepare the setlist — reorder it, "Edit for this
  // service" — while this desk sits open elsewhere; refetch it on every visit
  // to a tab that shows it, rather than only once when the desk first opened.
  useEffect(() => {
    if (tab === "songs" || tab === "messages") void reloadSetlist();
  }, [tab, reloadSetlist]);
  const { library, failed: libraryFailed, reload: reloadLibrary } = useMessages();
  const branchTokens = useMemo(() => library?.branch.tokens ?? {}, [library]);
  const { copied, copyPart } = useMessageCopy({ copyText: copyTracked, showToast, logSend, tokens: branchTokens });
  const [pendingSong, setPendingSong] = useState<SongRow | null>(null);
  const [pendingMessage, setPendingMessage] = useState<OpenMessage | null>(null);
  const clearPendingSong = useCallback(() => setPendingSong(null), []);
  const clearPendingMessage = useCallback(() => setPendingMessage(null), []);

  /** One part copies where the operator is; several need the Messages tab to send in turn. */
  const sendMessage = useCallback(
    (m: OpenMessage) => {
      if (m.parts.length === 1) return void copyPart(m, 0);
      setPendingMessage(m);
      setTab("messages");
    },
    [copyPart],
  );

  const onMessageRow = useCallback(
    (row: MessageRow) => {
      const m = openMessageFromRow(row, messagesById(library));
      if (m) sendMessage(m);
    },
    [library, sendMessage],
  );

  /** Opens a message from "Next in the service order", even a one-part one: next means go to it, not copy it unseen. */
  const openMessageRow = useCallback(
    (row: MessageRow) => {
      const m = openMessageFromRow(row, messagesById(library));
      if (!m) return;
      setPendingMessage(m);
      setTab("messages");
    },
    [library],
  );

  const songProgress = useSongProgress();
  // A setlist row is ticked once anything in it was copied: a message part, or
  // any section of a song. Both tabs show the same setlist, so they share this.
  const { progress } = songProgress;
  const setlistCopied = useMemo(() => {
    const all = new Set(copied);
    for (const [key, sections] of progress) if (sections.size > 0) all.add(key);
    return all;
  }, [copied, progress]);

  const onPaletteMessage = useCallback((entry: LibraryEntry) => sendMessage(openMessageFor(entry)), [sendMessage]);

  // Puts the cursor back for the next reference. Skipped on a touchscreen, where
  // it would answer every send by covering the verse with the on-screen keyboard.
  const refocus = useCallback(() => {
    if (!hasFinePointer()) return;
    // The box is disabled while a request runs, and focus() on a disabled
    // field does nothing. When the render that re-enables it has not landed by
    // the next frame, which happens after a quick request, wait a few more.
    const attempt = (framesLeft: number) =>
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el?.disabled && framesLeft > 0) attempt(framesLeft - 1);
        else el?.focus();
      });
    attempt(10);
  }, []);

  const tabsId = useId();
  const tabId = (t: Tab) => `${tabsId}-tab-${t}`;
  const panelId = (t: Tab) => `${tabsId}-panel-${t}`;

  // Arrows move along the tab bar and switch tabs as they go. Focus stays on
  // the tab, unlike a click, which puts the cursor in that tab's search or
  // reference box: otherwise passing through a tab on the way to the next one
  // would drop the cursor into its box and the next arrow would move nowhere.
  function onTabKey(e: React.KeyboardEvent<HTMLButtonElement>, current: number) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // The rail stacks the tabs on a wide screen, so Up and Down move along it too.
    const key = e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key;
    const next = tabIndexForKey(key, current, TABS.length);
    if (next === null) return;
    e.preventDefault();
    // Keeps these keys from the tabs' own document shortcuts.
    e.stopPropagation();
    const t = TABS[next].id;
    setTab(t);
    tabRefs.current[t]?.focus();
    // Songs and Messages focus their search box a frame after they mount.
    // Hand focus straight back while that can still happen (see onPanelFocus):
    // taking it back a frame later leaves a gap where a quick second arrow
    // lands in the box and is lost.
    arrowedTo.current = t;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (arrowedTo.current === t) arrowedTo.current = null;
      }),
    );
  }

  function onPanelFocus(t: Tab) {
    if (arrowedTo.current === t) tabRefs.current[t]?.focus();
  }

  // Same reason this isn't the `autoFocus` attribute: on a phone that opens the
  // keyboard over the desk before the operator has looked at it.
  useEffect(() => {
    refocus();
  }, [refocus]);

  /** Fetch a reference, copy chunk 0, show it. */
  const lookup = useCallback(
    async (q: string, opts?: { silent?: boolean; select?: boolean; translation?: string }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const useTranslation = opts?.translation ?? translation;
      setBusy(q);
      setCandidates(null);
      try {
        let res: Response;
        try {
          res = await fetch(`/api/passage?q=${encodeURIComponent(q)}&t=${encodeURIComponent(useTranslation)}&src=${sourceChoice}`);
        } catch {
          return fail(OFFLINE);
        }
        if (res.status === 400) {
          // Not a reference: the route says so in the body, and the body can
          // only be read once, so this one status is read here rather than
          // handed to failureFrom.
          const body: unknown = await res.json().catch(() => null);
          if (isRecord(body) && body.kind === "description") return await describe(q);
          return fail(describeFailure(400, isRecord(body) && typeof body.error === "string" ? body.error : null, "Couldn't look that up — try again"));
        }
        // The reference travels in the URL, and the web server refuses a URL
        // past its size limit before the route sees it; trying again won't help.
        if (res.status === 414 || res.status === 431) return fail(TOO_LONG);
        if (!res.ok) return fail(await failureFrom(res, "Couldn't look that up — try again"));
        const r: unknown = await res.json().catch(() => null);
        if (!isPassageResult(r)) return fail(UNREADABLE);
        setLocked(false);
        setResult(r);
        setCopiedChunk(0);
        const tag = `${r.passage.reference} (${r.passage.translationCode})`;
        setRecent((list) => withRecent(list, { reference: r.passage.reference, translation: r.passage.translationCode, at: new Date().toISOString() }));
        if (r.passage.source === "llm") {
          // Every real source failed; this text came from the AI's memory.
          // Show it, but make a human read it and press Copy deliberately.
          showToast("AI-quoted, may be wrong — read it, then choose Copy", "err");
          setCopiedOk(false);
          logSend("verse", tag, r.chunks[0], { source: "llm", ms: r.ms, copied: "manual" });
          if (opts?.select !== false) setInput("");
          return;
        }
        const ok = await copyTracked(r.chunks[0], r.chunks.length > 1 ? `${tag} · part 1 of ${r.chunks.length}` : tag);
        setCopiedOk(ok);
        if (ok) {
          showToast(
            r.chunks.length > 1 ? `Copied ${tag} part 1 of ${r.chunks.length} — paste in Mixlr, then copy part 2` : `Copied ${tag} — paste in Mixlr`,
            r.passage.source === "gateway" ? "warn" : "ok",
          );
          logSend("verse", tag, r.chunks[0], { source: r.passage.source, ms: r.ms });
        } else {
          showToast(COPY_FAILED, "err");
        }
        if (opts?.select !== false) setInput("");
      } finally {
        inFlight.current = false;
        setBusy(null);
        refocus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translation, sourceChoice, showToast, fail, logSend, refocus, copyTracked],
  );

  const describe = useCallback(
    async (phrase: string) => {
      setBusy(phrase);
      setResult(null);
      try {
        let res: Response;
        try {
          res = await fetch("/api/find-verse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: phrase }) });
        } catch {
          return fail(OFFLINE);
        }
        if (!res.ok) return fail(await failureFrom(res, "Couldn't search for that — try again"));
        const data: unknown = await res.json().catch(() => null);
        if (!isRecord(data) || !Array.isArray(data.candidates)) return fail(UNREADABLE);
        setLocked(false);
        const list = data.candidates.filter(isCandidate);
        if (!list.length) {
          showToast("No verse matched that — try other words", "warn");
          return;
        }
        setCandidates(list);
        // The number keys pick a candidate only from an empty box, so the phrase
        // has to go or "press 1" types a 1. The log keeps what was searched.
        setInput("");
        logSend("search", phrase, "", { candidates: list.map((c) => c.label), ms: data.ms });
        showToast(candidatesToast(list.length, hasFinePointer()), "ok");
      } finally {
        setBusy(null);
        refocus();
      }
    },
    [showToast, fail, logSend, refocus],
  );

  /** Set the translation, and copy whatever verse is already on screen again in it. */
  const switchTranslation = useCallback(
    (code: string) => {
      setTranslation(code);
      if (result) lookup(refToQuery(result.ref), { translation: code });
      else refocus();
    },
    [result, lookup, refocus],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    // A box holding only "tpt" means the verse on screen, in that translation —
    // checked before the reference parser, which would send it to the AI search.
    const code = translationFromInput(q);
    if (code && result) {
      setInput("");
      return switchTranslation(code);
    }
    lookup(q);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (candidates && ["1", "2", "3"].includes(e.key) && input === "") {
      const c = candidates[Number(e.key) - 1];
      if (c) {
        e.preventDefault();
        lookup(refToQuery(c.ref));
      }
    }
    if (e.key === "Escape") {
      setCandidates(null);
      setChapter(null);
      setInput("");
    }
    if (e.key === "+" && result && input === "") {
      e.preventDefault();
      nextVerse();
    }
  }

  // The verse keys used to live on the input's onKeyDown, so they died as soon as
  // focus moved to a button. Bound to the document instead, skipping any text
  // field, so the input handler above still owns them while you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Songs has its own section keys; without this, "+" and 1-3 would fire the
      // verse actions underneath whenever a verse happened to be loaded.
      if (tab !== "verses") return;
      if (isTypingTarget(e.target as HTMLElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setCandidates(null);
        setChapter(null);
        return;
      }
      if (e.key === "+" && result) {
        e.preventDefault();
        nextVerse();
      }
      if (candidates && ["1", "2", "3"].includes(e.key)) {
        const c = candidates[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          lookup(refToQuery(c.ref));
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function nextVerse() {
    if (!result) return;
    const r = result.ref;
    const last = r.verseStart === 0 ? result.passage.verses.at(-1)?.verse ?? 0 : r.verseEnd;
    lookup(refToQuery({ ...r, verseStart: last + 1, verseEnd: last + 1 }));
  }

  async function copyChunk(i: number) {
    if (!result) return;
    const n = result.chunks.length;
    const tag = `${result.passage.reference} (${result.passage.translationCode})`;
    const ok = await copyTracked(result.chunks[i], n > 1 ? `${tag} · part ${i + 1} of ${n}` : tag);
    setCopiedChunk(i);
    setCopiedOk(ok);
    if (ok) setCopyPulse((n) => n + 1);
    const copied = n === 1 ? `Copied ${tag} — paste in Mixlr` : `Copied ${tag} part ${i + 1} of ${n}${i + 1 < n ? ` — paste in Mixlr, then copy part ${i + 2}` : " — paste in Mixlr"}`;
    showToast(ok ? copied : COPY_FAILED, ok ? "ok" : "err");
    refocus();
  }

  async function copyWhole() {
    if (!result) return;
    const ok = await copyTracked(result.text, `${result.passage.reference} (${result.passage.translationCode}) · whole passage`);
    if (ok) setCopyPulse((n) => n + 1);
    const chars = result.text.length;
    showToast(ok ? `Copied the whole passage (${chars.toLocaleString("en")} ${chars === 1 ? "character" : "characters"})` : COPY_FAILED, ok ? "ok" : "err");
    logSend("verse", `${result.passage.reference} (${result.passage.translationCode}) whole`, result.text);
    refocus();
  }

  async function openChapter() {
    if (!result || inFlight.current) return;
    inFlight.current = true;
    setBusy("chapter");
    try {
      let res: Response;
      try {
        res = await fetch(`/api/chapter?book=${result.ref.book}&chapter=${result.ref.chapter}&t=${encodeURIComponent(result.passage.translationCode)}&src=${sourceChoice}`);
      } catch {
        return fail(OFFLINE);
      }
      if (!res.ok) return fail(await failureFrom(res, "Couldn't load the chapter — try again"));
      const data: unknown = await res.json().catch(() => null);
      if (!isRecord(data) || !isPassage(data.passage)) return fail(UNREADABLE);
      setLocked(false);
      setChapter(data.passage);
    } finally {
      inFlight.current = false;
      setBusy(null);
      refocus();
    }
  }

  const actions: Action[] = (() => {
    const list: Action[] = [];
    if (result) {
      // Grouped under the reference, so each title reads once after it and still stands alone in the guide.
      const ref = result.passage.reference;
      list.push({ id: "next-verse", title: "Copy the next verse", group: ref, keywords: ["next verse", "following"], chord: { key: "+" }, run: nextVerse });
      list.push({ id: "copy-again", title: "Copy again", group: ref, keywords: [`copy ${ref} again`, "clipboard"], run: () => copyChunk(copiedChunk) });
      list.push({ id: "copy-whole", title: "Copy the whole passage", group: ref, keywords: ["clipboard", "all"], run: copyWhole });
      list.push({ id: "chapter", title: "Open the chapter", group: ref, keywords: ["open the whole chapter", "context"], run: openChapter });
    }
    // The palette prints the group before the title, so "Go to" is said once, there.
    list.push({ id: "tab-verses", title: "Verses", group: "Go to", keywords: ["go to verses", "bible", "scripture"], run: () => { setTab("verses"); refocus(); } });
    list.push({ id: "tab-songs", title: "Songs", group: "Go to", keywords: ["go to songs", "lyrics", "songbook", "worship"], run: () => setTab("songs") });
    list.push({ id: "tab-messages", title: "Engagement", group: "Go to", keywords: ["go to messages", "apology", "greeting", "prayer", "announcement"], run: () => setTab("messages") });
    list.push({ id: "messages-edit", title: "Engagement library", group: "Go to", keywords: ["edit message library", "messages", "engagement", "document"], run: () => router.push("/messages") });
    // The palette had no way to reach them at all; "setlist" stays a keyword so the old word still finds them.
    list.push({ id: "setlists", title: "Service orders", group: "Go to", keywords: ["setlist", "service order", "order of service", "prepare", "plan"], run: () => router.push("/setlists") });
    // Searchable in the words someone reaches for when they are lost, not just
    // the title. Opens the panel; never closes it, so running this twice does
    // not put it away in front of the person who just asked for it.
    list.push({
      id: "how",
      title: "How the desk works",
      group: "Help",
      keywords: ["help", "new", "start", "getting started", "guide", "what do i do", "mixlr", "paste"],
      run: () => {
        if (!howOpen) toggleHow();
      },
    });
    list.push({ id: "log", title: "Log", group: "Go to", keywords: ["open the log", "history", "sunday", "sent", "copied"], run: () => router.push("/log") });
    list.push({ id: "sources", title: "Verse sources", group: "Go to", keywords: ["check verse sources", "diagnostics", "health"], run: () => router.push("/diag") });
    list.push({ id: "import", title: "Import a songbook", group: "Go to", keywords: ["videopsalm", "upload"], run: () => router.push("/songs/import") });
    for (const t of TRANSLATIONS) {
      list.push({ id: `t-${t.code}`, title: t.code, group: "Translation", keywords: [`translation: ${t.code}`, t.name, "switch", "version"], run: () => switchTranslation(t.code) });
    }
    for (const o of SOURCE_OPTIONS) {
      list.push({ id: `s-${o.value}`, title: o.label, group: "Source", keywords: [`source: ${o.label}`, "switch", "provider", "fetch"], run: () => { setSourceChoice(o.value); refocus(); } });
    }
    list.push(...messageActions(library, onPaletteMessage));
    return list;
  })();

  const guide: ShortcutGuide[] = [
    {
      group: "Looking up a verse",
      items: [
        { keys: "↵", label: "Copy the verse" },
        { keys: "+", label: "Copy the next verse" },
        { keys: "1 2 3", label: "Copy a possible verse" },
        { keys: "Esc", label: "Clear the box and close the lists" },
      ],
    },
    {
      group: "Copying a song",
      items: [
        { keys: "↑ ↓", label: "Pick a song in the results" },
        { keys: "↵", label: "Open the song, then copy each section in turn" },
        { keys: "1–9", label: "Copy that section" },
        { keys: "P", label: "Pin the section you're on (the chorus)" },
        { keys: "C", label: "Copy the pinned section again" },
        { keys: "T", label: "Copy the song's title" },
        { keys: "N", label: "Open the next item in the service order" },
        { keys: "Esc", label: "Back to the song list" },
      ],
    },
    {
      group: "Copying a message",
      items: [
        { keys: "⌘K", label: "Find a message from any tab" },
        { keys: "↑ ↓", label: "Pick a message in the results" },
        { keys: "↵", label: "Copy it, or open a long one to copy part by part" },
        { keys: "1–9", label: "Copy that part" },
        { keys: "N", label: "Open the next item in the service order" },
        { keys: "Esc", label: "Back to the library" },
      ],
    },
  ];


  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const idle = !result && !candidates && !chapter;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <CommandPalette actions={actions} guide={guide} />

      {/* The console. On a wide screen it is a rail down the left: the clock,
          the three drawers, what's on the clipboard, the way to everything
          else. Beside Mixlr in a narrower window it folds into a bar along the
          top, and on a phone the drawers move to a dock under the thumb. */}
      <aside className="relative z-20 mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6 lg:sticky lg:mx-0 lg:max-w-none lg:top-0 lg:h-dvh lg:gap-5 lg:overflow-y-auto lg:border-r lg:border-ink-700 lg:bg-ink-950/70 lg:px-5 lg:pt-6 lg:pb-5 lg:backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="group flex min-w-0 items-center gap-3 rounded-xl sm:shrink-0">
            {/* The mark from the church website until CLC's own file arrives. */}
            <span className="relative shrink-0">
              <Image src="/brand/clc-logo.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-full shadow-[0_0_24px_-4px_var(--accent-glow)]" />
            </span>
            <span className="min-w-0">
              <span className="display block text-[26px] leading-none">Lightdesk</span>
              <span className="mt-1 block truncate font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">{library ? library.branch.name : "CLC"} · Mixlr chat desk</span>
            </span>
          </Link>
          {/* Below the rail's width the tools live here, in the bar. */}
          <nav aria-label="Desk tools" className="flex min-w-0 items-center justify-end gap-1 lg:hidden">
            <span className="mr-1 hidden min-w-0 sm:flex sm:max-w-[15rem]">
              <LastCopied last={lastCopy} onCopyAgain={(l) => void copyAgain(l)} />
            </span>
            {/* The rail has the full clock; beside Mixlr the bar only has room for it once the chip is placed. */}
            <span className="mx-2 hidden shrink-0 xl:inline-flex">
              <LiveClock compact />
            </span>
            <button type="button" onClick={openPalette} className="btn btn-quiet gap-2 sm:border-ink-700 sm:bg-ink-900 sm:pr-1.5 sm:pl-3" aria-label="Search everything">
              <Icon name="search" className="h-4 w-4" />
              <span className="hidden text-ink-400 sm:inline">Search</span>
              <PaletteKey className="kbd ml-3 hidden pointer-fine:sm:inline-flex" />
            </button>
            {/* The way in for whoever is at the laptop this week: the panel closes
                per device, so on a laptop shared down a rota this button is what a
                new volunteer has to be able to find. aria-controls only while the
                panel exists, or a screen reader is sent to a target that is not there. */}
            <button type="button" onClick={toggleHow} aria-expanded={howOpen} aria-controls={howOpen ? HOW_IT_WORKS_ID : undefined} aria-label="How the desk works" title="How the desk works" className={`btn btn-icon ${howOpen ? "btn-on" : "btn-quiet"}`}>
              <Icon name="help" className="h-[18px] w-[18px]" />
            </button>
            <Link href="/log" className="btn btn-quiet btn-icon" aria-label="Log" title="Log — everything copied, by day">
              <Icon name="clock" className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/diag" className="btn btn-quiet btn-icon hidden min-[400px]:inline-flex" aria-label="Verse sources" title="Verse sources — which are working">
              <Icon name="pulse" className="h-[18px] w-[18px]" />
            </Link>
            <ThemeToggle />
          </nav>
        </div>

        {/* On a phone the chip gets a row of its own, and only once there is something to copy again. */}
        {lastCopy && (
          <div className="flex sm:hidden">
            <LastCopied last={lastCopy} onCopyAgain={(l) => void copyAgain(l)} />
          </div>
        )}

        <div className="hidden rounded-2xl border border-ink-700 bg-ink-900 px-4 pt-3.5 pb-3 shadow-[var(--bevel)] lg:block">
          <LiveClock />
        </div>

        <div className="hidden lg:block">
          <button type="button" onClick={openPalette} className="btn w-full justify-start gap-2.5 py-2 pr-1.5 text-ink-400" aria-label="Search everything">
            <Icon name="search" className="h-4 w-4" />
            <span className="flex-1 text-left">Search everything</span>
            <PaletteKey className="kbd hidden pointer-fine:inline-flex" />
          </button>
        </div>

        {/* One tab list in three shapes: a dock along the bottom of a phone, a
            segmented bar beside Mixlr, a stack of channels in the rail. Its
            highlight slides between them, so a switch reads as "same desk,
            other drawer". */}
        <div
          role="tablist"
          aria-label="Desk"
          data-dock
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-ink-700 bg-ink-950/90 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:relative sm:inset-auto sm:z-auto sm:rounded-2xl sm:border sm:bg-ink-900 sm:p-1 sm:shadow-[var(--bevel)] sm:backdrop-blur-none lg:grid-cols-1 lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        >
          <span aria-hidden="true" className="eyebrow mb-1 hidden px-1 lg:block">
            Drawers
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 hidden w-[calc((100%-0.5rem)/3)] rounded-xl bg-ink-800 shadow-[inset_0_0_0_1px_var(--ink-700),var(--bevel)] transition-transform duration-500 ease-out-soft sm:block lg:hidden"
            style={{ transform: `translateX(${tabIndex * 100}%)` }}
          />
          {TABS.map((t, i) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={tabId(t.id)}
                aria-selected={selected}
                aria-controls={panelId(t.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === "verses") refocus();
                }}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`group relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11.5px] font-medium transition-colors duration-200 sm:min-h-0 sm:flex-row sm:gap-2 sm:py-2.5 sm:text-[15px] lg:justify-start lg:gap-3 lg:border lg:px-3 lg:py-2.5 lg:text-[15px] ${
                  selected ? "text-ink-50 lg:border-ink-700 lg:bg-ink-900 lg:shadow-[var(--bevel)]" : "text-ink-400 hover:text-ink-100 lg:border-transparent lg:hover:bg-ink-900/60"
                }`}
              >
                {/* The tally: lit on the open drawer. A bar on the dock, a lamp in the rail. */}
                <span aria-hidden="true" className={`absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-accent shadow-[0_0_12px_var(--accent-glow)] transition-opacity duration-300 sm:hidden ${selected ? "opacity-100" : "opacity-0"}`} />
                <Icon name={t.icon} className={`h-[22px] w-[22px] transition-colors sm:h-[18px] sm:w-[18px] ${selected ? "text-accent-ink" : ""}`} />
                <span>{t.label}</span>
                <span aria-hidden="true" className={`ml-auto hidden lg:inline-block ${selected ? "tally" : "tally tally-off opacity-0 group-hover:opacity-100"}`} />
              </button>
            );
          })}
        </div>

        <div className="hidden lg:block">
          <LastCopied variant="panel" last={lastCopy} onCopyAgain={(l) => void copyAgain(l)} />
        </div>

        <nav aria-label="Elsewhere" className="hidden lg:block">
          <span aria-hidden="true" className="eyebrow mb-1.5 block px-1">
            Prepare &amp; check
          </span>
          <ul className="space-y-0.5">
            {(
              [
                { href: "/setlists", icon: "list", label: "Service orders" },
                { href: "/messages", icon: "message", label: "Engagement library" },
                { href: "/log", icon: "clock", label: "Log" },
                { href: "/diag", icon: "pulse", label: "Verse sources" },
              ] as const
            ).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group flex items-center gap-3 rounded-lg px-3 py-2 font-ui text-[14px] text-ink-300 transition-colors hover:bg-ink-900 hover:text-ink-50">
                  <Icon name={l.icon} className="h-4 w-4 text-[var(--muted)] transition-colors group-hover:text-accent-ink" />
                  {l.label}
                  <Icon name="forward" className="ml-auto h-3.5 w-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto hidden items-center justify-between gap-2 border-t border-ink-700 pt-4 lg:flex">
          <button type="button" onClick={toggleHow} aria-expanded={howOpen} aria-controls={howOpen ? HOW_IT_WORKS_ID : undefined} className={`btn btn-sm ${howOpen ? "btn-on" : "btn-quiet"} -ml-1`}>
            <Icon name="help" className="h-4 w-4" />
            How it works
          </button>
          <ThemeToggle />
        </div>
      </aside>

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-5 pb-[calc(var(--dock)+max(1.25rem,env(safe-area-inset-bottom)))] sm:px-6 sm:pt-6 lg:max-w-[52rem] lg:px-10 lg:pt-8">
        {/* Where the desk is, said once, quietly: the drawer and what it holds. */}
        <p aria-hidden="true" className="-mb-2 hidden items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] text-[var(--muted)] uppercase lg:flex">
          <span>Desk</span>
          <span className="text-ink-600">/</span>
          <span className="text-ink-200">{TABS[tabIndex].label}</span>
        </p>

        {locked && (
          <p className="flex items-center gap-2 rounded-xl border border-warn-line bg-warn-bg px-4 py-2.5 text-sm text-warn-fg">
            <Icon name="lock" className="h-4 w-4" />
            <span>
              This device is locked, so nothing can be looked up or logged.{" "}
              <Link href={unlockHref("/")} className="font-semibold underline underline-offset-2">
                Enter the PIN
              </Link>
            </span>
          </p>
        )}

        {/* Directly above the drawers, so the legend names the tabs. WhatsNew
            stands down while it is open: "New:" means nothing to someone
            seeing the desk for the first time. */}
        <HowItWorks open={howOpen} tabs={TABS} onClose={toggleHow} />
        {!howOpen && <WhatsNew />}

        <Toast toast={toast} />

        {/* All three panels stay in the DOM so each tab's aria-controls always
            points at something; Songs and Messages still mount only while shown. */}
        <div role="tabpanel" id={panelId("songs")} aria-labelledby={tabId("songs")} hidden={tab !== "songs"} onFocus={() => onPanelFocus("songs")} className="fade-in">
          {tab === "songs" && (
            <SongsTab
              copyText={copyTracked}
              showToast={showToast}
              logSend={logSend}
              setlistApi={setlistApi}
              library={library}
              copied={setlistCopied}
              onMessageRow={onMessageRow}
              onOpenMessageRow={openMessageRow}
              songProgress={songProgress}
              pendingSong={pendingSong}
              onPendingSongDone={clearPendingSong}
            />
          )}
        </div>
        <div role="tabpanel" id={panelId("messages")} aria-labelledby={tabId("messages")} hidden={tab !== "messages"} onFocus={() => onPanelFocus("messages")} className="fade-in">
          {tab === "messages" && (
            <MessagesTab
              library={library}
              failed={libraryFailed}
              onRetry={reloadLibrary}
              setlistApi={setlistApi}
              copied={setlistCopied}
              copyPart={copyPart}
              tokens={branchTokens}
              showToast={showToast}
              pending={pendingMessage}
              onPendingDone={clearPendingMessage}
              onOpenSong={(row) => {
                setPendingSong(row);
                setTab("songs");
              }}
            />
          )}
        </div>

        <div role="tabpanel" id={panelId("verses")} aria-labelledby={tabId("verses")} className={tab === "verses" ? "contents" : "hidden"}>
          <form onSubmit={onSubmit} className="card group/form relative overflow-hidden rounded-[1.25rem] transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft),0_18px_48px_-20px_var(--accent-glow)]">
            <div className="flex items-center gap-2 pr-3">
              <div className="relative min-w-0 flex-1">
                {/* The prompt: an orange chevron, like a console waiting for a line. */}
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 hidden h-8 w-8 -translate-y-1/2 place-items-center sm:grid rounded-lg border border-ink-700 bg-ink-800 text-[var(--muted)] transition-colors group-focus-within/form:border-accent/50 group-focus-within/form:bg-accent-soft group-focus-within/form:text-accent-ink sm:h-9 sm:w-9">
                  <Icon name="book" className="h-[18px] w-[18px]" />
                </span>
                {/* The three input attributes stop a phone keyboard from "helpfully"
                    capitalising and autocorrecting terse references like "rom 8 28". */}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={!!busy}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-label="Bible reference or description"
                  placeholder="rom 8 28  ·  or describe it"
                  className={`w-full min-w-0 bg-transparent py-5 pr-3 pl-5 font-text text-[17px] text-ink-50 outline-none placeholder:text-[var(--muted)] disabled:opacity-60 min-[400px]:text-[19px] sm:py-6 sm:pl-[4.25rem] sm:text-[24px] ${showBusy && busy ? "pr-12 sm:pr-44" : ""}`}
                />
                {/* Busy shows inside the box, never as a line above it that would
                    shove the box down while the operator is looking at it. The live
                    region stays mounted so the announcement is heard. */}
                <p role="status" aria-live="polite" className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2 font-mono text-[12px] tracking-wide text-ink-300 uppercase">
                  {showBusy && busy && (
                    <>
                      <span aria-hidden="true" className="tally tally-live" />
                      <span className="sr-only sm:not-sr-only">{busy === "chapter" ? "Loading the chapter…" : "Looking it up…"}</span>
                    </>
                  )}
                </p>
              </div>
              {input.trim() && !busy && (
                <span aria-hidden="true" className="kbd pop hidden h-7 shrink-0 px-2 text-[12px] pointer-fine:inline-flex">
                  Enter ↵
                </span>
              )}
              {/* The translation lives in the box it changes: the one setting
                  touched mid-service, a glance from the reference being typed.
                  A label in the page's own type with the native select laid
                  invisibly over it: the select keeps the keyboard, the phone
                  picker and the screen-reader name. */}
              <label className="relative flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 font-mono text-[13px] font-semibold text-ink-50 shadow-[var(--bevel)] transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent hover:border-ink-600 pointer-coarse:min-h-11">
                {translation}
                <Icon name="down" className="h-3.5 w-3.5 text-[var(--muted)]" />
                <select
                  aria-label="Translation"
                  value={translation}
                  onChange={(e) => switchTranslation(e.target.value)}
                  // A switch mid-lookup would be dropped by the in-flight guard,
                  // leaving this saying one translation while the verse is in another.
                  disabled={!!busy}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
                >
                  {TRANSLATIONS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {/* On a laptop Enter has always done this. A touch device has no
                  visible way to submit at all, so it gets one. */}
              <button type="submit" disabled={!input.trim() || !!busy} className="btn btn-primary btn-lg shrink-0 rounded-xl pointer-fine:hidden">
                Go
              </button>
            </div>
            {showBusy && busy && <span aria-hidden="true" className="scanline" />}
            {/* The verse settings sit on the box they change, not in the page
                header where they read as settings for the whole desk. */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-ink-700 bg-ink-950/50 px-2 py-1.5">
              {/* A label drawn in the page's own type with the native select laid
                  invisibly over it: the select keeps the keyboard, the phone picker
                  and the screen-reader name, and the chip is only as wide as its word. */}
              <label
                title="Auto tries saved verses, YouVersion, API.Bible, BibleGateway, then AI-quoted text. Choose one to use only that source."
                className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1 font-ui text-[13px] has-focus-visible:outline-2 has-focus-visible:outline-accent pointer-coarse:min-h-11 ${sourceChoice === "auto" ? "text-ink-400 hover:bg-ink-800 hover:text-ink-200" : sourceChoice === "llm" ? "bg-bad-bg text-bad-fg" : "bg-warn-bg text-warn-fg"}`}
              >
                <span className={sourceChoice === "auto" ? "eyebrow" : "eyebrow text-current"}>Source</span>
                <span className={`font-mono text-[13px] font-semibold ${sourceChoice === "auto" ? "text-ink-50" : ""}`}>{SOURCE_OPTIONS.find((o) => o.value === sourceChoice)?.label}</span>
                <Icon name="down" className="h-3.5 w-3.5" />
                <select
                  aria-label="Source"
                  value={sourceChoice}
                  onChange={(e) => {
                    setSourceChoice(e.target.value);
                    refocus();
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {/* A phone has no Enter, Esc or "?" to press; describing and the
                  translation suffix are features, not shortcuts, so they stay. */}
              <p className="ml-auto hidden items-center gap-3 px-2 font-ui text-xs text-[var(--muted)] pointer-fine:flex">
                <span className="flex items-center gap-1.5"><span className="kbd">+</span> next verse</span>
                <span className="flex items-center gap-1.5"><span className="kbd">Esc</span> clear</span>
                <span className="flex items-center gap-1.5"><span className="kbd">?</span> every key</span>
              </p>
            </div>
          </form>

          {idle && <VerseWelcome recent={recent.length > 0} onTry={(q) => { setInput(q); refocus(); }} />}

          {candidates && (
            <section className="space-y-2.5">
              <h2 className="eyebrow flex items-center gap-2">
                <span className="tally" /> Possible verses
              </h2>
              {candidates.map((c, i) => (
                <button
                  // By position: the model can suggest the same label twice, and
                  // the list is replaced whole, never reordered.
                  key={i}
                  onClick={() => lookup(refToQuery(c.ref))}
                  style={{ "--i": i } as React.CSSProperties}
                  className="rise card card-hover group flex w-full items-center gap-4 px-4 py-4 text-left"
                >
                  <span className="kbd h-9 min-w-9 shrink-0 text-[15px] group-hover:border-accent group-hover:text-accent-ink">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="display block text-[26px]">{c.label}</span>
                    <span className="mt-1 block font-text text-sm text-ink-400">{c.why}</span>
                  </span>
                  <Icon name="forward" className="h-5 w-5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" />
                </button>
              ))}
            </section>
          )}

          {result && (
            <section
              key={`${result.passage.reference} ${result.passage.translationCode}`}
              aria-label={`${result.passage.reference} (${result.passage.translationCode})`}
              className="rise card overflow-hidden rounded-[1.25rem]"
            >
              {/* Loud only when the text itself might be wrong. The AI-quoted banner
                  names the Copy button, because nothing was copied for you. */}
              {result.passage.source === "llm" && (
                <p className="flex items-start gap-2.5 border-b border-bad-line bg-bad-bg px-5 py-3 text-sm font-semibold text-bad-fg">
                  <Icon name="warn" className="mt-0.5 h-4 w-4" />
                  <span>
                    {SOURCE_LABEL.llm}
                    {result.passage.attempts && result.passage.attempts.length > 0 && <span className="block text-xs font-normal opacity-90">Failed first: {result.passage.attempts.join(" · ")}</span>}
                  </span>
                </p>
              )}
              {result.passage.source === "gateway" && (
                <p className="border-b border-warn-line bg-warn-bg px-5 py-2.5 text-sm text-warn-fg">
                  From the {SOURCE_LABEL.gateway}
                  {result.passage.attempts && result.passage.attempts.length > 0 && <span className="opacity-80"> · failed first: {result.passage.attempts.join(" · ")}</span>}
                </p>
              )}

              <div key={copyPulse} className={copyPulse ? "copied-flash" : undefined}>
                {/* The monitor's status strip: the tally on the left, the meter
                    of parts and where the text came from on the right. */}
                <div className="flex items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3 sm:px-7">
                  {result.passage.source === "llm" && !copiedOk ? (
                    <span className="flex items-center gap-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-bad-fg uppercase">
                      <span className="tally tally-off" />
                      Not copied — read it first
                    </span>
                  ) : copiedOk ? (
                    <span className="flex items-center gap-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-ok-fg uppercase">
                      <span className="tally tally-ok pop" />
                      Copied{result.chunks.length > 1 ? ` · part ${copiedChunk + 1} of ${result.chunks.length}` : ""}
                      <span className="hidden text-[var(--muted)] sm:inline">· paste in Mixlr</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2.5 font-mono text-[11px] font-medium tracking-[0.14em] text-warn-fg uppercase">
                      <span className="tally tally-off" />
                      Not copied — choose Copy again
                    </span>
                  )}
                  {result.passage.source !== "llm" && result.passage.source !== "gateway" && (
                    <span className="font-mono text-[10.5px] tracking-wide text-[var(--muted)]">
                      {SOURCE_LABEL[result.passage.source]} · {result.ms} ms
                    </span>
                  )}
                </div>

                <PostPreview text={result.chunks[copiedChunk]} header={`${result.passage.reference}\n${result.passage.translationName}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Copies the part on screen, the same one "Copy again" in ⌘K copies. */}
                    <button onClick={() => copyChunk(copiedChunk)} className="btn btn-primary">
                      <Icon name="copy" className="h-4 w-4" />
                      {/* An AI-quoted verse was never copied, so there is nothing to copy "again". */}
                      {result.passage.source === "llm" ? "Copy" : "Copy again"}
                    </button>
                    <button onClick={nextVerse} className="btn">
                      Next verse <span className="kbd ml-0.5 hidden pointer-fine:inline-flex">+</span>
                    </button>
                    <button onClick={copyWhole} className="btn">
                      Copy whole passage
                    </button>
                    <button onClick={openChapter} className="btn btn-quiet">
                      Open chapter
                    </button>
                  </div>
                  {result.chunks.length > 1 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Parts">
                      <span className="eyebrow mr-1">Parts</span>
                      {result.chunks.map((_, i) => (
                        <button key={i} onClick={() => copyChunk(i)} aria-current={i === copiedChunk ? "true" : undefined} className={`btn btn-sm min-w-9 font-mono ${i === copiedChunk ? "btn-on" : ""}`}>
                          {i + 1}
                        </button>
                      ))}
                      <span className="font-mono text-[11px] text-[var(--muted)]">one post each</span>
                    </div>
                  )}
                </PostPreview>
              </div>

              {/* "Let's see it in TPT": one press copies this same reference in it.
                  Below the text: the verse is what gets read. The codes wrap rather
                  than scroll, so every translation is in view on a phone. */}
              <div className="flex items-start gap-3 border-t border-ink-700 bg-ink-950/50 px-5 py-3 sm:px-7" role="group" aria-label={`Copy ${result.passage.reference} in another translation`}>
                <span aria-hidden="true" className="eyebrow shrink-0 pt-1.5 pointer-coarse:pt-3.5">
                  Also in
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {TRANSLATIONS.map((t) => {
                    const current = t.code === result.passage.translationCode;
                    return (
                      <button
                        key={t.code}
                        onClick={() => switchTranslation(t.code)}
                        disabled={!!busy}
                        aria-pressed={current}
                        title={`${result.passage.reference} in ${t.name}`}
                        className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-[12px] font-semibold tracking-wide transition-colors disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
                          current ? "bg-ink-100 text-ink-950" : "text-ink-400 hover:bg-ink-800 hover:text-ink-50"
                        }`}
                      >
                        {t.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {chapter && (
            <section className="rise card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">
                <div>
                  <p className="eyebrow">Chapter</p>
                  <h2 className="display mt-1 text-[30px]">{chapter.reference}</h2>
                  <p className="mt-1.5 text-sm text-[var(--muted)]">
                    <span className="font-mono">{chapter.translationCode}</span> · choose a verse to copy just that one
                  </p>
                </div>
                <button onClick={() => setChapter(null)} aria-label="Close the chapter" className="btn btn-quiet btn-icon -mr-2">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[55dvh] space-y-0.5 overflow-y-auto p-2">
                {chapter.verses.map((v) => (
                  <button
                    key={v.verse}
                    onClick={() => lookup(`${chapter.reference}:${v.verse}`)}
                    className="group flex w-full gap-3 rounded-lg px-3 py-2 text-left font-text text-base leading-relaxed text-ink-200 transition-colors hover:bg-ink-800 hover:text-ink-50 pointer-coarse:min-h-11"
                  >
                    <span className="w-7 shrink-0 pt-1 text-right font-mono text-xs text-[var(--muted)] tabular-nums group-hover:text-accent-ink">{v.verse}</span>
                    <span>{v.text}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Under the verse, not instead of it: the result stays up all service,
              so this is where the list is reachable. Hidden while choosing between
              possible verses, where a second list would compete with 1–3. */}
          {!candidates && (
            <RecentVerses
              verses={recent.filter((v) => v.reference !== result?.passage.reference)}
              disabled={!!busy}
              onChoose={(v) => lookup(v.reference, { translation: v.translation })}
            />
          )}
        </div>

        <footer className="mt-auto flex items-center justify-center gap-2.5 pt-10 text-center font-mono text-[10.5px] tracking-wide text-[var(--muted)]">
          <span aria-hidden="true" className="tally" />
          Verse text comes from Bible sources. AI-quoted text is marked in red and never copied for you.
        </footer>
      </main>
    </div>
  );
}

/** What a line of the chat looks like, for the welcome's worked examples. */
const EXAMPLES = [
  { q: "rom 8 28", note: "a reference" },
  { q: "ps 23", note: "a whole psalm" },
  { q: "1cor13v4", note: "squashed together" },
  { q: "john 3 16 amp", note: "in another translation" },
  { q: "walk on snakes and not be bitten", note: "just describe it" },
];

/**
 * The Verses tab before anything has been looked up: a slate that says the
 * desk is standing by, a line on what happens, and examples that fill the box
 * when pressed (they never look anything up or copy, so trying one is safe
 * mid-service). Shrinks to the examples alone once there are verses from
 * earlier today to show under it.
 */
function VerseWelcome({ recent, onTry }: { recent: boolean; onTry: (q: string) => void }) {
  return (
    <section aria-labelledby="verse-welcome" className="rise py-2 sm:py-6">
      {!recent && (
        <>
          <p className="flex items-center gap-2.5 font-mono text-[11px] font-medium tracking-[0.16em] text-ink-200 uppercase">
            <span className="tally tally-live" /> Standing by
          </p>
          <h2 id="verse-welcome" className="display mt-4 max-w-[14ch] text-[44px] sm:text-[68px]">
            Listening for the <span className="text-accent-ink">next verse.</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-300">Type it the way the pastor says it. It is copied the moment it is found, formatted the way the chat posts it — then paste in Mixlr.</p>
        </>
      )}
      {recent && (
        <h2 id="verse-welcome" className="eyebrow">
          Try
        </h2>
      )}
      <ul className={`flex flex-wrap gap-2 ${recent ? "mt-2.5" : "mt-7"}`}>
        {EXAMPLES.map((e, i) => (
          <li key={e.q} style={{ "--i": i + 2 } as React.CSSProperties} className="rise">
            <button
              type="button"
              onClick={() => onTry(e.q)}
              title={`Put “${e.q}” in the box — ${e.note}`}
              className="group flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-1.5 text-left shadow-[var(--bevel)] transition-[border-color,background-color] hover:border-accent hover:bg-accent-soft pointer-coarse:min-h-11"
            >
              <span aria-hidden="true" className="font-mono text-[12px] text-accent-ink opacity-60 transition-opacity group-hover:opacity-100">›</span>
              <span className="font-mono text-[13px] text-ink-100">{e.q}</span>
              <span className="hidden font-ui text-xs text-[var(--muted)] group-hover:text-accent-ink sm:inline">{e.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
