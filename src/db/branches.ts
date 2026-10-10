import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "./index";
import { uniqueViolation } from "./errors";
import { branches } from "./schema";
import { hashPin } from "@/lib/pinHash";
import { networkPin } from "@/lib/networkGate";
import type { Role } from "@/lib/auth";

/** A branch as the app sees it. PIN hashes never leave this file. */
export interface Branch {
  id: number;
  name: string;
  pinVersion: number;
  tokens: Record<string, string>;
}

type BranchRow = typeof branches.$inferSelect;

function parseTokens(raw: string): Record<string, string> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function toBranch(row: BranchRow): Branch {
  return { id: row.id, name: row.name, pinVersion: row.pinVersion, tokens: parseTokens(row.tokens) };
}

/** A refused write: the UNIQUE index says which constraint, so the name needs no check of its own. */
function refusal(e: unknown): "pin-taken" | "name-taken" {
  const message = uniqueViolation(e);
  if (message === null) throw e;
  return /branches\.name/i.test(message) ? "name-taken" : "pin-taken";
}

export async function getBranch(id: number): Promise<Branch | null> {
  const [row] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return row ? toBranch(row) : null;
}

export async function listBranches(): Promise<Branch[]> {
  const rows = await db.select().from(branches).orderBy(asc(branches.id));
  return rows.map(toBranch);
}

/**
 * The branch and role a typed PIN unlocks. An admin PIN gives admin; a church
 * PIN gives church, or admin when its branch has no admin PIN (single-PIN mode,
 * otherwise nobody there could edit). PINs are unique across branches, so at
 * most one row matches.
 */
export async function findBranchByPin(pin: string): Promise<{ branch: Branch; role: Role } | null> {
  if (!pin) return null;
  const hash = await hashPin(pin);
  const [row] = await db
    .select()
    .from(branches)
    .where(or(eq(branches.adminPinHash, hash), eq(branches.churchPinHash, hash)))
    .limit(1);
  if (!row) return null;
  const role: Role = row.adminPinHash === hash || row.adminPinHash === null ? "admin" : "church";
  return { branch: toBranch(row), role };
}

/** True when any of `hashes` is the network PIN or a PIN of a branch other than `exceptId`, in one query. */
async function pinTaken(hashes: string[], exceptId: number | null): Promise<boolean> {
  const network = networkPin();
  if (network && hashes.includes(await hashPin(network))) return true;
  const used = or(inArray(branches.churchPinHash, hashes), inArray(branches.adminPinHash, hashes));
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(exceptId === null ? used : and(used, ne(branches.id, exceptId)))
    .limit(1);
  return Boolean(row);
}

export async function createBranch(input: { name: string; churchPin: string; adminPin: string | null }): Promise<Branch | "pin-taken" | "name-taken"> {
  const churchHash = await hashPin(input.churchPin);
  const adminHash = input.adminPin === null ? null : await hashPin(input.adminPin);
  // One PIN for both roles would make the church role unreachable.
  if (adminHash === churchHash) return "pin-taken";
  if (await pinTaken(adminHash === null ? [churchHash] : [churchHash, adminHash], null)) return "pin-taken";
  try {
    const [row] = await db
      .insert(branches)
      .values({ name: input.name, churchPinHash: churchHash, adminPinHash: adminHash, createdAt: new Date() })
      .returning();
    return toBranch(row);
  } catch (e) {
    return refusal(e);
  }
}

/** Any PIN change bumps pinVersion, which logs out every device of that branch. */
export async function updateBranch(
  id: number,
  patch: { name?: string; churchPin?: string; adminPin?: string },
): Promise<Branch | "gone" | "pin-taken" | "name-taken"> {
  const [current] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!current) return "gone";

  const churchHash = patch.churchPin === undefined ? current.churchPinHash : await hashPin(patch.churchPin);
  const adminHash = patch.adminPin === undefined ? current.adminPinHash : await hashPin(patch.adminPin);
  if (churchHash !== null && churchHash === adminHash) return "pin-taken";
  const changed = [churchHash !== current.churchPinHash && churchHash, adminHash !== current.adminPinHash && adminHash].filter((h): h is string => typeof h === "string");
  if (changed.length > 0 && (await pinTaken(changed, id))) return "pin-taken";

  const pinChanged = churchHash !== current.churchPinHash || adminHash !== current.adminPinHash;
  try {
    const [row] = await db
      .update(branches)
      .set({
        name: patch.name ?? current.name,
        churchPinHash: churchHash,
        adminPinHash: adminHash,
        pinVersion: pinChanged ? current.pinVersion + 1 : current.pinVersion,
      })
      .where(eq(branches.id, id))
      .returning();
    return row ? toBranch(row) : "gone";
  } catch (e) {
    return refusal(e);
  }
}

export async function setBranchTokens(id: number, tokens: Record<string, string>): Promise<Branch | "gone"> {
  const [row] = await db
    .update(branches)
    .set({ tokens: JSON.stringify(tokens) })
    .where(eq(branches.id, id))
    .returning();
  return row ? toBranch(row) : "gone";
}
