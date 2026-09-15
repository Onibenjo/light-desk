/**
 * What to tell the operator when a request to Lightdesk's own API fails.
 *
 * Every route answers a failure with `{ error: string }`, and most of those
 * sentences are already written for the operator ("Admin PIN required to
 * import", "Slow down — too many searches."), so they are kept. What this adds
 * is the cases where the server has nothing useful to say: the PIN gate's bare
 * `locked` (sent by every route once the PIN changes or the cookie is gone), a
 * proxy's HTML error page, and fetch throwing because the venue wifi dropped.
 */

export type FailureKind = "locked" | "denied" | "limited" | "conflict" | "refused" | "server" | "offline" | "unknown";

export interface Failure {
  kind: FailureKind;
  message: string;
}

const LOCKED = "This device is locked — enter the church PIN again";

/** fetch() threw: nothing reached the server, so there is no status to read. */
export const OFFLINE: Failure = {
  kind: "offline",
  message: "Could not reach Lightdesk — check the connection and try again",
};

function sentence(error: unknown): string | null {
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

export function describeFailure(status: number, error?: string | null, fallback = "That did not work — try again"): Failure {
  const said = sentence(error);
  // The gate's 401 body is the single word "locked"; it is never worth showing.
  if (status === 401) return { kind: "locked", message: LOCKED };
  if (status === 403) return { kind: "denied", message: said ?? "Admin PIN required for that" };
  if (status === 429) return { kind: "limited", message: said ?? "Too many requests — wait a few seconds and try again" };
  if (status === 409) return { kind: "conflict", message: said ?? "Someone else changed this first — reload and try again" };
  if (status >= 500) return { kind: "server", message: said ?? "Lightdesk had a problem on its side — try again" };
  if (status >= 400) return { kind: "refused", message: said ?? fallback };
  return { kind: "unknown", message: said ?? fallback };
}

/** Reads a failed response's `{ error }` without trusting that the body is JSON. */
export async function failureFrom(res: Response, fallback?: string): Promise<Failure> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return describeFailure(res.status, sentence(body?.error), fallback);
}

/** Where to send a locked device: the unlock screen, then back to this page. */
export function unlockHref(next: string): string {
  return `/unlock?next=${encodeURIComponent(next)}`;
}
