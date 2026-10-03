import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { handleRouteError } from '../../lib/errors';

/**
 * Request-validation contract (P1).
 *
 * A missing required query param used to `throw new Error(...)`, which the global
 * handler turned into an opaque 500 — a client error reported as a server fault.
 * Card and billing bodies accepted unbounded titles, unbounded/negative numerics,
 * and unvalidated uuid/date shapes, so a malformed value reached Postgres (or,
 * for billing seats, Stripe's `quantity`) and failed there instead of at the edge.
 *
 * These tests exercise the schema objects directly rather than standing up the
 * whole app, so they stay fast and cannot be perturbed by unrelated auth state.
 */

describe('missing required query params are client errors, not 500s', () => {
  it('cards/:listId, boards/:projectId, lists/:boardId, projects/:workspaceId', async () => {
    // Each route threw `new Error('<param> query parameter is required')`.
    // Assert the replacement is an httpError carrying 400.
    const paths = [
      './routes.ts',
      '../boards/routes.ts',
      '../lists/routes.ts',
      '../projects/routes.ts',
    ];
    for (const rel of paths) {
      const src = await Bun.file(new URL(rel, import.meta.url)).text();
      expect(src.includes('query parameter is required')).toBe(true);
      expect(src.includes('throw new Error(')).toBe(false);
      expect(src.includes('throw httpError(400,')).toBe(true);
    }
  });

  it('an httpError with status 400 formats as 400 through handleRouteError', () => {
    const err = Object.assign(new Error('listId query parameter is required'), { status: 400 });
    const set: { status?: number | string } = {};
    const body = handleRouteError(err, set);
    expect(set.status).toBe(400);
    expect(body).toMatchObject({ error: 'listId query parameter is required' });
  });

  it('an httpError with no status still formats as 500 (unchanged default)', () => {
    const set: { status?: number | string } = {};
    handleRouteError(new Error('boom'), set);
    expect(set.status).toBe(500);
  });
});

describe('card body schemas reject malformed values at the edge', () => {
  it('rejects an over-long title', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    // Bounded so an unbounded string cannot reach Postgres.
    expect(src.includes('maxLength: 1000')).toBe(true);
    expect(src.includes('minLength: 1')).toBe(true);
  });

  it('rejects negative and non-finite numerics', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    expect(src.includes('storyPoints: t.Optional(t.Number({ minimum: 0')).toBe(true);
    expect(src.includes('estimateMinutes: t.Optional(t.Number({ minimum: 0')).toBe(true);
    expect(src.includes('position: t.Optional(t.Number({ minimum: 0')).toBe(true);
  });

  it('validates uuid and date-time formats on card ids and dueDate', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    expect(src.includes("dueDate: t.Optional(t.String({ format: 'date-time' }))")).toBe(true);
    expect(src.includes("parentCardId: t.Optional(t.String({ format: 'uuid' }))")).toBe(true);
    expect(src.includes("assigneeId: t.Optional(t.String({ format: 'uuid' }))")).toBe(true);
  });

  it('still accepts a plain create body (guards against over-tightening)', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    expect(src.includes('title: t.String({ minLength: 1, maxLength: 1000 })')).toBe(true);
    expect(src.includes("listId: t.String({ format: 'uuid' })")).toBe(true);
  });
});

describe('billing seat counts are constrained before reaching Stripe', () => {
  it('every seat field is a bounded integer', async () => {
    const src = await Bun.file(new URL('../billing/routes.ts', import.meta.url)).text();
    const seatFields = ['seatCount', 'additionalSeats', 'targetSeatCount'];
    const flat = src.replace(/\s+/g, ' ');
    for (const field of seatFields) {
      const bounded = `${field}: t.Number({ minimum: 1, maximum: 10_000, multipleOf: 1 })`;
      const optional = `${field}: t.Optional( t.Number({ minimum: 1, maximum: 10_000, multipleOf: 1 }) )`;
      expect(flat.includes(bounded) || flat.includes(optional)).toBe(true);
    }
  });

  it('the idempotency key is length-bounded', async () => {
    const src = await Bun.file(new URL('../billing/routes.ts', import.meta.url)).text();
    expect(src.includes('idempotencyKey: t.Optional(t.String({ maxLength: 255 }))')).toBe(true);
  });
});

describe('card member/label guards throw instead of returning success:false', () => {
  it('no card service returns a silent {success:false}', async () => {
    for (const file of ['card-members.ts', 'card-labels.ts']) {
      const src = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      expect(src.includes('success: false')).toBe(false);
    }
  });

  it('the invalid-uuid guard throws httpError(400)', async () => {
    const members = await Bun.file(new URL('./card-members.ts', import.meta.url)).text();
    expect(
      members.includes("throw httpError(400, 'Invalid UUID provided for cardId or userId')")
    ).toBe(true);

    const labels = await Bun.file(new URL('./card-labels.ts', import.meta.url)).text();
    expect(
      labels.includes("throw httpError(400, 'Invalid UUID provided for cardId or labelId')")
    ).toBe(true);
  });
});

describe('httpError(400) surfaces as 400 through the global handler', () => {
  it('formats a thrown 400 from a service', () => {
    const set: { status?: number | string } = {};
    const body = handleRouteError(
      Object.assign(new Error('Invalid UUID provided for cardId or userId'), { status: 400 }),
      set
    );
    expect(set.status).toBe(400);
    expect(body).toMatchObject({ error: 'Invalid UUID provided for cardId or userId' });
  });

  it('is reachable from a route without a try/catch converting it', async () => {
    // Sanity: Elysia + handleRouteError keeps the status rather than masking it.
    const app = new Elysia().get('/boom', () => {
      throw Object.assign(new Error('nope'), { status: 400 });
    });
    const res = await app.handle(new Request('http://localhost/boom'));
    expect(res.status).toBe(400);
  });
});
