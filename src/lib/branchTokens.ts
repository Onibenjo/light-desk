/** A `{key}` in a shared message, filled from the branch's own values. */
export const TOKEN_PATTERN = /\{([a-z][a-zA-Z0-9]{0,39})\}/g;

const KEY = /^[a-z][a-zA-Z0-9]{0,39}$/;
const MAX_ENTRIES = 50;
const MAX_VALUE = 4000;

/** Replaces each `{key}` that has a value; keys without one stay verbatim and are listed once, in order of first appearance. */
export function fillTokens(text: string, tokens: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(TOKEN_PATTERN, (whole, key: string) => {
    if (Object.hasOwn(tokens, key)) return tokens[key];
    if (!missing.includes(key)) missing.push(key);
    return whole;
  });
  return { text: filled, missing };
}

/** The tokens object a branch may store, or an error string naming what is wrong. */
export function cleanTokens(raw: unknown): Record<string, string> | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "Tokens must be an object of names and values";
  const entries = Object.entries(raw);
  if (entries.length > MAX_ENTRIES) return `Too many tokens — at most ${MAX_ENTRIES}`;
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!KEY.test(key)) return `"${key}" isn't a valid token name`;
    const v = typeof value === "string" ? value.trim() : "";
    if (!v) return `"${key}" needs a value`;
    if (v.length > MAX_VALUE) return `"${key}" is too long — at most ${MAX_VALUE} characters`;
    out[key] = v;
  }
  return out;
}
