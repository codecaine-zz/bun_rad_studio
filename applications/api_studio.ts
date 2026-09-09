import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";

export function createApiStudio(): SimpleWindow {
  const win = newSimpleWindow("API Studio Pro -- REST API & Benchmark Workbench", 1140, 880, {
    appId: "api_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("API Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Request Bar
  win.beginGroupBox("HTTP Request Configuration");
  win.beginRow();
  win.addLabel("lbl_method", "Method:");
  win.addDropdown("dd_method", ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"], "GET").width(110);
  win.addLabel("lbl_url", "Target URL:");
  win.addInput("txt_url", "https://jsonplaceholder.typicode.com/todos/1").width(520);
  win.endRow();

  win.beginRow();
  win.addButton("btn_send", "🚀 Send Request");
  win.addButton("btn_bench", "⚡ Benchmark (x10)");
  win.addLabel("lbl_headers", "Headers:");
  win.addInput("txt_headers", "Content-Type: application/json").width(320);
  win.endRow();

  win.addLabel("lbl_req_body", "Request Payload / Body:");
  win.addTextarea("txt_req_body", "{\n  \"title\": \"Build native Mac GUI\",\n  \"completed\": false\n}");
  win.endGroupBox();

  // Response Box
  win.beginGroupBox("HTTP Response Body & Inspector");
  win.addTextarea("txt_resp_body", "{\n  \"userId\": 1,\n  \"id\": 1,\n  \"title\": \"delectus aut autem\",\n  \"completed\": false\n}");
  win.endGroupBox();

  // Execution Telemetry
  win.beginGroupBox("Network Telemetry & Response Headers");
  win.addConsole("api_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Last Code: 200 OK  |  Latency: 42ms  |  Size: 83 bytes");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("API Studio state saved successfully!");
  });

  const sendRequest = async () => {
    const method = win.getValue("dd_method") || "GET";
    const url = win.getValue("txt_url") || "";
    const bodyStr = win.getValue("txt_req_body") || "";
    const headersRaw = win.getValue("txt_headers") || "";

    if (!url) {
      win.toast("Please enter a valid URL");
      return;
    }

    win.appendConsole("api_console", `[API Studio] ${method} ${url} initiating...\n`, 1);
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

    const t0 = performance.now();
    try {
      const init: RequestInit = {
        method,
        headers,
      };
      if (method !== "GET" && method !== "HEAD" && bodyStr) {
        init.body = bodyStr;
      }

      const res = await fetch(url, init);
      const elapsed = (performance.now() - t0).toFixed(1);
      const text = await res.text();

      let formattedBody = text;
      try {
        const parsed = JSON.parse(text);
        formattedBody = JSON.stringify(parsed, null, 2);
      } catch {}

      win.setText("txt_resp_body", formattedBody);
      win.appendConsole("api_console", `[API Studio] HTTP ${res.status} ${res.statusText} (${elapsed}ms, ${text.length} bytes)\n`, res.ok ? 2 : 3);
      win.setText("lbl_status", `Status: HTTP ${res.status}  |  Latency: ${elapsed}ms  |  Size: ${text.length} bytes`);
      win.setStatus(`HTTP ${res.status} (${elapsed}ms)`);
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(1);
      win.setText("txt_resp_body", `[Network Fetch Error]\n${e.message}`);
      win.appendConsole("api_console", `[API Studio Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus(`Connection Error: ${e.message}`);
    }
  };

  win.onClick("btn_send", () => sendRequest());

  win.onClick("btn_bench", async () => {
    const url = win.getValue("txt_url") || "";
    if (!url) return;

    win.appendConsole("api_console", `[Benchmark] Running 10 concurrent requests to ${url}...\n`, 1);
    win.setStatus("Running benchmark...");

    const t0 = performance.now();
    const latencies: number[] = [];

    const promises = Array.from({ length: 10 }).map(async () => {
      const reqStart = performance.now();
      try {
        await fetch(url);
        latencies.push(performance.now() - reqStart);
      } catch {
        latencies.push(9999);
      }
    });

    await Promise.all(promises);
    const totalElapsed = (performance.now() - t0).toFixed(1);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);
    const min = Math.min(...latencies).toFixed(1);
    const max = Math.max(...latencies).toFixed(1);

    win.appendConsole("api_console", `[Benchmark Results] 10 requests finished in ${totalElapsed}ms\n  Average: ${avg}ms | Min: ${min}ms | Max: ${max}ms\n`, 2);
    win.setStatus(`Benchmark complete (avg ${avg}ms)`);
  });

  return win;
}

if (import.meta.main) {
  const win = createApiStudio();
  console.log("Launching API Studio Pro...");
  win.run();
}
