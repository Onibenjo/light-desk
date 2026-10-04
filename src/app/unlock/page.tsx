"use client";

import { FormEvent, Suspense, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "../Icon";
import { failureFrom, OFFLINE } from "@/lib/apiError";

const ERROR_ID = "unlock-error";
const FIELD_ID = "unlock-pin";
const WRONG_PIN = "Wrong PIN — check it and try again";

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
      message = res.status === 401 ? WRONG_PIN : (await failureFrom(res, WRONG_PIN)).message;
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
    <form onSubmit={submit} className="rise relative w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-5 text-center">
        {/* The mark, lit from behind like a lamp warming up. */}
        <span className="relative grid place-items-center">
          <span aria-hidden="true" className="absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,var(--accent-glow),transparent_65%)] opacity-60 blur-xl" />
          <span aria-hidden="true" className="absolute h-[5.5rem] w-[5.5rem] rounded-full border border-accent/30" />
          <span aria-hidden="true" className="absolute h-[7.5rem] w-[7.5rem] rounded-full border border-accent/10" />
          <Image src="/brand/clc-logo.png" alt="" width={64} height={64} priority className="relative h-16 w-16 shrink-0 rounded-full" />
        </span>
        <div>
          <h1 className="display text-[52px]">Lightdesk</h1>
          <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-ink-400 uppercase">Citizens of Light Church · Mixlr chat desk</p>
        </div>
      </div>
      <div className="card space-y-2 p-5">
        <label htmlFor={FIELD_ID} className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="tally tally-off" />
          Church or admin PIN
        </label>
        <input
          id={FIELD_ID}
          ref={field}
          autoFocus
          inputMode="numeric"
          type="password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="field w-full py-3 text-center font-mono text-2xl tracking-[0.5em] aria-invalid:border-bad-line"
        />
        {error && (
          <p id={ERROR_ID} role="alert" className="flex items-center gap-1.5 text-sm text-bad-fg">
            <Icon name="warn" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <button disabled={busy || !pin} className="btn btn-primary btn-lg mt-2 w-full">
          {busy ? "Checking the PIN…" : "Unlock this device"}
        </button>
      </div>
      <p className="text-center text-xs text-[var(--muted)]">Ask the media lead for the PIN. This device stays unlocked for a year.</p>
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
