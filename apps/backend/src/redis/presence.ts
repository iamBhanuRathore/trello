import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { getDataClient, isRedisAvailable } from './client';

export interface PresenceUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  activeCardId?: string | null;
  isTypingCardId?: string | null;
  lastActiveAt: number;
}

export interface PresenceStore {
  setUser(boardId: string, userId: string, user: PresenceUser, ttlSeconds?: number): Promise<void>;
  updateUser(
    boardId: string,
    userId: string,
    partial: Partial<PresenceUser>,
    ttlSeconds?: number
  ): Promise<PresenceUser | null>;
  removeUser(boardId: string, userId: string): Promise<boolean>;
  getUsers(boardId: string): Promise<PresenceUser[]>;
  getUser(boardId: string, userId: string): Promise<PresenceUser | null>;
  refreshUser(boardId: string, userId: string, ttlSeconds?: number): Promise<boolean>;
  cleanupExpired(
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): Promise<void>;
  destroy(): void;
}

// ─── Redis Presence Store ───────────────────────────────────────────────────

export class RedisPresenceStore implements PresenceStore {
  private defaultTTL: number;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTTL: number = env.PRESENCE_TTL_SECONDS) {
    this.defaultTTL = defaultTTL;
  }

  private boardKey(boardId: string): string {
    return `presence:board:${boardId}`;
  }

  private ttlKey(boardId: string): string {
    return `presence:board:${boardId}:ttl`;
  }

  private activeBoardsKey(): string {
    return 'presence:active_boards';
  }

  public async setUser(
    boardId: string,
    userId: string,
    user: PresenceUser,
    ttlSeconds: number = this.defaultTTL
  ): Promise<void> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return;

    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const userWithTimestamp: PresenceUser = { ...user, lastActiveAt: now };

    const pipeline = redis.pipeline();
    pipeline.hset(this.boardKey(boardId), userId, JSON.stringify(userWithTimestamp));
    pipeline.zadd(this.ttlKey(boardId), expiresAt, userId);
    pipeline.sadd(this.activeBoardsKey(), boardId);
    pipeline.expire(this.boardKey(boardId), ttlSeconds * 3);
    pipeline.expire(this.ttlKey(boardId), ttlSeconds * 3);

    await pipeline.exec();
  }

  public async updateUser(
    boardId: string,
    userId: string,
    partial: Partial<PresenceUser>,
    ttlSeconds: number = this.defaultTTL
  ): Promise<PresenceUser | null> {
    const existing = await this.getUser(boardId, userId);
    if (!existing) return null;

    const updated: PresenceUser = {
      ...existing,
      ...partial,
      lastActiveAt: Date.now(),
    };

    await this.setUser(boardId, userId, updated, ttlSeconds);
    return updated;
  }

  public async removeUser(boardId: string, userId: string): Promise<boolean> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return false;

    const pipeline = redis.pipeline();
    pipeline.hdel(this.boardKey(boardId), userId);
    pipeline.zrem(this.ttlKey(boardId), userId);
    pipeline.hlen(this.boardKey(boardId));

    const results = await pipeline.exec();
    const remainingCount = (results?.[2]?.[1] as number) || 0;

    if (remainingCount <= 0) {
      await redis.srem(this.activeBoardsKey(), boardId);
    }

    return true;
  }

  public async getUser(boardId: string, userId: string): Promise<PresenceUser | null> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return null;

    const raw = await redis.hget(this.boardKey(boardId), userId);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as PresenceUser;
    } catch {
      return null;
    }
  }

  public async getUsers(boardId: string): Promise<PresenceUser[]> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return [];

    const now = Date.now();
    // 1. Find and remove expired users in this board
    const expiredUserIds = await redis.zrangebyscore(this.ttlKey(boardId), '-inf', now);
    if (expiredUserIds && expiredUserIds.length > 0) {
      const pipeline = redis.pipeline();
      for (const id of expiredUserIds) {
        pipeline.hdel(this.boardKey(boardId), id);
        pipeline.zrem(this.ttlKey(boardId), id);
      }
      await pipeline.exec();
    }

    // 2. Fetch active users
    const rawUsers = await redis.hvals(this.boardKey(boardId));
    if (!rawUsers || rawUsers.length === 0) {
      await redis.srem(this.activeBoardsKey(), boardId);
      return [];
    }

    const users: PresenceUser[] = [];
    for (const raw of rawUsers) {
      try {
        users.push(JSON.parse(raw));
      } catch {
        // Skip invalid JSON
      }
    }

    return users;
  }

  public async refreshUser(
    boardId: string,
    userId: string,
    ttlSeconds: number = this.defaultTTL
  ): Promise<boolean> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return false;

    const existing = await this.getUser(boardId, userId);
    if (!existing) return false;

    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    existing.lastActiveAt = now;

    const pipeline = redis.pipeline();
    pipeline.hset(this.boardKey(boardId), userId, JSON.stringify(existing));
    pipeline.zadd(this.ttlKey(boardId), expiresAt, userId);
    pipeline.expire(this.boardKey(boardId), ttlSeconds * 3);
    pipeline.expire(this.ttlKey(boardId), ttlSeconds * 3);
    await pipeline.exec();

    return true;
  }

  public async cleanupExpired(
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): Promise<void> {
    const redis = getDataClient();
    if (!redis || !isRedisAvailable()) return;

    try {
      const activeBoards = await redis.smembers(this.activeBoardsKey());
      if (!activeBoards || activeBoards.length === 0) return;

      const now = Date.now();

      // Concurrently across boards. The sweep ran one ZRANGEBYSCORE (plus a
      // follow-up read per board) strictly in sequence, so a deployment with many
      // active boards paid a full Redis round trip per board every interval.
      await Promise.all(
        activeBoards.map(async (boardId) => {
          const expiredUserIds = await redis.zrangebyscore(this.ttlKey(boardId), '-inf', now);
          if (expiredUserIds && expiredUserIds.length > 0) {
            const pipeline = redis.pipeline();
            for (const uid of expiredUserIds) {
              pipeline.hdel(this.boardKey(boardId), uid);
              pipeline.zrem(this.ttlKey(boardId), uid);
            }
            await pipeline.exec();

            const remainingUsers = await this.getUsers(boardId);
            if (onEvicted) {
              onEvicted(boardId, remainingUsers);
            }
          }
        })
      );
    } catch (err) {
      logger.warn({ err }, 'Error during Redis presence expiration cleanup');
    }
  }

  public startSweeper(
    intervalMs: number = 15000,
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): void {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      this.cleanupExpired(onEvicted).catch((err) => {
        logger.warn({ err }, 'Presence sweeper tick error');
      });
    }, intervalMs);
  }

  public destroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}

