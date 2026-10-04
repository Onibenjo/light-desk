"use client";

import { useSyncExternalStore } from "react";

// One shared second-hand for every clock on the page.
const listeners = new Set<() => void>();
let timer: number | undefined;
let now = 0;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time, ticking once a second; null on the server, so hydration never disagrees with it. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now || Date.now(),
    () => null,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The booth's wall clock, in the one dot-matrix face on the desk: the log is
 * read by time, and the operator glances here to know where the service is.
 */
export default function LiveClock({ compact = false }: { compact?: boolean }) {
  const t = useNow();
  const d = t === null ? null : new Date(t);
  const h = d ? pad(d.getHours()) : "--";
  const m = d ? pad(d.getMinutes()) : "--";
  const s = d ? pad(d.getSeconds()) : "--";
  const day = d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase().replace(/,/g, "") : "";

  if (compact) {
    return (
      <time aria-hidden="true" className="flex items-center font-dot text-[18px] leading-none font-black tracking-wider text-ink-100 tabular-nums">
        {h}
        <Colon small />
        {m}
      </time>
    );
  }
  return (
    <div aria-hidden="true">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
        <span>Booth time</span>
        <span className="whitespace-nowrap text-ink-300">{day}</span>
      </div>
      <time className="mt-2 flex items-baseline font-dot leading-none font-black tracking-wide text-ink-50 tabular-nums">
        <span className="flex items-center text-[44px]">
          {h}
          <Colon />
          {m}
        </span>
        <span className="ml-1.5 text-[22px] text-accent-ink">{s}</span>
      </time>
    </div>
  );
}

/** Doto's own colon reads as a dagger at this size, so the clock draws two lamps that blink with the seconds. */
function Colon({ small = false }: { small?: boolean }) {
  const dot = small ? "h-[3px] w-[3px]" : "h-[5px] w-[5px]";
  return (
    <span className={`caret-blink flex flex-col justify-center ${small ? "mx-[3px] gap-[4px]" : "mx-1.5 gap-[9px]"}`}>
      <span className={`${dot} rounded-[1px] bg-current`} />
      <span className={`${dot} rounded-[1px] bg-current`} />
    </span>
  );
}
