"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";

export type Tone = "ok" | "warn" | "err";
type ToastState = { text: string; tone: Tone; id: number };

/**
 * Puts text on the clipboard; true when it got there. Falls back to a hidden
 * textarea and execCommand for odd permission states. execCommand can throw
 * too, the textarea must never be left in the page, and selecting it takes
 * focus off the Copy button, so focus goes back where it was.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    try {
      document.body.appendChild(ta);
      ta.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      ta.remove();
      back?.focus();
    }
  }
}

/** One message at a time; a failure stays up longer, because it asks for something to be done. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const showToast = useCallback((text: string, tone: Tone = "ok") => {
    // A fresh id re-runs the entrance, so the same words copied twice still read as new.
    setToast((prev) => ({ text, tone, id: (prev?.id ?? 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), tone === "err" ? 6000 : 3500);
  }, []);
  return { toast, showToast };
}

const TONE: Record<Tone, { icon: IconName; chip: string; bar: string }> = {
  ok: { icon: "check", chip: "bg-ok-fg text-ok-bg", bar: "bg-ok-fg" },
  warn: { icon: "warn", chip: "bg-warn-bg text-warn-fg", bar: "bg-warn-fg" },
  err: { icon: "x", chip: "bg-bad-solid text-white", bar: "bg-bad-solid" },
};

/**
 * A lower third: the strip a broadcast lays across the bottom of the picture,
 * here saying what just happened and what to do next. Floating, not in the
 * flow: you're often scrolled to section 13 when this fires, and an inline
 * banner both sits off-screen and shoves the list down under the cursor.
 * pointer-events-none so it can never eat a click. It clears the phone's dock.
 *
 * Centred by a full-width flex row rather than `left-1/2` and a transform, so
 * it stays on screen even when something on the page overflows. Solid, not
 * translucent, for predictable contrast over whatever is scrolled beneath.
 *
 * The live region stays mounted: a screen reader announces changes inside
 * one, and reliably misses a region that appears with its text already there.
 */
export default function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(calc(var(--dock)+0.75rem),max(1.25rem,env(safe-area-inset-bottom)))] z-40 flex justify-center px-4 lg:pl-[17rem]">
      {toast && (
        <div key={toast.id} className="toast-in relative flex max-w-lg items-center gap-3 overflow-hidden rounded-[14px] border border-ink-600 bg-ink-900 py-2.5 pr-5 pl-2.5 text-[15px] text-ink-50 wrap-anywhere shadow-[var(--lift)]">
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${TONE[toast.tone].bar}`} />
          <span className={`pop ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONE[toast.tone].chip}`}>
            <Icon name={TONE[toast.tone].icon} className="h-3.5 w-3.5" />
          </span>
          <span className="font-ui font-medium">{toast.text}</span>
        </div>
      )}
    </div>
  );
}
