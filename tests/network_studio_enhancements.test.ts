import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parsePortSpec,
  summarizeScan,
  scanResultsToCsv,
  escapeHtml,
  httpStatusText,
  summarizeLatencies,
  daysUntil,
  describeCert,
  serviceName,
  checkPortsSync,
  tcpPingSync,
  reversePtrSync,
  getTlsCertSync,
} from "../src/network_tools";
import {
  createNetworkStudio,
  renderDnsHtml,
  renderDnsDossierHtml,
  renderHttpProbeHtml,
  renderPortScanHtml,
  sanitizeHost,
} from "../applications/network_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

let server: ReturnType<typeof Bun.listen>;
let openPort = 0;
let closedPort = 0;

beforeAll(() => {
  server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {}, open() {} } });
  openPort = server.port;
  const tmp = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {}, open() {} } });
  closedPort = tmp.port;
  tmp.stop(true);
});
afterAll(() => server.stop(true));

describe("port spec parsing", () => {
  test("lists, ranges, dedupe and sort", () => {
    expect(parsePortSpec("443, 22 80,22,8000-8002").ports).toEqual([22, 80, 443, 8000, 8001, 8002]);
    expect(parsePortSpec("1-3;5").ports).toEqual([1, 2, 3, 5]);
  });
  test("errors", () => {
    expect(parsePortSpec("").error).toContain("at least one");
    expect(parsePortSpec("abc").error).toContain("Invalid");
    expect(parsePortSpec("0").error).toContain("between 1 and 65535");
    expect(parsePortSpec("70000").error).toContain("between 1 and 65535");
    expect(parsePortSpec("90-80").error).toContain("greater than end");
    expect(parsePortSpec("1-2-3").error).toContain("Invalid");
  });
  test("caps huge ranges", () => {
    const r = parsePortSpec("1-65535");
    expect(r.ports.length).toBe(1024);
    expect(r.truncated).toBe(true);
    expect(r.ports[0]).toBe(1);
  });
});

describe("small helpers", () => {
  test("escapeHtml neutralises markup", () => {
    expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
    expect(escapeHtml(null)).toBe("");
  });
  test("httpStatusText and serviceName", () => {
    expect(httpStatusText(404)).toBe("Not Found");
    expect(httpStatusText(200)).toBe("OK");
    expect(httpStatusText(599)).toBe("HTTP 599");
    expect(serviceName(5432)).toBe("PostgreSQL");
    expect(serviceName(54321)).toBe("Custom");
  });
  test("scan summary and csv", () => {
    const r = [
      { port: 80, status: "OPEN" as const, latencyMs: 1.5 },
      { port: 81, status: "CLOSED" as const, latencyMs: 2 },
      { port: 82, status: "TIMEOUT" as const, latencyMs: 500 },
    ];
    expect(summarizeScan(r)).toEqual({ open: 1, closed: 1, timeout: 1 });
    const csv = scanResultsToCsv("h", r);
    expect(csv.split("\n")[0]).toBe("host,port,service,status,latency_ms");
    expect(csv).toContain('"h","80","HTTP","OPEN","1.5"');
  });
  test("latency statistics", () => {
    expect(summarizeLatencies([10, 20, null, 30])).toEqual({ sent: 4, received: 3, lossPct: 25, min: 10, avg: 20, max: 30, jitter: 10 });
    expect(summarizeLatencies([null, null]).lossPct).toBe(100);
    expect(summarizeLatencies([null, null]).avg).toBeNull();
    expect(summarizeLatencies([5]).jitter).toBe(0);
    expect(summarizeLatencies([]).lossPct).toBe(0);
  });
  test("daysUntil and describeCert verdicts", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(daysUntil("Jan 11 00:00:00 2026 GMT", now)).toBe(10);
    expect(daysUntil("garbage", now)).toBeNull();
    const base = { subject: { CN: "example.com" }, issuer: { O: "Test CA" }, authorized: true, validFrom: "x" };
    const row = (c: any, k: string) => describeCert(c, now).find((r) => r[0] === k)![1]!;
    expect(row({ ...base, validTo: "Jan 31 00:00:00 2026 GMT" }, "Expiry Status")).toContain("Valid for 30");
    expect(row({ ...base, validTo: "Jan 05 00:00:00 2026 GMT" }, "Expiry Status")).toContain("soon");
    expect(row({ ...base, validTo: "Dec 20 00:00:00 2025 GMT" }, "Expiry Status")).toContain("EXPIRED");
    expect(row({ ...base, authorized: false, authError: "self signed", validTo: "Jan 31 2026" }, "Trusted by System")).toContain("self signed");
    expect(describeCert({ error: "boom" })).toEqual([["Error", "boom"]]);
  });
});

