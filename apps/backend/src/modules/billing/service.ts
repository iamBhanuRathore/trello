import { eq, sql, and, count, inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  subscriptions,
  plans,
  organizations,
  users,
  organizationMembers,
  invitations,
  billingEvents,
  seatChangeRequests,
} from '../../db/schema';
import {
  stripe,
  createCheckoutSession,
  createBillingPortalSession,
  updateSubscriptionSeatQuantity,
  scheduleSubscriptionSeatDecrease,
  previewProratedInvoice,
  listInvoices,
} from '../../lib/stripe';
import { env } from '../../lib/env';
import { logger } from '../../lib/logger';
import { errorMessage } from '../../lib/errors';
import {
  renderSubscriptionActivatedEmail,
  renderPaymentFailedEmail,
} from '../../lib/emailTemplates';
import { sendEmail } from '../../lib/email';
import Stripe from 'stripe';
import { SeatChangeDirection, SeatChangeStatus } from '@boardly/shared-types';

export const BILLABLE_ROLES = [
  'org_owner',
  'org_admin',
  'billing_manager',
  'workspace_admin',
  'member',
] as const;
export type BillableRole = (typeof BILLABLE_ROLES)[number];

export function isBillableRole(role: string): boolean {
  return BILLABLE_ROLES.includes(role as BillableRole);
}

// ─── Guest Cap Limits by Tier ─────────────────────────────────────────────────
export function getGuestCap(tier: string, seatCount: number): number {
  switch (tier) {
    case 'free':
      return 3;
    case 'pro':
      return seatCount * 10;
    case 'business':
      return seatCount * 25;
    case 'enterprise':
      return 999999;
    default:
      return 3;
  }
}

// ─── Overview & Seat Usage ────────────────────────────────────────────────────
export async function getBillingOverview(orgId: string) {
  // 1. Get organization with plan and subscription
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, orgId),
  });

  const plan = sub?.planId
    ? await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) })
    : org.planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, org.planId) })
      : await db.query.plans.findFirst({ where: eq(plans.tier, 'free') });

  const currentTier = plan?.tier ?? 'free';
  const totalPaidSeats = sub?.seatCount ?? 5;

  // 2. Count active billable members
  const activeMembersResult = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.status, 'active'),
        sql`${organizationMembers.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
      )
    );
  const activeBillableSeats = Number(activeMembersResult[0]?.count ?? 0);

  // 3. Count pending billable invites
  const pendingInvitesResult = await db
    .select({ count: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, orgId),
        eq(invitations.status, 'pending'),
        sql`${invitations.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
      )
    );
  const pendingBillableInvites = Number(pendingInvitesResult[0]?.count ?? 0);

  const billableSeatsUsed = activeBillableSeats + pendingBillableInvites;
  const vacantSeats = Math.max(0, totalPaidSeats - billableSeatsUsed);

  // 4. Count guests (viewers)
  const activeGuestsResult = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.status, 'active'),
        eq(organizationMembers.role, 'viewer')
      )
    );
  const activeGuests = Number(activeGuestsResult[0]?.count ?? 0);

  const pendingGuestsResult = await db
    .select({ count: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, orgId),
        eq(invitations.status, 'pending'),
        eq(invitations.role, 'viewer')
      )
    );
  const pendingGuests = Number(pendingGuestsResult[0]?.count ?? 0);

  const totalGuests = activeGuests + pendingGuests;
  const guestCap = getGuestCap(currentTier, totalPaidSeats);

  // 5. Invoices (if stripe customer exists)
  let invoiceList: Array<{
    id: string;
    number: string | null;
    amountPaid: number;
    currency: string;
    status: string | null;
    created: number;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  }> = [];

  if (sub?.stripeCustomerId && env.STRIPE_SECRET_KEY) {
    try {
      const rawInvoices = await listInvoices(sub.stripeCustomerId, 5);
      invoiceList = rawInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created: inv.created,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        invoicePdf: inv.invoice_pdf ?? null,
      }));
    } catch (err) {
      logger.warn({ err, orgId }, 'Failed to fetch Stripe invoices');
    }
  }

  // Pricing calculations
  const monthlyRatePerSeat =
    currentTier === 'business'
      ? 20
      : currentTier === 'pro'
        ? 10
        : currentTier === 'enterprise'
          ? 36
          : 0;
  const annualRatePerSeat =
    currentTier === 'business'
      ? 16
      : currentTier === 'pro'
        ? 8
        : currentTier === 'enterprise'
          ? 30
          : 0;
  const interval = sub?.billingInterval === 'annual' ? 'annual' : 'monthly';
  const effectiveRate = interval === 'annual' ? annualRatePerSeat : monthlyRatePerSeat;
  const estimatedMonthlyTotal = currentTier === 'free' ? 0 : totalPaidSeats * effectiveRate;

  return {
    organizationId: orgId,
    plan: {
      id: plan?.id,
      name: plan?.name ?? 'Free Plan',
      tier: currentTier,
      maxSeats: plan?.maxSeats ?? 5,
      maxWorkspaces: plan?.maxWorkspaces ?? 1,
      maxBoards: plan?.maxBoards ?? 3,
      maxStorageGb: plan?.maxStorageGb ?? 1,
    },
    subscription: {
      id: sub?.id,
      status: sub?.status ?? 'active',
      seatCount: totalPaidSeats,
      billingInterval: interval,
      billingTerms: sub?.billingTerms ?? 'card',
      currentPeriodStart: sub?.currentPeriodStart,
      currentPeriodEnd: sub?.currentPeriodEnd,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      pendingSeatChange: sub?.pendingSeatChange ?? false,
      seatVersion: sub?.seatVersion ?? 0,
      trialEndsAt: sub?.trialEndsAt,
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
    },
    seats: {
      totalPaid: totalPaidSeats,
      activeBillable: activeBillableSeats,
      pendingBillable: pendingBillableInvites,
      usedBillable: billableSeatsUsed,
      totalBillableUsed: billableSeatsUsed,
      vacant: vacantSeats,
    },
    guests: {
      active: activeGuests,
      pending: pendingGuests,
      total: totalGuests,
      activeGuests: activeGuests,
      pendingGuests: pendingGuests,
      usedGuests: totalGuests,
      cap: guestCap,
      guestCap: guestCap,
      isOverCap: totalGuests > guestCap,
      isOverLimit: totalGuests > guestCap,
    },
    pricing: {
      monthlyRatePerSeat,
      annualRatePerSeat,
      estimatedMonthlyTotal,
    },
    invoices: invoiceList,
  };
}

