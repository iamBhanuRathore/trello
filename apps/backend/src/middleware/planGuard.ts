import { db } from '../db/index';
import { organizations, plans, subscriptions } from '../db/schema/index';
import { eq } from 'drizzle-orm';

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

/**
 * requirePlan — Elysia beforeHandle hook for SaaS plan gating.
 * Returns HTTP 402 Payment Required if the organization's plan is below the required tier.
 */
export function requirePlan(minimumTier: 'pro' | 'business' | 'enterprise') {
  return async ({ user, set }: { user?: any; set: any }): Promise<any> => {
    const orgId = user?.organizationId;
    if (!orgId) {
      set.status = 401;
      return { error: 'Unauthorized: Organization context required' };
    }

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, orgId),
    });

    const plan = sub?.planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) })
      : org?.planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, org.planId) })
      : await db.query.plans.findFirst({ where: eq(plans.tier, 'free') });

    const currentTier = plan?.tier ?? 'free';
    const currentTierLevel = PLAN_HIERARCHY[currentTier] ?? 0;
    const requiredLevel = PLAN_HIERARCHY[minimumTier] ?? 1;

    if (currentTierLevel < requiredLevel) {
      set.status = 402;
      return {
        error: `This feature requires the ${minimumTier.toUpperCase()} tier or higher. Your organization is currently on the ${currentTier.toUpperCase()} tier.`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: currentTier,
        requiredPlan: minimumTier,
        upgradeUrl: '/admin/billing',
      };
    }
  };
}
