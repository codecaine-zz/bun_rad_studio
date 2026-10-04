// Feature: RAD - arrutils (and sliceutils alias)
// Immutable array & collection toolkit inspired by es-toolkit / lodash / Kotlin collections.
// Every function returns a NEW array (inputs are never mutated) and accepts readonly arrays.

/** Values that can be compared with `<` / `>` for sorting. */
export type Sortable = number | string | bigint | Date | boolean;

/** Sort direction. */
export type SortDirection = "asc" | "desc";

function compareValues(a: Sortable, b: Sortable): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Element at `index`; negative indices count from the end. `undefined` when out of range.
 * @example `arrutils.at([1, 2, 3], -1); // 3`
 */
export function at<T>(arr: readonly T[], index: number): T | undefined {
  const len = arr.length;
  const k = index < 0 ? len + index : index;
  return k >= 0 && k < len ? arr[k] : undefined;
}

/** First element or `undefined`. @example `arrutils.first([7, 8]); // 7` */
export function first<T>(arr: readonly T[]): T | undefined {
  return arr[0];
}

/** Alias of {@link first}. */
export const head = first;

/** Last element or `undefined`. @example `arrutils.last([7, 8]); // 8` */
export function last<T>(arr: readonly T[]): T | undefined {
  return arr[arr.length - 1];
}

/** Every element except the first. @example `arrutils.tail([1, 2, 3]); // [2, 3]` */
export function tail<T>(arr: readonly T[]): T[] {
  return arr.slice(1);
}

/** Every element except the last. @example `arrutils.initial([1, 2, 3]); // [1, 2]` */
export function initial<T>(arr: readonly T[]): T[] {
  return arr.slice(0, -1);
}

/**
 * Integer sequence `[start, end)` with `step` (negative steps count down). One argument = `[0, n)`.
 * @throws When `step` is 0.
 * @example
 * ```ts
 * arrutils.range(4);        // [0, 1, 2, 3]
 * arrutils.range(1, 10, 3); // [1, 4, 7]
 * arrutils.range(5, 0, -2); // [5, 3, 1]
 * ```
 */
export function range(start: number, end?: number, step = 1): number[] {
  if (step === 0) throw new Error("[arrutils.range] step must not be 0");
  const [from, to] = end === undefined ? [0, start] : [start, end];
  const out: number[] = [];
  for (let i = from; step > 0 ? i < to : i > to; i += step) out.push(i);
  return out;
}

/**
 * Remove falsy values (`false`, `null`, `0`, `""`, `undefined`, `NaN`).
 * @example `arrutils.compact([0, 1, "", "a", null]); // [1, "a"]`
 */
export function compact<T>(arr: readonly (T | null | undefined | false | 0 | "")[]): T[] {
  return arr.filter((item): item is T => Boolean(item));
}

/**
 * Map and drop `null`/`undefined` results in one pass (Kotlin's `mapNotNull`).
 * @example `arrutils.filterMap(["1", "x", "3"], (s) => (isNaN(+s) ? null : +s)); // [1, 3]`
 */
export function filterMap<T, R>(arr: readonly T[], fn: (item: T, index: number) => R | null | undefined): R[] {
  const out: R[] = [];
  arr.forEach((item, i) => {
    const r = fn(item, i);
    if (r !== null && r !== undefined) out.push(r);
  });
  return out;
}

/**
 * De-duplicate (first occurrence wins), optionally by a derived key.
 * @example `arrutils.unique([{ id: 1 }, { id: 1 }], (u) => u.id); // [{ id: 1 }]`
 */
