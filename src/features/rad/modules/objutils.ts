// Feature: RAD - objutils
// Object toolkit inspired by es-toolkit / lodash: predicates, prototype-pollution-safe deep paths
// (get/has/set/unset), pick/omit families, key/value mapping, structural equality (Bun.deepEquals),
// deep clone/merge/freeze, flatten/unflatten, defaults, compaction, renaming and deep diffs.

/** A dotted/bracketed path (`"a.b[0].c"`) or an explicit key array (`["a", "b", 0, "c"]`). */
export type ObjPath = string | readonly (string | number)[];

/** Result of {@link objectDiff}: dotted paths that were added, removed or changed. */
export interface ObjectDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeKey(key: string | number, fn: string): void {
  if (UNSAFE_KEYS.has(String(key))) throw new Error(`[objutils.${fn}] Refusing unsafe key "${key}" (prototype pollution)`);
}

/** `true` for `null` / `undefined`. @example `objutils.isNil(null); // true` */
export function isNil(val: unknown): val is null | undefined {
  return val === null || val === undefined;
}

/** `true` for object literals / `Object.create(null)` (not arrays, dates, maps, class instances). @example `objutils.isPlainObject({}); // true` */
export function isPlainObject(val: unknown): val is Record<string, any> {
  if (typeof val !== "object" || val === null) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

/** `true` for string, number, bigint, boolean, symbol, null, undefined. @example `objutils.isPrimitive(1n); // true` */
export function isPrimitive(val: unknown): boolean {
  return val === null || (typeof val !== "object" && typeof val !== "function");
}

/**
 * Structural deep equality via native `Bun.deepEquals`.
 * @param strict - Also compare `undefined` props, sparse arrays and prototypes. Default `false`.
 * @example `objutils.isEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }); // true`
 */
export function isEqual(a: unknown, b: unknown, strict = false): boolean {
  return Bun.deepEquals(a, b, strict);
}

/**
 * `true` for nil, `""`, `[]`, `{}`, empty Map/Set — and (legacy) for every number/boolean.
 * @example `objutils.isEmpty({}); // true`
 */
export function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === "boolean" || typeof val === "number") return true;
  if (typeof val === "string" || Array.isArray(val)) return val.length === 0;
  if (val instanceof Map || val instanceof Set) return val.size === 0;
  if (typeof val === "object") return Object.keys(val).length === 0;
  return true;
}

/**
 * Tokenize a path. Supports dots, `[0]` and quoted brackets `["a.b"]`; numeric segments become numbers.
 * @example `objutils.toPath('users[0]["first.name"]'); // ["users", 0, "first.name"]`
 */
export function toPath(path: ObjPath): (string | number)[] {
  if (typeof path !== "string") return [...path];
  const out: (string | number)[] = [];
  const re = /\[\s*(["'])(.*?)\1\s*\]|\[(\d+)\]|([^.[\]]+)/g;
  for (const m of path.matchAll(re)) {
    if (m[2] !== undefined) out.push(m[2]);
    else if (m[3] !== undefined) out.push(Number(m[3]));
    else if (m[4] !== undefined) out.push(/^\d+$/.test(m[4]) ? Number(m[4]) : m[4]);
  }
  return out;
}

/**
 * Safe deep read; returns `defaultValue` when any segment is missing or the value is `undefined`.
 * @example `objutils.get({ a: { b: [10] } }, "a.b[0]"); // 10`
 * @example `objutils.get<number>(cfg, "server.port", 3000); // typed number, never undefined`
 */
export function get<T>(obj: unknown, path: ObjPath, defaultValue: T): T;
export function get(obj: unknown, path: ObjPath): any;
export function get<T>(obj: unknown, path: ObjPath): T | undefined;
export function get<T = any>(obj: unknown, path: ObjPath, defaultValue?: T): T | undefined {
  if (obj == null) return defaultValue;
  let current: any = obj;
  for (const key of toPath(path)) {
    if (current == null) return defaultValue;
    current = current[key];
  }
  return current !== undefined ? current : defaultValue;
}

/**
 * `true` when every segment of `path` exists (even if the final value is `undefined`).
 * @example `objutils.has({ a: { b: undefined } }, "a.b"); // true`
 */
export function has(obj: unknown, path: ObjPath): boolean {
  if (obj == null) return false;
  let current: any = obj;
  for (const key of toPath(path)) {
    if (current == null || !(key in Object(current))) return false;
    current = current[key];
  }
  return true;
}

/**
 * Deep write (mutates `obj`), creating `{}` or `[]` (for numeric next keys) as needed.
 * @throws On `__proto__` / `constructor` / `prototype` segments (prototype-pollution guard).
 * @example `objutils.set({}, "a.list[1].name", "x"); // { a: { list: [ , { name: "x" }] } }`
 */
export function set<T extends object>(obj: T, path: ObjPath, value: any): T {
  if (obj == null) return obj;
  const keys = toPath(path);
  if (keys.length === 0) return obj;
  let current: any = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    assertSafeKey(key, "set");
    if (current[key] == null || typeof current[key] !== "object") current[key] = typeof keys[i + 1] === "number" ? [] : {};
    current = current[key];
  }
  const lastKey = keys[keys.length - 1]!;
  assertSafeKey(lastKey, "set");
  current[lastKey] = value;
  return obj;
}

/**
 * Deep delete (mutates). Array indices are spliced out. @returns `true` when something was removed.
 * @example `objutils.unset(cfg, "server.tls");`
 */
export function unset(obj: any, path: ObjPath): boolean {
  if (obj == null) return false;
  const keys = toPath(path);
  if (keys.length === 0) return false;
  let current = obj;
  for (const key of keys.slice(0, -1)) {
    if (current[key] == null || typeof current[key] !== "object") return false;
    current = current[key];
  }
  const lastKey = keys[keys.length - 1]!;
  if (Array.isArray(current) && typeof lastKey === "number") {
    if (lastKey >= current.length) return false;
    current.splice(lastKey, 1);
    return true;
  }
  if (!(lastKey in current)) return false;
  delete current[lastKey];
  return true;
}

/** New object with only `keys`. @example `objutils.pick({ a: 1, b: 2 }, ["a"]); // { a: 1 }` */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) if (key in obj) result[key] = obj[key];
  return result;
}

