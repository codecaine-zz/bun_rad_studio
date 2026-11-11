/**
 * Ergonomic shell command execution, piping, argument escaping, and `PATH` lookup powered by `Bun.$` and `Bun.which`.
 */
// Feature: RAD - shellutils
// Ergonomic shell execution, command piping, and PATH resolution powered by Bun.$ and Bun.which
import { $ } from "bun";

/**
 * Captured output and exit status from running a shell command via {@link execCmd}.
 */
export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * Working directory, environment variable, and timeout options for {@link execCmd} and {@link execLines}.
 */
export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

// Doer: Resolve executable path from system PATH via native Bun.which
/**
 * Resolves the absolute path to an executable in the system `PATH` via `Bun.which`, or `null` if not found.
 */
export function whichCmd(cmd: string): string | null {
  return Bun.which(cmd);
}

// Doer: Execute command string quietly and return structured plain data
/**
 * Executes a shell command string quietly without throwing on non-zero exit codes.
 */
export async function execCmd(
  command: string,
  options: ShellOptions = {},
): Promise<ShellExecResult> {
  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    const shellCmd =
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", command]
        : ["/bin/sh", "-c", command];
    const proc = Bun.spawn(shellCmd, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
    }, options.timeoutMs);
    timer.unref?.();
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (timedOut) {
        return {
          stdout,
          stderr: stderr
            ? `${stderr}\nCommand timed out after ${options.timeoutMs}ms`
            : `Command timed out after ${options.timeoutMs}ms`,
          exitCode: 124,
          success: false,
        };
      }
      return {
        stdout,
        stderr,
        exitCode: code,
        success: code === 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const runner = $`${{ raw: command }}`.quiet().nothrow();
  if (options.cwd) runner.cwd(options.cwd);
  if (options.env) runner.env({ ...process.env, ...options.env });

  const result = await runner;
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  return {
    stdout,
    stderr,
    exitCode: result.exitCode,
    success: result.exitCode === 0,
  };
}

// Coordinator: Execute command and return non-empty lines of stdout
/**
 * Executes a shell command and returns trimmed non-empty lines from `stdout`, throwing on non-zero exit status.
 */
export async function execLines(
  command: string,
  options: ShellOptions = {},
): Promise<string[]> {
  const res = await execCmd(command, options);
  if (!res.success) {
    throw new Error(
      `[shellutils.execLines] Command failed with exit code ${res.exitCode}: ${res.stderr.trim()}`,
    );
  }
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Coordinator: Pipe output of first command into second command
/**
 * Executes `cmd1 | cmd2` in the shell and returns the combined {@link ShellExecResult}.
 */
export async function pipeCmds(
  cmd1: string,
  cmd2: string,
): Promise<ShellExecResult> {
  return execCmd(`${cmd1} | ${cmd2}`);
}

// Doer: Escape argument safely for shell strings
/**
 * Safely escapes a string argument for interpolation into a shell command via `Bun.$.escape`.
 */
export function escapeArg(arg: string): string {
  return $.escape(arg);
}

/**
 * Namespace of shell command execution, piping, argument escaping, and executable lookup utilities.
 */
export const shellutils = {
  which: whichCmd,
  whichCmd,
  exec: execCmd,
  execCmd,
  execLines,
  pipeCmds,
  escapeArg,
};
