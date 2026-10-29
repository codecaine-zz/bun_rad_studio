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
  const prefix = parseInt(parts[1]!, 10);
  return isIpAddress(parts[0]!) && !isNaN(prefix) && prefix >= 0 && prefix <= 32;
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
    const cmd = ["curl", "-s", "--proto", "=https,http", "--max-time", String(timeoutSec)];
    for (const [k, v] of Object.entries(headers)) {
      cmd.push("-H", `${k}: ${v}`);
    }
    cmd.push("--", url);
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

export interface IpClassification {
  isPrivateOrBogon: boolean;
  type: string;
  rfc?: string;
  scope: string;
}

export function classifyIp(ip: string): IpClassification {
  const trimmed = ip.trim();
  if (trimmed === "127.0.0.1" || trimmed === "::1" || trimmed.startsWith("127.")) {
    return { isPrivateOrBogon: true, type: "Loopback", rfc: "RFC 1122", scope: "Host Loopback Adapter" };
  }
  if (trimmed === "0.0.0.0" || trimmed === "::") {
    return { isPrivateOrBogon: true, type: "Unspecified Address", rfc: "RFC 1122 / RFC 4291", scope: "Non-routable Default" };
  }

  // IPv4 classifications
  const ipv4Parts = trimmed.split(".").map((p) => parseInt(p, 10));
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // The check above guarantees four numbers; the defaults only satisfy the type checker.
    const [o1 = 0, o2 = 0] = ipv4Parts;
    if (o1 === 10) {
      return { isPrivateOrBogon: true, type: "Private Network (Class A)", rfc: "RFC 1918 (10.0.0.0/8)", scope: "Local Intranet / Corporate LAN" };
    }
    if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      return { isPrivateOrBogon: true, type: "Private Network (Class B)", rfc: "RFC 1918 (172.16.0.0/12)", scope: "Local Intranet / Private Subnet" };
    }
    if (o1 === 192 && o2 === 168) {
      return { isPrivateOrBogon: true, type: "Private Network (Class C)", rfc: "RFC 1918 (192.168.0.0/16)", scope: "Home / Office Local Area Network" };
    }
    if (o1 === 169 && o2 === 254) {
      return { isPrivateOrBogon: true, type: "Link-Local (APIPA)", rfc: "RFC 3927 (169.254.0.0/16)", scope: "Subnet Auto-Configuration" };
    }
    if (o1 === 100 && o2 >= 64 && o2 <= 127) {
      return { isPrivateOrBogon: true, type: "Carrier-Grade NAT", rfc: "RFC 6598 (100.64.0.0/10)", scope: "ISP Shared Address Space" };
    }
    if (o1 === 192 && o2 === 0 && ipv4Parts[2] === 2) {
      return { isPrivateOrBogon: true, type: "TEST-NET-1 Documentation", rfc: "RFC 5737", scope: "Documentation / Examples" };
    }
    if (o1 === 198 && o2 === 51 && ipv4Parts[2] === 100) {
      return { isPrivateOrBogon: true, type: "TEST-NET-2 Documentation", rfc: "RFC 5737", scope: "Documentation / Examples" };
    }
    if (o1 === 203 && o2 === 0 && ipv4Parts[2] === 113) {
      return { isPrivateOrBogon: true, type: "TEST-NET-3 Documentation", rfc: "RFC 5737", scope: "Documentation / Examples" };
    }
    if (o1 === 198 && (o2 === 18 || o2 === 19)) {
      return { isPrivateOrBogon: true, type: "Benchmark Testing", rfc: "RFC 2544", scope: "Network Device Benchmarking" };
    }
    if (o1 >= 224 && o1 <= 239) {
      return { isPrivateOrBogon: true, type: "Multicast Address", rfc: "RFC 5771 (224.0.0.0/4)", scope: "Local / Global Multicast Streams" };
    }
    if (o1 >= 240) {
      return { isPrivateOrBogon: true, type: "Reserved / Future Use", rfc: "RFC 1112 (240.0.0.0/4)", scope: "Reserved Address Space" };
    }
  }

  // IPv6 classifications
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return { isPrivateOrBogon: true, type: "IPv6 Link-Local Unicast", rfc: "RFC 4291 (fe80::/10)", scope: "Local Link Segment" };
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return { isPrivateOrBogon: true, type: "IPv6 Unique Local Address (ULA)", rfc: "RFC 4193 (fc00::/7)", scope: "Private Enterprise Routing" };
  }
  if (lower.startsWith("ff")) {
    return { isPrivateOrBogon: true, type: "IPv6 Multicast", rfc: "RFC 4291 (ff00::/8)", scope: "Multicast Node/Router Group" };
  }

  return { isPrivateOrBogon: false, type: "Public IP", scope: "Public Internet" };
}