// ─── In-Memory Presence Store (Fallback) ───────────────────────────────────

interface InMemoryEntry {
  user: PresenceUser;
  expiresAt: number;
}

export class InMemoryPresenceStore implements PresenceStore {
  private store = new Map<string, Map<string, InMemoryEntry>>();
  private defaultTTL: number;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTTL: number = env.PRESENCE_TTL_SECONDS) {
    this.defaultTTL = defaultTTL;
  }

  public async setUser(
    boardId: string,
    userId: string,
    user: PresenceUser,
    ttlSeconds: number = this.defaultTTL
  ): Promise<void> {
    if (!this.store.has(boardId)) {
      this.store.set(boardId, new Map());
    }

    const now = Date.now();
    const entry: InMemoryEntry = {
      user: { ...user, lastActiveAt: now },
      expiresAt: now + ttlSeconds * 1000,
    };

    this.store.get(boardId)!.set(userId, entry);
  }

  public async updateUser(
    boardId: string,
    userId: string,
    partial: Partial<PresenceUser>,
    ttlSeconds: number = this.defaultTTL
  ): Promise<PresenceUser | null> {
    const boardMap = this.store.get(boardId);
    if (!boardMap || !boardMap.has(userId)) return null;

    const existing = boardMap.get(userId)!;
    const now = Date.now();
    const updatedUser: PresenceUser = {
      ...existing.user,
      ...partial,
      lastActiveAt: now,
    };

    boardMap.set(userId, {
      user: updatedUser,
      expiresAt: now + ttlSeconds * 1000,
    });

    return updatedUser;
  }

  public async removeUser(boardId: string, userId: string): Promise<boolean> {
    const boardMap = this.store.get(boardId);
    if (!boardMap) return false;

    const deleted = boardMap.delete(userId);
    if (boardMap.size === 0) {
      this.store.delete(boardId);
    }
    return deleted;
  }

  public async getUser(boardId: string, userId: string): Promise<PresenceUser | null> {
    const boardMap = this.store.get(boardId);
    if (!boardMap) return null;

    const entry = boardMap.get(userId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      boardMap.delete(userId);
      if (boardMap.size === 0) this.store.delete(boardId);
      return null;
    }

    return entry.user;
  }

  public async getUsers(boardId: string): Promise<PresenceUser[]> {
    const boardMap = this.store.get(boardId);
    if (!boardMap) return [];

    const now = Date.now();
    const active: PresenceUser[] = [];

    for (const [userId, entry] of boardMap.entries()) {
      if (now > entry.expiresAt) {
        boardMap.delete(userId);
      } else {
        active.push(entry.user);
      }
    }

    if (boardMap.size === 0) {
      this.store.delete(boardId);
    }

    return active;
  }

  public async refreshUser(
    boardId: string,
    userId: string,
    ttlSeconds: number = this.defaultTTL
  ): Promise<boolean> {
    const boardMap = this.store.get(boardId);
    if (!boardMap || !boardMap.has(userId)) return false;

    const entry = boardMap.get(userId)!;
    const now = Date.now();
    entry.expiresAt = now + ttlSeconds * 1000;
    entry.user.lastActiveAt = now;
    return true;
  }

  public async cleanupExpired(
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): Promise<void> {
    const now = Date.now();

    for (const [boardId, boardMap] of this.store.entries()) {
      let evicted = false;
      for (const [userId, entry] of boardMap.entries()) {
        if (now > entry.expiresAt) {
          boardMap.delete(userId);
          evicted = true;
        }
      }

      if (boardMap.size === 0) {
        this.store.delete(boardId);
      }

      if (evicted && onEvicted) {
        const remaining = Array.from(boardMap.values()).map((e) => e.user);
        onEvicted(boardId, remaining);
      }
    }
  }

  public startSweeper(
    intervalMs: number = 15000,
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): void {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      this.cleanupExpired(onEvicted).catch((err) => {
        logger.warn({ err }, 'In-memory presence sweeper tick error');
      });
    }, intervalMs);
  }

  public destroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    this.store.clear();
  }
}

