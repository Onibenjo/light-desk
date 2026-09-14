"use client";

import { useCallback, useEffect, useState } from "react";
import type { Library } from "@/lib/messageLibrary";

/**
 * The library, fetched once when the desk opens: the palette needs it on any
 * tab, and it is a few dozen rows. A failure leaves `library` null and
 * `failed` set, so the Messages tab can offer Retry and nothing else breaks.
 */
export function useMessages() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      // A 401 from an expired PIN parses cleanly; taking it would show an empty library.
      if (!res.ok) return setFailed(true);
      setLibrary((await res.json()) as Library);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the library on mount is the effect's whole job, same as useSetlist's initial load
    void fetchLibrary();
  }, [fetchLibrary]);

  const reload = useCallback(() => {
    setFailed(false);
    void fetchLibrary();
  }, [fetchLibrary]);

  return { library, failed, reload };
}
