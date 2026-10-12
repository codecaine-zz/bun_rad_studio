import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync, readFileSync } from "fs";
import { basename } from "path";
import {
  isUnsafeMethod, formatBytes, clampInt, normalizeUrl, buildUrl, parseVariables, applyVariables,
  parseHeaderLines, applyAuth, withDefaultContentType, buildCurlCommand, parseCurlCommand, serializeRequest, parseRequestFile,
  runPool, summarizeBench, pushHistory, type HistoryEntry,
} from "../src/api_tools";
import { evaluateBunJsonQuery } from "./jq_studio";

export interface CurlResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  elapsedMs: string;
  error?: string;
}

export interface CurlOptions {
  follow?: boolean;
  insecure?: boolean;
  timeoutSec?: number;
}

export async function executeCurlRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyStr?: string,
  opts: CurlOptions = {}
): Promise<CurlResponse> {
  const t0 = performance.now();
  const timeout = opts.timeoutSec && opts.timeoutSec > 0 ? Math.floor(opts.timeoutSec) : 10;
  const args = [
    "curl",
    "-s",
    "-i",
    ...(opts.follow === false ? [] : ["-L"]),
    ...(opts.insecure ? ["-k"] : []),
    // Never let curl read local files (file://) or use other schemes, including via redirects.
    "--proto", "=http,https",
    "--proto-redir", "=http,https",
    "--connect-timeout", String(Math.min(4, timeout)),
    "-m", String(timeout),
    ...(method === "HEAD" ? ["-I"] : ["-X", method]),
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
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [rawOut, rawError, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const elapsed = (performance.now() - t0).toFixed(1);

    if (!rawOut && exitCode !== 0) {
      const err = rawError.trim() || `Curl process exited with code ${exitCode}`;
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
        if (/^HTTP\/\d/i.test(blocks[i]?.trim() ?? "")) {
          lastHeaderIdx = i;
        }
      }
      headerLines = (blocks[lastHeaderIdx] ?? "").split(/\r?\n/);
      body = blocks.slice(lastHeaderIdx + 1).join("\r\n\r\n");
    }

    const parsedHeaders: [string, string][] = [];
    for (let i = 1; i < headerLines.length; i++) {
      const line = headerLines[i];
      if (!line) continue;
      const colon = line.indexOf(":");
      if (colon > 0) {
        parsedHeaders.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
      }
    }

    const reason = (headerLines[0] ?? "").replace(/^HTTP\/\S+\s+\d+\s*/i, "").trim();
    const fallbackText: Record<number, string> = {
      200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
      400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
      409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway",
      503: "Service Unavailable", 504: "Gateway Timeout",
    };
    const statusText =
      reason ||
      fallbackText[statusCode] ||
      (statusCode >= 400 && statusCode < 500 ? "Client Error" : statusCode >= 500 ? "Server Error" : statusCode === 0 ? "No Response" : "Response");

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
  win.addButton("btn_save_req_file", "📄 Save Request File…");
  win.addButton("btn_load_req_file", "📂 Open Request File…");
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
  win.addInput("txt_auth", "", "token | user:pass | key").width(220);
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

  win.beginRow();
  win.addLabel("lbl_query", "Query parameters (key=value, one per line):");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_query", "", "page=1\nlimit=20").width(1060).height(70);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_req_body", "Request Body / Payload (JSON):");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_req_body", "{\n  \"title\": \"Build native Mac GUI\",\n  \"body\": \"Enterprise REST workbench\",\n  \"userId\": 1\n}").width(1060).height(150);
  win.endRow();
  win.beginRow();
  win.addButton("btn_format_body", "✨ Format JSON Body");
  win.endRow();
  win.endGroupBox();

  win.beginGroupBox("Variables, Options & Import");
  win.beginRow();
  win.addLabel("lbl_vars", "Variables (NAME=value per line; use {{NAME}}, {{$uuid}}, {{$timestamp}}, {{$randomInt}} anywhere):");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_vars", "", "baseUrl=https://jsonplaceholder.typicode.com\ntoken=abc123").width(1060).height(80);
  win.endRow();
  win.beginRow();
  win.addCheckbox("chk_follow", "Follow redirects", true);
  win.addCheckbox("chk_insecure", "Ignore TLS certificate errors", false);
  win.addCheckbox("chk_pretty", "Pretty-print JSON", true);
  win.addLabel("lbl_timeout", "Timeout (s):");
  win.addInput("txt_timeout", "10", "", { width: 70 });
  win.addLabel("lbl_bench_n", "Benchmark requests:");
  win.addInput("txt_bench_n", "10", "", { width: 70 });
  win.addLabel("lbl_bench_c", "Concurrency:");
  win.addInput("txt_bench_c", "10", "", { width: 70 });
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_curl_import", "Import cURL (paste a command, e.g. Chrome DevTools → Copy as cURL):");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_curl_import", "", "curl 'https://api.example.com/items' -H 'Accept: application/json'").width(1060).height(70);
  win.endRow();
  win.beginRow();
  win.addButton("btn_import_curl", "⬇ Import cURL");
  win.endRow();
  win.endGroupBox();

  // Response Box & Export
  win.beginGroupBox("HTTP Response Body & Inspection");
  win.beginRow();
  win.addButton("btn_copy_resp", "📋 Copy Response");
  win.addButton("btn_export_resp", "💾 Export Response JSON");
  win.addButton("btn_clear_resp", "Clear Response");
  win.addLabel("lbl_filter", "Filter (JSON path / query):");
  win.addInput("txt_filter", "", ".title").width(220);
  win.addButton("btn_apply_filter", "Apply Filter");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_resp_body", "{\n  \"userId\": 1,\n  \"id\": 1,\n  \"title\": \"delectus aut autem\",\n  \"completed\": false\n}").width(1060).height(220);
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_resp_headers", "Response headers:");
  win.endRow();
  win.addTable("tbl_resp_headers", ["Header", "Value"], [], { height: 150 });
  win.endGroupBox();

  win.beginGroupBox("Request History (click a row to restore it)");
  win.beginRow();
  win.addButton("btn_clear_history", "Clear History");
  win.endRow();
  win.addTable("tbl_history", ["#", "Method", "URL", "Status", "Time (ms)", "At"], [], { height: 130 });
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
  let history: HistoryEntry[] = [];
  let nextHistoryId = 1;
  const MAX_DISPLAY = 1_000_000;

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("API request configuration saved!");
  });

  win.onClick("btn_clear_resp", () => {
    win.setText("txt_resp_body", "");
    win.setTableData("tbl_resp_headers", ["Header", "Value"], []);
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

  const renderHistory = () => {
    win.setTableData(
      "tbl_history",
      ["#", "Method", "URL", "Status", "Time (ms)", "At"],
      history.map((h) => [`#${h.id}`, h.method, h.url, String(h.status), h.ms, h.time])
    );
  };

  /** Resolve variables, validate the URL, build the query string and auth. Returns null (after a toast) on error. */
  const prepareRequest = () => {
    const method = win.getValue("dd_method") || "GET";
    const vars = parseVariables(win.getValue("txt_vars") || "");
    const missing = new Set<string>();
    const sub = (s: string) => {
      const r = applyVariables(s, vars);
      r.missing.forEach((m) => missing.add(m));
      return r.text;
    };
    const rawUrl = sub((win.getValue("txt_url") || "").trim());
    const query = sub(win.getValue("txt_query") || "");
    const headersText = sub(win.getValue("txt_headers") || "");
    const body = sub(win.getValue("txt_req_body") || "");
    const mode = win.getValue("dd_auth") || "None";
    const cred = sub((win.getValue("txt_auth") || "").trim());
    if (missing.size) {
      win.toast(`Undefined variable(s): ${[...missing].join(", ")}`);
      return null;
    }
    if (!rawUrl) {
      win.toast("Please enter a valid URL");
      return null;
    }
    const norm = normalizeUrl(rawUrl);
    if (norm.error) {
      win.toast(norm.error);
      return null;
    }
    const url = buildUrl(norm.url, query);
    const headers = withDefaultContentType(applyAuth(parseHeaderLines(headersText), mode, cred), method, body);
    const opts: CurlOptions = {
      follow: win.getBool("chk_follow"),
      insecure: win.getBool("chk_insecure"),
      timeoutSec: clampInt(win.getValue("txt_timeout"), 1, 300, 10),
    };
    return { method, url, headers, body, opts };
  };

  const showBody = (text: string) => {
    let shown = text;
    let note = "";
    if (win.getBool("chk_pretty")) {
      try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    }
    if (shown.length > MAX_DISPLAY) {
      shown = shown.slice(0, MAX_DISPLAY);
      note = `\n\n… [display truncated at ${formatBytes(MAX_DISPLAY)}; Export saves the full response]`;
    }
    win.setText("txt_resp_body", shown + note);
  };

  const sendRequest = async () => {
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

    const req = prepareRequest();
    if (!req) {
      resetBtn();
      return;
    }
    const { method, url, headers, body: bodyStr, opts } = req;

    win.appendConsole("api_console", `[HTTP Dispatch] ${method} ${url} initiating...\n`, 1);
    win.setStatus(`Connecting to ${url}...`);

    try {
      const res = await executeCurlRequest(method, url, headers, bodyStr, opts);
      lastResponseText = res.body;
      showBody(res.body);
      win.setTableData("tbl_resp_headers", ["Header", "Value"], res.headers.map(([k, v]) => [k, v]));

      const headerPreview = res.headers.slice(0, 8).map(([k, v]) => `  ${k}: ${v}`).join("\n");
      win.appendConsole(
        "api_console",
        `[HTTP Response] ${res.status} ${res.statusText} in ${res.elapsedMs}ms (${res.body.length} bytes)\n[Headers]\n${headerPreview}\n`,
        res.ok ? 2 : 3
      );
      win.setText("lbl_status", `Status: HTTP ${res.status} ${res.statusText}  |  Latency: ${res.elapsedMs}ms  |  Size: ${formatBytes(res.body.length)}`);
      win.setStatus(`HTTP ${res.status} (${res.elapsedMs}ms)`);
      win.toast(`HTTP ${res.status} ${res.statusText}`);

      // History keeps the raw (unresolved) form inputs so variables stay editable.
      history = pushHistory(history, {
        id: nextHistoryId++,
        method,
        url: win.getValue("txt_url") || url,
        status: res.status,
        ms: res.elapsedMs,
        time: new Date().toLocaleTimeString(),
        headers: win.getValue("txt_headers") || "",
        body: win.getValue("txt_req_body") || "",
      });
      renderHistory();
    } catch (e: any) {
      win.setText("txt_resp_body", `[Network Error]\n${e.message}`);
      win.appendConsole("api_console", `[Connection Failure] ${e.message}\n`, 3);
      win.setStatus(`Connection Error: ${e.message}`);
      win.toast(`Error: ${e.message}`);
    } finally {
      resetBtn();
    }
  };

  win.onClick("btn_send", sendRequest);

  win.on("tbl_history", "click", (_w: any, pid: any) => {
    const id = parseInt(String(pid ?? "").replace(/^#/, ""), 10);
    const h = history.find((x) => x.id === id);
    if (!h) return;
    win.setValue("dd_method", h.method);
    win.setText("txt_url", h.url);
    win.setText("txt_headers", h.headers);
    win.setText("txt_req_body", h.body);
    win.toast(`Restored request #${h.id}`);
  });
  win.onClick("btn_clear_history", () => {
    history = [];
    renderHistory();
  });

  win.onClick("btn_copy_curl", () => {
    const req = prepareRequest();
    if (!req) return;
    const curlCmd = buildCurlCommand({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      follow: req.opts.follow,
      insecure: req.opts.insecure,
      timeoutSec: req.opts.timeoutSec,
    });
    win.appendConsole("api_console", `[Generated cURL Command]\n${curlCmd}\n\n`, 1);
    win.copyToClipboard(curlCmd);
    win.toast("cURL command copied to clipboard");
  });

  win.onClick("btn_import_curl", () => {
    try {
      const p = parseCurlCommand(win.getValue("txt_curl_import") || "");
      win.setValue("dd_method", p.method);
      win.setText("txt_url", p.url);
      win.setText("txt_headers", p.headers.map(([k, v]) => `${k}: ${v}`).join("\n"));
      win.setText("txt_req_body", p.body);
      win.setText("txt_query", "");
      if (p.authMode) {
        win.setValue("dd_auth", p.authMode);
        win.setText("txt_auth", p.authCred || "");
      }
      win.setBool("chk_follow", p.follow);
      win.setBool("chk_insecure", p.insecure);
      if (p.timeoutSec) win.setText("txt_timeout", String(p.timeoutSec));
      win.appendConsole("api_console", `[Import] ${p.method} ${p.url} (${p.headers.length} headers)\n`, 2);
      win.toast("cURL command imported");
    } catch (e: any) {
      win.appendConsole("api_console", `[Import Error] ${e.message}\n`, 3);
      win.toast(e.message);
    }
  });

  win.onClick("btn_save_req_file", () => {
    win.saveFile({ title: "Save API request", defaultName: "request.apireq.json" }, (p) => {
      if (!p) return;
      try {
        // Credentials (txt_auth) are deliberately NOT written to the file.
        writeFileSync(p, serializeRequest({
          method: win.getValue("dd_method") || "GET",
          url: win.getValue("txt_url") || "",
          headers: win.getValue("txt_headers") || "",
          body: win.getValue("txt_req_body") || "",
          query: win.getValue("txt_query") || "",
          vars: win.getValue("txt_vars") || "",
          authMode: win.getValue("dd_auth") || "None",
        }), "utf8");
        win.appendConsole("api_console", `[Save] Request saved to ${p} (credentials not included)\n`, 2);
        win.toast(`Saved ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("api_console", `[Save Error] ${e.message}\n`, 3);
        win.toast(`Save failed: ${e.message}`);
      }
    });
  });

  win.onClick("btn_load_req_file", () => {
    win.openFile({ title: "Open API request" }, (p) => {
      if (!p) return;
      try {
        const r = parseRequestFile(readFileSync(p, "utf8"));
        win.setValue("dd_method", r.method);
        win.setText("txt_url", r.url);
        win.setText("txt_headers", r.headers);
        win.setText("txt_req_body", r.body);
        win.setText("txt_query", r.query);
        win.setText("txt_vars", r.vars);
        win.setValue("dd_auth", r.authMode);
        win.appendConsole("api_console", `[Open] Loaded ${p}${r.authMode !== "None" ? " (re-enter your credential)" : ""}\n`, 2);
        win.toast(`Loaded ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("api_console", `[Open Error] ${e.message}\n`, 3);
        win.toast(e.message);
      }
    });
  });

  win.onClick("btn_format_body", () => {
    const t = win.getValue("txt_req_body") || "";
    try {
      win.setText("txt_req_body", JSON.stringify(JSON.parse(t), null, 2));
      win.toast("Body formatted");
    } catch (e: any) {
      win.toast(`Body is not valid JSON: ${e.message}`);
    }
  });

  win.onClick("btn_copy_resp", () => {
    if (!lastResponseText) {
      win.toast("No response to copy");
      return;
    }
    win.copyToClipboard(lastResponseText);
    win.toast("Response copied to clipboard");
  });

  win.onClick("btn_apply_filter", () => {
    const q = (win.getValue("txt_filter") || "").trim();
    if (!lastResponseText) {
      win.toast("No response to filter");
      return;
    }
    if (!q) {
      showBody(lastResponseText);
      return;
    }
    try {
      const result = evaluateBunJsonQuery(JSON.parse(lastResponseText), q);
      win.setText("txt_resp_body", typeof result === "string" ? result : JSON.stringify(result, null, 2));
    } catch (e: any) {
      win.toast(`Filter failed: ${e.message}`);
    }
  });

  win.onClick("btn_export_resp", () => {
    if (!lastResponseText) {
      win.toast("No response to export");
      return;
    }
    win.saveFile({ title: "Save response", defaultName: "api_response.json" }, (p) => {
      if (!p) return;
      try {
        writeFileSync(p, lastResponseText, "utf8");
        win.appendConsole("api_console", `[Export] Response saved to ${p}\n`, 2);
        win.toast(`Saved ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("api_console", `[Export Error] ${e.message}\n`, 3);
        win.toast(`Export failed: ${e.message}`);
      }
    });
  });

  win.onClick("btn_bench", async () => {
    const req = prepareRequest();
    if (!req) return;
    const { method, url, headers, body: bodyStr, opts } = req;
    const N = clampInt(win.getValue("txt_bench_n"), 1, 200, 10);
    const C = clampInt(win.getValue("txt_bench_c"), 1, 20, 10);

    if (isUnsafeMethod(method)) {
      const ok = await win.confirm(`This will send ${N} ${method} requests to ${url}. ${method} can change data on the server. Continue?`, "Benchmark a non-GET method");
      if (!ok) {
        win.appendConsole("api_console", `[Benchmark] Cancelled (${method} not confirmed)\n`, 1);
        return;
      }
    }

    win.appendConsole("api_console", `[Benchmark] Firing ${N} ${method} requests (${C} at a time) to ${url}...\n`, 1);
    win.setStatus("Running benchmark...");

    const t0 = performance.now();
    try {
      const results = await runPool(N, C, () => executeCurlRequest(method, url, headers, bodyStr, opts));
      const totalMs = performance.now() - t0;
      const totalElapsed = totalMs.toFixed(1);
      const ok = results.filter((r) => r.ok);
      const latencies = results.filter((r) => r.status > 0).map((r) => parseFloat(r.elapsedMs)).filter((n) => !isNaN(n));
      const st = summarizeBench(latencies, totalMs);
      if (!st) throw new Error(results[0]?.error || "No successful responses");

      win.appendConsole(
        "api_console",
        `[Benchmark Completed] ${results.length} requests completed in ${totalElapsed}ms | Success (2xx): ${ok.length}/${results.length}\n  Average: ${st.avg}ms  Min: ${st.min}ms  p50: ${st.p50}ms  p95: ${st.p95}ms  p99: ${st.p99}ms  Max: ${st.max}ms  Throughput: ${st.rps} req/s\n`,
        ok.length === results.length ? 2 : 3
      );
      win.setStatus(`Benchmark complete (avg ${st.avg}ms, ${ok.length}/${results.length} OK)`);
      win.toast(`Benchmark complete: avg ${st.avg}ms`);
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
    void sendRequest();
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createApiStudio({ fullscreen: true });
  console.log("⚡ Launching API Studio Pro (Fullscreen)...");
  win.run();
}
