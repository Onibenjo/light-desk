// The message library as the desk holds it: sections in the order the service
// runs, messages in each. Pure, so ordering and lookup test without a database.

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
}

export interface Library {
  sections: LibrarySection[];
  messages: LibraryMessage[];
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

/** Lookup for setlist rows, or null while the library is still loading. */
export function messagesById(library: Library | null): Map<number, LibraryEntry> | null {
  if (!library) return null;
  return new Map(libraryEntries(library).map((entry) => [entry.message.id, entry]));
}
