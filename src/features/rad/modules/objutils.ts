// Feature: RAD - objutils
// Object manipulation, deep path lookup, cloning, and predicates inspired by es-toolkit

// Doer: Check if value is null or undefined
export function isNil(val: unknown): val is null | undefined {
  return val === null || val === undefined;
}

// Doer: Check if value is a plain JavaScript object
export function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === "object" && val !== null && Object.prototype.toString.call(val) === "[object Object]";
}

// Doer: Deep equality check between two arbitrary values powered by native Bun.deepEquals
export function isEqual(a: unknown, b: unknown): boolean {
  return Bun.deepEquals(a, b);
}

// Doer: Check if value is empty (empty string, empty array, empty object, empty Map/Set, or nil)
export function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === "boolean" || typeof val === "number") return true;
  if (typeof val === "string" || Array.isArray(val)) return val.length === 0;
  if (val instanceof Map || val instanceof Set) return val.size === 0;
  if (typeof val === "object") return Object.keys(val).length === 0;
  return true;
}

// Doer: Tokenize path string or array into keys
export function toPath(path: string | readonly (string | number)[]): (string | number)[] {
  if (Array.isArray(path)) return path as (string | number)[];
  return path
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\./, "")
    .split(".")
    .filter(Boolean)
    .map((k) => (/^\d+$/.test(k) ? Number(k) : k));
}

// Doer: Safely retrieve deeply nested object property with optional fallback default
export function get<T = any>(obj: unknown, path: string | readonly (string | number)[], defaultValue?: T): T | undefined {
  if (obj == null) return defaultValue;
  const keys = toPath(path);
  let current: any = obj;

  for (const key of keys) {
    if (current == null) return defaultValue;
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

// Doer: Check if deeply nested property path exists in object
export function has(obj: unknown, path: string | readonly (string | number)[]): boolean {
  if (obj == null) return false;
  const keys = toPath(path);
  let current: any = obj;

  for (const key of keys) {
    if (current == null || !(key in Object(current))) {
      return false;
    }
    current = current[key];
  }

  return true;
}

// Coordinator: Set value at deeply nested path (mutates obj or creates nested structures)
export function set<T extends object>(obj: T, path: string | readonly (string | number)[], value: any): T {
  if (obj == null) return obj;
  const keys = toPath(path);
  if (keys.length === 0) return obj;

  let current: any = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    const nextKey = keys[i + 1]!;
    if (current[key] == null || typeof current[key] !== "object") {
      current[key] = typeof nextKey === "number" ? [] : {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1]!;
  current[lastKey] = value;
  return obj;
}

// Doer: Pick specific keys from object
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

// Doer: Omit specific keys from object
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const keySet = new Set<keyof T>(keys);
  const result = {} as any;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (!keySet.has(key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

// Doer: Map object keys to new keys
export function mapKeys<T extends object, K extends PropertyKey>(
  obj: T,
  fn: (value: T[keyof T], key: string) => K
): Record<K, T[keyof T]> {
  const result = {} as Record<K, T[keyof T]>;
  for (const [key, value] of Object.entries(obj)) {
    result[fn(value, key)] = value;
  }
  return result;
}

// Doer: Map object values
export function mapValues<T extends object, V>(
  obj: T,
  fn: (value: T[keyof T], key: string) => V
): Record<keyof T, V> {
  const result = {} as Record<keyof T, V>;
  for (const [key, value] of Object.entries(obj)) {
    result[key as keyof T] = fn(value, key);
  }
  return result;
}

// Doer: Invert keys and values of object
export function invert<K extends PropertyKey, V extends PropertyKey>(obj: Record<K, V>): Record<V, K> {
  const result = {} as Record<V, K>;
  for (const [key, value] of Object.entries(obj)) {
    result[value as V] = key as unknown as K;
  }
  return result;
}

// Doer: Deep clone value using native structuredClone
export function deepClone<T>(val: T): T {
  return structuredClone(val);
}

// Coordinator: Deeply merge two or more plain objects
export function deepMerge<T extends object, U extends object>(target: T, ...sources: U[]): T & U {
  let output = { ...target } as any;
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    for (const key of Object.keys(src)) {
      if (isPlainObject(src[key]) && isPlainObject(output[key])) {
        output[key] = deepMerge(output[key], src[key]);
      } else {
        output[key] = src[key];
      }
    }
  }
  return output;
}

// Doer: Pick properties where predicate returns truthy
export function pickBy<T extends object>(
  obj: T,
  predicate: (value: T[keyof T], key: string) => boolean
): Partial<T> {
  const result = {} as Partial<T>;
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value as T[keyof T], key)) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

// Doer: Omit properties where predicate returns truthy
export function omitBy<T extends object>(
  obj: T,
  predicate: (value: T[keyof T], key: string) => boolean
): Partial<T> {
  const result = {} as Partial<T>;
  for (const [key, value] of Object.entries(obj)) {
    if (!predicate(value as T[keyof T], key)) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

// Coordinator: Remove property at deeply nested path
export function unset(obj: any, path: string | readonly (string | number)[]): boolean {
  if (obj == null) return false;
  const keys = toPath(path);
  if (keys.length === 0) return false;

  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (current[key] == null || typeof current[key] !== "object") {
      return false;
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1]!;
  if (Array.isArray(current) && typeof lastKey === "number") {
    current.splice(lastKey, 1);
    return true;
  }
  if (lastKey in current) {
    delete current[lastKey];
    return true;
  }
  return false;
}

// Doer: Find key of first property that satisfies predicate
export function findKey<T extends object>(
  obj: T,
  predicate: (value: T[keyof T], key: string) => boolean
): string | undefined {
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value as T[keyof T], key)) {
      return key;
    }
  }
  return undefined;
}

// Coordinator: Flatten nested object into single-level dot-separated keys
export function flattenObject(obj: Record<string, any>, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

export const objutils = {
  isNil,
  isPlainObject,
  isEqual,
  isEmpty,
  toPath,
  get,
  has,
  set,
  unset,
  pick,
  pickBy,
  omit,
  omitBy,
  findKey,
  flattenObject,
  mapKeys,
  mapValues,
  invert,
  deepClone,
  deepMerge,
};

