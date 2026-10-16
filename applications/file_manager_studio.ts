/**
 * 📁 Codecaine File Manager — an easy, safe file manager for Windows, macOS and Linux.
 *
 * Browse, search, copy, move, rename, delete (to a Recycle Bin with Undo), zip and unzip files, with a clear
 * sidebar, breadcrumb address bar, three views, drag and drop, a details panel and full keyboard support.
 *
 * How it runs: a small local web server (127.0.0.1 only, protected by a per-session token) does the file work, and
 * the window shows its page. `--server` runs just the server so you can open it in a browser.
 *
 *   bun run app:files                      open the window
 *   bun run app:files --path ~/Documents   open it at a folder
 *   bun run app:files --server             server only; prints READY:<port>
 *
 * The window opens filling the screen. When you change it (resize, move, maximise, full screen) the app remembers that
 * and uses it next time; Settings → Window (or --reset-window) goes back to filling the screen.
 *
 * Options: --port N, --path DIR, --width N, --height N (a one-off window size: nothing is restored or remembered),
 * --reset-window (forget the remembered window and fill the screen), --home DIR and --data-dir DIR (where the settings,
 * the remembered window and the Recycle Bin live) and --tool-dirs A:B (look for ffmpeg, ImageMagick and pandoc only
 * there); the last three are mainly for testing.
 */
import { SizeHint, Webview } from "webview-bun";
import { delimiter, resolve } from "path";
import { APP_NAME, startFileManagerServer, type FileManagerServerOptions } from "../src/features/filemanager/fmServer";
import { openManagedWindow } from "../src/features/filemanager/fmWindowControl";
import { resetWindowPrefs, windowDataDir } from "../src/features/filemanager/fmWindow";
import { createWindowNative } from "../src/windowNative";
import { openCommand } from "../src/features/filemanager/fmOpen";
import { DESKTOP_SHORTCUTS_SCRIPT } from "../src/shared/desktopShortcuts";

export interface FileManagerStudioOptions extends FileManagerServerOptions {
  /** A one-off window size (--width / --height): used as is, and not remembered. */
  width?: number;
  height?: number;
  /** Forget the remembered window first, so the window fills the screen (--reset-window). */
  resetWindow?: boolean;
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
  const app: FileManagerStudioInstance = {
    title,
    width,
    height,
    run: async () => {
      console.log(`📁 Launching ${APP_NAME}...`);
      // The window's event loop blocks this process, so the server must live in its own process (as in the
      // other studios). If that fails, the server runs here and is opened in a browser instead of a window.
      let child: ReturnType<typeof Bun.spawn> | undefined;
      const stop = () => {
        try { child?.kill(); } catch {}
        try { app.server?.stop(true); } catch {}
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      let port = 0;
      try {
        child = Bun.spawn(serverCommand(options), { stdout: "pipe", stderr: "inherit" });
        port = await readyPort(child.stdout as ReadableStream<Uint8Array>, 8000);
      } catch (err) {
        console.warn("Could not start the background File Manager server:", err);
      }
      if (!port) {
        console.warn("The background server did not become ready; starting the File Manager server in this process.");
        try { child?.kill(); } catch {}
        child = undefined;
        app.server = startFileManagerServer({ port: options.port ?? 0, host: "127.0.0.1", context: options.context, startPath: options.startPath });
        port = app.server.port ?? 0;
      }
      app.url = `http://127.0.0.1:${port}/`;
      console.log(`📁 ${APP_NAME} server running at: ${app.url}`);
      try {
        await fetch(app.url).catch(() => {});
        if (app.server) throw new Error("the server could not be started in the background");
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
        webview.bind("toggleNativeFullscreen", () => {
          const frame = native.getFrame();
          if (!frame) throw new Error("The window's fullscreen state could not be read.");
          if (!native.setFullscreen(!frame.fullscreen)) throw new Error("Fullscreen could not be changed.");
        });
        // The window has no menu bar, so the page asks for these (Ctrl/Cmd+W and Ctrl/Cmd+Q).
        webview.bind("closeApp", stop);
        webview.navigate(app.url);
        console.log("📁 Window open. Press Ctrl+W (Cmd+W on a Mac) or close the window to quit.");
        webview.run();
        stop();
      } catch (err: any) {
        console.warn(`The desktop window isn't available (${err?.message || err}). Opening the File Manager in your browser at: ${app.url}`);
        if (process.platform === "linux") console.warn("For a native window, install GTK 4 and WebKitGTK 6.0 and run inside a graphical desktop session.");
        if (process.platform === "win32") console.warn("For a native window, install Microsoft Edge WebView2 and the Microsoft Visual C++ 2015-2022 Redistributable (x64).");
        const cmd = openCommand(process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", app.url);
        try {
          const browser = Bun.spawn([cmd.command, ...cmd.args], { stdout: "ignore", stderr: "inherit" });
          const code = await browser.exited;
          if (code !== 0) console.error(`Could not open the browser (${cmd.command} exited with ${code}). Open ${app.url} manually.`);
        } catch (openError) {
          console.error(`Could not open the browser. Open ${app.url} manually.`, openError);
        }
        await new Promise(() => {});
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
    await createFileManagerStudio({ port, startPath, context, width, height, resetWindow }).run();
  }
}
