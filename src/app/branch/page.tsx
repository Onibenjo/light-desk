"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import PageShell from "../PageShell";
import Problem from "../Problem";
import { failureFrom, getJson, OFFLINE, type Failure } from "@/lib/apiError";
import { tokenKeys, type Tokens } from "@/lib/branchTokens";
import { isLibrary, type Library } from "@/lib/messageLibrary";

type Row = { id: number; key: string; value: string };
type PageState = { kind: "loading" } | { kind: "loaded"; library: Library } | { kind: "failed"; failure: Failure };

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

  const toRows = useCallback((tokens: Tokens) => Object.entries(tokens).map(([key, value]) => ({ id: ++nextId.current, key, value })), []);

  const load = useCallback(async () => {
    const result = await getJson("/api/messages", isLibrary);
    if (!result.ok) {
      setState({ kind: "failed", failure: result.failure });
      return;
    }
    setState({ kind: "loaded", library: result.data });
    setRows(toRows(result.data.branch.tokens));
  }, [toRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the branch on mount is the effect's whole job
    void load();
  }, [load]);

  const library = state.kind === "loaded" ? state.library : null;
  const missing = useMemo(() => {
    const have = new Set(rows.map((r) => r.key.trim()));
    return tokenKeys(library?.messages.flatMap((m) => m.parts) ?? []).filter((k) => !have.has(k));
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
    const tokens: Tokens = {};
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
      const body = (await res.json().catch(() => null)) as { branch?: Library["branch"] } | null;
      if (body?.branch) {
        const branch = body.branch;
        setState((s) => (s.kind === "loaded" ? { ...s, library: { ...s.library, branch } } : s));
        setRows(toRows(branch.tokens));
      }
      setNewKey("");
      setNewValue("");
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const branch = library?.branch;

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
