import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

export interface CurlResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  elapsedMs: string;
  error?: string;
}

export function executeCurlRequestSync(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyStr?: string
): CurlResponse {
  const t0 = performance.now();
  const args = [
    "curl",
    "-s",
    "-i",
    "-L",
    "--connect-timeout", "4",
    "-m", "10",
    "-X", method,
    "-w", "\n__BUN_RAD_CURL_METADATA__\n%{http_code}\n%{time_total}\n",
  ];

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (bodyStr && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    args.push("--data-raw", bodyStr);
  }

  args.push(url);

  try {
    const proc = Bun.spawnSync(args);
    const elapsed = (performance.now() - t0).toFixed(1);
    const rawOut = proc.stdout.toString();

    if (!rawOut && proc.exitCode !== 0) {
      const err = proc.stderr.toString().trim() || `Curl process exited with code ${proc.exitCode}`;
      return { ok: false, status: 0, statusText: "Network Error", headers: [], body: `[Network Error]\n${err}`, elapsedMs: elapsed, error: err };
    }

    const parts = rawOut.split("\n__BUN_RAD_CURL_METADATA__\n");
    const payload = parts[0] || "";
    const meta = (parts[1] || "").trim().split("\n");
    const statusCode = parseInt(meta[0] || "0", 10);
    const curlElapsedMs = meta[1] ? (parseFloat(meta[1]) * 1000).toFixed(1) : elapsed;

    // Header & body separation (handles redirects by taking the last header block)
    const blocks = payload.split(/\r?\n\r?\n/);
    let body = "";
    let headerLines: string[] = [];

    if (blocks.length <= 1) {
      body = payload;
    } else {
      let lastHeaderIdx = 0;
      for (let i = 0; i < blocks.length - 1; i++) {
        if (/^HTTP\/\d/i.test(blocks[i].trim())) {
          lastHeaderIdx = i;
        }
      }
      headerLines = blocks[lastHeaderIdx].split(/\r?\n/);
      body = blocks.slice(lastHeaderIdx + 1).join("\r\n\r\n");
    }

    const parsedHeaders: [string, string][] = [];
    for (let i = 1; i < headerLines.length; i++) {
      const line = headerLines[i];
      const colon = line.indexOf(":");
      if (colon > 0) {
        parsedHeaders.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
      }
    }

    const statusText =
      statusCode === 200
        ? "OK"
        : statusCode === 201
        ? "Created"
        : statusCode === 204
        ? "No Content"
        : statusCode >= 400 && statusCode < 500
        ? "Client Error"
        : statusCode >= 500
        ? "Server Error"
        : "Response";

    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      statusText,
      headers: parsedHeaders,
      body,
      elapsedMs: curlElapsedMs,
    };
  } catch (e: any) {
    const elapsed = (performance.now() - t0).toFixed(1);
    return {
      ok: false,
      status: 0,
      statusText: "Execution Failure",
      headers: [],
      body: `[Execution Error]\n${e.message}`,
      elapsedMs: elapsed,
      error: e.message,
    };
  }
}

