"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { comingSundayName, moveItem, planMessageEdit, withParts } from "@/lib/setlist";
import { itemKey, MAX_NAME } from "@/lib/setlistEdit";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { useMessages } from "../useMessages";
import { useArmed } from "../useArmed";
import { messageLabel, messagesById } from "@/lib/messageLibrary";
import { partsFromText, textFromParts } from "@/lib/messageEdit";
import type { Setlist } from "../useSetlist";
import Icon from "../Icon";
import ActiveBadge from "../ActiveBadge";
import PageShell from "../PageShell";

type SetlistsState = { kind: "loading" } | { kind: "loaded"; setlists: Setlist[] } | { kind: "failed"; failure: Failure };

/** A failure to show above the setlists, after `lead` ("Not saved."). `saved` when the write went through and only the reload after it failed. */
type Notice = { failure: Failure; lead: string; saved: boolean };

const RELOAD_LEAD = "Saved, but couldn't reload the service orders.";

const RELOADED: Failure = { kind: "conflict", message: "Someone else changed this service order — it has reloaded, so make your change again" };

async function fetchSetlists(): Promise<{ ok: true; setlists: Setlist[] } | { ok: false; failure: Failure }> {
  let res: Response;
  try {
    res = await fetch("/api/setlists");
  } catch {
    return { ok: false, failure: OFFLINE };
  }
  if (!res.ok) return { ok: false, failure: await failureFrom(res) };
  try {
    const data = (await res.json()) as { setlists: Setlist[] };
    return { ok: true, setlists: data.setlists };
  } catch {
    // A 200 that is not the list: a captive portal's page, or the body cut off mid-read.
    return { ok: false, failure: describeFailure(502) };
  }
}

/**
 * What did not happen, why, and the one thing to do about it: try again, or
 * unlock when the device's PIN has gone. After a write, the unlock link opens a new tab so
 * text typed on this page survives. Setlists need the church PIN, not the admin PIN.
 */
function Problem({ failure, lead, onRetry, next, newTab }: { failure: Failure; lead: string; onRetry?: () => void; next: string; newTab: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
      <p className="min-w-0 wrap-anywhere">{`${lead} ${failure.message}${/[.?!]$/.test(failure.message) ? "" : "."}`}</p>
      {failure.kind === "locked" ? (
        <a
          href={unlockHref(next)}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          className="inline-flex items-center underline pointer-coarse:min-h-11"
        >
          {newTab ? "Enter the PIN in a new tab" : "Enter the PIN"}
        </a>
      ) : (
        onRetry && (
          <button onClick={onRetry} className="btn border-amber-500/40 text-amber-200 hover:border-amber-500/60 hover:bg-amber-500/10">
            Try again
          </button>
        )
      )}
    </div>
  );
}

/**
 * A name that saves where it is shown. Visibly a field at rest (a dashed
 * underline), because a phone has no hover to reveal it. Enter or leaving the
 * field saves; Escape puts back the saved name. A refused or unsent name snaps
 * back to the saved one, so the screen never shows a name that is not saved.
 * The same field as on /messages; a page file can export only its page.
 */
function RenameField({ saved, label, maxLength, onRename }: { saved: string; label: string; maxLength: number; onRename: (name: string) => Promise<boolean> }) {
  const ref = useRef<HTMLInputElement>(null);

  // A reload brought a new saved name. Shown unless someone is typing a different one.
  useEffect(() => {
    const input = ref.current;
    if (input && (document.activeElement !== input || tidy(input.value) === saved)) input.value = saved;
  }, [saved]);

  async function commit(input: HTMLInputElement) {
    if (tidy(input.value) === saved) return;
    if (!(await onRename(input.value))) input.value = saved;
  }

  return (
    <input
      ref={ref}
      defaultValue={saved}
      maxLength={maxLength}
      onBlur={(e) => void commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          void commit(e.currentTarget);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.value = saved;
          e.currentTarget.blur();
        }
      }}
      enterKeyHint="done"
      aria-label={label}
      className="min-w-48 flex-1 rounded-none border-0 border-b border-dashed border-ink-600 bg-transparent px-1 py-1 font-ui text-xl font-semibold hover:border-solid hover:border-ink-400 focus:border-solid focus:border-[var(--accent)] focus:outline-none pointer-coarse:min-h-11"
    />
  );
}

