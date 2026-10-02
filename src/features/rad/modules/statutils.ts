// Doer: Calculate arithmetic mean
export function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

// Doer: Calculate median value
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// Doer: Calculate mode(s)
export function mode(nums: number[]): number[] {
  if (nums.length === 0) return [];
  const freq: Record<number, number> = {};
  let maxCount = 0;
  for (const n of nums) {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > maxCount) maxCount = freq[n];
  }
  return Object.keys(freq)
    .filter((k) => freq[Number(k)] === maxCount)
    .map(Number);
}

// Doer: Calculate variance (sample or population)
export function variance(nums: number[], sample = true): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const sumSq = nums.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
  return sumSq / (nums.length - (sample ? 1 : 0));
}

// Doer: Calculate standard deviation
export function stdDev(nums: number[], sample = true): number {
  return Math.sqrt(variance(nums, sample));
}

// Doer: Standard Error of the Mean (SEM)
export function sem(nums: number[]): number {
  if (nums.length === 0) return 0;
  return stdDev(nums, true) / Math.sqrt(nums.length);
}

// Doer: Calculate quartiles Q1, Q2 (median), Q3
export function quartiles(nums: number[]): [number, number, number] {
  if (nums.length === 0) return [0, 0, 0];
  const sorted = [...nums].sort((a, b) => a - b);
  const q2 = median(sorted);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.length % 2 === 0 ? sorted.slice(0, mid) : sorted.slice(0, mid);
  const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = median(lower);
  const q3 = median(upper);
  return [q1, q2, q3];
}

// Doer: Interquartile Range (IQR)
export function iqr(nums: number[]): number {
  const [q1, , q3] = quartiles(nums);
  return q3 - q1;
}

// Doer: Sample Skewness
export function skewness(nums: number[]): number {
  if (nums.length < 3) return 0;
  const n = nums.length;
  const m = mean(nums);
  const s = stdDev(nums, true);
  if (s === 0) return 0;
  const sumCube = nums.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0);
  return (n / ((n - 1) * (n - 2))) * sumCube;
}

// Doer: Sample Kurtosis (excess kurtosis)
export function kurtosis(nums: number[]): number {
  if (nums.length < 4) return 0;
  const n = nums.length;
  const m = mean(nums);
  const s = stdDev(nums, true);
  if (s === 0) return 0;
  const sumQuad = nums.reduce((acc, v) => acc + Math.pow((v - m) / s, 4), 0);
  const factor1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const factor2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  return factor1 * sumQuad - factor2;
}

// Doer: Covariance between two numeric arrays
export function covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const meanX = mean(x);
  const meanY = mean(y);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += (x[i]! - meanX) * (y[i]! - meanY);
  }
  return sum / (x.length - 1);
}

// Doer: Pearson correlation coefficient (-1.0 to 1.0)
export function pearsonCorrelation(x: number[], y: number[]): number {
  const cov = covariance(x, y);
  const sX = stdDev(x);
  const sY = stdDev(y);
  if (sX === 0 || sY === 0) return 0;
  return cov / (sX * sY);
}

// Coordinator: Ordinary Least Squares (OLS) Linear Regression
export function linearRegression(
  x: number[],
  y: number[]
): { slope: number; intercept: number; r2: number } {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }
  const r = pearsonCorrelation(x, y);
  const sX = stdDev(x);
  const sY = stdDev(y);
  const slope = sX === 0 ? 0 : r * (sY / sX);
  const intercept = mean(y) - slope * mean(x);
  return { slope, intercept, r2: Math.pow(r, 2) };
}

// Doer: Calculate Z-score
export function zScore(val: number, meanVal: number, stdDevVal: number): number {
  if (stdDevVal === 0) return 0;
  return (val - meanVal) / stdDevVal;
}

// Doer: Simple Moving Average (SMA)
export function movingAverage(nums: number[], windowSize: number): number[] {
  if (windowSize <= 0 || nums.length < windowSize) return [];
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < windowSize; i++) {
    sum += nums[i]!;
  }
  result.push(sum / windowSize);

  for (let i = windowSize; i < nums.length; i++) {
    sum += nums[i]! - nums[i - windowSize]!;
    result.push(sum / windowSize);
  }
  return result;
}

export const statutils = {
  mean,
  median,
  mode,
  variance,
  stdDev,
  sem,
  quartiles,
  iqr,
  skewness,
  kurtosis,
  covariance,
  pearsonCorrelation,
  linearRegression,
  zScore,
  movingAverage,
};