// ─── Atomic Seat Slot Check & Reservation (FOR UPDATE lock) ───────────────────
export async function checkAndReserveSeatSlot(
  orgId: string,
  role: string
): Promise<{
  allowed: boolean;
  requiresProration: boolean;
  requiresGuestOverage: boolean;
  vacantSeats: number;
  guestCap: number;
  currentGuests: number;
  message?: string;
}> {
  return await db.transaction(async (tx) => {
    // 1. Lock subscription row
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .for('update');

    const totalPaidSeats = sub?.seatCount ?? 5;
    const isBillable = isBillableRole(role);

    if (isBillable) {
      // Count billable seats
      const activeCount = await tx
        .select({ count: count() })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.status, 'active'),
            sql`${organizationMembers.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
          )
        );
      const pendingCount = await tx
        .select({ count: count() })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, orgId),
            eq(invitations.status, 'pending'),
            sql`${invitations.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
          )
        );

      const totalBillable =
        Number(activeCount[0]?.count ?? 0) + Number(pendingCount[0]?.count ?? 0);

      if (totalBillable < totalPaidSeats) {
        return {
          allowed: true,
          requiresProration: false,
          requiresGuestOverage: false,
          vacantSeats: totalPaidSeats - totalBillable,
          guestCap: 0,
          currentGuests: 0,
        };
      }

      return {
        allowed: false,
        requiresProration: true,
        requiresGuestOverage: false,
        vacantSeats: 0,
        guestCap: 0,
        currentGuests: 0,
        message: `Your organization is using all ${totalPaidSeats} paid seats. Please confirm adding a billable seat to proceed.`,
      };
    } else {
      // Guest / Viewer role
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
      const plan = sub?.planId
        ? await tx.query.plans.findFirst({ where: eq(plans.id, sub.planId) })
        : org?.planId
          ? await tx.query.plans.findFirst({ where: eq(plans.id, org.planId) })
          : null;

      const guestCap = getGuestCap(plan?.tier ?? 'free', totalPaidSeats);

      const activeGuests = await tx
        .select({ count: count() })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.status, 'active'),
            eq(organizationMembers.role, 'viewer')
          )
        );
      const pendingGuests = await tx
        .select({ count: count() })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, orgId),
            eq(invitations.status, 'pending'),
            eq(invitations.role, 'viewer')
          )
        );

      const totalGuests =
        Number(activeGuests[0]?.count ?? 0) + Number(pendingGuests[0]?.count ?? 0);

      if (totalGuests < guestCap) {
        return {
          allowed: true,
          requiresProration: false,
          requiresGuestOverage: false,
          vacantSeats: 0,
          guestCap,
          currentGuests: totalGuests,
        };
      }

      return {
        allowed: false,
        requiresProration: false,
        requiresGuestOverage: true,
        vacantSeats: 0,
        guestCap,
        currentGuests: totalGuests,
        message: `Your organization has reached the limit of ${guestCap} guest seats on your current plan.`,
      };
    }
  });
}

