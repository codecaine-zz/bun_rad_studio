import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import * as dns from "dns/promises";
import * as nodeDns from "dns";
import * as net from "net";
import * as os from "os";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

interface PortScanResult {
  port: number;
  service: string;
  status: "OPEN" | "CLOSED" | "TIMEOUT";
  latencyMs: number;
}

interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  family: string;
  mac: string;
  internal: boolean;
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

function getLocalInterfaces(): NetworkInterfaceInfo[] {
  const ifaces = os.networkInterfaces();
  const res: NetworkInterfaceInfo[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!list) continue;
    for (const item of list) {
      if (item.family === "IPv4" || (item.family === "IPv6" && !item.address.startsWith("fe80:"))) {
        res.push({
          name,
          ip: item.address,
          family: item.family,
          mac: item.mac,
          internal: item.internal,
        });
      }
    }
  }
  return res;
}

export function sanitizeHost(raw: string): string {
  if (!raw) return "";
  let h = raw.trim();
  h = h.replace(/^[a-zA-Z]+:\/\//, "");
  h = h.split("/")[0].split("?")[0].split("#")[0];
  if (/^[^:]+:\d+$/.test(h)) {
    h = h.split(":")[0];
  }
  h = h.replace(/^\[|\]$/g, "");
  return h.trim();
}

export function checkSocketSync(host: string, port: number, timeoutMs = 800): PortScanResult {
  const service = COMMON_PORTS.find((p) => p.port === port)?.service || "Custom";
  const cleanHost = sanitizeHost(host) || "127.0.0.1";
  const targetHost = cleanHost === "localhost" ? "127.0.0.1" : cleanHost;

  const script = `
    import * as net from "node:net";
    const socket = new net.Socket();
    const t0 = performance.now();
    let settled = false;
    socket.setTimeout(${timeoutMs});
    socket.on("connect", () => {
      if (!settled) {
        settled = true;
        const latency = parseFloat((performance.now() - t0).toFixed(1));
        socket.destroy();
        console.log(JSON.stringify({ port: ${port}, service: "${service}", status: "OPEN", latencyMs: latency }));
      }
    });
    socket.on("timeout", () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        console.log(JSON.stringify({ port: ${port}, service: "${service}", status: "TIMEOUT", latencyMs: ${timeoutMs} }));
      }
    });
    socket.on("error", () => {
      if (!settled) {
        settled = true;
        const latency = parseFloat((performance.now() - t0).toFixed(1));
        socket.destroy();
        console.log(JSON.stringify({ port: ${port}, service: "${service}", status: "CLOSED", latencyMs: latency }));
      }
    });
    try { socket.connect(${port}, "${targetHost}"); } catch { console.log(JSON.stringify({ port: ${port}, service: "${service}", status: "CLOSED", latencyMs: 0 })); }
  `;

  try {
    const proc = Bun.spawnSync(["bun", "-e", script]);
    const out = proc.stdout.toString().trim();
    if (out) return JSON.parse(out);
  } catch {}
  return { port, service, status: "CLOSED", latencyMs: 0 };
}

export function checkSocket(host: string, port: number, timeoutMs = 800): Promise<PortScanResult> {
  return Promise.resolve(checkSocketSync(host, port, timeoutMs));
}

export function checkCommonSocketsSync(host: string): PortScanResult[] {
  const cleanHost = sanitizeHost(host) || "127.0.0.1";
  const targetHost = cleanHost === "localhost" ? "127.0.0.1" : cleanHost;

  const script = `
    import * as net from "node:net";
    const ports = ${JSON.stringify(COMMON_PORTS)};
    const host = "${targetHost}";
    function probe(item) {
      return new Promise((res) => {
        const t0 = performance.now();
        const socket = new net.Socket();
        let settled = false;
        socket.setTimeout(400);
        socket.on("connect", () => {
          if (!settled) {
            settled = true;
            const latency = parseFloat((performance.now() - t0).toFixed(1));
            socket.destroy();
            res({ port: item.port, service: item.service, status: "OPEN", latencyMs: latency });
          }
        });
        socket.on("timeout", () => {
          if (!settled) {
            settled = true;
            socket.destroy();
            res({ port: item.port, service: item.service, status: "TIMEOUT", latencyMs: 400 });
          }
        });
        socket.on("error", () => {
          if (!settled) {
            settled = true;
            const latency = parseFloat((performance.now() - t0).toFixed(1));
            socket.destroy();
            res({ port: item.port, service: item.service, status: "CLOSED", latencyMs: latency });
          }
        });
        try { socket.connect(item.port, host); } catch { res({ port: item.port, service: item.service, status: "CLOSED", latencyMs: 0 }); }
      });
    }
    Promise.all(ports.map(probe)).then((results) => console.log(JSON.stringify(results)));
  `;

  try {
    const proc = Bun.spawnSync(["bun", "-e", script]);
    const out = proc.stdout.toString().trim();
    if (out) return JSON.parse(out);
  } catch {}
  return COMMON_PORTS.map((p) => ({ port: p.port, service: p.service, status: "CLOSED", latencyMs: 0 }));
}

function renderBaselineHtml(host: string, port: number, ifaces: NetworkInterfaceInfo[]): string {
  const primaryIpv4 = ifaces.find((i) => !i.internal && i.family === "IPv4")?.ip || "127.0.0.1";
  const primaryIface = ifaces.find((i) => !i.internal && i.family === "IPv4")?.name || "lo0";

  const ifaceRows = ifaces
    .slice(0, 6)
    .map(
      (i) => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 6px 10px; font-weight: 600; color: #38bdf8;">${i.name}</td>
        <td style="padding: 6px 10px; font-family: ui-monospace, monospace; color: #f1f5f9;">${i.ip}</td>
        <td style="padding: 6px 10px;"><span style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${i.family}</span></td>
        <td style="padding: 6px 10px; font-family: ui-monospace, monospace; color: #94a3b8; font-size: 11px;">${i.mac || "N/A"}</td>
        <td style="padding: 6px 10px;">${i.internal ? '<span style="color: #cbd5e1;">Loopback</span>' : '<span style="color: #4ade80; font-weight: 600;">Active Link</span>'}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">⚡</span>
          <div>
            <div style="font-weight: 700; color: #34d399; font-size: 14px;">Network Forensics Engine Active</div>
            <div style="font-size: 12px; color: #94a3b8;">Local IP: <b style="color: #f1f5f9;">${primaryIpv4}</b> (${primaryIface}) | Ready to probe target: <b style="color: #38bdf8;">${host}:${port}</b></div>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="background: #059669; color: #ffffff; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Ready</span>
        </div>
      </div>

      <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Detected Network Interfaces & Adapters:</div>
      <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
              <th style="padding: 6px 10px;">Interface</th>
              <th style="padding: 6px 10px;">IP Address</th>
              <th style="padding: 6px 10px;">Protocol</th>
              <th style="padding: 6px 10px;">MAC Address</th>
              <th style="padding: 6px 10px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${ifaceRows}
          </tbody>
        </table>
      </div>

      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
        💡 <b>Quick Actions</b>: Click <b>🔌 Scan Port</b> or <b>🌐 Scan Top Ports</b> above to audit open services on <code style="color: #38bdf8;">${host}</code>, or click any <b>DNS Record</b> button to resolve upstream addresses instantly.
      </div>
    </div>
  `;
}

function renderPortScanHtml(host: string, results: PortScanResult[], elapsedTotal: number): string {
  const openCount = results.filter((r) => r.status === "OPEN").length;
  const closedCount = results.filter((r) => r.status === "CLOSED").length;
  const timeoutCount = results.filter((r) => r.status === "TIMEOUT").length;

  const rows = results
    .map((r) => {
      const badge =
        r.status === "OPEN"
          ? '<span style="background: rgba(34,197,94,0.18); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">🟢 OPEN</span>'
          : r.status === "TIMEOUT"
          ? '<span style="background: rgba(234,179,8,0.18); color: #facc15; border: 1px solid rgba(234,179,8,0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">🟡 TIMEOUT</span>'
          : '<span style="background: rgba(239,68,68,0.18); color: #f87171; border: 1px solid rgba(239,68,68,0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">🔴 CLOSED</span>';

      const latencyColor = r.latencyMs < 50 ? "#4ade80" : r.latencyMs < 200 ? "#facc15" : "#94a3b8";

      return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 5px 10px; font-family: ui-monospace, monospace; font-weight: 700; color: #f1f5f9;">${r.port}</td>
        <td style="padding: 5px 10px; color: #38bdf8;">${r.service}</td>
        <td style="padding: 5px 10px;">${badge}</td>
        <td style="padding: 5px 10px; font-family: ui-monospace, monospace; color: ${latencyColor}; font-weight: 600;">${r.latencyMs}ms</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 700; font-size: 14px; color: #f1f5f9;">Port Scan Audit: <span style="color: #38bdf8; font-family: monospace;">${host}</span></div>
          <div style="font-size: 12px; color: #94a3b8;">Audited ${results.length} ports in <b style="color: #f1f5f9;">${elapsedTotal.toFixed(1)}ms</b></div>
        </div>
        <div style="display: flex; gap: 8px;">
          <span style="background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">${openCount} Open</span>
          <span style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">${closedCount} Closed</span>
          ${timeoutCount > 0 ? `<span style="background: rgba(234,179,8,0.2); color: #facc15; border: 1px solid rgba(234,179,8,0.4); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">${timeoutCount} Timeout</span>` : ""}
        </div>
      </div>

      <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
              <th style="padding: 6px 10px;">Port</th>
              <th style="padding: 6px 10px;">Standard Service</th>
              <th style="padding: 6px 10px;">State</th>
              <th style="padding: 6px 10px;">Round-Trip Latency</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export type DnsRecordType = "A" | "AAAA" | "MX" | "TXT" | "NS" | "SOA" | "CNAME";

export interface DnsResolveResult {
  host: string;
  type: DnsRecordType;
  records: any;
  elapsedMs: number;
  source: string;
  isNoData: boolean;
}

export function resolveDnsRecordSync(host: string, type: DnsRecordType): DnsResolveResult {
  const cleanHost = sanitizeHost(host) || "google.com";

  if (cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "::1") {
    if (type === "A") {
      return { host: cleanHost, type, records: ["127.0.0.1"], elapsedMs: 0.1, source: "Local Loopback", isNoData: false };
    }
    if (type === "AAAA") {
      return { host: cleanHost, type, records: ["::1"], elapsedMs: 0.1, source: "Local Loopback", isNoData: false };
    }
    return { host: cleanHost, type, records: [], elapsedMs: 0.1, source: "Local Loopback", isNoData: true };
  }

  const script = `
    import dns from "node:dns/promises";
    import * as nodeDns from "node:dns";
    const host = "${cleanHost}";
    const type = "${type}";

    async function run() {
      const t0 = performance.now();
      const doQuery = async (resolver) => {
        switch (type) {
          case "A": return await resolver.resolve4(host);
          case "AAAA": return await resolver.resolve6(host);
          case "MX": return await resolver.resolveMx(host);
          case "TXT": return await resolver.resolveTxt(host);
          case "NS": return await resolver.resolveNs(host);
          case "SOA": return await resolver.resolveSoa(host);
          case "CNAME": return await resolver.resolveCname(host);
        }
      };

      try {
        const recs = await doQuery(dns);
        return { host, type, records: recs, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Upstream DNS Nameserver", isNoData: Array.isArray(recs) && recs.length === 0 };
      } catch (upstreamErr) {
        try {
          const resolver = new nodeDns.promises.Resolver();
          resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
          const recs = await doQuery(resolver);
          return { host, type, records: recs, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Public DNS Anycast (8.8.8.8 / 1.1.1.1)", isNoData: Array.isArray(recs) && recs.length === 0 };
        } catch (anycastErr) {
          if (type === "A" || type === "AAAA") {
            try {
              const lookups = await dns.lookup(host, { all: true });
              const matches = lookups.filter((l) => type === "A" ? l.family === 4 : l.family === 6).map((l) => l.address);
              if (matches.length > 0) {
                return { host, type, records: matches, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "System OS Resolver (getaddrinfo)", isNoData: false };
              }
            } catch {}
          }
          try {
            await dns.lookup(host);
            return { host, type, records: [], elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Zone Authority", isNoData: true };
          } catch {
            return { host, type, records: [], elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Lookup Failed", isNoData: false, error: upstreamErr.message };
          }
        }
      }
    }
    run().then(res => console.log(JSON.stringify(res))).catch(err => console.log(JSON.stringify({ error: err.message })));
  `;

  try {
    const proc = Bun.spawnSync(["bun", "-e", script]);
    const out = proc.stdout.toString().trim();
    if (out) {
      const parsed = JSON.parse(out);
      if (parsed.error) throw new Error(parsed.error);
      return parsed;
    }
  } catch (e: any) {
    throw e;
  }
  return { host: cleanHost, type, records: [], elapsedMs: 0, source: "Lookup Failed", isNoData: false };
}

export function resolveDnsRecord(host: string, type: DnsRecordType): Promise<DnsResolveResult> {
  return Promise.resolve(resolveDnsRecordSync(host, type));
}

export function resolveAllDnsRecordsSync(host: string): { results: DnsResolveResult[]; elapsedMs: number } {
  const cleanHost = sanitizeHost(host) || "google.com";
  const types: DnsRecordType[] = ["A", "AAAA", "MX", "TXT", "NS", "SOA", "CNAME"];

  if (cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "::1") {
    return {
      results: [
        { host: cleanHost, type: "A", records: ["127.0.0.1"], elapsedMs: 0.1, source: "Local Loopback", isNoData: false },
        { host: cleanHost, type: "AAAA", records: ["::1"], elapsedMs: 0.1, source: "Local Loopback", isNoData: false },
        { host: cleanHost, type: "MX", records: [], elapsedMs: 0.1, source: "Local Loopback", isNoData: true },
        { host: cleanHost, type: "TXT", records: [], elapsedMs: 0.1, source: "Local Loopback", isNoData: true },
        { host: cleanHost, type: "NS", records: [], elapsedMs: 0.1, source: "Local Loopback", isNoData: true },
        { host: cleanHost, type: "SOA", records: null, elapsedMs: 0.1, source: "Local Loopback", isNoData: true },
        { host: cleanHost, type: "CNAME", records: [], elapsedMs: 0.1, source: "Local Loopback", isNoData: true },
      ],
      elapsedMs: 0.5,
    };
  }

  const script = `
    import dns from "node:dns/promises";
    import * as nodeDns from "node:dns";
    const host = "${cleanHost}";
    const types = ${JSON.stringify(types)};

    async function queryOne(type) {
      const t0 = performance.now();
      const doQuery = async (resolver) => {
        switch (type) {
          case "A": return await resolver.resolve4(host);
          case "AAAA": return await resolver.resolve6(host);
          case "MX": return await resolver.resolveMx(host);
          case "TXT": return await resolver.resolveTxt(host);
          case "NS": return await resolver.resolveNs(host);
          case "SOA": return await resolver.resolveSoa(host);
          case "CNAME": return await resolver.resolveCname(host);
        }
      };

      try {
        const recs = await doQuery(dns);
        return { host, type, records: recs, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Upstream DNS Nameserver", isNoData: Array.isArray(recs) && recs.length === 0 };
      } catch {
        try {
          const resolver = new nodeDns.promises.Resolver();
          resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4", "1.0.0.1"]);
          const recs = await doQuery(resolver);
          return { host, type, records: recs, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Public DNS Anycast (8.8.8.8 / 1.1.1.1)", isNoData: Array.isArray(recs) && recs.length === 0 };
        } catch {
          if (type === "A" || type === "AAAA") {
            try {
              const lookups = await dns.lookup(host, { all: true });
              const matches = lookups.filter((l) => type === "A" ? l.family === 4 : l.family === 6).map((l) => l.address);
              if (matches.length > 0) {
                return { host, type, records: matches, elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "System OS Resolver (getaddrinfo)", isNoData: false };
              }
            } catch {}
          }
          return { host, type, records: [], elapsedMs: parseFloat((performance.now() - t0).toFixed(1)), source: "Zone Authority", isNoData: true };
        }
      }
    }

    const tStart = performance.now();
    Promise.all(types.map(queryOne)).then((results) => {
      const elapsedMs = parseFloat((performance.now() - tStart).toFixed(1));
      console.log(JSON.stringify({ results, elapsedMs }));
    });
  `;

  try {
    const proc = Bun.spawnSync(["bun", "-e", script]);
    const out = proc.stdout.toString().trim();
    if (out) return JSON.parse(out);
  } catch {}
  return {
    results: types.map((t) => ({ host: cleanHost, type: t, records: [], elapsedMs: 0, source: "Lookup Failed", isNoData: true })),
    elapsedMs: 0,
  };
}

function renderDnsHtml(res: DnsResolveResult): string {
  if (res.isNoData) {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
          <div>
            <div style="font-weight: 700; font-size: 14px; color: #facc15;">DNS <span style="background: rgba(234, 179, 8, 0.25); color: #fde047; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${res.type}</span> Query: <span style="font-family: monospace; color: #fff;">${res.host}</span></div>
            <div style="font-size: 12px; color: #94a3b8;">Queried in <b style="color: #f1f5f9;">${res.elapsedMs}ms</b> via <span style="color: #facc15; font-weight: 600;">${res.source}</span></div>
          </div>
          <div>
            <span style="background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">NODATA / EMPTY</span>
          </div>
        </div>

        <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 14px; font-size: 13px; color: #cbd5e1; line-height: 1.5;">
          ℹ️ The domain <code style="color: #38bdf8;">${res.host}</code> is online and valid, but <b>no ${res.type} records</b> are published in this zone.<br/>
          This is normal for domains that do not advertise this specific record type (e.g., IPv4-only domains have no AAAA records, and domains without mail routing have no MX records).
        </div>
      </div>
    `;
  }

  let contentHtml = "";
  if (res.type === "A" || res.type === "AAAA" || res.type === "NS") {
    const list: string[] = Array.isArray(res.records) ? res.records : [String(res.records)];
    const pills = list
      .map(
        (item) => `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 6px; margin-bottom: 6px;">
          <span style="font-family: ui-monospace, monospace; font-size: 13px; color: #7dd3fc; font-weight: 600;">${item}</span>
          <span style="background: rgba(56,189,248,0.15); color: #38bdf8; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${res.type} Record</span>
        </div>`
      )
      .join("");
    contentHtml = `<div>${pills}</div>`;
  } else if (res.type === "MX") {
    const mxList: { exchange: string; priority: number }[] = Array.isArray(res.records) ? res.records : [];
    const rows = mxList
      .map(
        (mx) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 8px 12px; font-weight: 700; color: #38bdf8;">${mx.priority}</td>
          <td style="padding: 8px 12px; font-family: ui-monospace, monospace; color: #f1f5f9;">${mx.exchange}</td>
        </tr>`
      )
      .join("");
    contentHtml = `
      <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: rgba(255,255,255,0.04); color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <th style="padding: 8px 12px;">Priority / Preference</th>
              <th style="padding: 8px 12px;">Mail Server Hostname (Exchange)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else if (res.type === "SOA") {
    const soa = res.records || {};
    contentHtml = `
      <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; font-size: 12px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
        <div><span style="color: #94a3b8;">Primary Nameserver:</span> <b style="color: #38bdf8; font-family: monospace;">${soa.nsname || "N/A"}</b></div>
        <div><span style="color: #94a3b8;">Hostmaster / Admin:</span> <b style="color: #f1f5f9; font-family: monospace;">${soa.hostmaster || "N/A"}</b></div>
        <div><span style="color: #94a3b8;">Serial Number:</span> <b style="color: #4ade80; font-family: monospace;">${soa.serial ?? "N/A"}</b></div>
        <div><span style="color: #94a3b8;">Refresh Interval:</span> <b style="color: #cbd5e1;">${soa.refresh ?? "N/A"}s</b></div>
        <div><span style="color: #94a3b8;">Retry Interval:</span> <b style="color: #cbd5e1;">${soa.retry ?? "N/A"}s</b></div>
        <div><span style="color: #94a3b8;">Expire Limit:</span> <b style="color: #cbd5e1;">${soa.expire ?? "N/A"}s</b></div>
        <div><span style="color: #94a3b8;">Minimum TTL:</span> <b style="color: #cbd5e1;">${soa.minttl ?? "N/A"}s</b></div>
      </div>`;
  } else if (res.type === "TXT") {
    const list: string[] = Array.isArray(res.records)
      ? res.records.map((r) => (Array.isArray(r) ? r.join("") : String(r)))
      : [String(res.records)];
    const cards = list
      .map((item) => {
        const isSpf = item.startsWith("v=spf1");
        const isDk = item.includes("domainkey") || item.includes("verification");
        const badgeColor = isSpf ? "#34d399" : isDk ? "#a78bfa" : "#38bdf8";
        const badgeText = isSpf ? "SPF Policy" : isDk ? "Verification Token" : "TXT Record";
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); padding: 8px 12px; border-radius: 6px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="background: rgba(255,255,255,0.08); color: ${badgeColor}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">${badgeText}</span>
              <span style="color: #64748b; font-size: 11px;">Length: ${item.length} chars</span>
            </div>
            <div style="font-family: ui-monospace, monospace; font-size: 12px; color: #cbd5e1; word-break: break-all; line-height: 1.4;">${item}</div>
          </div>`;
      })
      .join("");
    contentHtml = `<div>${cards}</div>`;
  } else {
    contentHtml = `<pre style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: #7dd3fc; overflow: auto; margin: 0; line-height: 1.5;">${JSON.stringify(res.records, null, 2)}</pre>`;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 700; font-size: 14px; color: #38bdf8;">DNS <span style="background: #0284c7; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${res.type}</span> Resolution: <span style="font-family: monospace; color: #fff;">${res.host}</span></div>
          <div style="font-size: 12px; color: #94a3b8;">Resolved in <b style="color: #f1f5f9;">${res.elapsedMs}ms</b> via <span style="color: #38bdf8; font-weight: 600;">${res.source}</span></div>
        </div>
        <div>
          <span style="background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">ACTIVE</span>
        </div>
      </div>

      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Resolved Records:</div>
      ${contentHtml}
    </div>
  `;
}

function renderDnsDossierHtml(host: string, results: DnsResolveResult[], totalElapsed: number): string {
  const activeCount = results.filter((r) => !r.isNoData && (Array.isArray(r.records) ? r.records.length > 0 : !!r.records)).length;
  const aRes = results.find((r) => r.type === "A");
  const aaaaRes = results.find((r) => r.type === "AAAA");
  const mxRes = results.find((r) => r.type === "MX");
  const txtRes = results.find((r) => r.type === "TXT");
  const nsRes = results.find((r) => r.type === "NS");
  const soaRes = results.find((r) => r.type === "SOA");

  const ipv4List: string[] = Array.isArray(aRes?.records) ? aRes.records : [];
  const ipv6List: string[] = Array.isArray(aaaaRes?.records) ? aaaaRes.records : [];
  const mxList: { exchange: string; priority: number }[] = Array.isArray(mxRes?.records) ? mxRes.records : [];
  const txtList: string[] = Array.isArray(txtRes?.records)
    ? txtRes.records.map((r) => (Array.isArray(r) ? r.join("") : String(r)))
    : [];
  const nsList: string[] = Array.isArray(nsRes?.records) ? nsRes.records : [];
  const soa = soaRes?.records && typeof soaRes.records === "object" ? soaRes.records : null;

  // Render IP list
  const ipBadges = [
    ...ipv4List.map((ip) => `<span style="background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; font-family: monospace; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 6px; margin-bottom: 6px; display: inline-block;">IPv4: ${ip}</span>`),
    ...ipv6List.map((ip) => `<span style="background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; font-family: monospace; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 6px; margin-bottom: 6px; display: inline-block;">IPv6: ${ip}</span>`),
  ].join("");

  // Render MX rows
  const mxRows = mxList.length > 0
    ? mxList
        .map((m) => `<tr><td style="padding: 4px 8px; font-weight: 700; color: #38bdf8;">${m.priority}</td><td style="padding: 4px 8px; font-family: monospace; color: #f1f5f9;">${m.exchange}</td></tr>`)
        .join("")
    : `<tr><td colspan="2" style="padding: 6px 8px; color: #94a3b8; font-style: italic;">No MX mail exchangers advertised</td></tr>`;

  // Render NS rows
  const nsBadges = nsList.length > 0
    ? nsList.map((ns) => `<span style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #f1f5f9; font-family: monospace; padding: 3px 8px; border-radius: 4px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; display: inline-block;">${ns}</span>`).join("")
    : `<span style="color: #94a3b8; font-style: italic;">No nameservers found</span>`;

  // Render TXT samples
  const txtRows = txtList.length > 0
    ? txtList
        .slice(0, 8)
        .map((t) => {
          const isSpf = t.startsWith("v=spf1");
          return `<div style="font-family: monospace; font-size: 11px; color: ${isSpf ? "#34d399" : "#cbd5e1"}; padding: 3px 6px; border-bottom: 1px solid rgba(255,255,255,0.05); word-break: break-all;">${t}</div>`;
        })
        .join("")
    : `<div style="color: #94a3b8; font-style: italic; padding: 6px;">No TXT records configured</div>`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(99, 102, 241, 0.15)); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 800; font-size: 16px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
            <span>⚡ Complete DNS Forensic Dossier:</span>
            <span style="font-family: monospace; color: #ffffff;">${host}</span>
          </div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
            Audited <b>${results.length}</b> record types in <b style="color: #f1f5f9;">${totalElapsed}ms</b> | Active Sets: <b style="color: #4ade80;">${activeCount}/${results.length}</b>
          </div>
        </div>
        <div>
          <span style="background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">AUDIT COMPLETE</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <!-- Left: Address & Mail -->
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">🌐 Network Addresses (A / AAAA):</div>
          <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; min-height: 70px;">
            ${ipBadges || '<span style="color: #94a3b8; font-style: italic;">No IP addresses found</span>'}
          </div>

          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-top: 10px; margin-bottom: 4px;">✉️ Mail Routing (MX):</div>
          <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
              <thead>
                <tr style="background: rgba(255,255,255,0.04); color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <th style="padding: 4px 8px; width: 60px;">Priority</th>
                  <th style="padding: 4px 8px;">Mail Host</th>
                </tr>
              </thead>
              <tbody>${mxRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Right: Nameservers & Authority -->
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">🏛️ Authoritative Nameservers (NS):</div>
          <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px;">
            ${nsBadges}
          </div>

          <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-top: 10px; margin-bottom: 4px;">📜 Start of Authority (SOA):</div>
          <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; font-size: 11px;">
            ${
              soa
                ? `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                    <div><span style="color: #94a3b8;">Primary:</span> <b style="color: #38bdf8; font-family: monospace;">${soa.nsname || "N/A"}</b></div>
                    <div><span style="color: #94a3b8;">Admin:</span> <b style="color: #f1f5f9; font-family: monospace;">${soa.hostmaster || "N/A"}</b></div>
                    <div><span style="color: #94a3b8;">Serial:</span> <b style="color: #4ade80;">${soa.serial ?? "N/A"}</b></div>
                    <div><span style="color: #94a3b8;">TTL:</span> <b>${soa.minttl ?? "N/A"}s</b></div>
                  </div>`
                : `<span style="color: #94a3b8; font-style: italic;">No SOA record found</span>`
            }
          </div>
        </div>
      </div>

      <!-- Bottom: TXT Records -->
      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">🛡️ Published TXT / SPF / Verification Records (${txtList.length}):</div>
      <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; max-height: 120px; overflow: auto;">
        ${txtRows}
      </div>
    </div>
  `;
}

function renderHttpProbeHtml(url: string, status: number, statusText: string, elapsed: string, headers: [string, string][]): string {
  const statusCol = status >= 200 && status < 300 ? "#4ade80" : status >= 300 && status < 400 ? "#38bdf8" : "#f87171";
  const headerRows = headers
    .map(
      ([k, v]) => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 4px 8px; font-family: monospace; color: #38bdf8; width: 220px;">${k}</td>
        <td style="padding: 4px 8px; font-family: monospace; color: #cbd5e1; word-break: break-all;">${v}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 700; font-size: 14px; color: #f1f5f9;">HTTP Probe Response: <span style="font-family: monospace; color: #38bdf8;">${url}</span></div>
          <div style="font-size: 12px; color: #94a3b8;">Round-Trip Time-To-First-Byte: <b style="color: #f1f5f9;">${elapsed}ms</b></div>
        </div>
        <div>
          <span style="background: rgba(0,0,0,0.4); color: ${statusCol}; border: 1px solid ${statusCol}; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 700;">${status} ${statusText}</span>
        </div>
      </div>

      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Response Headers (${headers.length}):</div>
      <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 6px; max-height: 180px; overflow: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tbody>${headerRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function probeHttpSync(url: string): { success: boolean; status?: number; statusText?: string; elapsedMs: string; headers: [string, string][]; error?: string } {
  const safeUrl = JSON.stringify(url);
  const script = `
    async function probe() {
      const t0 = performance.now();
      try {
        const resp = await fetch(${safeUrl}, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
        const elapsed = (performance.now() - t0).toFixed(2);
        const headers = [];
        resp.headers.forEach((v, k) => headers.push([k, v]));
        console.log(JSON.stringify({ success: true, status: resp.status, statusText: resp.statusText, elapsedMs: elapsed, headers }));
      } catch (e) {
        const elapsed = (performance.now() - t0).toFixed(2);
        console.log(JSON.stringify({ success: false, error: e.message, elapsedMs: elapsed, headers: [] }));
      }
    }
    probe();
  `;
  try {
    const proc = Bun.spawnSync(["bun", "-e", script]);
    const out = proc.stdout.toString().trim();
    if (out) return JSON.parse(out);
  } catch (e: any) {
    return { success: false, error: e.message, elapsedMs: "0", headers: [] };
  }
  return { success: false, error: "Probe failed", elapsedMs: "0", headers: [] };
}

export function probeHttp(url: string): Promise<{ success: boolean; status?: number; statusText?: string; elapsedMs: string; headers: [string, string][]; error?: string }> {
  return Promise.resolve(probeHttpSync(url));
}

export function createNetworkStudio(): SimpleWindow {
  const win = newSimpleWindow("Network Forensics Studio Pro -- Socket Scanner & DNS Inspector", 1140, 880, {
    appId: "network_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  const localIfaces = getLocalInterfaces();
  const initialHtml = renderBaselineHtml("google.com", 443, localIfaces);

  // Top Bar
  win.beginRow();
  win.addHeading("Network Forensics Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise Socket Diagnostics, DNS Lookup & HTTP Latency Probe (Native Bun)");

  // Target Input Row
  win.beginGroupBox("Target Host & Protocol Configuration");
  win.beginRow();
  win.addLabel("lbl_host", "Target Host / Domain:");
  win.addInput("txt_host", "google.com").width(240);
  win.addLabel("lbl_port", "Port / Range:");
  win.addInput("txt_port", "443").width(90);
  win.addButton("btn_ping_http", "⚡ HTTP Probe");
  win.addButton("btn_scan_socket", "🔌 Scan Port");
  win.addButton("btn_scan_all", "🌐 Scan Top Ports");
  win.endRow();

  // Quick Target Presets Row
  win.beginRow();
  win.addLabel("lbl_presets", "Quick Targets:").width(110);
  win.addButton("btn_preset_localhost", "💻 Localhost (127.0.0.1:3000)");
  win.addButton("btn_preset_cloudflare", "🌐 Cloudflare (1.1.1.1)");
  win.addButton("btn_preset_google", "🔍 Google (google.com)");
  win.addButton("btn_preset_github", "🐙 GitHub (github.com)");
  win.endRow();
  win.endGroupBox();

  // DNS Actions Row
  win.beginGroupBox("DNS Forensics & Record Inspector (node:dns)");
  win.beginRow();
  win.addButton("btn_dns_all", "⚡ Full DNS Audit");
  win.addButton("btn_dns_a", "A (IPv4)");
  win.addButton("btn_dns_aaaa", "AAAA (IPv6)");
  win.addButton("btn_dns_mx", "MX (Mail)");
  win.addButton("btn_dns_txt", "TXT Records");
  win.addButton("btn_dns_ns", "NS (NameServers)");
  win.addButton("btn_dns_soa", "SOA Record");
  win.addButton("btn_clear_diag", "Clear Output");
  win.addButton("btn_export_diag", "📋 Export Report");
  win.endRow();
  win.endGroupBox();

  // Results View (HTML View for rich visual tables and live cards)
  win.beginGroupBox("Network Diagnostics & Telemetry Stream");
  win.addHtmlView(initialHtml, 1068, 280).id("txt_net_results");
  win.setValue("txt_net_results", initialHtml);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Activity & Socket Connection Audit");
  win.addConsole("net_console", 120);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Interface: Active  |  Engine: Native Bun Socket & DNS");
  win.endRow();

  // Store raw plain text representation for export
  win.setValue(
    "txt_net_results_raw",
    `[Network Forensics Studio Initialized]\nTarget host: google.com:443\nDetected Local IP: ${localIfaces[0]?.ip || "127.0.0.1"}\n`
  );

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Network configuration saved!");
  });

  const setResults = (html: string, raw: string) => {
    win.setHtml("txt_net_results", html);
    win.setValue("txt_net_results", html);
    win.setValue("txt_net_results_raw", raw);
    console.log(`\n${raw}`);
  };

  win.onClick("btn_clear_diag", () => {
    const emptyHtml = `<div style="color: #94a3b8; font-style: italic; padding: 12px;">Diagnostics output cleared. Select a target or probe to begin.</div>`;
    setResults(emptyHtml, "[Output Cleared]\n");
    win.appendConsole("net_console", "[Network] Output cleared\n", 4);
    win.setStatus("Output cleared");
  });

  // Target Presets Handlers
  win.onClick("btn_preset_localhost", () => {
    win.setValue("txt_host", "127.0.0.1");
    win.setValue("txt_port", "3000");
    win.appendConsole("net_console", "[Preset] Selected Localhost (127.0.0.1:3000)\n", 1);
    win.setStatus("Target set to 127.0.0.1:3000");
  });

  win.onClick("btn_preset_cloudflare", () => {
    win.setValue("txt_host", "1.1.1.1");
    win.setValue("txt_port", "443");
    win.appendConsole("net_console", "[Preset] Selected Cloudflare DNS (1.1.1.1:443)\n", 1);
    win.setStatus("Target set to 1.1.1.1:443");
  });

  win.onClick("btn_preset_google", () => {
    win.setValue("txt_host", "google.com");
    win.setValue("txt_port", "443");
    win.appendConsole("net_console", "[Preset] Selected Google (google.com:443)\n", 1);
    win.setStatus("Target set to google.com:443");
  });

  win.onClick("btn_preset_github", () => {
    win.setValue("txt_host", "github.com");
    win.setValue("txt_port", "443");
    win.appendConsole("net_console", "[Preset] Selected GitHub (github.com:443)\n", 1);
    win.setStatus("Target set to github.com:443");
  });

  win.onClick("btn_scan_socket", () => {
    const rawHost = win.getValue("txt_host") || "google.com";
    const host = sanitizeHost(rawHost) || "127.0.0.1";
    const port = parseInt(win.getValue("txt_port") || "443", 10);

    win.appendConsole("net_console", `[Scan] Connecting to ${host}:${port}...\n`, 1);
    win.setStatus(`Testing socket ${host}:${port}...`);

    const t0 = performance.now();
    const res = checkSocketSync(host, port);
    const elapsed = performance.now() - t0;
    const html = renderPortScanHtml(host, [res], elapsed);
    const raw = `[Socket Test Result]\nHost:    ${host}\nPort:    ${port} (${res.service})\nStatus:  ${res.status}\nLatency: ${res.latencyMs}ms\n`;

    setResults(html, raw);
    win.appendConsole("net_console", `[Scan Result] ${host}:${port} is ${res.status} (${res.latencyMs}ms)\n`, res.status === "OPEN" ? 2 : 3);
    win.setStatus(`${host}:${port} -> ${res.status} (${res.latencyMs}ms)`);
  });

  win.onClick("btn_scan_all", () => {
    const rawHost = win.getValue("txt_host") || "google.com";
    const host = sanitizeHost(rawHost) || "127.0.0.1";
    win.appendConsole("net_console", `[Batch Scan] Scanning ${COMMON_PORTS.length} common services on ${host}...\n`, 1);
    win.setStatus(`Scanning common ports on ${host}...`);

    const t0 = performance.now();
    const results = checkCommonSocketsSync(host);
    const elapsed = performance.now() - t0;

    const html = renderPortScanHtml(host, results, elapsed);
    const lines: string[] = [
      `========================================================================`,
      `PORT SCAN AUDIT REPORT: ${host}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Total Scan Time: ${elapsed.toFixed(1)}ms`,
      `========================================================================`,
      `PORT      SERVICE              STATUS       LATENCY`,
      `────────────────────────────────────────────────────────────────────────`,
    ];
    for (const r of results) {
      const portStr = String(r.port).padEnd(9);
      const svcStr = r.service.padEnd(20);
      const statStr = (r.status === "OPEN" ? "OPEN   " : r.status === "TIMEOUT" ? "TIMEOUT" : "CLOSED ").padEnd(12);
      lines.push(`${portStr} ${svcStr} ${statStr} ${r.latencyMs}ms`);
    }

    setResults(html, lines.join("\n"));
    const openCount = results.filter((r) => r.status === "OPEN").length;
    win.appendConsole("net_console", `[Batch Scan] Finished auditing ${results.length} ports (${openCount} OPEN) in ${elapsed.toFixed(1)}ms\n`, 2);
    win.setStatus(`Scan completed: ${openCount} open ports found (${elapsed.toFixed(0)}ms)`);
  });

  win.onClick("btn_ping_http", () => {
    const rawHost = win.getValue("txt_host") || "google.com";
    const host = sanitizeHost(rawHost) || "google.com";
    const port = parseInt(win.getValue("txt_port") || "443", 10);
    let url = rawHost.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      if (host === "localhost" || host === "127.0.0.1") {
        url = `http://${host}:${port || 80}`;
      } else {
        url = `https://${host}`;
      }
    }

    win.appendConsole("net_console", `[HTTP Probe] Sending probe request to ${url}...\n`, 1);
    win.setStatus(`Probing ${url}...`);

    const probeRes = probeHttpSync(url);
    if (probeRes.success) {
      const html = renderHttpProbeHtml(url, probeRes.status!, probeRes.statusText || "", probeRes.elapsedMs, probeRes.headers);
      const report = [
        `[HTTP Probe Response]`,
        `URL:             ${url}`,
        `Status Code:     ${probeRes.status} ${probeRes.statusText}`,
        `Total Latency:   ${probeRes.elapsedMs}ms`,
        `Response Headers:`,
        ...probeRes.headers.map(([k, v]) => `  ${k}: ${v}`),
      ].join("\n");

      setResults(html, report);
      win.appendConsole("net_console", `[HTTP Probe] ${probeRes.status} in ${probeRes.elapsedMs}ms\n`, 2);
      win.setStatus(`HTTP ${probeRes.status} (${probeRes.elapsedMs}ms)`);
    } else {
      const errHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #f87171; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 12px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">❌ HTTP Probe Failed</div>
          <div style="font-size: 12px; color: #e2e8f0;">Target: <code style="color: #38bdf8;">${url}</code> | Latency: ${probeRes.elapsedMs}ms</div>
          <div style="font-size: 12px; margin-top: 8px; color: #fca5a5;"><b>Error:</b> ${probeRes.error || "Probe failed"}</div>
        </div>`;
      setResults(errHtml, `[HTTP Probe Failed]\nTarget:  ${url}\nLatency: ${probeRes.elapsedMs}ms\nError:   ${probeRes.error || "Probe failed"}`);
      win.appendConsole("net_console", `[HTTP Error] ${probeRes.error || "Probe failed"} (${probeRes.elapsedMs}ms)\n`, 3);
      win.setStatus("Probe failed");
    }
  });

  const renderDnsError = (host: string, type: string, err: any, elapsed: number) => {
    const errHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #f87171; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 12px;">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">❌ DNS Lookup Failed</div>
        <div style="font-size: 12px; color: #e2e8f0;">Host: <code style="color: #38bdf8;">${host}</code> | Record: <span style="background: #334155; padding: 1px 6px; border-radius: 4px;">${type}</span> | Latency: ${elapsed}ms</div>
        <div style="font-size: 12px; margin-top: 8px; color: #fca5a5;"><b>Error:</b> ${err.message || String(err)}</div>
        <div style="font-size: 11px; margin-top: 8px; color: #94a3b8; line-height: 1.4;">
          💡 <b>Tip:</b> If your network or VPN blocks port 53 UDP traffic, test with <b>⚡ HTTP Probe</b> which queries through standard HTTPS port 443, or verify the domain spelling.
        </div>
      </div>`;
    setResults(errHtml, `[DNS Lookup Failed]\nHost:    ${host}\nRecord:  ${type}\nLatency: ${elapsed}ms\nError:   ${err.message || String(err)}`);
    win.appendConsole("net_console", `[DNS Error] ${err.message || String(err)} (${elapsed}ms)\n`, 3);
    win.setStatus(`DNS error (${elapsed}ms)`);
  };

  const queryDns = (type: DnsRecordType) => {
    const rawHost = win.getValue("txt_host") || "google.com";
    const host = sanitizeHost(rawHost) || "google.com";
    win.appendConsole("net_console", `[DNS] Resolving ${type} records for ${host}...\n`, 1);
    win.setStatus(`Resolving ${type} for ${host}...`);

    const t0 = performance.now();
    try {
      const res = resolveDnsRecordSync(host, type);
      const html = renderDnsHtml(res);
      const formatted = [
        `========================================================================`,
        `DNS ${type} RECORDS: ${host} (Resolved in ${res.elapsedMs}ms via ${res.source})`,
        `========================================================================`,
        res.isNoData ? `(No ${type} records configured for ${host})` : JSON.stringify(res.records, null, 2),
      ].join("\n");

      setResults(html, formatted);
      if (res.isNoData) {
        win.appendConsole("net_console", `[DNS Notice] No ${type} records configured for ${host} (${res.elapsedMs}ms)\n`, 4);
        win.setStatus(`DNS ${type}: No records (${res.elapsedMs}ms)`);
      } else {
        win.appendConsole("net_console", `[DNS Success] Retrieved ${type} records in ${res.elapsedMs}ms (${res.source})\n`, 2);
        win.setStatus(`DNS ${type} OK (${res.elapsedMs}ms)`);
      }
    } catch (err: any) {
      const elapsed = parseFloat((performance.now() - t0).toFixed(1));
      renderDnsError(host, type, err, elapsed);
    }
  };

  win.onClick("btn_dns_all", () => {
    const rawHost = win.getValue("txt_host") || "google.com";
    const host = sanitizeHost(rawHost) || "google.com";
    win.appendConsole("net_console", `[DNS Audit] Running full forensic inspection for ${host}...\n`, 1);
    win.setStatus(`Auditing all DNS records for ${host}...`);

    try {
      const { results, elapsedMs: totalElapsed } = resolveAllDnsRecordsSync(host);
      const html = renderDnsDossierHtml(host, results, totalElapsed);

      const lines: string[] = [
        `========================================================================`,
        `FULL DNS FORENSIC AUDIT REPORT: ${host}`,
        `Timestamp:     ${new Date().toISOString()}`,
        `Audit Time:    ${totalElapsed}ms`,
        `========================================================================`,
      ];
      for (const res of results) {
        lines.push(`--- [${res.type} RECORDS] (${res.source}, ${res.elapsedMs}ms) ---`);
        if (res.isNoData) {
          lines.push(`  (No ${res.type} records configured / NODATA)`);
        } else {
          lines.push(JSON.stringify(res.records, null, 2));
        }
        lines.push("");
      }
      setResults(html, lines.join("\n"));
      const activeCount = results.filter((r) => !r.isNoData && (Array.isArray(r.records) ? r.records.length > 0 : !!r.records)).length;
      win.appendConsole("net_console", `[DNS Audit] Completed ${host}: ${activeCount}/${results.length} record sets found (${totalElapsed}ms)\n`, 2);
      win.setStatus(`DNS Audit complete: ${activeCount} active sets (${totalElapsed}ms)`);
    } catch (err: any) {
      renderDnsError(host, "ALL", err, 0);
    }
  });

  win.onClick("btn_dns_a", () => queryDns("A"));
  win.onClick("btn_dns_aaaa", () => queryDns("AAAA"));
  win.onClick("btn_dns_mx", () => queryDns("MX"));
  win.onClick("btn_dns_txt", () => queryDns("TXT"));
  win.onClick("btn_dns_ns", () => queryDns("NS"));
  win.onClick("btn_dns_soa", () => queryDns("SOA"));

  win.onClick("btn_export_diag", () => {
    const rawContent = win.getValue("txt_net_results_raw") || win.getValue("txt_net_results") || "";
    if (!rawContent.trim()) {
      win.toast("No diagnostics output to export");
      return;
    }
    const exportPath = resolve(process.cwd(), "network_report.txt");
    try {
      writeFileSync(exportPath, rawContent, "utf8");
      win.appendConsole("net_console", `[Export] Saved network report to ${exportPath}\n`, 2);
      win.toast(`Report saved: ${basename(exportPath)}`);
    } catch (e: any) {
      win.appendConsole("net_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  return win;
}

if (import.meta.main) {
  const argTarget = process.argv[2] ? sanitizeHost(process.argv[2]) : "";
  const target = argTarget || "google.com";

  console.log(`⚡ Launching Network Forensics Studio Pro (Target: ${target})...`);
  const win = createNetworkStudio();
  if (argTarget) {
    win.setValue("txt_host", argTarget);
  }

  // Pre-resolve initial DNS records so output is immediately visible in terminal and GUI
  try {
    const { results, elapsedMs: totalElapsed } = resolveAllDnsRecordsSync(target);
    const dossierHtml = renderDnsDossierHtml(target, results, totalElapsed);

    const lines: string[] = [
      `========================================================================`,
      `DNS FORENSIC DOSSIER: ${target} (Resolved in ${totalElapsed}ms)`,
      `========================================================================`,
    ];
    for (const res of results) {
      if (!res.isNoData && res.records) {
        const payloadStr = typeof res.records === "object" ? JSON.stringify(res.records) : String(res.records);
        lines.push(`[${res.type.padEnd(5)}] ${payloadStr}`);
      } else {
        lines.push(`[${res.type.padEnd(5)}] (No records configured / NODATA)`);
      }
    }
    lines.push(`========================================================================`);

    const rawReport = lines.join("\n");
    win.setHtml("txt_net_results", dossierHtml);
    win.setValue("txt_net_results", dossierHtml);
    win.setValue("txt_net_results_raw", rawReport);
    console.log(`\n${rawReport}\n`);
  } catch (e: any) {
    console.error(`[DNS Baseline Notice] ${e.message}`);
  }

  win.run();
}
