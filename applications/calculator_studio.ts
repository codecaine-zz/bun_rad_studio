/**
 * ⚡ Orbit Universal Computing Suite & Graphic Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Includes:
 * - 17-dimension Unit & Currency Converter with visual scale bars
 * - Apple-grade Scientific Calculator with memory registers and physical constants
 * - 64-bit Programmer & Bitwise Laboratory with interactive bit-flipper, radix table & ALU metrics
 * - Graphic Charts & Time-Series Data Studio with regression models and custom JSON parser
 * - Calculus & Multi-Mode Grapher (Cartesian, Dual, Polar, Parametric, Integrals & Roots)
 * - Matrix & Linear Algebra Laboratory (2x2 to 4x4 operations and Ax = b Gaussian elimination)
 * - Geometry & Triangles Studio with interactive canvas solver and 3D solids
 * - Wealth & FIRE Planner with retirement trajectory, paycheck donut & US inflation time machine
 * - Physics & Engineering constants, projectile trajectory simulator & relativistic dilation
 * - Electronics & Circuits Studio with realistic resistor color decoder, LC resonance & SMD codes
 * - Smart Everyday Utilities: BMI gauge, GPA letter grades, WCAG contrast analyzer & date diff
 * - Continuous Paper Tape Journal audit roll with exportable receipt
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync, statSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface CalculatorStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface CalculatorStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  port?: number;
  url?: string;
  server?: any;
  webview?: Webview;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

export interface CalculatorServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getCalculatorAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/universal_calculator"),
    resolve(process.cwd(), "resources/universal_calculator"),
    resolve(import.meta.dir, "../../resources/universal_calculator"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for the Universal Calculator.
 * When inline is true, inlines CSS and JS into a 100% self-contained document
 * with native window shortcuts and IPC bindings injected.
 */
export function generateCalculatorStudioHtml(options: { inline?: boolean; port?: number } = {}): string {
  const assetsDir = getCalculatorAssetsDir();
  const indexPath = join(assetsDir, "index.html");
  const stylesPath = join(assetsDir, "styles.css");
  const appPath = join(assetsDir, "app.js");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Universal Calculator</h1>";

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

  if (options.inline !== false) {
    if (existsSync(stylesPath)) {
      const css = readFileSync(stylesPath, "utf8");
      html = html.replace(/<link rel="stylesheet" href="styles\.css[^"]*">/, () => `<style>\n${css}\n</style>`);
    }

    if (existsSync(appPath)) {
      const js = readFileSync(appPath, "utf8");
      html = html.replace(/<script src="app\.js[^"]*"><\/script>/, () => `<script>\n${js}\n</script>`);
    }

    // Embed IntuitionLab via srcdoc for 100% offline, zero-CORS, zero-ATS desktop webview execution
    const intuitionDir = join(assetsDir, "intuitionlab");
    const intuitionIndex = join(intuitionDir, "index.html");
    const intuitionCss = join(intuitionDir, "styles.css");
    const intuitionBundle = join(intuitionDir, "js/bundle.js");

    if (existsSync(intuitionIndex)) {
      let intuitionHtml = readFileSync(intuitionIndex, "utf8");
      if (existsSync(intuitionCss)) {
        const cssContent = readFileSync(intuitionCss, "utf8");
        intuitionHtml = intuitionHtml.replace(
          /<link rel="stylesheet" href="styles\.css[^"]*">/,
          () => `<style>\n${cssContent}\n</style>`
        );
      }
      if (existsSync(intuitionBundle)) {
        const jsContent = readFileSync(intuitionBundle, "utf8");
        intuitionHtml = intuitionHtml.replace(
          /<script src="js\/bundle\.js[^"]*"><\/script>/,
          () => `<script>\n${jsContent}\n</script>`
        );
      }

      // Add storage polyfill into intuitionLab as well
      if (intuitionHtml.includes("<head>")) {
        intuitionHtml = intuitionHtml.replace("<head>", `<head>\n${storagePolyfill}`);
      }

      const escapedSrcdoc = intuitionHtml
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;");

      html = html.replace(
        /<iframe id="intuitionLabFrame"[^>]*><\/iframe>/,
        () => `<iframe id="intuitionLabFrame" name="intuitionLabFrame" class="intuitionlab-frame" title="IntuitionLab Visual STEM Simulations" allow="autoplay" srcdoc="${escapedSrcdoc}"></iframe>`
      );
    }
  }

  if (options.port) {
    html = html.replaceAll('href="intuitionlab/index.html', `href="http://127.0.0.1:${options.port}/intuitionlab/index.html`);
    if (options.inline === false) {
      html = html.replaceAll('src="intuitionlab/index.html"', `src="http://127.0.0.1:${options.port}/intuitionlab/index.html"`);
    }
  }

  // Inject Desktop Webview Hooks and Window Shortcuts Script
  const desktopHooks = `
  <script>
    // Desktop RAD Studio Integration
    window.addEventListener("DOMContentLoaded", function() {
      // Connect Hub Button to Desktop Window Close/Quit if running inside native Webview
      var hubBtn = document.querySelector(".hub-button");
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

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${desktopHooks}\n</body>`);
  } else {
    html += desktopHooks;
  }

  return html;
}

