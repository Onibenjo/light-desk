"use client";

import { useEffect, useState } from "react";

/**
 * A panel that opens itself until this device says it has been seen, and can
 * always be opened again by hand.
 *
 * `noteId` works the way WhatsNew's does: the id of the version that was
 * closed is stored, not a boolean, so rewriting the panel and giving it a new
 * id shows it again to everyone. Closing counts as seen — including closing it
 * from the header — because the next open is then a deliberate press rather
 * than first run.
 *
 * Nothing opens until after mount. The server cannot know what is in
 * localStorage, so deciding this from server state would either flash the
 * panel at an operator who closed it or mismatch on hydration.
 */
export function useFirstRun(storageKey: string, noteId: string) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading storage after mount is the effect's whole job; see the comment above
      if (localStorage.getItem(storageKey) !== noteId) setOpen(true);
    } catch {
      // No storage to read, and none to remember a dismissal in — leave it closed.
    }
  }, [storageKey, noteId]);

  function toggle() {
    // Written before the state change rather than inside the updater: React
    // calls an updater twice in development, and a setter is not the place for
    // a side effect.
    if (open) {
      try {
        localStorage.setItem(storageKey, noteId);
      } catch {
        // Nowhere to remember it. It still closes for this session rather than refusing to go.
      }
    }
    setOpen(!open);
  }

  return [open, toggle] as const;
}
