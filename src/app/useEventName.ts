"use client";

import { useEffect, useState } from "react";

export interface EventName {
  title: string;
  /** On air now, rather than scheduled. */
  live: boolean;
}

function isAnswer(v: unknown): v is { title: string | null; live: boolean } {
  return typeof v === "object" && v !== null && "title" in v && (typeof v.title === "string" || v.title === null) && "live" in v && typeof v.live === "boolean";
}

/**
 * The Mixlr event a new service order can be named after (on air now, or the
 * next one scheduled), looked up once when the form opens. Null while asking
 * and whenever there is none: the offer is simply not shown, never an error,
 * since naming by hand still works.
 */
export function useEventName(): EventName | null {
  const [found, setFound] = useState<EventName | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/attendance/event-name", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!cancelled && isAnswer(body) && body.title) setFound({ title: body.title, live: body.live });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return found;
}

/** The button's hover text: where the title comes from. */
export function eventNameHint(found: EventName): string {
  return `${found.live ? "On air now on Mixlr" : "Next on Mixlr"}: ${found.title}`;
}
