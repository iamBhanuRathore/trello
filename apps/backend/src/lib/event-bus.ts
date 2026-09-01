import { EventEmitter } from 'events';
import { publishToRedis, isRedisAvailable } from '../redis';

// Create a global singleton event bus
class EventBus extends EventEmitter {
  public async broadcast(topic: string, event: string, payload: any): Promise<void> {
    const publishedToRedis = await publishToRedis(topic, event, payload);

    // If Redis is not connected or publishing failed, fall back to local event emission
    if (!publishedToRedis || !isRedisAvailable()) {
      this.emit('broadcast', { topic, event, payload });
    }
  }
}

export const eventBus = new EventBus();
