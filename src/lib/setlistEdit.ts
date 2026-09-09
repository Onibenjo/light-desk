// What a setlist is allowed to be. Pure, so the routes stay thin and the rules
// live in exactly one place. Same convention as songEdit.ts: the parsed value
// on success, the message to show the operator on failure.

export interface SetlistItem {
  /** The song's row id. This is the reference; lyrics are always read live. */
  id: number;
  /** A cached label so the list can paint before the songbook has loaded. */
  title: string;
}

export interface SetlistCreate {
  name: string;
}

export interface SetlistPatch {
  name?: string;
  items?: SetlistItem[];
  active?: boolean;
  /** Sent with `items` only: the row's updatedAt as the client last read it. */
  updatedAt?: string;
}

export const MAX_ITEMS = 50;
const MAX_NAME = 80;
const MAX_TITLE = 200;

const NAME_ERROR = `A setlist needs a name of 1 to ${MAX_NAME} characters`;
const ITEM_ERROR = "Every song in a setlist needs an id and a title";

/** One line, trimmed. Null when there is nothing usable there. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= MAX_NAME ? name : null;
}

/** The songs, deduplicated by id keeping the first, or the message to show. */
function cleanItems(value: unknown): SetlistItem[] | string {
  if (!Array.isArray(value)) return ITEM_ERROR;
  const seen = new Set<number>();
  const items: SetlistItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return ITEM_ERROR;
    const { id, title } = raw as { id?: unknown; title?: unknown };
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return ITEM_ERROR;
    if (typeof title !== "string" || !title.trim()) return ITEM_ERROR;
    if (seen.has(id)) continue;
    seen.add(id);
    // Truncated rather than refused: it is only a cached label, and the live
    // title replaces it as soon as the songbook has loaded.
    items.push({ id, title: title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) });
  }
  return items.length > MAX_ITEMS ? `A setlist holds at most ${MAX_ITEMS} songs` : items;
}

export function parseSetlistCreate(body: unknown): SetlistCreate | string {
  if (typeof body !== "object" || body === null) return NAME_ERROR;
  const name = cleanName("name" in body ? body.name : undefined);
  return name === null ? NAME_ERROR : { name };
}

export function parseSetlistPatch(body: unknown): SetlistPatch | string {
  if (typeof body !== "object" || body === null) return "Nothing to change";
  const patch: SetlistPatch = {};

  if ("name" in body && body.name !== undefined) {
    const name = cleanName(body.name);
    if (name === null) return NAME_ERROR;
    patch.name = name;
  }

  if ("items" in body && body.items !== undefined) {
    const items = cleanItems(body.items);
    if (typeof items === "string") return items;
    // The whole array is replaced, so without knowing which version the client
    // started from, two people preparing at once lose each other's additions
    // with nothing to show for it.
    const updatedAt = "updatedAt" in body ? body.updatedAt : undefined;
    if (typeof updatedAt !== "string" || !updatedAt) return "Changing the songs needs the setlist you last read";
    patch.items = items;
    patch.updatedAt = updatedAt;
  }

  if ("active" in body && body.active !== undefined) {
    if (typeof body.active !== "boolean") return "Active is true or false";
    patch.active = body.active;
  }

  return Object.keys(patch).length ? patch : "Nothing to change";
}
