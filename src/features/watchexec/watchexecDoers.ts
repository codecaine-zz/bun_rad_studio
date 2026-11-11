/**
 * Path-filtering predicates, terminal control, process-tree termination, environment
 * variable builders, and subprocess spawning helpers for `watchexec`.
 */
import { extname } from "node:path";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import type { Subprocess } from "bun";

/**
 * Checks whether `filename` has an extension matching any entry in `extensions`
 * (returns `true` when `extensions` is undefined or empty).
 */
export function matchesExtension(
  filename: string,
  extensions?: string[],
): boolean {
  if (!extensions || extensions.length === 0) return true;
  const ext = extname(filename).replace(/^\./, "").toLowerCase();
  return extensions.some((e) => e.replace(/^\./, "").toLowerCase() === ext);
}

/**
 * Returns `true` if `filename` (normalized to forward slashes) matches any pattern in `ignorePatterns`.
 */
export function shouldIgnore(
  filename: string,
  ignorePatterns: string[],
): boolean {
  const normalized = filename.replace(/\\/g, "/");
  return ignorePatterns.some((pattern) => {
    return normalized.includes(pattern) || normalized.endsWith(pattern);
  });
}

/**
 * Checks whether a regex pattern contains nested quantifiers or backreferences prone to catastrophic backtracking.
 */
function isUnsafeFilterRegex(pattern: string): boolean {
  if (pattern.length > 512) return true;
  if (/\\[1-9]/.test(pattern)) return true;
  let inClass = false;
  const groupHasQuant: boolean[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      groupHasQuant.push(false);
      continue;
    }
    if (ch === ")") {
      const innerQuant = groupHasQuant.pop() ?? false;
      const next = pattern[i + 1];
      const outerQuant =
        next === "+" || next === "*" || next === "?" || next === "{";
      if (innerQuant && outerQuant) return true;
      if ((innerQuant || outerQuant) && groupHasQuant.length > 0) {
        groupHasQuant[groupHasQuant.length - 1] = true;
      }
      continue;
    }
    if ((ch === "+" || ch === "*" || ch === "{") && groupHasQuant.length > 0) {
      groupHasQuant[groupHasQuant.length - 1] = true;
    }
  }
  return false;
}

/**
 * Converts a simple glob pattern (e.g. `*.ts`, `src/**`) into an anchored `RegExp`.
 */
function globToRegExp(glob: string): RegExp {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else if ("\\.^$+()[]{}|".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
}

/**
 * Checks whether `filename` matches at least one substring, glob, or safe regex pattern in `filters`
 * (returns `true` when `filters` is undefined or empty).
 */
export function matchesFilter(filename: string, filters?: string[]): boolean {
  if (!filters || filters.length === 0) return true;
  const normalized = filename.replace(/\\/g, "/");
  return filters.some((f) => {
    if (!f) return false;
    if (normalized.includes(f) || filename.includes(f)) return true;
    // Support glob syntax such as `*.ts` or `src/**`
    if (
      f.startsWith("*.") ||
      f.includes("**") ||
      /^[?*a-zA-Z0-9_./-]+$/.test(f)
    ) {
      if (f.includes("*") || f.includes("?")) {
        try {
          const base = normalized.split("/").pop() ?? normalized;
          const re = globToRegExp(f);
          if (re.test(normalized) || (!f.includes("/") && re.test(base))) {
            return true;
          }
        } catch {
          // Ignore malformed glob
        }
      }
    }
    if (isUnsafeFilterRegex(f)) return false;
    try {
      return new RegExp(f).test(normalized);
    } catch {
      return false;
    }
  });
}

/**
 * Determines whether a filesystem event on `filename` should trigger command execution
 * after evaluating ignore patterns, allowed extensions, and positive filter patterns.
 */
export function shouldTrigger(
  filename: string,
  extensions?: string[],
  ignorePatterns: string[] = [],
  filters?: string[],
): boolean {
  if (!filename) return false;
  if (shouldIgnore(filename, ignorePatterns)) return false;
  if (!matchesExtension(filename, extensions)) return false;
  return matchesFilter(filename, filters);
}

/**
 * Clears the terminal screen using the ANSI reset escape sequence (`\x1bc`).
 */
export function clearTerminal(): void {
  process.stdout.write("\x1bc");
}

/**
 * Recursively terminates a process and all of its descendant child processes across
 * Windows (`taskkill /T /F`) and Unix (`pgrep -P` and process-group kill).
 */
export function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (!pid || pid <= 0) return;
  const platform = os.platform();

  if (platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {}
    return;
  }

  // Unix (macOS / Linux): find and terminate child processes recursively
  try {
    const res = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
    if (res.stdout) {
      const childPids = res.stdout
        .split(/\s+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      for (const childPid of childPids) {
        killProcessTree(childPid, signal);
      }
    }
  } catch {}

  // Kill the process group (negative PID)
  try {
    process.kill(-pid, signal);
  } catch {}

  // Kill the process itself
  try {
    process.kill(pid, signal);
  } catch {}
}

/**
 * Safely stops a running Bun `Subprocess` and its entire child process tree,
 * allowing a brief `SIGTERM` grace period before escalating to `SIGKILL`.
 */
export function killRunningProcess(
  proc: Subprocess | null,
  graceMs: number = 400,
): void {
  if (!proc) return;
  const pid = proc.pid;
  if (pid && pid > 0) {
    killProcessTree(pid, "SIGTERM");
    try {
      proc.kill("SIGTERM");
    } catch {}
    if (proc.exitCode === null && graceMs > 0) {
      const timer = setTimeout(() => {
        if (proc.exitCode === null) {
          killProcessTree(pid, "SIGKILL");
          try {
            proc.kill("SIGKILL");
          } catch {}
        }
      }, graceMs);
      timer.unref?.();
    } else if (graceMs <= 0 && proc.exitCode === null) {
      killProcessTree(pid, "SIGKILL");
      try {
        proc.kill("SIGKILL");
      } catch {}
    }
  } else {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
}

/**
 * Builds the `WATCHEXEC_*` environment variables describing the file change that triggered execution.
 */
export function buildWatchexecEnv(
  triggeredPath?: string,
  watchPath?: string,
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

/**
 * Wraps `command` arguments in a shell invocation (`[shell, "-c", ...]`) when `shell` is specified,
 * or returns `command` unchanged for direct execution.
 */
export function formatShellCommand(
  command: string[],
  shell?: string,
): string[] {
  if (!shell) return command;
  return [shell, "-c", command.join(" ")];
}

/**
 * Spawns `command` as a child `Subprocess` with inherited stdio and optional extra environment variables or shell wrapper.
 */
export function spawnCommand(
  command: string[],
  options?: { env?: Record<string, string>; shell?: string },
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