// ─── Proration Preview ────────────────────────────────────────────────────────
export async function previewSeatChange(orgId: string, additionalSeats: number) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, orgId),
  });

  if (!sub?.stripeCustomerId || !sub?.stripeSubscriptionId || !sub?.stripeSubscriptionItemId) {
    // If not on Stripe (e.g. Free or dev), calculate standard estimated pricing
    const plan = sub?.planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) })
      : null;
    const unitPrice = plan?.tier === 'business' ? 20 : 10;
    return {
      immediateAmountDue: unitPrice * additionalSeats * 100, // cents
      nextPeriodAmount: unitPrice * ((sub?.seatCount ?? 1) + additionalSeats) * 100,
      currency: 'usd',
      isEstimated: true,
    };
  }

  const newQuantity = (sub.seatCount ?? 1) + additionalSeats;

  try {
    const preview = await previewProratedInvoice({
      customerId: sub.stripeCustomerId,
      subscriptionId: sub.stripeSubscriptionId,
      subscriptionItemId: sub.stripeSubscriptionItemId,
      newQuantity,
    });
    return { ...preview, isEstimated: false };
  } catch (err) {
    logger.warn({ err, orgId }, 'Failed to preview Stripe prorated invoice, returning estimate');
    const unitPrice = 10;
    return {
      immediateAmountDue: unitPrice * additionalSeats * 100,
      nextPeriodAmount: unitPrice * newQuantity * 100,
      currency: 'usd',
      isEstimated: true,
    };
  }
}

