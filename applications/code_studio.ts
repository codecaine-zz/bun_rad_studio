/**
 * ⚡ NovaCode Studio Pro — Advanced Developer Workstation
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Multi-language developer workstation with syntax highlighting (TS/JS, Python, Rust, Go, HTML, CSS, JSON, Markdown, SQL, Shell, C/C++)
 * - Multi-file tabbed editor with dirty indicators (●), unsaved change tracking, and file lifecycle
 * - Dynamic Workspace File Tree sidebar with directory navigation, new file/folder, rename, delete
 * - Line numbers gutter, active line tracking, code folding, and bookmark indicators
 * - Interactive visual code minimap with draggable viewport indicator and search match highlighting
 * - Real-time Find & Replace drawer supporting regex, match case, whole word, and replace all
 * - Quick Command Palette (Ctrl+P / Cmd+P) for instant file navigation, theme switching, and developer tools
 * - Split Live Preview Pane: GitHub-Flavored Markdown, sandboxed HTML rendering, interactive JSON Tree viewer, and document metrics
 * - Bottom Developer Drawer: Embedded command runner (/api/exec), interactive Regex Sandbox, Diff / Compare tool, and 20+ code Snippets
 * - 6 Developer Themes: One Dark Pro (default), Dracula Modern, Monokai Pro, GitHub Dark Dimmed, Nordic Frost, Solarized Light
 * - Bun backend API for filesystem operations (/api/fs/workspace, /api/fs/read, /api/fs/save, /api/fs/new, /api/fs/delete, /api/fs/rename) and shell command execution (/api/exec)
 */

import { injectHelp } from "../src/shared/helpTips";
import { minify as minifyCode, prettify as prettifyCode } from "../src/shared/code_prettify";
import type { SizeHint, Webview } from "webview-bun";
import { resolve, join, relative, dirname, isAbsolute, sep } from "path";
import { guardLocalRequest } from "../src/localGuard";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync, readdirSync, renameSync, rmSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface CodeStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
  workspaceRoot?: string;
}

export interface CodeStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  port?: number;
  url?: string;
  server?: any;
  webview?: Webview;
  workspaceRoot: string;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

export interface CodeServerOptions {
  port?: number;
  host?: string;
  workspaceRoot?: string;
}

/**
 * Resolves the directory containing the static code editor assets.
 */
