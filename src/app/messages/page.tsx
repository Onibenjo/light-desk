"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import PageShell from "../PageShell";
import { DeniedHint } from "../SongEditor";
import { useArmed } from "../useArmed";
import { MAX_MESSAGE_CHARS } from "@/lib/format";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { groupLibrary, type Library, type LibraryMessage, type LibrarySection } from "@/lib/messageLibrary";
import { longParts, MAX_MESSAGE_TITLE, MAX_SECTION_NAME, partsFromText, textFromParts } from "@/lib/messageEdit";

type Draft = { id: number | "new"; sectionId: number; title: string; text: string };

type LibraryState = { kind: "loading" } | { kind: "loaded"; library: Library } | { kind: "failed"; failure: Failure };

/**
 * A failure to show above the library. `lead` says what did not happen ("Not saved."),
 * and `saved` marks the case where the write went through and only the reload after it failed.
 */
type Notice = { failure: Failure; lead: string; saved: boolean };

const RELOAD_LEAD = "Saved, but couldn't reload the message library.";

/** " (copy)" would read as the clipboard, which is what "copy" means everywhere else in the app. */
const COPY_SUFFIX = " (duplicate)";

async function fetchLibrary(): Promise<{ ok: true; library: Library } | { ok: false; failure: Failure }> {
  let res: Response;
  try {
    res = await fetch("/api/messages");
  } catch {
    return { ok: false, failure: OFFLINE };
  }
  if (!res.ok) return { ok: false, failure: await failureFrom(res) };
  try {
    return { ok: true, library: (await res.json()) as Library };
  } catch {
    // A 200 that is not the library: a captive portal's page, or the body cut off mid-read.
    return { ok: false, failure: describeFailure(502) };
  }
}

