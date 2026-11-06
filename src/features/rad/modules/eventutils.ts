/**
 * Lightweight in-memory publish-subscribe event emitter utilities.
 */

/**
 * Callback signature for event subscribers registered on an {@link EventEmitter}.
 */
export type EventListener = (...args: any[]) => void;

// In-Memory Publish-Subscribe Event Dispatcher
/**
 * In-memory publish-subscribe event dispatcher supporting persistent and one-time listeners.
 */
export class EventEmitter {
  private events = new Map<string, Set<EventListener>>();

  /**
   * Subscribes `listener` to be invoked every time `event` is emitted.
   */
  on(event: string, listener: EventListener): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
  }

  /**
   * Subscribes `listener` to be invoked at most once the next time `event` is emitted.
   */
  once(event: string, listener: EventListener): void {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * Removes a previously registered `listener` for `event`.
   */
  off(event: string, listener: EventListener): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.events.delete(event);
      }
    }
  }

  /**
   * Synchronously invokes all listeners registered for `event` with `args`.
   */
  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
    }
  }

  /**
   * Returns the number of active listeners currently subscribed to `event`.
   */
  listenerCount(event: string): number {
    return this.events.get(event)?.size || 0;
  }

  /**
   * Removes all listeners for `event`, or all listeners across all events if `event` is omitted.
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

/**
 * Factory helper that creates a new {@link EventEmitter} instance.
 */
export function newEmitter(): EventEmitter {
  return new EventEmitter();
}

/**
 * Namespace of publish-subscribe event emitter utilities (`EventEmitter`, `newEmitter`).
 */
export const eventutils = {
  EventEmitter,
  newEmitter,
};
