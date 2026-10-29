/**
 * 📁 Codecaine File Manager — an easy, safe file manager for Windows, macOS and Linux.
 *
 * Browse, search, copy, move, rename, delete (to a Recycle Bin with Undo), zip and unzip files, with a clear
 * sidebar, breadcrumb address bar, three views, drag and drop, a details panel and full keyboard support.
 *
 * How it runs: a small local web server (127.0.0.1 only, protected by a per-session token) does the file work, and
 * the native desktop WebView window shows its page. `--browser` (`-b`) opens it in your web browser instead, and
 * `--server` runs just the server.
 *
 *   bun run app:files                      open the native desktop window
 *   bun run app:files --path ~/Documents   open it at a folder
 *   bun run app:files --browser            open it in a web browser instead of the native window
 *   bun run app:files --server             server only; prints READY:<port>
 *
 * The window opens filling the screen. When you change it (resize, move, maximise, full screen) the app remembers that
 * and uses it next time; Settings → Window (or --reset-window) goes back to filling the screen.
 *
 * Options: --port N, --path DIR, --browser / -b, --width N, --height N (a one-off window size: nothing is restored or remembered),
 * --reset-window (forget the remembered window and fill the screen), --home DIR and --data-dir DIR (where the settings,
 * the remembered window and the Recycle Bin live) and --tool-dirs A:B (look for ffmpeg, ImageMagick and pandoc only
 * there); the last three are mainly for testing.
 */
import type { Webview } from "webview-bun";
import { delimiter, resolve } from "path";
import { APP_NAME, startFileManagerServer, type FileManagerServerOptions } from "../src/features/filemanager/fmServer";
import { openManagedWindow } from "../src/features/filemanager/fmWindowControl";
import { readWindowPrefs, reduceReport, resetWindowPrefs, sanitizeWindowState, windowDataDir, writeWindowPrefs } from "../src/features/filemanager/fmWindow";
import { createWindowNative } from "../src/windowNative";
import { openCommand } from "../src/features/filemanager/fmOpen";
import { DESKTOP_SHORTCUTS_SCRIPT } from "../src/shared/desktopShortcuts";
import {
  ensureValidWindowsWebViewLoader,
  ensureWindowsX64Bun,
  ensureWindowsX64VcRuntimeAndWebViewLoader,
   initWindowsComSta,
  isPeX64,
} from "../scripts/fix_windows_webview_runtime";

export interface FileManagerStudioOptions extends FileManagerServerOptions {
  /** A one-off window size (--width / --height): used as is, and not remembered. */
  width?: number;
  height?: number;
  /** Forget the remembered window first, so the window fills the screen (--reset-window). */
  resetWindow?: boolean;
  /** Open directly into a specific tool tab (--tool <id>). */
  startTool?: string;
  /** Open directly into a specific Codecaine game (--game <id>). */
  startGame?: string;
  /** Start with the tool expanded to fill the window (--max). */
  startMax?: boolean;
  /** Explicitly open in the system web browser instead of the native WebView window (--browser / -b). */
  openBrowser?: boolean;
}

export interface FileManagerStudioInstance {
  title: string;
  width: number;
  height: number;
  server?: ReturnType<typeof startFileManagerServer>;
  webview?: Webview;
  url?: string;
  run: () => Promise<void>;
}

export { startFileManagerServer };

/** The command that starts only the server, with the same options, in a separate process. */
function serverCommand(options: FileManagerServerOptions): string[] {
  const script = process.argv[1] || resolve(import.meta.dir, "file_manager_studio.ts");
  const args = [process.execPath, script, "--server", "--parent-pid", String(process.pid)];
  if (options.port) args.push("--port", String(options.port));
  if (options.startPath) args.push("--path", options.startPath);
  if (options.context?.home) args.push("--home", options.context.home);
  if (options.context?.dataDir) args.push("--data-dir", options.context.dataDir);
  if (options.context?.toolDirs) args.push("--tool-dirs", options.context.toolDirs.join(delimiter));
  return args;
}

/** Reads the child's output until it announces `READY:<port>`; returns 0 if that doesn't happen in time. */
async function readyPort(stream: ReadableStream<Uint8Array>, timeoutMs: number): Promise<number> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => { reader.cancel().catch(() => {}); }, timeoutMs);
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const m = text.match(/READY:(\d+)/);
      if (m?.[1]) return Number(m[1]);
    }
  } catch {} finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return 0;
}