export function getCodeEditorAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/code_editor"),
    resolve(process.cwd(), "resources/code_editor"),
    resolve(import.meta.dir, "../../resources/code_editor"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for NovaCode Studio Pro with desktop shortcuts and storage polyfill injected.
 */
export function generateCodeStudioHtml(): string {
  return injectHelp(buildCodeStudioHtml(), "code_studio");
}

function buildCodeStudioHtml(): string {
  const assetsDir = getCodeEditorAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>NovaCode Studio Pro</h1>";

  const storagePolyfill = `
  <script>
    (function() {
      try {
        var k = '__test__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
      } catch(e) {
        var mem = {};
        try {
          Object.defineProperty(window, 'localStorage', {
            value: {
              getItem: function(k) { return mem.hasOwnProperty(k) ? mem[k] : null; },
              setItem: function(k, v) { mem[k] = String(v); },
              removeItem: function(k) { delete mem[k]; },
              clear: function() { mem = {}; },
              key: function(i) { return Object.keys(mem)[i] || null; },
              get length() { return Object.keys(mem).length; }
            },
            writable: true,
            configurable: true
          });
        } catch(err) {}
      }
    })();
  </script>
  `;

  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${storagePolyfill}`);
  } else {
    html = storagePolyfill + html;
  }

  const desktopHooks = `
  <script>
    // Desktop RAD Studio Integration
    window.addEventListener("DOMContentLoaded", function() {
      var hubBtn = document.getElementById("brand-logo");
      if (hubBtn) {
        hubBtn.addEventListener("click", function(e) {
          if (typeof window.quitApp === "function" || typeof window.closeWindow === "function") {
            e.preventDefault();
            if (typeof window.quitApp === "function") window.quitApp();
            else if (typeof window.closeWindow === "function") window.closeWindow();
          }
        });
      }
    });
  </script>
  <script>
${getWindowShortcutsScript()}
  </script>
  `;

  const lastBodyIdx = html.lastIndexOf("</body>");
  if (lastBodyIdx !== -1) {
    html = html.slice(0, lastBodyIdx) + `${desktopHooks}\n` + html.slice(lastBodyIdx);
  } else {
    html += desktopHooks;
  }

  return html;
}

// File types that are never searched as text. The search used to read each of them in full just to look for a
// NUL byte: on this repository about three quarters of the bytes it read were PNG screenshots.
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".icns", ".tiff",
  ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".mp4", ".mov", ".webm", ".avi",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".tar", ".pdf",
  ".sqlite", ".sqlite3", ".db", ".sqlite-shm", ".sqlite-wal", ".db-shm", ".db-wal",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm",
]);

export function isBinaryPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/**
 * Recursively scans a workspace directory and builds a safe file tree.
 */
function scanWorkspace(rootDir: string, currentDir: string = rootDir, maxDepth = 4, depth = 0): Array<{ path: string; name: string; size: number; isDirectory: boolean; modified: number }> {
  if (depth > maxDepth || !existsSync(currentDir)) return [];

  const results: Array<{ path: string; name: string; size: number; isDirectory: boolean; modified: number }> = [];
  const ignored = new Set(["node_modules", ".git", ".DS_Store", ".gemini", "dist", "build", ".tempmediaStorage", "coverage"]);

  try {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;

      const fullPath = join(currentDir, entry.name);
      const relPath = relative(rootDir, fullPath);

      try {
        const stat = statSync(fullPath);
        if (entry.isDirectory()) {
          results.push({
            path: relPath,
            name: entry.name,
            size: 0,
            isDirectory: true,
            modified: stat.mtimeMs,
          });
          const children = scanWorkspace(rootDir, fullPath, maxDepth, depth + 1);
          results.push(...children);
        } else {
          results.push({
            path: relPath,
            name: entry.name,
            size: stat.size,
            isDirectory: false,
            modified: stat.mtimeMs,
          });
        }
      } catch {}
    }
  } catch {}

  return results;
}

/** True when `target` is `root` itself or lies inside it (a plain prefix check wrongly accepts `/ws-evil` for `/ws`). */
export function isInsideWorkspace(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Starts the Bun.serve server hosting NovaCode Studio Pro and its workspace filesystem APIs.
 */
export function startCodeStudioServer(options: CodeServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const assetsDir = getCodeEditorAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

      const url = new URL(req.url);
      const pathname = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Root / Index
      if (pathname === "/" || pathname === "/index.html") {
        const html = generateCodeStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // Favicon Icon
      if (pathname === "/favicon.svg") {
        const filePath = join(assetsDir, "favicon.svg");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
      }

      // API Health Check
      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "code_studio",
            name: "NovaCode Studio Pro — Advanced Developer Workstation",
            version: "1.0.0",
            workspaceRoot,
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // API: Scan Workspace File Tree
      if (pathname === "/api/fs/workspace") {
        const files = scanWorkspace(workspaceRoot);
        return Response.json({ success: true, workspaceRoot, files }, { headers: corsHeaders });
      }

      // API: Search Workspace Files
      if (pathname === "/api/fs/search" && req.method === "POST") {
        try {
          const body = await req.json() as {
            query?: string;
            matchCase?: boolean;
            wholeWord?: boolean;
            isRegex?: boolean;
            maxResults?: number;
          };

          if (!body?.query) {
            return Response.json({ success: false, error: "Missing query parameter" }, { status: 400, headers: corsHeaders });
          }

          const query = body.query;
          const matchCase = Boolean(body.matchCase);
          const wholeWord = Boolean(body.wholeWord);
          const isRegex = Boolean(body.isRegex);
          const maxResults = body.maxResults || 300;

          let regexFlags = matchCase ? "g" : "gi";
          let regex: RegExp;
          try {
            if (isRegex) {
              regex = new RegExp(query, regexFlags);
            } else if (wholeWord) {
              regex = new RegExp(`\\b${escapeRegExp(query)}\\b`, regexFlags);
            } else {
              regex = new RegExp(escapeRegExp(query), regexFlags);
            }
          } catch (e: any) {
            return Response.json({ success: false, error: "Invalid regex: " + e.message }, { status: 400, headers: corsHeaders });
          }

          const scanned = scanWorkspace(workspaceRoot, workspaceRoot, 6);
          const fileResults: Array<{ path: string; matches: Array<{ line: number; col: number; snippet: string }> }> = [];
          let totalMatches = 0;

          for (const item of scanned) {
            if (item.isDirectory) continue;
            if (item.size > 1024 * 1024) continue;
            if (isBinaryPath(item.path)) continue;

            const fullPath = resolve(workspaceRoot, item.path);
            try {
              const content = readFileSync(fullPath, "utf8");
              if (content.includes("\0")) continue; // skip binary

              const lines = content.split("\n");
              const matches: Array<{ line: number; col: number; snippet: string }> = [];

              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const lineText = lines[lineIdx]!;
                regex.lastIndex = 0;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(lineText)) !== null) {
                  matches.push({
                    line: lineIdx + 1,
                    col: m.index,
                    snippet: lineText.trim().slice(0, 160),
                  });
                  totalMatches++;
                  if (totalMatches >= maxResults) break;
                  if (!regex.global) break;
                }
                if (totalMatches >= maxResults) break;
              }

              if (matches.length > 0) {
                fileResults.push({ path: item.path, matches });
              }
              if (totalMatches >= maxResults) break;
            } catch {}
          }

          return Response.json({
            success: true,
            query,
            totalMatches,
            fileCount: fileResults.length,
            results: fileResults,
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Read File
      if (pathname === "/api/fs/read" && req.method === "POST") {
        try {
          const body = await req.json() as { path?: string };
          if (!body?.path) {
            return Response.json({ success: false, error: "Missing path parameter" }, { status: 400, headers: corsHeaders });
          }

          const targetPath = resolve(workspaceRoot, body.path);
          if (!isInsideWorkspace(workspaceRoot, targetPath)) {
            return Response.json({ success: false, error: "Access denied" }, { status: 403, headers: corsHeaders });
          }

          if (!existsSync(targetPath)) {
            return Response.json({ success: false, error: "File not found" }, { status: 404, headers: corsHeaders });
          }

          const content = readFileSync(targetPath, "utf8");
          const stat = statSync(targetPath);

          return Response.json({
            success: true,
            path: body.path,
            content,
            size: stat.size,
            modified: stat.mtimeMs,
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Save File
      if (pathname === "/api/fs/save" && req.method === "POST") {
        try {
          const body = await req.json() as { path?: string; content?: string };
          if (!body?.path || body.content === undefined) {
            return Response.json({ success: false, error: "Missing path or content parameter" }, { status: 400, headers: corsHeaders });
          }

          const targetPath = resolve(workspaceRoot, body.path);
          if (!isInsideWorkspace(workspaceRoot, targetPath)) {
            return Response.json({ success: false, error: "Access denied" }, { status: 403, headers: corsHeaders });
          }

          const parent = dirname(targetPath);
          if (!existsSync(parent)) {
            mkdirSync(parent, { recursive: true });
          }

          writeFileSync(targetPath, body.content, "utf8");
          const stat = statSync(targetPath);

          return Response.json({
            success: true,
            path: body.path,
            size: stat.size,
            savedAt: Date.now(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Create File or Directory
      if (pathname === "/api/fs/new" && req.method === "POST") {
        try {
          const body = await req.json() as { path?: string; type?: "file" | "directory" };
          if (!body?.path) {
            return Response.json({ success: false, error: "Missing path parameter" }, { status: 400, headers: corsHeaders });
          }

          const targetPath = resolve(workspaceRoot, body.path);
          if (!isInsideWorkspace(workspaceRoot, targetPath)) {
            return Response.json({ success: false, error: "Access denied" }, { status: 403, headers: corsHeaders });
          }

          if (body.type === "directory") {
            if (!existsSync(targetPath)) mkdirSync(targetPath, { recursive: true });
          } else {
            const parent = dirname(targetPath);
            if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
            if (!existsSync(targetPath)) writeFileSync(targetPath, "", "utf8");
          }

          return Response.json({ success: true, path: body.path, type: body.type || "file" }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Delete File or Directory
      if (pathname === "/api/fs/delete" && req.method === "POST") {
        try {
          const body = await req.json() as { path?: string };
          if (!body?.path) {
            return Response.json({ success: false, error: "Missing path parameter" }, { status: 400, headers: corsHeaders });
          }

          const targetPath = resolve(workspaceRoot, body.path);
          if (!isInsideWorkspace(workspaceRoot, targetPath) || targetPath === workspaceRoot) {
            return Response.json({ success: false, error: "Access denied" }, { status: 403, headers: corsHeaders });
          }

          if (existsSync(targetPath)) {
            const stat = statSync(targetPath);
            if (stat.isDirectory()) {
              rmSync(targetPath, { recursive: true, force: true });
            } else {
              unlinkSync(targetPath);
            }
          }

          return Response.json({ success: true, path: body.path }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Rename File or Directory
      if (pathname === "/api/fs/rename" && req.method === "POST") {
        try {
          const body = await req.json() as { oldPath?: string; newPath?: string };
          if (!body?.oldPath || !body?.newPath) {
            return Response.json({ success: false, error: "Missing oldPath or newPath parameter" }, { status: 400, headers: corsHeaders });
          }

          const srcPath = resolve(workspaceRoot, body.oldPath);
          const destPath = resolve(workspaceRoot, body.newPath);

          if (!isInsideWorkspace(workspaceRoot, srcPath) || !isInsideWorkspace(workspaceRoot, destPath)) {
            return Response.json({ success: false, error: "Access denied" }, { status: 403, headers: corsHeaders });
          }

          if (!existsSync(srcPath)) {
            return Response.json({ success: false, error: "Source path does not exist" }, { status: 404, headers: corsHeaders });
          }

          renameSync(srcPath, destPath);
          return Response.json({ success: true, oldPath: body.oldPath, newPath: body.newPath }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // API: Execute Shell Command
      // API: Prettify or minify the text of the open file (Prettier, sql-formatter, or the language's own formatter when installed)
      if (pathname === "/api/prettify" && req.method === "POST") {
        try {
          const body = await req.json() as { mode?: string; text?: string; path?: string; lang?: string; tabWidth?: number; useTabs?: boolean };
          if (typeof body?.text !== "string") {
            return Response.json({ ok: false, error: { message: "There is no text to format." } }, { status: 400, headers: corsHeaders });
          }
          const input = { text: body.text, path: typeof body.path === "string" ? body.path : undefined, lang: typeof body.lang === "string" ? body.lang : undefined, tabWidth: typeof body.tabWidth === "number" ? body.tabWidth : undefined, useTabs: body.useTabs === true };
          return Response.json(body.mode === "minify" ? await minifyCode(input) : await prettifyCode(input), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ ok: false, error: { message: err?.message || String(err) } }, { status: 500, headers: corsHeaders });
        }
      }

      if (pathname === "/api/exec" && req.method === "POST") {
        try {
          const body = await req.json() as { command?: string; cwd?: string };
          if (!body?.command) {
            return Response.json({ success: false, error: "Missing command parameter" }, { status: 400, headers: corsHeaders });
          }

          const execCwd = body.cwd ? resolve(workspaceRoot, body.cwd) : workspaceRoot;
          const startTime = performance.now();

          const command = process.platform === "win32"
            ? ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", body.command]
            : ["sh", "-c", body.command];
          const proc = Bun.spawn(command, {
            cwd: execCwd,
            env: { ...process.env, TERM: "xterm-256color" },
            stdout: "pipe",
            stderr: "pipe",
          });

          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          const durationMs = Math.round(performance.now() - startTime);

          return Response.json({
            success: true,
            command: body.command,
            exitCode,
            stdout,
            stderr,
            durationMs,
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
        }
      }

      // Fallback: static file in assets directory
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

  return server;
}

/**
 * Creates the complete native desktop instance of NovaCode Studio Pro.
 */
export function createCodeStudio(options: CodeStudioOptions = {}): CodeStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1440);
  const height = options.height ?? (fullscreen ? screen.height : 920);
  const title = "NovaCode Studio Pro — Advanced Developer Workstation";
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());

  const app: CodeStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    workspaceRoot,
    generateHtml: () => generateCodeStudioHtml(),
    run: async () => {
      console.log("⚡ Launching NovaCode Studio Pro...");
      const html = generateCodeStudioHtml();

      let srv: any = null;
      try {
        srv = startCodeStudioServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
          workspaceRoot,
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`⚡ Background workstation server active at: ${app.url}`);
      } catch (err: any) {
        console.warn("Local server note:", err?.message || err);
      }

      try {
        const { Webview, SizeHint } = await import("webview-bun");
        const webview = new Webview(true, {
          width,
          height,
          hint: SizeHint.NONE,
        });
        app.webview = webview;
        webview.title = title;

        try {
          if (fullscreen) {
            setWindowPositionNative(webview, { x: 0, y: 0 }, width, height);
          } else {
            setWindowPositionNative(webview, "center", width, height);
          }
          setAlwaysOnTopNative(webview, options.alwaysOnTop ?? false);
        } catch {}

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try { srv?.stop(); } catch {}
            process.exit(0);
          },
          onClose: () => {
            try { srv?.stop(); } catch {}
            process.exit(0);
          },
          onFullscreen: () => {
            toggleFullscreenNative(webview);
          },
          fullscreen,
        });

        // Set HTML directly into Webview memory (bypasses macOS ATS network restrictions)
        webview.setHTML(html);
        console.log(`⚡ Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);

        webview.run();
        try { srv?.stop(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running in browser at: ${app.url}`);
        await new Promise(() => {});
      } finally {
        try { srv?.stop(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

// Direct CLI Invocation
if (import.meta.main) {
  const args = process.argv.slice(2);
  const fullscreen = !args.includes("--windowed") && !args.includes("-w");
  const portFlagIdx = args.indexOf("--port");
  const port = portFlagIdx !== -1 ? parseInt(args[portFlagIdx + 1]!, 10) : 9005;
  const serverOnly = args.includes("--server") || args.includes("-s");

  if (serverOnly) {
    const srv = startCodeStudioServer({ port, host: "127.0.0.1" });
    console.log(`⚡ NovaCode Studio Pro server running at: http://127.0.0.1:${srv.port}/`);
    await new Promise(() => {});
  } else {
    const app = createCodeStudio({ fullscreen, port });
    app.run();
  }
}
