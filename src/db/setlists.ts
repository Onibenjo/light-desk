import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "./index";
import { setlists } from "./schema";
import type { SetlistItem, SetlistPatch } from "@/lib/setlistEdit";

/**
 * A setlist as it goes over the wire. Timestamps are ISO strings rather than
 * Dates because `updatedAt` is round-tripped by the client as the version it
 * last read, and JSON has no date type to round-trip through.
 */
export interface SetlistRecord {
  id: number;
  name: string;
  items: SetlistItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = { id: number; name: string; items: string; active: boolean; createdAt: Date; updatedAt: Date };

/** One shape for a setlist, so the routes cannot drift apart on what one is. */
function toRecord(row: Row): SetlistRecord {
  return {
    id: row.id,
    name: row.name,
    items: JSON.parse(row.items) as SetlistItem[],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Newest first: the one you are about to use is the one you just made. */
export async function loadSetlists(): Promise<SetlistRecord[]> {
  const rows = await db.select().from(setlists).orderBy(desc(setlists.createdAt));
  return rows.map(toRecord);
}

export async function findSetlist(id: number): Promise<SetlistRecord | null> {
  const [row] = await db.select().from(setlists).where(eq(setlists.id, id));
  return row ? toRecord(row) : null;
}

/** Created empty and inactive; activating is a separate, deliberate decision. */
export async function createSetlist(name: string): Promise<SetlistRecord> {
  const now = new Date();
  const [row] = await db
    .insert(setlists)
    .values({ name, items: "[]", active: false, createdAt: now, updatedAt: now })
    .returning();
  return toRecord(row);
}

/**
 * Apply a change. "gone" if the setlist is not there; "stale" if the client's
 * songs were built on a version someone else has since replaced.
 *
 * Activating clears the old active row first and does it in one batch. The
 * order is not optional: `setlists_one_active` is a unique index, so setting a
 * second active row before clearing the first is rejected. A batch is used
 * rather than an interactive transaction because libsql runs a batch inside an
 * implicit transaction over plain HTTP, which is how Turso is reached in
 * production.
 *
 * The upfront `findSetlist` comparison is only a fast path — it answers "gone"
 * and catches the common "stale" case without a wasted write, but two PATCHes
 * built on the same version could both pass it before either commits. What
 * makes the guard atomic is folding `updatedAt = :expected` into the WHERE of
 * the write itself: only the first of two racing writes can match a row still
 * at that version, so at most one `.returning()` comes back non-empty. On the
 * batch path a lost race leaves the old active row cleared and the new one
 * still at its old version, unset — no setlist ends up active. That loses no
 * songs (the caller gets "stale" back and re-applies against the current row)
 * and is the only reachable outcome when a client sends `items` and `active`
 * together and loses the race, since the two statements in one batch cannot be
 * made conditional on each other.
 */
export async function updateSetlist(id: number, patch: SetlistPatch): Promise<SetlistRecord | "gone" | "stale"> {
  const current = await findSetlist(id);
  if (!current) return "gone";
  if (patch.items && current.updatedAt !== patch.updatedAt) return "stale";

  const values: { updatedAt: Date; name?: string; items?: string; active?: boolean } = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.items !== undefined) values.items = JSON.stringify(patch.items);

  // Only a write that replaces `items` needs the version guard: it is the one
  // case where silently applying a stale write discards someone else's songs.
  const expectedVersion = patch.items !== undefined ? new Date(patch.updatedAt as string) : null;
  const rowMatch = expectedVersion
    ? and(eq(setlists.id, id), eq(setlists.updatedAt, expectedVersion))
    : eq(setlists.id, id);

  let matched: { id: number }[];
  if (patch.active === true) {
    const results = await db.batch([
      db.update(setlists).set({ active: false }).where(and(eq(setlists.active, true), ne(setlists.id, id))),
      db
        .update(setlists)
        .set({ ...values, active: true })
        .where(rowMatch)
        .returning({ id: setlists.id }),
    ]);
    matched = results[1];
  } else {
    if (patch.active === false) values.active = false;
    matched = await db.update(setlists).set(values).where(rowMatch).returning({ id: setlists.id });
  }

  if (expectedVersion && matched.length === 0) return "stale";

  const saved = await findSetlist(id);
  return saved ?? "gone";
}

export async function deleteSetlist(id: number): Promise<boolean> {
  const [row] = await db.delete(setlists).where(eq(setlists.id, id)).returning({ id: setlists.id });
  return !!row;
}
