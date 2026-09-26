import { EventEmitter } from 'events';
import { publishToRedis, isRedisAvailable } from '../redis';

// Create a global singleton event bus
class EventBus extends EventEmitter {
  public async broadcast(topic: string, event: string, payload: unknown): Promise<void> {
    try {
      // Broadcast must never hang or reject its caller (webhooks, comments, …):
      // bound the whole publish path, then fall back to local emission.
      const publishedToRedis = await Promise.race([
        publishToRedis(topic, event, payload),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);

      // If Redis is not connected or publishing failed, fall back to local event emission
      if (!publishedToRedis || !isRedisAvailable()) {
        this.emit('broadcast', { topic, event, payload });
      }
    } catch {
      this.emit('broadcast', { topic, event, payload });
    }
  }
}

export const eventBus = new EventBus();
