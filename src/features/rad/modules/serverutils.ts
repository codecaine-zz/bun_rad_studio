/**
 * High-performance HTTP server, parameterized URL router, path-traversal-safe static file server,
 * and topic-based WebSocket pub/sub hub powered by `Bun.serve`.
 */
// Feature: RAD - serverutils
// High-performance HTTP server, router, static file serving, and WebSocket hub powered by Bun.serve
import { join, resolve, sep } from "node:path";
import type { Server, ServerWebSocket } from "bun";

/**
 * Standard request handler signature compatible with `Bun.serve`.
 */
export type HttpHandler = (req: Request, server: Server<any>) => Response | Promise<Response>;

/**
 * Internal route definition pairing an HTTP method and compiled URL pattern with a request handler.
 */
export interface RouteEntry {
  method: string;
  pattern: RegExp;
  handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>;
}

/**
 * Fluent HTTP router supporting parameterized path patterns (e.g., `"/users/:id"`) and method dispatch.
 */
export interface HttpRouter {
  get(path: string, handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>): HttpRouter;
  post(path: string, handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>): HttpRouter;
  put(path: string, handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>): HttpRouter;
  delete(path: string, handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>): HttpRouter;
  handle(req: Request, server: Server<any>): Promise<Response>;
}

// Doer: Convert URL path pattern (e.g. "/users/:id") to RegExp with parameter matching
function pathToRegex(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), keys };
}

// Coordinator: Create lightweight route registry
/**
 * Creates a lightweight {@link HttpRouter} instance for registering `GET`, `POST`, `PUT`, and `DELETE` routes.
 */
export function createRouter(): HttpRouter {
  const routes: RouteEntry[] = [];

  function addRoute(method: string, path: string, handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>) {
    const { regex, keys } = pathToRegex(path);
    routes.push({
      method: method.toUpperCase(),
      pattern: regex,
      handler: (req, _, server) => {
        const url = new URL(req.url);
        const match = url.pathname.match(regex);
        const params: Record<string, string> = {};
        if (match) {
          keys.forEach((k, idx) => {
            params[k] = match[idx + 1] ?? "";
          });
        }
        return handler(req, params, server);
      },
    });
  }

  const router: HttpRouter = {
    get(path, handler) {
      addRoute("GET", path, handler);
      return router;
    },
    post(path, handler) {
      addRoute("POST", path, handler);
      return router;
    },
    put(path, handler) {
      addRoute("PUT", path, handler);
      return router;
    },
    delete(path, handler) {
      addRoute("DELETE", path, handler);
      return router;
    },
    async handle(req, server) {
      const url = new URL(req.url);
      const method = req.method.toUpperCase();

      for (const route of routes) {
        if (route.method === method && route.pattern.test(url.pathname)) {
          return route.handler(req, {}, server);
        }
      }
      return new Response("Not Found", { status: 404 });
    },
  };

  return router;
}

/**
 * Options for starting an HTTP server via {@link serveHttp}.
 */
export interface ServeOptions {
  port?: number;
  hostname?: string;
  fetch?: (req: Request, server: Server<any>) => Response | Promise<Response>;
  router?: HttpRouter;
}

/**
 * Handle to a running `Bun.serve` HTTP server with bound address metadata and lifecycle control.
 */
export interface ServerInstance {
  port: number;
  hostname: string;
  url: string;
  stop: (closeActiveConnections?: boolean) => void;
  raw: Server<any>;
}

// Coordinator: Launch HTTP server with router or custom fetch handler
/**
 * Starts a `Bun.serve` HTTP server dispatched through a custom `fetch` handler or an {@link HttpRouter}.
 */
export function serveHttp(options: ServeOptions = {}): ServerInstance {
  const fetchHandler = options.fetch ?? (options.router ? options.router.handle : () => new Response("OK"));
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "localhost",
    fetch: fetchHandler,
  });

  return {
    port: server.port ?? 0,
    hostname: server.hostname ?? options.hostname ?? "localhost",
    url: `http://${server.hostname ?? options.hostname ?? "localhost"}:${server.port}`,
    stop: (closeActiveConnections = true) => server.stop(closeActiveConnections),
    raw: server,
  };
}

/**
 * Configuration for serving static files from a local directory via {@link serveStatic}.
 */
