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
import { basename, dirname, join } from "path";
import type { SimpleWindow } from "../../simplegui";
import { createHostedHub, hostedPage, type HostedHub, type HostedSession } from "../../simplegui_host";
import type { FmContext, FmHandler } from "./fmCore";
import { realLayout, type StudioCommand, type StudioLayout } from "./fmDbHooks";
import { dbState } from "./fmDbState";
import { FmError } from "./fmPaths";
import { openQrUrl } from "./fmQr";

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

export interface ToolWindowInfo {
  id: string;
  title: string;
  script: string;
  args?: string[];
}

export const TOOL_WINDOW_APPS: Record<string, ToolWindowInfo> = {
  paint: { id: "paint", title: "Paint Studio", script: "paint_studio" },
  calc: { id: "calc", title: "Calculator", script: "calculator_studio" },
  timer: { id: "timer", title: "Timer & Alarms", script: "interval_timer_studio" },
  api: { id: "api", title: "API Studio", script: "api_studio" },
  bundler: { id: "bundler", title: "App Bundler", script: "app_bundler_studio" },
  env: { id: "env", title: "Env Studio", script: "env_studio" },
  find: { id: "find", title: "Find & Replace", script: "fd_studio" },
  sd: { id: "sd", title: "Replace Text", script: "sd_studio" },
  code: { id: "code", title: "Code Studio", script: "code_studio" },
  dev: { id: "dev", title: "Developer Tools", script: "devtools_studio" },
  watch: { id: "watch", title: "System Watch", script: "watchexec_studio" },
  crypto: { id: "crypto", title: "Checksums & Passwords", script: "crypto_studio" },
  ip: { id: "ip", title: "IP Lookup", script: "ipinfo_studio" },
  net: { id: "net", title: "Network Check", script: "network_studio" },
  subs: { id: "subs", title: "Subdomains", script: "subfinder_studio" },
  player: { id: "player", title: "Media Player", script: "media_player_studio" },
  databases: { id: "databases", title: "Databases", script: "file_manager_studio", args: ["--tool", "databases", "--max"] },
  grave: { id: "grave", title: "Graveyard", script: "rip_studio" },
  cliutils: { id: "cliutils", title: "CLI Utilities", script: "file_manager_studio", args: ["--tool", "cliutils", "--max"] },
  imagestudio: { id: "imagestudio", title: "Picture Tools", script: "file_manager_studio", args: ["--tool", "imagestudio", "--max"] },
  mediastudio: { id: "mediastudio", title: "Audio & Video", script: "file_manager_studio", args: ["--tool", "mediastudio", "--max"] },
  compare: { id: "compare", title: "Compare Folders", script: "file_manager_studio", args: ["--tool", "compare", "--max"] },
  projects: { id: "projects", title: "Projects", script: "file_manager_studio", args: ["--tool", "projects", "--max"] },
  actions: { id: "actions", title: "Batch Convert", script: "file_manager_studio", args: ["--tool", "actions", "--max"] },
  serve: { id: "serve", title: "Share This Folder", script: "file_manager_studio", args: ["--tool", "serve", "--max"] },
  vault: { id: "vault", title: "Locked Files", script: "file_manager_studio", args: ["--tool", "vault", "--max"] },
  secrets: { id: "secrets", title: "Secret Check", script: "file_manager_studio", args: ["--tool", "secrets", "--max"] },
  downloads: { id: "downloads", title: "Clean Up Downloads", script: "file_manager_studio", args: ["--tool", "downloads", "--max"] },
  qr: { id: "qr", title: "QR Code", script: "file_manager_studio", args: ["--tool", "qr", "--max"] },
  games: { id: "games", title: "Codecaine Games Arcade", script: "file_manager_studio", args: ["--tool", "games", "--max"] },
  balatro: { id: "balatro", title: "Codecaine Joker Royale (Balatro Deluxe)", script: "balatro_studio" },
  blackjack: { id: "blackjack", title: "Codecaine Blackjack Royale VIP", script: "blackjack_studio" },
  breakout: { id: "breakout", title: "Codecaine Cyber Breakout Deluxe", script: "breakout_studio" },
  codecaine_bros: { id: "codecaine_bros", title: "Codecaine Bros. Arcade", script: "codecaine_bros_studio" },
  connect4: { id: "connect4", title: "Codecaine Cyberpunk Connect 4", script: "connect4_studio" },
  dr_codecaine: { id: "dr_codecaine", title: "Codecaine Dr. Codecaine Arcade", script: "dr_codecaine_studio" },
  flappy_bird: { id: "flappy_bird", title: "Codecaine Flappy Bird Deluxe", script: "flappy_bird_studio" },
  frogger: { id: "frogger", title: "Codecaine CyberFrog Deluxe", script: "frogger_studio" },
  lolo: { id: "lolo", title: "Codecaine Adventures of Lolo Remaster", script: "lolo_studio" },
  math_munchers: { id: "math_munchers", title: "Codecaine Math Munchers Deluxe", script: "math_munchers_studio" },
  maze_generator: { id: "maze_generator", title: "Codecaine Cyberpunk Maze Runner", script: "maze_generator_studio" },
  minesweeper: { id: "minesweeper", title: "Codecaine Minesweeper Pro Championship", script: "minesweeper_studio" },
  pacman: { id: "pacman", title: "Codecaine Cyberpunk Pac-Man Arcade", script: "pacman_studio" },
  poker: { id: "poker", title: "Codecaine Texas Hold'em & 5-Card Draw Poker Royale", script: "poker_studio" },
  pong: { id: "pong", title: "Codecaine Neon Cyber Pong", script: "pong_studio" },
  rat_screw: { id: "rat_screw", title: "Codecaine Egyptian Rat Screw Royale", script: "rat_screw_studio" },
  rodents_revenge: { id: "rodents_revenge", title: "Codecaine Rodent's Revenge Deluxe", script: "rodents_revenge_studio" },
  skifree: { id: "skifree", title: "Codecaine SkiFree Deluxe", script: "skifree_studio" },
  snake: { id: "snake", title: "Codecaine Neon Snake Deluxe", script: "snake_studio" },
  tetris: { id: "tetris", title: "Codecaine Tetris Ultra Deluxe", script: "tetris_studio" },
  tictactoe: { id: "tictactoe", title: "Codecaine Neon Tic-Tac-Toe Arcade", script: "tictactoe_studio" },
  typing: { id: "typing", title: "Codecaine CyberType Deluxe", script: "typing_studio" },
  word_search: { id: "word_search", title: "Codecaine Neon Word Search Labyrinth", script: "word_search_studio" },
  yahtzee: { id: "yahtzee", title: "Codecaine Yahtzee Royale Deluxe", script: "yahtzee_studio" },
};