export function unique<T>(arr: readonly T[], keyFn?: (item: T) => any): T[] {
  if (!keyFn) return Array.from(new Set(arr));
  const seen = new Set();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Alias of {@link unique} with a key selector. */
export const uniqBy = unique;

/**
 * Split into chunks of `size` (last chunk may be shorter).
 * @throws When `size <= 0`.
 * @example `arrutils.chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]`
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("[arrutils] Chunk size must be greater than zero");
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/**
 * Sliding windows of `size`, advancing by `step` (incomplete trailing windows dropped).
 * @throws When `size` or `step` is < 1.
 * @example `arrutils.windowed([1, 2, 3, 4], 2); // [[1, 2], [2, 3], [3, 4]]`
 */
export function windowed<T>(arr: readonly T[], size: number, step = 1): T[][] {
  if (size < 1 || step < 1) throw new Error(`[arrutils.windowed] size and step must be >= 1 (got ${size}, ${step})`);
  const out: T[][] = [];
  for (let i = 0; i + size <= arr.length; i += step) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Adjacent pairs.
 * @example `arrutils.pairwise([1, 2, 3]); // [[1, 2], [2, 3]]`
 */
export function pairwise<T>(arr: readonly T[]): [T, T][] {
  return windowed(arr, 2) as [T, T][];
}

/** Flatten one level. @example `arrutils.flatten([1, [2, 3]]); // [1, 2, 3]` */
export function flatten<T>(arr: readonly (T | readonly T[])[]): T[] {
  return (arr as any[]).flat(1) as T[];
}

/** Flatten every level. @example `arrutils.flattenDeep([1, [2, [3, [4]]]]); // [1, 2, 3, 4]` */
export function flattenDeep<T = unknown>(arr: readonly unknown[]): T[] {
  return (arr as any[]).flat(Infinity) as T[];
}

/**
 * Split into `[matches, nonMatches]`.
 * @example `arrutils.partition([1, 2, 3, 4], (n) => n % 2 === 0); // [[2, 4], [1, 3]]`
 */
export function partition<T>(arr: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of arr) (predicate(item) ? pass : fail).push(item);
  return [pass, fail];
}

/** Count items matching a predicate. @example `arrutils.count([1, 2, 3], (n) => n > 1); // 2` */
export function count<T>(arr: readonly T[], predicate: (item: T) => boolean): number {
  let n = 0;
  for (const item of arr) if (predicate(item)) n++;
  return n;
}

/** Unique items present in both arrays. @example `arrutils.intersection([1, 2, 3], [2, 3, 4]); // [2, 3]` */
export function intersection<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return unique(a.filter((item) => setB.has(item)));
}

/**
 * Intersection by derived key (items taken from `a`).
 * @example `arrutils.intersectionBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], (x) => x.id); // [{ id: 2 }]`
 */
export function intersectionBy<T>(a: readonly T[], b: readonly T[], keyFn: (item: T) => unknown): T[] {
  const keys = new Set(b.map(keyFn));
  return unique(a.filter((item) => keys.has(keyFn(item))), keyFn);
}

/** Unique items in `a` that are not in `b`. @example `arrutils.difference([1, 2, 3], [2]); // [1, 3]` */
export function difference<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return unique(a.filter((item) => !setB.has(item)));
}

/**
 * Difference by derived key.
 * @example `arrutils.differenceBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], (x) => x.id); // [{ id: 1 }]`
 */
export function differenceBy<T>(a: readonly T[], b: readonly T[], keyFn: (item: T) => unknown): T[] {
  const keys = new Set(b.map(keyFn));
  return unique(a.filter((item) => !keys.has(keyFn(item))), keyFn);
}

/** Unique items from all arrays, in first-seen order. @example `arrutils.union([1, 2], [2, 3]); // [1, 2, 3]` */
export function union<T>(...arrays: readonly (readonly T[])[]): T[] {
  return unique(arrays.flat() as T[]);
}

/** Union by derived key. @example `arrutils.unionBy([{ id: 1 }], [{ id: 1 }, { id: 2 }], (x) => x.id).length; // 2` */
export function unionBy<T>(a: readonly T[], b: readonly T[], keyFn: (item: T) => unknown): T[] {
  return unique([...a, ...b], keyFn);
}

