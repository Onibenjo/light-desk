"use client";

import { useState } from "react";
import Icon from "../Icon";
import PageShell from "../PageShell";
import { failureFrom, OFFLINE } from "@/lib/apiError";
import { MAX_BRANCH_NAME } from "@/lib/branchInput";

type BranchRow = { id: number; name: string };

const WRONG_PIN = "Wrong network PIN — check it and try again";

/** A new PIN typed for a branch: shown as typed, so it can be read back to whoever will use it. */
function PinField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block min-w-0 flex-1 space-y-1">
      <span className="eyebrow block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={32}
        placeholder={placeholder}
        className="field w-full font-mono"
      />
    </label>
  );
}

/**
 * The network's branches: add one, rename one, change its PINs. Gated by the
 * network PIN, which this page keeps only while it is open — never in storage
 * or a cookie — and sends with each request.
 */
export default function BranchesPage() {
  const [networkPin, setNetworkPin] = useState("");
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [churchPin, setChurchPin] = useState("");
  const [adminPin, setAdminPin] = useState("");

  /** The branch whose rename or PIN fields are open. */
  const [open, setOpen] = useState<{ id: number; what: "rename" | "pins" } | null>(null);
  const [rename, setRename] = useState("");
  const [newChurch, setNewChurch] = useState("");
  const [newAdmin, setNewAdmin] = useState("");

  /** Every request: the network PIN in a header, the server's sentence on refusal. Null on failure. */
  async function call<T>(url: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { "x-network-pin": networkPin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      setError(OFFLINE.message);
      return null;
    }
    // Here a 401 answers the network PIN itself; this page is not behind the device lock.
    if (res.status === 401) {
      setError(WRONG_PIN);
      return null;
    }
    if (!res.ok) {
      setError((await failureFrom(res)).message);
      return null;
    }
    return ((await res.json().catch(() => null)) as T | null) ?? null;
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    const data = await call<{ branches: BranchRow[] }>("/api/branches", "GET");
    if (data) setBranches(data.branches);
  }

  const create = () =>
    run(async () => {
      const data = await call<{ branch: BranchRow }>("/api/branches", "POST", { name, churchPin, adminPin: adminPin.trim() || undefined });
      if (!data) return;
      setDone(`Added ${data.branch.name} — unlock a device there with its church or admin PIN`);
      setName("");
      setChurchPin("");
      setAdminPin("");
      await reload();
    });

  const patch = (b: BranchRow, body: Record<string, string | undefined>, message: string) =>
    run(async () => {
      const data = await call<{ branch: BranchRow }>(`/api/branches/${b.id}`, "PATCH", body);
      if (!data) return;
      setDone(message.replace("%s", data.branch.name));
      setOpen(null);
      await reload();
    });

  function toggle(b: BranchRow, what: "rename" | "pins") {
    if (open?.id === b.id && open.what === what) return setOpen(null);
    setOpen({ id: b.id, what });
    setRename(b.name);
    setNewChurch("");
    setNewAdmin("");
  }

  return (
    <PageShell title="Branches" purpose="Every branch on this desk, each with its own PINs, service orders and messages. Adding or changing a branch needs the network PIN.">
      <form
        className="card rise space-y-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(reload);
        }}
      >
        <label htmlFor="network-pin" className="eyebrow block">
          Network PIN
        </label>
        <div className="flex gap-2">
          <input
            id="network-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={networkPin}
            onChange={(e) => setNetworkPin(e.target.value)}
            className="field min-w-0 flex-1 font-mono"
          />
          <button disabled={busy || !networkPin} className="btn btn-primary shrink-0">
            {branches ? "Reload" : "Show branches"}
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">Kept only while this page is open. Reloading the page forgets it.</p>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <Icon name="warn" className="h-4 w-4 shrink-0" />
          <p className="min-w-0 wrap-anywhere">{error}</p>
        </div>
      )}
      <p role="status" className={done ? "text-sm text-ink-300" : "sr-only"}>
        {done ?? ""}
      </p>

      {branches && (
        <>
          <section className="card rise overflow-hidden">
            <p className="border-b border-ink-700 px-4 py-3 text-sm text-ink-300">Changing a PIN locks every device of that branch until it is unlocked again with the new PIN.</p>
            <ul className="divide-y divide-ink-700">
              {branches.map((b) => (
                <li key={b.id} className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{b.name}</span>
                    <button onClick={() => toggle(b, "rename")} aria-expanded={open?.id === b.id && open.what === "rename"} className="btn btn-sm">
                      Rename
                    </button>
                    <button onClick={() => toggle(b, "pins")} aria-expanded={open?.id === b.id && open.what === "pins"} className="btn btn-sm">
                      Change PINs
                    </button>
                  </div>
                  {open?.id === b.id && open.what === "rename" && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void patch(b, { name: rename }, "Renamed to %s");
                      }}
                    >
                      <input autoFocus value={rename} onChange={(e) => setRename(e.target.value)} maxLength={MAX_BRANCH_NAME} aria-label={`New name for ${b.name}`} className="field min-w-0 flex-1" />
                      <button disabled={busy || !rename.trim() || rename.trim() === b.name} className="btn btn-primary shrink-0">
                        Save
                      </button>
                    </form>
                  )}
                  {open?.id === b.id && open.what === "pins" && (
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void patch(b, { churchPin: newChurch.trim() || undefined, adminPin: newAdmin.trim() || undefined }, "Changed the PINs of %s — its devices need the new PIN to unlock");
                      }}
                    >
                      <div className="flex flex-wrap gap-2">
                        <PinField label="New church PIN" value={newChurch} onChange={setNewChurch} placeholder="Leave blank to keep" />
                        <PinField label="New admin PIN" value={newAdmin} onChange={setNewAdmin} placeholder="Leave blank to keep" />
                      </div>
                      <button disabled={busy || (!newChurch.trim() && !newAdmin.trim())} className="btn btn-primary">
                        Save PINs
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <form
            className="card rise space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <p className="eyebrow">Add a branch</p>
            <label className="block space-y-1">
              <span className="eyebrow block">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_BRANCH_NAME} placeholder="e.g. CLC Lagos" className="field w-full" />
            </label>
            <div className="flex flex-wrap gap-2">
              <PinField label="Church PIN" value={churchPin} onChange={setChurchPin} placeholder="4 to 32 characters" />
              <PinField label="Admin PIN (optional)" value={adminPin} onChange={setAdminPin} placeholder="Without one, the church PIN can edit" />
            </div>
            <button disabled={busy || !name.trim() || !churchPin.trim()} className="btn btn-primary">
              Add branch
            </button>
          </form>
        </>
      )}
    </PageShell>
  );
}