// ─── Seat Increase (Immediate Proration) ───────────────────────────────────────
export async function increaseSeats(
  orgId: string,
  additionalSeats: number,
  idempotencyKey: string
) {
  // Read the subscription BEFORE opening a transaction.
  //
  // The Stripe call is network I/O with a 10s timeout. It used to run inside
  // db.transaction() while holding a SELECT ... FOR UPDATE row lock and one of
  // the five pooled connections, so a slow Stripe response pinned the row and
  // blocked every concurrent billing request for the org. The transaction below
  // now only contains the two writes, and re-validates the quantity it was
  // given so a concurrent change cannot be silently overwritten.
  const [pre] = await db
    .select({
      id: subscriptions.id,
      seatCount: subscriptions.seatCount,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeSubscriptionItemId: subscriptions.stripeSubscriptionItemId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);

  if (!pre) {
    throw new Error('Subscription not found');
  }

  const newQuantity = (pre.seatCount ?? 1) + additionalSeats;

  if (pre.stripeSubscriptionId && pre.stripeSubscriptionItemId && env.STRIPE_SECRET_KEY) {
    await updateSubscriptionSeatQuantity({
      subscriptionId: pre.stripeSubscriptionId,
      subscriptionItemId: pre.stripeSubscriptionItemId,
      newQuantity,
      prorationBehavior: 'create_prorations',
      idempotencyKey,
    });
  }

  return await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .for('update');

    if (!sub) {
      throw new Error('Subscription not found');
    }

    if ((sub.seatCount ?? 1) + additionalSeats !== newQuantity) {
      throw new Error(
        'Subscription seat count changed while the request was in flight — please retry.'
      );
    }

    // Record seat change request
    await tx
      .insert(seatChangeRequests)
      .values({
        subscriptionId: sub.id,
        requestedQuantity: newQuantity,
        direction: SeatChangeDirection.Increase,
        stripeIdempotencyKey: idempotencyKey,
        status: SeatChangeStatus.Pending,
      })
      .onConflictDoNothing();

    // Set pendingSeatChange flag (seatCount will be updated by webhook for strict single-source-of-truth)
    await tx
      .update(subscriptions)
      .set({
        pendingSeatChange: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    return {
      success: true,
      pendingQuantity: newQuantity,
      message: `Seat increase to ${newQuantity} seats initiated. Prorated charges applied.`,
    };
  });
}

// ─── Scheduled Seat Decrease (No Refund, Period Boundary) ─────────────────────
export async function scheduleSeatDecrease(
  orgId: string,
  targetSeatCount: number,
  idempotencyKey: string
) {
  // Read + validate + call Stripe BEFORE opening a transaction — see the note on
  // increaseSeats above. The member-count gate needs no row lock, and the Stripe
  // schedule call must not hold one.
  const [pre] = await db
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeSubscriptionItemId: subscriptions.stripeSubscriptionItemId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);

  if (!pre) {
    throw new Error('Subscription not found');
  }

  const activeCount = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.status, 'active'),
        sql`${organizationMembers.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
      )
    );
  const activeBillable = Number(activeCount[0]?.count ?? 0);

  if (targetSeatCount < activeBillable) {
    throw new Error(
      `Cannot downsize to ${targetSeatCount} seats. You currently have ${activeBillable} active billable members. Deactivate members first.`
    );
  }

  if (pre.stripeSubscriptionId && pre.stripeSubscriptionItemId && env.STRIPE_SECRET_KEY) {
    await scheduleSubscriptionSeatDecrease({
      subscriptionId: pre.stripeSubscriptionId,
      subscriptionItemId: pre.stripeSubscriptionItemId,
      newQuantity: targetSeatCount,
      idempotencyKey,
    });
  }

  return await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .for('update');

    if (!sub) {
      throw new Error('Subscription not found');
    }

    // Record seat change request
    await tx
      .insert(seatChangeRequests)
      .values({
        subscriptionId: sub.id,
        requestedQuantity: targetSeatCount,
        direction: SeatChangeDirection.Decrease,
        stripeIdempotencyKey: idempotencyKey,
        status: SeatChangeStatus.Pending,
      })
      .onConflictDoNothing();

    await tx
      .update(subscriptions)
      .set({
        pendingSeatChange: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    return {
      success: true,
      scheduledQuantity: targetSeatCount,
      effectiveDate: sub.currentPeriodEnd,
      message: `Downsize to ${targetSeatCount} seats scheduled for next renewal date (${sub.currentPeriodEnd?.toISOString().split('T')[0] ?? 'end of period'}).`,
    };
  });
}

// ─── Cancellation Gate ────────────────────────────────────────────────────────
/** Declared explicitly: the gate short-circuits before the transaction, so the
 * inferred return type is a union the callers would otherwise have to narrow. */
export type CancellationResult =
  | {
      allowed: false;
      activeBillableMembers: number;
      maxAllowedForFree: number;
      message: string;
    }
  | {
      allowed: true;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
      message: string;
    };

export async function requestSubscriptionCancellation(orgId: string): Promise<CancellationResult> {
  const [sub] = await db
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);

  if (!sub) {
    throw new Error('Subscription not found');
  }

  // Check active billable members
  const activeCount = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.status, 'active'),
        sql`${organizationMembers.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
      )
    );
  const activeBillable = Number(activeCount[0]?.count ?? 0);

  if (activeBillable > 5) {
    return {
      allowed: false,
      activeBillableMembers: activeBillable,
      maxAllowedForFree: 5,
      message: `You currently have ${activeBillable} active billable members. The Free plan supports a maximum of 5 members. Please deactivate or remove members down to 5 before canceling.`,
    };
  }

  // Stripe call outside the transaction — see increaseSeats.
  if (sub.stripeSubscriptionId && env.STRIPE_SECRET_KEY) {
    const s = stripe();
    await s.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  return await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    return {
      allowed: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: sub.currentPeriodEnd,
      message: 'Subscription cancellation scheduled at the end of current billing period.',
    };
  });
}

