import { NextResponse } from "next/server";
import { BOOKS } from "@/lib/books";
import { getPassage, SourceError } from "@/lib/sources";

export const runtime = "nodejs";

/** GET /api/chapter?book=44&chapter=8&t=NKJV — whole chapter for the picker view. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const book = BOOKS[Number(url.searchParams.get("book"))];
  const chapter = Number(url.searchParams.get("chapter"));
  const t = url.searchParams.get("t") ?? undefined;
  if (!book || !chapter || chapter > book.chapters) return NextResponse.json({ error: "bad ref" }, { status: 400 });
  try {
    const passage = await getPassage({ book, chapter, verseStart: 0, verseEnd: 0 }, t);
    return NextResponse.json({ passage });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SourceError ? e.message : "Lookup failed" }, { status: 502 });
  }
}
