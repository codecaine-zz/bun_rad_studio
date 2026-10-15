/**
 * Writing the system clipboard: text and pictures. `defaultClipboard()` is the real thing; a test (or a computer with no
 * clipboard tool) can replace any part of it through `FmContextOptions.clipboard`.
 *
 * Pictures are handed to the operating system's own tools with the file name as one argument or one environment value,
 * never inside a script or a shell line:
 *   macOS    `sips` turns anything that is not a PNG into one, then `osascript` puts the PNG on the clipboard;
 *   Windows  PowerShell with System.Windows.Forms (`-STA`, which the clipboard needs), the path in $env:FM_CLIP_FILE;
 *   Linux    `wl-copy` or `xclip` with the picture's own type.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import { writeClipboardSync } from "../../localGuard";

export interface ClipboardHooks {
  /** Puts text on the clipboard; false when no clipboard tool worked. */
  writeText(text: string): boolean;
  /** Puts a picture file on the clipboard; false when it could not be done. */
  writeImage(file: string, mime: string): Promise<boolean>;
}

const TIMEOUT_MS = 20_000;

async function run(argv: string[], env: Record<string, string> = {}): Promise<boolean> {
  try {
    const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore", env: { ...process.env, ...env } });
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* already over */ } }, TIMEOUT_MS);
    const code = await proc.exited;
    clearTimeout(timer);
    return code === 0;
  } catch {
    return false;
  }
}

async function macImage(file: string, mime: string): Promise<boolean> {
  let png = file;
  let temp = "";
  try {
    if (mime !== "image/png") {
      temp = mkdtempSync(nodePath.join(tmpdir(), "fm-clip-"));
      png = nodePath.join(temp, "picture.png");
      if (!(await run(["sips", "-s", "format", "png", file, "--out", png]))) return false;
    }
    return await run(["osascript", "-e", "on run argv", "-e", "set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)", "-e", "end run", png]);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}

async function windowsImage(file: string): Promise<boolean> {
  const script = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $img = [System.Drawing.Image]::FromFile($env:FM_CLIP_FILE); [System.Windows.Forms.Clipboard]::SetImage($img); $img.Dispose()";
  return run(["powershell.exe", "-NoProfile", "-STA", "-Command", script], { FM_CLIP_FILE: file });
}

async function linuxImage(file: string, mime: string): Promise<boolean> {
  if (Bun.which("wl-copy")) {
    try {
      const proc = Bun.spawn(["wl-copy", "--type", mime], { stdin: Bun.file(file), stdout: "ignore", stderr: "ignore" });
      if ((await proc.exited) === 0) return true;
    } catch { /* try the next tool */ }
  }
  if (Bun.which("xclip")) return run(["xclip", "-selection", "clipboard", "-t", mime, "-i", file]);
  return false;
}

export function defaultClipboard(): ClipboardHooks {
  return {
    writeText: (text) => writeClipboardSync(text),
    writeImage: async (file, mime) => (process.platform === "darwin" ? macImage(file, mime) : process.platform === "win32" ? windowsImage(file) : linuxImage(file, mime)),
  };
}