// ─── Checkout Session Creation ────────────────────────────────────────────────
export async function createCheckout(opts: {
  orgId: string;
  planTier: 'pro' | 'business';
  billingInterval: 'monthly' | 'annual';
  seatCount: number;
  userEmail: string;
  idempotencyKey: string;
}) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, opts.orgId),
  });
  if (!org) throw new Error('Organization not found');

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, opts.orgId),
  });

  // Resolve Price ID
  let priceId = '';
  if (opts.planTier === 'pro') {
    priceId =
      opts.billingInterval === 'annual'
        ? env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual'
        : env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly';
  } else if (opts.planTier === 'business') {
    priceId =
      opts.billingInterval === 'annual'
        ? env.STRIPE_BUSINESS_ANNUAL_PRICE_ID || 'price_biz_annual'
        : env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_biz_monthly';
  }

  const successUrl = `${env.DASHBOARD_URL.split(',')[0]}/admin/billing?session_id={CHECKOUT_SESSION_ID}&success=true`;
  const cancelUrl = `${env.DASHBOARD_URL.split(',')[0]}/admin/billing?canceled=true`;

  const session = await createCheckoutSession({
    priceId,
    quantity: Math.max(opts.planTier === 'business' ? 5 : 1, opts.seatCount),
    orgId: opts.orgId,
    orgName: org.name,
    customerEmail: opts.userEmail,
    stripeCustomerId: sub?.stripeCustomerId,
    successUrl,
    cancelUrl,
    trialDays: 14,
    idempotencyKey: opts.idempotencyKey,
    metadata: {
      plan_tier: opts.planTier,
      billing_interval: opts.billingInterval,
    },
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  };
}

// ─── Customer Portal Link ─────────────────────────────────────────────────────
/** Return URLs must stay on our own dashboard origins (no open redirect). */
function resolvePortalReturnUrl(returnUrl?: string): string {
  const fallback = `${env.DASHBOARD_URL.split(',')[0]}/admin/billing`;
  if (!returnUrl) return fallback;
  try {
    const origin = new URL(returnUrl).origin;
    const allowed = new Set(
      env.DASHBOARD_URL.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new URL(s).origin)
    );
    if (allowed.has(origin)) return returnUrl;
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export async function getCustomerPortalUrl(orgId: string, returnUrl?: string) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, orgId),
  });

  if (!sub?.stripeCustomerId) {
    throw new Error('No Stripe customer record found for this organization.');
  }

  const redirectUrl = resolvePortalReturnUrl(returnUrl);
  const portalSession = await createBillingPortalSession({
    stripeCustomerId: sub.stripeCustomerId,
    returnUrl: redirectUrl,
  });

  return { portalUrl: portalSession.url };
}

// ─── Webhook Processor (Sole Writer for Subscriptions) ─────────────────────────
export type BillingEventStatus = 'processing' | 'done' | 'failed';

/**
 * How long a `processing` claim is honoured before another delivery may take it
 * over. Stripe retries webhook failures for up to 3 days, so a generous window
 * is safe: the point is to recover from a crashed handler, not to race a live one.
 */
const CLAIM_TAKEOVER_MS = 5 * 60_000;

type ClaimOutcome = 'claimed' | 'skip' | 'proceed';

/**
 * Claims a webhook event id BEFORE any side effect.
 *
 * The previous shape inserted its `billing_events` row only after the handler
 * finished, which broke idempotency in two directions: a crash mid-handler left
 * no row so the retry re-applied everything, and the failure path inserted a row
 * that the retry matched as "already processed" and skipped — dropping the event
 * permanently. Claiming first, with an explicit status, makes both recoverable:
 * a stale `processing` claim is taken over after the takeover window, a `failed`
 * row is retried, and only `done` is skipped.
 */
async function claimBillingEvent(event: Stripe.Event): Promise<ClaimOutcome> {
  const payload = event.data.object as unknown as Record<string, unknown>;

  const inserted = await db
    .insert(billingEvents)
    .values({
      stripeEventId: event.id,
      eventType: event.type,
      payload,
      status: 'processing',
      claimedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: billingEvents.id });

  if (inserted.length > 0) return 'claimed';

  const [existing] = await db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, event.id))
    .limit(1);

  // Row disappeared between the insert and the read — treat as unclaimed.
  if (!existing) return 'proceed';

  if (existing.status === 'done') return 'skip';

  if (existing.status === 'processing') {
    const age = existing.claimedAt
      ? Date.now() - existing.claimedAt.getTime()
      : Number.POSITIVE_INFINITY;
    // A live handler still owns it — leave it alone.
    if (age < CLAIM_TAKEOVER_MS) return 'skip';
    logger.warn(
      { eventId: event.id, ageMs: age },
      'Taking over stale processing claim for Stripe webhook'
    );
    await db
      .update(billingEvents)
      .set({ status: 'processing', claimedAt: new Date(), error: null })
      .where(and(eq(billingEvents.id, existing.id), eq(billingEvents.status, 'processing')));
    return 'proceed';
  }

  // status === 'failed' — a previous attempt did not complete; retry it.
  await db
    .update(billingEvents)
    .set({ status: 'processing', claimedAt: new Date(), error: null })
    .where(and(eq(billingEvents.id, existing.id), eq(billingEvents.status, 'failed')));
  return 'proceed';
}

