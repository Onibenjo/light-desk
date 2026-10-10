// The message library as the desk holds it: sections in the order the service
// runs, messages in each. Pure, so ordering and lookup test without a database.

import { fillTokens, type Tokens } from "./branchTokens";

export interface LibrarySection {
  id: number;
  name: string;
  sort: number;
  /** False for sections like Apologies whose messages never go in a setlist. */
  inService: boolean;
}

export interface LibraryMessage {
  id: number;
  sectionId: number;
  title: string;
  /** One Mixlr post each. */
  parts: string[];
  sort: number;
  /** True when every branch sees it; false when it belongs to this branch alone. */
  shared: boolean;
}

export interface Library {
  /** The branch this library was loaded for. */
  branch: { id: number; name: string; tokens: Tokens };
  sections: LibrarySection[];
  messages: LibraryMessage[];
}

/** Enough to tell the library from a proxy's page or someone else's JSON. */
export function isLibrary(value: unknown): value is Library {
  return (
    typeof value === "object" &&
    value !== null &&
    "branch" in value &&
    typeof value.branch === "object" &&
    value.branch !== null &&
    "sections" in value &&
    Array.isArray(value.sections) &&
    "messages" in value &&
    Array.isArray(value.messages)
  );
}

export interface LibraryEntry {
  section: LibrarySection;
  message: LibraryMessage;
}

export interface LibraryGroup {
  section: LibrarySection;
  messages: LibraryMessage[];
}

const bySort = (a: { sort: number; id: number }, b: { sort: number; id: number }) => a.sort - b.sort || a.id - b.id;

/** "Apologies · Sound restored" — how a message reads in a setlist, the palette and the log. */
export function messageLabel(section: { name: string }, message: { title: string }): string {
  return `${section.name} · ${message.title}`;
}

export function groupLibrary(library: Library): LibraryGroup[] {
  return [...library.sections].sort(bySort).map((section) => ({
    section,
    messages: library.messages.filter((m) => m.sectionId === section.id).sort(bySort),
  }));
}

/** Every message with its section, in service order. A message whose section is gone is left out. */
export function libraryEntries(library: Library): LibraryEntry[] {
  return groupLibrary(library).flatMap(({ section, messages }) => messages.map((message) => ({ section, message })));
}

/** Search results back into section groups, keeping the order they came in. */
export function groupEntries(entries: LibraryEntry[]): LibraryGroup[] {
  const groups: LibraryGroup[] = [];
  for (const { section, message } of entries) {
    const last = groups.at(-1);
    if (last && last.section.id === section.id) last.messages.push(message);
    else groups.push({ section, messages: [message] });
  }
  return groups;
}

/** The branch's values for `{key}`s, or none while the library is still loading. */
export function tokensOf(library: Library | null): Tokens {
  return library?.branch.tokens ?? {};
}

/** Lookup for setlist rows, or null while the library is still loading. */
export function messagesById(library: Library | null): Map<number, LibraryEntry> | null {
  if (!library) return null;
  return new Map(libraryEntries(library).map((entry) => [entry.message.id, entry]));
}

/** One Mixlr post with this branch's values filled in. */
export interface OpenPart {
  text: string;
  /** `{key}`s this branch has no value for; the part is shown with a warning and not copied while any remain. */
  missing: string[];
}

/** Parts filled from the branch's own values, once, so what is shown and what is copied cannot differ. */
export function openParts(parts: string[], tokens: Tokens): OpenPart[] {
  return parts.map((part) => fillTokens(part, tokens));
}

/** A message the desk is about to copy or has open: from the library, a setlist row, or ⌘K. */
export interface OpenMessage {
  /** itemKey() of the message, which is also what the ✓ ticks are keyed by. */
  key: string;
  id: number;
  label: string;
  /** The text before any `{key}` is filled, so the parts can be filled again when the branch's values arrive. */
  source: string[];
  parts: OpenPart[];
  /** Text edited for one service, not the library's. */
  edited: boolean;
  /** Whether its section may go in a setlist, which decides if + is offered. */
  inService: boolean;
}

export function openMessageFor({ section, message }: LibraryEntry, tokens: Tokens): OpenMessage {
  return {
    key: `message:${message.id}`,
    id: message.id,
    label: messageLabel(section, message),
    source: message.parts,
    parts: openParts(message.parts, tokens),
    edited: false,
    inService: section.inService,
  };
}

/** The same message with its parts filled from these values, for one opened before the library had loaded. */
export function withTokens(message: OpenMessage, tokens: Tokens): OpenMessage {
  return { ...message, parts: openParts(message.source, tokens) };
}

/** The log label for one copied part. A one-part message is just its label. */
export function partLabel(label: string, index: number, count: number): string {
  return count > 1 ? `${label} · part ${index + 1} of ${count}` : label;
}
