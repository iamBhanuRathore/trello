import { eq, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { organizations, plans, subscriptions } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── listTenants ──────────────────────────────────────────────────────────────
export async function listTenants(db: Database) {
  const allOrgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      plan: {
        id: plans.id,
        name: plans.name,
        tier: plans.tier,
      },
      subscription: {
        status: subscriptions.status,
        seatCount: subscriptions.seatCount,
      }
    })
    .from(organizations)
    .leftJoin(plans, eq(plans.id, organizations.planId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .orderBy(desc(organizations.createdAt));

  return allOrgs;
}

// ─── listPlans ────────────────────────────────────────────────────────────────
export async function listPlans(db: Database) {
  const allPlans = await db
    .select()
    .from(plans)
    .orderBy(plans.name);

  return allPlans;
}

// ─── updatePlan ───────────────────────────────────────────────────────────────
export async function updatePlan(
  db: Database,
  planId: string,
  input: { maxWorkspaces?: number; maxBoards?: number; maxStorageGb?: number; maxSeats?: number; featureFlags?: any }
) {
  const [plan] = await db
    .update(plans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning();

  if (!plan) throw httpError(404, 'Plan not found');
  return plan;
}
