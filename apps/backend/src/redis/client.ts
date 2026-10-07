import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

/** Upstash mandates TLS even when the URL uses the `redis://` scheme. */
function isUpstashUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.upstash.io');
  } catch {
    return false;
  }
}

/** Host-only, for logs — never log credentials from the URL. */
export function redactedRedisHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(invalid REDIS_URL)';
  }
}

function createClientOptions(url: string): RedisOptions {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    // Fail fast: an unbounded Redis command can wedge the Bun event loop and
    // hang any request awaiting it (e.g. webhook → broadcast). 2s per command.
    commandTimeout: 2000,
    // Upstash requires TLS; auto-upgrade plain `redis://…upstash.io` URLs.
    ...(isUpstashUrl(url) && !url.startsWith('rediss://') ? { tls: {} } : {}),
    /**
     * Retry forever with capped exponential backoff plus jitter.
     *
     * This used to return `null` after 10 attempts, which permanently stops
     * ioredis for the life of the process: after a long outage the app stayed on
     * in-memory fallbacks (split presence, per-pod rate limits, no cross-instance
     * fan-out) until someone restarted the pod. Returning a delay forever lets
     * the client recover on its own.
     */
    retryStrategy(times) {
      const base = Math.min(times * 100, 3000);
      const jitter = Math.floor(Math.random() * 250);
      if (times % 25 === 0) {
        logger.warn(
          { attempt: times, backoffMs: base + jitter },
          'Redis still unreachable after repeated retries — continuing to retry in the background'
        );
      }
      return base + jitter;
    },
    reconnectOnError(err) {
      logger.warn({ err: err.message }, 'Redis encountered error, reconnecting...');
      return true;
    },
  };
}

/**
 * Singleton Redis connection manager providing unified pub, sub, and data client handles.
 */
export class RedisService {
  private static instance: RedisService | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private dataClient: Redis | null = null;
  private _isAvailable = false;
  private isConnecting = false;

  private constructor() {}

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  public async connect(): Promise<boolean> {
    if (env.REDIS_DISABLED) {
      logger.info(
        {},
        'Redis is explicitly disabled (REDIS_DISABLED=true). Using in-memory fallback.'
      );
      this._isAvailable = false;
      return false;
    }

    if (this._isAvailable && this.pubClient && this.subClient && this.dataClient) {
      return true;
    }

    if (this.isConnecting) {
      return this._isAvailable;
    }

    this.isConnecting = true;

    try {
      const options = createClientOptions(env.REDIS_URL);

      this.pubClient = new Redis(env.REDIS_URL, options);
      this.subClient = new Redis(env.REDIS_URL, options);
      this.dataClient = new Redis(env.REDIS_URL, options);

      // Attach error handlers to prevent unhandled exceptions
      this.pubClient.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis Pub Client error');
      });
      this.subClient.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis Sub Client error');
      });
      this.dataClient.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis Data Client error');
      });

      // Availability tracks the DATA client lifecycle — it is the client
      // isAvailable() actually gates on. `ready` (not `connect`: TCP up is not
      // authenticated + selected + READY) marks usable; `close`/`end` clear it.
      // `ready` also covers late recovery: if Redis is down at boot, connect()
      // rejects but these clients keep retrying in the background, and the flag
      // flips true when the server actually comes back — no manual reconnect.
      // Clearing on `close` fails over fast: every consumer is fail-open or has
      // an in-memory fallback, so a half-open socket must not read available.
      this.dataClient.on('ready', () => {
        this._isAvailable = true;
      });
      this.dataClient.on('close', () => {
        this._isAvailable = false;
      });
      this.dataClient.on('end', () => {
        this._isAvailable = false;
      });

      // Connect all three clients
      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect(),
        this.dataClient.connect(),
      ]);

      this._isAvailable = true;
      logger.info(
        { host: redactedRedisHost(env.REDIS_URL) },
        ' Connected to Redis (Pub/Sub + Data clients ready)'
      );
      return true;
    } catch (error: any) {
      this._isAvailable = false;
      logger.warn(
        { err: error?.message || error },
        ' Failed to connect to Redis. Real-time engine falling back to single-instance in-memory mode.'
      );
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    const clients = [this.pubClient, this.subClient, this.dataClient].filter(Boolean) as Redis[];
    this._isAvailable = false;

    await Promise.all(
      clients.map(async (client) => {
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      })
    );

    this.pubClient = null;
    this.subClient = null;
    this.dataClient = null;
    logger.info({}, 'Redis connections disconnected cleanly');
  }

  public isAvailable(): boolean {
    return (
      this._isAvailable &&
      this.dataClient !== null &&
      (this.dataClient.status === 'ready' || this.dataClient.status === 'connect')
    );
  }

  public getPubClient(): Redis | null {
    return this.pubClient;
  }

  public getSubClient(): Redis | null {
    return this.subClient;
  }

  public getDataClient(): Redis | null {
    return this.dataClient;
  }
}

export const redisService = RedisService.getInstance();

// Backward-compatible functional exports
export const connectRedis = () => redisService.connect();
export const disconnectRedis = () => redisService.disconnect();
export const isRedisAvailable = () => redisService.isAvailable();
export const getPubClient = () => redisService.getPubClient();
export const getSubClient = () => redisService.getSubClient();
export const getDataClient = () => redisService.getDataClient();
