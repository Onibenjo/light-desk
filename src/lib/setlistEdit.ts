// What a setlist is allowed to be. Pure, so the routes stay thin and the rules
// live in exactly one place. Same convention as songEdit.ts: the parsed value
// on success, the message to show the operator on failure.

import { cleanParts } from "./messageEdit";

export interface SongItem {
  kind: "song";
  /** The song's row id. This is the reference; lyrics are always read live. */
  id: number;
  /** A cached label so the list can paint before the songbook has loaded. */
  title: string;
}

export interface MessageItem {
  kind: "message";
  /** The library message's row id. Its text is read live unless `parts` is set. */
  id: number;
  /** A cached "Section · Title" label, for the same reason as a song's. */
  title: string;
  /** Text edited for this service only. Present, it wins over the library's. */
  parts?: string[];
}

export type SetlistItem = SongItem | MessageItem;

/** Song 12 and message 12 are different things; this is what tells them apart. */
export function itemKey(item: { kind: "song" | "message"; id: number }): string {
  return `${item.kind}:${item.id}`;
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
export const MAX_NAME = 80;
const MAX_TITLE = 200;

const NAME_ERROR = `Give the service order a name of ${MAX_NAME} characters or fewer`;
const ITEM_ERROR = "A song or message in this service order couldn't be read — reload the page and add it again";
const NOTHING = "Nothing to save — change something first";

/** One line, trimmed. Null when there is nothing usable there. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= MAX_NAME ? name : null;
}

/** The items, deduplicated by kind and id keeping the first, or the message to show. */
function cleanItems(value: unknown): SetlistItem[] | string {
  if (!Array.isArray(value)) return ITEM_ERROR;
  const seen = new Set<string>();
  const items: SetlistItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return ITEM_ERROR;
    const { kind = "song", id, title, parts } = raw as { kind?: unknown; id?: unknown; title?: unknown; parts?: unknown };
    // No kind means a song: every setlist saved before messages existed looks like that.
    if (kind !== "song" && kind !== "message") return ITEM_ERROR;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return ITEM_ERROR;
    if (typeof title !== "string" || !title.trim()) return ITEM_ERROR;
    const key = itemKey({ kind, id });
    if (seen.has(key)) continue;
    seen.add(key);
    // Truncated rather than refused: it is only a cached label, and the live
    // title replaces it as soon as the songbook or library has loaded.
    const label = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
    if (kind === "song" || parts === undefined) {
      items.push({ kind, id, title: label });
      continue;
    }
    const edited = cleanParts(parts);
    if (typeof edited === "string") return `Text edited for this service: ${edited}`;
    items.push({ kind, id, title: label, parts: edited });
  }
  return items.length > MAX_ITEMS ? `A service order can have at most ${MAX_ITEMS} songs and messages — remove one to add another` : items;
}

export function parseSetlistCreate(body: unknown): SetlistCreate | string {
  if (typeof body !== "object" || body === null) return NAME_ERROR;
  const name = cleanName("name" in body ? body.name : undefined);
  return name === null ? NAME_ERROR : { name };
}

export function parseSetlistPatch(body: unknown): SetlistPatch | string {
  if (typeof body !== "object" || body === null) return NOTHING;
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
    if (typeof updatedAt !== "string" || !updatedAt) return "Couldn't tell which version of the service order you last read — reload the page and try again";
    patch.items = items;
    patch.updatedAt = updatedAt;
  }

  if ("active" in body && body.active !== undefined) {
    if (typeof body.active !== "boolean") return "Active must be true or false";
    patch.active = body.active;
  }

  return Object.keys(patch).length ? patch : NOTHING;
}

/**
 * Items as stored, trusted — they passed cleanItems on the way in. The one
 * repair is `kind`: rows written before messages existed have none, and every
 * one of those is a song. They are written back with it on the next change.
 */
export function storedItems(raw: unknown): SetlistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ("kind" in item ? item : { ...item, kind: "song" }) as SetlistItem);
}

/** Messages in `after` that were not already in `before`: the only ones the setlist rule applies to. */
export function addedMessageIds(before: SetlistItem[], after: SetlistItem[]): number[] {
  const had = new Set(before.filter((i) => i.kind === "message").map((i) => i.id));
  return after.filter((i) => i.kind === "message" && !had.has(i.id)).map((i) => i.id);
}

/**
 * Why one of these messages cannot be added, or null. An apology is posted when
 * the sound drops, not at a point in the order, so its section is out of service.
 */
export function refusedMessage(ids: number[], facts: Map<number, { inService: boolean; sectionName: string }>): string | null {
  for (const id of ids) {
    const fact = facts.get(id);
    if (!fact) return "That message is no longer in the library — reload the page";
    if (!fact.inService) return `${fact.sectionName} can't go in a service order`;
  }
  return null;
}
