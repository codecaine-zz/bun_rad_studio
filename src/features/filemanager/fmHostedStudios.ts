/**
 * The API Studio, the App Bundler and the Environment Studio, shown inside the File Manager.
 *
 * They are SimpleGUI apps (the same programs that open their own window when started alone). Here each one runs in
 * this program and its page is shown in a frame, through the bridge in src/simplegui_host.ts.
 *
 * Who can reach one:
 *   - `studios/open` is an ordinary API call, so it needs the session token that only the File Manager page has.
 *     It starts a fresh window and returns that window's own secret.
 *   - The frame's page and its WebSocket are only served on the *other* loopback spelling (a separate origin, like the
 *     calculator), and only to someone who knows the secret. The socket also needs an Origin equal to its own address.
 *   - They stop with the File Manager (ctx.disposers) and a tool can be closed from the page.
 */
import type { SimpleWindow } from "../../simplegui";
import { createHostedHub, hostedPage, type HostedHub, type HostedSession } from "../../simplegui_host";
import type { FmContext, FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";

export interface HostedStudioInfo {
  id: string;
  title: string;
  icon: string;
  note: string;
  /** Loads the app's code only when the tool is first opened, so the File Manager starts as fast as before. */
  create: () => Promise<SimpleWindow>;
}

export const HOSTED_STUDIOS: Record<string, HostedStudioInfo> = {
  api: {
    id: "api", title: "API Studio", icon: "🛰️",
    note: "Send HTTP and REST requests, import cURL commands, inspect responses and export them.",
    create: async () => (await import("../../../applications/api_studio")).createApiStudio({ fullscreen: false }),
  },
  bundler: {
    id: "bundler", title: "App Bundler", icon: "📦",
    note: "Bundle a Bun project into a single file, a standalone program or a macOS .app.",
    create: async () => (await import("../../../applications/app_bundler_studio")).createAppBundlerStudio({ fullscreen: false }),
  },
  env: {
    id: "env", title: "Env Studio", icon: "🔑",
    note: "Edit .env files: find duplicates and mistakes, compare with an example, and keep secrets masked.",
    create: async () => (await import("../../../applications/env_studio")).createEnvStudio({ fullscreen: false }),
  },
};

const hubs = new WeakMap<FmContext, HostedHub>();

export function hubOf(ctx: FmContext): HostedHub {
  let hub = hubs.get(ctx);
  if (!hub) {
    hub = createHostedHub(HOSTED_LIMIT);
    hubs.set(ctx, hub);
    const own = hub;
    ctx.disposers.push(() => own.closeAll());
  }
  return hub;
}

const HOSTED_LIMIT = 6;

const isStudioId = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(HOSTED_STUDIOS, id);

export const hostedStudioOperations: Record<string, FmHandler> = {
  async "studios/list"() {
    return { studios: Object.values(HOSTED_STUDIOS).map(({ id, title, icon, note }) => ({ id, title, icon, note })) };
  },
  async "studios/open"(ctx, b) {
    if (!isStudioId(b.id)) throw new FmError("BAD_REQUEST", "That tool doesn't exist.");
    const info = HOSTED_STUDIOS[b.id]!;
    let win: SimpleWindow;
    try {
      win = await info.create();
    } catch (err: any) {
      throw new FmError("STUDIO_FAILED", `${info.title} couldn't start: ${String(err?.message ?? err).split("\n")[0]}`);
    }
    try {
      const session = hubOf(ctx).open(info.id, () => win);
      return { id: info.id, title: info.title, secret: session.secret };
    } catch (err: any) {
      throw new FmError("STUDIO_FAILED", String(err?.message ?? err));
    }
  },
  async "studios/close"(ctx, b) {
    if (isStudioId(b.id)) hubOf(ctx).close(b.id);
    return {};
  },
};

/** Constant-time-ish secret check (secrets are random 32-character strings; length differences are not secret). */
function secretMatches(given: string | null, session: HostedSession): boolean {
  if (!given || given.length !== session.secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ session.secret.charCodeAt(i);
  return diff === 0;
}

/** The frame's Content-Security-Policy: the app's own inline code and styles, a socket back to this server, nothing else. */
export function hostedCsp(host: string, parentOrigin: string | null): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    `connect-src ws://${host}`,
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${parentOrigin ?? "'none'"}`,
  ].join("; ");
}

export function hostedSocketPath(id: string): string {
  return `/app/hostedws/${id}`;
}

/** The page of a running tool, or a short refusal. `secret` comes from the frame's address. */
export function hostedPageResponse(ctx: FmContext, id: string, secret: string | null, host: string, parentOrigin: string | null, headers: (extra: Record<string, string>) => Record<string, string>): Response {
  const session = isStudioId(id) ? hubOf(ctx).get(id) : undefined;
  if (!session || !secretMatches(secret, session)) return new Response("Not Found", { status: 404, headers: headers({}) });
  const html = hostedPage(session, `ws://${host}${hostedSocketPath(id)}?s=${encodeURIComponent(session.secret)}`);
  return new Response(html, { headers: headers({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": hostedCsp(host, parentOrigin) }) });
}

/** The session a WebSocket may attach to, when it knows the secret; null otherwise. */
export function hostedSessionFor(ctx: FmContext, id: string, secret: string | null): HostedSession | null {
  const session = isStudioId(id) ? hubOf(ctx).get(id) : undefined;
  return session && secretMatches(secret, session) ? session : null;
}
