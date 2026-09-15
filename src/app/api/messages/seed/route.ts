import { NextResponse } from "next/server";
import { ensureSchema } from "@/db";
import { seedLibrary } from "@/db/messages";
import { parseSeed } from "@/lib/messageSeed";
import { isAdmin } from "@/lib/adminGate";
import seed from "@/data/messages.seed.json";

export const runtime = "nodejs";

/**
 * POST — admin. Loads the starter library, cleaned by hand from the engagement
 * document, into a library with nothing in it. A route rather than a script so
 * it reaches the production database without anyone holding Turso credentials.
 */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Editing the message library needs the admin PIN" }, { status: 403 });

  // tests/messageSeed.test.ts guards the file; this is the belt to that brace.
  const parsed = parseSeed(seed);
  if (typeof parsed === "string") return NextResponse.json({ error: `The starter library is broken: ${parsed}` }, { status: 500 });

  await ensureSchema();
  const result = await seedLibrary(parsed);
  if (result === "not-empty") return NextResponse.json({ error: "The message library already has messages, so the starter messages weren't loaded" }, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}
