"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette, { type ShortcutGuide } from "./CommandPalette";
import { isTypingTarget, type Action } from "@/lib/shortcuts";
import { BUSY_DELAY_MS } from "@/lib/timing";
import { hasFinePointer } from "@/lib/pointer";
import { TRANSLATIONS, DEFAULT_TRANSLATION, translationFromInput } from "@/lib/translations";
import { BOOKS } from "@/lib/books";
import Icon from "./Icon";
import Toast, { copyText, useToast } from "./Toast";
import RecentVerses from "./RecentVerses";
import { dayBounds, toISODate } from "@/lib/logQuery";
import { recentVerses, withRecent, type RecentVerse } from "@/lib/recentVerses";
import SongsTab from "./SongsTab";
import WhatsNew from "./WhatsNew";
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
function PostPreview({ text, header }: { text: string; header: string }) {
  const hasHeader = text.startsWith(header + "\n");
  const [reference, translation] = header.split("\n");
  return (
    <div className="px-4 py-4 sm:px-5 sm:py-5">
      {hasHeader && (
        <p className="mb-2">
          <span className="block font-text text-lg font-bold leading-snug text-ink-50">{reference}</span>
          <span className="block font-text text-sm text-[var(--muted)]">{translation}</span>
        </p>
      )}
      <pre className="wrap-anywhere whitespace-pre-wrap font-text text-lg leading-relaxed text-ink-100 sm:text-[19px]">{hasHeader ? text.slice(header.length + 1) : text}</pre>
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
  const [copiedChunk, setCopiedChunk] = useState(0);
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
  const { copied, copyPart } = useMessageCopy({ copyText, showToast, logSend });
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
    const next = tabIndexForKey(e.key, current, TABS.length);
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
          logSend("verse", tag, r.chunks[0], { source: "llm", ms: r.ms, copied: "manual" });
          if (opts?.select !== false) setInput("");
          return;
        }
        const ok = await copyText(r.chunks[0]);
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
    [translation, sourceChoice, showToast, fail, logSend, refocus],
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
    const ok = await copyText(result.chunks[i]);
    setCopiedChunk(i);
    const n = result.chunks.length;
    const tag = `${result.passage.reference} (${result.passage.translationCode})`;
    const copied = n === 1 ? `Copied ${tag} — paste in Mixlr` : `Copied ${tag} part ${i + 1} of ${n}${i + 1 < n ? ` — paste in Mixlr, then copy part ${i + 2}` : " — paste in Mixlr"}`;
    showToast(ok ? copied : COPY_FAILED, ok ? "ok" : "err");
    refocus();
  }

  async function copyWhole() {
    if (!result) return;
    const ok = await copyText(result.text);
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


  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <CommandPalette actions={actions} guide={guide} />
      {/* Two rows on a phone — brand and links, then the two pickers — collapsing
          to the single toolbar row from `sm` up. Laid out with `order` rather
          than duplicated markup so there is one set of controls, and so the
          desktop reading order (pickers, then links) is the one it always was.
          Before this wrapped it ran 470px wide inside a 390px screen, which
          stretched the layout viewport and took the toast off-screen with it. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="order-1 flex min-w-0 items-center gap-3">
          {/* The mark from the church website until CLC's own file arrives. */}
          <Image src="/brand/clc-logo.png" alt="" width={36} height={36} priority className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight tracking-wide uppercase">Lightdesk</h1>
            <p className="truncate text-xs text-[var(--muted)]">CLC · Mixlr chat desk</p>
          </div>
        </div>
        <div className="order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:order-2 sm:w-auto sm:flex-nowrap sm:gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="translation" className="shrink-0 text-xs text-[var(--muted)]">Translation</label>
            <select
              id="translation"
              value={translation}
              onChange={(e) => switchTranslation(e.target.value)}
              // Matches the translation chips: a switch mid-lookup would be dropped
              // by the in-flight guard, leaving this saying one translation while
              // the verse on screen is still in the other.
              disabled={!!busy}
              className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm disabled:opacity-60 pointer-coarse:min-h-11"
            >
              {TRANSLATIONS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code}
                </option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:ml-2">
            <label htmlFor="source" className="shrink-0 text-xs text-[var(--muted)]">Source</label>
            <select
              id="source"
              value={sourceChoice}
              onChange={(e) => {
                setSourceChoice(e.target.value);
                refocus();
              }}
              title="Auto tries saved verses, YouVersion, API.Bible, BibleGateway, then AI-quoted text. Choose one to use only that source."
              className={`rounded-md border bg-ink-900 px-2 py-1.5 text-sm pointer-coarse:min-h-11 ${sourceChoice === "auto" ? "border-ink-700" : sourceChoice === "llm" ? "border-red-500/60 text-red-200" : "border-amber-500/60 text-amber-200"}`}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">
          <Link href="/log" className="btn" title="Search everything copied, by day">
            Log
          </Link>
          <Link href="/diag" className="btn" title="Check which verse sources are working">
            Sources
          </Link>
        </div>
      </header>

      {locked && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          This device is locked, so nothing can be looked up or logged.{" "}
          <Link href={unlockHref("/")} className="font-medium underline underline-offset-2 hover:text-amber-200">
            Enter the PIN
          </Link>
        </p>
      )}

      <WhatsNew />

      <div role="tablist" aria-label="Desk" className="flex gap-1 rounded-lg bg-ink-900 p-1 text-sm">
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
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[15px] font-semibold tracking-wide uppercase pointer-coarse:min-h-11 ${selected ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-200"}`}
            >
              <Icon name={t.icon} className={`h-4 w-4 ${selected ? "text-[var(--accent)]" : ""}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      <Toast toast={toast} />

      {/* All three panels stay in the DOM so each tab's aria-controls always
          points at something; Songs and Messages still mount only while shown. */}
      <div role="tabpanel" id={panelId("songs")} aria-labelledby={tabId("songs")} hidden={tab !== "songs"} onFocus={() => onPanelFocus("songs")}>
      {tab === "songs" && (
        <SongsTab
          copyText={copyText}
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
      <div role="tabpanel" id={panelId("messages")} aria-labelledby={tabId("messages")} hidden={tab !== "messages"} onFocus={() => onPanelFocus("messages")}>
      {tab === "messages" && (
        <MessagesTab
          library={library}
          failed={libraryFailed}
          onRetry={reloadLibrary}
          setlistApi={setlistApi}
          copied={setlistCopied}
          copyPart={copyPart}
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
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
          {/* The placeholder is short enough to read to its end on a 320px
              screen; the examples the long one carried moved to the hint below,
              where they wrap instead of being clipped mid-word. The three input
              attributes stop a phone keyboard from "helpfully" capitalising and
              autocorrecting terse references like "rom 8 28" into prose. */}
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
            className={`w-full min-w-0 rounded-xl border border-ink-700 bg-ink-900 px-4 py-4 text-lg outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-60 sm:text-xl ${showBusy && busy ? "pr-12 sm:pr-48" : ""}`}
          />
          {/* Busy shows inside the box, not as a line above it: that line
              mounted after BUSY_DELAY_MS and shoved the box and everything under
              it down while the operator was looking at it. The live region
              stays mounted so the announcement is heard. */}
          <p role="status" aria-live="polite" className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-2 text-sm text-ink-300">
            {showBusy && busy && (
              <>
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-ink-100 motion-reduce:animate-none" />
                <span className="sr-only sm:not-sr-only">{busy === "chapter" ? "Loading the chapter…" : "Looking it up…"}</span>
              </>
            )}
          </p>
          </div>
          {/* On a laptop Enter has always done this and a button would be noise.
              A touch device has no visible way to submit at all, so it gets one. */}
          <button
            type="submit"
            disabled={!input.trim() || !!busy}
            className="shrink-0 rounded-xl bg-[var(--accent)] px-5 font-medium text-black disabled:opacity-40 pointer-fine:hidden"
          >
            Go
          </button>
        </div>
        {/* Two hints, one per kind of device. A phone has no Enter, Esc or "?"
            to press, and printing four lines about them pushes the songbook off
            the first screen — but "describe it" and the translation suffix are
            features, not shortcuts, so those survive the swap. */}
        <p className="text-xs text-[var(--muted)] pointer-fine:hidden">
          Describe it (<span className="whitespace-nowrap font-mono">walk on snakes</span>) · add a translation (<span className="whitespace-nowrap font-mono">john 3 16 amp</span>) · type only{" "}
          <span className="font-mono">tpt</span> for the same verse in TPT
        </p>
        <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
          <span className="kbd">Enter</span> copies · add a translation (<span className="whitespace-nowrap font-mono">john 3 16 amp</span>) · type only <span className="font-mono">tpt</span> for the same verse in TPT ·{" "}
          <span className="kbd">+</span> next verse · <span className="kbd">Esc</span> clear · <span className="kbd">?</span> all shortcuts
        </p>
      </form>

      {candidates && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--muted)]">Possible verses</h2>
          {candidates.map((c, i) => (
            <button
              // By position: the model can suggest the same label twice, and
              // the list is replaced whole, never reordered.
              key={i}
              onClick={() => lookup(refToQuery(c.ref))}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-left font-text hover:border-ink-500 hover:bg-ink-800"
            >
              <span className="kbd shrink-0">{i + 1}</span>
              <span className="font-medium">{c.label}</span>
              <span className="min-w-0 text-sm text-ink-400">{c.why}</span>
            </button>
          ))}
        </section>
      )}

      {result && (
        <section aria-label={`${result.passage.reference} (${result.passage.translationCode})`} className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
          {/* Loud only when the text itself might be wrong. The AI-quoted banner
              names the Copy button, because nothing was copied for you. */}
          {result.passage.source === "llm" && (
            <p className="border-b border-red-500/40 bg-red-950 px-4 py-2.5 text-sm font-semibold text-red-200">
              {SOURCE_LABEL.llm}
              {result.passage.attempts && result.passage.attempts.length > 0 && <span className="block text-xs font-normal text-red-300">Failed first: {result.passage.attempts.join(" · ")}</span>}
            </p>
          )}
          {result.passage.source === "gateway" && (
            <p className="border-b border-amber-500/30 bg-amber-950/60 px-4 py-2 text-sm text-amber-200">
              From the {SOURCE_LABEL.gateway}
              {result.passage.attempts && result.passage.attempts.length > 0 && <span className="text-amber-300/80"> · failed first: {result.passage.attempts.join(" · ")}</span>}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-800 px-4 py-2.5">
            <div className="flex flex-wrap gap-2">
              {/* Copies the part on screen, the same one "Copy again" in ⌘K copies. */}
              <button onClick={() => copyChunk(copiedChunk)} className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[15px] font-semibold text-black hover:brightness-110 pointer-coarse:min-h-11">
                {/* An AI-quoted verse was never copied, so there is nothing to copy "again"; the warning names this button. */}
                {result.passage.source === "llm" ? "Copy" : "Copy again"}
              </button>
              <button onClick={nextVerse} className="rounded-md border border-ink-700 px-3 py-1.5 text-[15px] font-medium text-ink-200 hover:bg-ink-800 pointer-coarse:min-h-11">
                Next verse
              </button>
              <button onClick={copyWhole} className="rounded-md border border-ink-700 px-3 py-1.5 text-[15px] font-medium text-ink-200 hover:bg-ink-800 pointer-coarse:min-h-11">
                Copy whole passage
              </button>
              <button onClick={openChapter} className="rounded-md border border-ink-700 px-3 py-1.5 text-[15px] font-medium text-ink-200 hover:bg-ink-800 pointer-coarse:min-h-11">
                Open chapter
              </button>
            </div>
            {result.passage.source !== "llm" && result.passage.source !== "gateway" && (
              <p className="text-xs text-[var(--muted)]">
                {SOURCE_LABEL[result.passage.source]} · {result.ms} ms
              </p>
            )}
          </div>

          {result.chunks.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2.5" role="group" aria-label="Parts">
              {result.chunks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => copyChunk(i)}
                  aria-current={i === copiedChunk ? "true" : undefined}
                  className={`rounded-md px-3 py-1 text-[15px] font-medium pointer-coarse:min-h-11 ${i === copiedChunk ? "bg-ink-100 text-black" : "border border-ink-700 text-ink-200 hover:bg-ink-800"}`}
                >
                  Part {i + 1}
                </button>
              ))}
              <span className="text-xs text-[var(--muted)]">
                of {result.chunks.length} · one post each
              </span>
            </div>
          )}

          <PostPreview text={result.chunks[copiedChunk]} header={`${result.passage.reference}\n${result.passage.translationName}`} />

          {/* "Let's see it in TPT" — one press copies this same reference in it.
              Below the text, not above it: the verse is what gets read, and
              thirteen chips over it pushed it down the card. */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-800 bg-ink-950/40 px-4 py-2.5" role="group" aria-label={`Copy ${result.passage.reference} in another translation`}>
            <span aria-hidden="true" className="mr-1 font-ui text-xs font-semibold tracking-widest uppercase text-[var(--muted)]">
              Copy in
            </span>
            {TRANSLATIONS.map((t) => {
              const current = t.code === result.passage.translationCode;
              return (
                <button
                  key={t.code}
                  onClick={() => switchTranslation(t.code)}
                  disabled={!!busy}
                  aria-pressed={current}
                  title={`${result.passage.reference} in ${t.name}`}
                  className={`rounded-md border px-2 py-1 text-[13px] font-semibold tracking-wide disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
                    current ? "border-ink-300 bg-ink-100 text-black" : "border-transparent text-ink-300 hover:border-ink-700 hover:bg-ink-800"
                  }`}
                >
                  {t.code}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {chapter && (
        <section className="space-y-2 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {chapter.reference} · {chapter.translationCode}
            </h2>
            <button onClick={() => setChapter(null)} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-200 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
              Close
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">Choose a verse to copy just that one.</p>
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1">
            {chapter.verses.map((v) => (
              <button
                key={v.verse}
                onClick={() => lookup(`${chapter.reference}:${v.verse}`)}
                className="block w-full rounded-md px-2 py-1 text-left font-text text-base leading-relaxed hover:bg-ink-800 pointer-coarse:min-h-11"
              >
                <span className="mr-2 text-[var(--muted)]">{v.verse}.</span>
                {v.text}
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

      <footer className="mt-auto pt-6 text-center text-xs text-[var(--muted)]">Verse text comes from Bible sources. AI-quoted text is marked in red and never copied for you.</footer>
    </main>
  );
}
