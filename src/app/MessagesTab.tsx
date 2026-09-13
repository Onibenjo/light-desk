"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { digitToIndex, moveCursor } from "@/lib/songKeys";
import { isTypingTarget } from "@/lib/shortcuts";
import { hasFinePointer } from "@/lib/pointer";
import { groupEntries, groupLibrary, messagesById, openMessageFor, type Library, type LibraryEntry, type OpenMessage } from "@/lib/messageLibrary";
import { searchMessages } from "@/lib/messageSearch";
import { openMessageFromRow, resolveSetlist, staleNote, type MessageRow, type SongRow } from "@/lib/setlist";
import MessageList from "./MessageList";
import MessageView from "./MessageView";
import SetlistBar from "./SetlistBar";
import StartSetlist from "./StartSetlist";
import { addToast, type SetlistApi } from "./useSetlist";

type Copy = (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number) => Promise<boolean>;

interface Props {
  library: Library | null;
  failed: boolean;
  onRetry: () => void;
  setlistApi: SetlistApi;
  copied: ReadonlySet<string>;
  copyPart: Copy;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  pending: OpenMessage | null;
  onPendingDone: () => void;
  onOpenSong: (row: SongRow) => void;
}

export default function MessagesTab({ library, failed, onRetry, setlistApi, copied, copyPart, showToast, pending, onPendingDone, onOpenSong }: Props) {
  const { setlist, addItem, startSetlist } = setlistApi;
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [hit, setHit] = useState(0);
  const [open, setOpen] = useState<OpenMessage | null>(null);
  const [starting, setStarting] = useState<OpenMessage | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const partRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const byId = useMemo(() => messagesById(library), [library]);
  const hits = useMemo(() => (library && deferredQ.trim() ? searchMessages(library, deferredQ) : []), [library, deferredQ]);
  const groups = useMemo(() => (!library ? [] : deferredQ.trim() ? groupEntries(hits) : groupLibrary(library)), [library, deferredQ, hits]);
  const setlistRows = useMemo(() => (setlist ? resolveSetlist(setlist.items, null, byId) : []), [setlist, byId]);

  const focusPart = useCallback((i: number) => {
    setCursor(i);
    requestAnimationFrame(() => partRefs.current[i]?.focus());
  }, []);

  const openMessage = useCallback(
    (m: OpenMessage) => {
      setOpen(m);
      setSent(new Set());
      partRefs.current = [];
      focusPart(0);
    },
    [focusPart],
  );

  const closeMessage = useCallback(() => {
    setOpen(null);
    if (hasFinePointer()) requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // A message sent here from elsewhere: a setlist row on the Songs tab, or ⌘K.
  useEffect(() => {
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a message handed over by the desk is the effect's whole job
    openMessage(pending);
    onPendingDone();
  }, [pending, openMessage, onPendingDone]);

  /** One part copies straight away; several open, to be sent in turn. */
  const pick = useCallback(
    (m: OpenMessage) => {
      if (m.parts.length === 1) void copyPart(m, 0);
      else openMessage(m);
    },
    [copyPart, openMessage],
  );

  const pickEntry = useCallback((entry: LibraryEntry) => pick(openMessageFor(entry)), [pick]);

  const pickRow = useCallback(
    (row: MessageRow) => {
      const m = openMessageFromRow(row, byId);
      if (m) pick(m);
    },
    [byId, pick],
  );

  const add = useCallback(
    async (m: OpenMessage) => {
      if (!setlist) return setStarting(m);
      const toast = addToast(await addItem({ kind: "message", id: m.id, title: m.label }), m.label, setlist.name);
      showToast(toast.text, toast.tone);
    },
    [setlist, addItem, showToast],
  );

  const addEntry = useCallback((entry: LibraryEntry) => void add(openMessageFor(entry)), [add]);

  async function copyOpenPart(i: number, advance: boolean) {
    if (!open) return;
    if (!(await copyPart(open, i))) return;
    setSent((prev) => new Set(prev).add(i));
    setFlash(i);
    window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 700);
    // Only advance on a keyboard send; a mouse user picked that part on purpose.
    focusPart(advance ? moveCursor(i, 1, open.parts.length) : i);
  }

  // Message-view keys. Safe on the document because the view renders no text field.
  useEffect(() => {
    if (!open) return;
    const count = open.parts.length;
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target as HTMLElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return closeMessage();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return focusPart(moveCursor(cursor, e.key === "ArrowDown" ? 1 : -1, count));
      }
      const jump = digitToIndex(e.key, count);
      if (jump !== null) {
        e.preventDefault();
        void copyOpenPart(jump, false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (starting) {
    return (
      <StartSetlist
        what={starting.label}
        onCancel={() => setStarting(null)}
        onStart={async (name) => {
          const m = starting;
          setStarting(null);
          const result = await startSetlist(name, { kind: "message", id: m.id, title: m.label });
          showToast(result === "added" ? `Started ${name} with "${m.label}"` : addToast(result, m.label, name).text, result === "added" ? "ok" : "err");
        }}
      />
    );
  }

  if (open) {
    return (
      <MessageView
        label={open.label}
        parts={open.parts}
        edited={open.edited}
        sent={sent}
        cursor={cursor}
        flash={flash}
        addLabel={open.inService ? (setlist ? "+ Setlist" : "Start a setlist") : null}
        onCopy={(i, advance) => void copyOpenPart(i, advance)}
        onFocusPart={setCursor}
        onAdd={() => void add(open)}
        onBack={closeMessage}
        partRef={(i, el) => {
          partRefs.current[i] = el;
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {setlist && (
        <SetlistBar
          name={setlist.name}
          staleNote={staleNote(setlist.updatedAt, new Date())}
          rows={setlistRows}
          copied={copied}
          onOpen={onOpenSong}
          onMessage={pickRow}
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
            pickEntry(hits[Math.min(hit, hits.length - 1)]);
          }
        }}
        aria-label="Search messages"
        placeholder="Search messages — sound restored, sermon queen…"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-xl outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{library && `${library.messages.length} messages`}</span>
        <span className="flex shrink-0 gap-3">
          <Link href="/setlists" className="-my-1 py-1 underline hover:text-zinc-300">
            Setlists
          </Link>
          <Link href="/messages" className="-my-1 py-1 underline hover:text-zinc-300">
            Edit library
          </Link>
        </span>
      </div>
      {failed && (
        <p className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Couldn&rsquo;t load messages.
          <button onClick={onRetry} className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1 hover:bg-amber-500/10">
            Retry
          </button>
        </p>
      )}
      {!library && !failed && <p className="text-sm text-[var(--muted)]">Loading messages…</p>}
      {library && library.messages.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          The library is empty. <Link href="/messages" className="underline">Load the starter messages</Link> (admin PIN).
        </p>
      )}
      {library && deferredQ.trim() && hits.length === 0 && <p className="text-sm text-[var(--muted)]">No message has all of those words.</p>}
      {groups.length > 0 && (
        <MessageList
          groups={groups}
          active={deferredQ.trim() ? (hits[Math.min(hit, hits.length - 1)]?.message.id ?? null) : null}
          copied={copied}
          onPick={pickEntry}
          onAdd={addEntry}
          onHover={(id) => setHit(Math.max(0, hits.findIndex((h) => h.message.id === id)))}
        />
      )}
    </div>
  );
}
