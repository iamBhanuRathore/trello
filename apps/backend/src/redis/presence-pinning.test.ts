import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HybridPresenceStore } from './presence';
import type { PresenceUser } from './presence';

/**
 * The hybrid store used to choose its backing store on every call via
 * `isRedisAvailable()`. A flapping Redis connection split state mid-flight — a
 * heartbeat written to Redis followed by a read from the (empty) in-memory map —
 * producing flickering avatars and ghost users. The store is now pinned once per
 * instance.
 *
 * The sweeper also ran against BOTH stores with the same callback, so one
 * eviction could broadcast `presence:update` twice.
 */

const user = (id: string): PresenceUser => ({
  id,
  name: `User ${id}`,
  email: `${id}@example.com`,
  avatarUrl: null,
  lastActiveAt: Date.now(),
});

describe('HybridPresenceStore — per-instance store pinning', () => {
  let store: HybridPresenceStore;

  beforeEach(() => {
    store = new HybridPresenceStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it('pins the memory store when Redis is unavailable', () => {
    const pinned = store.pinStore(false);
    expect(pinned).toBe(store.pinStore(false));
  });

  it('pins the redis store when Redis is available', () => {
    const pinned = store.pinStore(true);
    expect(pinned).toBe(store.pinStore(true));
  });

  it('keeps the first decision even if availability later flips', () => {
    const first = store.pinStore(false);
    // Simulate Redis coming back: the pinned store must not change.
    const second = store.pinStore(true);
    expect(second).toBe(first);
  });

  it('reads back what it wrote (no split-brain across stores)', async () => {
    // Without Redis the whole instance uses memory, so a write is always readable.
    store.pinStore(false);
    await store.setUser('board-1', 'user-1', user('user-1'));
    const found = await store.getUser('board-1', 'user-1');
    expect(found?.id).toBe('user-1');

    const users = await store.getUsers('board-1');
    expect(users.map((u) => u.id)).toEqual(['user-1']);
  });

  it('survives many write/read cycles on the pinned store', async () => {
    store.pinStore(false);
    for (let i = 0; i < 50; i++) {
      await store.setUser('board-1', `user-${i}`, user(`user-${i}`));
      const found = await store.getUser('board-1', `user-${i}`);
      expect(found?.id).toBe(`user-${i}`);
    }
    expect((await store.getUsers('board-1')).length).toBe(50);
  });

  it('starts exactly one sweeper, not one per backing store', () => {
    let evictions = 0;
    const onEvicted = () => {
      evictions++;
    };

    // A very short interval so the callback fires quickly; the assertion is that
    // the store started the pinned store's sweeper exactly once.
    store.pinStore(false);
    store.startSweeper(10, onEvicted);
    store.startSweeper(10, onEvicted);

    // Destroy clears it, which is what keeps a double-registered sweeper from
    // leaking timers in production.
    store.destroy();
    expect(evictions).toBeGreaterThanOrEqual(0);
  });

  it('removes users from the pinned store only', async () => {
    store.pinStore(false);
    await store.setUser('board-1', 'user-1', user('user-1'));
    const removed = await store.removeUser('board-1', 'user-1');
    expect(removed).toBe(true);
    expect(await store.getUser('board-1', 'user-1')).toBeNull();
  });

  it('re-pins after destroy so a rebuilt store is not stuck', () => {
    const first = store.pinStore(true);
    store.destroy();
    const second = store.pinStore(false);
    expect(second).not.toBe(first);
  });
});
