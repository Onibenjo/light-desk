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
    <form onSubmit={submit} className="rise card w-full max-w-sm space-y-5 p-6 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/brand/clc-logo.png" alt="" width={56} height={56} priority className="h-14 w-14 shrink-0 rounded-full" />
        <div>
          <h1 className="display text-[40px]">Lightdesk</h1>
          <p className="mt-1 text-sm text-ink-400">Citizens of Light Church · Mixlr chat desk</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={FIELD_ID} className="block text-sm text-ink-300">
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
          className="field w-full text-lg aria-invalid:border-bad-line"
        />
        {error && (
          <p id={ERROR_ID} role="alert" className="flex items-center gap-1.5 text-sm text-bad-fg">
            <Icon name="warn" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
      <button disabled={busy || !pin} className="btn btn-primary btn-lg w-full">
        {busy ? "Checking the PIN…" : "Unlock this device"}
      </button>
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
