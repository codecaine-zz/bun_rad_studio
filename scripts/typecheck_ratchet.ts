/**
 * Type-check ratchet.
 *
 * The project has hundreds of existing TypeScript errors that Bun ignores at run time. Fixing them all at once is
 * not practical, so this records the number of errors per file and fails when a file gets MORE errors than it had,
 * or when a file with no recorded errors gets one. Fixing errors never fails; run with --update to record the gain.
 *
 *   bun run typecheck                 compare with scripts/typecheck_baseline.json
 *   bun run typecheck -- --update     rewrite the baseline (do this after fixing errors)
 *   --project <tsconfig>              check another project (used by the tests)
 *   --baseline <file>                 use another baseline file (used by the tests)
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";

export type ErrorCounts = Record<string, number>;

const ERROR_LINE = /^(.+?)\(\d+,\d+\): error TS\d+:/;

/** Counts `tsc` error lines per file, with forward-slash paths relative to `root`. */
export function countErrorsByFile(tscOutput: string, root = process.cwd()): ErrorCounts {
  const counts: ErrorCounts = {};
  for (const line of tscOutput.split("\n")) {
    const m = ERROR_LINE.exec(line);
    if (!m) continue;
    const abs = resolve(root, m[1]!);
    const file = relative(root, abs).split("\\").join("/");
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

export interface Change {
  file: string;
  before: number;
  now: number;
}

export interface Comparison {
  regressions: Change[];
  improvements: Change[];
}

export function compareCounts(baseline: ErrorCounts, current: ErrorCounts): Comparison {
  const regressions: Change[] = [];
  const improvements: Change[] = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    const before = baseline[file] ?? 0;
    const now = current[file] ?? 0;
    if (now > before) regressions.push({ file, before, now });
    else if (now < before) improvements.push({ file, before, now });
  }
  const byName = (a: Change, b: Change) => a.file.localeCompare(b.file);
  return { regressions: regressions.sort(byName), improvements: improvements.sort(byName) };
}

function total(counts: ErrorCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function readBaseline(path: string): ErrorCounts {
  if (!existsSync(path)) {
    throw new Error(`No baseline at ${path}. Create it with: bun run typecheck -- --update`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed.files !== "object") throw new Error(`${path} is not a type-check baseline.`);
  return parsed.files as ErrorCounts;
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[]): Promise<number> {
  const root = process.cwd();
  const project = argValue(args, "--project") ?? "tsconfig.json";
  const baselinePath = resolve(root, argValue(args, "--baseline") ?? join("scripts", "typecheck_baseline.json"));
  // The package's own script, run with the current runtime: `node_modules/.bin/tsc` is not a plain file on Windows.
  const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) {
    console.error("TypeScript is not installed. Run: bun install");
    return 2;
  }

  const proc = Bun.spawnSync([process.execPath, tsc, "--noEmit", "-p", project], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const current = countErrorsByFile(output, root);

  // A crash or a bad option produces no error lines, which would otherwise look like "zero errors".
  if (proc.exitCode !== 0 && total(current) === 0) {
    console.error("tsc failed without reporting type errors:\n" + output.slice(0, 2000));
    return 2;
  }

  if (args.includes("--update")) {
    const files = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(baselinePath, JSON.stringify({ total: total(current), files }, null, 2) + "\n");
    console.log(`Baseline written: ${total(current)} errors in ${Object.keys(files).length} files.`);
    return 0;
  }

  let baseline: ErrorCounts;
  try {
    baseline = readBaseline(baselinePath);
  } catch (e: any) {
    console.error(e.message);
    return 2;
  }

  const { regressions, improvements } = compareCounts(baseline, current);
  console.log(`Type errors: ${total(current)} now, ${total(baseline)} in the baseline.`);

  if (improvements.length) {
    console.log("\nFewer errors than recorded (run `bun run typecheck -- --update` to keep the gain):");
    for (const c of improvements) console.log(`  ${c.file}: ${c.before} -> ${c.now}`);
  }
  if (regressions.length) {
    console.error("\nNew type errors (the count for these files went up):");
    for (const c of regressions) console.error(`  ${c.file}: ${c.before} -> ${c.now}`);
    console.error("\nFix them, or if they are intended, run `bun run typecheck -- --update` and explain why in the commit.");
    return 1;
  }
  console.log("No new type errors.");
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
