"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TRANSLATIONS, DEFAULT_TRANSLATION } from "@/lib/translations";
import { BOOKS } from "@/lib/books";

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
type LogRow = { id: number; kind: string; label: string; body: string | null; createdAt: string };

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
  const [input, setInput] = useState("");
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PassageResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [copiedChunk, setCopiedChunk] = useState(0);
  const [chapter, setChapter] = useState<Passage | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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

  const showToast = useCallback((text: string, tone: "ok" | "warn" | "err" = "ok") => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "err" ? 6000 : 3500);
  }, []);

  const logSend = useCallback((kind: string, label: string, body: string, meta?: unknown) => {
    fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label, body, meta }) }).catch(() => {});
  }, []);

  const refocus = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /** Fetch a reference, copy chunk 0, show it. */
  const lookup = useCallback(
    async (q: string, opts?: { silent?: boolean; select?: boolean }) => {
      setBusy(q);
      setCandidates(null);
      try {
        const res = await fetch(`/api/passage?q=${encodeURIComponent(q)}&t=${encodeURIComponent(translation)}`);
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
    [translation, showToast, logSend, refocus],
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
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
      const res = await fetch(`/api/chapter?book=${result.ref.book}&chapter=${result.ref.chapter}&t=${encodeURIComponent(result.passage.translationCode)}`);
      const data = await res.json();
      if (!res.ok) return showToast(data.error ?? "Couldn't load chapter", "err");
      setChapter(data.passage as Passage);
    } finally {
      setBusy(null);
    }
  }

  async function toggleLog() {
    if (!showLog) {
      const res = await fetch("/api/log");
      const data = await res.json().catch(() => ({ rows: [] }));
      setLog(data.rows ?? []);
    }
    setShowLog((s) => !s);
  }

  const tone = { ok: "bg-emerald-600/20 border-emerald-500/40 text-emerald-200", warn: "bg-amber-600/20 border-amber-500/40 text-amber-200", err: "bg-red-600/20 border-red-500/40 text-red-200" };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-black font-bold">L</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Lightdesk</h1>
            <p className="text-xs text-zinc-500">CLC · Mixlr chat desk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Translation</label>
          <select
            value={translation}
            onChange={(e) => {
              setTranslation(e.target.value);
              refocus();
            }}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          >
            {TRANSLATIONS.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code}
              </option>
            ))}
          </select>
          <button onClick={toggleLog} className="rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            {showLog ? "Hide log" : "Log"}
          </button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-2">
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!!busy}
          placeholder="rom 8 28  ·  1 cor 13 4-7  ·  or describe it: walk on snakes"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-xl outline-none placeholder:text-zinc-600 focus:border-[var(--accent)] disabled:opacity-60"
        />
        <p className="text-xs text-zinc-500">
          <span className="kbd">Enter</span> copies to clipboard · add a translation at the end (<span className="font-mono">john 3 16 amp</span>) · <span className="kbd">+</span> next verse ·{" "}
          <span className="kbd">Esc</span> clear
        </p>
      </form>

      {toast && <div className={`rounded-lg border px-4 py-3 text-sm ${tone[toast.tone]}`}>{toast.text}</div>}
      {busy && <p className="text-sm text-zinc-400 animate-pulse">Looking up “{busy}”…</p>}

      {candidates && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Did they mean…</h2>
          {candidates.map((c, i) => (
            <button
              key={c.label}
              onClick={() => lookup(refToQuery(c.ref))}
              className="flex w-full items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left hover:border-[var(--accent)]"
            >
              <span className="kbd">{i + 1}</span>
              <span className="font-medium">{c.label}</span>
              <span className="text-sm text-zinc-400">{c.why}</span>
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
          {result.passage.attempts && result.passage.attempts.length > 0 && (result.passage.source === "llm" || result.passage.source === "gateway") && (
            <p className="text-xs text-zinc-500">
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
          <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-100">{result.chunks[copiedChunk]}</pre>
        </section>
      )}

      {chapter && (
        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {chapter.reference} · {chapter.translationCode}
            </h2>
            <button onClick={() => setChapter(null)} className="text-sm text-zinc-400 hover:text-zinc-200">
              Close
            </button>
          </div>
          <p className="text-xs text-zinc-500">Click a verse to copy it on its own.</p>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {chapter.verses.map((v) => (
              <button
                key={v.verse}
                onClick={() => lookup(`${chapter.reference}:${v.verse}`)}
                className="block w-full rounded-md px-2 py-1 text-left text-[15px] leading-relaxed hover:bg-zinc-800"
              >
                <span className="mr-2 text-zinc-500">{v.verse}.</span>
                {v.text}
              </button>
            ))}
          </div>
        </section>
      )}

      {showLog && (
        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Recently copied</h2>
          {log.length === 0 && <p className="text-sm text-zinc-500">Nothing yet.</p>}
          <ul className="divide-y divide-zinc-800">
            {log.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] uppercase text-zinc-400">{row.kind}</span>
                  {row.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {row.body && (
                    <button onClick={() => copyText(row.body!).then(() => showToast(`Copied ${row.label} again`))} className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800">
                      Copy
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto pt-6 text-center text-xs text-zinc-600">Lightdesk · verses come from licensed sources, never from the AI</footer>
    </main>
  );
}
