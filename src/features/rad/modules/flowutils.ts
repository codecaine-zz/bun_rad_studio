/**
 * Flow control and resilience utilities including token-bucket rate limiting,
 * a three-state circuit breaker, exponential backoff retry, debounce, and throttle.
 */

// Token Bucket Rate Limiter
/**
 * Token-bucket rate limiter that caps burst capacity and refills tokens at a steady per-second rate.
 */
export class RateLimiter {
  readonly capacity: number;
  readonly refillRatePerSec: number;
  private tokens: number;
  private lastRefill: number;

  /**
   * Creates a token-bucket rate limiter.
   * @param capacity - Maximum burst token capacity (must be > 0).
   * @param refillRatePerSec - Rate at which tokens replenish per second (must be > 0).
   */
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

  /**
   * Attempts to consume `count` tokens immediately without waiting.
   * @param count - Number of tokens to consume (default `1`).
   * @returns `true` if the tokens were available and consumed; `false` otherwise.
   */
  allow(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * Waits asynchronously until `count` tokens can be consumed from the bucket.
   * @param count - Number of tokens required (default `1`).
   */
  async wait(count = 1): Promise<void> {
    while (!this.allow(count)) {
      const needed = count - this.tokens;
      const waitMs = Math.max(10, Math.ceil((needed / this.refillRatePerSec) * 1000));
      await Bun.sleep(waitMs);
    }
  }
}

/**
 * Operational state of a {@link CircuitBreaker}.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

// 3-State Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN)
/**
 * Three-state circuit breaker (`CLOSED` -> `OPEN` -> `HALF_OPEN`) that fast-fails calls after
 * consecutive failures and probes recovery after a reset timeout.
 */
export class CircuitBreaker {
  private failureCount = 0;
  private state: CircuitState = "CLOSED";
  private lastStateChange: number = Date.now();
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;

  /**
   * Creates a circuit breaker instance.
   * @param failureThreshold - Consecutive failures required to trip the breaker open (default `5`).
   * @param resetTimeoutMs - Milliseconds in `OPEN` state before transitioning to `HALF_OPEN` (default `10000`).
   */
  constructor(failureThreshold = 5, resetTimeoutMs = 10_000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  /**
   * Returns the current state of the circuit breaker, automatically transitioning from
   * `OPEN` to `HALF_OPEN` if the reset timeout has elapsed.
   */
  getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.lastStateChange >= this.resetTimeoutMs) {
      this.state = "HALF_OPEN";
      this.lastStateChange = Date.now();
    }
    return this.state;
  }

  /**
   * Returns `true` if calls are currently permitted (`CLOSED` or `HALF_OPEN`).
   */
  canExecute(): boolean {
    const s = this.getState();
    return s === "CLOSED" || s === "HALF_OPEN";
  }

  /**
   * Records a successful execution and resets the circuit breaker to `CLOSED`.
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
    this.lastStateChange = Date.now();
  }

  /**
   * Records a failed execution and trips the circuit breaker to `OPEN` when the threshold is reached.
   */
  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.lastStateChange = Date.now();
    }
  }

  /**
   * Executes an async operation through the circuit breaker, recording success or failure automatically.
   * @param fn - Asynchronous operation to guard.
   * @returns The resolved value of `fn`.
   */
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
/**
 * Retries an asynchronous function with exponential backoff and random jitter.
 * @param fn - Async operation to execute.
 * @param maxAttempts - Maximum number of attempts before rethrowing the last error (default `3`).
 * @param delayMs - Initial backoff delay in milliseconds (default `100`).
 * @param multiplier - Exponential backoff multiplier per retry (default `2.0`).
 * @param maxDelayMs - Upper bound on backoff delay in milliseconds (default `5000`).
 */
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
/**
 * Creates a debounced wrapper that delays invoking `fn` until `waitMs` milliseconds have elapsed
 * since the last call.
 * @param fn - Function to debounce.
 * @param waitMs - Quiet period in milliseconds before invoking `fn`.
 */
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
/**
 * Creates a throttled wrapper that invokes `fn` at most once per `intervalMs` milliseconds.
 * @param fn - Function to throttle.
 * @param intervalMs - Minimum interval in milliseconds between invocations.
 */
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

/**
 * Namespace of flow control and resilience utilities (`RateLimiter`, `CircuitBreaker`, `retry`, `debounce`, `throttle`).
 */
export const flowutils = {
  RateLimiter,
  CircuitBreaker,
  retry,
  debounce,
  throttle,
};
