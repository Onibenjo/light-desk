import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./index";
import { messageSections, messages } from "./schema";
import type { Branch } from "./branches";
import type { Library, LibraryMessage, LibrarySection } from "@/lib/messageLibrary";
import type { MessageCreate, MessagePatch, SectionCreate, SectionPatch } from "@/lib/messageEdit";
import type { ParsedSeed } from "@/lib/messageSeed";

type SectionRow = typeof messageSections.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

function toSection(row: SectionRow): LibrarySection {
  return { id: row.id, name: row.name, sort: row.sort, inService: row.inService };
}

function toMessage(row: MessageRow): LibraryMessage {
  return { id: row.id, sectionId: row.sectionId, title: row.title, parts: JSON.parse(row.parts) as string[], sort: row.sort, shared: row.branchId === null };
}

/** Shared messages, and this branch's own. */
function visibleTo(branchId: number) {
  return or(isNull(messages.branchId), eq(messages.branchId, branchId));
}

/**
 * True for SQLite's UNIQUE refusal. Drizzle wraps the driver's error, so the
 * message worth reading can be one or two `cause`s down.
 */
function isUniqueViolation(e: unknown): boolean {
  for (let current: unknown = e; current instanceof Error; current = current.cause) {
    if (/UNIQUE/i.test(current.message)) return true;
  }
  return false;
}

/** Everything, one payload. The library is a few dozen rows and always read whole. */
export async function loadLibrary(branch: Branch): Promise<Library> {
  const [sectionRows, messageRows] = await Promise.all([
    db.select().from(messageSections).orderBy(asc(messageSections.sort), asc(messageSections.id)),
    db.select().from(messages).where(visibleTo(branch.id)).orderBy(asc(messages.sort), asc(messages.id)),
  ]);
  return {
    branch: { id: branch.id, name: branch.name, tokens: branch.tokens },
    sections: sectionRows.map(toSection),
    messages: messageRows.map(toMessage),
  };
}

async function nextSectionSort(): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${messageSections.sort})` }).from(messageSections);
  return (row?.max ?? -1) + 1;
}

async function nextMessageSort(sectionId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${messages.sort})` })
    .from(messages)
    .where(eq(messages.sectionId, sectionId));
  return (row?.max ?? -1) + 1;
}

async function findSectionRow(id: number): Promise<SectionRow | undefined> {
  const [row] = await db.select().from(messageSections).where(eq(messageSections.id, id));
  return row;
}

async function findMessageRow(branchId: number, id: number): Promise<MessageRow | undefined> {
  const [row] = await db.select().from(messages).where(and(eq(messages.id, id), visibleTo(branchId)));
  return row;
}

export async function createSection(input: SectionCreate): Promise<LibrarySection | "duplicate"> {
  try {
    const [row] = await db
      .insert(messageSections)
      .values({ name: input.name, inService: input.inService, sort: await nextSectionSort() })
      .returning();
    return toSection(row);
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate";
    throw e;
  }
}

/** Trade `sort` with the nearest section above (-1) or below (1). At either end there is nothing to do. */
async function swapSection(current: SectionRow, delta: -1 | 1): Promise<void> {
  const [neighbour] = await db
    .select()
    .from(messageSections)
    .where(delta < 0 ? lt(messageSections.sort, current.sort) : gt(messageSections.sort, current.sort))
    .orderBy(delta < 0 ? desc(messageSections.sort) : asc(messageSections.sort))
    .limit(1);
  if (!neighbour) return;
  // One batch, so a failure halfway cannot leave two sections sharing a place.
  await db.batch([
    db.update(messageSections).set({ sort: neighbour.sort }).where(eq(messageSections.id, current.id)),
    db.update(messageSections).set({ sort: current.sort }).where(eq(messageSections.id, neighbour.id)),
  ]);
}

export async function updateSection(id: number, patch: SectionPatch): Promise<LibrarySection | "gone" | "duplicate"> {
  const current = await findSectionRow(id);
  if (!current) return "gone";

  // The rename/flag change is applied first and can fail on the unique name;
  // a refused change must change nothing, so the move only happens once that
  // has succeeded. (current.sort is unaffected by a rename, so it is still
  // valid for the swap below.)
  const values: { name?: string; inService?: boolean } = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.inService !== undefined) values.inService = patch.inService;
  if (Object.keys(values).length) {
    try {
      await db.update(messageSections).set(values).where(eq(messageSections.id, id));
    } catch (e) {
      if (isUniqueViolation(e)) return "duplicate";
      throw e;
    }
  }
  if (patch.move) await swapSection(current, patch.move);

  const saved = await findSectionRow(id);
  return saved ? toSection(saved) : "gone";
}

/**
 * Only an empty section can go. Checked in code rather than by a foreign key,
 * because SQLite only enforces those when a connection asks it to.
 */
