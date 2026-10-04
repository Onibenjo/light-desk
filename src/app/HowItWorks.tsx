"use client";

import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import { hasFinePointer } from "@/lib/pointer";

export const HOW_IT_WORKS_ID = "how-it-works";

/** What each tab holds, keyed by the tab's id so the labels stay the desk's own. */
const WHAT_IS_IN: Record<string, string> = {
  verses: "the verse the pastor just quoted",
  songs: "a song from the songbook, one section at a time",
  messages: "greetings, prayers, notices and apologies",
};

/**
 * The first thing a volunteer new to the rota sees, and the thing they can
 * open again from the header for as long as they need it.
 *
 * It answers the one question the desk never answered on screen: pressing
 * Enter looks copied-nothing from the outside, because the result of this app
 * lands on the clipboard and the work finishes in another window. So the three
 * steps end in Mixlr, not here.
 *
 * Why a panel in the page and not a tour: the church laptop is shared down a
 * rota, so a modal that each person dismisses forever would greet the fourth
 * volunteer with nothing at all. This opens itself on a device that has not
 * seen it, closes to a single header button, and never traps anyone behind an
 * overlay.
 *
 * The steps split by pointer rather than naming both devices in one sentence:
 * a phone has no Enter and no Alt-Tab, and a line that hedges for both reads
 * as instructions for neither. The split is made here rather than with the
 * `pointer-fine:` classes the hints under the search box use, because those
 * leave both wordings in the markup and CSS hides one — which a screen reader
 * does not do, so step 2 would be read out as "Choose Go Press Enter — the
 * verse is copied". Reading the media query while rendering is safe in this
 * one component: it is closed on the server and on the first client render
 * (see useFirstRun), so there is no markup to mismatch.
 */
export default function HowItWorks({
  open,
  tabs,
  onClose,
}: {
  open: boolean;
  tabs: readonly { id: string; icon: IconName; label: string }[];
  onClose: () => void;
}) {
  if (!open) return null;
  const keyboard = hasFinePointer();

  return (
    <section id={HOW_IT_WORKS_ID} aria-labelledby={`${HOW_IT_WORKS_ID}-heading`} className="rise card overflow-hidden">
      <div className="flex items-start justify-between gap-x-3 px-5 pt-5">
        <div>
          <p className="eyebrow">How the desk works</p>
          <h2 id={`${HOW_IT_WORKS_ID}-heading`} className="display mt-2 text-[32px] sm:text-[42px]">
            Three moves, <span className="text-accent-ink">then it&rsquo;s in the chat.</span>
          </h2>
        </div>
        {/* Quiet, not primary: reading this is the action on screen, closing it is not. */}
        <button type="button" onClick={onClose} className="btn btn-sm btn-quiet -mr-2 shrink-0">
          Close
        </button>
      </div>

      <ol className="grid gap-2 p-5 sm:grid-cols-3">
        <Step n={1}>
          Type a reference the way you&rsquo;d say it — <span className="whitespace-nowrap font-mono text-[13px] text-ink-100">rom 8 28</span>, <span className="whitespace-nowrap font-mono text-[13px] text-ink-100">ps 23</span>, or
          describe the verse.
        </Step>
        <Step n={2}>
          {keyboard ? (
            <>
              Press <span className="kbd">Enter</span>
            </>
          ) : (
            "Choose Go"
          )}{" "}
          — the verse is copied, formatted the way the chat posts it.
        </Step>
        <Step n={3}>
          Paste in Mixlr
          {keyboard && (
            <>
              {" "}
              — <span className="whitespace-nowrap"><span className="kbd">Alt</span>+<span className="kbd">Tab</span></span>, then <span className="whitespace-nowrap"><span className="kbd">Ctrl</span>+<span className="kbd">V</span></span> and <span className="kbd">Enter</span>
            </>
          )}
          .
        </Step>
      </ol>

      <div className="grid gap-x-6 gap-y-4 border-t border-ink-700 bg-ink-950/40 px-5 py-4 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="eyebrow mb-2.5">What each tab holds</h3>
          <ul className="space-y-2">
            {tabs.map((t) =>
              WHAT_IS_IN[t.id] ? (
                <li key={t.id} className="flex items-center gap-3 text-sm text-ink-300">
                  {/* Neutral: the accent marks the tab you are on, so it cannot also mark all three here. */}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-ink-700 bg-ink-900 text-ink-300">
                    <Icon name={t.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-ui font-semibold text-ink-100">{t.label}</span> — {WHAT_IS_IN[t.id]}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          A{" "}
          <Link href="/setlists" className="link">
            service order
          </Link>{" "}
          prepared beforehand waits at the top of Songs and Engagement. Everything you copy is kept in the{" "}
          <Link href="/log" className="link">
            Log
          </Link>
          , so nothing is lost.
          {keyboard && (
            <>
              {" "}
              Press <span className="kbd">?</span> for every key.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/** A numbered step card. The numeral is set large in the dot-matrix face: reading order carries the sequence, colour is not asked to. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ "--i": n } as React.CSSProperties} className="rise relative overflow-hidden rounded-xl border border-ink-700 bg-ink-950/40 p-4 shadow-[var(--bevel)]">
      <span aria-hidden="true" className="flex items-center gap-2 font-dot text-[40px] leading-none font-black text-ink-500">
        {String(n).padStart(2, "0")}
      </span>
      <span className="mt-3 block text-[15px] leading-relaxed text-ink-200">{children}</span>
    </li>
  );
}