describe("HTML output is escaped (remote data cannot inject markup)", () => {
  const evil = `<script>alert(1)</script>`;
  test("DNS TXT / host / source", () => {
    const html = renderDnsHtml({ host: evil, type: "TXT", records: [[evil]], elapsedMs: 1, source: evil, isNoData: false });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  test("DNS A / MX / SOA / NS", () => {
    for (const [type, records] of [["A", [evil]], ["NS", [evil]], ["MX", [{ exchange: evil, priority: 1 }]], ["SOA", { nsname: evil, hostmaster: evil }], ["CAA", [{ issue: evil }]]] as const) {
      const html = renderDnsHtml({ host: "h", type: type as any, records, elapsedMs: 1, source: "s", isNoData: false });
      expect(html).not.toContain("<script>");
    }
  });
  test("dossier", () => {
    const html = renderDnsDossierHtml(evil, [
      { host: "h", type: "A", records: [evil], elapsedMs: 1, source: "s", isNoData: false },
      { host: "h", type: "MX", records: [{ exchange: evil, priority: 1 }], elapsedMs: 1, source: "s", isNoData: false },
      { host: "h", type: "NS", records: [evil], elapsedMs: 1, source: "s", isNoData: false },
      { host: "h", type: "TXT", records: [[evil]], elapsedMs: 1, source: "s", isNoData: false },
      { host: "h", type: "SOA", records: { nsname: evil, hostmaster: evil }, elapsedMs: 1, source: "s", isNoData: false },
    ], 5);
    expect(html).not.toContain("<script>");
  });
  test("http headers, url, status text and port scan host", () => {
    const html = renderHttpProbeHtml(evil, 200, evil, "1", [[evil, evil]]);
    expect(html).not.toContain("<script>");
    expect(renderPortScanHtml(evil, [], 1)).not.toContain("<script>");
  });
  test("sanitizeHost still rejects markup", () => {
    expect(sanitizeHost(evil)).toBe("");
    expect(sanitizeHost("https://example.com:8080/x?y=1")).toBe("example.com");
  });
});

describe("network helpers against a local listener", () => {
  test("checkPortsSync finds open and closed ports", () => {
    const r = checkPortsSync("127.0.0.1", [closedPort, openPort], 400);
    const byPort = Object.fromEntries(r.map((x) => [x.port, x.status]));
    expect(byPort[openPort]).toBe("OPEN");
    expect(byPort[closedPort]).toBe("CLOSED");
    expect(checkPortsSync("127.0.0.1", [])).toEqual([]);
  });
  test("tcpPingSync measures replies and failures", () => {
    const ok = tcpPingSync("127.0.0.1", openPort, 3, 500);
    expect(ok.length).toBe(3);
    expect(ok.every((v) => typeof v === "number")).toBe(true);
    const bad = tcpPingSync("127.0.0.1", closedPort, 2, 300);
    expect(bad).toEqual([null, null]);
  });
  test("reverse DNS validates input", () => {
    expect(reversePtrSync("not-an-ip").error).toContain("IP address");
  });
  test("tls inspection reports errors cleanly for a non-TLS port", () => {
    const info = getTlsCertSync("127.0.0.1", openPort, 1200);
    expect(info.error).toBeTruthy();
  });
});

describe("Network Studio GUI toolkit", () => {
  const make = () => createNetworkStudio({ fullscreen: false });
  const raw = (w: SimpleWindow) => String(w.getValue("txt_net_results_raw"));

  test("renders the new controls", () => {
    const html = make().generateHtml();
    for (const id of ["txt_ports", "txt_timeout", "chk_open_only", "btn_scan_custom", "btn_tls_cert", "btn_tcp_ping", "btn_copy_report", "btn_export_diag", "btn_dns_caa", "btn_dns_ptr"]) {
      expect(html).toContain(id);
    }
  });

  test("custom port list scan", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_ports", `${closedPort},${openPort}`);
    win.setValue("txt_timeout", "400");
    await trigger(win, "btn_scan_custom");
    expect(raw(win)).toContain("PORT LIST SCAN: 127.0.0.1");
    expect(raw(win)).toMatch(new RegExp(`${openPort}\\s+Custom\\s+OPEN`));
    expect(raw(win)).toMatch(new RegExp(`${closedPort}\\s+Custom\\s+CLOSED`));
    expect(String(win.getValue("net_console"))).toContain("1 open, 1 closed");
  });

  test("open-only filter hides closed ports but reports them", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_ports", `${closedPort},${openPort}`);
    win.setValue("chk_open_only", true);
    await trigger(win, "btn_scan_custom");
    expect(raw(win)).toContain("OPEN");
    expect(raw(win)).not.toContain("CLOSED");
    expect(String(win.getValue("txt_net_results"))).toContain("1 closed/timeout hidden");
  });

  test("invalid port list or host does not scan", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_ports", "abc");
    win.setValue("txt_net_results_raw", "untouched");
    await trigger(win, "btn_scan_custom");
    expect(raw(win)).toBe("untouched");
    win.setValue("txt_ports", "80");
    win.setValue("txt_host", "bad host!;rm -rf");
    await trigger(win, "btn_scan_custom");
    await trigger(win, "btn_scan_socket");
    await trigger(win, "btn_scan_all");
    expect(raw(win)).toBe("untouched");
    expect(String(win.getValue("lbl_status"))).toBeDefined();
  });

  test("tcp ping against the local listener", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_port", String(openPort));
    await trigger(win, "btn_tcp_ping");
    expect(raw(win)).toContain("[TCP Ping] 127.0.0.1:" + openPort);
    expect(raw(win)).toContain("Packet Loss");
    expect(raw(win)).toContain("0%");
    expect(String(win.getValue("txt_net_results"))).not.toContain("<script>");
  });

  test("tls inspection of a non-TLS port shows an error card", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_port", String(openPort));
    await trigger(win, "btn_tls_cert");
    expect(raw(win)).toContain("[TLS Certificate]");
    expect(raw(win)).toContain("Error");
  });

  test("reverse DNS handler rejects hostnames and handles loopback", async () => {
    const win = make();
    win.setValue("txt_host", "example.com");
    await trigger(win, "btn_dns_ptr");
    expect(raw(win)).toContain("needs an IP");
    win.setValue("txt_host", "127.0.0.1");
    await trigger(win, "btn_dns_ptr");
    expect(raw(win)).toContain("[Reverse DNS] 127.0.0.1");
  });

  test("copy and save report", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_ports", String(openPort));
    await trigger(win, "btn_scan_custom");

    await trigger(win, "btn_copy_report");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netrep-"));
    (win as any).saveFile = (_o: any, cb: (p: string | null) => void) => cb(path.join(dir, "r.csv"));
    await trigger(win, "btn_export_diag");
    const csv = fs.readFileSync(path.join(dir, "r.csv"), "utf-8");
    expect(csv.split("\n")[0]).toBe("host,port,service,status,latency_ms");
    expect(csv).toContain(`"127.0.0.1","${openPort}"`);

    (win as any).saveFile = (_o: any, cb: (p: string | null) => void) => cb(path.join(dir, "r.txt"));
    await trigger(win, "btn_export_diag");
    expect(fs.readFileSync(path.join(dir, "r.txt"), "utf-8")).toContain("PORT LIST SCAN");

    (win as any).saveFile = (_o: any, cb: (p: string | null) => void) => cb(null);
    await trigger(win, "btn_export_diag"); // cancelled dialog is a no-op
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("single and top-port scans still work and remember results", async () => {
    const win = make();
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_port", String(openPort));
    await trigger(win, "btn_scan_socket");
    expect(raw(win)).toContain("[Socket Test Result]");
    expect(raw(win)).toContain("OPEN");
    await trigger(win, "btn_scan_all");
    expect(raw(win)).toContain("PORT SCAN AUDIT REPORT: 127.0.0.1");
  });
});

