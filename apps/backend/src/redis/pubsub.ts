import { randomUUID } from 'crypto';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { getPubClient, getSubClient, isRedisAvailable } from './client';

export interface RealtimeBroadcastMessage {
  topic: string;
  event: string;
  payload: any;
  instanceId: string;
  timestamp: number;
}

export const INSTANCE_ID = randomUUID();

type MessageHandler = (message: RealtimeBroadcastMessage) => void;
const messageHandlers = new Set<MessageHandler>();
let isSubscribed = false;

/**
 * Initializes Redis Pub/Sub listener for distributed real-time events.
 */
export async function initializeRedisPubSub(): Promise<void> {
  const sub = getSubClient();
  if (!sub || !isRedisAvailable()) {
    return;
  }

  if (isSubscribed) {
    return;
  }

  try {
    await sub.subscribe(env.REDIS_CHANNEL);
    isSubscribed = true;

    sub.on('message', (channel, messageStr) => {
      if (channel !== env.REDIS_CHANNEL) return;

      try {
        const message: RealtimeBroadcastMessage = JSON.parse(messageStr);
        for (const handler of messageHandlers) {
          try {
            handler(message);
          } catch (err) {
            logger.error({ err }, 'Error in Redis PubSub message handler');
          }
        }
      } catch (err) {
        logger.warn({ err, messageStr }, 'Failed to parse Redis PubSub message');
      }
    });

    logger.info(
      { channel: env.REDIS_CHANNEL, instanceId: INSTANCE_ID },
      'Subscribed to Redis Real-Time channel'
    );
  } catch (err) {
    logger.warn({ err }, 'Failed to subscribe to Redis PubSub channel');
  }
}

/**
 * Registers a handler invoked when a broadcast message is received from any cluster instance.
 */
export function onRedisBroadcast(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

/**
 * Publishes a broadcast event to the Redis cluster channel.
 * Returns true if published to Redis, false if Redis is unavailable.
 */
export async function publishToRedis(topic: string, event: string, payload: any): Promise<boolean> {
  const pub = getPubClient();
  if (!pub || !isRedisAvailable()) {
    return false;
  }

  const message: RealtimeBroadcastMessage = {
    topic,
    event,
    payload,
    instanceId: INSTANCE_ID,
    timestamp: Date.now(),
  };

  try {
    await pub.publish(env.REDIS_CHANNEL, JSON.stringify(message));
    return true;
  } catch (err) {
    logger.warn({ err, topic, event }, 'Failed to publish message to Redis');
    return false;
  }
}
