"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "../Icon";
import PageShell from "../PageShell";
import { DeniedHint } from "../SongEditor";
import { describeFailure, failureFrom, OFFLINE, unlockHref, type Failure } from "@/lib/apiError";
import { TOKEN_PATTERN } from "@/lib/branchTokens";
import type { Library } from "@/lib/messageLibrary";

type BranchInfo = { id: number; name: string; tokens: Record<string, string> };
type Row = { id: number; key: string; value: string };
type PageState = { kind: "loading" } | { kind: "loaded"; branch: BranchInfo; library: Library | null } | { kind: "failed"; failure: Failure };

async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; failure: Failure }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, failure: OFFLINE };
  }
  if (!res.ok) return { ok: false, failure: await failureFrom(res) };
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, failure: describeFailure(502) };
  }
}

/** Every `{key}` written anywhere in the library, in order of first appearance. */
function keysInLibrary(library: Library | null): string[] {
  const keys: string[] = [];
  for (const m of library?.messages ?? []) {
    for (const part of m.parts) {
      for (const match of part.matchAll(TOKEN_PATTERN)) if (!keys.includes(match[1])) keys.push(match[1]);
    }
  }
  return keys;
}

function sentence(lead: string, reason: string): string {
  return `${lead} ${reason}${/[.?!]$/.test(reason) ? "" : "."}`;
}

function Problem({ failure, lead, onRetry, next, newTab }: { failure: Failure; lead: string; onRetry?: () => void; next: string; newTab: boolean }) {
  if (failure.kind === "denied") return <DeniedHint />;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      <Icon name="warn" className="h-4 w-4 shrink-0" />
      <p className="min-w-0 wrap-anywhere">{sentence(lead, failure.message)}</p>
      {failure.kind === "locked" ? (
        <a href={unlockHref(next)} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined} className="link inline-flex items-center pointer-coarse:min-h-11">
          {newTab ? "Enter the admin PIN in a new tab" : "Enter the admin PIN"}
        </a>
      ) : (
        onRetry && (
          <button onClick={onRetry} className="btn border-warn-line text-warn-fg hover:border-warn-line hover:bg-warn-bg">
            Try again
          </button>
        )
      )}
    </div>
  );
}

/**
 * This branch's own details: the values a shared message's `{key}` becomes
 * when this branch copies it, so one "Midweek service is at {midweekTime}"
 * serves every branch. Admin only to change; any PIN may look.
 */
