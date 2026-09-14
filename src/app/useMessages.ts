"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeFailure, failureFrom, OFFLINE, type Failure } from "@/lib/apiError";
import type { Library } from "@/lib/messageLibrary";

/** Enough to tell the library from a proxy's page or someone else's JSON. */
function isLibrary(value: unknown): value is Library {
  return typeof value === "object" && value !== null && "sections" in value && Array.isArray(value.sections) && "messages" in value && Array.isArray(value.messages);
}

/**
 * The library, fetched once when the desk opens: the palette needs it on any
 * tab, and it is a few dozen rows. A failure leaves `library` null and
 * `failed` holding what went wrong, so the Messages tab can say whether Retry
 * will help (a dropped connection) or the device needs the PIN again, and
 * nothing else breaks.
 */
export function useMessages() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  // Only the latest request may land, so a slow first load cannot undo a Retry.
  const latest = useRef(0);

  const fetchLibrary = useCallback(async () => {
    const request = ++latest.current;
    let failure: Failure | null = null;
    let loaded: Library | null = null;
    try {
      const res = await fetch("/api/messages");
      // A 401 from an expired PIN parses cleanly; taking it would show an empty library.
      if (!res.ok) failure = await failureFrom(res);
      else {
        const body: unknown = await res.json().catch(() => null);
        if (isLibrary(body)) loaded = body;
        else failure = describeFailure(502);
      }
    } catch {
      failure = OFFLINE;
    }
    if (request !== latest.current) return;
    if (loaded) {
      setLibrary(loaded);
      setFailed(null);
    } else setFailed(failure);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the library on mount is the effect's whole job, same as useSetlist's initial load
    void fetchLibrary();
  }, [fetchLibrary]);

  const reload = useCallback(() => {
    setFailed(null);
    void fetchLibrary();
  }, [fetchLibrary]);

  return { library, failed, reload };
}
