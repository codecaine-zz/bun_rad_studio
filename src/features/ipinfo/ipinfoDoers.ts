import { lookup, reverse, Resolver } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import type { IpInfoResult, LocalInterfaceInfo, SubnetInfo } from "./ipinfoTypes.ts";
import { colors } from "../../shared/colors.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";

export function isIpAddress(input: string): boolean {
  const ipv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(input) || (input.includes(":") && ipv6.test(input));
}

export function isCidr(input: string): boolean {
  const parts = input.trim().split("/");
  if (parts.length !== 2) return false;
  const prefix = parseInt(parts[1], 10);
  return isIpAddress(parts[0]) && !isNaN(prefix) && prefix >= 0 && prefix <= 32;
}

export function cleanTarget(input: string): string {
  let s = input.trim();
  s = s.replace(/^[a-zA-Z]+:\/\//, ""); // strip protocol
  s = s.replace(/\/.*$/, "");           // strip path
  s = s.replace(/\?.*$/, "");           // strip query params
  s = s.replace(/#.*$/, "");           // strip anchor
  // If not IPv6, strip port
  if (!s.includes("]:") && !s.includes("::")) {
    s = s.replace(/:[0-9]+$/, "");
  }
  return s.trim();
}

export function syncFetchJson(url: string, headers: Record<string, string> = {}, timeoutSec = 2): any {
  try {
    const cmd = ["curl", "-s", "--max-time", String(timeoutSec)];
    for (const [k, v] of Object.entries(headers)) {
      cmd.push("-H", `${k}: ${v}`);
    }
    cmd.push(url);
    const proc = Bun.spawnSync(cmd);
    if (proc.exitCode === 0) {
      const text = proc.stdout.toString();
      if (text && text.trim().startsWith("{")) {
        return JSON.parse(text);
      }
    }
  } catch {}
  return null;
}

export function resolveTargetToIp(
  target?: string
): { ip?: string; domain?: string } {
  if (!target || target === "myip") return {};
  const cleaned = cleanTarget(target);
  if (isIpAddress(cleaned)) {
    return { ip: cleaned };
  }
  if (cleaned.toLowerCase() === "localhost") {
    return { ip: "127.0.0.1", domain: cleaned };
  }

  // 1. Fast synchronous DoH via curl (resolves in ~50ms even inside blocking webview runloops)
  const dohGoogle = syncFetchJson(`https://dns.google/resolve?name=${encodeURIComponent(cleaned)}&type=A`, { Accept: "application/dns-json" }, 2);
  const answerGoogle = dohGoogle?.Answer?.find((a: any) => a.type === 1 && a.data && isIpAddress(a.data));
  if (answerGoogle?.data) {
    return { ip: answerGoogle.data, domain: cleaned };
  }

  const dohCf = syncFetchJson(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleaned)}&type=A`, { Accept: "application/dns-json" }, 2);
  const answerCf = dohCf?.Answer?.find((a: any) => a.type === 1 && a.data && isIpAddress(a.data));
  if (answerCf?.data) {
    return { ip: answerCf.data, domain: cleaned };
  }

  throw new Error(`[IpInfoResolve] Could not resolve host to IP: ${target}`);
}

export function fetchIpDetails(
  ip?: string,
  token?: string
): IpInfoResult {
  const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("127.");
  if (isLoopback) {
    return {
      ip: ip || "127.0.0.1",
      hostname: "localhost",
      city: "Localhost",
      region: "Loopback",
      country: "Local",
      loc: "0,0",
      org: "IANA Loopback / Private Network",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      readme: "Local loopback adapter",
    };
  }

  const cleanIp = ip && ip !== "myip" ? `${ip.trim()}/` : "";
  const query = token ? `?token=${token}` : "";
  const primaryUrl = `https://ipinfo.io/${cleanIp}json${query}`;

  // 1. Synchronous ipinfo.io query
  const ipinfoData = syncFetchJson(primaryUrl, { Accept: "application/json", "User-Agent": "bun-ipinfo/1.0" }, 2);
  if (ipinfoData && ipinfoData.ip && !ipinfoData.bogon) {
    return ipinfoData as IpInfoResult;
  }

  // 2. Synchronous ipwho.is fallback query
  const targetIp = ip && ip !== "myip" ? ip.trim() : "";
  const fallbackUrl = targetIp ? `https://ipwho.is/${targetIp}` : `https://ipwho.is/`;
  const ipwhoData = syncFetchJson(fallbackUrl, { Accept: "application/json" }, 2);
  if (ipwhoData && ipwhoData.success !== false && ipwhoData.ip) {
    return {
      ip: ipwhoData.ip || ip || "",
      hostname: ipwhoData.connection?.domain || undefined,
      city: ipwhoData.city,
      region: ipwhoData.region,
      country: ipwhoData.country_code,
      loc: ipwhoData.latitude !== undefined && ipwhoData.longitude !== undefined ? `${ipwhoData.latitude},${ipwhoData.longitude}` : undefined,
      org: ipwhoData.connection?.org || ipwhoData.connection?.isp ? `AS${ipwhoData.connection?.asn || ""} ${ipwhoData.connection?.org || ipwhoData.connection?.isp}`.trim() : undefined,
      postal: ipwhoData.postal,
      timezone: ipwhoData.timezone?.id,
      readme: "Resolved via ipwho.is",
    };
  }

  throw new Error(`[IpInfoFetch] Failed to fetch IP details for: ${ip || "myip"}`);
}

export function extractField(data: IpInfoResult, fieldName: string): string {
  const key = fieldName.toLowerCase().trim() as keyof IpInfoResult;
  const val = data[key];
  if (val === undefined || val === null) {
    throw new Error(`[IpInfoExtract] Field not found: ${fieldName}`);
  }
  return typeof val === "string" ? val : JSON.stringify(val);
}

export function formatSummary(data: IpInfoResult): string {
  const mapUrl = data.loc ? `https://maps.google.com/?q=${data.loc}` : undefined;
  const fields: [string, string | undefined][] = [
    ["IP", data.ip],
    ["Hostname", data.hostname],
    ["City", data.city],
    ["Region", data.region],
    ["Country", data.country],
    ["Location", data.loc],
    ["Google Maps", mapUrl],
    ["Organization", data.org],
    ["Postal", data.postal],
    ["Timezone", data.timezone],
  ];

  const lines = fields
    .filter(([_, val]) => val !== undefined && val !== "")
    .map(([label, val]) => `${colors.bold(colors.cyan(label.padEnd(14)))}: ${val}`);

  return lines.join("\n");
}

export function formatJson(data: IpInfoResult | IpInfoResult[]): string {
  return JSON.stringify(data, null, 2);
}

export function formatCsv(data: IpInfoResult): string {
  const headers = ["ip", "hostname", "city", "region", "country", "loc", "org", "postal", "timezone"];
  const values = headers.map((h) => {
    const val = (data as any)[h] ?? "";
    return `"${String(val).replace(/"/g, '""')}"`;
  });
  return `${headers.join(",")}\n${values.join(",")}`;
}

export async function readIpTargets(target: string): Promise<string[]> {
  const text = target === "-" ? await Bun.stdin.text() : await Bun.file(target).text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

export function formatBulkTable(results: IpInfoResult[]): string {
  const columns: ColumnDef<IpInfoResult>[] = [
    { header: "IP", align: "left", getValue: (r) => colors.bold(colors.cyan(r.ip)) },
    { header: "CITY", align: "left", getValue: (r) => r.city ?? "-" },
    { header: "REGION", align: "left", getValue: (r) => r.region ?? "-" },
    { header: "COUNTRY", align: "left", getValue: (r) => r.country ?? "-" },
    { header: "ORGANIZATION", align: "left", getValue: (r) => colors.yellow(r.org ?? "-") },
  ];
  return renderTable(columns, results);
}

export function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function intToIp(int: number): string {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join(".");
}

export function calculateSubnet(cidr: string): SubnetInfo {
  const [ipStr, prefixStr] = cidr.trim().split("/");
  const prefix = parseInt(prefixStr, 10);
  const maskInt = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const wildcardInt = ~maskInt >>> 0;
  const ipInt = ipToInt(ipStr);
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const totalHosts = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
  const usableHosts = prefix >= 31 ? totalHosts : Math.max(0, totalHosts - 2);

  return {
    cidr,
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    netmask: intToIp(maskInt),
    wildcard: intToIp(wildcardInt),
    firstHost: prefix >= 31 ? intToIp(networkInt) : intToIp(networkInt + 1),
    lastHost: prefix >= 31 ? intToIp(broadcastInt) : intToIp(broadcastInt - 1),
    totalHosts,
    usableHosts,
  };
}

export function formatSubnetInfo(info: SubnetInfo): string {
  const fields: [string, string][] = [
    ["CIDR Range", info.cidr],
    ["Network", info.network],
    ["Broadcast", info.broadcast],
    ["Netmask", info.netmask],
    ["Wildcard Mask", info.wildcard],
    ["Host Range", `${info.firstHost} - ${info.lastHost}`],
    ["Usable Hosts", info.usableHosts.toLocaleString()],
    ["Total Hosts", info.totalHosts.toLocaleString()],
  ];
  return fields
    .map(([lbl, val]) => `${colors.bold(colors.cyan(lbl.padEnd(14)))}: ${val}`)
    .join("\n");
}

export function getLocalInterfaces(): LocalInterfaceInfo[] {
  const ifaces = networkInterfaces();
  const result: LocalInterfaceInfo[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!list) continue;
    for (const item of list) {
      result.push({
        name,
        address: item.address,
        family: item.family,
        netmask: item.netmask,
        mac: item.mac,
        internal: item.internal,
      });
    }
  }
  return result;
}

export function formatLocalInterfaces(ifaces: LocalInterfaceInfo[]): string {
  const columns: ColumnDef<LocalInterfaceInfo>[] = [
    { header: "INTERFACE", align: "left", getValue: (i) => colors.bold(colors.cyan(i.name)) },
    { header: "FAMILY", align: "left", getValue: (i) => i.family },
    { header: "ADDRESS", align: "left", getValue: (i) => colors.yellow(i.address) },
    { header: "NETMASK", align: "left", getValue: (i) => colors.dim(i.netmask) },
    { header: "MAC", align: "left", getValue: (i) => colors.dim(i.mac) },
    { header: "TYPE", align: "left", getValue: (i) => (i.internal ? "internal" : "external") },
  ];
  return renderTable(columns, ifaces);
}

export async function lookupPtr(ip: string): Promise<string | undefined> {
  if (!isIpAddress(ip)) return undefined;
  try {
    const hostnames = await reverse(ip);
    return hostnames[0];
  } catch {
    return undefined;
  }
}