/** Symmetric difference: items in exactly one array. @example `arrutils.xor([1, 2], [2, 3]); // [1, 3]` */
export function xor<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...difference(a, b), ...difference(b, a)];
}

/** Drop the first `count` items. @example `arrutils.drop([1, 2, 3], 2); // [3]` */
export function drop<T>(arr: readonly T[], count = 1): T[] {
  return arr.slice(Math.max(0, count));
}

/** Drop the last `count` items. @example `arrutils.dropRight([1, 2, 3], 2); // [1]` */
export function dropRight<T>(arr: readonly T[], count = 1): T[] {
  return count <= 0 ? [...arr] : arr.slice(0, Math.max(0, arr.length - count));
}

/** Drop leading items while `predicate` holds. @example `arrutils.dropWhile([1, 2, 5, 1], (n) => n < 3); // [5, 1]` */
export function dropWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  let idx = 0;
  while (idx < arr.length && predicate(arr[idx]!)) idx++;
  return arr.slice(idx);
}

/** Drop trailing items while `predicate` holds. @example `arrutils.dropRightWhile([1, 5, 2], (n) => n < 3); // [1, 5]` */
export function dropRightWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  let idx = arr.length;
  while (idx > 0 && predicate(arr[idx - 1]!)) idx--;
  return arr.slice(0, idx);
}

/** First `count` items. @example `arrutils.take([1, 2, 3], 2); // [1, 2]` */
export function take<T>(arr: readonly T[], count = 1): T[] {
  return arr.slice(0, Math.max(0, count));
}

/** Last `count` items. @example `arrutils.takeRight([1, 2, 3], 2); // [2, 3]` */
export function takeRight<T>(arr: readonly T[], count = 1): T[] {
  return count <= 0 ? [] : arr.slice(Math.max(0, arr.length - count));
}

/** Leading items while `predicate` holds. @example `arrutils.takeWhile([1, 2, 5, 1], (n) => n < 3); // [1, 2]` */
export function takeWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  const idx = arr.findIndex((item) => !predicate(item));
  return idx === -1 ? [...arr] : arr.slice(0, idx);
}

/** Trailing items while `predicate` holds. @example `arrutils.takeRightWhile([5, 1, 2], (n) => n < 3); // [1, 2]` */
export function takeRightWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  let idx = arr.length;
  while (idx > 0 && predicate(arr[idx - 1]!)) idx--;
  return arr.slice(idx);
}

/**
 * Index by key (last item wins).
 * @example `arrutils.keyBy([{ id: "a" }], (x) => x.id); // { a: { id: "a" } }`
 */
export function keyBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of arr) result[keyFn(item)] = item;
  return result;
}

/**
 * Count items per key.
 * @example `arrutils.countBy(["a", "bb", "cc"], (s) => s.length); // { 1: 1, 2: 2 }`
 */
export function countBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const item of arr) {
    const key = keyFn(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

/**
 * Group items into arrays per key (insertion order kept).
 * @example `arrutils.groupBy([1, 2, 3], (n) => (n % 2 ? "odd" : "even")); // { odd: [1, 3], even: [2] }`
 */
export function groupBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of arr) (result[keyFn(item)] ??= []).push(item);
  return result;
}

/** Item with the smallest selector value. @example `arrutils.minBy([{ a: 3 }, { a: 1 }], (x) => x.a); // { a: 1 }` */
export function minBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestVal = Infinity;
  for (const item of arr) {
    const v = fn(item);
    if (best === undefined || v < bestVal) [best, bestVal] = [item, v];
  }
  return best;
}

/** Item with the largest selector value. @example `arrutils.maxBy([{ a: 3 }, { a: 1 }], (x) => x.a); // { a: 3 }` */
export function maxBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestVal = -Infinity;
  for (const item of arr) {
    const v = fn(item);
    if (best === undefined || v > bestVal) [best, bestVal] = [item, v];
  }
  return best;
}