/** A title plus " (duplicate)" that stays within the server's limit, without splitting an emoji in half. */
function copyTitle(title: string): string {
  const cut = title.slice(0, MAX_MESSAGE_TITLE - COPY_SUFFIX.length);
  return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}${COPY_SUFFIX}`;
}

/**
 * What did not happen, why, and the one thing to do about it: try again, or
 * unlock when the device's PIN has gone. After a write, the unlock link opens a
 * new tab so a half-written message on this page survives.
 */
function Problem({ failure, lead, onRetry, next, newTab }: { failure: Failure; lead: string; onRetry?: () => void; next: string; newTab: boolean }) {
  if (failure.kind === "denied") return <DeniedHint />;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
      <p className="min-w-0 wrap-anywhere">{sentence(lead, failure.message)}</p>
      {failure.kind === "locked" ? (
        <a
          href={unlockHref(next)}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          className="inline-flex items-center underline pointer-coarse:min-h-11"
        >
          {newTab ? "Enter the admin PIN in a new tab" : "Enter the admin PIN"}
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

/** "Not saved." then the reason, closed with a full stop unless it already has one. */
function sentence(lead: string, reason: string): string {
  return `${lead} ${reason}${/[.?!]$/.test(reason) ? "" : "."}`;
}

/** Why a section's Delete is off. */
function notEmpty(count: number): string {
  return `To delete this section, move or delete its ${count === 1 ? "message" : `${count} messages`} first`;
}

/** The name as the server will store it: one line, trimmed. */
function tidy(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * The message library: the church's engagement document, kept here instead
 * of in a Google Doc. Admin only: it changes the text every operator copies. Separate from the desk for the
 * same reason /setlists is — it is prepared ahead, not used mid-service.
 */
export default function MessagesPage() {
  const pathname = usePathname();
  const [state, setState] = useState<LibraryState>({ kind: "loading" });
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Disables every write control while one is in flight. React re-renders between two clicks, so a second click finds it set. */
  const [busy, setBusy] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The one message whose Duplicate, move and Delete are showing. Keyed by id, so it follows the row when it moves. */
  const [more, setMore] = useState<number | null>(null);
  /** "section:3" or "message:12" whose Delete has been armed; a second press does it. */
  const armed = useArmed<string>();
  /** Prefix for the ids that tie a section's controls to the sentences that explain them. */
  const ids = useId();

  /** Loads the library. A library already on screen stays there when this fails; the failure is returned to show. */
  const refresh = useCallback(async (): Promise<Failure | null> => {
    const result = await fetchLibrary();
    if (result.ok) {
      setState({ kind: "loaded", library: result.library });
      return null;
    }
    setState((s) => (s.kind === "loaded" ? s : { kind: "failed", failure: result.failure }));
    return result.failure;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the library on mount is the effect's whole job
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

  /** Every write: send, show the server's refusal if any, reload. True when it saved. */
  async function write(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    armed.disarm();
    const lead = method === "DELETE" ? "Not deleted." : "Not saved.";
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        setNotice({ failure: OFFLINE, lead, saved: false });
        return false;
      }
      if (!res.ok) {
        const failure = await failureFrom(res);
        setNotice({ failure, lead, saved: false });
        // Someone else changed or removed it first: show the library as it is now.
        if (failure.kind === "conflict" || res.status === 404) await refresh();
        return false;
      }
      const failure = await refresh();
      if (failure) setNotice({ failure, lead: RELOAD_LEAD, saved: true });
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const ok =
      draft.id === "new"
        ? await write("/api/messages", "POST", { sectionId: draft.sectionId, title: draft.title, text: draft.text })
        : await write(`/api/messages/${draft.id}`, "PATCH", { sectionId: draft.sectionId, title: draft.title, text: draft.text });
    if (ok) setDraft(null);
  }

  const duplicate = (m: LibraryMessage) => write("/api/messages", "POST", { sectionId: m.sectionId, title: copyTitle(m.title), text: textFromParts(m.parts) });

  const draftParts = draft ? partsFromText(draft.text) : [];
  const warnings = Array.isArray(draftParts) ? longParts(draftParts, MAX_MESSAGE_CHARS) : [];

  function editor(sections: LibrarySection[]) {
    if (!draft) return null;
    return (
      <div className="space-y-2 rounded-lg border border-ink-700 bg-ink-950 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            maxLength={MAX_MESSAGE_TITLE}
            aria-label="Message title"
            placeholder="Title, e.g. Sunday · Worship"
            className="field min-w-48 flex-1"
          />
          <select
            value={draft.sectionId}
            onChange={(e) => setDraft({ ...draft, sectionId: Number(e.target.value) })}
            aria-label="Section"
            className="field max-w-full px-2"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          aria-label="Message text"
          placeholder="The text exactly as it should appear in Mixlr. A blank line starts a new part."
          rows={8}
          className="field w-full font-text"
        />
        <p className="text-xs text-[var(--muted)]">
          {Array.isArray(draftParts) ? `${draftParts.length} ${draftParts.length === 1 ? "part" : "parts"}` : draftParts}
        </p>
        {warnings.map((i) => (
          <p key={i} className="text-xs text-amber-400">
            Part {i + 1} is over {MAX_MESSAGE_CHARS} characters — split it with a blank line, or Mixlr may cut it off.
          </p>
        ))}
        <div className="flex gap-2">
          <button onClick={saveDraft} disabled={busy} className="btn btn-primary">
            Save
          </button>
          <button onClick={() => setDraft(null)} className="btn btn-quiet">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const library = state.kind === "loaded" ? state.library : null;
  const groups = library ? groupLibrary(library) : [];
  const sections = groups.map((g) => g.section);
  const del = (key: string) => `btn btn-sm ${armed.isArmed(key) ? "btn-armed" : "btn-danger"}`;

  return (
    <PageShell title="Engagement library" purpose="Everything the operator copies that isn't a verse or a song. Each part of a message is one post in the Mixlr chat.">
      <p id={armed.regionId} role="status" className="sr-only">
        {armed.announcement}
      </p>

      {notice && <Problem failure={notice.failure} lead={notice.lead} onRetry={notice.saved ? retryReload : undefined} next={pathname} newTab />}
      {state.kind === "loading" && <p className="text-sm text-[var(--muted)]">Loading the message library…</p>}
      {state.kind === "failed" && <Problem failure={state.failure} lead="Couldn't load the message library." onRetry={retryLoad} next={pathname} newTab={false} />}

      {library && library.sections.length === 0 && library.messages.length === 0 && (
        <div className="space-y-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-[15px]">The message library is empty. Start with the church&apos;s greetings, prayers and other service messages?</p>
          <button onClick={() => write("/api/messages/seed", "POST")} disabled={busy} className="btn btn-primary">
            Load starter messages
          </button>
        </div>
      )}

      {groups.map(({ section, messages }, si) => (
        <section key={section.id} className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
          <div className="space-y-1 border-b border-ink-800 px-4 pt-3 pb-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <RenameField
                saved={section.name}
                label={`Rename section ${section.name}`}
                maxLength={MAX_SECTION_NAME}
                onRename={(name) => write(`/api/message-sections/${section.id}`, "PATCH", { name })}
              />
              <span className="flex flex-wrap items-center gap-1">
                <label className="mr-2 flex shrink-0 items-center gap-2 text-sm text-ink-300 pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    aria-describedby={section.inService ? undefined : `${ids}-out-${section.id}`}
                    checked={section.inService}
                    onChange={(e) => write(`/api/message-sections/${section.id}`, "PATCH", { inService: e.target.checked })}
                    disabled={busy}
                  />
                  Can go in a service order
                </label>
                <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: -1 })} disabled={busy || si === 0} aria-label={`Move ${section.name} up`} className="btn btn-quiet btn-icon">
                  ↑
                </button>
                <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: 1 })} disabled={busy || si === groups.length - 1} aria-label={`Move ${section.name} down`} className="btn btn-quiet btn-icon">
                  ↓
                </button>
                <button
                  {...armed.buttonProps(`section:${section.id}`, `the section ${section.name}`, () => void write(`/api/message-sections/${section.id}`, "DELETE"))}
                  disabled={busy || messages.length > 0}
                  // Why it is off, for screen readers; a tooltip alone is lost on a phone. A disabled button is never armed.
                  {...(messages.length > 0 ? { "aria-describedby": `${ids}-full-${section.id}` } : {})}
                  title={messages.length > 0 ? notEmpty(messages.length) : undefined}
                  className={del(`section:${section.id}`)}
                >
                  {armed.isArmed(`section:${section.id}`) ? "Confirm delete" : "Delete"}
                </button>
                {messages.length > 0 && (
                  <span id={`${ids}-full-${section.id}`} className="sr-only">
                    {notEmpty(messages.length)}
                  </span>
                )}
              </span>
            </div>
            {!section.inService && (
              <p id={`${ids}-out-${section.id}`} className="px-1 text-xs text-[var(--muted)]">
                Left out of service orders — copy these from the Engagement tab whenever they&apos;re needed.
              </p>
            )}
          </div>

          <ol className="divide-y divide-ink-800">
            {messages.map((m, mi) => {
              const showing = more === m.id;
              const moreId = `${ids}-more-${m.id}`;
              return (
                <li key={m.id} className={`px-4 py-2.5 ${showing ? "bg-ink-800/50" : ""}`}>
                  {draft?.id === m.id ? (
                    editor(sections)
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold">{m.title}</span>
                          <span className="block truncate text-sm text-[var(--muted)]">
                            {m.parts.length > 1 ? `${m.parts.length} parts · ` : ""}
                            {m.parts[0]}
                          </span>
                        </span>
                        <button onClick={() => setDraft({ id: m.id, sectionId: m.sectionId, title: m.title, text: textFromParts(m.parts) })} disabled={busy} className="btn btn-sm">
                          Edit
                        </button>
                        {/* Duplicate, move and Delete are rarer than Edit, and five of
                            them on 115 rows buried the titles; they wait behind this. */}
                        <button
                          onClick={() => setMore(showing ? null : m.id)}
                          aria-expanded={showing}
                          aria-controls={moreId}
                          aria-label={`More for ${m.title}`}
                          className={`btn btn-sm btn-icon ${showing ? "border-ink-500 bg-ink-700 text-ink-50" : "btn-quiet"}`}
                        >
                          <span aria-hidden="true" className="text-lg leading-none">⋯</span>
                        </button>
                      </div>
                      {showing && (
                        <div id={moreId} className="mt-2 flex flex-wrap items-center gap-1">
                          <button onClick={() => duplicate(m)} disabled={busy} className="btn btn-sm">
                            Duplicate
                          </button>
                          <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: -1 })} disabled={busy || mi === 0} aria-label={`Move ${m.title} up`} className="btn btn-sm btn-icon">
                            ↑
                          </button>
                          <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: 1 })} disabled={busy || mi === messages.length - 1} aria-label={`Move ${m.title} down`} className="btn btn-sm btn-icon">
                            ↓
                          </button>
                          <button {...armed.buttonProps(`message:${m.id}`, `the message ${m.title}`, () => void write(`/api/messages/${m.id}`, "DELETE"))} disabled={busy} className={`ml-auto ${del(`message:${m.id}`)}`}>
                            {armed.isArmed(`message:${m.id}`) ? "Confirm delete" : "Delete"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
            <li className="px-4 py-2">
              {draft?.id === "new" && draft.sectionId === section.id ? (
                editor(sections)
              ) : (
                <button onClick={() => setDraft({ id: "new", sectionId: section.id, title: "", text: "" })} disabled={busy} className="btn btn-quiet -ml-3 text-left whitespace-normal wrap-anywhere">
                  + Add a message to {section.name}
                </button>
              )}
            </li>
          </ol>
        </section>
      ))}

      {library && (
        <div className="flex gap-2">
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            maxLength={MAX_SECTION_NAME}
            aria-label="New section name"
            placeholder="e.g. Baby Dedication"
            className="field min-w-0 flex-1"
          />
          <button
            onClick={async () => {
              const sent = newSection;
              // Cleared only if nothing more was typed while it saved.
              if (sent.trim() && (await write("/api/message-sections", "POST", { name: sent }))) setNewSection((now) => (now === sent ? "" : now));
            }}
            disabled={busy || !newSection.trim()}
            className="btn shrink-0"
          >
            Add section
          </button>
        </div>
      )}
    </PageShell>
  );
}
