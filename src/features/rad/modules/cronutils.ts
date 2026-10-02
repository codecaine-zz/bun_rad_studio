export interface CronSchedule {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

// Doer: Parse single field into integer set
function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  const parts = field.split(",");

  for (const part of parts) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      if (step > 0) {
        for (let i = min; i <= max; i += step) result.add(i);
      }
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) result.add(i);
      }
    } else {
      const val = parseInt(part, 10);
      if (!Number.isNaN(val) && val >= min && val <= max) {
        result.add(val);
      }
    }
  }

  return result;
}

// Coordinator: Parse standard 5-field cron expression
export function parseCron(expr: string): CronSchedule {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`[cronutils] Cron expression must have exactly 5 fields, got: "${expr}"`);
  }

  return {
    minutes: parseCronField(fields[0]!, 0, 59),
    hours: parseCronField(fields[1]!, 0, 23),
    daysOfMonth: parseCronField(fields[2]!, 1, 31),
    months: parseCronField(fields[3]!, 1, 12),
    daysOfWeek: parseCronField(fields[4]!, 0, 6),
  };
}

// Doer: Check if specific date matches parsed cron schedule
export function matchesCron(cron: CronSchedule, date = new Date()): boolean {
  return (
    cron.minutes.has(date.getMinutes()) &&
    cron.hours.has(date.getHours()) &&
    cron.daysOfMonth.has(date.getDate()) &&
    cron.months.has(date.getMonth() + 1) &&
    cron.daysOfWeek.has(date.getDay())
  );
}

// Coordinator: Calculate next date/time matching cron schedule
export function nextCronRun(cron: CronSchedule, fromDate = new Date()): Date {
  const d = new Date(fromDate.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  // Search ahead up to 366 days
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matchesCron(cron, d)) {
      return d;
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error("[cronutils] Next cron run not found within 1 year");
}

// Doer: Convert standard cron expression to readable English description
export function cronToHuman(expr: string): string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return expr;
  const [min, hr, dom, mon, dow] = fields;

  if (expr === "* * * * *") return "Every minute";
  if (min?.startsWith("*/") && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${min.slice(2)} minutes`;
  }
  if (min === "0" && hr === "0" && dom === "*" && mon === "*" && dow === "*") {
    return "Every day at midnight";
  }
  if (min === "0" && hr?.startsWith("*/") && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${hr.slice(2)} hours on the hour`;
  }
  if (min === "0" && hr === "0" && dom === "*" && mon === "*" && (dow === "1-5" || dow === "1,2,3,4,5")) {
    return "Every weekday at midnight";
  }
  return `At ${hr}:${min?.padStart(2, "0")}, day of month: ${dom}, month: ${mon}, day of week: ${dow}`;
}

export const cronutils = {
  parseCron,
  matchesCron,
  nextCronRun,
  cronToHuman,
};
