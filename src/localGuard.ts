/**
 * Loopback request security guard and cross-platform clipboard utilities for local studio HTTP servers.
 */

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
function extractLoopbackHostname(rawHost: string): string | null {
  const host = rawHost.trim().toLowerCase();
  if (!host) return null;
  let hostname = "";
  if (host.startsWith("[")) {
    const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(host);
    if (!m) return null;
    hostname = m[1]!;
  } else {
    const firstColon = host.indexOf(":");
    const lastColon = host.lastIndexOf(":");
    if (firstColon !== -1 && firstColon !== lastColon) {
      // Unbracketed IPv6 literal (no port suffix), e.g. "::1" or "::ffff:127.0.0.1".
      hostname = host;
    } else {
      const m = /^([^:]+)(?::(\d+))?$/.exec(host);
      if (!m) return null;
      hostname = m[1]!;
    }
  }
  if (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname === "::ffff:127.0.0.1"
  ) {
    return host;
  }
  return null;
}

export function guardLocalRequest(req: Request): Response | null {
  let rawHost = req.headers.get("host");
  if (
    rawHost === null &&
    !req.headers.has("host") &&
    req.headers.get("x-workbench-token") &&
    /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(req.url)
  ) {
    try {
      rawHost = new URL(req.url).host;
    } catch {}
  }
  const host = rawHost !== null ? extractLoopbackHostname(rawHost) : null;
  if (!host) {
    return new Response("Forbidden: non-loopback Host header", { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin) {
    const normOrigin = origin.trim().toLowerCase();
    const expectedOrigin =
      host.includes(":") &&
      !host.startsWith("[") &&
      host.indexOf(":") !== host.lastIndexOf(":")
        ? `http://[${host}]`
        : `http://${host}`;
    if (normOrigin !== expectedOrigin) {
      return new Response("Forbidden: cross-origin request blocked", {
        status: 403,
      });
    }
  }
  const fetchSite = (req.headers.get("sec-fetch-site") || "")
    .trim()
    .toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://127.0.0.1").pathname;
    } catch {}
    const isSafeMethod = req.method === "GET" || req.method === "HEAD";
    const isEmbeddedAppRoute = isSafeMethod && pathname.startsWith("/app/");
    const isSafePageOrStaticGet = isSafeMethod && !pathname.startsWith("/api/");
    if (!isEmbeddedAppRoute && !isSafePageOrStaticGet) {
      return new Response("Forbidden: cross-site request blocked", {
        status: 403,
      });
    }
  }
  return null;
}

/** Cross-platform clipboard write (macOS pbcopy, Windows clip, Linux wl-copy/xclip). Returns false on failure. */
export function writeClipboardSync(text: string): boolean {
  try {
    const inputBuf = Buffer.from(text, "utf8");
    if (process.platform === "darwin") {
      const proc = Bun.spawnSync(["pbcopy"], {
        stdin: inputBuf,
        timeout: 3000,
      });
      return proc.exitCode === 0;
    } else if (process.platform === "win32") {
      if (text.length > 0 && /^[\t\r\n\x20-\x7e]+$/.test(text)) {
        const clip = Bun.spawnSync(["clip"], {
          stdin: inputBuf,
          timeout: 3000,
        });
        if (clip.exitCode === 0) return true;
      }
      // PowerShell and clip read a pipe in the console's old code page, which garbles accents and other Unicode.
      // So PowerShell gets base64 (plain ASCII) and decodes it itself; clip understands UTF-16 with a byte-order mark.
      const ps = Bun.spawnSync(
        [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$b = [Console]::In.ReadToEnd().Trim(); Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))",
        ],
        {
          stdin: Buffer.from(inputBuf.toString("base64"), "ascii"),
          timeout: 3000,
        },
      );
      if (ps.exitCode === 0) return true;
      const clip = Bun.spawnSync(["clip"], {
        stdin: Buffer.from(`\ufeff${text}`, "utf16le"),
        timeout: 3000,
      });
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
          const proc = Bun.spawnSync(cmd, {
            stdin: inputBuf,
            stdout: "ignore",
            stderr: "ignore",
            timeout: 3000,
          });
          if (proc.exitCode === 0) return true;
        } catch {}
      }
    }
  } catch {}
  return false;
}

/** Cross-platform clipboard read (macOS pbpaste, Windows Get-Clipboard, Linux wl-paste/xclip/xsel). Returns null when no clipboard tool succeeded. */
export function readClipboardTextSync(): string | null {
  try {
    if (process.platform === "darwin") {
      const proc = Bun.spawnSync(["pbpaste"], { timeout: 3000 });
      if (proc.exitCode === 0) return proc.stdout.toString();
    } else if (process.platform === "win32") {
      const proc = Bun.spawnSync(
        [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $t = Get-Clipboard -Raw; if ($null -ne $t) { [Console]::Out.Write($t) }",
        ],
        { timeout: 3000 },
      );
      if (proc.exitCode === 0)
        return proc.stdout.toString().replace(/\r\n/g, "\n");
    } else {
      const candidates: string[][] = [
        ["wl-paste", "--no-newline"],
        ["xclip", "-selection", "clipboard", "-o"],
        ["xsel", "--clipboard", "--output"],
      ];
      for (const cmd of candidates) {
        try {
          const proc = Bun.spawnSync(cmd, { timeout: 3000 });
          if (proc.exitCode === 0) return proc.stdout.toString();
        } catch {}
      }
    }
  } catch {}
  return null;
}

/** Cross-platform clipboard read (macOS pbpaste, Windows Get-Clipboard, Linux wl-paste/xclip). Returns empty string on failure. */
export function readClipboardSync(): string {
  return readClipboardTextSync() ?? "";
}
