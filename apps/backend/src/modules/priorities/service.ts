import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { priorities, cards } from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export const DEFAULT_PRIORITIES = [
  { name: 'Urgent', color: '#ef4444', rank: 0, isDefault: false },
  { name: 'High', color: '#f59e0b', rank: 1, isDefault: false },
  { name: 'Medium', color: '#3b82f6', rank: 2, isDefault: true },
  { name: 'Low', color: '#10b981', rank: 3, isDefault: false },
];

const HEX_COLOR = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function assertValidColor(color: string) {
  if (!HEX_COLOR.test(color)) throw httpError(400, 'Color must be a hex value like #ef4444');
}

/** Drizzle may surface the driver error directly or nested under `cause`. */
function isUniqueViolation(err: any): boolean {
  for (const e of [err, err?.cause]) {
    if (!e) continue;
    if (e.code === '23505') return true;
    if (/duplicate key|unique constraint/i.test(e.message || '')) return true;
  }
  return false;
}

/** Lazy-seed: every org gets the 4 defaults exactly once (covers pre-existing orgs). */
export async function ensureDefaultPriorities(db: Database, organizationId: string) {
  const existing = await db
    .select({ id: priorities.id })
    .from(priorities)
    .where(eq(priorities.organizationId, organizationId))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(priorities).values(DEFAULT_PRIORITIES.map((p) => ({ ...p, organizationId })));
  }
}

export async function listPriorities(db: Database, organizationId: string) {
  await ensureDefaultPriorities(db, organizationId);
  return await db
    .select()
    .from(priorities)
    .where(eq(priorities.organizationId, organizationId))
    .orderBy(priorities.rank, priorities.name);
}

async function getPriorityOrThrow(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.id, id), eq(priorities.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Priority not found');
  return row;
}

export async function createPriority(
  db: Database,
  organizationId: string,
  input: { name: string; color?: string }
) {
  const name = input.name?.trim();
  if (!name) throw httpError(400, 'Priority name is required');
  if (name.length > 60) throw httpError(400, 'Priority name must be 60 characters or fewer');
  const color = input.color?.trim() || '#64748b';
  assertValidColor(color);

  const [max] = await db
    .select({ maxRank: sql<number | null>`max(${priorities.rank})` })
    .from(priorities)
    .where(eq(priorities.organizationId, organizationId));

  try {
    const [row] = await db
      .insert(priorities)
      .values({ organizationId, name, color, rank: (max?.maxRank ?? -1) + 1 })
      .returning();
    return row;
  } catch (err: any) {
    if (isUniqueViolation(err)) throw httpError(409, 'A priority with this name already exists');
    throw err;
  }
}

export async function updatePriority(
  db: Database,
  organizationId: string,
  id: string,
  input: { name?: string; color?: string; rank?: number }
) {
  await getPriorityOrThrow(db, organizationId, id);
  const patch: Partial<{ name: string; color: string; rank: number }> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw httpError(400, 'Priority name is required');
    if (name.length > 60) throw httpError(400, 'Priority name must be 60 characters or fewer');
    patch.name = name;
  }
  if (input.color !== undefined) {
    assertValidColor(input.color.trim());
    patch.color = input.color.trim();
  }
  if (input.rank !== undefined) {
    if (!Number.isInteger(input.rank) || input.rank < 0)
      throw httpError(400, 'Rank must be a non-negative integer');
    patch.rank = input.rank;
  }
  if (Object.keys(patch).length === 0) throw httpError(400, 'Nothing to update');
  try {
    const [row] = await db
      .update(priorities)
      .set({ ...patch })
      .where(and(eq(priorities.id, id), eq(priorities.organizationId, organizationId)))
      .returning();
    return row;
  } catch (err: any) {
    if (isUniqueViolation(err)) throw httpError(409, 'A priority with this name already exists');
    throw err;
  }
}

export async function deletePriority(db: Database, organizationId: string, id: string) {
  const row = await getPriorityOrThrow(db, organizationId, id);
  const all = await listPriorities(db, organizationId);
  if (all.length <= 1) throw httpError(400, 'An organization must keep at least one priority');

  // Re-point cards to the default (or lowest-rank survivor), never orphan them.
  const fallback = all.find((p) => p.isDefault && p.id !== id) || all.find((p) => p.id !== id)!;
  await db.update(cards).set({ priorityId: fallback.id }).where(eq(cards.priorityId, id));
  // Promote fallback to default if the deleted row held it.
  if (row.isDefault) {
    await db
      .update(priorities)
      .set({ isDefault: true })
      .where(and(eq(priorities.id, fallback.id), eq(priorities.organizationId, organizationId)));
  }
  await db
    .delete(priorities)
    .where(and(eq(priorities.id, id), eq(priorities.organizationId, organizationId)));
  return { success: true, reassignedTo: fallback.id };
}

export async function setDefaultPriority(db: Database, organizationId: string, id: string) {
  await getPriorityOrThrow(db, organizationId, id);
  await db
    .update(priorities)
    .set({ isDefault: false })
    .where(eq(priorities.organizationId, organizationId));
  const [row] = await db
    .update(priorities)
    .set({ isDefault: true })
    .where(and(eq(priorities.id, id), eq(priorities.organizationId, organizationId)))
    .returning();
  return row;
}

/** Resolve a priority id within the org (null clears). Used by card mutations. */
export async function resolvePriorityId(
  db: Database,
  organizationId: string,
  priorityId: string | null | undefined
): Promise<string | null | undefined> {
  if (priorityId === undefined) return undefined;
  if (priorityId === null) return null;
  await getPriorityOrThrow(db, organizationId, priorityId);
  return priorityId;
}

/** Default priority for new cards (lazy-seeded). */
export async function getDefaultPriorityId(
  db: Database,
  organizationId: string
): Promise<string | null> {
  await ensureDefaultPriorities(db, organizationId);
  const [row] = await db
    .select({ id: priorities.id })
    .from(priorities)
    .where(and(eq(priorities.organizationId, organizationId), eq(priorities.isDefault, true)))
    .limit(1);
  return row?.id ?? null;
}
