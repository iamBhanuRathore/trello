import { EventEmitter } from 'events';

// Create a global singleton event bus
class EventBus extends EventEmitter {
  public broadcast(topic: string, event: string, payload: any) {
    this.emit('broadcast', { topic, event, payload });
  }
}

export const eventBus = new EventBus();
