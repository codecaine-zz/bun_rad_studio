/**
 * The page a studio is shown in. The File Manager's own page may only frame its other loopback address, and a
 * studio listens on a port that isn't known when that page is sent. So the page frames this small document instead
 * (on the other loopback address, a separate site from the File Manager that can't reach its token), and this
 * document, built for one running studio, frames exactly that studio's address: its policy allows no other.
 */
import { randomBytes } from "crypto";
import type { StudioManager } from "./fmDbStudios";

const escapeAttr = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The sandbox flags a studio needs, each for a reason (the studios are full web apps). */
/** What the studio page may ask the browser for: copying results. Not full screen: leaving a browser full screen takes the Esc key, which the studios use for their own things. */
export const STUDIO_ALLOW = "clipboard-write";

export const STUDIO_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads";

export function studioFrameResponse(studios: StudioManager, id: string, primaryOrigin: string | null, headers: (extra: Record<string, string>) => Record<string, string>): Response {
  const info = studios.get(id);
  const port = studios.runningPort(id);
  const ancestors = primaryOrigin ?? "'none'";
  const nonce = randomBytes(16).toString("base64");
  if (!info || !port) {
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; frame-ancestors ${ancestors}`;
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Studio not running</title><style nonce="${nonce}">body{font:15px system-ui,sans-serif;margin:2em;color:#444}</style></head><body><p>This studio isn't running. Start it again from the Databases tab.</p></body></html>`;
    return new Response(body, { status: 404, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp }) });
  }
  const origin = `http://127.0.0.1:${port}`;
  const csp = `default-src 'none'; style-src 'nonce-${nonce}'; frame-src ${origin}; frame-ancestors ${ancestors}`;
  const title = escapeAttr(info.title);
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style nonce="${nonce}">html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="${title}" src="${origin}/" sandbox="${STUDIO_SANDBOX}" allow="${STUDIO_ALLOW}" referrerpolicy="no-referrer"></iframe></body></html>`;
  return new Response(body, { headers: headers({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp }) });
}