export function createPrivateIpResult(ip: string, classification?: IpClassification): IpInfoResult {
  const cls = classification || classifyIp(ip);
  let matched: LocalInterfaceInfo | undefined;
  try {
    const ifaces = getLocalInterfaces();
    matched = ifaces.find((i) => i.address.toLowerCase() === ip.toLowerCase());
  } catch {}

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const hostname = (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127."))
    ? "localhost"
    : (matched ? `Adapter: ${matched.name} (${matched.mac || "no MAC"})` : "local-host.lan");

  const org = matched
    ? `${matched.internal ? "Loopback Adapter" : "Local Network Interface"} (${matched.family}) - ${cls.rfc || cls.type}`
    : (cls.rfc ? `${cls.rfc} - ${cls.type}` : cls.type);

  return {
    ip,
    hostname,
    city: matched ? `Host Machine (${matched.name})` : "Private Network / Intranet",
    region: matched ? "Local Interface" : "Non-Routable Subnet",
    country: "Private / LAN",
    loc: "0,0",
    org,
    postal: matched?.netmask ? `Mask: ${matched.netmask}` : undefined,
    timezone: localTz,
    readme: `Private / Bogon IP address (${cls.type}). ${cls.scope}. Does not route through public internet gateways.`,
  };
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

  // Check if target matches a local network interface name (e.g. en0, lo0, bridge100)
  try {
    const ifaces = getLocalInterfaces();
    const matchedIface = ifaces.find((i) => i.name.toLowerCase() === cleaned.toLowerCase());
    if (matchedIface) {
      return { ip: matchedIface.address, domain: matchedIface.name };
    }
  } catch {}

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

  // 2. Synchronous system resolver fallback (host / dscacheutil)
  if (!cleaned.startsWith("-")) {
    try {
      const hostProc = Bun.spawnSync(["host", "-W", "2", "--", cleaned]);
      if (hostProc.exitCode === 0) {
        const out = hostProc.stdout.toString();
        const match = out.match(/has address\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
        if (match && match[1] && isIpAddress(match[1])) {
          return { ip: match[1], domain: cleaned };
        }
      }
    } catch {}
  }

  try {
    const dsProc = Bun.spawnSync(["dscacheutil", "-q", "host", "-a", "name", cleaned]);
    if (dsProc.exitCode === 0) {
      const out = dsProc.stdout.toString();
      const match = out.match(/ip_address:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
      if (match && match[1] && isIpAddress(match[1])) {
        return { ip: match[1], domain: cleaned };
      }
    }
  } catch {}

  throw new Error(`[IpInfoResolve] Could not resolve host to IP: ${target}`);
}

export function fetchIpDetails(
  ip?: string,
  token?: string
): IpInfoResult {
  const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("127.");
  if (isLoopback) {
    return createPrivateIpResult(ip || "127.0.0.1");
  }

  // Check if IP is private or bogon range before remote network calls
  if (ip && ip !== "myip") {
    const cls = classifyIp(ip);
    if (cls.isPrivateOrBogon) {
      return createPrivateIpResult(ip, cls);
    }
  }

  // If in screenshot mode and querying own public IP, return clean Google Public DNS demo data
  if (process.env.SCREENSHOT_MODE === "1" && (!ip || ip === "myip")) {
    return {
      ip: "8.8.8.8",
      hostname: "dns.google",
      city: "Mountain View",
      region: "California",
      country: "US",
      loc: "37.4056,-122.0775",
      org: "AS15169 Google LLC",
      postal: "94043",
      timezone: "America/Los_Angeles",
      readme: "Google Public DNS Demonstration",
    };
  }

  const cleanIp = ip && ip !== "myip" ? `${ip.trim()}/` : "";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const primaryUrl = `https://ipinfo.io/${cleanIp}json${query}`;

  // 1. Synchronous ipinfo.io query
  const ipinfoData = syncFetchJson(primaryUrl, { Accept: "application/json", "User-Agent": "bun-ipinfo/1.0" }, 2);
  if (ipinfoData) {
    if (ipinfoData.bogon) {
      return createPrivateIpResult(ip || ipinfoData.ip || "127.0.0.1");
    }
    if (ipinfoData.ip) {
      return ipinfoData as IpInfoResult;
    }
  }

  // 2. Synchronous ipwho.is fallback query
  const targetIp = ip && ip !== "myip" ? ip.trim() : "";
  const fallbackUrl = targetIp ? `https://ipwho.is/${targetIp}` : `https://ipwho.is/`;
  const ipwhoData = syncFetchJson(fallbackUrl, { Accept: "application/json" }, 2);
  if (ipwhoData) {
    if (ipwhoData.success === false && String(ipwhoData.message).toLowerCase().includes("reserved")) {
      return createPrivateIpResult(ip || targetIp || "127.0.0.1");
    }
    if (ipwhoData.success !== false && ipwhoData.ip) {
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
  }

  // 3. Fallback: If querying a specific valid IP but upstream lookup is offline/failed
  if (ip && isIpAddress(ip)) {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      ip,
      hostname: "unresolved-ptr",
      city: "Unknown (Upstream Telemetry Unavailable)",
      region: "Unknown",
      country: "Unknown",
      loc: "0,0",
      org: "Upstream Lookup Unavailable",
      timezone: localTz,
      readme: "Could not retrieve geolocation telemetry from upstream providers. Check internet connection or API token.",
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
  const prefix = parseInt(prefixStr ?? "", 10);
  const maskInt = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const wildcardInt = ~maskInt >>> 0;
  const ipInt = ipToInt(ipStr ?? "");
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
  if (process.env.SCREENSHOT_MODE === "1") {
    return [
      { name: "lo0", address: "127.0.0.1", family: "IPv4", netmask: "255.0.0.0", mac: "00:00:00:00:00:00", internal: true },
      { name: "en0", address: "192.168.1.50", family: "IPv4", netmask: "255.255.255.0", mac: "02:00:00:00:00:01", internal: false },
      { name: "en1", address: "10.0.0.15", family: "IPv4", netmask: "255.255.0.0", mac: "02:00:00:00:00:02", internal: false },
    ];
  }
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

