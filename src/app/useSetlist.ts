"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeFailure, failureFrom, OFFLINE, type Failure } from "@/lib/apiError";
import { itemKey, type SetlistItem } from "@/lib/setlistEdit";

export interface Setlist {
  id: number;
  name: string;
  items: SetlistItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * `created` names a setlist that now exists even though the whole job did not
 * finish, so a form can close instead of inviting a second, duplicate setlist.
 */
export type AddResult = "added" | "duplicate" | "failed" | { refused: string; created?: string };

/** Enough of a check that a proxy's 200 page is never taken for a setlist. */
function isSetlist(value: unknown): value is Setlist {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "number" && "name" in value && typeof value.name === "string" && "items" in value && Array.isArray(value.items) && "updatedAt" in value && typeof value.updatedAt === "string";
}

async function readSetlist(res: Response): Promise<Setlist | null> {
  const body: unknown = await res.json().catch(() => null);
  const setlist = typeof body === "object" && body !== null && "setlist" in body ? body.setlist : null;
  return isSetlist(setlist) ? setlist : null;
}

type Saved =
  | { kind: "saved"; setlist: Setlist }
  /** 409: someone else saved first; this is the setlist as it now stands. */
  | { kind: "stale"; setlist: Setlist }
  /** 404: deleted, most likely from another device. */
  | { kind: "gone" }
  | { kind: "failed"; failure: Failure };

const UNREADABLE = "Lightdesk sent back something it could not read — try again";
const NOT_SAVED = "Could not add to the setlist";

async function patch(id: number, body: unknown): Promise<Saved> {
  let res: Response;
  try {
    res = await fetch(`/api/setlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed", failure: OFFLINE };
  }
  if (res.status === 404) return { kind: "gone" };
  if (res.status === 409) {
    const current = await readSetlist(res.clone());
    return current ? { kind: "stale", setlist: current } : { kind: "failed", failure: await failureFrom(res, NOT_SAVED) };
  }
  if (!res.ok) return { kind: "failed", failure: await failureFrom(res, NOT_SAVED) };
  const saved = await readSetlist(res);
  return saved ? { kind: "saved", setlist: saved } : { kind: "failed", failure: describeFailure(res.status, null, UNREADABLE) };
}

/**
 * Adding one item did not happen. A 400 is the server's own sentence about the
 * item ("Apologies cannot go in a setlist") and stands alone; anything else is
 * about the connection or the device, so it is prefixed with what did not happen.
 */
export function notAdded(failure: Failure): AddResult {
  return { refused: failure.kind === "refused" ? failure.message : `Not added. ${failure.message}` };
}

/** Which step of starting a setlist failed, after which earlier steps succeeded. */
export type StartStep = "create" | "activate" | "add";

/**
 * Starting a setlist is three requests: create, make active, add the first
 * item. When a later one fails the earlier ones have still happened, so the
 * toast says what exists and where to finish, not just that something failed.
 */
export function notStarted({ step, name, title, failure }: { step: StartStep; name: string; title: string; failure: Failure }): AddResult {
  switch (step) {
    case "create":
      // Nothing exists yet. A 400 here is the name rule, already a full sentence.
      return { refused: failure.kind === "refused" ? failure.message : `Setlist not started. ${failure.message}` };
    case "activate":
      // Retrying from the desk would make a second setlist with the same name.
      return { refused: `${name} was created but is not active, and "${title}" is not in it. Finish it on the Setlists page.`, created: name };
    case "add":
      // It is active and on screen, so + works from here.
      return { refused: `Started ${name}, but "${title}" is not in it. ${failure.message}`, created: name };
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

/**
 * The active setlist, and adding a song to it.
 *
 * Kept out of SongsTab because that file is already long, and because the one
 * awkward part — a second person having changed the setlist between our read
 * and our write — is easier to see on its own.
 *
 * Every write resolves to an AddResult and never rejects: the venue wifi drops,
 * and a tap on + must always end in a toast.
 */
export function useSetlist() {
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  // A second tap on + while the first is still saving shares its answer
  // instead of racing it into a 409 and a contradictory "Already in" toast.
  const adding = useRef(new Map<string, Promise<AddResult>>());

  /**
   * Loads the active setlist. Someone else can prepare it — reorder it, edit a
   * message for the service — on another device or the /setlists page while
   * this desk sits open on Songs or Messages, so callers reload it on every
   * visit to either tab rather than trusting the one fetch from mount.
   */
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/setlists");
      // A 401 from an expired PIN parses cleanly; taking it would leave the
      // bar hidden, or stuck on stale data, for the rest of the service with
      // no way to notice — so a failure here just keeps whatever is showing.
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (typeof data !== "object" || data === null || !("setlists" in data) || !Array.isArray(data.setlists)) return;
      const all: unknown[] = data.setlists;
      setSetlist(all.filter(isSetlist).find((s) => s.active) ?? null);
    } catch {
      // Keep the current setlist. Search and browse are untouched, which is the point.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the setlist on mount is the effect's whole job, same as useMessages's initial load
    void reload();
  }, [reload]);

  const addItem = useCallback(
    (item: SetlistItem): Promise<AddResult> => {
      if (!setlist) return Promise.resolve("failed");
      const key = itemKey(item);
      if (setlist.items.some((i) => itemKey(i) === key)) return Promise.resolve("duplicate");
      const already = adding.current.get(key);
      if (already) return already;

      const run = async (): Promise<AddResult> => {
        // Two goes: ours, and one more on top of whatever the other person saved.
        let target = setlist;
        for (let attempt = 0; attempt < 2; attempt++) {
          const saved = await patch(target.id, { items: [...target.items, item], updatedAt: target.updatedAt });
          switch (saved.kind) {
            case "saved":
              setSetlist(saved.setlist);
              return "added";
            case "stale":
              // They may have added the very thing we are adding.
              setSetlist(saved.setlist);
              if (saved.setlist.items.some((i) => itemKey(i) === key)) return "duplicate";
              target = saved.setlist;
              continue;
            case "gone":
              // Deleted elsewhere. Reloading drops the bar (or shows whichever
              // setlist is active now), so the next + does the right thing.
              void reload();
              return { refused: `Not added — ${target.name} was deleted. Try adding it again.` };
            case "failed":
              return notAdded(saved.failure);
            default: {
              const exhaustive: never = saved;
              return exhaustive;
            }
          }
        }
        return notAdded(describeFailure(409, "Someone else is changing this setlist — try again"));
      };

      const pending = run().finally(() => adding.current.delete(key));
      adding.current.set(key, pending);
      return pending;
    },
    [setlist, reload],
  );

  /** Create a setlist, make it the active one, and put this item in it. */
  const startSetlist = useCallback(async (name: string, item: SetlistItem): Promise<AddResult> => {
    const title = item.title;
    let res: Response;
    try {
      res = await fetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch {
      return notStarted({ step: "create", name, title, failure: OFFLINE });
    }
    if (!res.ok) return notStarted({ step: "create", name, title, failure: await failureFrom(res) });
    const created = await readSetlist(res);
    // The server answered 200, so the setlist most likely exists; say so rather than inviting a duplicate.
    if (!created) return notStarted({ step: "activate", name, title, failure: describeFailure(res.status, null, UNREADABLE) });

    const activated = await patch(created.id, { active: true });
    if (activated.kind !== "saved") {
      const failure = activated.kind === "failed" ? activated.failure : describeFailure(activated.kind === "gone" ? 404 : 409);
      return notStarted({ step: "activate", name: created.name, title, failure });
    }

    setSetlist(activated.setlist);
    const added = await patch(activated.setlist.id, { items: [item], updatedAt: activated.setlist.updatedAt });
    if (added.kind === "saved") {
      setSetlist(added.setlist);
      return "added";
    }
    if (added.kind === "stale") setSetlist(added.setlist);
    const failure = added.kind === "failed" ? added.failure : describeFailure(added.kind === "gone" ? 404 : 409);
    return notStarted({ step: "add", name: created.name, title, failure });
  }, []);

  return { setlist, addItem, startSetlist, reload };
}

export type SetlistApi = ReturnType<typeof useSetlist>;

/** The toast for adding something to the setlist, the same from both tabs. */
export function addToast(result: AddResult, what: string, setlistName: string): { text: string; tone: "ok" | "warn" | "err" } {
  if (result === "added") return { text: `Added "${what}" to ${setlistName}`, tone: "ok" };
  if (result === "duplicate") return { text: "Already in the setlist", tone: "warn" };
  if (typeof result === "object") return { text: result.refused, tone: "err" };
  return { text: "Could not add to the setlist", tone: "err" };
}
