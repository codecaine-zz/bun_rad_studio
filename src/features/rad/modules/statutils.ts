// Feature: RAD - statutils
// Descriptive & inferential statistics in pure TypeScript: central tendency (arithmetic, geometric,
// harmonic, weighted), dispersion, percentiles/quartiles, shape (skew/kurtosis), correlation
// (Pearson, Spearman), OLS regression + prediction, normalisation, moving averages (SMA/EMA),
// IQR outlier detection, histograms and a one-call summary.
// Convention: empty inputs return 0 / [] instead of NaN so dashboards never render "NaN".

/** One-call descriptive summary returned by {@link summarize}. */
export interface StatsSummary {
  count: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  variance: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
}

/** OLS model returned by {@link linearRegression}. */
export interface LinearModel {
  slope: number;
  intercept: number;
  /** Coefficient of determination (0–1). */
  r2: number;
}

/** One histogram bucket `[start, end)` (last bucket is inclusive of `end`). */
export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

const ascending = (a: number, b: number) => a - b;

/** Arithmetic mean. @example `statutils.mean([1, 2, 3, 4]); // 2.5` */
export function mean(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

/**
 * Weighted mean `Σ(v·w) / Σw`.
 * @throws When lengths differ.
 * @example `statutils.weightedMean([90, 80], [3, 1]); // 87.5`
 */
export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  if (values.length !== weights.length) throw new Error(`[statutils.weightedMean] ${values.length} values vs ${weights.length} weights`);
  const totalW = weights.reduce((a, b) => a + b, 0);
  return totalW === 0 ? 0 : values.reduce((acc, v, i) => acc + v * weights[i]!, 0) / totalW;
}

/** Geometric mean (growth rates). Requires positive values; returns 0 otherwise. @example `statutils.geometricMean([2, 8]); // 4` */
export function geometricMean(nums: readonly number[]): number {
  if (nums.length === 0 || nums.some((n) => n <= 0)) return 0;
  return Math.exp(nums.reduce((acc, v) => acc + Math.log(v), 0) / nums.length);
}

/** Harmonic mean (rates/speeds). Requires positive values; returns 0 otherwise. @example `statutils.harmonicMean([40, 60]); // 48` */
export function harmonicMean(nums: readonly number[]): number {
  if (nums.length === 0 || nums.some((n) => n <= 0)) return 0;
  return nums.length / nums.reduce((acc, v) => acc + 1 / v, 0);
}

/** Median (average of the two middle values for even counts). @example `statutils.median([5, 1, 3]); // 3` */
export function median(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort(ascending);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** All most-frequent values, ascending. @example `statutils.mode([1, 2, 2, 3, 3]); // [2, 3]` */
export function mode(nums: readonly number[]): number[] {
  const freq = new Map<number, number>();
  let maxCount = 0;
  for (const n of nums) {
    const c = (freq.get(n) ?? 0) + 1;
    freq.set(n, c);
    maxCount = Math.max(maxCount, c);
  }
  return [...freq].filter(([, c]) => c === maxCount).map(([n]) => n).sort(ascending);
}

/** `{ min, max }` in one pass (`{0, 0}` for empty). @example `statutils.minMax([3, -1, 9]); // { min: -1, max: 9 }` */
export function minMax(nums: readonly number[]): { min: number; max: number } {
  if (nums.length === 0) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { min, max };
}

/** Variance (sample `n-1` by default, population `n` when `sample=false`). @example `statutils.variance([2, 4, 4, 4, 5, 5, 7, 9], false); // 4` */
export function variance(nums: readonly number[], sample = true): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const sumSq = nums.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return sumSq / (nums.length - (sample ? 1 : 0));
}

/** Standard deviation. @example `statutils.stdDev([2, 4, 4, 4, 5, 5, 7, 9], false); // 2` */
export function stdDev(nums: readonly number[], sample = true): number {
  return Math.sqrt(variance(nums, sample));
}

/** Standard error of the mean. @example `statutils.sem([1, 2, 3, 4]);` */
export function sem(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return stdDev(nums, true) / Math.sqrt(nums.length);
}

/**
 * Percentile with linear interpolation (Excel `PERCENTILE.INC` / R type 7).
 * @param p - 0…100.
 * @throws When `p` is outside 0…100.
 * @example `statutils.percentile([1, 2, 3, 4, 5], 90); // 4.6`
 */
