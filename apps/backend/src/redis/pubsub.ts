import { randomUUID } from 'crypto';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { redisService } from './client';

export interface RealtimeBroadcastMessage {
  topic: string;
  event: string;
  payload: unknown;
  instanceId: string;
  timestamp: number;
}

export const INSTANCE_ID = randomUUID();

export type MessageHandler = (message: RealtimeBroadcastMessage) => void;

/**
 * Singleton PubSub service for distributed real-time messaging across cluster instances.
 */
export class PubSubService {
  private static instance: PubSubService | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private isSubscribed = false;
  public readonly instanceId = INSTANCE_ID;

  private constructor() {}

  public static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
    }
    return PubSubService.instance;
  }

  /**
   * Initializes Redis Pub/Sub listener for distributed real-time events.
   */
  public async initialize(): Promise<void> {
    const sub = redisService.getSubClient();
    if (!sub || !redisService.isAvailable()) {
      return;
    }

    if (this.isSubscribed) {
      return;
    }

    try {
      await sub.subscribe(env.REDIS_CHANNEL);
      this.isSubscribed = true;

      sub.on('message', (channel, messageStr) => {
        if (channel !== env.REDIS_CHANNEL) return;

        try {
          const message: RealtimeBroadcastMessage = JSON.parse(messageStr);
          for (const handler of this.messageHandlers) {
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
        { channel: env.REDIS_CHANNEL, instanceId: this.instanceId },
        'Subscribed to Redis Real-Time channel'
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to subscribe to Redis PubSub channel');
    }
  }

  /**
   * Registers a handler invoked when a broadcast message is received from any cluster instance.
   */
  public onBroadcast(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Publishes a broadcast event to the Redis cluster channel.
   * Returns true if published to Redis, false if Redis is unavailable.
   * Never hangs the caller: slow/hung Redis fails fast to the in-memory path.
   */
  public async publish(topic: string, event: string, payload: unknown): Promise<boolean> {
    const pub = redisService.getPubClient();
    if (!pub || !redisService.isAvailable()) {
      return false;
    }

    const message: RealtimeBroadcastMessage = {
      topic,
      event,
      payload,
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };

    try {
      await Promise.race([
        pub.publish(env.REDIS_CHANNEL, JSON.stringify(message)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis publish timeout')), 1500)
        ),
      ]);
      return true;
    } catch (err) {
      logger.warn({ err, topic, event }, 'Failed to publish message to Redis');
      return false;
    }
  }
}

export const pubSubService = PubSubService.getInstance();

// Backward-compatible functional exports
export const initializeRedisPubSub = () => pubSubService.initialize();
export const onRedisBroadcast = (handler: MessageHandler) => pubSubService.onBroadcast(handler);
export const publishToRedis = (topic: string, event: string, payload: unknown) =>
  pubSubService.publish(topic, event, payload);
