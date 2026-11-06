/**
 * Asynchronous concurrency primitives including bounded `parallelMap`/`parallelFilter`/`parallelEach`,
 * Go-style `WaitGroup`, `timeoutPromise`, and a bounded `WorkerPool`.
 */
// Coordinator: Bounded concurrency map preserving original index order
/**
 * Maps `items` asynchronously with at most `concurrency` in-flight tasks, preserving input order.
 */
export async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, concurrency);
  const results = new Array<R>(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx]!, idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Coordinator: Bounded concurrency filter
/**
 * Filters `items` using an async `predicate` with at most `concurrency` concurrent evaluations.
 */
export async function parallelFilter<T>(
  items: T[],
  concurrency: number,
  predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
  const flags = await parallelMap(items, concurrency, (item) => predicate(item));
  return items.filter((_, idx) => flags[idx]);
}

// Coordinator: Bounded concurrency iteration
/**
 * Executes async callback `fn` for each item in `items` with at most `concurrency` concurrent tasks.
 */
export async function parallelEach<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  await parallelMap(items, concurrency, fn);
}

// Synchronization primitive: WaitGroup
/**
 * Go-inspired synchronization counter that resolves `wait()` when all `add()`ed tasks have called `done()`.
 */
export interface WaitGroup {
  add(delta?: number): void;
  done(): void;
  wait(): Promise<void>;
}

/**
 * Creates a new {@link WaitGroup} synchronization primitive.
 */
export function createWaitGroup(): WaitGroup {
  let counter = 0;
  let resolveFn: (() => void) | null = null;

  return {
    add(delta = 1) {
      counter += delta;
    },
    done() {
      counter--;
      if (counter <= 0) {
        counter = 0;
        if (resolveFn) {
          resolveFn();
          resolveFn = null;
        }
      }
    },
    async wait(): Promise<void> {
      if (counter <= 0) return;
      return new Promise((resolve) => {
        resolveFn = resolve;
      });
    },
  };
}

// Coordinator: Timeout wrapper for Promise
/**
 * Races `promise` against a timer of `ms` milliseconds, rejecting with `errorMsg` if the timer fires first.
 */
export function timeoutPromise<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg = `Operation timed out after ${ms}ms`
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[asyncutils] ${errorMsg}`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Generic bounded WorkerPool
/**
 * Bounded async task queue that runs at most `concurrency` submitted tasks simultaneously.
 */
export class WorkerPool {
  private running = 0;
  private queue: (() => void)[] = [];
  readonly concurrency: number;

  /**
   * Creates a worker pool with a maximum concurrency limit.
   * @param concurrency - Maximum number of tasks allowed to run in parallel (must be > 0).
   */
  constructor(concurrency: number) {
    if (concurrency <= 0) throw new Error("[asyncutils] Concurrency must be > 0");
    this.concurrency = concurrency;
  }

  /**
   * Submits an async `task` to the pool and returns a promise for its result.
   */
  submit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
          }
        }
      };

      if (this.running < this.concurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  /**
   * Waits until all currently running and queued tasks in the pool have completed.
   */
  async waitAll(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await Bun.sleep(10);
    }
  }
}

/**
 * Namespace of asynchronous concurrency utilities (`parallelMap`, `parallelFilter`, `parallelEach`, `createWaitGroup`, `timeoutPromise`, `WorkerPool`).
 */
export const asyncutils = {
  parallelMap,
  parallelFilter,
  parallelEach,
  createWaitGroup,
  timeoutPromise,
  WorkerPool,
};