export function percentile(nums: readonly number[], p: number): number {
  if (p < 0 || p > 100) throw new Error(`[statutils.percentile] p must be within 0..100 (got ${p})`);
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort(ascending);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

/** Quartiles `[Q1, median, Q3]` using the median-of-halves (Tukey) method. @example `statutils.quartiles([1, 2, 3, 4, 5, 6, 7, 8]); // [2.5, 4.5, 6.5]` */
export function quartiles(nums: readonly number[]): [number, number, number] {
  if (nums.length === 0) return [0, 0, 0];
  const sorted = [...nums].sort(ascending);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  return [median(sorted.slice(0, mid)), median(sorted), median(upper)];
}

/** Interquartile range `Q3 − Q1`. @example `statutils.iqr([1, 2, 3, 4, 5, 6, 7, 8]); // 4` */
export function iqr(nums: readonly number[]): number {
  const [q1, , q3] = quartiles(nums);
  return q3 - q1;
}

/**
 * Values outside Tukey fences `[Q1 − k·IQR, Q3 + k·IQR]`.
 * @param k - Fence multiplier. Default `1.5` (use `3` for "extreme" outliers).
 * @example `statutils.detectOutliers([10, 12, 11, 13, 12, 11, 95]); // [95]`
 */
export function detectOutliers(nums: readonly number[], k = 1.5): number[] {
  const [q1, , q3] = quartiles(nums);
  const spread = (q3 - q1) * k;
  return nums.filter((n) => n < q1 - spread || n > q3 + spread);
}

/** Sample skewness (adjusted Fisher–Pearson). @example `statutils.skewness([1, 2, 3, 10]); // > 0 (right tail)` */
export function skewness(nums: readonly number[]): number {
  if (nums.length < 3) return 0;
  const n = nums.length;
  const m = mean(nums);
  const s = stdDev(nums, true);
  if (s === 0) return 0;
  const sumCube = nums.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sumCube;
}

/** Sample excess kurtosis (0 ≈ normal). @example `statutils.kurtosis([1, 2, 3, 4, 100]);` */
export function kurtosis(nums: readonly number[]): number {
  if (nums.length < 4) return 0;
  const n = nums.length;
  const m = mean(nums);
  const s = stdDev(nums, true);
  if (s === 0) return 0;
  const sumQuad = nums.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0);
  const factor1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const factor2 = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return factor1 * sumQuad - factor2;
}

/** Sample covariance (0 for mismatched lengths or n < 2). @example `statutils.covariance([1, 2, 3], [2, 4, 6]); // 2` */
export function covariance(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const meanX = mean(x);
  const meanY = mean(y);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += (x[i]! - meanX) * (y[i]! - meanY);
  return sum / (x.length - 1);
}

/** Pearson linear correlation, −1…1. @example `statutils.pearsonCorrelation([1, 2, 3], [2, 4, 6]); // 1` */
export function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  const sX = stdDev(x);
  const sY = stdDev(y);
  if (sX === 0 || sY === 0) return 0;
  return covariance(x, y) / (sX * sY);
}

/**
 * Fractional ranks (1-based; ties share the average rank).
 * @example `statutils.rank([10, 20, 20, 30]); // [1, 2.5, 2.5, 4]`
 */
export function rank(nums: readonly number[]): number[] {
  const order = nums.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(nums.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.v === order[start]!.v) end++;
    const avg = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k]!.i] = avg;
    start = end + 1;
  }
  return ranks;
}

/** Spearman rank correlation (monotonic, outlier-robust), −1…1. @example `statutils.spearmanCorrelation([1, 2, 3], [1, 4, 9]); // 1` */
export function spearmanCorrelation(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  return pearsonCorrelation(rank(x), rank(y));
}

/** Ordinary least squares fit `y = slope·x + intercept`. @example `statutils.linearRegression([1, 2, 3], [3, 5, 7]); // { slope: 2, intercept: 1, r2: 1 }` */
export function linearRegression(x: readonly number[], y: readonly number[]): LinearModel {
  if (x.length !== y.length || x.length < 2) return { slope: 0, intercept: 0, r2: 0 };
  const r = pearsonCorrelation(x, y);
  const sX = stdDev(x);
  const slope = sX === 0 ? 0 : r * (stdDev(y) / sX);
  return { slope, intercept: mean(y) - slope * mean(x), r2: r ** 2 };
}