/** The name as the server will store it: one line, trimmed. */
function tidy(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Preparing a service. Separate from the desk because this is done the night
 * before, on a phone, and the desk itself must stay a search box and a song.
 *
 * Every write sends the whole setlist back, so each one carries the updatedAt
 * it started from and a 409 means someone else got there first — the page
 * reloads rather than guessing how to merge.
 */
export default function SetlistsPage() {
  const pathname = usePathname();
  const [state, setState] = useState<SetlistsState>({ kind: "loading" });
  const [name, setName] = useState("");
  /** Disables every write control while one is in flight. React re-renders between two clicks, so a second click finds it set. */
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** The setlist whose Delete has been armed; a second press does it. */
  const armed = useArmed<number>();
  const { library } = useMessages();
  const byId = useMemo(() => messagesById(library), [library]);
  /** The message item whose text is being edited for its service: setlist id and item key. */
  const [editing, setEditing] = useState<{ setlistId: number; key: string; text: string } | null>(null);

  /** Loads the setlists. A list already on screen stays there when this fails; the failure is returned to show. */
  const refresh = useCallback(async (): Promise<Failure | null> => {
    const result = await fetchSetlists();
    if (result.ok) {
      setState({ kind: "loaded", setlists: result.setlists });
      return null;
    }
    setState((s) => (s.kind === "loaded" ? s : { kind: "failed", failure: result.failure }));
    return result.failure;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(comingSundayName(new Date()));
    void refresh();
  }, [refresh]);

  const retryLoad = () => {
    setState({ kind: "loading" });
    void refresh();
  };

  const retryReload = async () => {
    const failure = await refresh();
    setNotice(failure ? { failure, lead: RELOAD_LEAD, saved: true } : null);
  };

  /**
   * Every write: send, show what went wrong if anything, reload. Returns whether
   * it saved, so a caller that closes an editor on success does not lose the
   * operator's text on a 409, a 400 or a dropped connection.
   */
  async function request(url: string, init: RequestInit, lead: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    armed.disarm();
    try {
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch {
        setNotice({ failure: OFFLINE, lead, saved: false });
        return false;
      }
      if (res.ok) {
        const failure = await refresh();
        if (failure) setNotice({ failure, lead: RELOAD_LEAD, saved: true });
        return true;
      }
      const failure = await failureFrom(res);
      if (failure.kind === "conflict" || res.status === 404) {
        // The page is behind the server: show what is there now.
        const reloadFailure = await refresh();
        setNotice({ failure: failure.kind === "conflict" && !reloadFailure ? RELOADED : failure, lead, saved: false });
      } else {
        setNotice({ failure, lead, saved: false });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const send = (id: number, body: unknown) =>
    request(`/api/setlists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "Not saved.");

  async function create() {
    const sent = name;
    if (!sent.trim()) return;
    const ok = await request("/api/setlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: sent }) }, "Service order not created.");
    // A refused name stays in the box to fix; a saved one makes way for the next, unless more was typed meanwhile.
    if (ok) setName((now) => (now === sent ? comingSundayName(new Date()) : now));
  }

  const remove = (id: number) => request(`/api/setlists/${id}`, { method: "DELETE" }, "Not deleted.");

  const setlists = state.kind === "loaded" ? state.setlists : [];

  return (
    <PageShell title="Service orders" purpose="The active service order sits at the top of the desk's Songs and Engagement tabs. Add to it there, with the + beside a song or a message.">
      <p id={armed.regionId} role="status" className="sr-only">
        {armed.announcement}
      </p>

      {notice && <Problem failure={notice.failure} lead={notice.lead} onRetry={notice.saved ? retryReload : undefined} next={pathname} newTab />}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          aria-label="New service order name"
          placeholder="e.g. Sunday 14 Sept, 1st service"
          className="field min-w-0 flex-1"
        />
        <button onClick={create} disabled={busy || !name.trim()} className="btn btn-primary shrink-0">
          New service order
        </button>
      </div>

      {state.kind === "loading" && <p className="text-sm text-[var(--muted)]">Loading the service orders…</p>}
      {state.kind === "failed" && <Problem failure={state.failure} lead="Couldn't load the service orders." onRetry={retryLoad} next={pathname} newTab={false} />}
      {state.kind === "loaded" && setlists.length === 0 && <p className="text-sm text-[var(--muted)]">No service orders yet — name one above and choose New service order.</p>}

      {setlists.map((s) => (
        <section key={s.id} className={`overflow-hidden rounded-xl border bg-ink-900 ${s.active ? "border-ink-600" : "border-ink-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
            <RenameField saved={s.name} label={`Rename service order ${s.name}`} maxLength={MAX_NAME} onRename={(next) => send(s.id, { name: next })} />
            <span className="flex flex-wrap items-center gap-2">
              {s.active ? (
                <ActiveBadge />
              ) : (
                <button onClick={() => send(s.id, { active: true })} disabled={busy} className="btn btn-sm">
                  Make active
                </button>
              )}
              <button
                {...armed.buttonProps(s.id, `the service order ${s.name}`, () => void remove(s.id))}
                disabled={busy}
                className={`btn btn-sm ${armed.isArmed(s.id) ? "btn-armed" : "btn-danger"}`}
              >
                {armed.isArmed(s.id) ? "Confirm delete" : "Delete"}
              </button>
            </span>
          </div>

          {s.items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              {s.active ? "Nothing in it yet — add songs and messages from the desk with +." : "Nothing in it yet — make it active, then add songs and messages from the desk."}
            </p>
          ) : (
            <ol className="divide-y divide-ink-800">
              {s.items.map((item, i) => {
                const entry = item.kind === "message" ? byId?.get(item.id) : undefined;
                const label = entry ? messageLabel(entry.section, entry.message) : item.title;
                const key = itemKey(item);
                const isEditing = editing?.setlistId === s.id && editing.key === key;
                return (
                  <li key={key} className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                        <span className="w-5 shrink-0 text-center font-ui text-sm font-semibold text-[var(--muted)] tabular-nums">{i + 1}</span>
                        <Icon name={item.kind === "song" ? "music" : "message"} className="h-4 w-4 text-[var(--muted)]" />
                        <span className="sr-only">{item.kind === "song" ? "Song: " : "Message: "}</span>
                        <span className="min-w-0 flex-1 text-[15px] wrap-anywhere sm:truncate">
                          {label}
                          {item.kind === "message" && item.parts && (
                            <span className="badge ml-2">
                              edited<span className="sr-only"> for this service</span>
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 pl-7 sm:pl-0">
                        {item.kind === "message" && !isEditing && (
                          <button
                            onClick={() => setEditing({ setlistId: s.id, key, text: textFromParts(item.parts ?? entry?.message.parts ?? []) })}
                            disabled={busy || (!item.parts && !entry)}
                            className="btn btn-sm shrink-0"
                          >
                            Edit for this service
                          </button>
                        )}
                        <button onClick={() => send(s.id, { items: moveItem(s.items, i, -1), updatedAt: s.updatedAt })} disabled={busy || i === 0} aria-label={`Move ${label} up`} className="btn btn-quiet btn-icon">
                          ↑
                        </button>
                        <button onClick={() => send(s.id, { items: moveItem(s.items, i, 1), updatedAt: s.updatedAt })} disabled={busy || i === s.items.length - 1} aria-label={`Move ${label} down`} className="btn btn-quiet btn-icon">
                          ↓
                        </button>
                        <button onClick={() => send(s.id, { items: s.items.filter((x) => itemKey(x) !== key), updatedAt: s.updatedAt })} disabled={busy} aria-label={`Remove ${label}`} className="btn btn-quiet btn-icon text-lg">
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
                          className="field w-full font-text"
                        />
                        <p className="text-xs text-[var(--muted)]">
                          Changes only this service order, and later fixes to the library won&apos;t reach it. A blank line starts a new part.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={async () => {
                              const parts = partsFromText(editing.text);
                              if (typeof parts === "string") return setNotice({ failure: { kind: "refused", message: parts }, lead: "Not saved.", saved: false });
                              const alreadyEdited = item.kind === "message" && item.parts !== undefined;
                              const plan = planMessageEdit(parts, entry?.message.parts, alreadyEdited);
                              // Typed back the library's own words: nothing to
                              // save, or an edit to undo — either way, no PATCH
                              // needed and the editor can close right away.
                              if (plan.kind === "skip") return setEditing(null);
                              const nextParts = plan.kind === "save" ? plan.parts : undefined;
                              const ok = await send(s.id, { items: withParts(s.items, i, nextParts), updatedAt: s.updatedAt });
                              // A 409, a 400 or a dropped connection leaves the editor open with what was typed, rather than losing it.
                              if (ok) setEditing(null);
                            }}
                            disabled={busy}
                            className="btn btn-primary"
                          >
                            Save for this service
                          </button>
                          {item.kind === "message" && item.parts && entry && (
                            <button
                              onClick={async () => {
                                // Closed only once it saved, so a failed reset keeps the text on screen.
                                if (await send(s.id, { items: withParts(s.items, i, undefined), updatedAt: s.updatedAt })) setEditing(null);
                              }}
                              disabled={busy}
                              className="btn"
                            >
                              Reset to library text
                            </button>
                          )}
                          <button onClick={() => setEditing(null)} className="btn btn-quiet">
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
    </PageShell>
  );
}
