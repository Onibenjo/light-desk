"use client";

import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { failureFrom, OFFLINE } from "@/lib/apiError";

const ERROR_ID = "unlock-error";

/** Only a path on this site: `next=//evil.example` or a full URL would send the operator elsewhere. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function UnlockForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State lands a render late; a second Enter in that gap must not send the PIN twice.
  const inFlight = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !pin) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let message: string;
    try {
      const res = await fetch("/api/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      if (res.ok) {
        // Stays busy while the next page loads, so the button cannot be pressed again.
        router.replace(safeNext(params.get("next")));
        return;
      }
      // Here, and only here, a 401 is the answer to the PIN itself rather than the gate.
      message = res.status === 401 ? "Wrong PIN" : (await failureFrom(res, "Wrong PIN")).message;
    } catch {
      message = OFFLINE.message;
    }
    inFlight.current = false;
    setBusy(false);
    setError(message);
    // Clicking the button left focus on it; put it back where the next attempt is typed.
    field.current?.focus();
    field.current?.select();
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lightdesk</h1>
        <p className="text-sm text-zinc-400">Citizens of Light Church · Mixlr chat desk</p>
      </div>
      <input
        ref={field}
        autoFocus
        inputMode="numeric"
        type="password"
        aria-label="Church PIN"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ERROR_ID : undefined}
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Church PIN"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg outline-none focus:border-[var(--accent)] aria-invalid:border-red-500/60"
      />
      {error && (
        <p id={ERROR_ID} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button disabled={busy || !pin} className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-medium text-black disabled:opacity-50">
        {busy ? "Checking…" : "Unlock this laptop"}
      </button>
      <p className="text-xs text-[var(--muted)]">You only do this once per device. Ask the media lead for the PIN.</p>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <Suspense>
        <UnlockForm />
      </Suspense>
    </main>
  );
}
