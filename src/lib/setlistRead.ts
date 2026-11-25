// Reading a pasted setlist: the site's LLM first, the rule-based parser when
// the LLM is not set up, fails, is slow, or returns anything that does not fit
// the shape below exactly. The LLM only reads names; it never picks a song from
// the song bank (that is setlistMatch), so it cannot invent a match.

import { complete } from "./llm";
import { parseSetlistText, type ParsedService, type ParsedSong } from "./setlistParse";

const MAX_SERVICES = 20;
const MAX_SECTIONS = 20;
const MAX_SONGS = 40;
const TIMEOUT_MS = 20_000;

export const SETLIST_SYSTEM_PROMPT = `You read a church choir's setlist message and return its songs as JSON.

Return JSON only, no prose and no code fences, in exactly this shape:
{"services":[{"name":"First Service","sections":[{"name":"Praise","songs":[{"title":"Song title","alternatives":["Other name"],"artist":"Artist"}]}]}]}

Rules:
- A heading like "FIRST SERVICE" or "SECOND SERVICE" starts a service. Write its name in title case. With no service heading, use one service named "Service".
- A heading like "First worship", "Praise" or "Second worship" starts a section. Keep its name as written.
- A name in brackets after a song is another name for the same song: put it in "alternatives".
- Text after a dash ("– Darlene Zschech") or "by" is the artist. Omit "artist" when there is none.
- Lines of lyrics, notes and greetings are not songs: drop them.
- Fix obvious typos in song titles.
- Keep the songs in the order given. Keep a song listed twice.
- You must never invent songs that are not in the message.`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

/** The LLM's output as services, or null when it is not exactly the shape asked for. */
export function checkLlmSetlist(raw: string): ParsedService[] | null {
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const services = (data as { services?: unknown })?.services;
  if (!Array.isArray(services)) return null;
  const out: ParsedService[] = [];
  for (const s of services.slice(0, MAX_SERVICES)) {
    const name = str(s?.name);
    if (!name || !Array.isArray(s.sections)) return null;
    const sections = [];
    for (const sec of s.sections.slice(0, MAX_SECTIONS)) {
      if (!Array.isArray(sec?.songs)) return null;
      const songs: ParsedSong[] = [];
      for (const song of sec.songs.slice(0, MAX_SONGS)) {
        const title = str(song?.title);
        if (!title) continue;
        const alternatives = Array.isArray(song.alternatives) ? song.alternatives.flatMap((a: unknown) => str(a) ?? []) : [];
        const artist = str(song.artist);
        songs.push(artist ? { title, alternatives, artist } : { title, alternatives });
      }
      if (songs.length) sections.push({ name: str(sec.name) ?? "", songs });
    }
    if (sections.length) out.push({ name, sections });
  }
  return out.length ? out : null;
}

export async function readSetlist(text: string): Promise<{ services: ParsedService[]; readWithoutAi: boolean }> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("LLM timed out")), TIMEOUT_MS);
    });
    const raw = await Promise.race([complete({ system: SETLIST_SYSTEM_PROMPT, user: text, maxTokens: 2000 }), timeout]).finally(() => clearTimeout(timer));
    const services = checkLlmSetlist(raw);
    if (services) return { services, readWithoutAi: false };
  } catch {
    // Not set up, down or slow: the parser reads it instead.
  }
  return { services: parseSetlistText(text), readWithoutAi: true };
}
