import { cleanPin } from "./pinHash";

export const MAX_BRANCH_NAME = 60;

const BAD_PIN = "A PIN needs 4 to 32 characters";

/** One line, trimmed, within the limit; otherwise the sentence to show. */
export function cleanBranchName(value: unknown): string | { error: string } {
  if (typeof value !== "string" || !value.trim()) return { error: "Give the branch a name" };
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length > MAX_BRANCH_NAME) return { error: `A branch name is at most ${MAX_BRANCH_NAME} characters` };
  return name;
}

/** The body of POST /api/branches, or the sentence to show. A missing or blank admin PIN means none. */
export function parseBranchCreate(body: unknown): { name: string; churchPin: string; adminPin: string | null } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = cleanBranchName(b.name);
  if (typeof name !== "string") return name;
  const churchPin = cleanPin(b.churchPin);
  if (!churchPin) return { error: `${BAD_PIN} — check the church PIN` };
  const blankAdmin = b.adminPin === undefined || b.adminPin === null || (typeof b.adminPin === "string" && !b.adminPin.trim());
  const adminPin = blankAdmin ? null : cleanPin(b.adminPin);
  if (!blankAdmin && !adminPin) return { error: `${BAD_PIN} — check the admin PIN` };
  return { name, churchPin, adminPin };
}

/** The body of PATCH /api/branches/:id. Missing or blank fields stay as they are. */
export function parseBranchPatch(body: unknown): { name?: string; churchPin?: string; adminPin?: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const given = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && !v.trim());
  const patch: { name?: string; churchPin?: string; adminPin?: string } = {};
  if (given(b.name)) {
    const name = cleanBranchName(b.name);
    if (typeof name !== "string") return name;
    patch.name = name;
  }
  for (const field of ["churchPin", "adminPin"] as const) {
    if (!given(b[field])) continue;
    const pin = cleanPin(b[field]);
    if (!pin) return { error: `${BAD_PIN} — check the ${field === "churchPin" ? "church" : "admin"} PIN` };
    patch[field] = pin;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to change" };
  return patch;
}

export const WRONG_NETWORK_PIN = "Wrong network PIN";
export const PIN_TAKEN = "That PIN is already used by a branch";
export const NAME_TAKEN = "There is already a branch with that name";
