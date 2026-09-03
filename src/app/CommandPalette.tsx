"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesChord, formatChord, filterActions, isTypingTarget, type Action, type Chord } from "@/lib/shortcuts";

export type ShortcutGuide = { group: string; items: { keys: string; label: string }[] };

const OPEN_PALETTE: Chord = { key: "k", mod: true };
const OPEN_GUIDE: Chord = { key: "?" };

type View = "palette" | "guide";

export default function CommandPalette({ actions, guide = [] }: { actions: Action[]; guide?: ShortcutGuide[] }) {
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Resolved after mount: navigator isn't available while rendering on the server.
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  useEffect(() => {
    // Read after hydration; navigator doesn't exist during the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent));
  }, []);

  const results = useMemo(() => filterActions(actions, query), [actions, query]);
  const chord = useCallback((c: Chord) => formatChord(c, isMac), [isMac]);

  const open = useCallback((v: View) => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setView(v);
  }, []);

  const close = useCallback(() => {
    setView(null);
    // Send focus back where it came from, or a keyboard user is dumped at the top.
    restoreTo.current?.focus?.();
  }, []);

  // Global openers. Bare "?" is ignored while typing so it can still be typed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (matchesChord(e, OPEN_PALETTE)) {
        e.preventDefault();
        if (view) close();
        else open("palette");
        return;
      }
      if (matchesChord(e, OPEN_GUIDE) && !isTypingTarget(e.target as HTMLElement)) {
        e.preventDefault();
        open("guide");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, view]);

  useEffect(() => {
    if (view === "palette") inputRef.current?.focus();
  }, [view]);

  if (!view) return null;

  const run = (a: Action) => {
    close();
    a.run();
  };

  function onGuideKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      return close();
    }
    // Close is the only focusable control in here, so Tab stays put.
    if (e.key === "Tab") e.preventDefault();
  }

  function onPaletteKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      return close();
    }
    // Only the input is focusable in here, so Tab has nowhere to go: hold it.
    if (e.key === "Tab") return e.preventDefault();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      return setActive((i) => (results.length ? (i + 1) % results.length : 0));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const a = results[active];
      if (a) run(a);
    }
  }

  const titleId = `${listId}-title`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={view === "guide" ? onGuideKey : undefined}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        {view === "palette" ? (
          <>
            <h2 id={titleId} className="sr-only">
              Command palette
            </h2>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-label="Search commands"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onPaletteKey}
              placeholder="Type a command…"
              className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-base outline-none placeholder:text-[var(--muted)]"
            />
            <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[45vh] overflow-y-auto py-1">
              {results.map((a, i) => (
                <li
                  key={a.id}
                  id={`${listId}-${a.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(a);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${i === active ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"}`}
                >
                  <span>
                    {a.group && <span className="mr-2 text-xs text-[var(--muted)]">{a.group}</span>}
                    {a.title}
                  </span>
                  {a.chord && <span className="kbd shrink-0">{chord(a.chord)}</span>}
                </li>
              ))}
              {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">No matching command.</li>}
            </ul>
            <p role="status" aria-live="polite" className="border-t border-zinc-800 px-4 py-2 text-xs text-[var(--muted)]">
              {results.length} {results.length === 1 ? "command" : "commands"} · <span className="kbd">↑</span> <span className="kbd">↓</span> move ·{" "}
              <span className="kbd">↵</span> run · <span className="kbd">?</span> all shortcuts
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 id={titleId} className="font-medium">
                Keyboard shortcuts
              </h2>
              <button autoFocus onClick={close} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
                Close
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
              <section className="space-y-1.5">
                <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Anywhere</h3>
                <Row keys={chord(OPEN_PALETTE)} label="Open the command palette" />
                <Row keys={chord(OPEN_GUIDE)} label="Show this list" />
                <Row keys="Esc" label="Close" />
              </section>
              {guide.map((g) => (
                <section key={g.group} className="space-y-1.5">
                  <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">{g.group}</h3>
                  {g.items.map((it) => (
                    <Row key={it.label} keys={it.keys} label={it.label} />
                  ))}
                </section>
              ))}
              {actions.some((a) => a.chord) && (
                <section className="space-y-1.5">
                  <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">Commands</h3>
                  {actions
                    .filter((a) => a.chord)
                    .map((a) => (
                      <Row key={a.id} keys={chord(a.chord!)} label={a.title} />
                    ))}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-300">{label}</span>
      <span className="kbd shrink-0">{keys}</span>
    </div>
  );
}
