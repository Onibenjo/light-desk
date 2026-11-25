// Reading a choir setlist without AI: the fallback when the LLM is not set up,
// fails, or returns something that does not fit. Best effort by design — the
// paste screen shows the grouping so a person can check it.
//
// The shape of the message the choir sends:
//
//   FIRST SERVICE            ← service heading
//   First worship            ← section heading
//   Victor's crown – Artist  ← a song, unbulleted, in a section with no bullets
//   Praise
//   • Lord you are good      ← in a section with bullets, only bullets are songs…
//   He's a mighty God        ← …so unbulleted lines are lyrics
//
// Lines before any section heading count only when bulleted, so a pasted
// "here's the list for Sunday" is not taken for a song.

export interface ParsedSong {
  title: string;
  alternatives: string[];
  artist?: string;
}
export interface ParsedSection {
  name: string;
  songs: ParsedSong[];
}
export interface ParsedService {
  name: string;
  sections: ParsedSection[];
}

const SERVICE = /\b(first|second|third|midweek|sunday|wednesday)\s+service\b|^midweek\b/i;
const SECTION_WORD = /\b(worship|praise|hymn|offering|special|ministration|closing|opening)\b/i;
// A bullet, a number with "." or ")", or a leading emoji or symbol.
const BULLET = /^(?:[•\-*–·▪●◦]|\d{1,2}[.)]|[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+)\s*/u;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** "Oh my God o (Almighty Father) – Artist" → title, alternatives, artist. */
export function splitSong(line: string): ParsedSong | null {
  let rest = line.replace(/\s+/g, " ").trim();
  let artist: string | undefined;
  // The artist follows the last en/em dash, a spaced hyphen, or a hyphen before one capitalised word at the end.
  const dash = rest.match(/^(.*\S)\s*(?:[–—]|\s-\s|-(?=[A-Z][\p{L}']*$))\s*(.+)$/u);
  if (dash) {
    rest = dash[1];
    artist = dash[2].trim();
  } else {
    const by = rest.match(/^(.*\S)\s+by\s+(.+)$/i);
    if (by) {
      rest = by[1];
      artist = by[2].trim();
    }
  }
  const alternatives: string[] = [];
  rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const alt = inner.replace(/\s+/g, " ").trim();
    if (alt) alternatives.push(alt);
    return " ";
  });
  const title = rest.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  if (!title) return null;
  return artist ? { title, alternatives, artist } : { title, alternatives };
}

export function parseSetlistText(text: string): ParsedService[] {
  type RawSection = { name: string; named: boolean; lines: { text: string; bullet: boolean }[] };
  type RawService = { name: string; sections: RawSection[] };
  const services: RawService[] = [];
  let service: RawService | null = null;
  let section: RawSection | null = null;

  const ensureService = () => {
    if (!service) {
      service = { name: "Service", sections: [] };
      services.push(service);
    }
    return service;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = BULLET.test(line);
    if (!bullet && SERVICE.test(line) && line.split(/\s+/).length <= 4) {
      service = { name: titleCase(line.replace(/[:\s]+$/, "")), sections: [] };
      services.push(service);
      section = null;
      continue;
    }
    if (!bullet && line.split(/\s+/).length <= 4 && (line.endsWith(":") || SECTION_WORD.test(line)) && !/[–—]|\s-\s/.test(line)) {
      section = { name: line.replace(/[:\s]+$/, ""), named: true, lines: [] };
      ensureService().sections.push(section);
      continue;
    }
    if (!section) {
      section = { name: "", named: false, lines: [] };
      ensureService().sections.push(section);
    }
    section.lines.push({ text: bullet ? line.replace(BULLET, "") : line, bullet });
  }

  return services
    .map((s) => ({
      name: s.name,
      sections: s.sections
        .map((sec) => {
          const anyBullet = sec.lines.some((l) => l.bullet);
          const songLines = sec.lines.filter((l) => l.bullet || (sec.named && !anyBullet));
          return { name: sec.name, songs: songLines.flatMap((l) => splitSong(l.text) ?? []) };
        })
        .filter((sec) => sec.songs.length > 0),
    }))
    .filter((s) => s.sections.length > 0);
}