export function createApiStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("API Studio Pro -- Enterprise HTTP & REST API Workbench", 1160, 900, {
    appId: "api_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  // Title Row
  win.beginRow();
  win.addHeading("API Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Request");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise HTTP Client, REST Endpoint Inspector & Load Benchmark Suite");

  // Presets & Environment Row
  win.beginGroupBox("Endpoint Presets & Environment Context");
  win.beginRow();
  win.addLabel("lbl_preset", "Quick Endpoints:");
  win.addDropdown(
    "dd_presets",
    [
      "1. JSONPlaceholder (GET /todos/1)",
      "2. JSONPlaceholder Create (POST /posts)",
      "3. GitHub API Status (GET /zen)",
      "4. HTTPBin Headers (GET /headers)",
      "5. HTTPBin Delay 1s (GET /delay/1)",
    ],
    "1. JSONPlaceholder (GET /todos/1)"
  ).width(340);
  win.addLabel("lbl_auth", "Auth Mode:");
  win.addDropdown("dd_auth", ["None", "Bearer Token", "Basic Auth", "API Key Header"], "None").width(180);
  win.addButton("btn_copy_curl", "📋 Copy cURL");
  win.endRow();
  win.endGroupBox();

  // Request Bar
  win.beginGroupBox("HTTP Request Configuration");
  win.beginRow();
  win.addLabel("lbl_method", "Method:");
  win.addDropdown("dd_method", ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"], "GET").width(120);
  win.addLabel("lbl_url", "Target URL:");
  win.addInput("txt_url", "https://jsonplaceholder.typicode.com/todos/1").width(520);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_headers", "Headers (Key: Value):");
  win.addInput("txt_headers", "Content-Type: application/json\nAccept: application/json").width(480);
  win.addButton("btn_send", "🚀 Send Request");
  win.addButton("btn_bench", "⚡ Benchmark (x10)");
  win.endRow();

  win.addLabel("lbl_req_body", "Request Body / Payload (JSON):");
  win.addTextarea("txt_req_body", "{\n  \"title\": \"Build native Mac GUI\",\n  \"body\": \"Enterprise REST workbench\",\n  \"userId\": 1\n}");
  win.endGroupBox();

  // Response Box & Export
  win.beginGroupBox("HTTP Response Body & Inspection");
  win.beginRow();
  win.addButton("btn_export_resp", "💾 Export Response JSON");
  win.addButton("btn_clear_resp", "Clear Response");
  win.endRow();
  win.addTextarea("txt_resp_body", "{\n  \"userId\": 1,\n  \"id\": 1,\n  \"title\": \"delectus aut autem\",\n  \"completed\": false\n}");
  win.endGroupBox();

  // Network Telemetry
  win.beginGroupBox("Response Headers & Network Benchmark Telemetry");
  win.addConsole("api_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Last Code: 200 OK  |  Latency: 42ms  |  Size: 83 bytes");
  win.endRow();

  let lastResponseText = "";

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("API request configuration saved!");
  });

  win.onClick("btn_clear_resp", () => {
    win.setText("txt_resp_body", "");
    lastResponseText = "";
  });

  win.addScript(`
    (function() {
      const btn = document.getElementById("btn_send");
      if (btn && !btn.dataset.wired) {
        btn.dataset.wired = "true";
        btn.addEventListener("click", function() {
          btn.disabled = true;
          btn.innerHTML = "<span>⏳</span> Dispatching...";
          const st = document.getElementById("lbl_status");
          if (st) st.innerText = "Status: Connecting to endpoint...";
        }, true);
      }
    })();
  `);

  const sendRequest = () => {
    const method = win.getValue("dd_method") || "GET";
    const url = win.getValue("txt_url") || "";
    const bodyStr = win.getValue("txt_req_body") || "";
    const headersRaw = win.getValue("txt_headers") || "";

    const resetBtn = () => {
      win.evalJS(`
        (function() {
          const btn = document.getElementById("btn_send");
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = "⚡ Send Request";
          }
        })();
      `);
    };

    if (!url) {
      win.toast("Please enter a valid URL");
      resetBtn();
      return;
    }

    win.appendConsole("api_console", `[HTTP Dispatch] ${method} ${url} initiating...\n`, 1);
    win.setStatus(`Connecting to ${url}...`);

    const headers: Record<string, string> = {};
    if (headersRaw) {
      headersRaw.split("\n").forEach((line: string) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > -1) {
          const k = line.slice(0, colonIdx).trim();
          const v = line.slice(colonIdx + 1).trim();
          if (k) headers[k] = v;
        }
      });
    }

    try {
      const res = executeCurlRequestSync(method, url, headers, bodyStr);
      lastResponseText = res.body;

      let formattedBody = res.body;
      try {
        const parsed = JSON.parse(res.body);
        formattedBody = JSON.stringify(parsed, null, 2);
      } catch {}

      win.setText("txt_resp_body", formattedBody);

      const headerPreview = res.headers.slice(0, 8).map(([k, v]) => `  ${k}: ${v}`).join("\n");
      win.appendConsole(
        "api_console",
        `[HTTP Response] ${res.status} ${res.statusText} in ${res.elapsedMs}ms (${res.body.length} bytes)\n[Headers]\n${headerPreview}\n`,
        res.ok ? 2 : 3
      );
      win.setText("lbl_status", `Status: HTTP ${res.status} ${res.statusText}  |  Latency: ${res.elapsedMs}ms  |  Size: ${res.body.length} bytes`);
      win.setStatus(`HTTP ${res.status} (${res.elapsedMs}ms)`);
      win.toast(`HTTP ${res.status} ${res.statusText}`);
    } catch (e: any) {
      win.setText("txt_resp_body", `[Network Error]\n${e.message}`);
      win.appendConsole("api_console", `[Connection Failure] ${e.message}\n`, 3);
      win.setStatus(`Connection Error: ${e.message}`);
      win.toast(`Error: ${e.message}`);
    } finally {
      resetBtn();
    }
  };

  win.onClick("btn_send", () => sendRequest());

  win.onClick("btn_copy_curl", () => {
    const method = win.getValue("dd_method") || "GET";
    const url = win.getValue("txt_url") || "";
    const headersRaw = win.getValue("txt_headers") || "";
    const body = win.getValue("txt_req_body") || "";

    const parts = [`curl -X ${method} "${url}"`];
    if (headersRaw) {
      headersRaw.split("\n").forEach((l: string) => {
        if (l.trim()) parts.push(`-H "${l.trim()}"`);
      });
    }
    if (method !== "GET" && method !== "HEAD" && body) {
      parts.push(`-d '${body.replace(/'/g, "\\'")}'`);
    }

    const curlCmd = parts.join(" \\\n  ");
    win.appendConsole("api_console", `[Generated cURL Command]\n${curlCmd}\n\n`, 1);
    win.toast("Generated cURL command in console");
  });

  win.onClick("btn_export_resp", () => {
    if (!lastResponseText) {
      win.toast("No response to export");
      return;
    }
    const outPath = resolve(process.cwd(), "api_response.json");
    try {
      writeFileSync(outPath, lastResponseText, "utf8");
      win.appendConsole("api_console", `[Export] Response saved to ${outPath}\n`, 2);
      win.toast(`Saved ${basename(outPath)}`);
    } catch (e: any) {
      win.appendConsole("api_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_bench", () => {
    const url = win.getValue("txt_url") || "";
    if (!url) return;

    win.appendConsole("api_console", `[Benchmark] Firing 10 parallel requests to ${url}...\n`, 1);
    win.setStatus("Running benchmark...");

    const t0 = performance.now();
    const script = `
      for i in {1..10}; do
        curl -s -o /dev/null -w "%{time_total}\\n" --connect-timeout 2 -m 5 "${url.replace(/"/g, '\\"')}" &
      done
      wait
    `;

    try {
      const proc = Bun.spawnSync(["bash", "-c", script]);
      const totalElapsed = (performance.now() - t0).toFixed(1);
      const latencies = proc.stdout
        .toString()
        .trim()
        .split("\n")
        .map((s) => parseFloat(s) * 1000)
        .filter((n) => !isNaN(n));

      if (latencies.length === 0) {
        throw new Error(proc.stderr.toString().trim() || "Benchmark produced no data");
      }

      const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);
      const min = Math.min(...latencies).toFixed(1);
      const max = Math.max(...latencies).toFixed(1);

      win.appendConsole(
        "api_console",
        `[Benchmark Completed] ${latencies.length} requests completed in ${totalElapsed}ms\n  Average Latency: ${avg}ms\n  Fastest (Min):   ${min}ms\n  Slowest (Max):   ${max}ms\n`,
        2
      );
      win.setStatus(`Benchmark complete (avg ${avg}ms)`);
      win.toast(`Benchmark complete: avg ${avg}ms`);
    } catch (e: any) {
      win.appendConsole("api_console", `[Benchmark Error] ${e.message}\n`, 3);
      win.setStatus("Benchmark Failed");
      win.toast("Benchmark Failed");
    }
  });

  win.onChange("dd_presets", (_w, choice: string) => {
    if (choice.includes("JSONPlaceholder (GET")) {
      win.setText("txt_url", "https://jsonplaceholder.typicode.com/todos/1");
      win.setText("dd_method", "GET");
    } else if (choice.includes("JSONPlaceholder Create")) {
      win.setText("txt_url", "https://jsonplaceholder.typicode.com/posts");
      win.setText("dd_method", "POST");
      win.setText("txt_req_body", "{\n  \"title\": \"Enterprise Bun App\",\n  \"body\": \"High-performance native GUI\",\n  \"userId\": 1\n}");
    } else if (choice.includes("GitHub API Status")) {
      win.setText("txt_url", "https://api.github.com/zen");
      win.setText("dd_method", "GET");
      win.setText("txt_headers", "User-Agent: Bun-RAD-Studio");
    } else if (choice.includes("HTTPBin Headers")) {
      win.setText("txt_url", "https://httpbin.org/headers");
      win.setText("dd_method", "GET");
    } else if (choice.includes("HTTPBin Delay")) {
      win.setText("txt_url", "https://httpbin.org/delay/1");
      win.setText("dd_method", "GET");
    }
    sendRequest();
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createApiStudio({ fullscreen: true });
  console.log("⚡ Launching API Studio Pro (Fullscreen)...");
  win.run();
}