const dashed = (s: string) => s.replace(/_/g, "-");

export function resolveToolWindowCommand(script: string, layout: StudioLayout = realLayout()): StudioCommand | null {
  const bundle = `${dashed(script)}.js`;
  const argvDir = layout.argv1 ? dirname(layout.argv1) : "";
  const run = (exe: string, file: string, kind: StudioCommand["kind"]): StudioCommand => ({ kind, where: file, build: (bunArgs, studioArgs) => [exe, ...bunArgs, file, ...studioArgs] });

  if (argvDir && layout.exists(join(argvDir, bundle))) return run(layout.execPath, join(argvDir, bundle), "bundle");

  const m = /^(.*\.app)\/Contents\/Resources\/app$/.exec(argvDir.replace(/\\/g, "/"));
  if (m) {
    const holder = dirname(m[1]!);
    for (const name of layout.readdir(holder)) {
      if (!name.endsWith(".app")) continue;
      const res = join(holder, name, "Contents", "Resources");
      const file = join(res, "app", bundle);
      const runtime = join(res, "runtime", "bun");
      if (layout.exists(file) && layout.exists(runtime)) return run(runtime, file, "app");
    }
  }

  for (const suffix of ["", ".exe"]) {
    const exe = join(dirname(layout.execPath), `${dashed(script)}${suffix}`);
    if (basename(layout.execPath).toLowerCase().replace(/\.exe$/, "") !== dashed(script) && layout.exists(exe)) return { kind: "executable", where: exe, build: (_bunArgs, studioArgs) => [exe, ...studioArgs] };
  }

  for (const dir of [argvDir, join(layout.repoRoot, "applications")]) {
    if (!dir) continue;
    const file = join(dir, `${script}.ts`);
    if (layout.exists(file)) return run(layout.execPath, file, "dev");
  }
  return null;
}

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
const isToolWindowId = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(TOOL_WINDOW_APPS, id);

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
  async "studios/window"(ctx, b) {
    if (!isToolWindowId(b.id)) throw new FmError("BAD_REQUEST", "That tool doesn't exist.");
    const info = TOOL_WINDOW_APPS[b.id]!;
    const st = dbState(ctx);
    let command = resolveToolWindowCommand(info.script);
    let studioArgs = [...(info.args ?? [])];
    let usingFmFallback = info.script === "file_manager_studio";
    if (!command && info.script !== "file_manager_studio") {
      command = resolveToolWindowCommand("file_manager_studio");
      if (command) {
        usingFmFallback = true;
        studioArgs = info.title.startsWith("Codecaine ")
          ? ["--tool", "games", "--game", info.id, "--max"]
          : ["--tool", info.id, "--max"];
      }
    }
    if (!command) throw new FmError("NOT_AVAILABLE", `${info.title} isn't part of this copy of the program, so it can't be opened in its own window.`);
    const rawEnv = st.hooks.env();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawEnv)) {
      if (typeof v === "string" && k !== "STUDIO_PARENT_PID") env[k] = v;
    }
    if (usingFmFallback && typeof b.path === "string" && b.path.trim()) {
      studioArgs.push("--path", b.path.trim());
    }
    const result = await st.hooks.spawnWindow(command.build([], studioArgs), { env, cwd: st.hooks.cwd() });
    if (!result.ok) throw new FmError("OPEN_FAILED", result.reason);
    return { opened: true, id: info.id, title: info.title };
  },
  async "studios/browser"(ctx, b) {
    if (typeof b.url !== "string" || !b.url.trim()) throw new FmError("BAD_REQUEST", "Choose a web address to open.");
    return await openQrUrl(ctx, b.url);
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
