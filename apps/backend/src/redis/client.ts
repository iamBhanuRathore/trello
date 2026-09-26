import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let dataClient: Redis | null = null;
let isAvailable = false;
let isConnecting = false;

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
    retryStrategy(times) {
      if (times > 10) {
        logger.warn(
          { attempt: times },
          'Redis connection retry limit reached. Continuing with in-memory fallback.'
        );
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      logger.warn({ err: err.message }, 'Redis encountered error, reconnecting...');
      return true;
    },
  };
}

export async function connectRedis(): Promise<boolean> {
  if (env.REDIS_DISABLED) {
    logger.info(
      {},
      'Redis is explicitly disabled (REDIS_DISABLED=true). Using in-memory fallback.'
    );
    isAvailable = false;
    return false;
  }

  if (isAvailable && pubClient && subClient && dataClient) {
    return true;
  }

  if (isConnecting) {
    return isAvailable;
  }

  isConnecting = true;

  try {
    const options = createClientOptions(env.REDIS_URL);

    pubClient = new Redis(env.REDIS_URL, options);
    subClient = new Redis(env.REDIS_URL, options);
    dataClient = new Redis(env.REDIS_URL, options);

    // Attach error handlers to prevent unhandled exceptions
    pubClient.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis Pub Client error');
    });
    subClient.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis Sub Client error');
    });
    dataClient.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis Data Client error');
    });

    pubClient.on('connect', () => {
      isAvailable = true;
    });

    // Connect all three clients
    await Promise.all([pubClient.connect(), subClient.connect(), dataClient.connect()]);

    isAvailable = true;
    logger.info(
      { host: redactedRedisHost(env.REDIS_URL) },
      ' Connected to Redis (Pub/Sub + Data clients ready)'
    );
    return true;
  } catch (error: any) {
    isAvailable = false;
    logger.warn(
      { err: error?.message || error },
      ' Failed to connect to Redis. Real-time engine falling back to single-instance in-memory mode.'
    );
    return false;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  const clients = [pubClient, subClient, dataClient].filter(Boolean) as Redis[];
  isAvailable = false;

  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    })
  );

  pubClient = null;
  subClient = null;
  dataClient = null;
  logger.info({}, 'Redis connections disconnected cleanly');
}

export function isRedisAvailable(): boolean {
  return (
    isAvailable &&
    dataClient !== null &&
    (dataClient.status === 'ready' || dataClient.status === 'connect')
  );
}

export function getPubClient(): Redis | null {
  return pubClient;
}

export function getSubClient(): Redis | null {
  return subClient;
}

export function getDataClient(): Redis | null {
  return dataClient;
}