/** New object without `keys`. @example `objutils.omit({ a: 1, b: 2 }, ["a"]); // { b: 2 }` */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const keySet = new Set<keyof T>(keys);
  const result = {} as any;
  for (const key of Object.keys(obj) as (keyof T)[]) if (!keySet.has(key)) result[key] = obj[key];
  return result;
}

/** Keep entries where `predicate` is truthy. @example `objutils.pickBy({ a: 1, b: 0 }, Boolean); // { a: 1 }` */
export function pickBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: string) => boolean): Partial<T> {
  const result = {} as Partial<T>;
  for (const [key, value] of Object.entries(obj)) if (predicate(value, key)) result[key as keyof T] = value;
  return result;
}

/** Drop entries where `predicate` is truthy. @example `objutils.omitBy({ a: 1, b: null }, objutils.isNil); // { a: 1 }` */
export function omitBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: string) => boolean): Partial<T> {
  return pickBy(obj, (v, k) => !predicate(v, k));
}

/** Remove `null`/`undefined` values (shallow). @example `objutils.compactObject({ a: 1, b: undefined }); // { a: 1 }` */
export function compactObject<T extends object>(obj: T): Partial<T> {
  return omitBy(obj, (v) => v === null || v === undefined);
}

/** First key whose value satisfies `predicate`. @example `objutils.findKey({ a: 1, b: 5 }, (v) => v > 2); // "b"` */
export function findKey<T extends object>(obj: T, predicate: (value: T[keyof T], key: string) => boolean): string | undefined {
  return Object.entries(obj).find(([k, v]) => predicate(v, k))?.[0];
}

/** Transform keys. @example `objutils.mapKeys({ a: 1 }, (_v, k) => k.toUpperCase()); // { A: 1 }` */
export function mapKeys<T extends object, K extends PropertyKey>(obj: T, fn: (value: T[keyof T], key: string) => K): Record<K, T[keyof T]> {
  const result = {} as Record<K, T[keyof T]>;
  for (const [key, value] of Object.entries(obj)) result[fn(value, key)] = value;
  return result;
}

/** Transform values. @example `objutils.mapValues({ a: 1 }, (v) => v * 10); // { a: 10 }` */
export function mapValues<T extends object, V>(obj: T, fn: (value: T[keyof T], key: string) => V): Record<keyof T, V> {
  const result = {} as Record<keyof T, V>;
  for (const [key, value] of Object.entries(obj)) result[key as keyof T] = fn(value, key);
  return result;
}

/** Rename keys via a `{ old: "new" }` map (unlisted keys kept). @example `objutils.renameKeys({ id: 1 }, { id: "userId" }); // { userId: 1 }` */
export function renameKeys<T extends object>(obj: T, mapping: Record<string, string>): Record<string, unknown> {
  return mapKeys(obj, (_v, k) => mapping[k] ?? k);
}

