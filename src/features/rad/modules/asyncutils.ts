// Coordinator: Bounded concurrency map preserving original index order
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
export async function parallelFilter<T>(
  items: T[],
  concurrency: number,
  predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
  const flags = await parallelMap(items, concurrency, (item) => predicate(item));
  return items.filter((_, idx) => flags[idx]);
}

// Coordinator: Bounded concurrency iteration
export async function parallelEach<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  await parallelMap(items, concurrency, fn);
}

// Synchronization primitive: WaitGroup
export interface WaitGroup {
  add(delta?: number): void;
  done(): void;
  wait(): Promise<void>;
}

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
export class WorkerPool {
  private running = 0;
  private queue: (() => void)[] = [];
  readonly concurrency: number;

  constructor(concurrency: number) {
    if (concurrency <= 0) throw new Error("[asyncutils] Concurrency must be > 0");
    this.concurrency = concurrency;
  }

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

  async waitAll(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await Bun.sleep(10);
    }
  }
}

export const asyncutils = {
  parallelMap,
  parallelFilter,
  parallelEach,
  createWaitGroup,
  timeoutPromise,
  WorkerPool,
};
