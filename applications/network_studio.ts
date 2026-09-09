import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import * as dns from "dns/promises";
import * as net from "net";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

interface PortScanResult {
  port: number;
  service: string;
  status: "OPEN" | "CLOSED" | "TIMEOUT";
  latencyMs: number;
}

const COMMON_PORTS = [
  { port: 21, service: "FTP" },
  { port: 22, service: "SSH" },
  { port: 53, service: "DNS" },
  { port: 80, service: "HTTP" },
  { port: 443, service: "HTTPS" },
  { port: 3000, service: "Node/Vite Dev" },
  { port: 3306, service: "MySQL" },
  { port: 5432, service: "PostgreSQL" },
  { port: 6379, service: "Redis" },
  { port: 8000, service: "Django/FastAPI" },
  { port: 8080, service: "HTTP Proxy/Dev" },
  { port: 27017, service: "MongoDB" },
];

function checkSocket(host: string, port: number, timeoutMs = 800): Promise<PortScanResult> {
  const service = COMMON_PORTS.find((p) => p.port === port)?.service || "Custom";
  return new Promise((res) => {
    const t0 = performance.now();
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!settled) {
        settled = true;
        const latency = parseFloat((performance.now() - t0).toFixed(1));
        socket.destroy();
        res({ port, service, status: "OPEN", latencyMs: latency });
      }
    });

    socket.on("timeout", () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        res({ port, service, status: "TIMEOUT", latencyMs: timeoutMs });
      }
    });

    socket.on("error", () => {
      if (!settled) {
        settled = true;
        const latency = parseFloat((performance.now() - t0).toFixed(1));
        socket.destroy();
        res({ port, service, status: "CLOSED", latencyMs: latency });
      }
    });

    try {
      socket.connect(port, host);
    } catch {
      res({ port, service, status: "CLOSED", latencyMs: 0 });
    }
  });
}