/** Swap keys and values. @example `objutils.invert({ a: "x" }); // { x: "a" }` */
export function invert<K extends PropertyKey, V extends PropertyKey>(obj: Record<K, V>): Record<V, K> {
  const result = {} as Record<V, K>;
  for (const [key, value] of Object.entries(obj)) result[value as V] = key as unknown as K;
  return result;
}

/** `Object.keys` typed as `(keyof T)[]`. @example `objutils.typedKeys({ a: 1 }); // ["a"]` */
export function typedKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

/** `Object.entries` with key/value types preserved. @example `for (const [k, v] of objutils.typedEntries(cfg)) …` */
export function typedEntries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/**
 * Fill keys that are `undefined` in `obj` from each source in order (shallow, non-mutating).
 * @example `objutils.defaults({ a: 1 }, { a: 9, b: 2 }); // { a: 1, b: 2 }`
 */
export function defaults<T extends object>(obj: T, ...sources: Partial<T>[]): T {
  const out: any = { ...obj };
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) if (out[k] === undefined) out[k] = v;
  }
  return out;
}

/** Deep copy via `structuredClone` (Dates, Maps, Sets, typed arrays, cycles). @example `const copy = objutils.deepClone(state);` */
export function deepClone<T>(val: T): T {
  return structuredClone(val);
}

/**
 * Recursively merge plain objects left→right (arrays & scalars replace). Non-mutating;
 * `__proto__`/`constructor`/`prototype` keys are skipped.
 * @example `objutils.deepMerge({ a: { x: 1 } }, { a: { y: 2 } }); // { a: { x: 1, y: 2 } }`
 */
export function deepMerge<T extends object, U extends object>(target: T, ...sources: U[]): T & U {
  const output: Record<string, any> = { ...target };
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    for (const [key, value] of Object.entries(src)) {
      if (UNSAFE_KEYS.has(key)) continue;
      output[key] = isPlainObject(value) && isPlainObject(output[key]) ? deepMerge(output[key], value) : value;
    }
  }
  return output as T & U;
}

/** Recursively `Object.freeze` (returns the same, now immutable, object). @example `const CONFIG = objutils.deepFreeze({ a: { b: 1 } });` */
export function deepFreeze<T>(val: T): Readonly<T> {
  if (val && typeof val === "object" && !Object.isFrozen(val)) {
    Object.freeze(val);
    for (const v of Object.values(val)) deepFreeze(v);
  }
  return val;
}

/**
 * Flatten nested plain objects to dotted keys. Arrays are kept as values unless `flattenArrays`.
 * @example `objutils.flattenObject({ a: { b: 1 }, c: [1] }); // { "a.b": 1, c: [1] }`
 */
export function flattenObject(obj: Record<string, any>, prefix = "", flattenArrays = false): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const recurse = isPlainObject(value) || (flattenArrays && Array.isArray(value));
    if (recurse && Object.keys(value).length > 0) Object.assign(result, flattenObject(value, fullKey, flattenArrays));
    else result[fullKey] = value;
  }
  return result;
}

/**
 * Inverse of {@link flattenObject}: dotted keys → nested objects (numeric segments become arrays).
 * @example `objutils.unflattenObject({ "a.b": 1, "list.0": "x" }); // { a: { b: 1 }, list: ["x"] }`
 */
export function unflattenObject(flat: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat)) set(out, key, value);
  return out;
}

/**
 * Deep structural diff of two plain objects as dotted leaf paths.
 * @example
 * ```ts
 * objutils.objectDiff({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 }, d: 4 });
 * // { added: ["d"], removed: [], changed: ["b.c"] }
 * ```
 */
export function objectDiff(before: Record<string, any>, after: Record<string, any>): ObjectDiff {
  const a = flattenObject(before);
  const b = flattenObject(after);
  const diff: ObjectDiff = { added: [], removed: [], changed: [] };
  for (const k of Object.keys(b)) {
    if (!(k in a)) diff.added.push(k);
    else if (!Bun.deepEquals(a[k], b[k])) diff.changed.push(k);
  }
  for (const k of Object.keys(a)) if (!(k in b)) diff.removed.push(k);
  return diff;
}

export const objutils = {
  isNil,
  isPlainObject,
  isPrimitive,
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
  compactObject,
  findKey,
  flattenObject,
  unflattenObject,
  mapKeys,
  mapValues,
  renameKeys,
  invert,
  typedKeys,
  typedEntries,
  defaults,
  deepClone,
  deepMerge,
  deepFreeze,
  objectDiff,
};
