import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeClipboardSync } from "../src/localGuard";
import { writeFileSync, readFileSync, existsSync, chmodSync, unlinkSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { tmpdir, userInfo } from "os";
import type { Subprocess } from "bun";

// =================================================================================================
// 1. Types & Data Structures
// =================================================================================================

export type SubprocessInputMode = "piped" | "initial" | "custom" | "none";
export type PipelineExecutionMode = "piped" | "sequential";
export type StageStatus = "idle" | "running" | "success" | "error" | "skipped" | "aborted";
export type SudoElevationMode = "auto" | "askpass" | "macos_prompt" | "non_interactive" | "disabled";

export interface SudoPreflightStatus {
  hasSudoBinary: boolean;
  isCached: boolean;
  user: string;
  osPlatform: string;
}

export interface SubprocessStage {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  inputMode: SubprocessInputMode;
  customStdin?: string;
  enabled: boolean;
  stopOnError: boolean;
  timeoutMs: number;
  runWithSudo?: boolean;
  sudoElevationMode?: SudoElevationMode;
}

export interface StageExecutionResult {
  stageId: string;
  stageName: string;
  command: string;
  status: StageStatus;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdinUsed: string;
  error?: string;
  pid?: number;
  timestamp: string;
  isElevated?: boolean;
}

export interface PipelineExecutionReport {
  status: "idle" | "running" | "success" | "error" | "aborted";
  mode: PipelineExecutionMode;
  totalDurationMs: number;
  stagesCompleted: number;
  totalStages: number;
  stageResults: Record<string, StageExecutionResult>;
  finalStdout: string;
  errorStageId?: string;
}

export interface NamedPipeline {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  mode: PipelineExecutionMode;
  initialStdin: string;
  stages: SubprocessStage[];
}

export interface PipelinePreset {
  name: string;
  description: string;
  initialStdin: string;
  mode: PipelineExecutionMode;
  stages: SubprocessStage[];
}

// =================================================================================================
// 2. Sudo & Privilege Elevation Utilities
// =================================================================================================

/**
 * Checks if a shell command explicitly requires elevated (sudo) permissions
 */
export function isSudoRequired(command: string): boolean {
  const trimmed = command.trim();
  if (/^sudo(\s+|$)/i.test(trimmed)) return true;
  if (/\|\s*sudo(\s+|$)/i.test(trimmed)) return true;
  if (/&&\s*sudo(\s+|$)/i.test(trimmed)) return true;
  if (/;\s*sudo(\s+|$)/i.test(trimmed)) return true;
  return false;
}

/**
 * Detects potentially destructive root commands to guard against accidental destruction
 */
export function isDestructiveCommand(command: string): { isDestructive: boolean; warning?: string } {
  const norm = command.toLowerCase();
  if (norm.includes("rm -rf /") || norm.includes("rm -rf /*")) {
    return { isDestructive: true, warning: "CRITICAL: Command attempts root directory recursion deletion ('rm -rf /')!" };
  }
  if (norm.includes("mkfs") || norm.includes("> /dev/sd") || norm.includes("dd of=/dev/sd")) {
    return { isDestructive: true, warning: "CRITICAL: Command targets raw disk partitions / block devices ('mkfs' / 'dd')!" };
  }
  if (norm.includes("chmod -r 777 /") || norm.includes("chown -r /")) {
    return { isDestructive: true, warning: "WARNING: Command modifies permissions of root filesystem hierarchy!" };
  }
  return { isDestructive: false };
}

/**
 * Tests if sudo credentials are currently active (cached ticket in session)
 */
export async function checkSudoCached(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["sudo", "-n", "true"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Queries system elevation preflight diagnostics
 */
export async function checkSudoPreflight(): Promise<SudoPreflightStatus> {
  let hasSudo = false;
  try {
    const proc = Bun.spawn(["which", "sudo"], { stdout: "pipe", stderr: "ignore" });
    const code = await proc.exited;
    hasSudo = code === 0;
  } catch {
    hasSudo = false;
  }

  const isCached = hasSudo ? await checkSudoCached() : false;
  let user = "unknown";
  try {
    user = userInfo().username;
  } catch {
    user = process.env.USER || process.env.LOGNAME || "user";
  }

  return {
    hasSudoBinary: hasSudo,
    isCached,
    user,
    osPlatform: process.platform,
  };
}

/**
 * Creates a temporary, securely permissioned askpass script (mode 0700) to feed
 * the sudo password without stealing the pipeline's stdin stream.
 */
export async function withAskpass<T>(
  password: string,
  fn: (askpassPath: string, env: Record<string, string>) => Promise<T>
): Promise<T> {
  const askpassScript = join(
    tmpdir(),
    `bun_rad_askpass_${Date.now()}_${crypto.randomUUID()}.sh`
  );
  try {
    const content = `#!/bin/sh\nprintf '%s\\n' "$BUN_RAD_SUDO_PASS"\n`;
    writeFileSync(askpassScript, content, { mode: 0o700 });
    chmodSync(askpassScript, 0o700);

    const env: Record<string, string> = {
      SUDO_ASKPASS: askpassScript,
      BUN_RAD_SUDO_PASS: password,
    };

    return await fn(askpassScript, env);
  } finally {
    try {
      if (existsSync(askpassScript)) {
        unlinkSync(askpassScript);
      }
    } catch {}
  }
}

/**
 * Prepares the elevated command string and flags according to the chosen elevation mode
 */
export function prepareElevatedCommand(
  rawCommand: string,
  options: {
    runWithSudo?: boolean;
    elevationMode?: SudoElevationMode;
    askpassScriptPath?: string;
  } = {}
): { command: string; isElevated: boolean } {
  const needsSudo = options.runWithSudo || isSudoRequired(rawCommand);
  if (!needsSudo) {
    return { command: rawCommand, isElevated: false };
  }

  const mode = options.elevationMode || "auto";

  let innerCmd = rawCommand.trim();
  if (innerCmd.startsWith("sudo ")) {
    innerCmd = innerCmd.slice(5).trim();
  }

  if (mode === "macos_prompt" && process.platform === "darwin") {
    const escaped = innerCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "'\\''");
    return {
      command: `osascript -e 'do shell script "${escaped}" with administrator privileges'`,
      isElevated: true,
    };
  }

  const singleQuoted = `'${innerCmd.replace(/'/g, "'\\''")}'`;
  if (options.askpassScriptPath) {
    return {
      command: `sudo -A sh -c ${singleQuoted}`,
      isElevated: true,
    };
  }

  return {
    command: `sudo -n sh -c ${singleQuoted}`,
    isElevated: true,
  };
}

// =================================================================================================
// 3. Default Presets & Pipeline Library
// =================================================================================================

export function getDefaultPipelinePresets(): Record<string, PipelinePreset> {
  return {
    "Process Filter & Telemetry": {
      name: "Process Filter & Telemetry",
      description: "Lists active processes, filters by keyword, formats fields, and displays top matches",
      initialStdin: "",
      mode: "piped",
      stages: [
        {
          id: "proc_1",
          name: "List All Processes",
          command: "ps aux",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 10000,
        },
        {
          id: "proc_2",
          name: "Exclude Grep Worker",
          command: "grep -v 'grep'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "proc_3",
          name: "Filter Developer Runtimes",
          command: "grep -i -E 'bun|node|code|bash|zsh|sh|ps|apple'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "proc_4",
          name: "Extract Key Columns",
          command: "awk '{print \"PID: \" $2 \"\\tCPU: \" $3 \"%\\tMEM: \" $4 \"%\\tCMD: \" $11}'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "proc_5",
          name: "Top 15 Results",
          command: "head -n 15",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },

    "JSON Stream Filter & Sort": {
      name: "JSON Stream Filter & Sort",
      description: "Pipes JSON data into jq, extracts healthy services, capitalizes text, and sorts alphabetically",
      initialStdin: JSON.stringify(
        {
          cluster: "production-east",
          services: [
            { name: "auth-service", port: 8080, status: "healthy", memory: "128MB" },
            { name: "cache-redis", port: 6379, status: "healthy", memory: "512MB" },
            { name: "payment-gateway", port: 9000, status: "degraded", memory: "256MB" },
            { name: "database-sqlite", port: 5432, status: "healthy", memory: "64MB" },
            { name: "worker-queue", port: 8085, status: "healthy", memory: "192MB" },
          ],
        },
        null,
        2
      ),
      mode: "piped",
      stages: [
        {
          id: "json_1",
          name: "Extract Healthy Services",
          command: "jq -r '.services[] | select(.status==\"healthy\") | \"\\(.name) [port \\(.port)] - \\(.memory)\"'",
          inputMode: "initial",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "json_2",
          name: "Uppercase Formatting",
          command: "tr 'a-z' 'A-Z'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "json_3",
          name: "Alphabetical Sort",
          command: "sort",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },

    "Word Frequency & Text Analytics": {
      name: "Word Frequency & Text Analytics",
      description: "Tokenizes sentence input, normalizes words, sorts, computes frequency counts, and ranks descending",
      initialStdin:
        "Bun is fast. Antigravity Bun RAD Studio makes building native desktop and terminal tools ultra fast. Subprocess pipe pro connects subprocess streams seamlessly. Bun speed and Antigravity agility.",
      mode: "piped",
      stages: [
        {
          id: "word_1",
          name: "Tokenize Words to Lines",
          command: "tr ' ' '\\n'",
          inputMode: "initial",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_2",
          name: "Strip Punctuation",
          command: "tr -d '.,!?:;\"()'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_3",
          name: "Lowercase Words",
          command: "tr 'A-Z' 'a-z'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_4",
          name: "Exclude Empty Lines",
          command: "grep -v '^$'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_5",
          name: "Sort Words",
          command: "sort",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_6",
          name: "Count Frequencies",
          command: "uniq -c",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "word_7",
          name: "Rank Descending",
          command: "sort -rn",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },

    "System Kernel & Diagnostic Telemetry (Root/Admin)": {
      name: "System Kernel & Diagnostic Telemetry (Root/Admin)",
      description: "Queries system kernel diagnostics and memory telemetry (supports sudo elevation when available)",
      initialStdin: "",
      mode: "piped",
      stages: [
        {
          id: "sys_1",
          name: "System Diagnostic Telemetry",
          command: process.platform === "darwin" ? "sysctl vm.swapusage" : "dmesg",
          inputMode: "none",
          enabled: true,
          stopOnError: false,
          timeoutMs: 8000,
          runWithSudo: false,
        },
        {
          id: "sys_2",
          name: "Format Output Lines",
          command: "cat -n",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },

    "Network Sockets & Port Auditor": {
      name: "Network Sockets & Port Auditor",
      description: "Inspects open network sockets, filters active/listening ports, formats output, and limits lines",
      initialStdin: "",
      mode: "piped",
      stages: [
        {
          id: "net_1",
          name: "Inspect Network Sockets",
          command: "netstat -an",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 8000,
        },
        {
          id: "net_2",
          name: "Filter Listening & Established",
          command: "grep -E 'LISTEN|ESTABLISHED'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "net_3",
          name: "Format Protocol & Addresses",
          command: "awk '{print $1 \"\\t\" $4 \"\\t➔\\t\" $5 \"\\t[\" $6 \"]\"}'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "net_4",
          name: "Top 20 Sockets",
          command: "head -n 20",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },

    "Git Commit Velocity & Audit": {
      name: "Git Commit Velocity & Audit",
      description: "Fetches recent Git commits, filters by category tag, sorts, and numbers entries",
      initialStdin: "",
      mode: "piped",
      stages: [
        {
          id: "git_1",
          name: "Fetch Recent 25 Commits",
          command: 'git log -n 25 --pretty=format:"%h | %ad | %s" --date=short',
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "git_2",
          name: "Filter Semantic Commit Messages",
          command: "grep -i -E 'feat|fix|chore|docs|refactor|studio'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "git_3",
          name: "Number Formatted Log Entries",
          command: "cat -n",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ],
    },
  };
}

/**
 * Pipeline Library Manager that allows naming, saving, retrieving, and persisting
 * multiple pipeline configurations to disk.
 */
export class PipelineLibrary {
  private pipelines: Map<string, NamedPipeline> = new Map();
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || resolve(process.cwd(), "dist", "saved_pipelines.json");
    this.initDefaultPresets();
    this.loadFromDisk();
  }

  public initDefaultPresets(): void {
    const presets = getDefaultPipelinePresets();
    for (const [key, p] of Object.entries(presets)) {
      const id = `preset_${key.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      this.pipelines.set(p.name, {
        id,
        name: p.name,
        description: p.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: p.mode,
        initialStdin: p.initialStdin,
        stages: JSON.parse(JSON.stringify(p.stages)),
      });
    }
  }

  public savePipeline(pipeline: NamedPipeline, persist = true): void {
    const key = pipeline.name.trim();
    if (!key) return;
    pipeline.updatedAt = new Date().toISOString();
    this.pipelines.set(key, pipeline);
    if (persist) {
      this.saveToDisk();
    }
  }

  public getPipeline(name: string): NamedPipeline | undefined {
    return this.pipelines.get(name.trim());
  }

  public hasPipeline(name: string): boolean {
    return this.pipelines.has(name.trim());
  }

  public listPipelines(): NamedPipeline[] {
    return Array.from(this.pipelines.values());
  }

  public listNames(): string[] {
    return Array.from(this.pipelines.keys());
  }

  public deletePipeline(name: string): boolean {
    const key = name.trim();
    const deleted = this.pipelines.delete(key);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  public clonePipeline(sourceName: string, targetName: string): NamedPipeline | null {
    const source = this.getPipeline(sourceName);
    if (!source) return null;

    const copy: NamedPipeline = {
      id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: targetName.trim(),
      description: `Copy of ${source.name}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode: source.mode,
      initialStdin: source.initialStdin,
      stages: JSON.parse(JSON.stringify(source.stages)),
    };

    this.savePipeline(copy);
    return copy;
  }

  public exportJson(): string {
    return JSON.stringify(this.listPipelines(), null, 2);
  }

  public importJson(jsonStr: string): number {
    try {
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data)) return 0;
      let count = 0;
      for (const p of data) {
        if (p && typeof p.name === "string" && Array.isArray(p.stages)) {
          this.savePipeline(p, false);
          count++;
        }
      }
      this.saveToDisk();
      return count;
    } catch {
      return 0;
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (existsSync(this.storagePath)) {
        const raw = readFileSync(this.storagePath, "utf-8");
        const list: NamedPipeline[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const p of list) {
            if (p && p.name) {
              this.pipelines.set(p.name.trim(), p);
            }
          }
          return true;
        }
      }
    } catch {}
    return false;
  }

  public saveToDisk(): boolean {
    try {
      const parent = resolve(this.storagePath, "..");
      if (!existsSync(parent)) {
        mkdirSync(parent, { recursive: true });
      }
      const data = JSON.stringify(this.listPipelines(), null, 2);
      writeFileSync(this.storagePath, data, "utf-8");
      return true;
    } catch {
      return false;
    }
  }
}

// =================================================================================================
// 4. Subprocess Execution Engine
// =================================================================================================

export async function executePipelineStage(
  stage: SubprocessStage,
  inputStdin: string,
  options: {
    timeoutMs?: number;
    abortSignal?: AbortSignal;
    onSpawn?: (pid: number) => void;
    elevationMode?: SudoElevationMode;
    askpassScriptPath?: string;
    sudoPassword?: string;
    extraEnv?: Record<string, string>;
  } = {}
): Promise<StageExecutionResult> {
  const t0 = performance.now();
  const timestamp = new Date().toISOString();

  // If a sudo password was passed directly and this stage needs sudo without an askpass wrapper, wrap it
  if (options.sudoPassword && !options.askpassScriptPath && (stage.runWithSudo || isSudoRequired(stage.command))) {
    return withAskpass(options.sudoPassword, (askpassPath, extraEnv) =>
      executePipelineStage(stage, inputStdin, {
        ...options,
        sudoPassword: undefined,
        askpassScriptPath: askpassPath,
        extraEnv: { ...(options.extraEnv || {}), ...extraEnv },
      })
    );
  }

  let effectiveStdin = "";
  if (stage.inputMode === "none") {
    effectiveStdin = "";
  } else if (stage.inputMode === "custom") {
    effectiveStdin = stage.customStdin ?? "";
  } else {
    effectiveStdin = inputStdin;
  }

  const safety = isDestructiveCommand(stage.command);
  if (safety.isDestructive) {
    return {
      stageId: stage.id,
      stageName: stage.name,
      command: stage.command,
      status: "error",
      exitCode: 126,
      durationMs: 0,
      stdout: "",
      stderr: `[Security Guard Blocked Execution]: ${safety.warning}\nModify the command to a non-destructive target.`,
      stdinUsed: effectiveStdin,
      error: "Blocked by Security Guard",
      timestamp,
    };
  }

  const elevated = prepareElevatedCommand(stage.command, {
    runWithSudo: stage.runWithSudo,
    elevationMode: options.elevationMode || stage.sudoElevationMode || "auto",
    askpassScriptPath: options.askpassScriptPath,
  });

  const timeout = options.timeoutMs ?? stage.timeoutMs ?? 10000;
  const cwd = stage.cwd && stage.cwd.trim() !== "" ? resolve(stage.cwd.trim()) : process.cwd();

  const env = {
    ...process.env,
    SUBPROCESS_PIPE_STAGE: stage.id,
    ...(options.extraEnv || {}),
  };

  try {
    let proc: Subprocess;
    if (effectiveStdin.length > 0) {
      proc = Bun.spawn(["sh", "-c", elevated.command], {
        cwd,
        stdin: Buffer.from(effectiveStdin),
        stdout: "pipe",
        stderr: "pipe",
        env,
      });
    } else {
      proc = Bun.spawn(["sh", "-c", elevated.command], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env,
      });
    }

    if (options.onSpawn && typeof proc.pid === "number") {
      options.onSpawn(proc.pid);
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let didTimeout = false;

    if (timeout > 0) {
      timeoutTimer = setTimeout(() => {
        didTimeout = true;
        try {
          proc.kill(9);
        } catch {}
      }, timeout);
    }

    const abortHandler = () => {
      try {
        proc.kill(9);
      } catch {}
    };

    if (options.abortSignal) {
      if (options.abortSignal.aborted) {
        abortHandler();
      } else {
        options.abortSignal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      proc.stdout ? new Response(proc.stdout as any).text() : Promise.resolve(""),
      proc.stderr ? new Response(proc.stderr as any).text() : Promise.resolve(""),
      proc.exited,
    ]);

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }

    const durationMs = Math.round(performance.now() - t0);

    if (didTimeout) {
      return {
        stageId: stage.id,
        stageName: stage.name,
        command: elevated.command,
        status: "error",
        exitCode: 124,
        durationMs,
        stdout,
        stderr:
          (stderr ? stderr + "\n" : "") +
          `[TimeoutError]: Process exceeded ${timeout}ms deadline and was terminated.`,
        stdinUsed: effectiveStdin,
        error: `Timed out after ${timeout}ms`,
        pid: proc.pid,
        timestamp,
        isElevated: elevated.isElevated,
      };
    }

    if (options.abortSignal?.aborted) {
      return {
        stageId: stage.id,
        stageName: stage.name,
        command: elevated.command,
        status: "aborted",
        exitCode: 130,
        durationMs,
        stdout,
        stderr: (stderr ? stderr + "\n" : "") + "[Abort]: Process was cancelled by user.",
        stdinUsed: effectiveStdin,
        error: "Cancelled by user",
        pid: proc.pid,
        timestamp,
        isElevated: elevated.isElevated,
      };
    }

    if (exitCode !== 0 && (stderr.includes("a password is required") || stderr.includes("a terminal is required"))) {
      return {
        stageId: stage.id,
        stageName: stage.name,
        command: elevated.command,
        status: "error",
        exitCode,
        durationMs,
        stdout,
        stderr:
          stderr +
          "\n[Sudo Error]: Sudo credentials required. Provide a session password in Sudo Manager, authenticate via 'sudo -v', or choose macOS Prompt elevation mode.",
        stdinUsed: effectiveStdin,
        pid: proc.pid,
        timestamp,
        error: "Sudo authentication required",
        isElevated: elevated.isElevated,
      };
    }

    const isSuccess = exitCode === 0;

    return {
      stageId: stage.id,
      stageName: stage.name,
      command: elevated.command,
      status: isSuccess ? "success" : "error",
      exitCode,
      durationMs,
      stdout,
      stderr,
      stdinUsed: effectiveStdin,
      pid: proc.pid,
      timestamp,
      error: isSuccess ? undefined : `Process exited with code ${exitCode}`,
      isElevated: elevated.isElevated,
    };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);
    return {
      stageId: stage.id,
      stageName: stage.name,
      command: elevated.command,
      status: "error",
      exitCode: 1,
      durationMs,
      stdout: "",
      stderr: String(err?.message || err),
      stdinUsed: effectiveStdin,
      error: String(err?.message || err),
      timestamp,
      isElevated: elevated.isElevated,
    };
  }
}

export async function executePipeline(
  stages: SubprocessStage[],
  initialStdinOrOptions:
    | string
    | ({
        mode?: PipelineExecutionMode;
        initialStdin?: string;
        abortSignal?: AbortSignal;
        elevationMode?: SudoElevationMode;
        sudoPassword?: string;
        onStageStart?: (stage: SubprocessStage, index: number) => void;
        onStageFinish?: (stage: SubprocessStage, result: StageExecutionResult, index: number) => void;
      } & Record<string, any>) = "",
  options: {
    mode?: PipelineExecutionMode;
    abortSignal?: AbortSignal;
    elevationMode?: SudoElevationMode;
    sudoPassword?: string;
    onStageStart?: (stage: SubprocessStage, index: number) => void;
    onStageFinish?: (stage: SubprocessStage, result: StageExecutionResult, index: number) => void;
  } = {}
): Promise<PipelineExecutionReport> {
  const t0 = performance.now();
  let resolvedStdin = "";
  let resolvedOptions = options;

  if (typeof initialStdinOrOptions === "object" && initialStdinOrOptions !== null) {
    resolvedOptions = { ...initialStdinOrOptions, ...options };
    resolvedStdin = typeof initialStdinOrOptions.initialStdin === "string" ? initialStdinOrOptions.initialStdin : "";
  } else {
    resolvedStdin = typeof initialStdinOrOptions === "string" ? initialStdinOrOptions : "";
  }

  const mode = resolvedOptions.mode ?? "piped";
  const stageResults: Record<string, StageExecutionResult> = {};

  const enabledStages = stages.filter((s) => s.enabled);
  let currentStdin = resolvedStdin;
  let errorStageId: string | undefined;
  let pipelineStatus: PipelineExecutionReport["status"] = "success";
  let stagesCompleted = 0;

  const runStagesLoop = async (askpassPath?: string, extraEnv?: Record<string, string>) => {
    for (let i = 0; i < enabledStages.length; i++) {
      const stage = enabledStages[i]!;

      if (options.abortSignal?.aborted) {
        pipelineStatus = "aborted";
        stageResults[stage.id] = {
          stageId: stage.id,
          stageName: stage.name,
          command: stage.command,
          status: "skipped",
          exitCode: null,
          durationMs: 0,
          stdout: "",
          stderr: "[Skipped]: Pipeline aborted before this stage.",
          stdinUsed: "",
          timestamp: new Date().toISOString(),
        };
        continue;
      }

      if (options.onStageStart) {
        options.onStageStart(stage, i);
      }

      const stageInput = mode === "piped" ? (i === 0 ? resolvedStdin : currentStdin) : resolvedStdin;

      const result = await executePipelineStage(stage, stageInput, {
        abortSignal: options.abortSignal,
        elevationMode: options.elevationMode || stage.sudoElevationMode || "auto",
        askpassScriptPath: askpassPath,
        extraEnv,
      });

      stageResults[stage.id] = result;
      stagesCompleted++;

      if (options.onStageFinish) {
        options.onStageFinish(stage, result, i);
      }

      if (result.status === "error") {
        errorStageId = stage.id;
        pipelineStatus = "error";
        if (stage.stopOnError) {
          for (let j = i + 1; j < enabledStages.length; j++) {
            const remStage = enabledStages[j]!;
            stageResults[remStage.id] = {
              stageId: remStage.id,
              stageName: remStage.name,
              command: remStage.command,
              status: "skipped",
              exitCode: null,
              durationMs: 0,
              stdout: "",
              stderr: `[Skipped]: Pipeline aborted due to failure in stage "${stage.name}" (exit code ${result.exitCode}).`,
              stdinUsed: "",
              timestamp: new Date().toISOString(),
            };
          }
          break;
        }
      } else if (result.status === "aborted") {
        pipelineStatus = "aborted";
        break;
      }

      currentStdin = result.stdout;
    }
  };

  const anyNeedsSudo = enabledStages.some((s) => s.runWithSudo || isSudoRequired(s.command));
  if (anyNeedsSudo && options.sudoPassword && options.sudoPassword.length > 0) {
    await withAskpass(options.sudoPassword, (askpassPath, extraEnv) => runStagesLoop(askpassPath, extraEnv));
  } else {
    await runStagesLoop();
  }

  const totalDurationMs = Math.round(performance.now() - t0);

  return {
    status: pipelineStatus,
    mode,
    totalDurationMs,
    stagesCompleted,
    totalStages: enabledStages.length,
    stageResults,
    finalStdout: currentStdin,
    errorStageId,
  };
}

// =================================================================================================
// 5. Pipeline Code & Shell Generators
// =================================================================================================

export function generatePipelineShellCommand(
  stages: SubprocessStage[],
  options: { initialStdin?: string; mode?: PipelineExecutionMode } = {}
): string {
  const enabledStages = stages.filter((s) => s.enabled && s.command.trim().length > 0);
  if (enabledStages.length === 0) return "# No active stages configured";

  const mode = options.mode ?? "piped";

  if (mode === "piped") {
    const parts: string[] = [];
    if (options.initialStdin && options.initialStdin.trim().length > 0) {
      const escaped = options.initialStdin.replace(/'/g, "'\\''");
      parts.push(`printf '%s' '${escaped}'`);
    }
    for (const st of enabledStages) {
      const cmd = st.runWithSudo && !st.command.startsWith("sudo ") ? `sudo ${st.command.trim()}` : st.command.trim();
      parts.push(cmd);
    }
    return parts.join(" \\\n  | ");
  } else {
    return enabledStages
      .map((s) => (s.runWithSudo && !s.command.startsWith("sudo ") ? `sudo ${s.command.trim()}` : s.command.trim()))
      .join(" && \\\n");
  }
}

export function generateShellScript(
  stages: SubprocessStage[],
  options: {
    name?: string;
    initialStdin?: string;
    mode?: PipelineExecutionMode;
  } = {}
): string {
  const name = options.name || "Subprocess Pipeline";
  const mode = options.mode || "piped";
  const oneLiner = generatePipelineShellCommand(stages, options);
  const hasSudo = stages.some((s) => s.runWithSudo || isSudoRequired(s.command));

  return `#!/usr/bin/env bash
# ==============================================================================
# ${name}
# Generated by Subprocess Pipe Pro (Bun RAD Studio Shell Process Master)
# Mode: ${mode.toUpperCase()}
# Generated at: ${new Date().toISOString()}
# Privileges: ${hasSudo ? "ELEVATED (sudo required for one or more stages)" : "Standard User"}
# ==============================================================================

set -euo pipefail

echo "================================================================================"
echo "⚡ Starting Pipeline: ${name}"
echo "Mode: ${mode}"
echo "================================================================================"

${hasSudo ? '# Ensure sudo credentials are cached before beginning\nif [ "$EUID" -ne 0 ]; then\n  echo "🔑 Pre-authenticating sudo credentials..."\n  sudo -v\nfi\n' : ""}${oneLiner}

echo ""
echo "================================================================================"
echo "✅ Pipeline completed successfully!"
echo "================================================================================"
`;
}

// =================================================================================================
// 6. Stateful Pipeline Controller (for Step-by-Step and Master GUI)
// =================================================================================================

export class SubprocessPipelineController {
  private pipelineName: string = "Custom Pipeline";
  private stages: SubprocessStage[] = [];
  private results: Record<string, StageExecutionResult> = {};
  private currentStepIndex: number = 0;
  private initialStdin: string = "";
  private mode: PipelineExecutionMode = "piped";
  private elevationMode: SudoElevationMode = "auto";
  private sudoPassword: string = "";
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;

  constructor(initialStages?: SubprocessStage[], initialStdin = "", name = "Custom Pipeline") {
    this.pipelineName = name;
    if (initialStages && initialStages.length > 0) {
      this.stages = JSON.parse(JSON.stringify(initialStages));
    } else {
      const presets = getDefaultPipelinePresets();
      const def = presets["Process Filter & Telemetry"];
      this.stages = def ? JSON.parse(JSON.stringify(def.stages)) : [];
      this.initialStdin = def?.initialStdin ?? "";
      this.pipelineName = def?.name ?? "Custom Pipeline";
    }
    this.initialStdin = initialStdin;
  }

  public getPipelineName(): string {
    return this.pipelineName;
  }

  public setPipelineName(name: string): void {
    this.pipelineName = name.trim() || "Custom Pipeline";
  }

  public getStages(): SubprocessStage[] {
    return this.stages;
  }

  public setStages(stages: SubprocessStage[]): void {
    this.stages = JSON.parse(JSON.stringify(stages));
    this.resetState();
  }

  public getResults(): Record<string, StageExecutionResult> {
    return this.results;
  }

  public getInitialStdin(): string {
    return this.initialStdin;
  }

  public setInitialStdin(val: string): void {
    this.initialStdin = val;
  }

  public getMode(): PipelineExecutionMode {
    return this.mode;
  }

  public setMode(mode: PipelineExecutionMode): void {
    this.mode = mode;
  }

  public getElevationMode(): SudoElevationMode {
    return this.elevationMode;
  }

  public setElevationMode(mode: SudoElevationMode): void {
    this.elevationMode = mode;
  }

  public getSudoPassword(): string {
    return this.sudoPassword;
  }

  public setSudoPassword(password: string): void {
    this.sudoPassword = password;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public isPipelineRunning(): boolean {
    return this.isRunning;
  }

  public resetState(): void {
    this.currentStepIndex = 0;
    this.results = {};
    this.isRunning = false;
  }

  public addStage(stage?: Partial<SubprocessStage>): SubprocessStage {
    const nextNum = this.stages.length + 1;
    const newStage: SubprocessStage = {
      id: `stage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: stage?.name || `Stage ${nextNum}`,
      command: stage?.command || "cat",
      inputMode: stage?.inputMode || "piped",
      enabled: stage?.enabled ?? true,
      stopOnError: stage?.stopOnError ?? true,
      timeoutMs: stage?.timeoutMs ?? 5000,
      customStdin: stage?.customStdin,
      cwd: stage?.cwd,
      runWithSudo: stage?.runWithSudo ?? false,
    };
    this.stages.push(newStage);
    return newStage;
  }

  public removeStage(index: number): boolean {
    if (index >= 0 && index < this.stages.length) {
      this.stages.splice(index, 1);
      this.resetState();
      return true;
    }
    return false;
  }

  public moveStage(index: number, direction: "up" | "down"): boolean {
    if (direction === "up" && index > 0) {
      const temp = this.stages[index]!;
      this.stages[index] = this.stages[index - 1]!;
      this.stages[index - 1] = temp;
      this.resetState();
      return true;
    }
    if (direction === "down" && index < this.stages.length - 1) {
      const temp = this.stages[index]!;
      this.stages[index] = this.stages[index + 1]!;
      this.stages[index + 1] = temp;
      this.resetState();
      return true;
    }
    return false;
  }

  public updateStage(index: number, updates: Partial<SubprocessStage>): SubprocessStage | null {
    const current = this.stages[index];
    if (!current) return null;
    Object.assign(current, updates);
    return current;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  public async stepNext(): Promise<{ stage: SubprocessStage; result: StageExecutionResult } | null> {
    const enabledStages = this.stages.filter((s) => s.enabled);
    if (this.currentStepIndex >= enabledStages.length) {
      return null;
    }

    const stage = enabledStages[this.currentStepIndex]!;
    this.isRunning = true;
    this.abortController = new AbortController();

    let stageInput = this.initialStdin;
    if (this.mode === "piped" && this.currentStepIndex > 0) {
      const prevStage = enabledStages[this.currentStepIndex - 1]!;
      const prevResult = this.results[prevStage.id];
      if (prevResult) {
        stageInput = prevResult.stdout;
      }
    }

    const executeOne = async (askpassPath?: string, extraEnv?: Record<string, string>) => {
      return await executePipelineStage(stage, stageInput, {
        abortSignal: this.abortController?.signal,
        elevationMode: this.elevationMode,
        askpassScriptPath: askpassPath,
        extraEnv,
      });
    };

    let result: StageExecutionResult;
    const needsSudo = stage.runWithSudo || isSudoRequired(stage.command);
    if (needsSudo && this.sudoPassword) {
      result = await withAskpass(this.sudoPassword, (askpassPath, extraEnv) => executeOne(askpassPath, extraEnv));
    } else {
      result = await executeOne();
    }

    this.results[stage.id] = result;
    this.currentStepIndex++;
    this.isRunning = false;

    return { stage, result };
  }

  public async testSingleStage(stageId: string, customInput?: string): Promise<StageExecutionResult | null> {
    const stage = this.stages.find((s) => s.id === stageId);
    if (!stage) return null;

    const inputToUse = customInput !== undefined ? customInput : this.initialStdin;

    const executeOne = async (askpassPath?: string, extraEnv?: Record<string, string>) => {
      return await executePipelineStage(stage, inputToUse, {
        elevationMode: this.elevationMode,
        askpassScriptPath: askpassPath,
        extraEnv,
      });
    };

    let result: StageExecutionResult;
    const needsSudo = stage.runWithSudo || isSudoRequired(stage.command);
    if (needsSudo && this.sudoPassword) {
      result = await withAskpass(this.sudoPassword, (askpassPath, extraEnv) => executeOne(askpassPath, extraEnv));
    } else {
      result = await executeOne();
    }

    this.results[stage.id] = result;
    return result;
  }

  public async runAll(
    onStageStart?: (stage: SubprocessStage, idx: number) => void,
    onStageFinish?: (stage: SubprocessStage, result: StageExecutionResult, idx: number) => void
  ): Promise<PipelineExecutionReport> {
    this.resetState();
    this.isRunning = true;
    this.abortController = new AbortController();

    const report = await executePipeline(this.stages, this.initialStdin, {
      mode: this.mode,
      elevationMode: this.elevationMode,
      sudoPassword: this.sudoPassword,
      abortSignal: this.abortController.signal,
      onStageStart,
      onStageFinish: (stage, result, idx) => {
        this.results[stage.id] = result;
        this.currentStepIndex = idx + 1;
        if (onStageFinish) onStageFinish(stage, result, idx);
      },
    });

    this.isRunning = false;
    return report;
  }
}

// =================================================================================================
// 7. Interactive SimpleGUI Application
// =================================================================================================

export function createSubprocessPipeStudio(
  options: { fullscreen?: boolean; theme?: string } = {}
): SimpleWindow {
  const win = newSimpleWindow(
    "Subprocess Pipe Pro -- Shell Process Master & Multi-Stage Stream Pipeline",
    1280,
    1020,
    {
      appId: "subprocess_pipe_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  const library = new PipelineLibrary();
  const defaultPipeline = library.listPipelines()[0] || {
    id: "default_pipeline",
    name: "Process Filter & Telemetry",
    mode: "piped",
    initialStdin: "",
    stages: getDefaultPipelinePresets()["Process Filter & Telemetry"]!.stages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const controller = new SubprocessPipelineController(
    defaultPipeline.stages,
    defaultPipeline.initialStdin,
    defaultPipeline.name
  );

  let selectedStageIndex = 0;
  let inspectorViewMode: "stdout" | "stderr" | "stdin" | "preview" | "script" | "final" | "sections" = "final";

  function buildTableRows(): string[][] {
    const stages = controller.getStages();
    const results = controller.getResults();

    return stages.map((st, idx) => {
      const res = results[st.id];
      const isSelected = idx === selectedStageIndex ? "👉 " : "";
      const sudoBadge = st.runWithSudo || isSudoRequired(st.command) ? " 🛡️" : "";
      const orderLabel = `${isSelected}#${idx + 1}${sudoBadge}`;
      const statusIcon = !st.enabled
        ? "⚪ Disabled"
        : !res
        ? "⏳ Pending"
        : res.status === "success"
        ? "✅ Success"
        : res.status === "error"
        ? `❌ Err (${res.exitCode ?? 1})`
        : res.status === "running"
        ? "⚡ Running"
        : res.status === "aborted"
        ? "⏹ Aborted"
        : "⏭ Skipped";

      const timeLabel = res ? `${res.durationMs}ms` : "-";
      const outBytes = res ? `${res.stdout.length} B` : "-";
      const exitLabel = res && res.exitCode !== null ? String(res.exitCode) : "-";

      return [
        orderLabel,
        st.name,
        st.command.length > 36 ? st.command.slice(0, 33) + "..." : st.command,
        st.inputMode,
        statusIcon,
        exitLabel,
        timeLabel,
        outBytes,
      ];
    });
  }

  function updateTable(): void {
    const headers = [
      "Order",
      "Stage Name",
      "Shell Command",
      "Input Mode",
      "Status",
      "Exit",
      "Duration",
      "Output Size",
    ];
    win.setTableData("tbl_stages", headers, buildTableRows());
  }

  function syncStageEditor(): void {
    const stages = controller.getStages();
    const st = stages[selectedStageIndex];
    if (!st) return;

    win.setText("lbl_current_stage_order", `Editing Stage #${selectedStageIndex + 1} of ${stages.length}`);
    win.setValue("txt_stage_name", st.name);
    win.setValue("txt_stage_cmd", st.command);
    win.setValue("txt_stage_cwd", st.cwd || "");
    win.setValue("dd_stage_input", st.inputMode);
    win.setValue("chk_stage_stop_on_err", st.stopOnError);
    win.setValue("chk_stage_enabled", st.enabled);
    win.setValue("chk_stage_sudo", Boolean(st.runWithSudo || isSudoRequired(st.command)));
    win.setValue("txt_stage_custom_stdin", st.customStdin || "");
  }

  function renderInspector(): void {
    const stages = controller.getStages();
    const results = controller.getResults();
    const st = stages[selectedStageIndex];

    if (inspectorViewMode === "script") {
      const script = generateShellScript(stages, {
        name: controller.getPipelineName(),
        initialStdin: controller.getInitialStdin(),
        mode: controller.getMode(),
      });
      win.setText("txt_inspector_content", script);
      return;
    }

    if (inspectorViewMode === "final") {
      const enabled = stages.filter((s) => s.enabled);
      let finalOut = "";
      for (let i = enabled.length - 1; i >= 0; i--) {
        const s = enabled[i];
        if (s && results[s.id] && results[s.id]?.status === "success") {
          finalOut = results[s.id]!.stdout;
          break;
        }
      }
      if (!finalOut && enabled.length > 0) {
        const last = enabled[enabled.length - 1];
        if (last && results[last.id]) {
          finalOut = results[last.id]!.stdout;
        }
      }
      if (!finalOut) {
        win.setText("txt_inspector_content", "# Pipeline Final Output (Clean)\nNo output generated yet. Run the pipeline to view.");
      } else {
        win.setText("txt_inspector_content", finalOut);
      }
      return;
    }

    if (inspectorViewMode === "sections") {
      let sectionsText = `# Subprocess Pipeline Stage-by-Stage Sections Breakdown\nTotal Stages: ${stages.length} | Pipeline: ${controller.getPipelineName()}\n\n`;
      stages.forEach((s, i) => {
        const r = results[s.id];
        sectionsText += `${"=".repeat(80)}\n`;
        sectionsText += `### SECTION #${i + 1}: ${s.name} [${s.command}]\n`;
        sectionsText += `Status: ${r ? r.status.toUpperCase() : "NOT RUN"} | Exit: ${r && r.exitCode !== null ? r.exitCode : "-"} | Duration: ${r ? r.durationMs + "ms" : "-"} | Bytes: ${r ? r.stdout.length : 0}\n`;
        sectionsText += `${"-".repeat(80)}\n`;
        sectionsText += (r ? r.stdout || "(empty stdout)" : "(stage has not executed yet)") + "\n\n";
      });
      win.setText("txt_inspector_content", sectionsText);
      return;
    }

    if (inspectorViewMode === "preview") {
      const cmdOneLiner = generatePipelineShellCommand(stages, {
        initialStdin: controller.getInitialStdin(),
        mode: controller.getMode(),
      });
      const preview = `# Subprocess Pipeline Flow
Pipeline Name: ${controller.getPipelineName()}
Total Stages:  ${stages.length}
Mode:          ${controller.getMode().toUpperCase()}
Elevation:     ${stages.some((s) => s.runWithSudo || isSudoRequired(s.command)) ? "ELEVATED (Sudo Required)" : "Standard User"}
Status:        ${controller.isPipelineRunning() ? "RUNNING" : "READY"}

--- Shell Pipeline Execution Equivalent ---
${cmdOneLiner}

--- Stages Order ---
${stages.map((s, i) => `${i + 1}. [${s.enabled ? "ACTIVE" : "DISABLED"}] ${s.name} ${s.runWithSudo ? "(SUDO 🛡️)" : ""} ➔ \`${s.command}\``).join("\n")}`;
      win.setText("txt_inspector_content", preview);
      return;
    }

    if (!st) {
      win.setText("txt_inspector_content", "No stage selected.");
      return;
    }

    const res = results[st.id];

    if (!res) {
      win.setText(
        "txt_inspector_content",
        `[Stage #${selectedStageIndex + 1}: ${st.name}]\nCommand: ${st.command}\nElevation: ${st.runWithSudo ? "SUDO (Root Privileges)" : "Standard"}\nStatus: Not yet executed.\n\nClick "▶ Run Full Pipeline", "⏭ Step Next", or "⚡ Test Selected" to run.`
      );
      return;
    }

    if (inspectorViewMode === "stdout") {
      const header = `[Stage #${selectedStageIndex + 1}: ${st.name}] ${res.isElevated ? "[ELEVATED 🛡️]" : ""} - STDOUT (${res.stdout.length} bytes, ${res.durationMs}ms, exit ${res.exitCode ?? 0}):\n${"-".repeat(60)}\n`;
      win.setText("txt_inspector_content", header + (res.stdout || "(Empty stdout)"));
    } else if (inspectorViewMode === "stderr") {
      const header = `[Stage #${selectedStageIndex + 1}: ${st.name}] - STDERR (${res.stderr.length} bytes):\n${"-".repeat(60)}\n`;
      win.setText("txt_inspector_content", header + (res.stderr || "(Empty stderr - Clean run)"));
    } else if (inspectorViewMode === "stdin") {
      const header = `[Stage #${selectedStageIndex + 1}: ${st.name}] - STDIN PASSED (${res.stdinUsed.length} bytes):\n${"-".repeat(60)}\n`;
      win.setText("txt_inspector_content", header + (res.stdinUsed || "(No stdin passed)"));
    }
  }

  function logConsole(message: string): void {
    const time = new Date().toLocaleTimeString();
    win.appendConsole("pipe_console", `[${time}] ${message}\n`);
  }

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Subprocess Pipe Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_center", "Center");
  win.addButton("btn_export_script", "📜 Export Script");
  win.addButton("btn_copy_script", "📋 Copy Script");
  win.addButton("btn_export_library", "📦 Export Library JSON");
  win.addButton("btn_copy_library_json", "📋 Copy Library JSON");
  win.endRow();
  win.addCaption(
    "Enterprise Multi-Stage Subprocess Orchestrator, Stream Pipelining (stdout ➔ stdin), Privilege Elevation & Shell Master"
  );

  // -----------------------------------------------------------------------------------------------
  // 2. Named Pipeline Library & Management (Save & Name Multiple Pipelines)
  // -----------------------------------------------------------------------------------------------
  win.beginCard("📚 Named Pipeline Manager & Presets Library");
  win.beginRow();
  win.addLabel("lbl_pipe_name_title", "Pipeline Name:");
  win.addInput("txt_pipeline_name", controller.getPipelineName()).width(280);
  win.addButton("btn_save_named_pipeline", "💾 Save Pipeline", { width: 140 });
  win.addButton("btn_save_as_new", "📋 Save As New...", { width: 145 });

  win.addLabel("lbl_saved_dropdown", "Library:");
  win.addDropdown("dd_saved_pipelines", library.listNames(), controller.getPipelineName(), { width: 260 });
  win.addButton("btn_load_named_pipeline", "📥 Load", { width: 85 });
  win.addButton("btn_delete_named_pipeline", "🗑 Delete", { width: 85 });
  win.endRow();
  win.endCard();

  // -----------------------------------------------------------------------------------------------
  // 3. Telemetry Card Banner
  // -----------------------------------------------------------------------------------------------
  win.beginCard("Pipeline Execution Telemetry & Stream Status");
  win.beginRow();
  win.addLabel("lbl_telemetry_status", "Status: 🟢 IDLE (Ready)");
  win.addLabel("lbl_telemetry_mode", "Mode: 🔀 Piped Stream (stdout ➔ stdin)");
  win.addLabel("lbl_telemetry_stages", `Stages: ${controller.getStages().length} Active`);
  win.addLabel("lbl_telemetry_runtime", "Total Time: 0 ms");
  win.addLabel("lbl_telemetry_throughput", "Data Flow: 0 B");
  win.endRow();
  win.endCard();

  // -----------------------------------------------------------------------------------------------
  // 4. Privilege Elevation & Sudo Manager Card
  // -----------------------------------------------------------------------------------------------
  win.beginCard("🛡️ Privilege Elevation & Sudo Credential Manager");
  win.beginRow();
  win.addLabel("lbl_sudo_state", "Sudo State: 🔍 Checking...");
  win.addButton("btn_check_sudo", "🔍 Check Sudo Ticket", { width: 160 });
  win.addButton("btn_auth_sudo", "🔑 Authenticate Sudo (-v)", { width: 180 });
  win.addLabel("lbl_elevation_mode", "Elevation Mode:");
  win.addDropdown(
    "dd_sudo_elevation_mode",
    [
      "Auto (Platform Default: macOS Prompt / Askpass)",
      "macOS Native Dialog (osascript prompt)",
      "Askpass Helper (Session Memory Password)",
      "Non-Interactive Cached Only (sudo -n)",
    ],
    "Auto (Platform Default: macOS Prompt / Askpass)",
    { width: 280 }
  );
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_sudo_pass_prompt", "Session Sudo Password:");
  win.addInput("txt_sudo_password", "", "Enter sudo password (held in volatile RAM only)...", { width: 320 });
  win.addButton("btn_clear_sudo_password", "Clear Password", { width: 130 });
  win.addLabel(
    "lbl_sudo_note",
    "🛡️ Notice: Password is never saved to disk and is used solely for child process askpass authorization."
  );
  win.endRow();
  win.endCard();

  // -----------------------------------------------------------------------------------------------
  // 5. Master Controls & Stepping Engine
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Execution Engine & Step-by-Step Shell Tester");
  win.beginRow();
  win.addButton("btn_run_all", "▶ Run Full Pipeline", { width: 170 });
  win.addButton("btn_step_next", "⏭ Step / Test Next Stage", { width: 185 });
  win.addButton("btn_test_selected", "⚡ Test Selected Stage", { width: 175 });
  win.addButton("btn_abort", "⏹ Abort", { width: 95 });
  win.addButton("btn_reset", "🔄 Reset State", { width: 120 });

  win.addLabel("lbl_mode_select", "Pipelining Mode:");
  win.addDropdown(
    "dd_pipe_mode",
    ["Piped Stream (stdout ➔ stdin)", "Sequential Chained (&&)"],
    "Piped Stream (stdout ➔ stdin)",
    { width: 260 }
  );
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Initial Stdin (Payload Input)
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Pipeline Initial Stdin (Root Input Fed into Stage #1)");
  win.beginRow();
  win.addLabel("lbl_stdin_desc", "Initial Data Payload:");
  win.addButton("btn_clear_stdin", "Clear Stdin");
  win.addButton("btn_load_sample_json", "Load Sample JSON");
  win.addButton("btn_load_sample_text", "Load Sample Words");
  win.endRow();
  win.addTextarea("txt_pipeline_stdin", defaultPipeline.initialStdin);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 7. Stages Table & Reordering Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Subprocess Pipeline Stages (Executed In Order From Top To Bottom)");
  win.beginRow();
  win.addButton("btn_add_stage", "➕ Add Stage");
  win.addButton("btn_remove_stage", "🗑 Delete Stage");
  win.addButton("btn_move_up", "⬆ Move Up (Reorder)");
  win.addButton("btn_move_down", "⬇ Move Down (Reorder)");
  win.addButton("btn_clone_stage", "📋 Duplicate Stage");
  win.addButton("btn_clear_stages", "Clear All Stages");
  win.endRow();

  const headers = [
    "Order",
    "Stage Name",
    "Shell Command",
    "Input Mode",
    "Status",
    "Exit",
    "Duration",
    "Output Size",
  ];
  win.addTable("tbl_stages", headers, buildTableRows());
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 8. Selected Stage Editor
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Stage Command & Parameter Editor");
  win.beginRow();
  win.addLabel("lbl_current_stage_order", `Editing Stage #1 of ${controller.getStages().length}`);
  win.addLabel("lbl_st_name", "Stage Name:");
  win.addInput("txt_stage_name", defaultPipeline.stages[0]?.name || "Stage 1").width(220);
  win.addLabel("lbl_st_cwd", "Working Dir (cwd):");
  win.addInput("txt_stage_cwd", "").width(200);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_st_cmd", "Shell Command:");
  win.addInput("txt_stage_cmd", defaultPipeline.stages[0]?.command || "ps aux").width(480);
  win.addLabel("lbl_st_input", "Input Mode:");
  win.addDropdown(
    "dd_stage_input",
    ["piped", "initial", "custom", "none"],
    defaultPipeline.stages[0]?.inputMode || "piped",
    { width: 140 }
  );
  win.addButton("btn_apply_stage", "💾 Apply Changes", { width: 140 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_stage_stop_on_err", "Stop Pipeline on Error (exit != 0)", true);
  win.addCheckbox("chk_stage_enabled", "Stage Enabled", true);
  win.addCheckbox("chk_stage_sudo", "Elevate with Sudo (Run as Root 🛡️)", false);
  win.addLabel("lbl_custom_stdin_title", "Custom Stdin (only used when Input Mode = 'custom'):");
  win.endRow();

  win.addTextarea("txt_stage_custom_stdin", "");
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 9. Dual Output & Inspector View
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Subprocess Output Inspector & Stream Telemetry");
  win.beginRow();
  win.addLabel("lbl_inspect_mode", "View Mode:");
  win.addDropdown(
    "dd_inspector_view",
    [
      "Final Pipe Output (Clean)",
      "Stage-by-Stage Sections",
      "Stage Stdout",
      "Stage Stderr",
      "Stage Stdin Used",
      "Pipeline Flow Preview",
      "Shell Script (.sh)",
    ],
    "Final Pipe Output (Clean)",
    { width: 220 }
  );
  win.addButton("btn_copy_final_output", "🎯 Copy Final Output");
  win.addButton("btn_copy_output", "📋 Copy Active View");
  win.addButton("btn_save_output_file", "💾 Save Output to File");
  win.endRow();

  win.addTextarea(
    "txt_inspector_content",
    "[Subprocess Pipe Pro Ready]\nSelect a stage and run to inspect output stream.\n"
  );
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 10. Console Log Audit Stream
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Live Subprocess Execution Console & Audit Trail");
  win.addConsole("pipe_console", 120);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // Event Handlers: Library & Named Pipeline Management
  // -----------------------------------------------------------------------------------------------

  // Save Pipeline (Save or overwrite named pipeline)
  win.on("btn_save_named_pipeline", "click", () => {
    const rawName = win.getValue("txt_pipeline_name") || "";
    const name = rawName.trim() || `Pipeline ${Date.now()}`;
    win.setValue("txt_pipeline_name", name);
    controller.setPipelineName(name);

    const stages = controller.getStages();
    const initialStdin = win.getValue("txt_pipeline_stdin") || "";
    const mode = controller.getMode();

    library.savePipeline({
      id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: `Custom ${mode.toUpperCase()} pipeline with ${stages.length} stages`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode,
      initialStdin,
      stages: JSON.parse(JSON.stringify(stages)),
    });

    const names = library.listNames();
    win.setListItems("dd_saved_pipelines", names);
    win.setValue("dd_saved_pipelines", name);
    win.toast(`Saved pipeline: "${name}"`);
    logConsole(`[Library] 💾 Saved named pipeline: "${name}" (${stages.length} stages).`);
  });

  // Save As New (Clones/creates a distinct named pipeline)
  win.on("btn_save_as_new", "click", () => {
    const rawName = win.getValue("txt_pipeline_name") || "Pipeline";
    let newName = `${rawName.replace(/\s*\(Copy.*\)$/i, "")} (Copy)`;
    let counter = 1;
    while (library.hasPipeline(newName)) {
      counter++;
      newName = `${rawName.replace(/\s*\(Copy.*\)$/i, "")} (Copy ${counter})`;
    }
    win.setValue("txt_pipeline_name", newName);
    controller.setPipelineName(newName);

    const stages = controller.getStages();
    const initialStdin = win.getValue("txt_pipeline_stdin") || "";
    const mode = controller.getMode();

    library.savePipeline({
      id: `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newName,
      description: `Custom ${mode.toUpperCase()} pipeline with ${stages.length} stages`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode,
      initialStdin,
      stages: JSON.parse(JSON.stringify(stages)),
    });

    const names = library.listNames();
    win.setListItems("dd_saved_pipelines", names);
    win.setValue("dd_saved_pipelines", newName);
    win.toast(`Created new pipeline: "${newName}"`);
    logConsole(`[Library] 📋 Created new named pipeline: "${newName}".`);
  });

  // Load Named Pipeline
  win.on("btn_load_named_pipeline", "click", () => {
    const selectedName = win.getValue("dd_saved_pipelines");
    if (!selectedName) return;
    const target = library.getPipeline(selectedName);
    if (!target) {
      win.toast(`Pipeline "${selectedName}" not found`);
      return;
    }

    controller.setPipelineName(target.name);
    controller.setStages(target.stages);
    controller.setInitialStdin(target.initialStdin);
    controller.setMode(target.mode);
    win.setValue("txt_pipeline_name", target.name);
    win.setValue("txt_pipeline_stdin", target.initialStdin);
    win.setValue(
      "dd_pipe_mode",
      target.mode === "piped" ? "Piped Stream (stdout ➔ stdin)" : "Sequential Chained (&&)"
    );
    win.setText(
      "lbl_telemetry_mode",
      target.mode === "piped" ? "Mode: 🔀 Piped Stream (stdout ➔ stdin)" : "Mode: ⛓ Sequential Chained (&&)"
    );

    selectedStageIndex = 0;
    updateTable();
    syncStageEditor();
    renderInspector();
    win.toast(`Loaded pipeline: "${target.name}"`);
    logConsole(`[Library] 📥 Loaded pipeline "${target.name}" (${target.stages.length} stages).`);
  });

  // Delete Named Pipeline
  win.on("btn_delete_named_pipeline", "click", () => {
    const selectedName = win.getValue("dd_saved_pipelines");
    if (!selectedName) return;

    if (library.listNames().length <= 1) {
      win.toast("Cannot delete the only remaining pipeline");
      return;
    }

    library.deletePipeline(selectedName);
    const names = library.listNames();
    win.setListItems("dd_saved_pipelines", names);
    const nextName = names[0] || "";
    win.setValue("dd_saved_pipelines", nextName);

    if (nextName) {
      const nextPipe = library.getPipeline(nextName);
      if (nextPipe) {
        controller.setPipelineName(nextPipe.name);
        controller.setStages(nextPipe.stages);
        controller.setInitialStdin(nextPipe.initialStdin);
        controller.setMode(nextPipe.mode);
        win.setValue("txt_pipeline_name", nextPipe.name);
        win.setValue("txt_pipeline_stdin", nextPipe.initialStdin);
        selectedStageIndex = 0;
        updateTable();
        syncStageEditor();
        renderInspector();
      }
    }

    win.toast(`Deleted pipeline: "${selectedName}"`);
    logConsole(`[Library] 🗑 Deleted pipeline: "${selectedName}".`);
  });

  // Export Library JSON (File)
  win.on("btn_export_library", "click", () => {
    try {
      const json = library.exportJson();
      const exportPath = resolve(process.cwd(), "dist", "subprocess_pipelines_library.json");
      writeFileSync(exportPath, json, "utf-8");
      win.toast("Exported pipeline library to dist/");
      logConsole(`[Library] 📦 Exported all saved pipelines to ${exportPath}`);
    } catch (e: any) {
      win.toast(`Export failed: ${e.message}`);
    }
  });

  // Export Library JSON (Clipboard)
  win.on("btn_copy_library_json", "click", () => {
    try {
      const json = library.exportJson();
      writeClipboardSync(json);
      win.toast("Copied pipeline library JSON to clipboard!");
      logConsole(`[Clipboard] 📋 Copied complete pipeline library JSON (${json.length} chars) to clipboard.`);
    } catch (e: any) {
      win.toast(`Clipboard error: ${e.message}`);
    }
  });

  // -----------------------------------------------------------------------------------------------
  // Sudo Diagnostics & Event Handlers
  // -----------------------------------------------------------------------------------------------

  async function refreshSudoStatus(): Promise<void> {
    const diag = await checkSudoPreflight();
    if (!diag.hasSudoBinary) {
      win.setText("lbl_sudo_state", "Sudo State: ❌ Sudo binary not found in PATH");
    } else if (diag.isCached) {
      win.setText("lbl_sudo_state", `Sudo State: 🟢 Active Cached Ticket (User: ${diag.user})`);
    } else {
      win.setText("lbl_sudo_state", `Sudo State: 🔒 Not Cached (Password or macOS prompt needed)`);
    }
  }

  win.on("btn_check_sudo", "click", async () => {
    win.setText("lbl_sudo_state", "Sudo State: 🔍 Testing sudo -n true...");
    const isCached = await checkSudoCached();
    if (isCached) {
      win.setText("lbl_sudo_state", "Sudo State: 🟢 Cached Sudo Ticket Active!");
      win.toast("Sudo credentials are cached and active!");
      logConsole("🟢 Sudo credentials check: Active cached ticket found.");
    } else {
      win.setText("lbl_sudo_state", "Sudo State: 🔒 Password required (Not cached)");
      win.toast("Sudo is not cached. Provide a password or use macOS dialog.");
      logConsole("🔒 Sudo credentials check: No active cached ticket. Elevation will require authentication.");
    }
  });

  win.on("btn_auth_sudo", "click", async () => {
    logConsole("🔑 Initiating sudo pre-authentication (-v)...");
    win.toast("Authenticating sudo...");

    const pass = win.getValue("txt_sudo_password") || "";
    let ok = false;

    if (pass.length > 0) {
      ok = await withAskpass(pass, async (_path, extraEnv) => {
        try {
          const proc = Bun.spawn(["sudo", "-A", "-v"], {
            env: { ...process.env, ...extraEnv },
            stdout: "pipe",
            stderr: "pipe",
          });
          const code = await proc.exited;
          return code === 0;
        } catch {
          return false;
        }
      });
    } else if (process.platform === "darwin") {
      try {
        const proc = Bun.spawn(
          ["osascript", "-e", 'do shell script "sudo -v" with administrator privileges'],
          { stdout: "pipe", stderr: "pipe" }
        );
        const code = await proc.exited;
        ok = code === 0;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      win.setText("lbl_sudo_state", "Sudo State: 🟢 Authenticated! (Cached ticket active)");
      win.toast("Sudo successfully authenticated!");
      logConsole("🟢 Sudo authentication successful! Session ticket active.");
    } else {
      win.setText("lbl_sudo_state", "Sudo State: ❌ Authentication failed or cancelled");
      win.toast("Sudo authentication failed");
      logConsole("❌ Sudo authentication failed or was cancelled by user.");
    }
  });

  win.on("btn_clear_sudo_password", "click", () => {
    win.setValue("txt_sudo_password", "");
    controller.setSudoPassword("");
    win.toast("Cleared session sudo password from memory");
    logConsole("Cleared session sudo password from memory.");
  });

  win.on("dd_sudo_elevation_mode", "change", (_w: any, val: any) => {
    const text = String(val);
    let mode: SudoElevationMode = "auto";
    if (text.includes("macOS Native Dialog")) mode = "macos_prompt";
    else if (text.includes("Askpass")) mode = "askpass";
    else if (text.includes("Non-Interactive")) mode = "non_interactive";
    controller.setElevationMode(mode);
    logConsole(`Privilege elevation mode set to: ${mode}`);
  });

  // -----------------------------------------------------------------------------------------------
  // Stage Reordering, Table & Editor Handlers
  // -----------------------------------------------------------------------------------------------

  win.on("tbl_stages", "click", (_w: any, val: any) => {
    if (typeof val === "number" && val >= 0 && val < controller.getStages().length) {
      selectedStageIndex = val;
      syncStageEditor();
      renderInspector();
      updateTable();
    }
  });

  win.on("btn_apply_stage", "click", () => {
    const name = win.getValue("txt_stage_name") || `Stage ${selectedStageIndex + 1}`;
    const command = win.getValue("txt_stage_cmd") || "cat";
    const cwd = win.getValue("txt_stage_cwd") || undefined;
    const inputMode = (win.getValue("dd_stage_input") as SubprocessInputMode) || "piped";
    const stopOnError = Boolean(win.getValue("chk_stage_stop_on_err"));
    const enabled = Boolean(win.getValue("chk_stage_enabled"));
    const runWithSudo = Boolean(win.getValue("chk_stage_sudo")) || isSudoRequired(command);
    const customStdin = win.getValue("txt_stage_custom_stdin") || undefined;

    controller.updateStage(selectedStageIndex, {
      name,
      command,
      cwd,
      inputMode,
      stopOnError,
      enabled,
      runWithSudo,
      customStdin,
    });

    updateTable();
    renderInspector();
    win.toast(`Updated Stage #${selectedStageIndex + 1}: ${name}`);
    logConsole(
      `Updated Stage #${selectedStageIndex + 1}: "${name}" ${runWithSudo ? "(Sudo 🛡️)" : ""} ➔ \`${command}\``
    );
  });

  win.on("btn_add_stage", "click", () => {
    const newStage = controller.addStage({
      name: `Stage ${controller.getStages().length + 1}`,
      command: "cat",
      inputMode: "piped",
    });
    selectedStageIndex = controller.getStages().length - 1;
    updateTable();
    syncStageEditor();
    renderInspector();
    win.toast("Added new stage");
    logConsole(`Added new stage #${selectedStageIndex + 1} (${newStage.id})`);
  });

  win.on("btn_remove_stage", "click", () => {
    if (controller.getStages().length <= 1) {
      win.toast("Cannot delete the last remaining stage");
      return;
    }
    const removedIdx = selectedStageIndex;
    controller.removeStage(removedIdx);
    if (selectedStageIndex >= controller.getStages().length) {
      selectedStageIndex = Math.max(0, controller.getStages().length - 1);
    }
    updateTable();
    syncStageEditor();
    renderInspector();
    win.toast(`Deleted stage #${removedIdx + 1}`);
    logConsole(`Deleted stage #${removedIdx + 1}`);
  });

  win.on("btn_move_up", "click", () => {
    if (selectedStageIndex > 0) {
      controller.moveStage(selectedStageIndex, "up");
      selectedStageIndex--;
      updateTable();
      syncStageEditor();
      renderInspector();
      win.toast(`Moved stage up to #${selectedStageIndex + 1}`);
      logConsole(`Reordered: Stage moved UP to position #${selectedStageIndex + 1}`);
    }
  });

  win.on("btn_move_down", "click", () => {
    if (selectedStageIndex < controller.getStages().length - 1) {
      controller.moveStage(selectedStageIndex, "down");
      selectedStageIndex++;
      updateTable();
      syncStageEditor();
      renderInspector();
      win.toast(`Moved stage down to #${selectedStageIndex + 1}`);
      logConsole(`Reordered: Stage moved DOWN to position #${selectedStageIndex + 1}`);
    }
  });

  win.on("btn_clone_stage", "click", () => {
    const curr = controller.getStages()[selectedStageIndex];
    if (curr) {
      controller.addStage({
        name: `${curr.name} (Copy)`,
        command: curr.command,
        inputMode: curr.inputMode,
        stopOnError: curr.stopOnError,
        timeoutMs: curr.timeoutMs,
        cwd: curr.cwd,
        customStdin: curr.customStdin,
        runWithSudo: curr.runWithSudo,
      });
      selectedStageIndex = controller.getStages().length - 1;
      updateTable();
      syncStageEditor();
      renderInspector();
      win.toast("Cloned stage");
      logConsole(`Duplicated stage #${selectedStageIndex + 1}`);
    }
  });

  win.on("btn_clear_stages", "click", () => {
    controller.setStages([
      {
        id: "stage_root",
        name: "Stage 1: Primary Process",
        command: "echo 'Subprocess Pipe Pro'",
        inputMode: "none",
        enabled: true,
        stopOnError: true,
        timeoutMs: 5000,
        runWithSudo: false,
      },
    ]);
    selectedStageIndex = 0;
    updateTable();
    syncStageEditor();
    renderInspector();
    win.toast("Cleared stages to single root");
    logConsole("Reset pipeline to single root stage");
  });

  // -----------------------------------------------------------------------------------------------
  // Pipelining Mode & Initial Stdin
  // -----------------------------------------------------------------------------------------------

  win.on("dd_pipe_mode", "change", (_w: any, val: any) => {
    const isPiped = String(val).includes("Piped");
    controller.setMode(isPiped ? "piped" : "sequential");
    win.setText(
      "lbl_telemetry_mode",
      isPiped ? "Mode: 🔀 Piped Stream (stdout ➔ stdin)" : "Mode: ⛓ Sequential Chained (&&)"
    );
    renderInspector();
  });

  win.on("dd_inspector_view", "change", (_w: any, val: any) => {
    const text = String(val);
    if (text.includes("Final Pipe Output")) inspectorViewMode = "final";
    else if (text.includes("Stage-by-Stage Sections")) inspectorViewMode = "sections";
    else if (text.includes("Stdout")) inspectorViewMode = "stdout";
    else if (text.includes("Stderr")) inspectorViewMode = "stderr";
    else if (text.includes("Stdin")) inspectorViewMode = "stdin";
    else if (text.includes("Preview") || text.includes("Flow")) inspectorViewMode = "preview";
    else if (text.includes("Script")) inspectorViewMode = "script";
    renderInspector();
  });

  win.on("btn_clear_stdin", "click", () => {
    win.setValue("txt_pipeline_stdin", "");
    controller.setInitialStdin("");
    win.toast("Cleared Initial Stdin");
  });

  win.on("btn_load_sample_json", "click", () => {
    const jsonPreset = getDefaultPipelinePresets()["JSON Stream Filter & Sort"];
    if (jsonPreset) {
      win.setValue("txt_pipeline_stdin", jsonPreset.initialStdin);
      controller.setInitialStdin(jsonPreset.initialStdin);
      win.toast("Loaded sample JSON payload");
    }
  });

  win.on("btn_load_sample_text", "click", () => {
    const wordPreset = getDefaultPipelinePresets()["Word Frequency & Text Analytics"];
    if (wordPreset) {
      win.setValue("txt_pipeline_stdin", wordPreset.initialStdin);
      controller.setInitialStdin(wordPreset.initialStdin);
      win.toast("Loaded sample text payload");
    }
  });

  // -----------------------------------------------------------------------------------------------
  // Execution Engine Actions (Run All, Step Next, Test Selected, Abort, Reset)
  // -----------------------------------------------------------------------------------------------

  win.on("btn_run_all", "click", async () => {
    if (controller.isPipelineRunning()) {
      win.toast("Pipeline is already executing");
      return;
    }

    controller.setInitialStdin(win.getValue("txt_pipeline_stdin") || "");
    const modeVal = win.getValue("dd_pipe_mode");
    controller.setMode(String(modeVal).includes("Piped") ? "piped" : "sequential");
    controller.setSudoPassword(win.getValue("txt_sudo_password") || "");

    win.setText("lbl_telemetry_status", "Status: ⚡ RUNNING PIPELINE...");
    win.setStatus("Executing multi-stage pipeline...");
    logConsole("▶ Starting full pipeline execution...");

    updateTable();

    let totalBytes = 0;

    const report = await controller.runAll(
      (stage, idx) => {
        const sudoLabel = stage.runWithSudo || isSudoRequired(stage.command) ? " [SUDO 🛡️]" : "";
        logConsole(`[Stage #${idx + 1}] Spawning \`${stage.name}\`${sudoLabel} ➔ \`${stage.command}\`...`);
        win.setText("lbl_telemetry_status", `Status: ⚡ Running Stage #${idx + 1} (${stage.name})`);
        updateTable();
      },
      (stage, res, idx) => {
        totalBytes += res.stdout.length;
        const icon = res.status === "success" ? "✅" : "❌";
        logConsole(
          `[Stage #${idx + 1} (${stage.name})] ${icon} Finished in ${res.durationMs}ms with exit code ${res.exitCode ?? 0} (${res.stdout.length} bytes out)`
        );
        if (res.stderr.trim()) {
          logConsole(`[Stage #${idx + 1} STDERR]: ${res.stderr.trim()}`);
        }
        updateTable();
        renderInspector();
      }
    );

    const isSuccess = report.status === "success";
    win.setText(
      "lbl_telemetry_status",
      isSuccess
        ? "Status: ✅ SUCCESS (Completed All Stages)"
        : report.status === "aborted"
        ? "Status: ⏹ ABORTED by user"
        : `Status: ❌ ERROR in Stage ${report.errorStageId || ""}`
    );
    win.setText("lbl_telemetry_runtime", `Total Time: ${report.totalDurationMs} ms`);
    win.setText("lbl_telemetry_throughput", `Data Flow: ${totalBytes} B`);
    win.setStatus(isSuccess ? "Pipeline completed successfully" : "Pipeline finished with errors");
    win.toast(isSuccess ? `Pipeline completed in ${report.totalDurationMs}ms` : "Pipeline finished with errors");

    logConsole(
      `🏁 Pipeline finished: ${report.status.toUpperCase()} in ${report.totalDurationMs}ms (${report.stagesCompleted}/${report.totalStages} stages executed).`
    );

    updateTable();
    renderInspector();
  });

  win.on("btn_step_next", "click", async () => {
    if (controller.isPipelineRunning()) {
      win.toast("Pipeline is already executing");
      return;
    }

    controller.setInitialStdin(win.getValue("txt_pipeline_stdin") || "");
    const modeVal = win.getValue("dd_pipe_mode");
    controller.setMode(String(modeVal).includes("Piped") ? "piped" : "sequential");
    controller.setSudoPassword(win.getValue("txt_sudo_password") || "");

    const currIdx = controller.getCurrentStepIndex();
    const enabledStages = controller.getStages().filter((s) => s.enabled);

    if (currIdx >= enabledStages.length) {
      win.toast("All stages have been tested! Click Reset to restart.");
      logConsole("All pipeline stages already tested. Click 'Reset State' to test again.");
      return;
    }

    const nextStage = enabledStages[currIdx]!;
    const sudoNotice = nextStage.runWithSudo || isSudoRequired(nextStage.command) ? " [SUDO 🛡️]" : "";
    logConsole(`⏭ Testing Step #${currIdx + 1}: "${nextStage.name}"${sudoNotice} ➔ \`${nextStage.command}\`...`);
    win.setText("lbl_telemetry_status", `Status: ⚡ Stepping Stage #${currIdx + 1} (${nextStage.name})`);

    const resObj = await controller.stepNext();
    if (resObj) {
      const { stage, result } = resObj;
      selectedStageIndex = controller.getStages().findIndex((s) => s.id === stage.id);
      syncStageEditor();
      updateTable();
      renderInspector();

      const icon = result.status === "success" ? "✅" : "❌";
      logConsole(
        `[Step #${currIdx + 1}] ${icon} Finished in ${result.durationMs}ms (exit ${result.exitCode ?? 0})`
      );
      win.toast(`Executed Stage #${currIdx + 1}: ${stage.name} (${result.durationMs}ms)`);
      win.setText(
        "lbl_telemetry_status",
        result.status === "success"
          ? `Status: ✅ Stage #${currIdx + 1} Passed (${currIdx + 1}/${enabledStages.length})`
          : `Status: ❌ Stage #${currIdx + 1} Failed (Exit ${result.exitCode})`
      );
    }
  });

  win.on("btn_test_selected", "click", async () => {
    const stages = controller.getStages();
    const st = stages[selectedStageIndex];
    if (!st) return;

    controller.setSudoPassword(win.getValue("txt_sudo_password") || "");
    const sudoNotice = st.runWithSudo || isSudoRequired(st.command) ? " [SUDO 🛡️]" : "";
    logConsole(`⚡ Testing stage in isolation: "${st.name}"${sudoNotice} ➔ \`${st.command}\`...`);
    win.setText("lbl_telemetry_status", `Status: ⚡ Testing Stage #${selectedStageIndex + 1} in isolation...`);

    const inputData = win.getValue("txt_pipeline_stdin") || "";
    const result = await controller.testSingleStage(st.id, inputData);

    if (result) {
      updateTable();
      renderInspector();
      const icon = result.status === "success" ? "✅" : "❌";
      logConsole(`[Isolated Test] ${icon} Completed in ${result.durationMs}ms (exit ${result.exitCode ?? 0})`);
      win.toast(`Tested "${st.name}": exit code ${result.exitCode ?? 0}`);
      win.setText(
        "lbl_telemetry_status",
        result.status === "success"
          ? `Status: ✅ Isolated Test Passed (${result.durationMs}ms)`
          : `Status: ❌ Isolated Test Failed (Exit ${result.exitCode})`
      );
    }
  });

  win.on("btn_abort", "click", () => {
    controller.abort();
    win.setText("lbl_telemetry_status", "Status: ⏹ ABORTED");
    win.toast("Pipeline execution aborted");
    logConsole("⏹ User clicked Abort - terminating active processes.");
    updateTable();
  });

  win.on("btn_reset", "click", () => {
    controller.resetState();
    win.setText("lbl_telemetry_status", "Status: 🟢 IDLE (Reset)");
    win.setText("lbl_telemetry_runtime", "Total Time: 0 ms");
    win.setText("lbl_telemetry_throughput", "Data Flow: 0 B");
    win.toast("Pipeline state reset");
    logConsole("🔄 Pipeline execution state reset to beginning.");
    updateTable();
    renderInspector();
  });


  win.on("btn_copy_final_output", "click", () => {
    const stages = controller.getStages().filter((s) => s.enabled);
    const results = controller.getResults();
    let finalOut = "";
    for (let i = stages.length - 1; i >= 0; i--) {
      const s = stages[i];
      if (s && results[s.id]) {
        finalOut = results[s.id]!.stdout;
        break;
      }
    }
    if (finalOut && finalOut.length > 0) {
      writeClipboardSync(finalOut);
      win.toast(`Copied ${finalOut.length} characters of Final Output!`);
      logConsole(`[Clipboard] 🎯 Copied pure final pipeline output (${finalOut.length} bytes) to clipboard.`);
    } else {
      win.toast("No final output to copy. Run the pipeline first.");
    }
  });

  win.on("btn_copy_output", "click", () => {
    const text = win.getValue("txt_inspector_content");
    writeClipboardSync(text);
    win.toast(`Copied ${text.length} characters to clipboard`);
  });

  win.on("btn_save_output_file", "click", () => {
    try {
      const text = win.getValue("txt_inspector_content");
      const outPath = resolve(process.cwd(), "dist", `pipeline_output_${Date.now()}.txt`);
      writeFileSync(outPath, text, "utf-8");
      win.toast(`Saved to dist/${outPath}`);
      logConsole(`Saved inspector content to ${outPath}`);
    } catch (e: any) {
      win.toast(`Save failed: ${e.message}`);
    }
  });

  win.on("btn_export_script", "click", () => {
    try {
      const script = generateShellScript(controller.getStages(), {
        name: controller.getPipelineName(),
        initialStdin: controller.getInitialStdin(),
        mode: controller.getMode(),
      });
      const scriptPath = resolve(process.cwd(), "dist", "pipeline_master.sh");
      writeFileSync(scriptPath, script, "utf-8");
      win.toast(`Exported script to dist/pipeline_master.sh`);
      logConsole(`Exported shell script to ${scriptPath}`);
      inspectorViewMode = "script";
      win.setValue("dd_inspector_view", "Shell Script (.sh)");
      renderInspector();
    } catch (e: any) {
      win.toast(`Export error: ${e.message}`);
    }
  });

  win.on("btn_copy_script", "click", () => {
    try {
      const script = generateShellScript(controller.getStages(), {
        name: controller.getPipelineName(),
        initialStdin: controller.getInitialStdin(),
        mode: controller.getMode(),
      });
      writeClipboardSync(script);
      win.toast("Copied standalone script to clipboard!");
      logConsole(`[Clipboard] 📜 Copied standalone bash script (${script.length} chars) to clipboard.`);
      inspectorViewMode = "script";
      win.setValue("dd_inspector_view", "Shell Script (.sh)");
      renderInspector();
    } catch (e: any) {
      win.toast(`Clipboard error: ${e.message}`);
    }
  });

  // Initial render
  updateTable();
  syncStageEditor();
  renderInspector();
  refreshSudoStatus();
  logConsole("Subprocess Pipe Pro initialized. Multiple named pipelines ready in library.");

  return win;
}

export {
  createSubprocessPipeStudio as createSubprocessPipePro,
  createSubprocessPipeStudio as createShellProcessMasterStudio,
};

// @ts-ignore: Bun handles import.meta.main natively
if (import.meta.main) {
  const win = createSubprocessPipeStudio({ fullscreen: true });
  win.run();
}
