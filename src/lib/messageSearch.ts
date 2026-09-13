// Finding a message from the words the operator remembers. The library is a
// few dozen messages, so this is a plain filter: every typed word must start a
// word somewhere in the section name, the title or the text. Order is the
// service order, never a score — the operator scans a short list top to bottom.

import { normalize, tokenize } from "./songSearch";
import { libraryEntries, type Library, type LibraryEntry } from "./messageLibrary";

export function searchMessages(library: Library, query: string): LibraryEntry[] {
  const words = tokenize(query);
  if (!words.length) return [];
  return libraryEntries(library).filter(({ section, message }) => {
    const haystack = ` ${normalize([section.name, message.title, ...message.parts].join(" "))}`;
    return words.every((word) => haystack.includes(` ${word}`));
  });
}