export function createNetworkStudio(): SimpleWindow {
  const win = newSimpleWindow("Network Forensics Studio Pro -- Socket Scanner & DNS Inspector", 1140, 880, {
    appId: "network_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Top Bar
  win.beginRow();
  win.addHeading("Network Forensics Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Enterprise Socket Diagnostics, DNS Lookup & HTTP Latency Probe (Native Bun)");

  // Target Input Row
  win.beginGroupBox("Target Host & Protocol Configuration");
  win.beginRow();
  win.addLabel("lbl_host", "Target Host / Domain:");
  win.addInput("txt_host", "localhost").width(280);
  win.addLabel("lbl_port", "Port / Range:");
  win.addInput("txt_port", "3000").width(120);
  win.addButton("btn_ping_http", "⚡ HTTP Probe");
  win.addButton("btn_scan_socket", "🔌 Scan Port");
  win.addButton("btn_scan_all", "🌐 Scan Top Ports");
  win.endRow();
  win.endGroupBox();

  // DNS Actions Row
  win.beginGroupBox("DNS Forensics & Record Inspector (node:dns)");
  win.beginRow();
  win.addButton("btn_dns_a", "A Records (IPv4)");
  win.addButton("btn_dns_aaaa", "AAAA (IPv6)");
  win.addButton("btn_dns_mx", "MX (Mail)");
  win.addButton("btn_dns_txt", "TXT Records");
  win.addButton("btn_dns_ns", "NS (NameServers)");
  win.addButton("btn_clear_diag", "Clear Output");
  win.addButton("btn_export_diag", "📋 Export Report");
  win.endRow();
  win.endGroupBox();

  // Results View
  win.beginGroupBox("Network Diagnostics & Telemetry Stream");
  win.addTextarea(
    "txt_net_results",
    `[Network Forensics Studio Initialized]\nTarget host: localhost\nSupported tools: TCP Socket Probing, DNS Query (A/AAAA/MX/TXT/NS), HTTP TTFB Latency.\nReady for network inspection.\n`
  );
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Activity & Socket Connection Audit");
  win.addConsole("net_console", 120);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Interface: Active  |  Engine: Native Bun Socket & DNS");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Network configuration saved!");
  });

  win.onClick("btn_clear_diag", () => {
    win.setText("txt_net_results", "");
    win.appendConsole("net_console", "[Network] Output cleared\n", 4);
  });

  win.onClick("btn_scan_socket", async () => {
    const host = win.getValue("txt_host") || "localhost";
    const port = parseInt(win.getValue("txt_port") || "3000", 10);

    win.appendConsole("net_console", `[Scan] Connecting to ${host}:${port}...\n`, 1);
    win.setStatus(`Testing socket ${host}:${port}...`);

    const res = await checkSocket(host, port);
    const symbol = res.status === "OPEN" ? "🟢 OPEN" : res.status === "TIMEOUT" ? "🟡 TIMEOUT" : "🔴 CLOSED";
    const report = `[Socket Test Result]\nHost:    ${host}\nPort:    ${port} (${res.service})\nStatus:  ${symbol}\nLatency: ${res.latencyMs}ms\n`;

    win.setText("txt_net_results", report);
    win.appendConsole("net_console", `[Scan Result] ${host}:${port} is ${res.status} (${res.latencyMs}ms)\n`, res.status === "OPEN" ? 2 : 3);
    win.setStatus(`${host}:${port} -> ${res.status}`);
  });

  win.onClick("btn_scan_all", async () => {
    const host = win.getValue("txt_host") || "localhost";
    win.appendConsole("net_console", `[Batch Scan] Scanning ${COMMON_PORTS.length} common services on ${host}...\n`, 1);
    win.setStatus(`Scanning common ports on ${host}...`);

    const lines: string[] = [
      `========================================================================`,
      `PORT SCAN AUDIT REPORT: ${host}`,
      `Timestamp: ${new Date().toISOString()}`,
      `========================================================================`,
      `PORT      SERVICE              STATUS       LATENCY`,
      `────────────────────────────────────────────────────────────────────────`,
    ];

    for (const p of COMMON_PORTS) {
      const res = await checkSocket(host, p.port, 400);
      const portStr = String(res.port).padEnd(9);
      const svcStr = res.service.padEnd(20);
      const statStr = (res.status === "OPEN" ? "🟢 OPEN   " : res.status === "TIMEOUT" ? "🟡 TIMEOUT" : "🔴 CLOSED ").padEnd(12);
      lines.push(`${portStr} ${svcStr} ${statStr} ${res.latencyMs}ms`);
    }

    win.setText("txt_net_results", lines.join("\n"));
    win.appendConsole("net_console", `[Batch Scan] Finished auditing ${COMMON_PORTS.length} ports on ${host}\n`, 2);
    win.setStatus("Scan completed");
  });

  win.onClick("btn_ping_http", async () => {
    const rawHost = win.getValue("txt_host") || "localhost";
    const url = rawHost.startsWith("http") ? rawHost : `http://${rawHost}`;

    win.appendConsole("net_console", `[HTTP Probe] Sending probe request to ${url}...\n`, 1);
    win.setStatus(`Probing ${url}...`);

    const t0 = performance.now();
    try {
      const resp = await fetch(url, { method: "HEAD" });
      const elapsed = (performance.now() - t0).toFixed(2);
      const headers: string[] = [];
      resp.headers.forEach((val, key) => headers.push(`  ${key}: ${val}`));

      const report = [
        `[HTTP Probe Response]`,
        `URL:             ${url}`,
        `Status Code:     ${resp.status} ${resp.statusText}`,
        `Total Latency:   ${elapsed}ms`,
        `Response Headers:`,
        ...headers,
      ].join("\n");

      win.setText("txt_net_results", report);
      win.appendConsole("net_console", `[HTTP Probe] ${resp.status} in ${elapsed}ms\n`, 2);
      win.setStatus(`HTTP ${resp.status} (${elapsed}ms)`);
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_net_results", `[HTTP Probe Failed]\nTarget:  ${url}\nLatency: ${elapsed}ms\nError:   ${e.message}`);
      win.appendConsole("net_console", `[HTTP Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus("Probe failed");
    }
  });

  const queryDns = async (type: "A" | "AAAA" | "MX" | "TXT" | "NS") => {
    const host = win.getValue("txt_host") || "google.com";
    win.appendConsole("net_console", `[DNS] Resolving ${type} records for ${host}...\n`, 1);
    win.setStatus(`Resolving ${type} for ${host}...`);

    const t0 = performance.now();
    try {
      let records: any;
      if (type === "A") records = await dns.resolve4(host);
      else if (type === "AAAA") records = await dns.resolve6(host);
      else if (type === "MX") records = await dns.resolveMx(host);
      else if (type === "TXT") records = await dns.resolveTxt(host);
      else if (type === "NS") records = await dns.resolveNs(host);

      const elapsed = (performance.now() - t0).toFixed(2);
      const formatted = [
        `========================================================================`,
        `DNS ${type} RECORDS: ${host} (Resolved in ${elapsed}ms)`,
        `========================================================================`,
        JSON.stringify(records, null, 2),
      ].join("\n");

      win.setText("txt_net_results", formatted);
      win.appendConsole("net_console", `[DNS Success] Retrieved ${type} records in ${elapsed}ms\n`, 2);
      win.setStatus(`DNS ${type} OK (${elapsed}ms)`);
    } catch (err: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_net_results", `[DNS Lookup Failed]\nHost:    ${host}\nRecord:  ${type}\nLatency: ${elapsed}ms\nError:   ${err.message}`);
      win.appendConsole("net_console", `[DNS Error] ${err.message}\n`, 3);
      win.setStatus(`DNS error`);
    }
  };

  win.onClick("btn_dns_a", () => queryDns("A"));
  win.onClick("btn_dns_aaaa", () => queryDns("AAAA"));
  win.onClick("btn_dns_mx", () => queryDns("MX"));
  win.onClick("btn_dns_txt", () => queryDns("TXT"));
  win.onClick("btn_dns_ns", () => queryDns("NS"));

  win.onClick("btn_export_diag", () => {
    const content = win.getValue("txt_net_results") || "";
    if (!content.trim()) {
      win.toast("No diagnostics output to export");
      return;
    }
    const exportPath = resolve(process.cwd(), "network_report.txt");
    try {
      writeFileSync(exportPath, content, "utf8");
      win.appendConsole("net_console", `[Export] Saved network report to ${exportPath}\n`, 2);
      win.toast(`Report saved: ${basename(exportPath)}`);
    } catch (e: any) {
      win.appendConsole("net_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  return win;
}

if (import.meta.main) {
  const win = createNetworkStudio();
  console.log("⚡ Launching Network Forensics Studio...");
  win.run();
}
