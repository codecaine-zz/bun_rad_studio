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
import { existsSync, realpathSync, statSync } from "fs";
import { join, resolve, sep } from "path";
import { guardLocalRequest } from "./localGuard";
import { injectGameMasterFx } from "./shared/gameMasterFx";

/** Network binding options for starting a local static studio HTTP server. */
export interface StudioServerOptions {
  /** 0 (the default) lets the system pick a free port. */
  port?: number;
  /** Defaults to 127.0.0.1. */
  host?: string;
}

/** Configuration describing a static studio's metadata, asset directory, and HTML generator. */
export interface StaticStudioConfig {
  /** Machine name reported by /api/health, for example "pong_studio". */
  app: string;
  /** Display name reported by /api/health. */
  name: string;
  version: string;
  /** Folder that holds index.html, favicon.svg and the other assets. */
  assetsDir: string;
  /** Produces the page for `/`; memoized unless `cacheHtml: false`. */
  generateHtml: () => string;
  /** Set to false when `generateHtml` produces dynamic per-request markup. Defaults to true. */
  cacheHtml?: boolean;
}

/** Starts a local Bun HTTP server for a static studio with loopback protection and asset serving. */
export function startStaticStudioServer(
  config: StaticStudioConfig,
  options: StudioServerOptions = {},
) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const resolvedAssetsDir = resolve(config.assetsDir);
  const indexAssetPath = join(resolvedAssetsDir, "index.html");
  let canonicalAssetsDir: string | null = null;
  let cachedPageHtml: string | null = null;
  let cachedIndexMtime = -1;

  const getCanonicalRoot = (): string | null => {
    if (canonicalAssetsDir !== null) return canonicalAssetsDir;
    try {
      canonicalAssetsDir = realpathSync(resolvedAssetsDir);
      return canonicalAssetsDir;
    } catch {
      return null;
    }
  };

  const resolveContainedFile = (
    relPath: string,
  ): { status: 200; filePath: string } | { status: 403 | 404 } => {
    const directCandidate = resolve(resolvedAssetsDir, relPath);
    if (
      directCandidate !== resolvedAssetsDir &&
      !directCandidate.startsWith(resolvedAssetsDir + sep)
    ) {
      return { status: 403 };
    }
    if (!existsSync(directCandidate)) {
      return { status: 404 };
    }
    const realRoot = getCanonicalRoot();
    if (!realRoot) {
      return { status: 404 };
    }
    let realTarget: string;
    try {
      realTarget = realpathSync(directCandidate);
    } catch {
      return { status: 404 };
    }
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
      return { status: 403 };
    }
    try {
      if (!statSync(realTarget).isFile()) {
        return { status: 404 };
      }
    } catch {
      return { status: 404 };
    }
    return { status: 200, filePath: realTarget };
  };

  const getRenderedHtml = (): string => {
    if (config.cacheHtml === false) {
      return injectGameMasterFx(config.generateHtml());
    }
    let mtime = 0;
    try {
      mtime = statSync(indexAssetPath).mtimeMs;
    } catch {
      mtime = 0;
    }
    if (cachedPageHtml !== null && mtime === cachedIndexMtime) {
      return cachedPageHtml;
    }
    cachedPageHtml = injectGameMasterFx(config.generateHtml());
    cachedIndexMtime = mtime;
    return cachedPageHtml;
  };

  return Bun.serve({
    port,
    hostname: host,
    fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

      const url = new URL(req.url);
      const rawPathname = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(rawPathname);
      } catch {
        return new Response("Bad Request", {
          status: 400,
          headers: corsHeaders,
        });
      }
      if (pathname.includes("\0")) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      if (pathname === "/" || pathname === "/index.html") {
        return new Response(getRenderedHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      if (pathname === "/favicon.svg") {
        const fav = resolveContainedFile("favicon.svg");
        if (fav.status === 200) {
          return new Response(Bun.file(fav.filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
        if (fav.status === 403) {
          return new Response("Forbidden", {
            status: 403,
            headers: corsHeaders,
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
          { headers: corsHeaders },
        );
      }

      // Static file, only from inside the assets folder.
      if (/^(?:\/|%2f)*(?:\.\.(?:\/|\\|$))/i.test(rawPathname)) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      const sanitized = pathname.replace(/^[/\\]+/, "");
      if (!sanitized) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }
      const resolved = resolveContainedFile(sanitized);
      if (resolved.status === 403) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      if (resolved.status === 200) {
        return new Response(Bun.file(resolved.filePath), {
          headers: corsHeaders,
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });
}
