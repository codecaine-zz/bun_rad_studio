/**
 * Guard for the loopback-only HTTP servers behind the desktop studios.
 *
 * These servers expose powerful endpoints (run SQL, write files, kill processes, ...) and used to answer
 * every request with `Access-Control-Allow-Origin: *`. Any web page open in the user's browser could
 * therefore drive them (a plain `text/plain` POST needs no CORS preflight), and DNS rebinding could do
 * the same via a hostile hostname. The studio UI is always loaded from the server itself (same origin),
 * so we can safely reject:
 *   - requests whose `Host` is not a loopback name (DNS rebinding), and
 *   - requests carrying an `Origin` that is not this server's own origin (cross-site requests).
 * Non-browser clients (tests, curl) send no `Origin` and are unaffected.
 */
export function guardLocalRequest(req: Request): Response | null {
  const host = (req.headers.get("host") || "").toLowerCase();
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (host && hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
    return new Response("Forbidden: non-loopback Host header", { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin.toLowerCase() !== `http://${host}`) {
    return new Response("Forbidden: cross-origin request blocked", { status: 403 });
  }
  return null;
}

/** Cross-platform clipboard write (macOS pbcopy, Windows clip, Linux wl-copy/xclip). Returns false on failure. */
export function writeClipboardSync(text: string): boolean {
  try {
    const inputBuf = Buffer.from(text, "utf8");
    if (process.platform === "darwin") {
      const proc = Bun.spawnSync(["pbcopy"], { stdin: inputBuf });
      return proc.exitCode === 0;
    } else if (process.platform === "win32") {
      if (text.length > 0 && /^[\t\r\n\x20-\x7e]+$/.test(text)) {
        const clip = Bun.spawnSync(["clip"], { stdin: inputBuf });
        if (clip.exitCode === 0) return true;
      }
      // PowerShell and clip read a pipe in the console's old code page, which garbles accents and other Unicode.
      // So PowerShell gets base64 (plain ASCII) and decodes it itself; clip understands UTF-16 with a byte-order mark.
      const ps = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
        "$b = [Console]::In.ReadToEnd().Trim(); Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))"], {
        stdin: Buffer.from(inputBuf.toString("base64"), "ascii"),
      });
      if (ps.exitCode === 0) return true;
      const clip = Bun.spawnSync(["clip"], { stdin: Buffer.from(`\ufeff${text}`, "utf16le") });
      return clip.exitCode === 0;
    } else {
      const candidates: string[][] = [
        ["wl-copy"],
        ["xclip", "-selection", "clipboard"],
        ["xsel", "--clipboard", "--input"],
      ];
      for (const cmd of candidates) {
        try {
          // Output is not captured: xclip and wl-copy leave a background process serving the clipboard, and it
          // keeps any pipe we gave them open, which would make this call wait until the clipboard changes.
          const proc = Bun.spawnSync(cmd, { stdin: inputBuf, stdout: "ignore", stderr: "ignore" });
          if (proc.exitCode === 0) return true;
        } catch {}
      }
    }
  } catch {}
  return false;
}

/** Cross-platform clipboard read (macOS pbpaste, Windows Get-Clipboard, Linux wl-paste/xclip). Returns empty string on failure. */
export function readClipboardSync(): string {
  try {
    if (process.platform === "darwin") {
      const proc = Bun.spawnSync(["pbpaste"]);
      if (proc.exitCode === 0) return proc.stdout.toString();
    } else if (process.platform === "win32") {
      const proc = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", "Get-Clipboard"]);
      if (proc.exitCode === 0) return proc.stdout.toString().replace(/\r\n/g, "\n");
    } else {
      const candidates: string[][] = [
        ["wl-paste"],
        ["xclip", "-selection", "clipboard", "-o"],
        ["xsel", "--clipboard", "--output"],
      ];
      for (const cmd of candidates) {
        try {
          const proc = Bun.spawnSync(cmd);
          if (proc.exitCode === 0) return proc.stdout.toString();
        } catch {}
      }
    }
  } catch {}
  return "";
}
