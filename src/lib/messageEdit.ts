// What the message library is allowed to hold. Pure, so the routes stay thin
// and the editor, the seed and the setlist's edited text all apply exactly the
// same rules. Same convention as songEdit.ts: the parsed value on success, the
// message to show the operator on failure.

import { splitOnBlankLines } from "./songSections";

export const MAX_SECTION_NAME = 80;
export const MAX_MESSAGE_TITLE = 120;
export const MAX_PARTS = 20;
export const MAX_PART_CHARS = 4000;

export interface SectionCreate {
  name: string;
  inService: boolean;
}

export interface SectionPatch {
  name?: string;
  inService?: boolean;
  /** Swap with the section above (-1) or below (1). */
  move?: -1 | 1;
}

export interface MessageCreate {
  sectionId: number;
  title: string;
  parts: string[];
}

export interface MessagePatch {
  sectionId?: number;
  title?: string;
  parts?: string[];
  /** Swap with the message above (-1) or below (1) in its section. */
  move?: -1 | 1;
}

const NAME_ERROR = `A section needs a name of 1 to ${MAX_SECTION_NAME} characters`;
const TITLE_ERROR = `A message needs a title of 1 to ${MAX_MESSAGE_TITLE} characters`;
const TEXT_ERROR = "A message needs some text";
const COUNT_ERROR = `A message holds at most ${MAX_PARTS} parts`;
const LENGTH_ERROR = `A part can be at most ${MAX_PART_CHARS} characters`;
const SECTION_ERROR = "Pick a section for the message";
const FLAG_ERROR = "In service is true or false";
const MOVE_ERROR = "Move is -1 or 1";
const NOTHING = "Nothing to change";

function oneLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

export function cleanSectionName(value: unknown): string | null {
  return oneLine(value, MAX_SECTION_NAME);
}

export function cleanTitle(value: unknown): string | null {
  return oneLine(value, MAX_MESSAGE_TITLE);
}

/** Parts that arrive already split — a setlist item's edited text does. Blank parts are dropped. */
export function cleanParts(value: unknown): string[] | string {
  if (!Array.isArray(value)) return TEXT_ERROR;
  const parts: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return TEXT_ERROR;
    const part = raw.trim();
    if (!part) continue;
    if (part.length > MAX_PART_CHARS) return LENGTH_ERROR;
    parts.push(part);
  }
  if (!parts.length) return TEXT_ERROR;
  return parts.length > MAX_PARTS ? COUNT_ERROR : parts;
}

/** The editor's textarea: a blank line starts a new part, as in the song editor. */
export function partsFromText(value: unknown): string[] | string {
  if (typeof value !== "string") return TEXT_ERROR;
  return cleanParts(splitOnBlankLines(value));
}

export function textFromParts(parts: string[]): string {
  return parts.join("\n\n");
}

/** Indexes of parts long enough that Mixlr may cut them. A warning, never a rule. */
export function longParts(parts: string[], limit: number): number[] {
  return parts.flatMap((part, i) => (part.length > limit ? [i] : []));
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function has(body: object, key: string): boolean {
  return key in body && (body as Record<string, unknown>)[key] !== undefined;
}

export function parseSectionCreate(body: unknown): SectionCreate | string {
  if (typeof body !== "object" || body === null) return NAME_ERROR;
  const b = body as Record<string, unknown>;
  const name = cleanSectionName(b.name);
  if (name === null) return NAME_ERROR;
  if (b.inService !== undefined && typeof b.inService !== "boolean") return FLAG_ERROR;
  return { name, inService: typeof b.inService === "boolean" ? b.inService : true };
}

export function parseSectionPatch(body: unknown): SectionPatch | string {
  if (typeof body !== "object" || body === null) return NOTHING;
  const b = body as Record<string, unknown>;
  const patch: SectionPatch = {};
  if (has(body, "name")) {
    const name = cleanSectionName(b.name);
    if (name === null) return NAME_ERROR;
    patch.name = name;
  }
  if (has(body, "inService")) {
    if (typeof b.inService !== "boolean") return FLAG_ERROR;
    patch.inService = b.inService;
  }
  if (has(body, "move")) {
    if (b.move !== -1 && b.move !== 1) return MOVE_ERROR;
    patch.move = b.move === -1 ? -1 : 1;
  }
  return Object.keys(patch).length ? patch : NOTHING;
}

export function parseMessageCreate(body: unknown): MessageCreate | string {
  if (typeof body !== "object" || body === null) return SECTION_ERROR;
  const b = body as Record<string, unknown>;
  const sectionId = positiveId(b.sectionId);
  if (sectionId === null) return SECTION_ERROR;
  const title = cleanTitle(b.title);
  if (title === null) return TITLE_ERROR;
  const parts = partsFromText(b.text);
  if (typeof parts === "string") return parts;
  return { sectionId, title, parts };
}

export function parseMessagePatch(body: unknown): MessagePatch | string {
  if (typeof body !== "object" || body === null) return NOTHING;
  const b = body as Record<string, unknown>;
  const patch: MessagePatch = {};
  if (has(body, "sectionId")) {
    const sectionId = positiveId(b.sectionId);
    if (sectionId === null) return SECTION_ERROR;
    patch.sectionId = sectionId;
  }
  if (has(body, "title")) {
    const title = cleanTitle(b.title);
    if (title === null) return TITLE_ERROR;
    patch.title = title;
  }
  if (has(body, "text")) {
    const parts = partsFromText(b.text);
    if (typeof parts === "string") return parts;
    patch.parts = parts;
  }
  if (has(body, "move")) {
    if (b.move !== -1 && b.move !== 1) return MOVE_ERROR;
    patch.move = b.move === -1 ? -1 : 1;
  }
  return Object.keys(patch).length ? patch : NOTHING;
}
