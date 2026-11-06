/**
 * Operating system introspection, shell argument quoting, safe subprocess execution via `Bun.spawn`,
 * and cross-platform system clipboard helpers.
 */
import os from "node:os";

/**
 * Snapshot of host OS, CPU, memory, uptime, and hostname metrics returned by {@link getSystemInfo}.
 */
export interface SystemInfo {
  platform: string;
  arch: string;
  cpuCount: number;
  totalMem: number;
  freeMem: number;
  uptime: number;
  hostname: string;
}

// Doer: Get consolidated system metrics
/**
 * Collects consolidated host platform, CPU count, memory, uptime, and hostname metrics.
 */
export function getSystemInfo(): SystemInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount: os.cpus().length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    hostname: os.hostname(),
  };
}

// Doer: Escape/quote single argument for shell execution
/**
 * Safely single-quotes a command-line argument for POSIX shell execution if it contains non-alphanumeric characters.
 */
export function quoteArg(arg: string): string {
  if (/^[a-zA-Z0-9_\-\.\/]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Doer: Return home directory
/**
 * Returns the current user's home directory path.
 */
export function getHomeDir(): string {
  return os.homedir();
}

// Doer: Return OS temp directory
/**
 * Returns the operating system's default directory for temporary files.
 */
export function getTempDir(): string {
  return os.tmpdir();
}

// Coordinator: Safely execute command using Bun.spawn
/**
 * Spawns a subprocess without invoking a shell via `Bun.spawn` and resolves its trimmed `stdout`, `stderr`, and `exitCode`.
 */
export async function execSafe(
  cmd: string,
  args: string[] = [],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// Coordinator: Copy text to system clipboard (cross-platform)
/**
 * Copies `text` to the system clipboard (`pbcopy` on macOS, `xclip` on Linux), returning `true` on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy"]
      : ["xclip", "-selection", "clipboard"];
  try {
    // No output pipes: xclip leaves a background process serving the clipboard that would keep them open.
    const proc = Bun.spawn(cmd, {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.stdin.write(text);
    proc.stdin.end();
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

// Coordinator: Read text from system clipboard (cross-platform)
/**
 * Reads plain text from the system clipboard (`pbpaste` on macOS, `xclip -o` on Linux), returning `""` on failure.
 */
export async function readFromClipboard(): Promise<string> {
  const cmd =
    process.platform === "darwin"
      ? ["pbpaste"]
      : ["xclip", "-selection", "clipboard", "-o"];
  try {
    const res = await execSafe(cmd[0]!, cmd.slice(1));
    return res.exitCode === 0 ? res.stdout : "";
  } catch {
    return "";
  }
}

/**
 * Namespace bundling system info, directory lookups, safe process execution, and clipboard utilities.
 */
export const sysutils = {
  getSystemInfo,
  quoteArg,
  getHomeDir,
  getTempDir,
  execSafe,
  copyToClipboard,
  readFromClipboard,
};
