import { NextResponse } from "next/server";
import { BOOKS } from "@/lib/books";
import { TRANSLATIONS, applyEnvOverrides } from "@/lib/translations";
import { getPassage } from "@/lib/sources";

export const runtime = "nodejs";
export const maxDuration = 60;

type Check = { name: string; ok: boolean; detail: string; ms?: number };

async function timed<T>(fn: () => Promise<T>): Promise<{ v?: T; e?: string; ms: number }> {
  const s = Date.now();
  try {
    return { v: await fn(), ms: Date.now() - s };
  } catch (e) {
    return { e: e instanceof Error ? e.message : String(e), ms: Date.now() - s };
  }
}

/**
 * GET /api/diag — answers "is each source actually working, and for which
 * translations?" in one page. Behind the PIN like everything else.
 */
export async function GET(req: Request) {
  applyEnvOverrides();
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";
  const checks: Check[] = [];
  const env = {
    YOUVERSION_APP_KEY: !!process.env.YOUVERSION_APP_KEY,
    APIBIBLE_KEY: !!process.env.APIBIBLE_KEY,
    LLM_API_KEY: !!(process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY),
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? "openrouter",
    LLM_MODEL: process.env.LLM_MODEL ?? "(default)",
    DISABLE_GATEWAY_FALLBACK: process.env.DISABLE_GATEWAY_FALLBACK === "1",
    DISABLE_LLM_FALLBACK: process.env.DISABLE_LLM_FALLBACK === "1",
    DB: process.env.TURSO_DATABASE_URL ? (process.env.TURSO_DATABASE_URL.startsWith("file:") ? "sqlite file" : "turso") : "local.db",
  };

  // 1) YouVersion: which bibles does this key see?
  let yvBibles: { id: number; abbreviation: string; title: string }[] = [];
  if (process.env.YOUVERSION_APP_KEY) {
    const r = await timed(async () => {
      const res = await fetch("https://api.youversion.com/v1/bibles?language_ranges[]=en&all_available=true&page_size=200", {
        headers: { "X-YVP-App-Key": process.env.YOUVERSION_APP_KEY!, Accept: "application/json" },
        cache: "no-store",
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
      const data = JSON.parse(body) as { data?: { id: number; abbreviation: string; title?: string; local_title?: string }[] };
      return (data.data ?? []).map((b) => ({ id: b.id, abbreviation: b.abbreviation, title: b.title ?? b.local_title ?? "" }));
    });
    yvBibles = r.v ?? [];
    checks.push({ name: "YouVersion: list bibles", ok: !r.e, detail: r.e ?? `${yvBibles.length} English bibles visible to this key`, ms: r.ms });
    for (const t of TRANSLATIONS) {
      if (!t.youversionId) continue;
      const hit = yvBibles.find((b) => b.id === t.youversionId);
      const sameAbbr = yvBibles.filter((b) => b.abbreviation.toUpperCase() === t.code);
      checks.push({
        name: `YouVersion: ${t.code} (id ${t.youversionId})`,
        ok: !!hit,
        detail: hit
          ? `available as "${hit.abbreviation}" — ${hit.title}`
          : sameAbbr.length
            ? `id ${t.youversionId} not visible, but "${t.code}" exists as id ${sameAbbr.map((b) => b.id).join("/")} → set YOUVERSION_IDS=${t.code}=${sameAbbr[0].id}`
            : yvBibles.length
              ? "not available to this key (needs publisher approval in the YouVersion Platform dashboard)"
              : "could not list bibles",
      });
    }
  } else {
    checks.push({ name: "YouVersion", ok: false, detail: "YOUVERSION_APP_KEY not set" });
  }

  // 2) Live lookup per translation (John 3:16) through the real chain, skipping the cache by using an unusual verse.
  if (deep) {
    const john = BOOKS.find((b) => b.usfm === "JHN")!;
    for (const t of TRANSLATIONS) {
      const r = await timed(() => getPassage({ book: john, chapter: 3, verseStart: 16, verseEnd: 17 }, t.code));
      checks.push({
        name: `Lookup John 3:16-17 ${t.code}`,
        ok: !!r.v && r.v.source !== "llm",
        detail: r.e ?? `${r.v!.source}${r.v!.attempts?.length ? ` (skipped: ${r.v!.attempts.join(" · ")})` : ""} — "${r.v!.verses[0]?.text.slice(0, 60)}…"`,
        ms: r.ms,
      });
    }
  }

  return NextResponse.json({ env, checks, youversionBibles: yvBibles.map((b) => `${b.id} ${b.abbreviation} ${b.title}`), hint: deep ? undefined : "add ?deep=1 to run a live lookup for every translation" });
}