export default function BranchPage() {
  const pathname = usePathname();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [rows, setRows] = useState<Row[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const nextId = useRef(0);

  const toRows = useCallback((tokens: Record<string, string>) => Object.entries(tokens).map(([key, value]) => ({ id: ++nextId.current, key, value })), []);

  const load = useCallback(async () => {
    const [branch, library] = await Promise.all([getJson<BranchInfo>("/api/branch"), getJson<Library>("/api/messages")]);
    if (!branch.ok) {
      setState({ kind: "failed", failure: branch.failure });
      return;
    }
    setState({ kind: "loaded", branch: branch.data, library: library.ok ? library.data : null });
    setRows(toRows(branch.data.tokens));
  }, [toRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the branch on mount is the effect's whole job
    void load();
  }, [load]);

  const library = state.kind === "loaded" ? state.library : null;
  const missing = useMemo(() => {
    const have = new Set(rows.map((r) => r.key.trim()));
    return keysInLibrary(library).filter((k) => !have.has(k));
  }, [library, rows]);

  function addRow(key: string, value = "") {
    setRows((now) => [...now, { id: ++nextId.current, key, value }]);
    setSaved(false);
  }

  function editRow(id: number, change: Partial<Row>) {
    setRows((now) => now.map((r) => (r.id === id ? { ...r, ...change } : r)));
    setSaved(false);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setSaved(false);
    const tokens: Record<string, string> = {};
    for (const r of rows) tokens[r.key.trim()] = r.value;
    // A filled-in Add row counts, so a value typed there isn't lost by pressing Save first.
    if (newKey.trim()) tokens[newKey.trim()] = newValue;
    try {
      let res: Response;
      try {
        res = await fetch("/api/branch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokens }) });
      } catch {
        setNotice(OFFLINE);
        return;
      }
      if (!res.ok) {
        setNotice(await failureFrom(res));
        return;
      }
      const body = (await res.json().catch(() => null)) as { branch?: BranchInfo } | null;
      if (body?.branch) {
        const branch = body.branch;
        setState((s) => (s.kind === "loaded" ? { ...s, branch } : s));
        setRows(toRows(branch.tokens));
      }
      setNewKey("");
      setNewValue("");
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const branch = state.kind === "loaded" ? state.branch : null;

  return (
    <PageShell
      title={branch?.name ?? "Branch settings"}
      purpose={
        <>
          This branch&apos;s own details. Write a name in braces in a shared message, like <code className="font-mono text-[13px]">{"{midweekTime}"}</code>, and each branch copies its own value in its place.
        </>
      }
    >
      {state.kind === "loading" && <p className="text-sm text-[var(--muted)]">Loading the branch settings…</p>}
      {state.kind === "failed" && <Problem failure={state.failure} lead="Couldn't load the branch settings." onRetry={() => void load()} next={pathname} newTab={false} />}

      {branch && (
        <>
          {missing.length > 0 && (
            <div className="card rise space-y-2 p-4">
              <p className="text-[15px]">
                {missing.length === 1 ? "1 name is" : `${missing.length} names are`} used in the library with no value for {branch.name}. Messages that use {missing.length === 1 ? "it" : "them"} won&apos;t copy here until {missing.length === 1 ? "it has" : "they have"} one.
              </p>
              <div className="flex flex-wrap gap-2">
                {missing.map((k) => (
                  <button key={k} onClick={() => addRow(k)} className="btn btn-sm font-mono" aria-label={`Add a value for ${k}`}>
                    + {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="card rise overflow-hidden">
            <ul className="divide-y divide-ink-700">
              {rows.length === 0 && <li className="px-4 py-3 text-sm text-[var(--muted)]">No values yet.</li>}
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={r.key}
                      onChange={(e) => editRow(r.id, { key: e.target.value })}
                      aria-label="Name"
                      spellCheck={false}
                      autoCapitalize="off"
                      className="field min-w-0 flex-1 font-mono"
                    />
                    <button onClick={() => setRows((now) => now.filter((x) => x.id !== r.id))} disabled={busy} className="btn btn-sm btn-danger shrink-0">
                      Remove
                    </button>
                  </div>
                  <textarea value={r.value} onChange={(e) => editRow(r.id, { value: e.target.value })} aria-label={`Value for ${r.key || "this name"}`} rows={2} className="field w-full font-text" />
                </li>
              ))}
              <li className="space-y-2 bg-ink-950/40 px-4 py-3">
                <p className="eyebrow">Add a value</p>
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  aria-label="New name"
                  placeholder="e.g. midweekTime"
                  spellCheck={false}
                  autoCapitalize="off"
                  className="field w-full font-mono"
                />
                <textarea value={newValue} onChange={(e) => setNewValue(e.target.value)} aria-label="New value" placeholder="e.g. 5:30pm" rows={2} className="field w-full font-text" />
                <button
                  onClick={() => {
                    addRow(newKey.trim(), newValue);
                    setNewKey("");
                    setNewValue("");
                  }}
                  disabled={!newKey.trim()}
                  className="btn"
                >
                  Add
                </button>
              </li>
            </ul>
          </section>

          {notice && <Problem failure={notice} lead="Not saved." next={pathname} newTab />}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void save()} disabled={busy} className="btn btn-primary">
              {busy ? "Saving…" : "Save"}
            </button>
            <p role="status" className="text-sm text-[var(--muted)]">
              {saved ? "Saved — shared messages now copy with these values" : ""}
            </p>
          </div>
        </>
      )}
    </PageShell>
  );
}
