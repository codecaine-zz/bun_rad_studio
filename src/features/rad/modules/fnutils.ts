/**
 * Functional programming higher-order utilities including `once`, `memoize`, `negate`, `partial`,
 * `before`, `after`, `debounce`, `throttle`, `identity`, `noop`, `times`, `delay`, and `pipe`.
 */
// Feature: RAD - fnutils
// Functional programming utilities inspired by es-toolkit and modern standard libraries

// Doer: Return a function that is restricted to invoking fn once
/**
 * Wraps `fn` so it is invoked at most once; subsequent calls return the result of the first invocation.
 */
export function once<T extends (...args: any[]) => any>(fn: T): T {
  let called = false;
  let result: ReturnType<T>;
  return ((...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  }) as T;
}

// Coordinator: Memoize function results with Map cache and optional cache key resolver
/**
 * Memoizes `fn` using a `Map` cache exposed on `.cache`, keyed by `keyResolver` or `JSON.stringify(args)`.
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyResolver?: (...args: Parameters<T>) => string,
): T & { cache: Map<string, ReturnType<T>> } {
  const cache = new Map<string, ReturnType<T>>();

  const memoized = (...args: Parameters<T>): ReturnType<T> => {
    const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };

  memoized.cache = cache;
  return memoized as any;
}

// Doer: Negate the result of a predicate function
/**
 * Returns a predicate function that negates the boolean result of `predicate`.
 */
export function negate<T extends (...args: any[]) => boolean>(predicate: T): T {
  return ((...args: Parameters<T>): boolean => !predicate(...args)) as T;
}

// Doer: Partially apply arguments to a function
/**
 * Partially applies `presetArgs` to `fn`, returning a function accepting the remaining arguments.
 */
export function partial<T extends (...args: any[]) => any>(
  fn: T,
  ...presetArgs: any[]
): (...remainingArgs: any[]) => ReturnType<T> {
  return (...remainingArgs: any[]) => fn(...presetArgs, ...remainingArgs);
}

// Doer: Return a function that invokes fn while called less than n times
/**
 * Wraps `fn` so it is invoked at most `n` times; subsequent calls return the last computed result.
 */
export function before<T extends (...args: any[]) => any>(n: number, fn: T): T {
  let count = 0;
  let result: ReturnType<T>;
  return ((...args: Parameters<T>): ReturnType<T> => {
    if (count < n) {
      count++;
      result = fn(...args);
    }
    return result;
  }) as T;
}

// Doer: Return a function that invokes fn only after called n or more times
/**
 * Wraps `fn` so it only executes once it has been called `n` or more times (returning `undefined` before then).
 */
export function after<T extends (...args: any[]) => any>(n: number, fn: T): T {
  let count = 0;
  return ((...args: Parameters<T>): ReturnType<T> | undefined => {
    count++;
    if (count >= n) {
      return fn(...args);
    }
    return undefined;
  }) as any;
}

// Coordinator: Debounce function execution until waitMs of inactivity
/**
 * Delays invoking `fn` until `waitMs` milliseconds have elapsed since the last call, exposing `.cancel()`.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

// Coordinator: Throttle function execution to at most once per waitMs window
/**
 * Throttles `fn` to execute at most once per `waitMs` window (with trailing edge scheduling and `.cancel()`).
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let lastExec = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastExec);
    if (remaining <= 0 || remaining > waitMs) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastExec = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastExec = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return throttled;
}

// Doer: Return identity of first argument
/**
 * Returns `value` unchanged (`f(x) = x`).
 */
export function identity<T>(value: T): T {
  return value;
}

// Doer: Empty no-operation function
/**
 * No-operation function that does nothing and returns `undefined`.
 */
export function noop(): void {}

// Coordinator: Invoke an iteratee N times and return array of results
/**
 * Invokes `iteratee(index)` `n` times (`0 .. n - 1`) and returns an array of the results.
 */
export function times<T>(n: number, iteratee: (index: number) => T): T[] {
  if (n <= 0) return [];
  const results: T[] = [];
  for (let i = 0; i < n; i++) {
    results.push(iteratee(i));
  }
  return results;
}

// Doer: Asynchronous delay timer
/**
 * Returns a `Promise` that resolves after `ms` milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Coordinator: Simple function composition from left to right: pipe(f, g)(x) = g(f(x))
/**
 * Pipes `initialValue` left-to-right through a sequence of unary transformation functions `fns`.
 */
export function pipe<T>(initialValue: T, ...fns: ((val: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), initialValue);
}

/**
 * Namespace of functional programming utilities (`once`, `memoize`, `negate`, `partial`, `before`, `after`, `debounce`, `throttle`, `identity`, `noop`, `times`, `delay`, `pipe`).
 */
export const fnutils = {
  once,
  memoize,
  negate,
  partial,
  before,
  after,
  debounce,
  throttle,
  identity,
  noop,
  times,
  delay,
  pipe,
};
