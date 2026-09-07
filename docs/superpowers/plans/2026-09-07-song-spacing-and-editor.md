# Song Spacing and Song Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Songs keep the spacing they were written with, and any song can be edited, renamed, or deleted from the desk.

**Architecture:** One pure module (`src/lib/songSections.ts`) owns the ingest rules — label stripping and the balanced 6-line cap — and both ingest paths call it. The songbook parser learns that a VideoPsalm `Tag` starts a new section and that only one-line slides may be packed. A new `edited_at` column marks hand-edited songs so a re-import leaves them alone. A `PATCH`/`DELETE` route plus an inline editor in the song view make songs mutable for the first time.

**Tech Stack:** Next.js 16.3.3 (App Router, route handlers), React 19, TypeScript, Drizzle ORM over libSQL/SQLite, Tailwind, Vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-07-song-spacing-and-editor.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing route-handler code. This Next.js differs from training data. Dynamic segment params are a **Promise**: `{ params }: { params: Promise<{ id: string }> }`, and must be awaited.
- `AGENTS.md` at the repo root is written by `next dev`. If it shows as modified, commit it with the work rather than reverting it.
- Tests live in `tests/*.test.{ts,tsx}` and run with `npm test` (vitest, TZ pinned to Europe/London). Component tests use `renderToStaticMarkup` from `react-dom/server`, never a DOM testing library — follow `tests/songList.test.tsx`.
- The `@` alias maps to `src/`.
- Sections are stored as a JSON string array in `songs.sections`. That does not change.
- `MAX_SECTION_LINES = 6`. Packing limit for one-line slides is `GROUP_LINES = 4`.
- Never invent or reorder lyric words anywhere in this work.
- Comments explain *why*, in the voice of the existing files. No comment restates what the line does.
- Do not run `npm run dev` or start a server; verification is `npm test` and `npm run lint`.

---

### Task 1: The shared ingest rules module

A single pure module both ingest paths and the editor's Tidy button call. Nothing here touches the database or React.

**Files:**
- Create: `src/lib/songSections.ts`
- Test: `tests/songSections.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_SECTION_LINES: number` (6)
  - `isLabelLine(line: string): boolean`
  - `stripLabelLines(text: string): string`
  - `capSection(section: string): string[]`
  - `splitOnBlankLines(text: string): string[]`
  - `sectionsFromLyrics(text: string): string[]`
  - `tidyLyrics(text: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/songSections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLabelLine, stripLabelLines, capSection, splitOnBlankLines, sectionsFromLyrics, tidyLyrics, MAX_SECTION_LINES } from "../src/lib/songSections";

describe("label-only lines", () => {
  it("recognises the shapes lyric sites actually use", () => {
    for (const l of ["[Intro]", "[Chorus]", "Chorus:", "chorus", "VAMP", "[Verse 1]", "Verse 4", "[Pre-Chorus]", "Pre chorus:", "Refrain", "bridge", "outro", "interlude", "Solo:", "[Interlude]"]) {
      expect(isLabelLine(l), l).toBe(true);
    }
  });

  it("leaves sung lines alone, including ones that start with a label word", () => {
    for (const l of ["Chorus of angels sing", "You are the bridge over troubled water", "Verse after verse of Your goodness", "Jehovah elroi", "Parara parararara parara", "Na u dey see wetin eyes no see"]) {
      expect(isLabelLine(l), l).toBe(false);
    }
  });

  it("drops label lines and keeps the lyrics around them", () => {
    expect(stripLabelLines("[Intro]\nYou sit in heaven\nAncient of days")).toBe("You sit in heaven\nAncient of days");
    expect(stripLabelLines("Chorus:")).toBe("");
  });
});

describe("the balanced cap", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
  const shape = (n: number) => capSection(lines(n)).map((s) => s.split("\n").length);

  it("leaves anything within the cap whole", () => {
    expect(shape(1)).toEqual([1]);
    expect(shape(5)).toEqual([5]);
    expect(shape(MAX_SECTION_LINES)).toEqual([6]);
  });

  it("splits evenly rather than leaving an orphan", () => {
    expect(shape(7)).toEqual([4, 3]);
    expect(shape(8)).toEqual([4, 4]);
    expect(shape(13)).toEqual([5, 4, 4]);
  });

  it("keeps every line, in order, when it splits", () => {
    expect(capSection(lines(7)).join("\n")).toBe(lines(7));
  });

  it("handles the songbook's 110-line teaching outline", () => {
    const out = capSection(lines(110));
    expect(Math.max(...out.map((s) => s.split("\n").length))).toBeLessThanOrEqual(MAX_SECTION_LINES);
    expect(out.join("\n")).toBe(lines(110));
  });
});

describe("splitting a paste", () => {
  it("starts a new section at a blank line", () => {
    expect(splitOnBlankLines("a\nb\n\nc\nd")).toEqual(["a\nb", "c\nd"]);
  });

  it("treats a run of blank lines as one break", () => {
    expect(splitOnBlankLines("a\n\n\n\nb")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty paste", () => {
    expect(splitOnBlankLines("   \n\n  ")).toEqual([]);
  });
});

describe("ingesting pasted lyrics", () => {
  it("drops labels, splits on blank lines and caps the long ones", () => {
    const pasted = ["[Intro]", "You sit in heaven", "You made the earth Your footstool", "", "[Chorus]", "a", "b", "c", "d", "e", "f", "g"].join("\n");
    expect(sectionsFromLyrics(pasted)).toEqual(["You sit in heaven\nYou made the earth Your footstool", "a\nb\nc\nd", "e\nf\ng"]);
  });

  it("drops a section that was only a label", () => {
    expect(sectionsFromLyrics("[Interlude]\n\nEverybody blow your trumpet")).toEqual(["Everybody blow your trumpet"]);
  });

  it("caps a paste that has no blank lines at all", () => {
    expect(sectionsFromLyrics("a\nb\nc\nd\ne\nf\ng\nh").length).toBe(2);
  });
});

describe("the Tidy button", () => {
  it("rewrites the textarea as blank-line separated sections", () => {
    expect(tidyLyrics("[Verse 1]\na\nb\nc\nd\ne\nf\ng")).toBe("a\nb\nc\nd\n\ne\nf\ng");
  });

  it("is idempotent, so tapping it twice changes nothing", () => {
    const once = tidyLyrics("[Chorus]\na\nb\n\n\nc");
    expect(tidyLyrics(once)).toBe(once);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- songSections`
Expected: FAIL — cannot resolve `../src/lib/songSections`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/songSections.ts`:

```ts
// The rules every song goes through on the way in, whichever door it came
// through: the songbook importer, a quick add, and the Tidy button in the
// editor all call these so a song is shaped the same way regardless.
//
// Deliberately pure and free of any database or React import — the editor
// runs them in the browser and the import route runs them on the server.

/**
 * A line that names a section rather than being sung. The shapes below are what
 * lyric sites emit; against the 40,714 slides of the CLC songbook this matches
 * 20 lines, every one of them a real label, so it is safe to simply drop them.
 */
const LABEL_LINE = /^\[?\s*(?:intro|verses?|pre[\s-]?chorus|chorus|refrain|bridge|interlude|outro|hook|vamp|instrumental|ending|coda|tag|solo|repeat)(?:\s*\d+)?\s*\]?\s*:?\s*$/i;

