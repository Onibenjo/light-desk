// The starter library's file format, checked by the same rules the editor
// uses. The file keeps each message's text as the editor shows it (a blank
// line between parts) so a person reviewing it reads what the operator sends.

import { cleanSectionName, cleanTitle, partsFromText } from "./messageEdit";

export interface SeedFile {
  sections: { name: string; inService: boolean; messages: { title: string; text: string }[] }[];
}

export interface ParsedSeed {
  sections: { name: string; inService: boolean; messages: { title: string; parts: string[] }[] }[];
}

export function parseSeed(raw: unknown): ParsedSeed | string {
  const list = typeof raw === "object" && raw !== null ? (raw as { sections?: unknown }).sections : undefined;
  if (!Array.isArray(list)) return "The seed needs a sections array";

  const seen = new Set<string>();
  const sections: ParsedSeed["sections"] = [];
  for (const [si, rawSection] of list.entries()) {
    const s = (rawSection ?? {}) as { name?: unknown; inService?: unknown; messages?: unknown };
    const name = cleanSectionName(s.name);
    if (name === null) return `Section ${si + 1}: needs a name of 1 to 80 characters`;
    if (typeof s.inService !== "boolean") return `${name}: in service is true or false`;
    if (seen.has(name.toLowerCase())) return `${name}: appears twice`;
    seen.add(name.toLowerCase());
    if (!Array.isArray(s.messages)) return `${name}: needs a messages array`;

    const messages: ParsedSeed["sections"][number]["messages"] = [];
    for (const [mi, rawMessage] of s.messages.entries()) {
      const m = (rawMessage ?? {}) as { title?: unknown; text?: unknown };
      const title = cleanTitle(m.title);
      if (title === null) return `${name}, message ${mi + 1}: needs a title of 1 to 120 characters`;
      const parts = partsFromText(m.text);
      if (typeof parts === "string") return `${name}, message ${mi + 1} (${title}): ${parts}`;
      messages.push({ title, parts });
    }
    sections.push({ name, inService: s.inService, messages });
  }
  return { sections };
}
