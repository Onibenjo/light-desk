"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, type Failure } from "@/lib/apiError";
import { isLibrary, type Library } from "@/lib/messageLibrary";

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
    const result = await getJson("/api/messages", isLibrary);
    if (request !== latest.current) return;
    if (result.ok) {
      setLibrary(result.data);
      setFailed(null);
    } else setFailed(result.failure);
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
