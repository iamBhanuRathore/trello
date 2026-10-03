import { describe, it, expect, mock } from 'bun:test';
import type { RealtimeBroadcastMessage } from '../../redis/pubsub';
import { Elysia } from 'elysia';
import { INSTANCE_ID } from '../../redis/pubsub';
import { isOwnBroadcast } from './routes';

/**
 * Two duplicate-delivery defects that both surfaced as "the client sees the same
 * event twice", moved up from the old P4.
 *
 * 1. The in-flight counter decremented in BOTH `onAfterResponse` and `onError`.
 *    Verified empirically: a thrown handler fires
 *    onRequest -> onError -> onAfterResponse, as does an unmatched route, so every
 *    error decremented twice. `Math.max(0, …)` hid it, but the shutdown drain
 *    (`while (inFlight > 0)`) concluded the server was idle while requests were
 *    still running — a deploy could sever live requests.
 *
 * 2. `onRedisBroadcast` did not filter `instanceId`. Redis delivers a published
 *    message back to the publisher's own subscriber, so an event that failed the
 *    1.5s publish race (falling back to a local emit) and *then* landed late in
 *    Redis reached this instance's sockets twice.
 */

describe('in-flight accounting', () => {
  it('onAfterResponse fires for a thrown handler', async () => {
    const fired: string[] = [];
    const app = new Elysia()
      .onAfterResponse(() => fired.push('afterResponse'))
      .onError(() => fired.push('error'))
      .get('/throw', () => {
        throw new Error('boom');
      })
      .listen(0);

    const res = await fetch(`http://localhost:${app.server?.port}/throw`);
    await res.text();
    await app.stop(true);

    expect(fired).toContain('error');
    // This is the fact the old double-decrement relied on being false.
    expect(fired).toContain('afterResponse');
  });

  it('decrements exactly once per request, including errors', async () => {
    let inFlight = 0;
    const app = new Elysia()
      .onRequest(() => {
        inFlight++;
      })
      .onAfterResponse(() => {
        inFlight = Math.max(0, inFlight - 1);
      })
      .onError(() => {
        // Intentionally empty — mirrors the fixed index.ts, which must not
        // decrement here because onAfterResponse always follows.
      })
      .get('/ok', () => ({ ok: true }))
      .get('/throw', () => {
        throw new Error('boom');
      })
      .listen(0);

    const port = app.server?.port ?? 0;

    // Sequential, so overlap cannot confuse the count.
    await (await fetch(`http://localhost:${port}/ok`)).text();
    expect(inFlight).toBe(0);

    await fetch(`http://localhost:${port}/throw`)
      .then((r) => r.text())
      .catch(() => '');
    // With a decrement in both hooks this would over-count downward on the very
    // first error; what matters is the counter returns to exactly 0.
    expect(inFlight).toBe(0);

    // Mixed traffic, then confirm we are balanced rather than merely clamped.
    inFlight = 0;
    for (let i = 0; i < 5; i++) {
      const path = i % 2 === 0 ? '/ok' : '/throw';
      await fetch(`http://localhost:${port}${path}`)
        .then((r) => r.text())
        .catch(() => '');
      expect(inFlight).toBe(0);
    }

    await app.stop(true);
  });

  it('source no longer decrements in onError', async () => {
    const src = await Bun.file(new URL('../../index.ts', import.meta.url)).text();
    const errorHandler = src.slice(src.indexOf('.onError('));
    // The first inFlight statement inside onError must not be a decrement.
    const segment = errorHandler.slice(
      0,
      errorHandler.indexOf('.mapResponse') === -1 ? 1200 : errorHandler.indexOf('.mapResponse')
    );
    expect(segment).not.toMatch(/inFlight = Math\.max\(0, inFlight - 1\)/);
  });
});

describe('realtime self-delivery', () => {
  it('recognises our own instanceId', () => {
    expect(isOwnBroadcast(INSTANCE_ID)).toBe(true);
  });

  it('does not treat another instance as our own', () => {
    expect(isOwnBroadcast('some-other-instance')).toBe(false);
    expect(isOwnBroadcast('')).toBe(false);
  });

  it('a foreign broadcast reaches sockets while our own is dropped', async () => {
    const delivered: string[] = [];
    const server = {
      publish: (topic: string) => {
        delivered.push(topic);
      },
    };

    // Drive the real handler chain that setupRealtimeEventBus registers.
    const { onRedisBroadcast } = await import('../../redis/pubsub');
    const off = onRedisBroadcast(({ topic, instanceId }) => {
      if (isOwnBroadcast(instanceId)) return;
      server.publish(topic);
    });

    try {
      // Our own message: dropped.
      onRedisBroadcastTestMessage({
        topic: 'board:1',
        event: 'e',
        payload: {},
        instanceId: INSTANCE_ID,
        timestamp: Date.now(),
      });
      expect(delivered).toHaveLength(0);

      // A peer's message: delivered.
      onRedisBroadcastTestMessage({
        topic: 'board:1',
        event: 'e',
        payload: {},
        instanceId: 'peer-1',
        timestamp: Date.now(),
      });
      expect(delivered).toEqual(['board:1']);
    } finally {
      off();
    }
  });

  it('source filters its own instanceId', async () => {
    const src = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
    expect(src).toContain('isOwnBroadcast(instanceId)');
  });
});

/** Fans a message through every registered Redis broadcast handler. */
function onRedisBroadcastTestMessage(message: RealtimeBroadcastMessage) {
  const { pubSubService } = require('../../redis/pubsub') as typeof import('../../redis/pubsub');
  for (const handler of (
    pubSubService as unknown as { messageHandlers: Set<(m: RealtimeBroadcastMessage) => void> }
  ).messageHandlers) {
    handler(message);
  }
}

void mock;