/**
 * Starts the high-performance Bun.serve server hosting the Universal Calculator.
 */
export function startCalculatorStudioServer(options: CalculatorServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getCalculatorAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    fetch(req) {
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

      // Root / Index
      if (pathname === "/" || pathname === "/index.html") {
        const indexPath = join(assetsDir, "index.html");
        if (existsSync(indexPath)) {
          // Serve with desktop shortcuts injected
          const html = generateCalculatorStudioHtml({ inline: false });
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
          });
        }
      }

      // Stylesheet
      if (pathname === "/styles.css") {
        const filePath = join(assetsDir, "styles.css");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "text/css; charset=utf-8", ...corsHeaders },
          });
        }
      }

      // Main JavaScript Logic
      if (pathname === "/app.js") {
        const filePath = join(assetsDir, "app.js");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "application/javascript; charset=utf-8", ...corsHeaders },
          });
        }
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
            app: "calculator_studio",
            name: "Orbit Universal Computing Suite & Graphic Studio",
            version: "2.7.0",
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // Fallback: check static file in assets directory
      const sanitized = pathname.replace(/^\/+/, "");
      const directCandidate = join(assetsDir, sanitized);
      if (existsSync(directCandidate)) {
        try {
          if (statSync(directCandidate).isDirectory()) {
            const nestedIndex = join(directCandidate, "index.html");
            if (existsSync(nestedIndex)) {
              return new Response(Bun.file(nestedIndex), {
                headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
              });
            }
          } else {
            let mime = "application/octet-stream";
            if (directCandidate.endsWith(".js")) mime = "application/javascript; charset=utf-8";
            else if (directCandidate.endsWith(".css")) mime = "text/css; charset=utf-8";
            else if (directCandidate.endsWith(".html")) mime = "text/html; charset=utf-8";
            else if (directCandidate.endsWith(".svg")) mime = "image/svg+xml";
            else if (directCandidate.endsWith(".png")) mime = "image/png";
            else if (directCandidate.endsWith(".json")) mime = "application/json";

            return new Response(Bun.file(directCandidate), {
              headers: { "Content-Type": mime, ...corsHeaders },
            });
          }
        } catch {
          return new Response(Bun.file(directCandidate), { headers: corsHeaders });
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

/**
 * Creates the complete native desktop instance of Orbit Universal Computing Suite.
 */
export function createCalculatorStudio(options: CalculatorStudioOptions = {}): CalculatorStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1380);
  const height = options.height ?? (fullscreen ? screen.height : 920);
  const title = "Orbit Universal Computing Suite & Graphic Studio";

  const app: CalculatorStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateCalculatorStudioHtml({ inline: true }),
    run: async () => {
      console.log("⚡ Launching Orbit Universal Computing Suite...");
      let srv: any = null;
      try {
        srv = startCalculatorStudioServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`⚡ Background server active at: ${app.url}`);
      } catch (err: any) {
        console.warn("Local server note:", err?.message || err);
      }

      const html = generateCalculatorStudioHtml({ inline: true, port: srv?.port });

      // Native Webview Window
      try {
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

        // Set HTML directly into Webview DOM (instant, 100% offline, zero ATS blocking)
        webview.setHTML(html);
        console.log(`⚡ Desktop window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}).`);

        webview.run();
        try { srv?.stop(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running in browser at: ${app.url}`);
        // Keep server running in headless environments
        await new Promise(() => {});
      } finally {
        try { srv?.stop(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

// -------------------------------------------------------------------------------------------------
// Backward Compatibility & Aliases
// -------------------------------------------------------------------------------------------------
export const createUniversalCalculator = createCalculatorStudio;
export const createUniversalCalculatorStudio = createCalculatorStudio;
export const createCalculatorStudioPro = createCalculatorStudio;

// -------------------------------------------------------------------------------------------------
// Standalone Invocation
// -------------------------------------------------------------------------------------------------
if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startCalculatorStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Universal Calculator Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createCalculatorStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