/** Sum of selector values. @example `arrutils.sumBy([{ n: 2 }, { n: 3 }], (x) => x.n); // 5` */
export function sumBy<T>(arr: readonly T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

/** Pair items by index (truncates to the shorter array). @example `arrutils.zip([1, 2], ["a", "b"]); // [[1, "a"], [2, "b"]]` */
export function zip<T, U>(a: readonly T[], b: readonly U[]): [T, U][] {
  const len = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < len; i++) result.push([a[i]!, b[i]!]);
  return result;
}

/** Combine items by index with a function. @example `arrutils.zipWith([1, 2], [10, 20], (a, b) => a + b); // [11, 22]` */
export function zipWith<T, U, R>(a: readonly T[], b: readonly U[], fn: (x: T, y: U, index: number) => R): R[] {
  return zip(a, b).map(([x, y], i) => fn(x, y, i));
}

/** Split pairs into two arrays. @example `arrutils.unzip([[1, "a"], [2, "b"]]); // [[1, 2], ["a", "b"]]` */
export function unzip<T, U>(pairs: readonly [T, U][]): [T[], U[]] {
  return [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
}

/** Build an object from parallel key/value arrays. @example `arrutils.zipObject(["a", "b"], [1, 2]); // { a: 1, b: 2 }` */
export function zipObject<K extends PropertyKey, V>(keys: readonly K[], values: readonly V[]): Record<K, V> {
  const result = {} as Record<K, V>;
  const len = Math.min(keys.length, values.length);
  for (let i = 0; i < len; i++) result[keys[i]!] = values[i]!;
  return result;
}

/** Remove the given values (SameValueZero). @example `arrutils.without([1, 2, 3, 2], 2); // [1, 3]` */
export function without<T>(arr: readonly T[], ...values: T[]): T[] {
  const excludeSet = new Set(values);
  return arr.filter((item) => !excludeSet.has(item));
}

/**
 * Fisher–Yates shuffle. Pass a seeded `rng` for reproducible results.
 * @example `arrutils.shuffle([1, 2, 3]);`
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** `count` distinct random items (without replacement). @example `arrutils.sample(["a", "b", "c"], 2);` */
export function sample<T>(arr: readonly T[], count = 1, rng: () => number = Math.random): T[] {
  if (arr.length === 0 || count <= 0) return [];
  return shuffle(arr, rng).slice(0, Math.min(count, arr.length));
}

/** Alias of {@link sample}. */
export const sampleSize = sample;

/**
 * Stable sort by one key.
 * @example `arrutils.sortBy(users, (u) => u.age, "desc");`
 */
export function sortBy<T>(arr: readonly T[], keyFn: (item: T) => Sortable, direction: SortDirection = "asc"): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...arr].sort((a, b) => sign * compareValues(keyFn(a), keyFn(b)));
}

/**
 * Stable multi-key sort (ties on key 1 are broken by key 2, …). Directions default to `"asc"`.
 * @example
 * ```ts
 * arrutils.orderBy(users, [(u) => u.team, (u) => u.score], ["asc", "desc"]);
 * ```
 */
