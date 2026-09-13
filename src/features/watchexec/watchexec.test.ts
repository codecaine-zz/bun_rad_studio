import { describe, expect, it } from "bun:test";
import {
  matchesExtension,
  matchesFilter,
  shouldIgnore,
  shouldTrigger,
  spawnCommand,
  killRunningProcess,
  buildWatchexecEnv,
  formatShellCommand,
} from "./watchexecDoers.ts";

describe("watchexec doers", () => {
  it("matches extensions correctly", () => {
    expect(matchesExtension("index.ts", ["ts", "js"])).toBe(true);
    expect(matchesExtension("index.TS", ["ts"])).toBe(true);
    expect(matchesExtension("style.css", ["ts", "js"])).toBe(false);
    expect(matchesExtension("file.any", undefined)).toBe(true);
  });

  it("identifies ignore patterns", () => {
    expect(shouldIgnore("node_modules/pkg/index.js", ["node_modules", ".git"])).toBe(true);
    expect(shouldIgnore(".git/HEAD", ["node_modules", ".git"])).toBe(true);
    expect(shouldIgnore("src/features/app.ts", ["node_modules", ".git"])).toBe(false);
  });

  it("filters filenames by pattern filter", () => {
    expect(matchesFilter("src/features/auth/login.ts", ["auth"])).toBe(true);
    expect(matchesFilter("src/features/billing/pay.ts", ["auth"])).toBe(false);
    expect(matchesFilter("src/index.ts", undefined)).toBe(true);
  });

  it("evaluates shouldTrigger accurately", () => {
    const ignores = ["node_modules", ".git"];
    const exts = ["ts"];

    expect(shouldTrigger("src/main.ts", exts, ignores)).toBe(true);
    expect(shouldTrigger("src/main.js", exts, ignores)).toBe(false);
    expect(shouldTrigger("node_modules/lib.ts", exts, ignores)).toBe(false);
    expect(shouldTrigger("", exts, ignores)).toBe(false);
  });

  it("spawns and terminates child command", async () => {
    const proc = spawnCommand(["sleep", "5"]);
    expect(proc).not.toBeNull();
    killRunningProcess(proc);
    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
  });

  it("builds watchexec environment variables", () => {
    const env = buildWatchexecEnv("src/main.ts", "./src");
    expect(env.WATCHEXEC_WRITTEN_PATH).toBe("src/main.ts");
    expect(env.WATCHEXEC_TRIGGERED_PATH).toBe("src/main.ts");
    expect(env.WATCHEXEC_COMMON_PATH).toBe("./src");
  });

  it("formats shell commands appropriately", () => {
    expect(formatShellCommand(["echo", "hello"], undefined)).toEqual(["echo", "hello"]);
    expect(formatShellCommand(["echo", "hello"], "bash")).toEqual(["bash", "-c", "echo hello"]);
  });
});
