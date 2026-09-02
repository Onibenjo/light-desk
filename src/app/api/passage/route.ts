import { NextResponse } from "next/server";
import { parseInput } from "@/lib/reference";
import { getPassage, parseSourceChoice, SourceError } from "@/lib/sources";
import { splitForChat, formatPassage } from "@/lib/format";

export const runtime = "nodejs";

/** GET /api/passage?q=rom%208%2028&t=NKJV */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const t = url.searchParams.get("t") ?? undefined;
  const src = parseSourceChoice(url.searchParams.get("src"));
  const parsed = parseInput(q);
  if (parsed.kind !== "reference" || !parsed.reference) {
    return NextResponse.json({ error: "not a reference", kind: parsed.kind }, { status: 400 });
  }
  const started = Date.now();
  try {
    const passage = await getPassage(parsed.reference, parsed.translation?.code ?? t, src);
    return NextResponse.json({
      passage,
      text: formatPassage(passage),
      chunks: splitForChat(passage),
      ms: Date.now() - started,
      ref: {
        book: parsed.reference.book.id,
        chapter: parsed.reference.chapter,
        verseStart: parsed.reference.verseStart,
        verseEnd: parsed.reference.verseEnd,
      },
    });
  } catch (e) {
    const msg = e instanceof SourceError ? e.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
