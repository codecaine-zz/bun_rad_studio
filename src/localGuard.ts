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
  const candidates: string[][] =
    process.platform === "darwin"
      ? [["pbcopy"]]
      : process.platform === "win32"
        ? [["clip"]]
        : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];
  for (const cmd of candidates) {
    try {
      const proc = Bun.spawn(cmd, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      proc.stdin.write(text);
      proc.stdin.end();
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}