export async function deleteSection(id: number): Promise<"deleted" | "gone" | "not-empty"> {
  const [used] = await db.select({ id: messages.id }).from(messages).where(eq(messages.sectionId, id)).limit(1);
  if (used) return "not-empty";
  const [row] = await db.delete(messageSections).where(eq(messageSections.id, id)).returning({ id: messageSections.id });
  return row ? "deleted" : "gone";
}

export async function createMessage(branchId: number, input: MessageCreate): Promise<LibraryMessage | "no-section"> {
  if (!(await findSectionRow(input.sectionId))) return "no-section";
  const now = new Date();
  const [row] = await db
    .insert(messages)
    .values({
      sectionId: input.sectionId,
      branchId: input.scope === "branch" ? branchId : null,
      title: input.title,
      parts: JSON.stringify(input.parts),
      sort: await nextMessageSort(input.sectionId),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toMessage(row);
}

/** Trade `sort` with the nearest message above or below, within the same section. */
async function swapMessage(branchId: number, current: MessageRow, delta: -1 | 1): Promise<void> {
  const [neighbour] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.sectionId, current.sectionId), visibleTo(branchId), delta < 0 ? lt(messages.sort, current.sort) : gt(messages.sort, current.sort)))
    .orderBy(delta < 0 ? desc(messages.sort) : asc(messages.sort))
    .limit(1);
  if (!neighbour) return;
  await db.batch([
    db.update(messages).set({ sort: neighbour.sort }).where(eq(messages.id, current.id)),
    db.update(messages).set({ sort: current.sort }).where(eq(messages.id, neighbour.id)),
  ]);
}

export async function updateMessage(branchId: number, id: number, patch: MessagePatch): Promise<LibraryMessage | "gone" | "no-section"> {
  const current = await findMessageRow(branchId, id);
  if (!current) return "gone";

  const values: { updatedAt: Date; title?: string; parts?: string; sectionId?: number; sort?: number; branchId?: number | null } = { updatedAt: new Date() };
  if (patch.sectionId !== undefined && patch.sectionId !== current.sectionId) {
    if (!(await findSectionRow(patch.sectionId))) return "no-section";
    values.sectionId = patch.sectionId;
    // Arrives at the end of its new section; a move within the old one is moot.
    values.sort = await nextMessageSort(patch.sectionId);
  } else if (patch.move) {
    await swapMessage(branchId, current, patch.move);
  }
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.parts !== undefined) values.parts = JSON.stringify(patch.parts);
  if (patch.scope !== undefined) values.branchId = patch.scope === "branch" ? branchId : null;

  await db.update(messages).set(values).where(eq(messages.id, id));
  const saved = await findMessageRow(branchId, id);
  return saved ? toMessage(saved) : "gone";
}

export async function deleteMessage(branchId: number, id: number): Promise<boolean> {
  const [row] = await db.delete(messages).where(and(eq(messages.id, id), visibleTo(branchId))).returning({ id: messages.id });
  return !!row;
}

/**
 * The starter library, into a library with nothing in it — never on top of
 * anything, so pressing the button twice, or after someone has started typing
 * messages in, changes nothing. One batch: half a library is worse than none.
 */
export async function seedLibrary(seed: ParsedSeed): Promise<{ sections: number; messages: number } | "not-empty"> {
  const [sectionCount] = await db.select({ n: sql<number>`count(*)` }).from(messageSections);
  const [messageCount] = await db.select({ n: sql<number>`count(*)` }).from(messages);
  if (Number(sectionCount.n) + Number(messageCount.n) > 0) return "not-empty";

  const now = new Date();
  let total = 0;
  const statements = seed.sections.flatMap((section, si) => {
    // Ids are given explicitly so each message can name its section inside the same batch.
    const id = si + 1;
    total += section.messages.length;
    return [
      db.insert(messageSections).values({ id, name: section.name, sort: si, inService: section.inService }),
      ...section.messages.map((m, mi) =>
        db.insert(messages).values({ sectionId: id, title: m.title, parts: JSON.stringify(m.parts), sort: mi, createdAt: now, updatedAt: now }),
      ),
    ];
  });
  if (statements.length) await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return { sections: seed.sections.length, messages: total };
}

export interface MessageFacts {
  inService: boolean;
  sectionName: string;
}

/** What the setlist route needs to know before letting a message in. Unknown ids are simply absent. */
export async function factsForMessages(branchId: number, ids: number[]): Promise<Map<number, MessageFacts>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: messages.id, inService: messageSections.inService, sectionName: messageSections.name })
    .from(messages)
    .innerJoin(messageSections, eq(messages.sectionId, messageSections.id))
    .where(and(inArray(messages.id, ids), visibleTo(branchId)));
  return new Map(rows.map((r) => [r.id, { inService: r.inService, sectionName: r.sectionName }]));
}