export function orderBy<T>(arr: readonly T[], keyFns: readonly ((item: T) => Sortable)[], directions: readonly SortDirection[] = []): T[] {
  return [...arr].sort((a, b) => {
    for (let i = 0; i < keyFns.length; i++) {
      const cmp = compareValues(keyFns[i]!(a), keyFns[i]!(b));
      if (cmp !== 0) return directions[i] === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

/** `true` when already sorted ascending by `keyFn` (identity by default). @example `arrutils.isSorted([1, 2, 2, 5]); // true` */
export function isSorted<T>(arr: readonly T[], keyFn: (item: T) => Sortable = (x) => x as unknown as Sortable): boolean {
  for (let i = 1; i < arr.length; i++) if (compareValues(keyFn(arr[i - 1]!), keyFn(arr[i]!)) > 0) return false;
  return true;
}

/**
 * Index of `target` in an ascending-sorted array via binary search (O(log n)), or `-1`.
 * @example `arrutils.binarySearch([1, 3, 5, 7], 5); // 2`
 */
export function binarySearch<T extends Sortable>(sorted: readonly T[], target: T): number {
  const idx = sortedIndex(sorted, target);
  return idx < sorted.length && compareValues(sorted[idx]!, target) === 0 ? idx : -1;
}

/**
 * Lowest index at which `value` could be inserted to keep `sorted` ascending.
 * @example `arrutils.sortedIndex([10, 20, 30], 25); // 2`
 */
export function sortedIndex<T extends Sortable>(sorted: readonly T[], value: T): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareValues(sorted[mid]!, value) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Occurrence count of each primitive value. @example `arrutils.frequency(["a", "b", "a"]); // { a: 2, b: 1 }` */
export function frequency<T extends PropertyKey>(arr: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of arr) counts[item] = (counts[item] || 0) + 1;
  return counts;
}

/** Copy with `items` inserted at `index` (negative counts from end). @example `arrutils.insertAt([1, 4], 1, 2, 3); // [1, 2, 3, 4]` */
export function insertAt<T>(arr: readonly T[], index: number, ...items: T[]): T[] {
  const copy = [...arr];
  copy.splice(index, 0, ...items);
  return copy;
}

/** Copy without the item at `index` (negative counts from end). @example `arrutils.removeAt([1, 2, 3], -1); // [1, 2]` */
export function removeAt<T>(arr: readonly T[], index: number): T[] {
  const k = index < 0 ? arr.length + index : index;
  return k < 0 || k >= arr.length ? [...arr] : [...arr.slice(0, k), ...arr.slice(k + 1)];
}

/** Copy with the item at `from` moved to `to` (drag-and-drop reordering). @example `arrutils.moveItem(["a", "b", "c"], 0, 2); // ["b", "c", "a"]` */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length) return [...arr];
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item!);
  return copy;
}

/** Rotate left by `n` (negative rotates right). @example `arrutils.rotate([1, 2, 3, 4], 1); // [2, 3, 4, 1]` */
export function rotate<T>(arr: readonly T[], n: number): T[] {
  if (arr.length === 0) return [];
  const k = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

/** Add `item` if absent, remove it if present (tag pickers, selections). @example `arrutils.toggleItem(["a"], "b"); // ["a", "b"]` */
export function toggleItem<T>(arr: readonly T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

/**
 * Cartesian product of any number of arrays.
 * @example `arrutils.cartesianProduct([1, 2], ["a", "b"]); // [[1,"a"],[1,"b"],[2,"a"],[2,"b"]]`
 */
export function cartesianProduct<T>(...arrays: readonly (readonly T[])[]): T[][] {
  return arrays.reduce<T[][]>((acc, arr) => acc.flatMap((combo) => arr.map((x) => [...combo, x])), [[]]);
}

export const arrutils = {
  at,
  first,
  head,
  last,
  tail,
  initial,
  range,
  compact,
  filterMap,
  unique,
  uniqBy,
  chunk,
  windowed,
  pairwise,
  flatten,
  flattenDeep,
  partition,
  count,
  intersection,
  intersectionBy,
  difference,
  differenceBy,
  union,
  unionBy,
  xor,
  drop,
  dropRight,
  dropWhile,
  dropRightWhile,
  take,
  takeRight,
  takeWhile,
  takeRightWhile,
  keyBy,
  countBy,
  groupBy,
  minBy,
  maxBy,
  sumBy,
  zip,
  zipWith,
  unzip,
  zipObject,
  without,
  shuffle,
  sample,
  sampleSize,
  sortBy,
  orderBy,
  isSorted,
  binarySearch,
  sortedIndex,
  frequency,
  insertAt,
  removeAt,
  moveItem,
  rotate,
  toggleItem,
  cartesianProduct,
};

/** V-lang compatible alias of {@link arrutils}. */
export const sliceutils = arrutils;
