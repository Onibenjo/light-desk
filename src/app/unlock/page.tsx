"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function UnlockForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Wrong PIN");
      return;
    }
    router.replace(params.get("next") || "/");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lightdesk</h1>
        <p className="text-sm text-zinc-400">Citizens of Light Church · Mixlr chat desk</p>
      </div>
      <input
        autoFocus
        inputMode="numeric"
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Church PIN"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg outline-none focus:border-[var(--accent)]"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy || !pin} className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-medium text-black disabled:opacity-50">
        {busy ? "Checking…" : "Unlock this laptop"}
      </button>
      <p className="text-xs text-zinc-500">You only do this once per device. Ask the media lead for the PIN.</p>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <UnlockForm />
      </Suspense>
    </main>
  );
}
