import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError, errorMessage } from '../../lib/errors';
import { constructWebhookEvent } from '../../lib/stripe';
import {
  getBillingOverview,
  previewSeatChange,
  increaseSeats,
  scheduleSeatDecrease,
  requestSubscriptionCancellation,
  createCheckout,
  getCustomerPortalUrl,
  processStripeWebhook,
} from './service';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/email';
import { env } from '../../lib/env';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const billingRoutes = new Elysia({ prefix: '/billing', tags: ['Billing'] })
  // ─── Public Stripe Webhook Receiver ──────────────────────────────────────────
  //
  // Status codes matter to Stripe and must not be collapsed into one catch:
  //   * 400 = the request itself is bad (missing or invalid signature). Stripe
  //     does NOT retry these, which is correct — replaying a forged event is
  //     pointless.
  //   * 500 = we could not process a legitimately signed event (database blip,
  //     Stripe API failure). Stripe DOES retry these, and the claim state in
  //     billing_events makes the retry safe. Returning 400 here silently
  //     discarded billing events on any transient failure.
  //
  // The response body is intentionally generic: this endpoint is
  // unauthenticated, so internal error text must not reach the caller.
  .post('/webhook', async ({ request, set }) => {
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      set.status = 400;
      return { error: 'Missing stripe-signature header' };
    }

    let event;
    try {
      const rawBody = await request.text();
      event = constructWebhookEvent(rawBody, signature);
    } catch (err: unknown) {
      logger.warn({ err: errorMessage(err) }, 'Stripe webhook signature validation failed');
      set.status = 400;
      return { error: 'Invalid webhook signature' };
    }

    try {
      return await processStripeWebhook(event);
    } catch (err: unknown) {
      logger.error({ err, eventId: event.id }, 'Stripe webhook processing failed');
      set.status = 500;
      return { error: 'Webhook processing failed' };
    }
  })

  // ─── Authenticated Billing Endpoints ─────────────────────────────────────────
  .use(authPlugin)

  // GET /v1/billing/overview
  .get(
    '/overview',
    async ({ user, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        return await getBillingOverview(user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('billing.read') }
  )

  // POST /v1/billing/checkout
  .post(
    '/checkout',
    async ({ user, body, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        const userRecord = await db.query.users.findFirst({
          where: eq(users.id, user.userId),
        });
        const userEmail = userRecord?.email || 'admin@boardly.app';
        const idempotencyKey = body.idempotencyKey || `chk_${user.organizationId}_${Date.now()}`;
        return await createCheckout({
          orgId: user.organizationId,
          planTier: body.planTier,
          billingInterval: body.billingInterval,
          seatCount: body.seatCount ?? 1,
          userEmail,
          idempotencyKey,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        planTier: t.Union([t.Literal('pro'), t.Literal('business')]),
        billingInterval: t.Union([t.Literal('monthly'), t.Literal('annual')]),
        seatCount: t.Optional(t.Number()),
        idempotencyKey: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/billing/seats/preview
  .post(
    '/seats/preview',
    async ({ user, body, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        return await previewSeatChange(user.organizationId, body.additionalSeats ?? 1);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        additionalSeats: t.Optional(t.Number()),
      }),
    }
  )

  // POST /v1/billing/seats/increase
  .post(
    '/seats/increase',
    async ({ user, body, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        const idempotencyKey = body.idempotencyKey || `inc_${user.organizationId}_${Date.now()}`;
        return await increaseSeats(user.organizationId, body.additionalSeats ?? 1, idempotencyKey);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        additionalSeats: t.Number(),
        idempotencyKey: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/billing/seats/schedule-decrease
  .post(
    '/seats/schedule-decrease',
    async ({ user, body, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        const idempotencyKey = body.idempotencyKey || `dec_${user.organizationId}_${Date.now()}`;
        return await scheduleSeatDecrease(
          user.organizationId,
          body.targetSeatCount,
          idempotencyKey
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        targetSeatCount: t.Number(),
        idempotencyKey: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/billing/cancel
  .post(
    '/cancel',
    async ({ user, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        return await requestSubscriptionCancellation(user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('org.update') }
  )

  // POST /v1/billing/portal
  .post(
    '/portal',
    async ({ user, body, set }) => {
      try {
        if (!user?.organizationId) {
          set.status = 400;
          return { error: 'Active organization required' };
        }
        return await getCustomerPortalUrl(user.organizationId, (body as any)?.returnUrl);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Optional(
        t.Object({
          returnUrl: t.Optional(t.String()),
        })
      ),
    }
  )

  // POST /v1/billing/enterprise/request-quote
  .post(
    '/enterprise/request-quote',
    async ({ user, body, set }) => {
      try {
        const userRecord = await db.query.users.findFirst({
          where: eq(users.id, user.userId),
        });

        const lead = {
          userId: user?.userId,
          userEmail: userRecord?.email,
          orgId: user?.organizationId,
          companyName: body.companyName,
          teamSize: body.teamSize,
          requirements: body.requirements ?? 'Enterprise Tier Inquiry',
          submittedAt: new Date().toISOString(),
        };

        logger.info({ lead }, 'Enterprise sales quote requested');

        // Alert sales desk via email
        const emailFromStr = env.EMAIL_FROM || '';
        const targetEmail =
          emailFromStr.includes('<') && emailFromStr.includes('>')
            ? emailFromStr.split('<')[1]?.replace('>', '') || 'sales@boardly.app'
            : emailFromStr || 'sales@boardly.app';

        sendEmail({
          to: targetEmail,
          subject: `🏢 Enterprise Lead: ${body.companyName} (${body.teamSize} seats)`,
          html: `
            <h2>New Enterprise Quote Request</h2>
            <p><strong>Company:</strong> ${body.companyName}</p>
            <p><strong>Team Size:</strong> ${body.teamSize} seats</p>
            <p><strong>Contact:</strong> ${userRecord?.email ?? 'Unknown'}</p>
            <p><strong>Requirements:</strong> ${body.requirements ?? 'N/A'}</p>
          `,
          text: `Enterprise Quote Request from ${body.companyName} (${userRecord?.email}) - ${body.teamSize} seats`,
        }).catch((e) => logger.warn({ e }, 'Failed to send enterprise lead email'));

        return {
          success: true,
          message:
            'Thank you! Our enterprise sales engineering team will reach out within 1 business day.',
        };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        companyName: t.String(),
        teamSize: t.String(),
        requirements: t.Optional(t.String()),
      }),
    }
  );
