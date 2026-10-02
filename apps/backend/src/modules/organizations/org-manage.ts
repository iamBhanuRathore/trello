import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { organizations } from '../../db/schema/index';
import { cachedTTL, invalidateTTL, bumpOrgCache } from '../../lib/cache';
import { httpError } from './org-common';

// ─── getOrg ───────────────────────────────────────────────────────────────────
export async function getOrg(db: Database, orgId: string) {
  const { data } = await cachedTTL(`org:${orgId}`, 60, () => loadOrg(db, orgId));
  return data;
}

async function loadOrg(db: Database, orgId: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) throw httpError(404, 'Organization not found');

  // Fetch plan if it exists
  let plan = null;
  if (org.planId) {
    const { plans } = await import('../../db/schema/index');
    const [p] = await db.select().from(plans).where(eq(plans.id, org.planId)).limit(1);
    plan = p || null;
  }

  return { ...org, plan };
}

// ─── updateOrg ────────────────────────────────────────────────────────────────
export async function updateOrg(
  db: Database,
  orgId: string,
  input: { name?: string; logoUrl?: string | null; primaryColor?: string | null }
) {
  // Explicit pick: never spread caller input into .set() (mass-assignment).
  const [org] = await db
    .update(organizations)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .returning();

  if (!org) throw httpError(404, 'Organization not found');
  await invalidateTTL(`org:${orgId}`);
  await bumpOrgCache(orgId);
  return org;
}