async function markBillingEvent(
  eventId: string,
  status: Exclude<BillingEventStatus, 'processing'>,
  error?: string
): Promise<void> {
  await db
    .update(billingEvents)
    .set({ status, error: error ?? null, processedAt: new Date() })
    .where(eq(billingEvents.stripeEventId, eventId));
}

export async function processStripeWebhook(event: Stripe.Event) {
  logger.info({ eventType: event.type, eventId: event.id }, 'Processing Stripe webhook event');

  const claim = await claimBillingEvent(event);
  if (claim === 'skip') {
    logger.info({ eventId: event.id }, 'Webhook event already processed (idempotent skip)');
    return { received: true, alreadyProcessed: true };
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;
        const planTier = session.metadata?.plan_tier as 'pro' | 'business' | undefined;
        const interval = (session.metadata?.billing_interval as 'monthly' | 'annual') || 'monthly';

        if (orgId && session.subscription) {
          const s = stripe();
          const stripeSub = await s.subscriptions.retrieve(session.subscription as string);
          const customerId = session.customer as string;
          const subItemId = stripeSub.items.data[0]?.id;
          const seatQuantity = stripeSub.items.data[0]?.quantity ?? 1;

          // Find plan record
          const targetPlan = await db.query.plans.findFirst({
            where: eq(plans.tier, planTier ?? 'pro'),
          });

          await db.transaction(async (tx) => {
            // Update organization planId
            if (targetPlan) {
              await tx
                .update(organizations)
                .set({ planId: targetPlan.id, updatedAt: new Date() })
                .where(eq(organizations.id, orgId));
            }

            // Update subscription
            if (targetPlan) {
              const pStart = (stripeSub as any).current_period_start
                ? new Date((stripeSub as any).current_period_start * 1000)
                : new Date();
              const pEnd = (stripeSub as any).current_period_end
                ? new Date((stripeSub as any).current_period_end * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              await tx
                .insert(subscriptions)
                .values({
                  organizationId: orgId,
                  planId: targetPlan.id,
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: stripeSub.id,
                  stripeSubscriptionItemId: subItemId,
                  billingInterval: interval,
                  status: 'active',
                  seatCount: seatQuantity,
                  currentPeriodStart: pStart,
                  currentPeriodEnd: pEnd,
                  cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
                  pendingSeatChange: false,
                })
                .onConflictDoUpdate({
                  target: subscriptions.organizationId,
                  set: {
                    planId: targetPlan.id,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: stripeSub.id,
                    stripeSubscriptionItemId: subItemId,
                    billingInterval: interval,
                    status: 'active',
                    seatCount: seatQuantity,
                    currentPeriodStart: pStart,
                    currentPeriodEnd: pEnd,
                    cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
                    pendingSeatChange: false,
                    updatedAt: new Date(),
                  },
                });
            }
          });

          // Dispatch confirmation email
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, orgId),
          });
          const adminMember = await db.query.organizationMembers.findFirst({
            where: and(
              eq(organizationMembers.organizationId, orgId),
              eq(organizationMembers.role, 'org_owner')
            ),
          });
          const adminUser = adminMember
            ? await db.query.users.findFirst({ where: eq(users.id, adminMember.userId) })
            : null;

          if (adminUser?.email && org) {
            const emailData = renderSubscriptionActivatedEmail({
              orgName: org.name,
              planName: planTier === 'business' ? 'Boardly Business' : 'Boardly Pro',
              seatCount: seatQuantity,
              billingInterval: interval,
              amount:
                planTier === 'business' ? `$${seatQuantity * 20}/mo` : `$${seatQuantity * 10}/mo`,
              manageUrl: `${env.DASHBOARD_URL.split(',')[0]}/admin/billing`,
            });
            sendEmail({
              to: adminUser.email,
              subject: emailData.subject,
              html: emailData.html,
              text: emailData.text,
            }).catch((e) => logger.warn({ e }, 'Failed to send subscription activation email'));
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const customerId = stripeSub.customer as string;

        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.stripeCustomerId, customerId),
        });

        if (sub) {
          const seatQuantity = stripeSub.items.data[0]?.quantity ?? sub.seatCount;
          const status =
            stripeSub.status === 'past_due'
              ? 'past_due'
              : stripeSub.status === 'canceled'
                ? 'canceled'
                : 'active';
          const pStart = (stripeSub as any).current_period_start
            ? new Date((stripeSub as any).current_period_start * 1000)
            : new Date();
          const pEnd = (stripeSub as any).current_period_end
            ? new Date((stripeSub as any).current_period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          await db
            .update(subscriptions)
            .set({
              seatCount: seatQuantity,
              status: status,
              currentPeriodStart: pStart,
              currentPeriodEnd: pEnd,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
              pendingSeatChange: false,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, sub.id));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const customerId = stripeSub.customer as string;

        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.stripeCustomerId, customerId),
        });

        if (sub) {
          // Re-validate member count
          const activeCount = await db
            .select({ count: count() })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, sub.organizationId),
                eq(organizationMembers.status, 'active'),
                sql`${organizationMembers.role} IN ('org_owner', 'org_admin', 'billing_manager', 'workspace_admin', 'member')`
              )
            );
          const activeBillable = Number(activeCount[0]?.count ?? 0);

          if (activeBillable <= 5) {
            // Downgrade cleanly to Free
            const freePlan = await db.query.plans.findFirst({ where: eq(plans.tier, 'free') });
            if (freePlan) {
              await db
                .update(organizations)
                .set({ planId: freePlan.id, updatedAt: new Date() })
                .where(eq(organizations.id, sub.organizationId));

              await db
                .update(subscriptions)
                .set({
                  planId: freePlan.id,
                  status: 'canceled',
                  seatCount: 5,
                  cancelAtPeriodEnd: false,
                  updatedAt: new Date(),
                })
                .where(eq(subscriptions.id, sub.id));
            }
          } else {
            // Put in past_due_downgrade_pending status
            await db
              .update(subscriptions)
              .set({
                status: 'past_due_downgrade_pending',
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, sub.id));
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.stripeCustomerId, customerId),
        });

        if (sub) {
          await db
            .update(subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));

          // Alert Billing Managers
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, sub.organizationId),
          });
          const adminMembers = await db.query.organizationMembers.findMany({
            where: and(
              eq(organizationMembers.organizationId, sub.organizationId),
              sql`${organizationMembers.role} IN ('org_owner', 'billing_manager')`
            ),
          });

          // Single batched user fetch (was: one query per member in the loop).
          const memberEmails = await db.query.users.findMany({
            columns: { email: true },
            where: inArray(
              users.id,
              adminMembers.map((m) => m.userId)
            ),
          });

          for (const u of memberEmails) {
            if (u?.email && org) {
              const emailData = renderPaymentFailedEmail({
                orgName: org.name,
                amountDue: `$${(invoice.amount_due / 100).toFixed(2)}`,
                updatePaymentUrl: `${env.DASHBOARD_URL.split(',')[0]}/admin/billing`,
                gracePeriodDays: 7,
              });
              sendEmail({
                to: u.email,
                subject: emailData.subject,
                html: emailData.html,
                text: emailData.text,
              }).catch((e) => logger.warn({ e }, 'Failed to dispatch payment failed email'));
            }
          }
        }
        break;
      }

      default:
        break;
    }

    // Side effects committed — the claim becomes final.
    await markBillingEvent(event.id, 'done');
    return { received: true };
  } catch (err: unknown) {
    logger.error({ err, eventId: event.id }, 'Error processing webhook event');
    // Recorded as `failed`, not `done`: Stripe's retry must be allowed to
    // re-attempt, which the old error-row-then-"already processed" path
    // prevented, silently dropping the event on any transient failure.
    await markBillingEvent(event.id, 'failed', errorMessage(err)).catch((markErr: unknown) => {
      logger.error({ markErr, eventId: event.id }, 'Failed to mark webhook event as failed');
    });
    throw err;
  }
}
