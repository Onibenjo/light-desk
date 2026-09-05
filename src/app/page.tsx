"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette, { type ShortcutGuide } from "./CommandPalette";
import { isTypingTarget, type Action } from "@/lib/shortcuts";
import { BUSY_DELAY_MS } from "@/lib/timing";
import { hasFinePointer } from "@/lib/pointer";
import { TRANSLATIONS, DEFAULT_TRANSLATION, translationFromInput } from "@/lib/translations";
import { BOOKS } from "@/lib/books";
import SongsTab from "./SongsTab";

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
  { value: "llm", label: "AI (unverified)" },
];

const SOURCE_LABEL: Record<Passage["source"], string> = {
  local: "bundled KJV",
  cache: "cached",
  youversion: "YouVersion",
  apibible: "API.Bible",
  gateway: "BibleGateway fallback",
  llm: "AI-quoted - VERIFY before sending",
};

function refToQuery(r: Ref): string {
  const b = BOOKS[r.book];
  if (r.verseStart === 0) return `${b.name} ${r.chapter}`;
  return `${b.name} ${r.chapter}:${r.verseStart}${r.verseEnd > r.verseStart ? `-${r.verseEnd}` : ""}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for odd permission states: a hidden textarea + execCommand.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export default function Desk() {
  const router = useRouter();
  const [tab, setTab] = useState<"verses" | "songs">("verses");
  const [input, setInput] = useState("");
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [sourceChoice, setSourceChoice] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  // Deferred so instant lookups never flash it — see BUSY_DELAY_MS.
  const [showBusy, setShowBusy] = useState(false);
  const [result, setResult] = useState<PassageResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [copiedChunk, setCopiedChunk] = useState(0);
  const [chapter, setChapter] = useState<Passage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setShowBusy(true), BUSY_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setShowBusy(false);
    };
  }, [busy]);

  const showToast = useCallback((text: string, tone: "ok" | "warn" | "err" = "ok") => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "err" ? 6000 : 3500);
  }, []);

  const logSend = useCallback((kind: string, label: string, body: string, meta?: unknown) => {
    fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label, body, meta }) }).catch(() => {});
  }, []);

  // Puts the cursor back for the next reference. Skipped on a touchscreen, where
  // it would answer every send by covering the verse with the on-screen keyboard.
  const refocus = useCallback(() => {
    if (!hasFinePointer()) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Same reason this isn't the `autoFocus` attribute: on a phone that opens the
  // keyboard over the desk before the operator has looked at it.
  useEffect(() => {
    refocus();
  }, [refocus]);

  /** Fetch a reference, copy chunk 0, show it. */
  const lookup = useCallback(
    async (q: string, opts?: { silent?: boolean; select?: boolean; translation?: string }) => {
      const useTranslation = opts?.translation ?? translation;
      setBusy(q);
      setCandidates(null);
      try {
        const res = await fetch(`/api/passage?q=${encodeURIComponent(q)}&t=${encodeURIComponent(useTranslation)}&src=${sourceChoice}`);
        const data = await res.json();
        if (!res.ok) {
          if (data.kind === "description") return await describe(q);
          showToast(data.error ?? "Lookup failed", "err");
          return;
        }
        const r = data as PassageResult;
        setResult(r);
        setCopiedChunk(0);
        const tag = `${r.passage.reference} (${r.passage.translationCode})`;
        if (r.passage.source === "llm") {
          // Every real source failed; this text came from the AI's memory.
          // Show it, but make a human read it and click Copy deliberately.
          showToast("Every Bible source failed - this text is AI-quoted from memory. READ IT, then click Copy.", "err");
          logSend("verse", tag, r.chunks[0], { source: "llm", ms: r.ms, copied: "manual" });
          if (opts?.select !== false) setInput("");
          return;
        }
        const ok = await copyText(r.chunks[0]);
        if (ok) {
          showToast(
            r.chunks.length > 1 ? `Copied part 1 of ${r.chunks.length} — ${tag}. Paste in Mixlr, then copy part 2.` : `Copied ${tag} — paste in Mixlr`,
            r.passage.source === "gateway" ? "warn" : "ok",
          );
          logSend("verse", tag, r.chunks[0], { source: r.passage.source, ms: r.ms });
        } else {
          showToast("Couldn't reach the clipboard — use the Copy button", "err");
        }
        if (opts?.select !== false) setInput("");
      } catch {
        showToast("Network problem — try again", "err");
      } finally {
        setBusy(null);
        refocus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translation, sourceChoice, showToast, logSend, refocus],
  );

  const describe = useCallback(
    async (phrase: string) => {
      setBusy(phrase);
      setResult(null);
      try {
        const res = await fetch("/api/find-verse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: phrase }) });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error ?? "Search failed", "err");
          return;
        }
        const list = data.candidates as Candidate[];
        if (!list.length) {
          showToast("No verse matched that — try other words", "warn");
          return;
        }
        setCandidates(list);
        logSend("search", phrase, "", { candidates: list.map((c) => c.label), ms: data.ms });
        showToast(`${list.length} possible verse${list.length > 1 ? "s" : ""} — press 1, 2 or 3`, "ok");
      } catch {
        showToast("Network problem — try again", "err");
      } finally {
        setBusy(null);
        refocus();
      }
    },
    [showToast, logSend, refocus],
  );

  /** Set the translation, and re-send whatever verse is already on screen in it. */
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
    showToast(ok ? `Copied part ${i + 1} of ${result.chunks.length}` : "Clipboard blocked", ok ? "ok" : "err");
    refocus();
  }

  async function copyWhole() {
    if (!result) return;
    const ok = await copyText(result.text);
    showToast(ok ? `Copied the whole passage (${result.text.length} chars)` : "Clipboard blocked", ok ? "ok" : "err");
    logSend("verse", `${result.passage.reference} (${result.passage.translationCode}) whole`, result.text);
    refocus();
  }

  async function openChapter() {
    if (!result) return;
    setBusy("chapter");
    try {
      const res = await fetch(`/api/chapter?book=${result.ref.book}&chapter=${result.ref.chapter}&t=${encodeURIComponent(result.passage.translationCode)}&src=${sourceChoice}`);
      const data = await res.json();
      if (!res.ok) return showToast(data.error ?? "Couldn't load chapter", "err");
      setChapter(data.passage as Passage);
    } finally {
      setBusy(null);
    }
  }

  const actions: Action[] = (() => {
    const list: Action[] = [];
    if (result) {
      list.push({ id: "next-verse", title: "Next verse", group: "Verse", keywords: ["following"], chord: { key: "+" }, run: nextVerse });
      list.push({ id: "copy-again", title: `Copy “${result.passage.reference}” again`, group: "Verse", keywords: ["clipboard"], run: () => copyChunk(copiedChunk) });
      list.push({ id: "copy-whole", title: "Copy the whole passage", group: "Verse", keywords: ["clipboard", "all"], run: copyWhole });
      list.push({ id: "chapter", title: "Open the whole chapter", group: "Verse", keywords: ["context"], run: openChapter });
    }
    list.push({ id: "tab-verses", title: "Go to Verses", group: "Go to", keywords: ["bible", "scripture"], run: () => { setTab("verses"); refocus(); } });
    list.push({ id: "tab-songs", title: "Go to Songs", group: "Go to", keywords: ["lyrics", "songbook", "worship"], run: () => setTab("songs") });
    list.push({ id: "log", title: "Open the log", group: "Go to", keywords: ["history", "sunday", "sent"], run: () => router.push("/log") });
    list.push({ id: "sources", title: "Check verse sources", group: "Go to", keywords: ["diagnostics", "health"], run: () => router.push("/diag") });
    list.push({ id: "import", title: "Import a songbook", group: "Go to", keywords: ["videopsalm", "upload"], run: () => router.push("/songs/import") });
    for (const t of TRANSLATIONS) {
      list.push({ id: `t-${t.code}`, title: `Translation: ${t.code}`, group: "Switch", keywords: [t.name, "version"], run: () => switchTranslation(t.code) });
    }
    for (const o of SOURCE_OPTIONS) {
      list.push({ id: `s-${o.value}`, title: `Source: ${o.label}`, group: "Switch", keywords: ["provider", "fetch"], run: () => { setSourceChoice(o.value); refocus(); } });
    }
    return list;
  })();

  const guide: ShortcutGuide[] = [
    {
      group: "Looking up a verse",
      items: [
        { keys: "↵", label: "Copy the verse to the clipboard" },
        { keys: "+", label: "Next verse" },
        { keys: "1 2 3", label: "Pick a suggestion" },
        { keys: "Esc", label: "Clear the box and close panels" },
      ],
    },
    {
      group: "Sending a song",
      items: [
        { keys: "↑ ↓", label: "Pick a song in the search results" },
        { keys: "↵", label: "Open the song · then send a section and move on" },
        { keys: "1–9", label: "Jump straight to that section and send it" },
        { keys: "P", label: "Pin the section you're on (the chorus)" },
        { keys: "C", label: "Re-send the pinned section" },
        { keys: "Esc", label: "Back to the song list" },
      ],
    },
  ];

  // Solid, not translucent: the toast now floats over whatever is scrolled
  // beneath it, so a see-through background would give unpredictable contrast.
  const tone = {
    ok: "bg-emerald-950 border-emerald-500/40 text-emerald-200",
    warn: "bg-amber-950 border-amber-500/40 text-amber-200",
    err: "bg-red-950 border-red-500/40 text-red-200",
  };

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
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-black font-bold">L</span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">Lightdesk</h1>
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
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
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
              title="Auto tries YouVersion, then API.Bible, then BibleGateway, then AI. Pick one to force it."
              className={`rounded-md border bg-zinc-900 px-2 py-1.5 text-sm ${sourceChoice === "auto" ? "border-zinc-700" : sourceChoice === "llm" ? "border-red-500/60 text-red-200" : "border-amber-500/60 text-amber-200"}`}
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
          <Link href="/log" className="rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800" title="Search everything copied, by day">
            Log
          </Link>
          <Link href="/diag" className="rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800" title="Check which verse sources are working">
            Sources
          </Link>
        </div>
      </header>

      <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-sm">
        {(["verses", "songs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "verses") refocus();
            }}
            className={`flex-1 rounded-md px-3 py-2 font-medium capitalize ${tab === t ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {t === "verses" ? "📖 Verses" : "🎵 Songs"}
          </button>
        ))}
      </nav>

      {/* Floating, not in the flow: you're often scrolled to section 13 when this
          fires, and an inline banner both sits off-screen and shoves the list down
          under the cursor. pointer-events-none so it can never eat a click.

          Centred by a full-width flex row rather than `left-1/2` and a transform.
          The old way measured 50% of the *content* width, so the moment anything
          on the page overflowed, the confirmation the operator is waiting on slid
          off the side of the screen with it. This cannot: the row is pinned to
          both edges, so the box is bounded by the screen whatever else happens.

          The live region itself stays mounted — a screen reader announces changes
          inside one, and reliably misses a region that appears with its text
          already in place. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
      >
        {toast && <div className={`max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${tone[toast.tone]}`}>{toast.text}</div>}
      </div>
      {showBusy && busy && (
        <p role="status" aria-live="polite" className="text-sm text-zinc-400 animate-pulse">
          Looking up “{busy}”…
        </p>
      )}

      {tab === "songs" && <SongsTab copyText={copyText} showToast={showToast} logSend={logSend} />}

      <div className={tab === "verses" ? "contents" : "hidden"}>
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="flex gap-2">
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
            className="w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-60 sm:text-xl"
          />
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
          Describe a verse instead (<span className="font-mono">walk on snakes</span>) · add a translation at the end (<span className="font-mono">john 3 16 amp</span>) · type just{" "}
          <span className="font-mono">tpt</span> to re-send in another
        </p>
        <p className="hidden text-xs text-[var(--muted)] pointer-fine:block">
          <span className="kbd">Enter</span> copies to clipboard · add a translation at the end (<span className="font-mono">john 3 16 amp</span>) · type just <span className="font-mono">tpt</span> to re-send in another · <span className="kbd">+</span> next verse ·{" "}
          <span className="kbd">Esc</span> clear ·{" "}
          <span className="kbd">?</span> all shortcuts
        </p>
      </form>


      {candidates && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">Did they mean…</h2>
          {candidates.map((c, i) => (
            <button
              key={c.label}
              onClick={() => lookup(refToQuery(c.ref))}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left hover:border-[var(--accent)]"
            >
              <span className="kbd shrink-0">{i + 1}</span>
              <span className="font-medium">{c.label}</span>
              <span className="min-w-0 text-sm text-zinc-400">{c.why}</span>
            </button>
          ))}
        </section>
      )}

      {result && (
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-400">
              Source:{" "}
              <span className={result.passage.source === "llm" ? "font-semibold text-red-300" : result.passage.source === "gateway" ? "text-amber-300" : "text-zinc-200"}>
                {SOURCE_LABEL[result.passage.source]}
              </span>{" "}
              · {result.ms} ms
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyChunk(0)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black">
                Copy again
              </button>
              <button onClick={nextVerse} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                + Next verse
              </button>
              <button onClick={copyWhole} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                Whole passage
              </button>
              <button onClick={openChapter} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                Chapter
              </button>
            </div>
          </div>

          {/* "Let's see it in TPT" — one click re-sends this same reference. */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Show ${result.passage.reference} in another translation`}>
            {TRANSLATIONS.map((t) => {
              const current = t.code === result.passage.translationCode;
              return (
                <button
                  key={t.code}
                  onClick={() => switchTranslation(t.code)}
                  disabled={!!busy}
                  aria-pressed={current}
                  title={`${result.passage.reference} in ${t.name}`}
                  className={`rounded-md border px-2.5 py-1.5 font-mono text-xs disabled:opacity-50 ${
                    current ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-black" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {t.code}
                </button>
              );
            })}
          </div>
          {result.passage.attempts && result.passage.attempts.length > 0 && (result.passage.source === "llm" || result.passage.source === "gateway") && (
            <p className="text-xs text-[var(--muted)]">
              Skipped: {result.passage.attempts.join(" · ")}
            </p>
          )}
          {result.chunks.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {result.chunks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => copyChunk(i)}
                  className={`rounded-md px-3 py-1 text-sm ${i === copiedChunk ? "bg-zinc-200 text-black" : "border border-zinc-700 hover:bg-zinc-800"}`}
                >
                  Part {i + 1}
                </button>
              ))}
            </div>
          )}
          <pre className="wrap-anywhere whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-100">{result.chunks[copiedChunk]}</pre>
        </section>
      )}

      {chapter && (
        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {chapter.reference} · {chapter.translationCode}
            </h2>
            <button onClick={() => setChapter(null)} className="-mr-2 shrink-0 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              Close
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">Click a verse to copy it on its own.</p>
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1">
            {chapter.verses.map((v) => (
              <button
                key={v.verse}
                onClick={() => lookup(`${chapter.reference}:${v.verse}`)}
                className="block w-full rounded-md px-2 py-1 text-left text-[15px] leading-relaxed hover:bg-zinc-800"
              >
                <span className="mr-2 text-[var(--muted)]">{v.verse}.</span>
                {v.text}
              </button>
            ))}
          </div>
        </section>
      )}

      </div>

      <footer className="mt-auto pt-6 text-center text-xs text-[var(--muted)]">Lightdesk · verses come from licensed sources, never from the AI</footer>
    </main>
  );
}
