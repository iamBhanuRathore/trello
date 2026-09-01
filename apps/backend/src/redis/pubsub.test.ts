import { describe, expect, it } from 'bun:test';
import { onRedisBroadcast, publishToRedis, INSTANCE_ID, RealtimeBroadcastMessage } from './pubsub';
import { isRedisAvailable } from './client';

describe('Redis Pub/Sub broker', () => {
  it('should have a valid instance ID', () => {
    expect(INSTANCE_ID).toBeDefined();
    expect(typeof INSTANCE_ID).toBe('string');
    expect(INSTANCE_ID.length).toBeGreaterThan(0);
  });

  it('should register and unregister broadcast handlers', () => {
    let receivedMessage: RealtimeBroadcastMessage | null = null;
    const unsubscribe = onRedisBroadcast((msg) => {
      receivedMessage = msg;
    });

    expect(typeof unsubscribe).toBe('function');
    expect(receivedMessage).toBeNull();
    unsubscribe();
  });

  it('should safely return false when publishing while Redis is not connected', async () => {
    if (!isRedisAvailable()) {
      const published = await publishToRedis('board:123', 'card.created', { cardId: 'c-1' });
      expect(published).toBe(false);
    }
  });
});