export function createFileManagerStudio(options: FileManagerStudioOptions = {}): FileManagerStudioInstance {
  const width = options.width ?? 1280;
  const height = options.height ?? 820;
  const title = APP_NAME;
  const openBrowser = Boolean(options.openBrowser || process.env.FM_OPEN_BROWSER === "1");
  const app: FileManagerStudioInstance = {
    title,
    width,
    height,
    run: async () => {
      // On Windows, prepare the WebView2 runtime before starting the window:
      // 1. Ensure no wrong-architecture (ARM64/x86) WebView2Loader.dll is blocking x64 libwebview.dll.
      // 2. If running under native ARM64 bun.exe on Windows 11 ARM64, automatically switch to x64-baseline bun.exe
      //    so the x86_64 libwebview.dll loads natively instead of failing with Win32 Error 193.
      // 3. Initialize COM in Single-Threaded Apartment (STA) mode on the main thread before async fetch/spawn.
      if (process.platform === "win32" && !openBrowser) {
        ensureValidWindowsWebViewLoader();
        if ((process.arch === "arm64" || !isPeX64(process.execPath)) && process.env.FM_REEXEC_X64 !== "1") {
          const bunX64 = await ensureWindowsX64Bun();
          if (bunX64) {
            console.log(`📁 Windows ARM64 detected: launching native WebView window via x64 Bun runtime (${bunX64})...`);
            const reexec = Bun.spawn([bunX64, ...process.argv.slice(1)], {
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
              env: { ...process.env, FM_REEXEC_X64: "1" },
            });
            const forwardStop = () => {
              try { reexec.kill(); } catch {}
            };
            process.on("SIGINT", forwardStop);
            process.on("SIGTERM", forwardStop);
            const exitCode = await reexec.exited;
            process.exit(exitCode);
          }
        }
        await ensureWindowsX64VcRuntimeAndWebViewLoader();
        await initWindowsComSta();
      }

      console.log(`📁 Launching ${APP_NAME}...`);
      // The window's event loop blocks this process, so the server lives in its own background process.
      let child: ReturnType<typeof Bun.spawn> | undefined;
      const stop = () => {
        try { child?.kill(); } catch {}
        try { app.server?.stop(true); } catch {}
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      let port = 0;
      if (!openBrowser) {
        for (let attempt = 1; attempt <= 2 && !port; attempt++) {
          try {
            child = Bun.spawn(serverCommand(options), { stdout: "pipe", stderr: "inherit" });
            // Allow up to 30s on first launch (e.g. cold Windows Defender scan right after `bun install`).
            port = await readyPort(child.stdout as ReadableStream<Uint8Array>, attempt === 1 ? 30000 : 20000);
            if (!port) {
              try { child?.kill(); } catch {}
              child = undefined;
            }
          } catch (err) {
            console.warn("Could not start the background File Manager server:", err);
            try { child?.kill(); } catch {}
            child = undefined;
          }
        }
      }
      if (!port) {
        if (!openBrowser) {
          console.warn("The background server did not become ready; starting the File Manager server in this process.");
        }
        try { child?.kill(); } catch {}
        child = undefined;
        app.server = startFileManagerServer({ port: options.port ?? 0, host: "127.0.0.1", context: options.context, startPath: options.startPath });
        port = app.server.port ?? 0;
      }
      const query = new URLSearchParams();
      if (options.startTool) query.set("tool", options.startTool);
      if (options.startGame) query.set("game", options.startGame);
      if (options.startMax) query.set("max", "1");
      const qs = query.toString();
      app.url = `http://127.0.0.1:${port}/${qs ? `?${qs}` : ""}`;
      console.log(`📁 ${APP_NAME} server running at: ${app.url}`);

      // Only open in a web browser when the user explicitly opts in via `--browser` / `-b` (or FM_OPEN_BROWSER=1).
      if (openBrowser) {
        console.log(`🌐 Opening the File Manager in your browser at: ${app.url}`);
        const cmd = openCommand(process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", app.url);
        try {
          const browser = Bun.spawn([cmd.command, ...cmd.args], { stdout: "ignore", stderr: "pipe" });
          const [code, stderr] = await Promise.all([browser.exited, new Response(browser.stderr).text()]);
          if (code !== 0) throw new Error(stderr.trim() || `browser opener exited with code ${code}`);
        } catch (openError) {
          try { child?.kill(); } catch {}
          try { app.server?.stop(true); } catch {}
          throw new Error(`The browser could not be opened: ${String(openError)}`);
        }
        await new Promise(() => {});
        return;
      }

      try {
        await fetch(`http://127.0.0.1:${port}/`).catch(() => {});
        if (app.server) throw new Error("the server could not be started in the background");
        const { SizeHint, Webview } = await import("webview-bun");
        // The window is sized, placed and shown from the remembered preference (default: it fills the screen).
        const fixedSize = options.width || options.height ? { width, height } : undefined;
        const managed = openManagedWindow({
          createWindow: (size) => {
            const w = new Webview(false, { ...size, hint: SizeHint.NONE });
            if (!w.unsafeHandle) throw new Error("the native window could not be created (check the desktop session and web view runtime)");
            w.title = title;
            return w;
          },
          createNative: (w) => createWindowNative(w, () => title),
          dataDir: windowDataDir(options.context),
          reset: options.resetWindow,
          fixedSize,
        });
        const webview = managed.window;
        app.webview = webview;
        webview.init(DESKTOP_SHORTCUTS_SCRIPT);
        const native = createWindowNative(webview, () => title);
        const persistCurrentFrame = (overrideFullscreen?: boolean) => {
          if (fixedSize) return;
          try {
            const frame = native.getFrame();
            if (!frame) return;
            const full = overrideFullscreen !== undefined ? overrideFullscreen : frame.fullscreen;
            const dataDir = windowDataDir(options.context);
            const current = readWindowPrefs(dataDir);
            if (current.mode === "fullscreen" && full) return;
            const primary = native.getScreens()[0];
            const nextState = sanitizeWindowState({
              ...frame,
              fullscreen: full,
              maximized: full ? false : frame.maximized,
              screenWidth: current.state?.screenWidth ?? primary?.width ?? frame.width,
              screenHeight: current.state?.screenHeight ?? primary?.height ?? frame.height,
              dpr: current.state?.dpr ?? 2,
            });
            if (!nextState) return;
            const r = reduceReport(current, nextState);
            if (r.save) writeWindowPrefs(dataDir, r.prefs);
          } catch {}
        };
        webview.bind("toggleNativeFullscreen", () => {
          const frame = native.getFrame();
          if (!frame) throw new Error("The window's fullscreen state could not be read.");
          const target = !frame.fullscreen;
          if (!native.setFullscreen(target)) throw new Error("Fullscreen could not be changed.");
          persistCurrentFrame(target);
        });
        // The window has no menu bar, so the page asks for these (Ctrl/Cmd+W and Ctrl/Cmd+Q).
        webview.bind("closeApp", () => {
          persistCurrentFrame();
          stop();
        });
        webview.navigate(app.url);
        console.log("📁 Window open. Press Ctrl+W (Cmd+W on a Mac) or close the window to quit.");
        webview.run();
        stop();
      } catch (err: any) {
        try { child?.kill(); } catch {}
        try { app.server?.stop(true); } catch {}
        console.error(`The desktop window isn't available (${err?.message || err}).`);
        if (process.platform === "linux") {
          console.error("For a native window, install GTK 4 and WebKitGTK 6.0 and run inside a graphical desktop session.");
        }
        if (process.platform === "win32") {
          console.error("For a native window, install Microsoft Edge WebView2 and the Microsoft Visual C++ 2015-2022 Redistributable (x64).");
        }
        console.error("To open the File Manager in your web browser instead, pass --browser (or --server for server-only mode).");
        process.exitCode = 1;
        throw new Error(`The desktop window could not be opened: ${err?.message || err}`);
      }
    },
  };
  return app;
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const port = Number(argValue(args, "--port") ?? process.env.PORT ?? 0) || 0;
  const startPath = argValue(args, "--path");
  const startTool = argValue(args, "--tool");
  const startGame = argValue(args, "--game");
  const startMax = args.includes("--max");
  const openBrowser = args.includes("--browser") || args.includes("-b") || process.env.FM_OPEN_BROWSER === "1";
  const home = argValue(args, "--home");
  const dataDir = argValue(args, "--data-dir");
  const toolDirs = argValue(args, "--tool-dirs");
  const context = { ...(home ? { home: resolve(home) } : {}), ...(dataDir ? { dataDir: resolve(dataDir) } : {}), ...(toolDirs !== undefined ? { toolDirs: toolDirs.split(delimiter).filter(Boolean) } : {}) };
  const resetWindow = args.includes("--reset-window");
  if (args.includes("--server") || args.includes("-s")) {
    if (resetWindow) {
      resetWindowPrefs(windowDataDir(context));
      console.log("📁 The remembered window was forgotten: the File Manager fills the screen next time.");
    }
    const server = startFileManagerServer({ port, startPath, context });
    console.log(`📁 ${APP_NAME} server running at: http://127.0.0.1:${server.port}/`);
    console.log(`READY:${server.port}`);
    // Started by a window: stop when that window's process is gone, so no server is left running.
    const parentPid = Number(argValue(args, "--parent-pid")) || 0;
    if (parentPid) {
      setInterval(() => {
        try { process.kill(parentPid, 0); } catch { process.exit(0); }
      }, 2000);
    }
    await new Promise(() => {});
  } else {
    const width = Number(argValue(args, "--width")) || undefined;
    const height = Number(argValue(args, "--height")) || undefined;
    try {
      await createFileManagerStudio({ port, startPath, context, width, height, resetWindow, startTool, startGame, startMax, openBrowser }).run();
    } catch {
      process.exit(1);
    }
  }
}
