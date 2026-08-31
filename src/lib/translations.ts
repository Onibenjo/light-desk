export interface Translation {
  code: string; // what the operator types / sees
  name: string; // full name printed on line 2 of a post
  local?: boolean; // bundled in the app (public domain)
  youversionId?: number; // bible.com version id (verify once your key is approved: GET /v1/bibles?all_available=true)
  apiBibleId?: string; // API.Bible bible id (GET /v1/bibles with your key)
  gatewayCode: string; // biblegateway.com ?version= code
}

export const TRANSLATIONS: Translation[] = [
  { code: "NKJV", name: "New King James Version", youversionId: 114, gatewayCode: "NKJV" },
  { code: "KJV", name: "King James Version", local: true, youversionId: 1, apiBibleId: "de4e12af7f28f599-02", gatewayCode: "KJV" },
  { code: "AMP", name: "Amplified Bible", youversionId: 1588, gatewayCode: "AMP" },
  { code: "AMPC", name: "Amplified Bible, Classic Edition", youversionId: 8, gatewayCode: "AMPC" },
  { code: "NLT", name: "New Living Translation", youversionId: 116, gatewayCode: "NLT" },
  { code: "TPT", name: "The Passion Translation", youversionId: 1849, gatewayCode: "TPT" },
  { code: "NIV", name: "New International Version", youversionId: 111, gatewayCode: "NIV" },
  { code: "ESV", name: "English Standard Version", youversionId: 59, gatewayCode: "ESV" },
  { code: "MSG", name: "The Message", youversionId: 97, gatewayCode: "MSG" },
];

export const DEFAULT_TRANSLATION = "NKJV";

export function findTranslation(code: string | undefined | null): Translation | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return TRANSLATIONS.find((t) => t.code === c);
}

/** Overrides from env, e.g. APIBIBLE_IDS="NKJV=abc123-01,NLT=def456-01" */
export function applyEnvOverrides() {
  const raw = process.env.APIBIBLE_IDS;
  if (!raw) return;
  for (const pair of raw.split(",")) {
    const [code, id] = pair.split("=").map((s) => s.trim());
    const t = findTranslation(code);
    if (t && id) t.apiBibleId = id;
  }
  const yv = process.env.YOUVERSION_IDS;
  if (!yv) return;
  for (const pair of yv.split(",")) {
    const [code, id] = pair.split("=").map((s) => s.trim());
    const t = findTranslation(code);
    if (t && id && /^\d+$/.test(id)) t.youversionId = Number(id);
  }
}
