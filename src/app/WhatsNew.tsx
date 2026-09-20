"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WHATS_NEW } from "@/lib/whatsNew";

const STORAGE_KEY = "ld_whatsnew_dismissed";

/**
 * One quiet line above the tab bar, named in the operator's own job terms —
 * not a warning, so it never borrows the amber/red the desk reserves for text
 * that might be wrong. Nothing renders until after mount: the server can't
 * know what's in localStorage, so rendering the note (or its absence) from
 * server state would flash or mismatch on hydration. A silent operator on a
 * device that has already dismissed this note, or has none to show, just
 * never sees the second render either.
 */
export default function WhatsNew() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading storage after mount is the effect's whole job; see the comment above
      if (localStorage.getItem(STORAGE_KEY) !== WHATS_NEW.id) setVisible(true);
    } catch {
      // No storage to check and none to remember a dismissal in — leave it unshown.
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, WHATS_NEW.id);
    } catch {
      // Nowhere to remember it. The note still closes for this session rather than refusing to go.
    }
  }

  return (
    // The row must not wrap: with justify-between, a full-width line of text pushes
    // Dismiss onto a line of its own where it reads as a stray control, and a one-line
    // note becomes three at the top of a screen that is working during a service.
    <p className="flex items-start justify-between gap-x-3 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm text-ink-300">
      <span className="min-w-0 flex-1">
        {WHATS_NEW.text}
        {WHATS_NEW.href && WHATS_NEW.linkLabel && (
          <>
            {" "}
            <Link href={WHATS_NEW.href} className="font-medium text-ink-100 underline underline-offset-2 hover:text-ink-50">
              {WHATS_NEW.linkLabel}
            </Link>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this note"
        className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-ink-800 hover:text-ink-200 pointer-coarse:min-h-11"
      >
        Dismiss
      </button>
    </p>
  );
}
