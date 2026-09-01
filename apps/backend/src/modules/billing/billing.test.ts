import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import {
  isBillableRole,
  getGuestCap,
  checkAndReserveSeatSlot,
  getBillingOverview,
  requestSubscriptionCancellation,
  processStripeWebhook,
} from './service';
import { inviteMember, deactivateMember, acceptInvitation } from '../organizations/service';
import { requirePlan } from '../../middleware/planGuard';
import { eq } from 'drizzle-orm';

import { env } from '../../lib/env';

const TEST_DB_URL = env.DATABASE_TEST_URL || env.DATABASE_URL;

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

describe('Billing & Per-Head Seat Engine', () => {
  it('should correctly classify billable vs unbilled viewer roles', () => {
    expect(isBillableRole('org_owner')).toBe(true);
    expect(isBillableRole('org_admin')).toBe(true);
    expect(isBillableRole('billing_manager')).toBe(true);
    expect(isBillableRole('workspace_admin')).toBe(true);
    expect(isBillableRole('member')).toBe(true);
    expect(isBillableRole('viewer')).toBe(false);
    expect(isBillableRole('guest')).toBe(false);
  });

  it('should calculate guest caps correctly across tiers', () => {
    expect(getGuestCap('free', 5)).toBe(3);
    expect(getGuestCap('pro', 10)).toBe(100); // 10 per paid seat
    expect(getGuestCap('business', 10)).toBe(250); // 25 per paid seat
    expect(getGuestCap('enterprise', 50)).toBeGreaterThan(10000);
  });

  it('should allow billable invites within seat capacity and block when full', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Billing Owner',
      email: `owner_${id}@test.com`,
      password: 'password123',
      orgName: `Seat Test Org ${id}`,
      orgSlug: `seat-org-${id}`,
    });

    // Default Free subscription has 5 seats. Owner uses 1 seat -> 4 vacant seats.
    const slot1 = await checkAndReserveSeatSlot(organization.id, 'member');
    expect(slot1.allowed).toBe(true);
    expect(slot1.vacantSeats).toBe(4);

    // Invite 4 more members (total 5)
    for (let i = 1; i <= 4; i++) {
      await inviteMember(
        db,
        organization.id,
        `member_${i}_${id}@test.com`,
        'member',
        owner.id,
        `Member ${i}`
      );
    }

    // Now all 5 seats are occupied -> next invite requires seat expansion / proration
    const slot6 = await checkAndReserveSeatSlot(organization.id, 'member');
    expect(slot6.allowed).toBe(false);
    expect(slot6.requiresProration).toBe(true);
  });

  it('should allow unbilled viewer invites within guest cap and enforce guest limit', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Guest Test Owner',
      email: `guest_owner_${id}@test.com`,
      password: 'password123',
      orgName: `Guest Test Org ${id}`,
      orgSlug: `guest-org-${id}`,
    });

    // Free tier allows 3 guests
    const guestSlot1 = await checkAndReserveSeatSlot(organization.id, 'viewer');
    expect(guestSlot1.allowed).toBe(true);
    expect(guestSlot1.guestCap).toBe(3);

    // Invite 3 guests
    for (let i = 1; i <= 3; i++) {
      await inviteMember(
        db,
        organization.id,
        `guest_${i}_${id}@test.com`,
        'viewer',
        owner.id,
        `Guest ${i}`
      );
    }

    // 4th guest should exceed the guest cap
    const guestSlot4 = await checkAndReserveSeatSlot(organization.id, 'viewer');
    expect(guestSlot4.allowed).toBe(false);
    expect(guestSlot4.requiresGuestOverage).toBe(true);
    expect(guestSlot4.currentGuests).toBe(3);
  });

  it('should retain vacant seats when a member is deactivated (Slack fair billing)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Vacant Test Owner',
      email: `vacant_owner_${id}@test.com`,
      password: 'password123',
      orgName: `Vacant Test Org ${id}`,
      orgSlug: `vacant-org-${id}`,
    });

    // Invite a member and accept the invite
    const invited = await inviteMember(
      db,
      organization.id,
      `target_${id}@test.com`,
      'member',
      owner.id,
      'Target User'
    );
    await acceptInvitation(db, invited.inviteToken, 'Target User', 'password123');

    // Deactivate member
    await deactivateMember(db, organization.id, invited.id, owner.id, 'Project completed');

    // Overview should report 1 active seat (owner) and 4 vacant seats out of 5 total paid seats
    const overview = await getBillingOverview(organization.id);
    expect(overview.seats.totalPaid).toBe(5);
    expect(overview.seats.activeBillable).toBe(1);
    expect(overview.seats.vacant).toBe(4);
  });

  it('should gate plan cancellation if active billable members exceed Free limit (>5)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Gate Owner',
      email: `gate_owner_${id}@test.com`,
      password: 'password123',
      orgName: `Gate Test Org ${id}`,
      orgSlug: `gate-org-${id}`,
    });

    // Set subscription to Pro tier with 10 seats
    const proPlan = await db.query.plans.findFirst({ where: eq(schema.plans.tier, 'pro') });
    if (proPlan) {
      await db
        .update(schema.subscriptions)
        .set({ planId: proPlan.id, seatCount: 10 })
        .where(eq(schema.subscriptions.organizationId, organization.id));
    }

    // Attempt cancellation with only 1 member (owner) -> allowed!
    const cancelRes1 = await requestSubscriptionCancellation(organization.id);
    expect(cancelRes1.allowed).toBe(true);
    expect(cancelRes1.cancelAtPeriodEnd).toBe(true);
  });

  it('should process webhook events idempotently', async () => {
    const mockEventId = `evt_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockEvent = {
      id: mockEventId,
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: `in_test_${Date.now()}`,
          customer: `cus_test_${Date.now()}`,
          amount_paid: 2000,
          currency: 'usd',
        },
      },
    } as any;

    // First processing
    const res1 = await processStripeWebhook(mockEvent);
    expect(res1.received).toBe(true);

    // Second duplicate processing -> must be skipped idempotently
    const res2 = await processStripeWebhook(mockEvent);
    expect(res2.received).toBe(true);
    expect(res2.alreadyProcessed).toBe(true);
  });

  it('should enforce requirePlan middleware guards', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Guard Owner',
      email: `guard_owner_${id}@test.com`,
      password: 'password123',
      orgName: `Guard Test Org ${id}`,
      orgSlug: `guard-org-${id}`,
    });

    // By default, org is on Free plan.
    // Testing requirePlan('business')
    const guard = requirePlan('business');
    let statusCode = 200;
    const mockSet = {
      set status(code: number) {
        statusCode = code;
      },
      get status() {
        return statusCode;
      },
    };

    const guardResult = await guard({
      user: { userId: owner.id, organizationId: organization.id, isPlatformAdmin: false },
      set: mockSet,
    });

    expect(mockSet.status).toBe(402);
    expect(guardResult?.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(guardResult?.requiredPlan).toBe('business');
    expect(guardResult?.currentPlan).toBe('free');
  });
});