// ─── Hybrid Presence Store Manager ──────────────────────────────────────────

export class HybridPresenceStore implements PresenceStore {
  private redisStore: RedisPresenceStore;
  private memoryStore: InMemoryPresenceStore;
  private pinnedStore: RedisPresenceStore | InMemoryPresenceStore | null = null;

  constructor() {
    this.redisStore = new RedisPresenceStore();
    this.memoryStore = new InMemoryPresenceStore();
  }

  /**
   * Picks the backing store ONCE per instance and keeps it.
   *
   * This used to be resolved per call via `isRedisAvailable()`. A flapping Redis
   * connection therefore split state mid-flight: a heartbeat could land in Redis
   * while the next read came from the in-memory map (empty), producing flickering
   * avatars and ghost users. Pinning means one instance reads and writes the same
   * store for its whole lifetime; a genuinely unavailable Redis at boot still
   * falls back to memory.
   */
  public pinStore(
    useRedis: boolean = isRedisAvailable()
  ): RedisPresenceStore | InMemoryPresenceStore {
    if (!this.pinnedStore) {
      this.pinnedStore = useRedis ? this.redisStore : this.memoryStore;
    }
    return this.pinnedStore;
  }

  private get activeStore(): PresenceStore {
    return this.pinStore();
  }

  public async setUser(
    boardId: string,
    userId: string,
    user: PresenceUser,
    ttlSeconds?: number
  ): Promise<void> {
    return this.activeStore.setUser(boardId, userId, user, ttlSeconds);
  }

  public async updateUser(
    boardId: string,
    userId: string,
    partial: Partial<PresenceUser>,
    ttlSeconds?: number
  ): Promise<PresenceUser | null> {
    return this.activeStore.updateUser(boardId, userId, partial, ttlSeconds);
  }

  public async removeUser(boardId: string, userId: string): Promise<boolean> {
    return this.activeStore.removeUser(boardId, userId);
  }

  public async getUsers(boardId: string): Promise<PresenceUser[]> {
    return this.activeStore.getUsers(boardId);
  }

  public async getUser(boardId: string, userId: string): Promise<PresenceUser | null> {
    return this.activeStore.getUser(boardId, userId);
  }

  public async refreshUser(boardId: string, userId: string, ttlSeconds?: number): Promise<boolean> {
    return this.activeStore.refreshUser(boardId, userId, ttlSeconds);
  }

  public async cleanupExpired(
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): Promise<void> {
    return this.activeStore.cleanupExpired(onEvicted);
  }

  public startSweeper(
    intervalMs: number = 15000,
    onEvicted?: (boardId: string, remainingUsers: PresenceUser[]) => void
  ): void {
    // Sweep only the pinned store. Previously both stores ran with the same
    // callback, so a single eviction could broadcast `presence:update` twice.
    this.pinStore().startSweeper(intervalMs, onEvicted);
  }

  public destroy(): void {
    this.pinnedStore = null;
    this.redisStore.destroy();
    this.memoryStore.destroy();
  }
}

export const presenceStore = new HybridPresenceStore();
