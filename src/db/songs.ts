import type { SQL } from "drizzle-orm";
import { db } from "./index";
import { songs } from "./schema";
import type { SearchableSong } from "@/lib/songSearch";

/**
 * The songbook rows both search paths read, with sections parsed back out of
 * the JSON column. One place, so the two routes can't drift apart on what a
 * song is made of.
 */
export async function loadSongs(where?: SQL, limit?: number): Promise<SearchableSong[]> {
  let q = db
    .select({ id: songs.id, guid: songs.guid, title: songs.title, author: songs.author, sections: songs.sections, source: songs.source })
    .from(songs)
    .$dynamic();
  if (where) q = q.where(where);
  if (limit) q = q.limit(limit);
  return (await q).map((r) => ({ ...r, sections: JSON.parse(r.sections) as string[] }));
}
