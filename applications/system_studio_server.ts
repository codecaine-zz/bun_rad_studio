/**
 * ⚡ Bun RAD Studio - System Information Studio Pro Server
 * 
 * High-performance background HTTP telemetry engine for System Information Studio Pro.
 * Can be run as a standalone web workstation server or as an isolated background Worker
 * supporting the native desktop Webview window without main-thread event loop blocking.
 */

import { resolve, join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import {
  SI_METHODS,
  SI_CATEGORIES,
  executeSiMethod,
  fetchTelemetryKpis,
  generateEnterpriseAppHtml,
} from "./system_studio.ts";

export interface ServerOptions {
  port?: number;
  host?: string;
}

/**
 * Starts the System Information Studio HTTP Telemetry Engine
 */
export function startSystemStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // Enable CORS for flexibility
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Route: Root HTML Application Shell
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generateEnterpriseAppHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      // Route: Real-Time Telemetry KPIs
      if (url.pathname === "/api/kpis") {
        try {
          const kpis = await fetchTelemetryKpis();
          return Response.json(kpis, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { headers: corsHeaders, status: 500 });
        }
      }

      // Route: Method Execution
      if (url.pathname === "/api/execute") {
        const method = url.searchParams.get("method") || "system";
        const param = url.searchParams.get("param") || undefined;
        const res = await executeSiMethod(method, param);
        return Response.json(res, { headers: corsHeaders });
      }

      // Route: Export Report
      if (url.pathname === "/api/export" && req.method === "POST") {
        try {
          const body = await req.json();
          const reportsDir = resolve(process.cwd(), "reports");
          if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

          const filename = `system_report_${body.method || "telemetry"}_${Date.now()}.json`;
          const fullPath = join(reportsDir, filename);

          const report = {
            title: "System Information Studio Pro - Hardware Telemetry Report",
            timestamp: new Date().toISOString(),
            method: body.method,
            platform: `${process.platform} (${process.arch})`,
            bunVersion: Bun.version,
            payload: JSON.parse(body.jsonStr || "{}"),
          };

          writeFileSync(fullPath, JSON.stringify(report, null, 2), "utf-8");
          return Response.json({ success: true, filename, path: fullPath }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { headers: corsHeaders, status: 500 });
        }
      }

      // Route: System Clipboard
      if (url.pathname === "/api/clipboard" && req.method === "POST") {
        try {
          const body = await req.json();
          const text = body.text || "";
          if (process.platform === "darwin") {
            const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
            proc.stdin.write(text);
            proc.stdin.end();
          } else if (process.platform === "win32") {
            const proc = Bun.spawn(["clip"], { stdin: "pipe" });
            proc.stdin.write(text);
            proc.stdin.end();
          } else {
            const proc = Bun.spawn(["xclip", "-selection", "clipboard"], { stdin: "pipe" });
            proc.stdin.write(text);
            proc.stdin.end();
          }
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { headers: corsHeaders, status: 500 });
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

// -------------------------------------------------------------------------------------------------
// Worker Sub-Process Auto-Bootstrap Mode
// -------------------------------------------------------------------------------------------------

if (!Bun.isMainThread) {
  const server = startSystemStudioServer({ port: 0 });
  (globalThis as any).postMessage({
    ready: true,
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}


// -------------------------------------------------------------------------------------------------
// Standalone Web CLI Server Mode
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const preferredPort = Number(process.env.PORT) || 4567;
  const server = startSystemStudioServer({ port: preferredPort, host: "0.0.0.0" });
  console.log(`\n⚡ -----------------------------------------------------------------`);
  console.log(`⚡ System Information Studio Pro - Hardware Telemetry Web Server`);
  console.log(`⚡ Local URL:    http://127.0.0.1:${server.port}`);
  console.log(`⚡ Network URL:  http://localhost:${server.port}`);
  console.log(`⚡ All 60 systeminformation APIs available in browser workstation.`);
  console.log(`⚡ -----------------------------------------------------------------\n`);
}
