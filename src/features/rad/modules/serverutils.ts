// Feature: RAD - serverutils
// High-performance HTTP server, router, static file serving, and WebSocket hub powered by Bun.serve
import { join } from "node:path";
import type { Server, ServerWebSocket } from "bun";

export type HttpHandler = (req: Request, server: Server<any>) => Response | Promise<Response>;

export interface RouteEntry {
  method: string;
  pattern: RegExp;
  handler: (req: Request, params: Record<string, string>, server: Server<any>) => Response | Promise<Response>;
}

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

export interface ServeOptions {
  port?: number;
  hostname?: string;
  fetch?: (req: Request, server: Server<any>) => Response | Promise<Response>;
  router?: HttpRouter;
}

export interface ServerInstance {
  port: number;
  hostname: string;
  url: string;
  stop: (closeActiveConnections?: boolean) => void;
  raw: Server<any>;
}

// Coordinator: Launch HTTP server with router or custom fetch handler
export function serveHttp(options: ServeOptions = {}): ServerInstance {
  const fetchHandler = options.fetch ?? (options.router ? options.router.handle : () => new Response("OK"));
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "localhost",
    fetch: fetchHandler,
  });

  return {
    port: server.port ?? 0,
    hostname: server.hostname,
    url: `http://${server.hostname}:${server.port}`,
    stop: (closeActiveConnections = true) => server.stop(closeActiveConnections),
    raw: server,
  };
}

export interface StaticServerOptions {
  dir: string;
  port?: number;
  spaFallback?: boolean;
}

// Coordinator: Launch zero-config static file server
export function serveStatic(options: StaticServerOptions): ServerInstance {
  const server = Bun.serve({
    port: options.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = join(options.dir, relativePath);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file);
      }

      if (options.spaFallback) {
        const fallback = Bun.file(join(options.dir, "index.html"));
        if (await fallback.exists()) {
          return new Response(fallback);
        }
      }

      return new Response("File Not Found", { status: 404 });
    },
  });

  return {
    port: server.port ?? 0,
    hostname: server.hostname,
    url: `http://${server.hostname}:${server.port}`,
    stop: (closeActiveConnections = true) => server.stop(closeActiveConnections),
    raw: server,
  };
}

export interface WsHubOptions {
  port?: number;
  onMessage?: (ws: ServerWebSocket<any>, message: string | Buffer) => void;
}

export interface WebSocketHub {
  port: number;
  url: string;
  broadcast(topic: string, data: string | object): void;
  stop: () => void;
  raw: Server<any>;
}

// Coordinator: Launch WebSocket broadcast and pub/sub hub
export function createWsHub(options: WsHubOptions = {}): WebSocketHub {
  const server = Bun.serve({
    port: options.port ?? 0,
    fetch(req, s) {
      const url = new URL(req.url);
      const topic = url.searchParams.get("topic") ?? "default";
      const success = s.upgrade(req, { data: { topic } });
      if (success) return;
      return new Response("Upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws) {
        const data = ws.data as { topic: string };
        ws.subscribe(data.topic);
      },
      message(ws, msg) {
        if (options.onMessage) {
          options.onMessage(ws, msg);
        }
      },
      close(ws) {
        const data = ws.data as { topic: string };
        ws.unsubscribe(data.topic);
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

export const serverutils = {
  createRouter,
  serveHttp,
  serveStatic,
  createWsHub,
};
