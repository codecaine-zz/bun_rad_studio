/**
 * "Format with v fmt" for the Code tab. The editor's text is written to a private temporary file (random name,
 * mode 0600, in the operating system's temp folder), `v fmt <file>` is run with an argument list (never a shell) with
 * a time limit and an output limit, and the formatted text, or V's own error message, comes back. The temporary file
 * is always deleted. Nothing is ever run except the `v` program.
 */
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

export const FORMAT_TIMEOUT_MS = 10_000;
export const FORMAT_MAX_OUTPUT = 1024 * 1024;
export const MAX_FORMAT_CHARS = 900_000;
export const V_MISSING = "V isn't installed (or isn't on your PATH). Get it from vlang.io to format V files.";

/** `formatted` (not `ok`, which the reply envelope uses) says whether `text` is the formatted result; otherwise `problem` or `message` says why not. */
export interface FormatResult { available: boolean; formatted: boolean; text?: string; problem?: string; message?: string; version?: string }

interface Runner { command: string; timeoutMs: number; tempDir: string }

function run(command: string, args: string[], timeoutMs: number, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string; missing: boolean; timedOut: boolean; tooBig: boolean }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let tooBig = false;
    let settled = false;
    const finish = (code: number | null, missing = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, missing, timedOut, tooBig });
    };
    let child;
    try {
      child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, NO_COLOR: "1", VNOCOLOR: "1" } });
    } catch {
      return finish(null, true);
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(null); // don't wait for pipes that a child of v may still hold open
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length + d.length > FORMAT_MAX_OUTPUT) {
        tooBig = true;
        child.kill("SIGKILL");
        finish(null);
      } else stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => { if (stderr.length < 16_384) stderr += d.toString("utf8"); });
    child.once("error", (err: NodeJS.ErrnoException) => finish(null, err.code === "ENOENT"));
    child.once("close", (code) => finish(code));
  });
}

/** Formats V source with `v fmt`. `runner` is only for tests (another program, a shorter time limit, another temp folder). */
export async function formatV(text: unknown, runner: Partial<Runner> = {}): Promise<FormatResult> {
  if (typeof text !== "string") throw new FmError("BAD_REQUEST", "There is no text to format.");
  if (text.length > MAX_FORMAT_CHARS) throw new FmError("TOO_BIG", "This file is too big to format here.");
  const { command = "v", timeoutMs = FORMAT_TIMEOUT_MS, tempDir = tmpdir() } = runner;
  const temp = nodePath.join(tempDir, `fm-vfmt-${randomBytes(8).toString("hex")}.v`);
  try {
    const handle = await fsp.open(temp, "wx", 0o600);
    try {
      await handle.writeFile(text, "utf8");
    } finally {
      await handle.close();
    }
    const r = await run(command, ["fmt", temp], timeoutMs, tempDir);
    if (r.missing) return { available: false, formatted: false, message: V_MISSING };
    if (r.timedOut) return { available: true, formatted: false, problem: `v fmt took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.` };
    if (r.tooBig) return { available: true, formatted: false, problem: "The formatted text is too big." };
    if (r.code !== 0) {
      const clean = (r.stderr || r.stdout).split(temp).join("your file").split(nodePath.basename(temp)).join("your file").replaceAll(/\u001b\[[0-9;]*m/g, "").trim();
      return { available: true, formatted: false, problem: clean || "v fmt couldn't format this text." };
    }
    return { available: true, formatted: true, text: r.stdout };
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

/** `code/format`: { tool: "v", text } -> { available, formatted, text | problem | message }. */
export async function formatWithTool(_ctx: FmContext, body: Record<string, any>): Promise<FormatResult> {
  if (body.tool !== "v") throw new FmError("BAD_REQUEST", "That formatter isn't supported. Only V's `v fmt` is.");
  return await formatV(body.text);
}

/** `code/formatter`: is `v` there, and which version? (for the menu text) */
export async function vVersion(_ctx: FmContext): Promise<{ available: boolean; version: string }> {
  const r = await run("v", ["version"], 4000, tmpdir());
  return { available: !r.missing && r.code === 0, version: r.missing ? "" : r.stdout.trim().slice(0, 60) };
}
