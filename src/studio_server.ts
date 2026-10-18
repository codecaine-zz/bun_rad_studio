/**
 * Shared local web server for studios that are a single web page plus static assets (the games and similar).
 *
 * Every such studio used to carry its own copy of this code. One copy means a security fix, such as the
 * loopback guard (D-012), is made once.
 *
 * Behavior, unchanged from the copies it replaces:
 *   - binds to 127.0.0.1 by default and refuses foreign Host or Origin headers (`guardLocalRequest`)
 *   - `/` and `/index.html` serve the page produced by `generateHtml()`
 *   - `/favicon.svg` and any other file are served from `assetsDir`, never from outside it
 *   - `/api/health` reports `{ status, app, name, version, timestamp }`
 */
import { existsSync } from "fs";
import { join } from "path";
import { guardLocalRequest } from "./localGuard";

export interface StudioServerOptions {
  /** 0 (the default) lets the system pick a free port. */
  port?: number;
  /** Defaults to 127.0.0.1. */
  host?: string;
}

export interface StaticStudioConfig {
  /** Machine name reported by /api/health, for example "pong_studio". */
  app: string;
  /** Display name reported by /api/health. */
  name: string;
  version: string;
  /** Folder that holds index.html, favicon.svg and the other assets. */
  assetsDir: string;
  /** Produces the page for `/`; called on every request. */
  generateHtml: () => string;
}

export function startStaticStudioServer(config: StaticStudioConfig, options: StudioServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const { assetsDir } = config;

  return Bun.serve({
    port,
    hostname: host,
    fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

      const url = new URL(req.url);
      const pathname = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (pathname === "/" || pathname === "/index.html") {
        return new Response(config.generateHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (pathname === "/favicon.svg") {
        const filePath = join(assetsDir, "favicon.svg");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
      }

      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: config.app,
            name: config.name,
            version: config.version,
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // Static file, only from inside the assets folder.
      const sanitized = pathname.replace(/^\/+/, "");
      const directCandidate = join(assetsDir, sanitized);
      if (directCandidate !== assetsDir && !directCandidate.startsWith(assetsDir + "/") && !directCandidate.startsWith(assetsDir + "\\")) {
        return new Response("Forbidden", { status: 403 });
      }
      if (existsSync(directCandidate)) {
        return new Response(Bun.file(directCandidate), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });
}
