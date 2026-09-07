// What the editor is allowed to save. The Tidy button in the UI applies the
// ingest rules on demand; Save stores exactly what is in the textarea, so a
// section someone deliberately left at nine lines stays at nine lines.

import { splitOnBlankLines } from "./songSections";

export interface SongEdit {
  title: string;
  author: string | null;
  sections: string[];
}

/** The parsed edit, or the message to show the operator. */
export function parseSongEdit(body: unknown): SongEdit | string {
  if (typeof body !== "object" || body === null) return "A song needs a title";
  const title = "title" in body ? body.title : undefined;
  const author = "author" in body ? body.author : undefined;
  const lyrics = "lyrics" in body ? body.lyrics : undefined;

  if (typeof title !== "string" || !title.trim()) return "A song needs a title";
  if (typeof lyrics !== "string") return "A song needs some lyrics";

  const sections = splitOnBlankLines(lyrics);
  if (!sections.length) return "A song needs some lyrics";

  const authorValue = typeof author === "string" && author.trim() ? author.trim() : null;
  return { title: title.replace(/\s*\n+\s*/g, " ").trim(), author: authorValue, sections };
}
