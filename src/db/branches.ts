import { and, asc, eq, ne, or } from "drizzle-orm";
import { db } from "./index";
import { branches } from "./schema";
import { hashPin } from "@/lib/pinHash";
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

/** SQLite's UNIQUE refusal, possibly a `cause` or two down inside drizzle's wrapper. */
function uniqueViolation(e: unknown): string | null {
  for (let current: unknown = e; current instanceof Error; current = current.cause) {
    if (/UNIQUE/i.test(current.message)) return current.message;
  }
  return null;
}

/** A refused write that raced past the checks below: say which constraint. */
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

/** True when `hash` is the network PIN or any PIN of a branch other than `exceptId`. */
async function pinTaken(hash: string, exceptId: number | null): Promise<boolean> {
  const network = process.env.NETWORK_PIN;
  if (network && hash === (await hashPin(network))) return true;
  const used = or(eq(branches.churchPinHash, hash), eq(branches.adminPinHash, hash));
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(exceptId === null ? used : and(used, ne(branches.id, exceptId)))
    .limit(1);
  return Boolean(row);
}

/** name is COLLATE NOCASE, so eq() here is case-insensitive like the UNIQUE it mirrors. */
async function nameTaken(name: string, exceptId: number | null): Promise<boolean> {
  const same = eq(branches.name, name);
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(exceptId === null ? same : and(same, ne(branches.id, exceptId)))
    .limit(1);
  return Boolean(row);
}

export async function createBranch(input: { name: string; churchPin: string; adminPin: string | null }): Promise<Branch | "pin-taken" | "name-taken"> {
  const churchHash = await hashPin(input.churchPin);
  const adminHash = input.adminPin === null ? null : await hashPin(input.adminPin);
  // One PIN for both roles would make the church role unreachable.
  if (adminHash === churchHash) return "pin-taken";
  if (await pinTaken(churchHash, null)) return "pin-taken";
  if (adminHash !== null && (await pinTaken(adminHash, null))) return "pin-taken";
  if (await nameTaken(input.name, null)) return "name-taken";
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
  patch: { name?: string; churchPin?: string; adminPin?: string | null },
): Promise<Branch | "gone" | "pin-taken" | "name-taken"> {
  const [current] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!current) return "gone";

  const churchHash = patch.churchPin === undefined ? current.churchPinHash : await hashPin(patch.churchPin);
  const adminHash =
    patch.adminPin === undefined ? current.adminPinHash : patch.adminPin === null ? null : await hashPin(patch.adminPin);
  if (churchHash !== null && churchHash === adminHash) return "pin-taken";
  if (churchHash !== current.churchPinHash && churchHash !== null && (await pinTaken(churchHash, id))) return "pin-taken";
  if (adminHash !== current.adminPinHash && adminHash !== null && (await pinTaken(adminHash, id))) return "pin-taken";
  if (patch.name !== undefined && (await nameTaken(patch.name, id))) return "name-taken";

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
