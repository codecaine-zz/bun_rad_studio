#!/usr/bin/env bun
/**
 * Parallel sharded `bun test` runner (`bun run test:fast`).
 *
 * Shards independent test files across N worker subprocesses (LPT-balanced by
 * file size) while running process/port-sensitive integration suites in a
 * dedicated serial bucket so routine local verification completes ~3x faster
 * without altering `bun test`.
 */
import { readdirSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");

const SERIAL_BASENAMES = new Set([
  "launcher.test.ts",
  "file_manager_serve_php.test.ts",
  "enterprise_gui_interactive.test.ts",
  "sys_utils_gui_interactive.test.ts",
]);

export function discoverTestFiles(rootDir = ROOT): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".test.js") ||
        entry.name.endsWith(".spec.ts")
      ) {
        found.push(relative(rootDir, full).split("\\").join("/"));
      }
    }
  };
  for (const top of ["tests", "src"]) {
    try {
      walk(join(rootDir, top));
    } catch {}
  }
  return found.sort();
}

export function planTestShards(
  files: string[],
  jobs: number,
  sizeOf: (relPath: string) => number = (relPath) =>
    statSync(join(ROOT, relPath)).size,
): { shards: string[][]; serial: string[] } {
  const workerCount = Math.max(1, Math.min(8, Math.floor(jobs) || 1));
  const serial: string[] = [];
  const parallelCandidates: Array<{ file: string; bytes: number }> = [];

  for (const file of files) {
    const base = file.split("/").pop() ?? file;
    if (SERIAL_BASENAMES.has(base)) {
      serial.push(file);
    } else {
      parallelCandidates.push({ file, bytes: sizeOf(file) });
    }
  }

  // Largest-processing-time (by byte size proxy) greedy load balancing
  parallelCandidates.sort(
    (a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file),
  );
  const shards: string[][] = Array.from({ length: workerCount }, () => []);
  const weights = new Array<number>(workerCount).fill(0);

  for (const item of parallelCandidates) {
    let minIdx = 0;
    for (let i = 1; i < workerCount; i++) {
      if (weights[i]! < weights[minIdx]!) minIdx = i;
    }
    shards[minIdx]!.push(item.file);
    weights[minIdx]! += Math.max(1024, item.bytes);
  }

  return { shards: shards.filter((s) => s.length > 0), serial };
}

export function parseFastArgs(argv: string[]): {
  jobs: number;
  timeoutMs: number;
  filter: string | null;
} {
  const defaultJobs = Math.min(4, Math.max(2, cpus().length - 1));
  let jobs = Number(process.env.TEST_FAST_JOBS || defaultJobs) || defaultJobs;
  let timeoutMs = 30_000;
  let filter: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--jobs" || arg === "-j") {
      jobs = Number(argv[++i]);
    } else if (arg === "--timeout") {
      timeoutMs = Number(argv[++i]);
    } else if (arg === "--filter") {
      filter = argv[++i] ?? null;
    }
  }
  return {
    jobs: Math.max(1, Math.min(8, Math.floor(jobs))),
    timeoutMs: Math.max(1_000, Math.floor(timeoutMs)),
    filter,
  };
}

async function runShard(
  label: string,
  files: string[],
  timeoutMs: number,
): Promise<{ label: string; exitCode: number; ms: number; output: string }> {
  const t0 = performance.now();
  const proc = Bun.spawn(
    [process.execPath, "test", "--timeout", String(timeoutMs), ...files],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    label,
    exitCode,
    ms: performance.now() - t0,
    output: `${stdout}\n${stderr}`,
  };
}

async function main() {
  const opts = parseFastArgs(process.argv.slice(2));
  let files = discoverTestFiles(ROOT);
  if (opts.filter) {
    const needle = opts.filter.toLowerCase();
    files = files.filter((f) => f.toLowerCase().includes(needle));
  }
  if (files.length === 0) {
    console.error("No matching test files found.");
    process.exit(1);
  }

  const { shards, serial } = planTestShards(files, opts.jobs);
  const startedAt = performance.now();
  console.log(
    `Running ${files.length} test files across ${shards.length} parallel shard(s)` +
      (serial.length > 0 ? ` + ${serial.length} serial suite(s)` : "") +
      "...",
  );

  const shardResults = await Promise.all(
    shards.map((group, idx) =>
      runShard(`shard-${idx + 1}/${shards.length}`, group, opts.timeoutMs),
    ),
  );
  if (serial.length > 0) {
    shardResults.push(await runShard("serial", serial, opts.timeoutMs));
  }

  let failedShards = 0;
  for (const res of shardResults) {
    const sec = (res.ms / 1000).toFixed(2);
    if (res.exitCode === 0) {
      console.log(`  ✓ ${res.label} passed in ${sec}s`);
    } else {
      failedShards++;
      console.error(`  ✗ ${res.label} failed (exit ${res.exitCode}, ${sec}s):`);
      console.error(res.output.trim());
    }
  }

  const totalSec = ((performance.now() - startedAt) / 1000).toFixed(2);
  if (failedShards > 0) {
    console.error(
      `\ntest:fast failed (${failedShards}/${shardResults.length} shard(s) failed in ${totalSec}s).`,
    );
    process.exit(1);
  }
  console.log(`\nAll ${files.length} test files passed in ${totalSec}s.`);
}

if (import.meta.main) {
  await main();
}
