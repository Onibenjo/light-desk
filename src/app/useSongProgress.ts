"use client";

import { useCallback, useState } from "react";

export type SongProgress = ReturnType<typeof useSongProgress>;

const NONE: ReadonlySet<number> = new Set();

/**
 * Which sections of each song have been copied during this page session, by
 * songKey. Owned by the desk rather than the Songs tab, which unmounts when
 * another tab is shown: going back to the list, or to Messages for the
 * offering, used to wipe a half-sung song's ticks and send the cursor back to
 * section 1. Like the message ticks, it is never shared or saved.
 */
export function useSongProgress() {
  const [progress, setProgress] = useState<ReadonlyMap<string, ReadonlySet<number>>>(new Map());

  const sentFor = useCallback((key: string) => progress.get(key) ?? NONE, [progress]);

  const markSent = useCallback((key: string, index: number) => {
    setProgress((prev) => {
      if (prev.get(key)?.has(index)) return prev;
      const next = new Map(prev);
      next.set(key, new Set(prev.get(key)).add(index));
      return next;
    });
  }, []);

  /** After an edit the sections are renumbered, so the old ticks would point at the wrong text. */
  const forget = useCallback((key: string) => {
    setProgress((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return { progress, sentFor, markSent, forget };
}
