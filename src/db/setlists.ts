import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { setlists } from "./schema";
import type { SetlistItem } from "@/lib/setlistEdit";

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