/** Above this a section is split; a wall of text is a bad clipboard message. */
export const MAX_SECTION_LINES = 6;

export function isLabelLine(line: string): boolean {
  return LABEL_LINE.test(line.trim());
}

export function stripLabelLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !isLabelLine(l))
    .join("\n")
    .trim();
}

/**
 * Split an oversized section into near-equal parts rather than greedily, so a
 * 7-line stanza becomes 4+3 and never 6+1: a single orphaned line reads as a
 * mistake in the chat.
 */
export function capSection(section: string): string[] {
  const lines = section.split("\n");
  if (lines.length <= MAX_SECTION_LINES) return [section];

  const chunks = Math.ceil(lines.length / MAX_SECTION_LINES);
  const base = Math.floor(lines.length / chunks);
  const extra = lines.length % chunks;
  const out: string[] = [];
  let i = 0;
  for (let c = 0; c < chunks; c++) {
    const take = base + (c < extra ? 1 : 0);
    out.push(lines.slice(i, i + take).join("\n"));
    i += take;
  }
  return out;
}

/** A blank line means a new section — the convention every lyric site uses. */
export function splitOnBlankLines(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pasted lyrics to sections: labels gone, blank lines respected, long ones capped. */
export function sectionsFromLyrics(text: string): string[] {
  return splitOnBlankLines(stripLabelLines(text)).flatMap(capSection);
}

/** What the editor's Tidy button leaves in the textarea. */
export function tidyLyrics(text: string): string {
  return sectionsFromLyrics(text).join("\n\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- songSections`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/songSections.ts tests/songSections.test.ts
git commit -m "feat: shared ingest rules for song sections"
```

---

### Task 2: Teach the songbook parser the media team's spacing

The import currently packs any consecutive slides up to 4 lines and ignores `Tag`. It becomes: only one-line slides pack, a tagged entry starts a new section, and every result goes through the cap.

**Files:**
- Modify: `src/lib/videopsalm.ts:95-156` (replace `regroupSections`, update `parseVideoPsalmSongbook`)
- Modify: `tests/videopsalm.test.ts:41-60` (replace the `regroupSections` block)
- Test: `tests/videopsalm.test.ts`

**Interfaces:**
- Consumes: `capSection` from `src/lib/songSections.ts` (Task 1).
- Produces:
  - `export type Slide = { kind: "text"; text: string } | { kind: "break" }`
  - `export function regroupSlides(slides: Slide[]): string[]`
  - `regroupSections` is **removed**. Nothing outside this file and its test imports it (verify with `grep -rn regroupSections src tests`).
  - `parseVideoPsalmSongbook` keeps its existing signature and `VpParseResult` shape.

- [ ] **Step 1: Write the failing test**

In `tests/videopsalm.test.ts`, replace the whole `describe("regrouping one-line slides", ...)` block (lines 41-60) with this, and change the import on line 3 from `regroupSections` to `regroupSlides, type Slide`:

```ts
describe("grouping songbook slides", () => {
  const text = (...ts: string[]): Slide[] => ts.map((t) => ({ kind: "text", text: t }));
  const BREAK: Slide = { kind: "break" };

  it("packs consecutive one-line slides into fours", () => {
    expect(regroupSlides(text("a", "b", "c", "d", "e", "f", "g", "h", "i"))).toEqual(["a\nb\nc\nd", "e\nf\ng\nh", "i"]);
  });

  it("leaves a slide that already has its own lines alone", () => {
    const slides = ["one\ntwo", "three\nfour\nfive"];
    expect(regroupSlides(text(...slides))).toEqual(slides);
  });

  it("never merges two-line slides — that is the couplet the media team authored", () => {
    expect(regroupSlides(text("A o riri\n(Never seen)", "A o gbori\n(Nor heard before)"))).toEqual(["A o riri\n(Never seen)", "A o gbori\n(Nor heard before)"]);
  });

  it("flushes the packed lines when a multi-line slide interrupts them", () => {
    expect(regroupSlides(text("a", "b", "c\nd", "e"))).toEqual(["a\nb", "c\nd", "e"]);
  });

  it("starts a new section at a break, even mid-group", () => {
    expect(regroupSlides([...text("a", "b"), BREAK, ...text("c", "d")])).toEqual(["a\nb", "c\nd"]);
  });

  it("ignores a break that has nothing before or after it", () => {
    expect(regroupSlides([BREAK, ...text("a"), BREAK, BREAK])).toEqual(["a"]);
  });

  it("caps a slide that is longer than a chat message should be", () => {
    const long = Array.from({ length: 7 }, (_, i) => `l${i + 1}`).join("\n");
    expect(regroupSlides(text(long))).toEqual(["l1\nl2\nl3\nl4", "l5\nl6\nl7"]);
  });
});

describe("the songbook's own section markers", () => {
  it("starts a new section at a tagged entry that carries no text", () => {
    const raw = '{Songs:[{Guid:"g",Text:"El Roi",Verses:[{Text:"You sit in heaven"},{ID:2,Text:"Ancient of days"},{Tag:1,ID:0},{ID:3,Text:"Jehovah elroi"},{ID:4,Text:"Na u dey see"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["You sit in heaven\nAncient of days", "Jehovah elroi\nNa u dey see"]);
  });

  it("starts a new section at a tagged entry that does carry text", () => {
    const raw = '{Songs:[{Guid:"g",Text:"Forever",Verses:[{Text:"a"},{ID:2,Text:"b"},{Tag:3,ID:3,Text:"the chorus starts"},{ID:4,Text:"d"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb", "the chorus starts\nd"]);
  });

  it("drops an untagged empty entry without breaking the group", () => {
    const raw = '{Songs:[{Guid:"g",Text:"T",Verses:[{Text:"a"},{ID:2},{ID:3,Text:"b"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb"]);
  });

  it("drops a label-only slide", () => {
    const raw = '{Songs:[{Guid:"g",Text:"T",Verses:[{Text:"[Chorus]"},{ID:2,Text:"a"},{ID:3,Text:"b"}]}]}';
    expect(parseVideoPsalmSongbook(raw).songs[0].sections).toEqual(["a\nb"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- videopsalm`
Expected: FAIL — `regroupSlides` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/videopsalm.ts`, add to the imports at the top of the file:

```ts
import { capSection, stripLabelLines } from "./songSections";
```

Replace lines 95-121 (the `GROUP_LINES` comment, the constant, and `regroupSections`) with:

```ts
/** A slide from the songbook, or a point where the media team started a new part. */
export type Slide = { kind: "text"; text: string } | { kind: "break" };

/**
 * Only one-line slides are packed, up to GROUP_LINES. A slide the media team
 * already gave two or more lines is its own section: those lines are the
 * couplet they chose — usually a line and its translation — and merging pairs
 * of them is what made songs unreadable in the chat.
 */
const GROUP_LINES = 4;

export function regroupSlides(slides: Slide[]): string[] {
  const out: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length) out.push(buf.join("\n"));
    buf = [];
  };

  for (const slide of slides) {
    if (slide.kind === "break") {
      flush();
      continue;
    }
    if (slide.text.includes("\n")) {
      flush();
      out.push(slide.text);
      continue;
    }
    if (buf.length >= GROUP_LINES) flush();
    buf.push(slide.text);
  }
  flush();

  return out.flatMap(capSection);
}
```

Then replace the `sections` line inside `parseVideoPsalmSongbook` (line 142) with:

```ts
    const sections = regroupSlides(toSlides(e.Verses ?? []));
```

Change the type annotation on the `JSON.parse` cast (line 132) so `Verses` carries the tag:

```ts
    Songs?: { Guid?: string; Text?: string; Author?: string; Verses?: { Text?: string; Tag?: number }[] }[];
```

And add this helper directly above `parseVideoPsalmSongbook`:

```ts
/**
 * VideoPsalm marks where a part begins with a Tag on the entry that starts it —
 * sometimes an empty placeholder between slides, more often the first slide of
 * the chorus itself. Either way it is a boundary, which is the only structure
 * the export gives us.
 */
function toSlides(verses: { Text?: string; Tag?: number }[]): Slide[] {
  const slides: Slide[] = [];
  for (const v of verses) {
    const text = stripLabelLines(cleanSlideText(v?.Text ?? ""));
    if (v && v.Tag !== undefined) slides.push({ kind: "break" });
    if (text) slides.push({ kind: "text", text });
  }
  return slides;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- videopsalm`
Expected: PASS.

Then confirm nothing else referenced the removed function:

Run: `grep -rn "regroupSections" src tests`
Expected: no output.

Run: `npm test && npm run lint`
Expected: the whole suite passes, lint clean.

- [ ] **Step 5: Check the rule against the real songbook**

Do not add a script to the repo for this. Run the one-off below from the repo root and read the output:

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseVideoPsalmSongbook } from './src/lib/videopsalm.ts';
const r = parseVideoPsalmSongbook(readFileSync('SongBooks/CLC.json','utf8'));
const s = r.songs.find(s => s.title.toLowerCase().includes('el roi'));
console.log(JSON.stringify(s?.sections, null, 1));
console.log('songs:', r.songs.length, 'max lines in any section:', Math.max(...r.songs.flatMap(x => x.sections.map(y => y.split('\n').length))));
"
```

Expected, confirmed against the real file while this plan was written:

```
1 | You sit in heaven / You make the earth your footstlool / No one can take your place / Ancient of days
2 | You see the deepest secrets that the hearts of men would try to hide / You are omega and alpha, you know the end from the start
3 | Jehovah elroi / Na u dey see wetin eyes no see / U dey do wetin man no fit do / Jehovah el-lyon
```

and `songs: 1949`, `max lines in any section: 6`. The third section starting at "Jehovah elroi" is the whole point — that is the chorus no longer running on from the intro. If it does not, fix `toSlides`/`regroupSlides` rather than moving on.

- [ ] **Step 6: Commit**

```bash
git add src/lib/videopsalm.ts tests/videopsalm.test.ts
git commit -m "fix: keep the songbook's own spacing on import"
```

---

### Task 3: Quick-add follows the same rules

The LLM currently regroups every paste and sometimes rewrites lines. It becomes a fallback used only when the paste has no blank lines at all.

**Files:**
- Modify: `src/app/api/songs/quick-add/route.ts:20-45`
- Create: `src/lib/quickAdd.ts`
- Test: `tests/quickAdd.test.ts`

**Interfaces:**
- Consumes: `sectionsFromLyrics`, `capSection` from `src/lib/songSections.ts` (Task 1); `cleanSlideText` from `src/lib/videopsalm.ts`.
- Produces:
  - `export function needsLlm(lyrics: string): boolean`
  - `export function sectionsFromLlmReply(reply: string): string[] | null`
  - The route's response body gains `song.id` (see Task 5, which needs it to edit a freshly added song).

The route itself stays untestable without a database, so the decisions live in `quickAdd.ts` where they can be tested directly.

- [ ] **Step 1: Write the failing test**

Create `tests/quickAdd.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsLlm, sectionsFromLlmReply } from "../src/lib/quickAdd";

describe("deciding whether the model is needed at all", () => {
  it("does not call it when the paste already has blank lines", () => {
    expect(needsLlm("a\nb\n\nc\nd")).toBe(false);
  });

  it("calls it for one undifferentiated block", () => {
    expect(needsLlm("a\nb\nc\nd\ne\nf\ng\nh")).toBe(true);
  });

  it("does not call it for something short enough to send as one section", () => {
    expect(needsLlm("a\nb\nc")).toBe(false);
  });

  it("ignores a paste whose only blank lines are leading or trailing", () => {
    expect(needsLlm("\n\na\nb\nc\nd\ne\nf\ng\n\n")).toBe(true);
  });
});

describe("reading the model's reply", () => {
  it("takes a JSON array of sections and caps them", () => {
    expect(sectionsFromLlmReply('["a\\nb", "c\\nd\\ne\\nf\\ng\\nh\\ni"]')).toEqual(["a\nb", "c\nd\ne\nf", "g\nh\ni"]);
  });

  it("finds the array when the model wrapped it in prose", () => {
    expect(sectionsFromLlmReply('Sure!\n```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
  });

  it("strips labels the model echoed back", () => {
    expect(sectionsFromLlmReply('["[Chorus]\\nJehovah elroi"]')).toEqual(["Jehovah elroi"]);
  });

  it("returns null for anything that is not a usable array", () => {
    expect(sectionsFromLlmReply("I could not do that")).toBe(null);
    expect(sectionsFromLlmReply("[]")).toBe(null);
    expect(sectionsFromLlmReply('[1, 2]')).toBe(null);
    expect(sectionsFromLlmReply('["   "]')).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- quickAdd`
Expected: FAIL — cannot resolve `../src/lib/quickAdd`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quickAdd.ts`:

```ts
// How a pasted song becomes sections. The blank lines in the paste are the
// author's own spacing and are trusted first; the model is only asked about a
// paste that has none, because it is the one case where there is nothing to go
// on. It has been observed rewriting lines when given more rope than that.

import { capSection, splitOnBlankLines, stripLabelLines, MAX_SECTION_LINES } from "./songSections";

/**
 * Only an undifferentiated block that is too long to send in one go. Measured
 * before the cap is applied, or the cap's own split would look like structure
 * the paste never had.
 */
export function needsLlm(lyrics: string): boolean {
  const blocks = splitOnBlankLines(stripLabelLines(lyrics));
  return blocks.length === 1 && blocks[0].split("\n").length > MAX_SECTION_LINES;
}

/**
 * The model is asked for a JSON array and usually obliges, but "usually" is not
 * something to build on mid-service: anything unreadable returns null and the
 * caller falls back to the mechanical split.
 */
export function sectionsFromLlmReply(reply: string): string[] | null {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return null;
  const sections = (parsed as string[]).flatMap((s) => splitOnBlankLines(stripLabelLines(s))).flatMap(capSection);
  return sections.length ? sections : null;
}
```

Now rewrite `src/app/api/songs/quick-add/route.ts` lines 20-45. Replace the import block at the top:

```ts
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { complete } from "@/lib/llm";
import { cleanSlideText } from "@/lib/videopsalm";
import { sectionsFromLyrics } from "@/lib/songSections";
import { needsLlm, sectionsFromLlmReply } from "@/lib/quickAdd";
import { clientKey, rateLimit } from "@/lib/ratelimit";
```

Replace the doc comment above `POST` and everything from `let sections` (line 20) down to the final `return` (line 45) with:

```ts
/**
 * POST { title, lyrics } — for a song that is not in the songbook. The blank
 * lines in what was pasted are the spacing the song was written with, so they
 * are used as they are; the model is only asked about a paste that has none.
 * Saved as source "manual" so it is reusable and editable.
 */
export async function POST(req: Request) {
  if (!rateLimit(`qa:${clientKey(req)}`, 10, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
  const { title, lyrics } = (await req.json().catch(() => ({}))) as { title?: string; lyrics?: string };
  if (!title?.trim() || !lyrics?.trim()) return NextResponse.json({ error: "Title and lyrics are required" }, { status: 400 });

  const cleaned = cleanSlideText(lyrics);
  let sections: string[] | null = null;
  if (needsLlm(cleaned)) {
    try {
      const out = await complete({
        system:
          "Split pasted song lyrics into singable sections for a church livestream chat, following the verse/chorus structure. NEVER invent, reword, reorder or drop words — only decide where the breaks go. Reply with JSON only: an array of strings, each string one section with \\n between its lines.",
        user: cleaned.slice(0, 6000),
        maxTokens: 2000,
      });
      sections = sectionsFromLlmReply(out);
    } catch {
      // No key, or the model was unreachable. The mechanical split still works.
    }
  }
  if (!sections) sections = sectionsFromLyrics(cleaned);
  if (sections.length === 0) return NextResponse.json({ error: "No lyric lines found" }, { status: 400 });

  await ensureSchema();
  const now = new Date();
  const guid = `manual:${now.getTime()}`;
  const cleanTitle = cleanSlideText(title).replace(/\n+/g, " ");
  const [row] = await db
    .insert(songs)
    .values({ guid, title: cleanTitle, author: null, sections: JSON.stringify(sections), source: "manual", createdAt: now, updatedAt: now })
    .returning({ id: songs.id });
  return NextResponse.json({ ok: true, song: { id: row.id, guid, title: cleanTitle, sections, source: "manual" } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- quickAdd`
Expected: PASS.

Run: `npm test && npm run lint`
Expected: whole suite green, lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quickAdd.ts tests/quickAdd.test.ts src/app/api/songs/quick-add/route.ts
git commit -m "fix: trust the blank lines in a pasted song"
```

---

### Task 4: Remember which songs were edited by hand

A hand-edited song must survive the next songbook re-import. That needs one nullable column and a diff that respects it.

**Files:**
- Modify: `src/db/schema.ts:38-47`
- Modify: `src/db/schemaSql.ts`
- Modify: `src/db/index.ts:27-36`
- Modify: `scripts/db-restore.mts:38`
- Modify: `src/lib/songbookDiff.ts`
- Modify: `src/app/api/songs/import/route.ts:39-53`
- Modify: `tests/songbookDiff.test.ts`
- Test: `tests/songbookDiff.test.ts`, `tests/schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `songs.editedAt` — Drizzle column `integer("edited_at", { mode: "timestamp" })`, nullable.
  - `applySchema(client: Client): Promise<void>` exported from `src/db/schemaSql.ts`.
  - `StoredSong` gains `editedAt: Date | null`.
  - `SongbookDiff` gains `skippedEdited: VpSong[]`.
  - The import route's summary JSON gains `skippedEdited: string[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/schema.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySchema } from "../src/db/schemaSql";

let dir: string;
let client: Client;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-schema-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
});
afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

const columns = async () => (await client.execute("PRAGMA table_info(songs)")).rows.map((r) => r.name as string);

describe("bringing a database up to date", () => {
  it("creates the songs table with every column", async () => {
    await applySchema(client);
    expect(await columns()).toContain("edited_at");
  });

  it("adds the column to a database made before it existed", async () => {
    await client.executeMultiple(`CREATE TABLE songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`);
    await client.execute({ sql: "INSERT INTO songs (guid,title,sections,source,created_at,updated_at) VALUES (?,?,?,?,?,?)", args: ["g", "Abide With Me", "[]", "videopsalm", 1, 1] });

    await applySchema(client);

    expect(await columns()).toContain("edited_at");
    const rows = (await client.execute("SELECT title, edited_at FROM songs")).rows;
    expect(rows[0].title).toBe("Abide With Me");
    expect(rows[0].edited_at).toBe(null);
  });

  it("is safe to run twice", async () => {
    await applySchema(client);
    await applySchema(client);
    expect((await columns()).filter((c) => c === "edited_at").length).toBe(1);
  });
});
```

Append to `tests/songbookDiff.test.ts`. First update the `stored` helper at line 8 to carry the new field:

```ts
const stored = (over: Partial<StoredSong> = {}): StoredSong => ({ title: "Abide With Me", author: "H.F. Lyte", sections: JSON.stringify(["Abide with me"]), editedAt: null, ...over });
```

Then add this block at the end of the file:

```ts
describe("a song that was edited at the desk", () => {
  const edited = stored({ sections: JSON.stringify(["Abide with me, fast falls the eventide"]), editedAt: new Date("2026-09-07T10:00:00Z") });

  it("is left alone even though the songbook disagrees with it", () => {
    const d = diffSongbook([song()], book({ g1: edited }));
    expect(d.updated).toEqual([]);
    expect(d.skippedEdited.map((s) => s.title)).toEqual(["Abide With Me"]);
    expect(d.unchanged).toBe(0);
  });

  it("is not reported as skipped when the songbook already agrees with it", () => {
    const d = diffSongbook([song()], book({ g1: stored({ editedAt: new Date("2026-09-07T10:00:00Z") }) }));
    expect(d.skippedEdited).toEqual([]);
    expect(d.unchanged).toBe(1);
  });

  it("does not stop a song the book has never seen from being added", () => {
    const d = diffSongbook([song({ guid: "g2", title: "Above All" })], book({ g1: edited }));
    expect(d.added.map((s) => s.title)).toEqual(["Above All"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- schema songbookDiff`
Expected: FAIL — `applySchema` is not exported, and `skippedEdited` does not exist.

- [ ] **Step 3: Write the implementation**

In `src/db/schema.ts`, add one column to the `songs` table, after `updatedAt`:

```ts
  /** Set the first time someone corrects the song here; import then leaves it alone. */
  editedAt: integer("edited_at", { mode: "timestamp" }),
```

In `src/db/schemaSql.ts`, add `edited_at INTEGER` to the `songs` DDL and append the migration helper. The whole file becomes:

```ts
/**
 * The whole schema as plain DDL, kept free of any client so scripts can create
 * these tables in a brand-new database without pulling in the app's connection.
 * `ensureSchema()` runs this on every boot; the backup/restore scripts run it
 * against whichever database they're pointed at.
 */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS verse_cache (
    translation TEXT NOT NULL, book INTEGER NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
    text TEXT NOT NULL, source TEXT NOT NULL, fetched_at INTEGER NOT NULL,
    PRIMARY KEY (translation, book, chapter, verse)
  );
  CREATE TABLE IF NOT EXISTS sent_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, label TEXT NOT NULL,
    body TEXT, meta TEXT, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sent_log_created_at ON sent_log (created_at);
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, edited_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS does nothing
 * to a table that already exists, and SQLite has no ADD COLUMN IF NOT EXISTS, so
 * each one is checked against the live table. Still no migration files to run.
 */
const ADDED_COLUMNS = [{ table: "songs", column: "edited_at", type: "INTEGER" }] as const;

/** Minimal surface so this stays usable from the app, the scripts and the tests. */
interface SchemaClient {
  executeMultiple(sql: string): Promise<unknown>;
  execute(sql: string): Promise<{ rows: { name?: unknown }[] }>;
}

/** Bring any database — new or years old — up to the schema above. Idempotent. */
export async function applySchema(client: SchemaClient): Promise<void> {
  await client.executeMultiple(SCHEMA_SQL);
  for (const { table, column, type } of ADDED_COLUMNS) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    if (!info.rows.some((r) => r.name === column)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
```

In `src/db/index.ts`, change the import on line 4 and the body of `ensureSchema`:

```ts
import { applySchema } from "./schemaSql";
```

```ts
let ensured: Promise<void> | null = null;
/** Creates tables and any column added since, if missing. Cheap, idempotent, and saves a migration step for a one-church app. */
export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await applySchema(getClient());
    })();
  }
  return ensured;
}
```

In `scripts/db-restore.mts`, change the import on line 15 and the call on line 38:

```ts
import { applySchema } from "../src/db/schemaSql.ts";
```
```ts
await applySchema(client);
```

In `src/lib/songbookDiff.ts`, replace the file's `StoredSong`, `SongbookDiff` and `diffSongbook` with:

```ts
/** A row as the songs table holds it: sections still JSON, author nullable. */
export interface StoredSong {
  title: string;
  author: string | null;
  sections: string;
  /** Set once someone corrected the song at the desk. */
  editedAt: Date | null;
}

export interface SongbookDiff {
  added: VpSong[];
  updated: VpSong[];
  unchanged: number;
  /** Corrected at the desk, so the songbook's version is not written over it. */
  skippedEdited: VpSong[];
  /** Entries dropped because a later entry claimed the same Guid. */
  repeatedGuids: number;
}

function changed(incoming: VpSong, current: StoredSong): boolean {
  return current.title !== incoming.title || current.author !== (incoming.author ?? null) || current.sections !== JSON.stringify(incoming.sections);
}

/**
 * Compare a parsed songbook against the rows already stored, keyed by Guid.
 * A Guid claimed twice in one file keeps the last entry — the row is unique, so
 * writing both would fail, and the last is what a sequential import would leave.
 *
 * A song someone fixed here is never overwritten: losing a correction made on a
 * Sunday morning to a routine re-import is worse than a stale songbook entry.
 */
export function diffSongbook(parsed: VpSong[], existing: Map<string, StoredSong>): SongbookDiff {
  const byGuid = new Map<string, VpSong>();
  for (const s of parsed) byGuid.set(s.guid, s);

  const diff: SongbookDiff = { added: [], updated: [], unchanged: 0, skippedEdited: [], repeatedGuids: parsed.length - byGuid.size };
  for (const song of byGuid.values()) {
    const current = existing.get(song.guid);
    if (!current) diff.added.push(song);
    else if (!changed(song, current)) diff.unchanged++;
    else if (current.editedAt) diff.skippedEdited.push(song);
    else diff.updated.push(song);
  }
  return diff;
}
```

In `src/app/api/songs/import/route.ts`, add `editedAt` to the select on line 40 and `skippedEdited` to the summary:

```ts
  for (const r of await db.select({ guid: songs.guid, title: songs.title, author: songs.author, sections: songs.sections, editedAt: songs.editedAt }).from(songs)) {
```

```ts
  const summary = {
    totalEntries: parsed.totalEntries,
    skippedEmpty: parsed.skippedEmpty,
    collapsedDuplicates: parsed.collapsedDuplicates,
    repeatedGuids: diff.repeatedGuids,
    unchanged: diff.unchanged,
    added: diff.added.map((s) => s.title),
    updated: diff.updated.map((s) => s.title),
    skippedEdited: diff.skippedEdited.map((s) => s.title),
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- schema songbookDiff`
Expected: PASS.

Run: `npm test && npm run lint`
Expected: whole suite green (`dbTransfer.test.ts` still passes — it calls `SCHEMA_SQL` directly and the new column is nullable), lint clean.

- [ ] **Step 5: Verify against the real database**

The committed `local.db` predates the column. Confirm the migration runs on it without touching the data:

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
import { applySchema } from './src/db/schemaSql.ts';
const c = createClient({ url: 'file:./local.db' });
const before = (await c.execute('SELECT count(*) n FROM songs')).rows[0].n;
await applySchema(c);
const cols = (await c.execute('PRAGMA table_info(songs)')).rows.map(r => r.name);
const after = (await c.execute('SELECT count(*) n FROM songs')).rows[0].n;
console.log({ before, after, cols });
"
```

Expected: the same song count before and after, and `edited_at` in the column list.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/schemaSql.ts src/db/index.ts scripts/db-restore.mts src/lib/songbookDiff.ts src/app/api/songs/import/route.ts tests/schema.test.ts tests/songbookDiff.test.ts local.db
git commit -m "feat: mark songs edited here so a re-import leaves them alone"
```

---

### Task 5: The edit and delete endpoint

The first mutation API for a single song. Admin only, matching the import route.

**Files:**
- Create: `src/app/api/songs/[id]/route.ts`
- Create: `src/lib/songEdit.ts`
- Modify: `src/db/songs.ts:11-19`
- Test: `tests/songEdit.test.ts`

**Interfaces:**
- Consumes: `sectionsFromLyrics` (Task 1); `songs.editedAt` (Task 4); `roleFromToken`, `SESSION_COOKIE` from `src/lib/auth.ts`.
- Produces:
  - `export interface SongEdit { title: string; author: string | null; sections: string[] }`
  - `export function parseSongEdit(body: unknown): SongEdit | string` — the `SongEdit`, or an error message.
  - `PATCH /api/songs/:id` → `{ ok: true, song: { id, guid, title, author, sections, source } }`
  - `DELETE /api/songs/:id` → `{ ok: true }`
  - `loadSongs` now also selects `editedAt`, and `SearchableSong` gains `editedAt?: string | null`.

Validation lives in `songEdit.ts` so it is testable without a database or a request.

- [ ] **Step 1: Write the failing test**

Create `tests/songEdit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSongEdit } from "../src/lib/songEdit";

const ok = (body: unknown) => {
  const r = parseSongEdit(body);
  if (typeof r === "string") throw new Error(`expected success, got: ${r}`);
  return r;
};

describe("validating an edit", () => {
  it("splits the textarea on blank lines, exactly as typed", () => {
    expect(ok({ title: "El Roi", lyrics: "a\nb\n\nc\nd" }).sections).toEqual(["a\nb", "c\nd"]);
  });

  it("keeps a long section the operator deliberately left long", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `l${i + 1}`).join("\n");
    expect(ok({ title: "T", lyrics: nine }).sections).toEqual([nine]);
  });

  it("keeps a label line the operator chose to leave in", () => {
    expect(ok({ title: "T", lyrics: "[Chorus]\na" }).sections).toEqual(["[Chorus]\na"]);
  });

  it("trims the title and collapses it to one line", () => {
    expect(ok({ title: "  El Roi\nPrinx  ", lyrics: "a" }).title).toBe("El Roi Prinx");
  });

  it("stores a blank author as null, not an empty string", () => {
    expect(ok({ title: "T", lyrics: "a", author: "   " }).author).toBe(null);
    expect(ok({ title: "T", lyrics: "a", author: " Prinx Emmanuel " }).author).toBe("Prinx Emmanuel");
  });

  it("refuses an edit with no title", () => {
    expect(parseSongEdit({ title: "  ", lyrics: "a" })).toMatch(/title/i);
  });

  it("refuses an edit with no lyrics left", () => {
    expect(parseSongEdit({ title: "T", lyrics: "  \n\n " })).toMatch(/lyric/i);
  });

  it("refuses a body that is not an object", () => {
    expect(parseSongEdit(null)).toMatch(/title/i);
    expect(parseSongEdit({ title: 5, lyrics: "a" })).toMatch(/title/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- songEdit`
Expected: FAIL — cannot resolve `../src/lib/songEdit`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/songEdit.ts`:

```ts
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
  const b = (body ?? {}) as { title?: unknown; author?: unknown; lyrics?: unknown };
  if (typeof b.title !== "string" || !b.title.trim()) return "A song needs a title";
  if (typeof b.lyrics !== "string") return "A song needs some lyrics";

  const sections = splitOnBlankLines(b.lyrics);
  if (!sections.length) return "A song needs some lyrics";

  const author = typeof b.author === "string" && b.author.trim() ? b.author.trim() : null;
  return { title: b.title.replace(/\s*\n+\s*/g, " ").trim(), author, sections };
}
```

Create `src/app/api/songs/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { songs } from "@/db/schema";
import { parseSongEdit } from "@/lib/songEdit";
import { roleFromToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const DENIED = "Admin PIN required to edit songs";

async function admin(): Promise<boolean> {
  return (await roleFromToken((await cookies()).get(SESSION_COOKIE)?.value)) === "admin";
}

/** Route params arrive as a promise in this version of Next. */
async function songId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH /api/songs/:id — admin only. Body: { title, author, lyrics }, where
 * lyrics is the textarea with a blank line between sections. Stamps edited_at,
 * which is what keeps a songbook re-import from writing over the correction.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await admin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await songId(params);
  if (id === null) return NextResponse.json({ error: "No such song" }, { status: 404 });

  const parsed = parseSongEdit(await req.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

  await ensureSchema();
  const now = new Date();
  const [row] = await db
    .update(songs)
    .set({ title: parsed.title, author: parsed.author, sections: JSON.stringify(parsed.sections), updatedAt: now, editedAt: now })
    .where(eq(songs.id, id))
    .returning({ id: songs.id, guid: songs.guid, source: songs.source });
  if (!row) return NextResponse.json({ error: "No such song" }, { status: 404 });

  return NextResponse.json({ ok: true, song: { ...row, title: parsed.title, author: parsed.author, sections: parsed.sections } });
}

/** DELETE /api/songs/:id — admin only. A songbook song comes back on the next import. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await admin())) return NextResponse.json({ error: DENIED }, { status: 403 });
  const id = await songId(params);
  if (id === null) return NextResponse.json({ error: "No such song" }, { status: 404 });

  await ensureSchema();
  const [row] = await db.delete(songs).where(eq(songs.id, id)).returning({ id: songs.id });
  if (!row) return NextResponse.json({ error: "No such song" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

In `src/db/songs.ts`, add `editedAt` to the select so the client knows a song was corrected:

```ts
  let q = db
    .select({ id: songs.id, guid: songs.guid, title: songs.title, author: songs.author, sections: songs.sections, source: songs.source, editedAt: songs.editedAt })
    .from(songs)
    .$dynamic();
```

and in `src/lib/songSearch.ts`, add the field to `SearchableSong` (after `source`):

```ts
  /** Set when the song was corrected at the desk; serialised as a date string. */
  editedAt?: string | Date | null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- songEdit`
Expected: PASS.

Run: `npm test && npm run lint`
Expected: whole suite green, lint clean.

- [ ] **Step 5: Verify the route compiles as a route handler**

Run: `npm run build`
Expected: build succeeds and the route list includes `/api/songs/[id]`. If Next complains about the `params` type, re-read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (the "Dynamic Route Segments" section) and match it exactly.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/songs/\[id\]/route.ts src/lib/songEdit.ts src/db/songs.ts src/lib/songSearch.ts tests/songEdit.test.ts
git commit -m "feat: edit and delete a song"
```

---

### Task 6: The editor in the song view

An Edit button next to the song title swaps the section list for a form. This is the only task that touches the desk UI.

**Files:**
- Modify: `src/app/SongsTab.tsx`
- Create: `src/app/SongEditor.tsx`
- Test: `tests/songEditor.test.tsx`

**Interfaces:**
- Consumes: `tidyLyrics` (Task 1); `PATCH`/`DELETE /api/songs/:id` (Task 5); `SearchableSong` from `src/lib/songSearch.ts`.
- Produces:
  - `SongEditor` — default export, props:
    ```ts
    interface Props {
      song: SearchableSong;
      onSaved: (song: SearchableSong) => void;
      onDeleted: () => void;
      onCancel: () => void;
      showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
    }
    ```
  - `export function lyricsFromSections(sections: string[]): string` — the textarea's starting value.

- [ ] **Step 1: Write the failing test**

Create `tests/songEditor.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SongEditor, { lyricsFromSections } from "../src/app/SongEditor";
import type { SearchableSong } from "../src/lib/songSearch";

const song: SearchableSong = { id: 7, guid: "g", title: "El Roi", author: "Prinx Emmanuel", sections: ["a\nb", "c\nd"] };
const render = (s: SearchableSong = song) =>
  renderToStaticMarkup(<SongEditor song={s} onSaved={() => {}} onDeleted={() => {}} onCancel={() => {}} showToast={() => {}} />);

describe("the textarea's starting value", () => {
  it("puts a blank line between sections, which is the break the operator edits", () => {
    expect(lyricsFromSections(["a\nb", "c\nd"])).toBe("a\nb\n\nc\nd");
  });

  it("round-trips a single section unchanged", () => {
    expect(lyricsFromSections(["only this"])).toBe("only this");
  });
});

describe("the editor form", () => {
  it("opens with the song's title, author and lyrics already in it", () => {
    const html = render();
    expect(html).toContain("El Roi");
    expect(html).toContain("Prinx Emmanuel");
    expect(html).toContain("a\nb\n\nc\nd");
  });

  it("offers Tidy, Save, Cancel and Delete", () => {
    const html = render();
    for (const label of ["Tidy", "Save", "Cancel", "Delete"]) expect(html, label).toContain(label);
  });

  it("labels every field, so the form is usable without sight", () => {
    const html = render();
    for (const label of ["Song title", "Author", "Song lyrics"]) expect(html, label).toContain(`aria-label="${label}"`);
  });

  it("explains what a blank line does, since that is the whole point", () => {
    expect(render().toLowerCase()).toContain("blank line");
  });

  it("handles a song with no author", () => {
    expect(() => render({ ...song, author: null })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- songEditor`
Expected: FAIL — cannot resolve `../src/app/SongEditor`.

- [ ] **Step 3: Write the implementation**

Create `src/app/SongEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { tidyLyrics } from "@/lib/songSections";
import type { SearchableSong } from "@/lib/songSearch";

interface Props {
  song: SearchableSong;
  onSaved: (song: SearchableSong) => void;
  onDeleted: () => void;
  onCancel: () => void;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
}

/** Sections as one editable body of text: the blank lines are the section breaks. */
export function lyricsFromSections(sections: string[]): string {
  return sections.join("\n\n");
}

export default function SongEditor({ song, onSaved, onDeleted, onCancel, showToast }: Props) {
  const [title, setTitle] = useState(song.title);
  const [author, setAuthor] = useState(song.author ?? "");
  const [lyrics, setLyrics] = useState(lyricsFromSections(song.sections));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Kept separate from the toast: the PIN hint needs a link in it, and a toast
  // disappears before anyone has read a sentence with a link in it.
  const [denied, setDenied] = useState(false);

  async function save() {
    if (busy || !title.trim() || !lyrics.trim()) return;
    setBusy(true);
    setDenied(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, lyrics }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        return showToast(data.error ?? "Could not save the song", "err");
      }
      showToast(`Saved "${data.song.title}"`);
      onSaved({ ...song, ...data.song });
    } catch {
      showToast("Could not reach the server — the song is unchanged", "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setDenied(false);
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        return showToast(data.error ?? "Could not delete the song", "err");
      }
      showToast(`Deleted "${song.title}"`);
      onDeleted();
    } catch {
      showToast("Could not reach the server — the song is unchanged", "err");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">Edit song</h2>
        <button onClick={onCancel} className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
          Cancel
        </button>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Song title" placeholder="Song title" className={field} />
      <input value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author" placeholder="Author (optional)" className={field} />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        aria-label="Song lyrics"
        rows={16}
        className={`${field} text-sm leading-relaxed`}
      />
      <p className="text-xs text-[var(--muted)]">
        A blank line starts a new section — one section is one message in the chat. Tidy drops <span className="whitespace-nowrap">[Chorus]</span>-style labels and splits anything longer than six lines; Save keeps exactly what you see.
      </p>

      {denied && (
        <p className="text-sm text-amber-400">
          This browser is unlocked with the church PIN.{" "}
          {/* A full navigation, not a client route: the unlock page replaces this one and sends you back. */}
          <a href="/unlock?next=/" className="underline">
            Enter the admin PIN here
          </a>{" "}
          and try again.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !title.trim() || !lyrics.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setLyrics(tidyLyrics(lyrics))} disabled={busy} className="rounded-md border border-zinc-700 px-4 py-2 hover:bg-zinc-800 disabled:opacity-50">
          Tidy
        </button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-sm text-[var(--muted)]">Delete this song?</span>
            <button onClick={remove} disabled={busy} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
              Keep it
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} disabled={busy} className="rounded-md border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
```

Now wire it into `src/app/SongsTab.tsx`:

1. Add to the imports at the top:

```tsx
import SongEditor from "./SongEditor";
```

2. Add one piece of state beside the others (near `const [flash, setFlash] = useState<number | null>(null);`):

```tsx
  const [editing, setEditing] = useState(false);
```

3. In `openSong`, reset it so opening another song never lands in the editor. Add `setEditing(false);` as the first line of the callback body, and add nothing to its dependency list (`setEditing` is stable).

4. Guard the song-view key handler so the shortcuts do not fire while typing in the editor. Change the first line of that effect (currently `if (!song) return;`) to:

```tsx
    if (!song || editing) return;
```

5. Add an Edit button next to the existing "← Songs" button. Replace the header block inside `{song && (`:

```tsx
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold leading-tight">{song.title}</h2>
            <span className="flex shrink-0 gap-2">
              <button onClick={() => setEditing(true)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                Edit
              </button>
              <button onClick={closeSong} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
                ← Songs
              </button>
            </span>
          </div>
```

6. Render the editor in place of the section list. Change the opening of the song block from `{song && (` to `{song && !editing && (`, and add this block immediately after that whole `{song && !editing && ( … )}` expression:

```tsx
      {song && editing && (
        <SongEditor
          song={song}
          showToast={showToast}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setSong(saved);
            setSent(new Set());
            setPinned(null);
            sectionRefs.current = [];
            // The local index is the search: without this the old lyrics keep
            // answering searches until the page is reloaded.
            setBook((b) => (b ? [...b.filter((i) => i.song.id !== saved.id), ...buildIndex([saved])] : b));
            focusSection(0);
          }}
          onDeleted={() => {
            setEditing(false);
            setBook((b) => (b ? b.filter((i) => i.song.id !== song.id) : b));
            setTotal((t) => (t === null ? t : t - 1));
            closeSong();
          }}
        />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- songEditor`
Expected: PASS.

Run: `npm test && npm run lint`
Expected: whole suite green, lint clean.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/SongEditor.tsx src/app/SongsTab.tsx tests/songEditor.test.tsx
git commit -m "feat: edit a song from the desk"
```

---

### Task 7: Tell the operator what the import left alone

The import page reports what changed. It now has one more outcome to show, and the re-import is the migration for the whole book, so the page should say so.

`Footnotes` and `Summary` move out of the page and into their own file. The page is a client component that imports `next/link`, and a test should be able to render the summary line without dragging either in.

**Files:**
- Create: `src/app/songs/import/Footnotes.tsx`
- Modify: `src/app/songs/import/page.tsx`
- Test: `tests/importSummary.test.tsx`

**Interfaces:**
- Consumes: the import route's `skippedEdited: string[]` (Task 4).
- Produces, from `src/app/songs/import/Footnotes.tsx`:
  - `export interface Summary` — the existing fields plus `skippedEdited: string[]`.
  - `export function Footnotes({ s }: { s: Summary })` — default-free named export.
  - `page.tsx` imports both from there and keeps its own `TitleList`.

- [ ] **Step 1: Write the failing test**

Create `tests/importSummary.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footnotes, type Summary } from "../src/app/songs/import/Footnotes";

const summary = (over: Partial<Summary> = {}): Summary => ({
  totalEntries: 1966,
  skippedEmpty: 0,
  collapsedDuplicates: 0,
  repeatedGuids: 0,
  unchanged: 1900,
  added: [],
  updated: [],
  skippedEdited: [],
  ...over,
});

const text = (s: Summary) => renderToStaticMarkup(<Footnotes s={s} />).replace(/<[^>]+>/g, "");

describe("what the import reports", () => {
  it("says nothing when there is nothing to report", () => {
    expect(renderToStaticMarkup(<Footnotes s={summary()} />)).toBe("");
  });

  it("says how many songs it left alone because they were edited here", () => {
    expect(text(summary({ skippedEdited: ["El Roi", "Army Arise"] }))).toContain("2 songs were edited here and are left alone");
  });

  it("counts one skipped song in the singular", () => {
    expect(text(summary({ skippedEdited: ["El Roi"] }))).toContain("1 song was edited here and is left alone");
  });

  it("still reports the older outcomes alongside it", () => {
    const out = text(summary({ skippedEmpty: 3, skippedEdited: ["El Roi"] }));
    expect(out).toContain("3 entries");
    expect(out).toContain("left alone");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- importSummary`
Expected: FAIL — cannot resolve `../src/app/songs/import/Footnotes`.

- [ ] **Step 3: Write the implementation**

Create `src/app/songs/import/Footnotes.tsx`:

```tsx
/** What the import would do, or did. Titles, not just counts. */
export interface Summary {
  totalEntries: number;
  skippedEmpty: number;
  collapsedDuplicates: number;
  repeatedGuids: number;
  unchanged: number;
  added: string[];
  updated: string[];
  /** Corrected at the desk, so the songbook's version was not written over them. */
  skippedEdited: string[];
}

/** The outcomes that are worth a line but not a list. */
export function Footnotes({ s }: { s: Summary }) {
  const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
  const edited = s.skippedEdited.length;
  const notes = [
    s.skippedEmpty ? `${entries(s.skippedEmpty)} ${s.skippedEmpty === 1 ? "has" : "have"} no lyrics and ${s.skippedEmpty === 1 ? "is" : "are"} skipped` : "",
    s.collapsedDuplicates ? `${s.collapsedDuplicates} exact ${s.collapsedDuplicates === 1 ? "duplicate" : "duplicates"} collapsed` : "",
    s.repeatedGuids ? `${entries(s.repeatedGuids)} reuse another entry's ID — only the last is kept` : "",
    edited ? `${edited} ${edited === 1 ? "song was" : "songs were"} edited here and ${edited === 1 ? "is" : "are"} left alone` : "",
  ].filter(Boolean);
  if (!notes.length) return null;
  return <p className="text-xs text-[var(--muted)]">{notes.join(" · ")}.</p>;
}
```

In `src/app/songs/import/page.tsx`:

1. Delete the local `Summary` interface (lines 7-15) and the local `Footnotes` function (lines 47-58), and add to the imports at the top:

```tsx
import { Footnotes, type Summary } from "./Footnotes";
```

2. Show the skipped titles in the preview block, immediately after the "songs that would change" list:

```tsx
          <TitleList heading="songs that would change" titles={preview.updated} />
          <TitleList heading="songs left alone (edited here)" titles={preview.skippedEdited} />
          <Footnotes s={preview} />
```

3. And in the result block, after the "songs updated" list:

```tsx
          <TitleList heading="songs updated" titles={result.updated} />
          <TitleList heading="songs left alone (edited here)" titles={result.skippedEdited} />
          <Footnotes s={result} />
```

4. Update the explanatory copy in the first block. Replace:

```tsx
            saved. Existing songs are updated, new ones added — nothing is deleted. Admin PIN required.
```

with:

```tsx
            saved. Existing songs are updated, new ones added, songs you edited here are left as you left them — nothing is deleted. Admin PIN required.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- importSummary`
Expected: PASS.

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/songs/import/Footnotes.tsx src/app/songs/import/page.tsx tests/importSummary.test.tsx
git commit -m "feat: import reports the songs it left alone"
```

---

### Task 8: Re-import the songbook and check the result

The 2,222 stored songs still hold the old greedy grouping. Re-importing `SongBooks/CLC.json` through the new rules is the migration. This task is verification, not code.

**Files:**
- Modify: `local.db` (the committed development database)
- Modify: `docs/superpowers/specs/2026-09-07-song-spacing-and-editor.md` (record the outcome)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing other code depends on.

- [ ] **Step 1: Back up the database first**

Run: `npm run db:backup`
Expected: a dump file is written. Note its path — it is the way back if the re-import is wrong.

- [ ] **Step 2: Apply the new rules to every stored song**

The import route needs a running server and an admin cookie, so do the same work directly against the database instead:

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { parseVideoPsalmSongbook } from './src/lib/videopsalm.ts';
import { applySchema } from './src/db/schemaSql.ts';

const c = createClient({ url: 'file:./local.db' });
await applySchema(c);
const parsed = parseVideoPsalmSongbook(readFileSync('SongBooks/CLC.json', 'utf8'));

const existing = new Map();
for (const r of (await c.execute('SELECT guid, title, author, sections, edited_at FROM songs')).rows) existing.set(r.guid, r);

let updated = 0, added = 0, skipped = 0, unchanged = 0;
const now = Date.now();
for (const s of parsed.songs) {
  const cur = existing.get(s.guid);
  const sections = JSON.stringify(s.sections);
  if (!cur) { await c.execute({ sql: 'INSERT INTO songs (guid,title,author,sections,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', args: [s.guid, s.title, s.author ?? null, sections, 'videopsalm', now, now] }); added++; continue; }
  if (cur.title === s.title && cur.author === (s.author ?? null) && cur.sections === sections) { unchanged++; continue; }
  if (cur.edited_at) { skipped++; continue; }
  await c.execute({ sql: 'UPDATE songs SET title=?, author=?, sections=?, updated_at=? WHERE guid=?', args: [s.title, s.author ?? null, sections, now, s.guid] });
  updated++;
}
console.log({ added, updated, unchanged, skipped });
"
```

Expected: `updated` in the hundreds or low thousands, `skipped` 0 (nothing has been edited yet), no errors.

- [ ] **Step 3: Check the song that started this**

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: 'file:./local.db' });
const r = await c.execute(\"SELECT title, sections FROM songs WHERE title LIKE '%El Roi%'\");
for (const row of r.rows) { console.log('---', row.title); JSON.parse(row.sections).forEach((s, i) => console.log(i + 1, JSON.stringify(s))); }
"
```

Expected for "El Roi- Prinx Emmanuel": section 1 is the four lines ending "Ancient of days"; section 2 is the two long "deepest secrets" and "omega and alpha" lines; section 3 starts at "Jehovah elroi". If the sections still run the intro into the chorus, the `Tag` handling in Task 2 is wrong — fix it there rather than patching the data.

- [ ] **Step 4: Check the book as a whole**

```bash
npx tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: 'file:./local.db' });
const rows = (await c.execute('SELECT title, sections FROM songs')).rows;
const secs = rows.flatMap(r => JSON.parse(r.sections));
const lines = secs.map(s => s.split('\n').length);
console.log({ songs: rows.length, sections: secs.length, maxLines: Math.max(...lines), over6: lines.filter(n => n > 6).length, empty: secs.filter(s => !s.trim()).length });
const most = rows.map(r => [JSON.parse(r.sections).length, r.title]).sort((a, b) => b[0] - a[0]).slice(0, 5);
console.log('most sections:', most);
"
```

Expected, from running these rules over `SongBooks/CLC.json` while this plan was written:

| Measure | Value |
| --- | --- |
| songs | 1,949 |
| sections | 17,693 |
| maxLines | 6 |
| over6 | 0 |
| empty | 0 |
| most sections in one song | 85 |

The 85-section song is one of the long teaching outlines in the book, not a fragmented song. Open the top few from `most sections` and confirm they are outlines or genuinely long songs. If a normal song appears there with dozens of one-line sections, the packing in Task 2 is not running and that is the thing to fix.

- [ ] **Step 5: Record the outcome and commit**

Append the counts from Steps 2 and 4 to the bottom of the spec under a `## Re-import result` heading, then:

```bash
git add local.db docs/superpowers/specs/2026-09-07-song-spacing-and-editor.md
git commit -m "chore: re-import the songbook with the corrected spacing"
```

- [ ] **Step 6: Note the production step**

The production database on Turso is not touched by any of the above. Tell the operator, in the final summary, that they need to open `/songs/import` on the deployed app, upload `SongBooks/CLC.json`, check the preview, and confirm. That is the same two-pass flow they already know, and it now reports anything it leaves alone.

---

## Verification of the whole feature

- [ ] `npm test` — every suite green.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — succeeds, `/api/songs/[id]` in the route list.
- [ ] `git status` — clean, or showing only `AGENTS.md` regenerated by `next dev` (commit it if so).
