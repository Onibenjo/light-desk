"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DeniedHint } from "../SongEditor";
import { MAX_MESSAGE_CHARS } from "@/lib/format";
import { groupLibrary, type Library, type LibraryMessage, type LibrarySection } from "@/lib/messageLibrary";
import { longParts, partsFromText, textFromParts } from "@/lib/messageEdit";

type Draft = { id: number | "new"; sectionId: number; title: string; text: string };

/**
 * The engagement document, kept here instead of in a Google Doc. Admin only:
 * it changes the text every operator copies. Separate from the desk for the
 * same reason /setlists is — it is prepared ahead, not used mid-service.
 */
export default function MessagesPage() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  /** "section:3" or "message:12" whose Delete has been armed; a second press does it. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (!res.ok) return setError("Could not load the library");
    setLibrary((await res.json()) as Library);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Every write: send, show the server's refusal if any, reload. True when it saved. */
  async function write(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDenied(false);
    setConfirming(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 403) {
        setDenied(true);
        return false;
      }
      if (!res.ok) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not save");
        return false;
      }
      await load();
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

  const duplicate = (m: LibraryMessage) =>
    write("/api/messages", "POST", { sectionId: m.sectionId, title: `${m.title.slice(0, 113)} (copy)`, text: textFromParts(m.parts) });

  const draftParts = draft ? partsFromText(draft.text) : [];
  const warnings = Array.isArray(draftParts) ? longParts(draftParts, MAX_MESSAGE_CHARS) : [];

  function editor(sections: LibrarySection[]) {
    if (!draft) return null;
    return (
      <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label="Message title"
            placeholder="Title — e.g. Sunday · Worship, or the pastor's name"
            className={`min-w-0 flex-1 px-3 py-2 ${field}`}
          />
          <select
            value={draft.sectionId}
            onChange={(e) => setDraft({ ...draft, sectionId: Number(e.target.value) })}
            aria-label="Section"
            className={`px-2 py-2 ${field}`}
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
          placeholder="The text exactly as it is posted. A blank line starts a new post."
          rows={8}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <p className="text-xs text-[var(--muted)]">
          {Array.isArray(draftParts) ? `${draftParts.length} post${draftParts.length === 1 ? "" : "s"}` : draftParts}
        </p>
        {warnings.map((i) => (
          <p key={i} className="text-xs text-amber-400">
            Post {i + 1} is over {MAX_MESSAGE_CHARS} characters — Mixlr may cut this. Split it with a blank line.
          </p>
        ))}
        <div className="flex gap-2">
          <button onClick={saveDraft} disabled={busy} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11">
            Save
          </button>
          <button onClick={() => setDraft(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 pointer-coarse:min-h-11">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const groups = library ? groupLibrary(library) : [];
  const sections = groups.map((g) => g.section);
  const small = "rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-30 pointer-coarse:min-h-11";
  const square = "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-zinc-800 disabled:opacity-30";
  const quiet = "inline-flex items-center text-sm text-[var(--muted)] underline hover:text-zinc-300 pointer-coarse:min-h-11";
  const field = "rounded-md border border-zinc-700 bg-zinc-900 text-sm outline-none focus:border-[var(--accent)] pointer-coarse:min-h-11";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Message library</h1>
        <Link href="/" className={quiet}>
          ← Back to the desk
        </Link>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Everything the operator posts that is not a verse or a song. Sections that can go in a setlist show a + on the desk; switch that off for
        sections like Apologies, which happen whenever they happen.
      </p>

      {denied && <DeniedHint />}
      {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}
      {!library && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {library && library.sections.length === 0 && library.messages.length === 0 && (
        <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4">
          <p className="text-sm">The library is empty. Load the starter messages taken from the engagement document?</p>
          <button onClick={() => write("/api/messages/seed", "POST")} disabled={busy} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11">
            Load starter messages
          </button>
        </div>
      )}

      {groups.map(({ section, messages }, si) => (
        <section key={section.id} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={section.name}
              defaultValue={section.name}
              onBlur={async (e) => {
                const input = e.currentTarget;
                if (input.value.trim() === section.name) return;
                const ok = await write(`/api/message-sections/${section.id}`, "PATCH", { name: input.value });
                if (!ok) input.value = section.name;
              }}
              aria-label={`Name of ${section.name}`}
              className="min-w-48 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium hover:border-zinc-700 focus:border-[var(--accent)] focus:outline-none pointer-coarse:min-h-11"
            />
            <span className="flex flex-wrap items-center gap-2">
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted)] pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={section.inService}
                  onChange={(e) => write(`/api/message-sections/${section.id}`, "PATCH", { inService: e.target.checked })}
                  disabled={busy}
                />
                Can go in a setlist
              </label>
              <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: -1 })} disabled={busy || si === 0} aria-label={`Move ${section.name} up`} className={square}>
                ↑
              </button>
              <button onClick={() => write(`/api/message-sections/${section.id}`, "PATCH", { move: 1 })} disabled={busy || si === groups.length - 1} aria-label={`Move ${section.name} down`} className={square}>
                ↓
              </button>
              <button
                onClick={() => (confirming === `section:${section.id}` ? write(`/api/message-sections/${section.id}`, "DELETE") : setConfirming(`section:${section.id}`))}
                disabled={busy || messages.length > 0}
                title={messages.length > 0 ? "Move or delete its messages first" : undefined}
                className={small}
              >
                {confirming === `section:${section.id}` ? "Sure?" : "Delete"}
              </button>
            </span>
          </div>

          <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {messages.map((m, mi) => (
              <li key={m.id} className="space-y-2 px-2 py-2">
                {draft?.id === m.id ? (
                  editor(sections)
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {m.parts.length > 1 ? `${m.parts.length} posts · ` : ""}
                        {m.parts[0]}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => setDraft({ id: m.id, sectionId: m.sectionId, title: m.title, text: textFromParts(m.parts) })} disabled={busy} className={small}>
                        Edit
                      </button>
                      <button onClick={() => duplicate(m)} disabled={busy} className={small}>
                        Duplicate
                      </button>
                      <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: -1 })} disabled={busy || mi === 0} aria-label={`Move ${m.title} up`} className={square}>
                        ↑
                      </button>
                      <button onClick={() => write(`/api/messages/${m.id}`, "PATCH", { move: 1 })} disabled={busy || mi === messages.length - 1} aria-label={`Move ${m.title} down`} className={square}>
                        ↓
                      </button>
                      <button
                        onClick={() => (confirming === `message:${m.id}` ? write(`/api/messages/${m.id}`, "DELETE") : setConfirming(`message:${m.id}`))}
                        disabled={busy}
                        className={small}
                      >
                        {confirming === `message:${m.id}` ? "Sure?" : "Delete"}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
            <li className="px-2 py-2">
              {draft?.id === "new" && draft.sectionId === section.id ? (
                editor(sections)
              ) : (
                <button onClick={() => setDraft({ id: "new", sectionId: section.id, title: "", text: "" })} disabled={busy} className={quiet}>
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
            aria-label="New section name"
            placeholder="New section — e.g. Baby Dedication"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)] pointer-coarse:min-h-11"
          />
          <button
            onClick={async () => {
              if (newSection.trim() && (await write("/api/message-sections", "POST", { name: newSection }))) setNewSection("");
            }}
            disabled={busy || !newSection.trim()}
            className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50 pointer-coarse:min-h-11"
          >
            Add section
          </button>
        </div>
      )}
    </main>
  );
}
