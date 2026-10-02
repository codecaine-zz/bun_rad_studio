export type EventListener = (...args: any[]) => void;

// In-Memory Publish-Subscribe Event Dispatcher
export class EventEmitter {
  private events = new Map<string, Set<EventListener>>();

  on(event: string, listener: EventListener): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
  }

  once(event: string, listener: EventListener): void {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.events.delete(event);
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
    }
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.size || 0;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

export function newEmitter(): EventEmitter {
  return new EventEmitter();
}

export const eventutils = {
  EventEmitter,
  newEmitter,
};
