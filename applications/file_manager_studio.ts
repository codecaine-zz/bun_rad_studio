/**
 * 📁 File Manager — an easy, safe file manager for Windows, macOS and Linux.
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
 * Options: --port N, --path DIR, --width N, --height N, --home DIR and --data-dir DIR (where the settings and the
 * Recycle Bin live) and --tool-dirs A:B (look for ffmpeg, ImageMagick and pandoc only there); the last three are mainly for testing.
 */
import { SizeHint, Webview } from "webview-bun";
import { delimiter, resolve } from "path";
import { setWindowPositionNative } from "../index.ts";
import { APP_NAME, startFileManagerServer, type FileManagerServerOptions } from "../src/features/filemanager/fmServer";

export interface FileManagerStudioOptions extends FileManagerServerOptions {
  width?: number;
  height?: number;
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
      console.log("📁 Launching File Manager...");
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
        child = Bun.spawn(serverCommand(options), { stdout: "pipe", stderr: "ignore" });
        port = await readyPort(child.stdout as ReadableStream<Uint8Array>, 8000);
      } catch {}
      if (!port) {
        try { child?.kill(); } catch {}
        child = undefined;
        app.server = startFileManagerServer({ port: options.port ?? 0, host: "127.0.0.1", context: options.context, startPath: options.startPath });
        port = app.server.port ?? 0;
      }
      app.url = `http://127.0.0.1:${port}/`;
      console.log(`📁 File Manager server running at: ${app.url}`);
      try {
        await fetch(app.url).catch(() => {});
        if (app.server) throw new Error("the server could not be started in the background");
        const webview = new Webview(false, { width, height, hint: SizeHint.NONE });
        app.webview = webview;
        webview.title = title;
        try {
          setWindowPositionNative(webview, "center", width, height);
        } catch {}
        // The window has no menu bar, so the page asks for these (Ctrl/Cmd+W and Ctrl/Cmd+Q).
        webview.bind("closeApp", stop);
        webview.navigate(app.url);
        console.log("📁 Window open. Press Ctrl+W (Cmd+W on a Mac) or close the window to quit.");
        webview.run();
        stop();
      } catch (err: any) {
        console.warn(`The desktop window isn't available (${err?.message || err}). The File Manager is running in your browser at: ${app.url}`);
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
  if (args.includes("--server") || args.includes("-s")) {
    const server = startFileManagerServer({ port, startPath, context });
    console.log(`📁 File Manager server running at: http://127.0.0.1:${server.port}/`);
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
    await createFileManagerStudio({ port, startPath, context, width, height }).run();
  }
}