export interface StaticServerOptions {
  dir: string;
  port?: number;
  /** Defaults to "127.0.0.1" so a directory is not published to the network by accident; pass "0.0.0.0" to do that on purpose. */
  hostname?: string;
  spaFallback?: boolean;
}

// Coordinator: Launch zero-config static file server
/**
 * Starts a path-traversal-safe static file server rooted at `options.dir`, with optional SPA `index.html` fallback.
 */
export function serveStatic(options: StaticServerOptions): ServerInstance {
  const rootDir = resolve(options.dir);
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      let decodedPath = url.pathname;
      try {
        decodedPath = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      if (decodedPath.includes("\0")) return new Response("Bad Request", { status: 400 });
      const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
      const filePath = resolve(rootDir, relativePath);
      if (filePath !== rootDir && !filePath.startsWith(rootDir + sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file);
      }

      if (options.spaFallback) {
        const fallback = Bun.file(join(rootDir, "index.html"));
        if (await fallback.exists()) {
          return new Response(fallback);
        }
      }

      return new Response("File Not Found", { status: 404 });
    },
  });

  return {
    port: server.port ?? 0,
    hostname: server.hostname ?? "localhost",
    url: `http://${server.hostname ?? "localhost"}:${server.port}`,
    stop: (closeActiveConnections = true) => server.stop(closeActiveConnections),
    raw: server,
  };
}

/**
 * Options for launching a topic-based WebSocket pub/sub server via {@link createWsHub}.
 */
export interface WsHubOptions {
  port?: number;
  /** Defaults to "127.0.0.1"; pass "0.0.0.0" to accept connections from other machines. */
  hostname?: string;
  onMessage?: (ws: ServerWebSocket<any>, message: string | Buffer) => void;
  onError?: (ws: ServerWebSocket<any>, error: Error) => void;
}

/**
 * Running WebSocket pub/sub hub supporting topic broadcasting and graceful shutdown.
 */
export interface WebSocketHub {
  port: number;
  url: string;
  broadcast(topic: string, data: string | object): void;
  stop: () => void;
  raw: Server<any>;
}

// Coordinator: Launch WebSocket broadcast and pub/sub hub
/**
 * Starts a WebSocket pub/sub hub where clients subscribe to a `?topic=` query parameter and receive
 * messages published via `hub.broadcast(topic, data)`.
 */
export function createWsHub(options: WsHubOptions = {}): WebSocketHub {
  const bindHost = options.hostname ?? "127.0.0.1";
  const isLoopback = bindHost === "127.0.0.1" || bindHost === "localhost" || bindHost === "::1";
  const server = Bun.serve<{ topic: string }>({
    port: options.port ?? 0,
    hostname: bindHost,
    fetch(req, s) {
      if (isLoopback) {
        const origin = req.headers.get("origin");
        if (origin && origin !== "null") {
          try {
            const originHost = new URL(origin).hostname.toLowerCase();
            if (originHost !== "127.0.0.1" && originHost !== "localhost" && originHost !== "::1" && originHost !== "[::1]") {
              return new Response("Forbidden: cross-origin WebSocket blocked", { status: 403 });
            }
          } catch {
            return new Response("Forbidden: invalid Origin", { status: 403 });
          }
        }
      }
      const url = new URL(req.url);
      const topic = url.searchParams.get("topic") ?? "default";
      const success = s.upgrade(req, { data: { topic } });
      if (success) return;
      return new Response("Upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws) {
        const data = ws.data;
        ws.subscribe(data.topic);
      },
      message(ws, msg) {
        if (options.onMessage) {
          options.onMessage(ws, msg);
        }
      },
      close(ws) {
        const data = ws.data;
        ws.unsubscribe(data.topic);
      },
      error(error, ws) {
        if (options.onError) {
          options.onError(ws, error);
        }
      },
    },
  });

  return {
    port: server.port ?? 0,
    url: `ws://${server.hostname}:${server.port}`,
    broadcast(topic: string, data: string | object) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      server.publish(topic, payload);
    },
    stop: () => server.stop(true),
    raw: server,
  };
}

/**
 * Namespace bundling HTTP server, router, static file server, and WebSocket hub utilities.
 */
export const serverutils = {
  createRouter,
  serveHttp,
  serveStatic,
  createWsHub,
};
