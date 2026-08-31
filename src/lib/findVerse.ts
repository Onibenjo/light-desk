import { complete } from "./llm";
import { findBook } from "./books";
import { Reference, parseReference, formatReference } from "./reference";

export interface Candidate {
  reference: Reference;
  label: string; // "Luke 10:19"
  why: string; // one short line the operator can scan
}

/**
 * Turn "a verse that says they will walk on snakes and not be bitten" into up
 * to three candidate references. The model only returns references; the text
 * itself always comes from the licensed sources, never from the model.
 * Provider/model are chosen in src/lib/llm.ts via env.
 */
export async function findVerseCandidates(description: string): Promise<Candidate[]> {
  const text = await complete({
    system:
      "You identify Bible references from a preacher's paraphrase heard live in a Pentecostal church service. " +
      "Reply with JSON only: an array of up to 3 objects {\"ref\": \"Book chapter:verse[-verse]\", \"why\": \"<= 10 words\"}, most likely first. " +
      "Use full English book names. Prefer the single verse or tight range that contains the phrase. No prose.",
    user: description.slice(0, 300),
    maxTokens: 300,
  });
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  let items: { ref?: string; why?: string }[] = [];
  try {
    items = JSON.parse(json);
  } catch {
    throw new Error("Could not read the model's answer");
  }

  const out: Candidate[] = [];
  for (const it of items) {
    if (!it.ref) continue;
    const ref = parseReference(it.ref);
    if (!ref || !findBook(ref.book.name)) continue;
    if (ref.verseStart === 0) continue; // whole chapters aren't useful here
    out.push({ reference: ref, label: formatReference(ref), why: (it.why ?? "").slice(0, 80) });
    if (out.length === 3) break;
  }
  return out;
}
