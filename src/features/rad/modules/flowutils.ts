// Token Bucket Rate Limiter
export class RateLimiter {
  readonly capacity: number;
  readonly refillRatePerSec: number;
  private tokens: number;
  private lastRefill: number;

  constructor(capacity: number, refillRatePerSec: number) {
    if (capacity <= 0 || refillRatePerSec <= 0) {
      throw new Error("[flowutils] Capacity and refill rate must be positive");
    }
    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.tokens = capacity;
    this.lastRefill = performance.now();
  }

  private refill(): void {
    const now = performance.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
    this.lastRefill = now;
  }

  allow(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  async wait(count = 1): Promise<void> {
    while (!this.allow(count)) {
      const needed = count - this.tokens;
      const waitMs = Math.max(10, Math.ceil((needed / this.refillRatePerSec) * 1000));
      await Bun.sleep(waitMs);
    }
  }
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

// 3-State Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN)
export class CircuitBreaker {
  private failureCount = 0;
  private state: CircuitState = "CLOSED";
  private lastStateChange: number = Date.now();
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;

  constructor(failureThreshold = 5, resetTimeoutMs = 10_000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.lastStateChange >= this.resetTimeoutMs) {
      this.state = "HALF_OPEN";
      this.lastStateChange = Date.now();
    }
    return this.state;
  }

  canExecute(): boolean {
    const s = this.getState();
    return s === "CLOSED" || s === "HALF_OPEN";
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
    this.lastStateChange = Date.now();
  }

  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.lastStateChange = Date.now();
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`[flowutils] Circuit breaker is OPEN. Fast failing request.`);
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}

// Coordinator: Retry with exponential backoff and jitter
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 100,
  multiplier = 2.0,
  maxDelayMs = 5000
): Promise<T> {
  let attempt = 0;
  let curDelay = delayMs;
  let lastErr: any;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt >= maxAttempts) break;
      const jitter = Math.random() * 0.2 * curDelay;
      await Bun.sleep(Math.min(maxDelayMs, curDelay + jitter));
      curDelay *= multiplier;
    }
  }
  throw lastErr;
}

// Doer: Debounce function invocation
export function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
  let timer: any = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, waitMs);
  }) as T;
}

// Doer: Throttle function invocation
export function throttle<T extends (...args: any[]) => void>(fn: T, intervalMs: number): T {
  let lastTime = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastTime >= intervalMs) {
      lastTime = now;
      fn(...args);
    }
  }) as T;
}

export const flowutils = {
  RateLimiter,
  CircuitBreaker,
  retry,
  debounce,
  throttle,
};
