import { describe, expect, it } from 'bun:test';
import { InMemoryPresenceStore, PresenceUser, HybridPresenceStore } from './presence';

describe('InMemoryPresenceStore', () => {
  it('should set and get user presence on a board', async () => {
    const store = new InMemoryPresenceStore(60);
    const user: PresenceUser = {
      id: 'u-1',
      name: 'Alice',
      email: 'alice@example.com',
      avatarUrl: null,
      lastActiveAt: Date.now(),
    };

    await store.setUser('board-1', 'u-1', user);
    const retrieved = await store.getUser('board-1', 'u-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('u-1');
    expect(retrieved?.name).toBe('Alice');

    const boardUsers = await store.getUsers('board-1');
    expect(boardUsers.length).toBe(1);
    expect(boardUsers[0]?.name).toBe('Alice');

    store.destroy();
  });

  it('should update active card and typing status', async () => {
    const store = new InMemoryPresenceStore(60);
    const user: PresenceUser = {
      id: 'u-2',
      name: 'Bob',
      email: 'bob@example.com',
      avatarUrl: null,
      lastActiveAt: Date.now(),
    };

    await store.setUser('board-1', 'u-2', user);

    const updated = await store.updateUser('board-1', 'u-2', {
      activeCardId: 'card-99',
      isTypingCardId: 'card-99',
    });

    expect(updated).not.toBeNull();
    expect(updated?.activeCardId).toBe('card-99');
    expect(updated?.isTypingCardId).toBe('card-99');

    const fetched = await store.getUser('board-1', 'u-2');
    expect(fetched?.activeCardId).toBe('card-99');

    store.destroy();
  });

  it('should remove user presence when leaving or closing connection', async () => {
    const store = new InMemoryPresenceStore(60);
    const user: PresenceUser = {
      id: 'u-3',
      name: 'Charlie',
      email: 'charlie@example.com',
      lastActiveAt: Date.now(),
    };

    await store.setUser('board-2', 'u-3', user);
    let users = await store.getUsers('board-2');
    expect(users.length).toBe(1);

    const removed = await store.removeUser('board-2', 'u-3');
    expect(removed).toBe(true);

    users = await store.getUsers('board-2');
    expect(users.length).toBe(0);

    store.destroy();
  });

  it('should evict expired users based on TTL', async () => {
    // 1 second TTL
    const store = new InMemoryPresenceStore(1);
    const user: PresenceUser = {
      id: 'u-4',
      name: 'Dave',
      email: 'dave@example.com',
      lastActiveAt: Date.now(),
    };

    await store.setUser('board-3', 'u-4', user, 1);

    // Initial check
    let users = await store.getUsers('board-3');
    expect(users.length).toBe(1);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    let evictedBoardId: string | null = null;
    let remainingUsersCount = -1;

    await store.cleanupExpired((boardId, remaining) => {
      evictedBoardId = boardId;
      remainingUsersCount = remaining.length;
    });

    expect(evictedBoardId as string | null).toBe('board-3');
    expect(remainingUsersCount).toBe(0);

    users = await store.getUsers('board-3');
    expect(users.length).toBe(0);

    store.destroy();
  });

  it('should refresh user TTL on heartbeat', async () => {
    const store = new InMemoryPresenceStore(2);
    const user: PresenceUser = {
      id: 'u-5',
      name: 'Eve',
      email: 'eve@example.com',
      lastActiveAt: Date.now(),
    };

    await store.setUser('board-4', 'u-5', user, 2);

    // Refresh TTL
    const refreshed = await store.refreshUser('board-4', 'u-5', 5);
    expect(refreshed).toBe(true);

    const nonExistent = await store.refreshUser('board-4', 'unknown-user');
    expect(nonExistent).toBe(false);

    store.destroy();
  });
});

describe('HybridPresenceStore', () => {
  it('should gracefully handle presence operations even when Redis is offline', async () => {
    const hybrid = new HybridPresenceStore();
    const user: PresenceUser = {
      id: 'u-6',
      name: 'Frank',
      email: 'frank@example.com',
      lastActiveAt: Date.now(),
    };

    await hybrid.setUser('board-hybrid', 'u-6', user);
    const retrieved = await hybrid.getUser('board-hybrid', 'u-6');

    expect(retrieved?.name).toBe('Frank');

    const users = await hybrid.getUsers('board-hybrid');
    expect(users.length).toBe(1);

    await hybrid.removeUser('board-hybrid', 'u-6');
    const remaining = await hybrid.getUsers('board-hybrid');
    expect(remaining.length).toBe(0);

    hybrid.destroy();
  });
});
