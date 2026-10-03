import Stripe from 'stripe';
import { env } from './env';

/**
 * Stripe SDK singleton for Boardly.
 * Instantiated lazily — safe to import in non-billing code paths without error.
 * Will throw at runtime if STRIPE_SECRET_KEY is not configured and billing endpoints are called.
 */
function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. Add it to your .env file to enable billing features.'
    );
  }
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-08-26.dahlia',
    typescript: true,
    // Bound every outbound call. stripe-node otherwise defaults to an 80s
    // timeout, which is long enough to pin a request handler (and, before the
    // rate limiter's own 400ms race, the whole event loop) on an unresponsive
    // Stripe API. Billing callers — the webhook receiver especially — must fail
    // fast so the claim state and Stripe's own retry drive recovery.
    timeout: 10_000,
    maxNetworkRetries: 2,
  });
}

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = getStripeClient();
  }
  return _stripe;
}

// ─── Checkout ──────────────────────────────────────────────────────────────────

export interface CreateCheckoutOptions {
  priceId: string;
  quantity: number;
  orgId: string;
  orgName: string;
  customerEmail: string;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(
  opts: CreateCheckoutOptions
): Promise<Stripe.Checkout.Session> {
  const s = stripe();

  return s.checkout.sessions.create(
    {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: opts.priceId, quantity: opts.quantity }],
      customer: opts.stripeCustomerId ?? undefined,
      customer_email: opts.stripeCustomerId ? undefined : opts.customerEmail,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      subscription_data: {
        trial_period_days: opts.trialDays ?? undefined,
        metadata: {
          org_id: opts.orgId,
          org_name: opts.orgName,
          ...opts.metadata,
        },
      },
      metadata: {
        org_id: opts.orgId,
        org_name: opts.orgName,
        ...opts.metadata,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    },
    {
      idempotencyKey: opts.idempotencyKey,
    }
  );
}

// ─── Billing Portal ────────────────────────────────────────────────────────────

export interface CreatePortalOptions {
  stripeCustomerId: string;
  returnUrl: string;
}

export async function createBillingPortalSession(
  opts: CreatePortalOptions
): Promise<Stripe.BillingPortal.Session> {
  const s = stripe();
  return s.billingPortal.sessions.create({
    customer: opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });
}

// ─── Webhook ───────────────────────────────────────────────────────────────────

export function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }
  return stripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export async function getOrCreateStripeCustomer(opts: {
  orgId: string;
  orgName: string;
  email: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const s = stripe();
  if (opts.existingCustomerId) {
    return opts.existingCustomerId;
  }
  const customer = await s.customers.create({
    email: opts.email,
    name: opts.orgName,
    metadata: { org_id: opts.orgId },
  });
  return customer.id;
}

// ─── Subscription Modification & Proration Helpers ─────────────────────────────

export interface UpdateSeatQuantityOptions {
  subscriptionId: string;
  subscriptionItemId: string;
  newQuantity: number;
  prorationBehavior: 'create_prorations' | 'none' | 'always_invoice';
  idempotencyKey: string;
}

export async function updateSubscriptionSeatQuantity(
  opts: UpdateSeatQuantityOptions
): Promise<Stripe.Subscription> {
  const s = stripe();
  return s.subscriptions.update(
    opts.subscriptionId,
    {
      items: [
        {
          id: opts.subscriptionItemId,
          quantity: opts.newQuantity,
        },
      ],
      proration_behavior: opts.prorationBehavior,
    },
    {
      idempotencyKey: opts.idempotencyKey,
    }
  );
}

export async function scheduleSubscriptionSeatDecrease(opts: {
  subscriptionId: string;
  subscriptionItemId: string;
  newQuantity: number;
  idempotencyKey: string;
}): Promise<Stripe.SubscriptionSchedule | Stripe.Subscription> {
  const s = stripe();
  const sub: any = await s.subscriptions.retrieve(opts.subscriptionId);

  const priceId = sub.items?.data?.[0]?.price?.id;
  const currentQuantity = sub.items?.data?.[0]?.quantity ?? 1;
  const periodStart = sub.current_period_start;
  const periodEnd = sub.current_period_end;

  if (sub.schedule) {
    return s.subscriptionSchedules.update(
      sub.schedule as string,
      {
        phases: [
          {
            items: [{ price: priceId, quantity: currentQuantity }],
            start_date: periodStart,
            end_date: periodEnd,
          },
          {
            items: [{ price: priceId, quantity: opts.newQuantity }],
            start_date: periodEnd,
          },
        ],
      },
      { idempotencyKey: opts.idempotencyKey }
    );
  }

  const schedule = await s.subscriptionSchedules.create(
    {
      from_subscription: opts.subscriptionId,
    },
    { idempotencyKey: `${opts.idempotencyKey}_sched` }
  );

  return s.subscriptionSchedules.update(
    schedule.id,
    {
      phases: [
        {
          items: [{ price: priceId, quantity: currentQuantity }],
          start_date: periodStart,
          end_date: periodEnd,
        },
        {
          items: [{ price: priceId, quantity: opts.newQuantity }],
          start_date: periodEnd,
        },
      ],
    },
    { idempotencyKey: opts.idempotencyKey }
  );
}

export async function previewProratedInvoice(opts: {
  customerId: string;
  subscriptionId: string;
  subscriptionItemId: string;
  newQuantity: number;
}): Promise<{ immediateAmountDue: number; nextPeriodAmount: number; currency: string }> {
  const s = stripe();
  // Using invoice preview / upcoming
  const invoiceService: any = s.invoices;
  const upcoming = await (invoiceService.createPreview
    ? invoiceService.createPreview({
        customer: opts.customerId,
        subscription: opts.subscriptionId,
        subscription_details: {
          items: [{ id: opts.subscriptionItemId, quantity: opts.newQuantity }],
        },
      })
    : invoiceService.retrieveUpcoming({
        customer: opts.customerId,
        subscription: opts.subscriptionId,
        subscription_items: [{ id: opts.subscriptionItemId, quantity: opts.newQuantity }],
      }));

  return {
    immediateAmountDue: upcoming.amount_due ?? 0,
    nextPeriodAmount: upcoming.total ?? 0,
    currency: upcoming.currency ?? 'usd',
  };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listInvoices(
  stripeCustomerId: string,
  limit = 10
): Promise<Stripe.Invoice[]> {
  const s = stripe();
  const invoices = await s.invoices.list({ customer: stripeCustomerId, limit });
  return invoices.data;
}