describe("TLS certificate inspection against a real TLS server", () => {
  test("reads subject, validity and trust from a self-signed cert", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nettls-"));
    const key = path.join(dir, "k.pem");
    const cert = path.join(dir, "c.pem");
    const gen = Bun.spawnSync(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "30", "-subj", "/CN=localhost"]);
    if (gen.exitCode !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return; } // openssl unavailable: skip
    // The server must live in another process: inspection runs synchronously and would block an in-process server.
    const srvFile = path.join(dir, "srv.ts");
    fs.writeFileSync(srvFile, `const s = Bun.serve({ port: 0, hostname: "127.0.0.1", tls: { cert: Bun.file(${JSON.stringify(cert)}), key: Bun.file(${JSON.stringify(key)}) }, fetch: () => new Response("ok") }); console.log(s.port);`);
    const proc = Bun.spawn([process.execPath, srvFile], { stdout: "pipe" });
    try {
      const port = parseInt(new TextDecoder().decode((await proc.stdout.getReader().read()).value).trim(), 10);
      const info = getTlsCertSync("127.0.0.1", port, 4000);
      expect(info.error).toBeUndefined();
      const rows = Object.fromEntries(describeCert(info));
      expect(rows["Subject (CN)"]).toBe("localhost");
      expect(rows["Expiry Status"]).toMatch(/Valid for (29|30) more/);
      expect(rows["Trusted by System"]).toContain("No");
      expect(rows["Protocol"]).toMatch(/TLS/);

      const win = createNetworkStudio({ fullscreen: false });
      win.setValue("txt_host", "127.0.0.1");
      win.setValue("txt_port", String(port));
      await trigger(win, "btn_tls_cert");
      expect(String(win.getValue("txt_net_results_raw"))).toContain("Subject (CN)");
      expect(String(win.getValue("net_console"))).toContain("Valid for");
    } finally {
      proc.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
