"use client";

import { useCallback, useEffect, useState } from "react";
import { itemKey, type SetlistItem } from "@/lib/setlistEdit";

export interface Setlist {
  id: number;
  name: string;
  items: SetlistItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AddResult = "added" | "duplicate" | "failed" | { refused: string };

async function patch(id: number, body: unknown): Promise<{ status: number; setlist?: Setlist; error?: string }> {
  const res = await fetch(`/api/setlists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { setlist?: Setlist; error?: string } | null;
  return { status: res.status, setlist: data?.setlist, error: data?.error };
}

/**
 * The active setlist, and adding a song to it.
 *
 * Kept out of SongsTab because that file is already long, and because the one
 * awkward part — a second person having changed the setlist between our read
 * and our write — is easier to see on its own.
 */
export function useSetlist() {
  const [setlist, setSetlist] = useState<Setlist | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/setlists");
        // A 401 from an expired PIN parses cleanly; taking it would leave the
        // bar hidden for the rest of the service with no way to notice.
        if (!res.ok) return;
        const data = (await res.json()) as { setlists?: Setlist[] };
        if (live) setSetlist(data.setlists?.find((s) => s.active) ?? null);
      } catch {
        // No bar. Search and browse are untouched, which is the point.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const addItem = useCallback(
    async (item: SetlistItem): Promise<AddResult> => {
      if (!setlist) return "failed";
      const key = itemKey(item);
      if (setlist.items.some((i) => itemKey(i) === key)) return "duplicate";

      // Two goes: ours, and one more on top of whatever the other person saved.
      let target = setlist;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { status, setlist: saved, error } = await patch(target.id, {
          items: [...target.items, item],
          updatedAt: target.updatedAt,
        });
        if (status === 200 && saved) {
          setSetlist(saved);
          return "added";
        }
        if (status === 409 && saved) {
          // They may have added the very thing we are adding.
          if (saved.items.some((i) => itemKey(i) === key)) {
            setSetlist(saved);
            return "duplicate";
          }
          target = saved;
          continue;
        }
        if (status === 400 && error) return { refused: error };
        return "failed";
      }
      return "failed";
    },
    [setlist],
  );

  /** Create a setlist, make it the active one, and put this item in it. */
  const startSetlist = useCallback(async (name: string, item: SetlistItem): Promise<AddResult> => {
    const res = await fetch("/api/setlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return "failed";
    const { setlist: created } = (await res.json()) as { setlist: Setlist };

    const activated = await patch(created.id, { active: true });
    if (!activated.setlist) return "failed";

    const added = await patch(activated.setlist.id, { items: [item], updatedAt: activated.setlist.updatedAt });
    if (added.status === 400 && added.error) {
      setSetlist(activated.setlist);
      return { refused: added.error };
    }
    if (!added.setlist) return "failed";

    setSetlist(added.setlist);
    return "added";
  }, []);

  return { setlist, addItem, startSetlist };
}

export type SetlistApi = ReturnType<typeof useSetlist>;

/** The toast for adding something to the setlist, the same from both tabs. */
export function addToast(result: AddResult, what: string, setlistName: string): { text: string; tone: "ok" | "warn" | "err" } {
  if (result === "added") return { text: `Added "${what}" to ${setlistName}`, tone: "ok" };
  if (result === "duplicate") return { text: "Already in the setlist", tone: "warn" };
  if (typeof result === "object") return { text: result.refused, tone: "err" };
  return { text: "Could not add to the setlist", tone: "err" };
}
