// Feature: RAD - fnutils
// Functional programming utilities inspired by es-toolkit and modern standard libraries

// Doer: Return a function that is restricted to invoking fn once
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
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyResolver?: (...args: Parameters<T>) => string
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
export function negate<T extends (...args: any[]) => boolean>(predicate: T): T {
  return ((...args: Parameters<T>): boolean => !predicate(...args)) as T;
}

// Doer: Partially apply arguments to a function
export function partial<T extends (...args: any[]) => any>(
  fn: T,
  ...presetArgs: any[]
): (...remainingArgs: any[]) => ReturnType<T> {
  return (...remainingArgs: any[]) => fn(...presetArgs, ...remainingArgs);
}

// Doer: Return a function that invokes fn while called less than n times
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
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number
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
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number
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
export function identity<T>(value: T): T {
  return value;
}

// Doer: Empty no-operation function
export function noop(): void {}

// Coordinator: Invoke an iteratee N times and return array of results
export function times<T>(n: number, iteratee: (index: number) => T): T[] {
  if (n <= 0) return [];
  const results: T[] = [];
  for (let i = 0; i < n; i++) {
    results.push(iteratee(i));
  }
  return results;
}

// Doer: Asynchronous delay timer
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Coordinator: Simple function composition from left to right: pipe(f, g)(x) = g(f(x))
export function pipe<T>(initialValue: T, ...fns: ((val: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), initialValue);
}

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
