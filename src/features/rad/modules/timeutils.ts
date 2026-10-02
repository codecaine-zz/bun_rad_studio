// Doer: Human relative time description ("2 hours ago", "in 3 days")
export function timeAgo(input: Date | number | string, now = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  const diffMs = now.getTime() - d.getTime();
  const isPast = diffMs >= 0;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  if (absSec < 5) return "just now";
  if (absSec < 60) return isPast ? `${absSec} seconds ago` : `in ${absSec} seconds`;

  const absMin = Math.floor(absSec / 60);
  if (absMin < 60) return isPast ? `${absMin} minute${absMin === 1 ? "" : "s"} ago` : `in ${absMin} minute${absMin === 1 ? "" : "s"}`;

  const absHours = Math.floor(absMin / 60);
  if (absHours < 24) return isPast ? `${absHours} hour${absHours === 1 ? "" : "s"} ago` : `in ${absHours} hour${absHours === 1 ? "" : "s"}`;

  const absDays = Math.floor(absHours / 24);
  if (absDays < 30) return isPast ? `${absDays} day${absDays === 1 ? "" : "s"} ago` : `in ${absDays} day${absDays === 1 ? "" : "s"}`;

  const absMonths = Math.floor(absDays / 30);
  if (absMonths < 12) return isPast ? `${absMonths} month${absMonths === 1 ? "" : "s"} ago` : `in ${absMonths} month${absMonths === 1 ? "" : "s"}`;

  const absYears = Math.floor(absDays / 365);
  return isPast ? `${absYears} year${absYears === 1 ? "" : "s"} ago` : `in ${absYears} year${absYears === 1 ? "" : "s"}`;
}

// Doer: Format date as ISO 8601 string
export function formatIso(date = new Date()): string {
  return date.toISOString();
}

// Doer: Parse ISO 8601 string into Date
export function parseIso(isoStr: string): Date {
  const parsed = new Date(isoStr);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`[timeutils] Invalid ISO date string: ${isoStr}`);
  }
  return parsed;
}

// Doer: Return Date set to 00:00:00.000 of the given date
export function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Doer: Return Date set to 23:59:59.999 of the given date
export function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Doer: Return Date set to beginning of current month
export function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Doer: Return Date set to last millisecond of current month
export function endOfMonth(date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Doer: Add N days to date
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Doer: Calculate integer day difference between two dates
export function diffDays(d1: Date, d2: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.floor((utc2 - utc1) / msPerDay);
}

// Coordinator: Precision stopwatch for benchmarking and execution timing
export interface Stopwatch {
  start(): void;
  stop(): number;
  elapsedMs(): number;
  reset(): void;
}

export function createStopwatch(): Stopwatch {
  let startTime = performance.now();
  let stoppedTime: number | null = null;

  return {
    start() {
      startTime = performance.now();
      stoppedTime = null;
    },
    stop() {
      if (stoppedTime === null) {
        stoppedTime = performance.now();
      }
      return stoppedTime - startTime;
    },
    elapsedMs() {
      const end = stoppedTime !== null ? stoppedTime : performance.now();
      return end - startTime;
    },
    reset() {
      startTime = performance.now();
      stoppedTime = null;
    },
  };
}

export const timeutils = {
  timeAgo,
  formatIso,
  parseIso,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  diffDays,
  createStopwatch,
};
