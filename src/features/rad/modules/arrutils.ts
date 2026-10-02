// Feature: RAD - arrutils (and sliceutils)
// Array & collection utilities inspired by es-toolkit and modern standard libraries

// Doer: Safe element retrieval by index supporting negative indices (counting backwards from end)
export function at<T>(arr: readonly T[], index: number): T | undefined {
  const len = arr.length;
  const k = index < 0 ? len + index : index;
  return k >= 0 && k < len ? arr[k] : undefined;
}

// Doer: Remove falsy values (false, null, 0, "", undefined, NaN) from array
export function compact<T>(arr: readonly (T | null | undefined | false | 0 | "")[]): T[] {
  return arr.filter((item): item is T => Boolean(item));
}

// Doer: Extract unique array elements with optional key selector
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

// Alias for unique with key selector
export const uniqBy = unique;

// Doer: Split array into fixed-size chunks
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("[arrutils] Chunk size must be greater than zero");
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// Doer: Flatten nested arrays by 1 level
export function flatten<T>(arr: readonly (T | readonly T[])[]): T[] {
  return (arr as any[]).flat(1) as T[];
}

// Doer: Partition array into matching and non-matching sets
export function partition<T>(arr: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of arr) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  return [pass, fail];
}

// Doer: Return intersection of two arrays
export function intersection<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return unique(a.filter((item) => setB.has(item)));
}

// Doer: Return difference of array A minus array B
export function difference<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return unique(a.filter((item) => !setB.has(item)));
}

// Doer: Drop N elements from the beginning of array
export function drop<T>(arr: readonly T[], count = 1): T[] {
  return arr.slice(Math.max(0, count));
}

// Doer: Drop N elements from the end of array
export function dropRight<T>(arr: readonly T[], count = 1): T[] {
  return count <= 0 ? [...arr] : arr.slice(0, Math.max(0, arr.length - count));
}

// Doer: Drop elements from the beginning as long as predicate returns true
export function dropWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  let idx = 0;
  while (idx < arr.length && predicate(arr[idx]!)) {
    idx++;
  }
  return arr.slice(idx);
}

// Doer: Drop elements from the end as long as predicate returns true
export function dropRightWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  let idx = arr.length;
  while (idx > 0 && predicate(arr[idx - 1]!)) {
    idx--;
  }
  return arr.slice(0, idx);
}

// Doer: Take N elements from the beginning of array
export function take<T>(arr: readonly T[], count = 1): T[] {
  return arr.slice(0, Math.max(0, count));
}

// Doer: Take N elements from the end of array
export function takeRight<T>(arr: readonly T[], count = 1): T[] {
  return count <= 0 ? [] : arr.slice(Math.max(0, arr.length - count));
}

// Doer: Take elements from the beginning as long as predicate returns true
export function takeWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (!predicate(item)) break;
    result.push(item);
  }
  return result;
}

// Doer: Take elements from the end as long as predicate returns true
export function takeRightWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!predicate(arr[i]!)) break;
    result.unshift(arr[i]!);
  }
  return result;
}

// Doer: Index an array into an object by key selector (last item wins)
export function keyBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T> {
  const result = {} as Record<K, T>;
  for (const item of arr) {
    result[keyFn(item)] = item;
  }
  return result;
}

// Doer: Count occurrences of array elements by key selector
export function countBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const item of arr) {
    const key = keyFn(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

// Doer: Find minimum element by numeric selector
export function minBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined;
  let minItem = arr[0]!;
  let minVal = fn(minItem);
  for (let i = 1; i < arr.length; i++) {
    const val = fn(arr[i]!);
    if (val < minVal) {
      minVal = val;
      minItem = arr[i]!;
    }
  }
  return minItem;
}

// Doer: Find maximum element by numeric selector
export function maxBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined;
  let maxItem = arr[0]!;
  let maxVal = fn(maxItem);
  for (let i = 1; i < arr.length; i++) {
    const val = fn(arr[i]!);
    if (val > maxVal) {
      maxVal = val;
      maxItem = arr[i]!;
    }
  }
  return maxItem;
}

// Doer: Sum array elements by numeric selector
export function sumBy<T>(arr: readonly T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

// Doer: Zip two arrays into array of tuples
export function zip<T, U>(a: readonly T[], b: readonly U[]): [T, U][] {
  const len = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < len; i++) {
    result.push([a[i]!, b[i]!]);
  }
  return result;
}

// Doer: Unzip array of tuples into two separate arrays
export function unzip<T, U>(pairs: readonly [T, U][]): [T[], U[]] {
  const firsts: T[] = [];
  const seconds: U[] = [];
  for (const [a, b] of pairs) {
    firsts.push(a);
    seconds.push(b);
  }
  return [firsts, seconds];
}

// Doer: Fisher-Yates array shuffle (returns new array)
export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// Doer: Sample N random elements from array
export function sample<T>(arr: readonly T[], count = 1): T[] {
  if (arr.length === 0) return [];
  const shuffled = shuffle(arr);
  return shuffled.slice(0, Math.min(count, arr.length));
}

// Alias for sample
export const sampleSize = sample;

// Doer: Group array items by key selector
export function groupBy<T, K extends PropertyKey>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

// Doer: Sort array by key selector with direction
export function sortBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => number | string | Date,
  direction: "asc" | "desc" = "asc"
): T[] {
  const copy = [...arr];
  copy.sort((a, b) => {
    const keyA = keyFn(a);
    const keyB = keyFn(b);
    let cmp = 0;
    if (keyA < keyB) cmp = -1;
    else if (keyA > keyB) cmp = 1;
    return direction === "asc" ? cmp : -cmp;
  });
  return copy;
}

// Doer: Calculate frequency of each item in array
export function frequency<T extends PropertyKey>(arr: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

// Doer: Return all elements of array except the first
export function tail<T>(arr: readonly T[]): T[] {
  return arr.slice(1);
}

// Doer: Exclude specified values from array
export function without<T>(arr: readonly T[], ...values: T[]): T[] {
  const excludeSet = new Set(values);
  return arr.filter((item) => !excludeSet.has(item));
}

// Doer: Construct an object from an array of keys and an array of values
export function zipObject<K extends PropertyKey, V>(keys: readonly K[], values: readonly V[]): Record<K, V> {
  const result = {} as Record<K, V>;
  const len = Math.min(keys.length, values.length);
  for (let i = 0; i < len; i++) {
    result[keys[i]!] = values[i]!;
  }
  return result;
}

export const arrutils = {
  at,
  compact,
  unique,
  uniqBy,
  chunk,
  flatten,
  partition,
  intersection,
  difference,
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
  minBy,
  maxBy,
  sumBy,
  zip,
  unzip,
  tail,
  without,
  zipObject,
  shuffle,
  sample,
  sampleSize,
  groupBy,
  sortBy,
  frequency,
};

// Vlang alias
export const sliceutils = arrutils;

