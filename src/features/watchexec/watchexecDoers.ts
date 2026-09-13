import { extname } from "node:path";
import type { Subprocess } from "bun";

export function matchesExtension(
  filename: string,
  extensions?: string[]
): boolean {
  if (!extensions || extensions.length === 0) return true;
  const ext = extname(filename).replace(/^\./, "").toLowerCase();
  return extensions.some((e) => e.replace(/^\./, "").toLowerCase() === ext);
}

export function shouldIgnore(
  filename: string,
  ignorePatterns: string[]
): boolean {
  const normalized = filename.replace(/\\/g, "/");
  return ignorePatterns.some((pattern) => {
    return normalized.includes(pattern) || normalized.endsWith(pattern);
  });
}

export function matchesFilter(filename: string, filters?: string[]): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.some((f) => filename.includes(f) || new RegExp(f).test(filename));
}

export function shouldTrigger(
  filename: string,
  extensions?: string[],
  ignorePatterns: string[] = [],
  filters?: string[]
): boolean {
  if (!filename) return false;
  if (shouldIgnore(filename, ignorePatterns)) return false;
  if (!matchesExtension(filename, extensions)) return false;
  return matchesFilter(filename, filters);
}

export function clearTerminal(): void {
  process.stdout.write("\x1bc");
}

export function killRunningProcess(proc: Subprocess | null): void {
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Process already terminated
    }
  }
}

export function buildWatchexecEnv(
  triggeredPath?: string,
  watchPath?: string
): Record<string, string> {
  const env: Record<string, string> = {};
  if (triggeredPath) {
    env["WATCHEXEC_WRITTEN_PATH"] = triggeredPath;
    env["WATCHEXEC_TRIGGERED_PATH"] = triggeredPath;
  }
  if (watchPath) {
    env["WATCHEXEC_COMMON_PATH"] = watchPath;
  }
  return env;
}

export function formatShellCommand(command: string[], shell?: string): string[] {
  if (!shell) return command;
  return [shell, "-c", command.join(" ")];
}

export function spawnCommand(
  command: string[],
  options?: { env?: Record<string, string>; shell?: string }
): Subprocess {
  if (command.length === 0) {
    throw new Error("[WatchexecSpawn] No command provided to execute.");
  }
  const cmd = formatShellCommand(command, options?.shell);
  return Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: { ...process.env, ...(options?.env ?? {}) },
  });
}

