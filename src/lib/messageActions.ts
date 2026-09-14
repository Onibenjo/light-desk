// Every library message as a ⌘K entry, so an apology is two keystrokes away
// from whichever tab the operator is on when the sound drops. The text is the
// keyword, because what the operator remembers is rarely the title.

import type { Action } from "./shortcuts";
import { libraryEntries, messageLabel, type Library, type LibraryEntry } from "./messageLibrary";

export function messageActions(library: Library | null, run: (entry: LibraryEntry) => void): Action[] {
  if (!library) return [];
  return libraryEntries(library).map((entry) => ({
    id: `message-${entry.message.id}`,
    title: messageLabel(entry.section, entry.message),
    group: "Message",
    keywords: [entry.message.parts.join(" ")],
    run: () => run(entry),
  }));
}