/** Evaluate a fitted line at `x`. @example `statutils.predictLinear({ slope: 2, intercept: 1, r2: 1 }, 10); // 21` */
export function predictLinear(model: LinearModel, x: number): number {
  return model.slope * x + model.intercept;
}

/** Standard score of one value. @example `statutils.zScore(130, 100, 15); // 2` */
export function zScore(val: number, meanVal: number, stdDevVal: number): number {
  if (stdDevVal === 0) return 0;
  return (val - meanVal) / stdDevVal;
}

/** Standardise a whole series to mean 0 / sd 1. @example `statutils.zScores([1, 2, 3]); // [-1, 0, 1]` */
export function zScores(nums: readonly number[]): number[] {
  const m = mean(nums);
  const s = stdDev(nums);
  return nums.map((v) => zScore(v, m, s));
}

/** Min–max scale to `[0, 1]` (all zeros when constant). @example `statutils.normalize([10, 15, 20]); // [0, 0.5, 1]` */
export function normalize(nums: readonly number[]): number[] {
  const { min, max } = minMax(nums);
  return nums.map((v) => (max === min ? 0 : (v - min) / (max - min)));
}

/** Simple moving average over a sliding window (O(n)). @example `statutils.movingAverage([1, 2, 3, 4], 2); // [1.5, 2.5, 3.5]` */
export function movingAverage(nums: readonly number[], windowSize: number): number[] {
  if (windowSize <= 0 || nums.length < windowSize) return [];
  let sum = 0;
  for (let i = 0; i < windowSize; i++) sum += nums[i]!;
  const result = [sum / windowSize];
  for (let i = windowSize; i < nums.length; i++) {
    sum += nums[i]! - nums[i - windowSize]!;
    result.push(sum / windowSize);
  }
  return result;
}

/**
 * Exponential moving average (seeded with the first value).
 * @param alpha - Smoothing 0 < α ≤ 1 (higher = more reactive).
 * @throws When `alpha` is out of range.
 * @example `statutils.exponentialMovingAverage([10, 20, 30], 0.5); // [10, 15, 22.5]`
 */
export function exponentialMovingAverage(nums: readonly number[], alpha: number): number[] {
  if (!(alpha > 0 && alpha <= 1)) throw new Error(`[statutils.exponentialMovingAverage] alpha must be in (0, 1] (got ${alpha})`);
  const out: number[] = [];
  nums.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]!));
  return out;
}

/**
 * Equal-width histogram.
 * @param bins - Number of buckets (≥ 1). Default 10.
 * @example `statutils.histogram([1, 2, 2, 3, 9], 2); // [{ start: 1, end: 5, count: 4 }, { start: 5, end: 9, count: 1 }]`
 */
export function histogram(nums: readonly number[], bins = 10): HistogramBin[] {
  if (nums.length === 0 || bins < 1) return [];
  const { min, max } = minMax(nums);
  const width = (max - min) / bins || 1;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({ start: min + i * width, end: min + (i + 1) * width, count: 0 }));
  for (const n of nums) out[Math.min(bins - 1, Math.floor((n - min) / width))]!.count++;
  return out;
}

/**
 * Everything at once — ideal for logs, dashboards and benchmark reports.
 * @example `statutils.summarize([1, 2, 3, 4]).mean; // 2.5`
 */
export function summarize(nums: readonly number[]): StatsSummary {
  const [q1, med, q3] = quartiles(nums);
  const { min, max } = minMax(nums);
  return {
    count: nums.length,
    sum: nums.reduce((a, b) => a + b, 0),
    mean: mean(nums),
    median: med,
    min,
    max,
    variance: variance(nums),
    stdDev: stdDev(nums),
    q1,
    q3,
    iqr: q3 - q1,
  };
}

export const statutils = {
  mean,
  weightedMean,
  geometricMean,
  harmonicMean,
  median,
  mode,
  minMax,
  variance,
  stdDev,
  sem,
  percentile,
  quartiles,
  iqr,
  detectOutliers,
  skewness,
  kurtosis,
  covariance,
  pearsonCorrelation,
  rank,
  spearmanCorrelation,
  linearRegression,
  predictLinear,
  zScore,
  zScores,
  normalize,
  movingAverage,
  exponentialMovingAverage,
  histogram,
  summarize,
};
