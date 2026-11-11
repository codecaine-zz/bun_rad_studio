/**
 * Core operational helpers ("doers") for IPInfo: target sanitization, RFC bogon/private IP
 * classification, DNS/DoH resolution, upstream geolocation fetching (`ipinfo.io` / `ipwho.is`),
 * CIDR subnet math, local network adapter discovery, and CLI table/JSON/CSV formatting.
 */
import { lookup, reverse } from "node:dns/promises";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import type {
  IpInfoResult,
  LocalInterfaceInfo,
  SubnetInfo,
} from "./ipinfoTypes.ts";
import { colors } from "../../shared/colors.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";

/**
 * Checks whether a string matches a valid IPv4 or IPv6 address.
 */
export function isIpAddress(input: string): boolean {
  const s = input
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/%[^%]+$/, "");
  return isIP(s) !== 0;
}

/**
 * Checks whether a string is a valid IPv4 CIDR notation (`<ip>/<0..32>`).
 */
export function isCidr(input: string): boolean {
  const parts = input.trim().split("/");
  if (parts.length !== 2) return false;
  const prefix = parseInt(parts[1]!, 10);
  return (
    isIP(parts[0]!.trim()) === 4 &&
    !isNaN(prefix) &&
    prefix >= 0 &&
    prefix <= 32
  );
}

/**
 * Strips URL schemes, paths, query strings, fragments, and non-IPv6 ports from a target string.
 */
export function cleanTarget(input: string): string {
  let s = input.trim();
  s = s.replace(/^[a-zA-Z]+:\/\//, ""); // strip protocol
  s = s.replace(/\/.*$/, ""); // strip path
  s = s.replace(/\?.*$/, ""); // strip query params
  s = s.replace(/#.*$/, ""); // strip anchor
  // Handle bracketed IPv6 with optional port [::1]:8080
  const bracketMatch = s.match(/^\[([0-9a-fA-F:%.]+)\](?::[0-9]+)?$/);
  if (bracketMatch?.[1]) {
    return bracketMatch[1];
  }
  // If not IPv6, strip port
  if (!s.includes("::")) {
    const colonCount = (s.match(/:/g) || []).length;
    if (colonCount <= 1) {
      s = s.replace(/:[0-9]+$/, "");
    }
  }
  return s.trim();
}

/**
 * Performs a synchronous HTTP/HTTPS JSON fetch via `curl` with a configurable timeout in seconds.
 */
export function syncFetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutSec = 2,
): any {
  try {
    const cmd = [
      "curl",
      "-s",
      "--globoff",
      "--proto",
      "=https,http",
      "--max-time",
      String(timeoutSec),
    ];
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

/**
 * Performs a non-blocking HTTP/HTTPS JSON fetch using `fetch` and `AbortSignal.timeout`.
 */
async function asyncFetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 3000,
): Promise<any> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text && text.trim().startsWith("{")) {
      return JSON.parse(text);
    }
  } catch {}
  return null;
}

/**
 * Classification metadata indicating whether an IP belongs to a private, loopback, or bogon range.
 */
export interface IpClassification {
  isPrivateOrBogon: boolean;
  type: string;
  rfc?: string;
  scope: string;
}

/**
 * Extracts an embedded IPv4 dotted-quad string from IPv4-mapped, IPv4-compatible, or NAT64 IPv6 addresses.
 */
function extractEmbeddedIpv4(lowerIpv6: string): string | null {
  // Dotted-quad forms: ::ffff:127.0.0.1, 0:0:0:0:0:ffff:10.0.0.1, ::ffff:0:127.0.0.1, 64:ff9b::192.168.1.1, ::127.0.0.1
  const dotted = lowerIpv6.match(
    /^(?:::ffff:(?:0:)?|(?:0{1,4}:){5}ffff:|64:ff9b:(?:1:)?(?::|(?:0{1,4}:){4})|::|(?:0{1,4}:){6})(\d{1,3}(?:\.\d{1,3}){3})$/,
  );
  if (dotted?.[1] && isIP(dotted[1]) === 4) {
    return dotted[1];
  }

  // Hex-pair forms: ::ffff:7f00:1, 0:0:0:0:0:ffff:7f00:0001, 64:ff9b::7f00:1
  const hexPair = lowerIpv6.match(
    /^(?:::ffff:(?:0:)?|(?:0{1,4}:){5}ffff:|64:ff9b:(?:1:)?(?::|(?:0{1,4}:){4}))([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (hexPair?.[1] && hexPair?.[2]) {
    const hi = parseInt(hexPair[1], 16);
    const lo = parseInt(hexPair[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return null;
}

/**
 * Classifies an IPv4 or IPv6 address against standard IANA/RFC special-purpose and private ranges.
 */
export function classifyIp(ip: string): IpClassification {
  const trimmed = ip
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/%[^%]+$/, "");
  const lower = trimmed.toLowerCase();

  // Check embedded IPv4 in IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1, ::ffff:7f00:1, 64:ff9b::...)
  if (lower.includes(":")) {
    const embeddedV4 = extractEmbeddedIpv4(lower);
    if (embeddedV4) {
      const inner = classifyIp(embeddedV4);
      if (inner.isPrivateOrBogon) {
        return {
          ...inner,
          type: `IPv4-Mapped ${inner.type}`,
        };
      }
      // NAT64 prefix itself is special-purpose non-global for local translation if 64:ff9b:1::/48
      if (lower.startsWith("64:ff9b:1:")) {
        return {
          isPrivateOrBogon: true,
          type: "IPv6 Local-Use IPv4/IPv6 Translation",
          rfc: "RFC 8215 (64:ff9b:1::/48)",
          scope: "Private NAT64 Translation",
        };
      }
      return inner;
    }
  }

  if (
    trimmed === "127.0.0.1" ||
    lower === "::1" ||
    /^(?:0{1,4}:){7}0*1$/.test(lower) ||
    trimmed.startsWith("127.")
  ) {
    return {
      isPrivateOrBogon: true,
      type: "Loopback",
      rfc: "RFC 1122",
      scope: "Host Loopback Adapter",
    };
  }
  if (
    trimmed === "0.0.0.0" ||
    lower === "::" ||
    /^(?:0{1,4}:){7}0{1,4}$/.test(lower)
  ) {
    return {
      isPrivateOrBogon: true,
      type: "Unspecified Address",
      rfc: "RFC 1122 / RFC 4291",
      scope: "Non-routable Default",
    };
  }

  // IPv4 classifications
  const ipv4Parts = trimmed.split(".").map((p) => parseInt(p, 10));
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)
  ) {
    // The check above guarantees four numbers; the defaults only satisfy the type checker.
    const [o1 = 0, o2 = 0] = ipv4Parts;
    if (o1 === 0) {
      return {
        isPrivateOrBogon: true,
        type: "This Network (Current Network)",
        rfc: "RFC 1122 (0.0.0.0/8)",
        scope: "Non-routable Source Network",
      };
    }
    if (o1 === 10) {
      return {
        isPrivateOrBogon: true,
        type: "Private Network (Class A)",
        rfc: "RFC 1918 (10.0.0.0/8)",
        scope: "Local Intranet / Corporate LAN",
      };
    }
    if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      return {
        isPrivateOrBogon: true,
        type: "Private Network (Class B)",
        rfc: "RFC 1918 (172.16.0.0/12)",
        scope: "Local Intranet / Private Subnet",
      };
    }
    if (o1 === 192 && o2 === 168) {
      return {
        isPrivateOrBogon: true,
        type: "Private Network (Class C)",
        rfc: "RFC 1918 (192.168.0.0/16)",
        scope: "Home / Office Local Area Network",
      };
    }
    if (o1 === 169 && o2 === 254) {
      return {
        isPrivateOrBogon: true,
        type: "Link-Local (APIPA)",
        rfc: "RFC 3927 (169.254.0.0/16)",
        scope: "Subnet Auto-Configuration",
      };
    }
    if (o1 === 100 && o2 >= 64 && o2 <= 127) {
      return {
        isPrivateOrBogon: true,
        type: "Carrier-Grade NAT",
        rfc: "RFC 6598 (100.64.0.0/10)",
        scope: "ISP Shared Address Space",
      };
    }
    if (o1 === 192 && o2 === 0 && ipv4Parts[2] === 0) {
      return {
        isPrivateOrBogon: true,
        type: "IETF Protocol Assignments",
        rfc: "RFC 6890 (192.0.0.0/24)",
        scope: "Special-Purpose Protocol Space",
      };
    }
    if (o1 === 192 && o2 === 0 && ipv4Parts[2] === 2) {
      return {
        isPrivateOrBogon: true,
        type: "TEST-NET-1 Documentation",
        rfc: "RFC 5737",
        scope: "Documentation / Examples",
      };
    }
    if (o1 === 198 && o2 === 51 && ipv4Parts[2] === 100) {
      return {
        isPrivateOrBogon: true,
        type: "TEST-NET-2 Documentation",
        rfc: "RFC 5737",
        scope: "Documentation / Examples",
      };
    }
    if (o1 === 203 && o2 === 0 && ipv4Parts[2] === 113) {
      return {
        isPrivateOrBogon: true,
        type: "TEST-NET-3 Documentation",
        rfc: "RFC 5737",
        scope: "Documentation / Examples",
      };
    }
    if (o1 === 198 && (o2 === 18 || o2 === 19)) {
      return {
        isPrivateOrBogon: true,
        type: "Benchmark Testing",
        rfc: "RFC 2544",
        scope: "Network Device Benchmarking",
      };
    }
    if (o1 >= 224 && o1 <= 239) {
      return {
        isPrivateOrBogon: true,
        type: "Multicast Address",
        rfc: "RFC 5771 (224.0.0.0/4)",
        scope: "Local / Global Multicast Streams",
      };
    }
    if (o1 >= 240) {
      return {
        isPrivateOrBogon: true,
        type: "Reserved / Future Use",
        rfc: "RFC 1112 (240.0.0.0/4)",
        scope: "Reserved Address Space",
      };
    }
  }

  // IPv6 classifications
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return {
      isPrivateOrBogon: true,
      type: "IPv6 Link-Local Unicast",
      rfc: "RFC 4291 (fe80::/10)",
      scope: "Local Link Segment",
    };
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return {
      isPrivateOrBogon: true,
      type: "IPv6 Unique Local Address (ULA)",
      rfc: "RFC 4193 (fc00::/7)",
      scope: "Private Enterprise Routing",
    };
  }
  if (lower.startsWith("ff")) {
    return {
      isPrivateOrBogon: true,
      type: "IPv6 Multicast",
      rfc: "RFC 4291 (ff00::/8)",
      scope: "Multicast Node/Router Group",
    };
  }
  if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) {
    return {
      isPrivateOrBogon: true,
      type: "IPv6 Documentation Prefix",
      rfc: "RFC 3849 (2001:db8::/32)",
      scope: "Documentation / Examples",
    };
  }
  if (lower.startsWith("100::") || /^0*100:(?:0{1,4}:){3}/.test(lower)) {
    return {
      isPrivateOrBogon: true,
      type: "IPv6 Discard-Only Prefix",
      rfc: "RFC 6666 (100::/64)",
      scope: "Discard Traffic Sink",
    };
  }

  return {
    isPrivateOrBogon: false,
    type: "Public IP",
    scope: "Public Internet",
  };
}

/**
 * Synthesizes an `IpInfoResult` for private, loopback, or bogon IP addresses, enriching with local adapter info when matched.
 */
export function createPrivateIpResult(
  ip: string,
  classification?: IpClassification,
): IpInfoResult {
  const cls = classification || classifyIp(ip);
  let matched: LocalInterfaceInfo | undefined;
  try {
    const ifaces = getLocalInterfaces();
    matched = ifaces.find((i) => i.address.toLowerCase() === ip.toLowerCase());
  } catch {}

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const hostname =
    ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.")
      ? "localhost"
      : matched
        ? `Adapter: ${matched.name} (${matched.mac || "no MAC"})`
        : "local-host.lan";

  const org = matched
    ? `${matched.internal ? "Loopback Adapter" : "Local Network Interface"} (${matched.family}) - ${cls.rfc || cls.type}`
    : cls.rfc
      ? `${cls.rfc} - ${cls.type}`
      : cls.type;

  return {
    ip,
    hostname,
    city: matched
      ? `Host Machine (${matched.name})`
      : "Private Network / Intranet",
    region: matched ? "Local Interface" : "Non-Routable Subnet",
    country: "Private / LAN",
    loc: "0,0",
    org,
    postal: matched?.netmask ? `Mask: ${matched.netmask}` : undefined,
    timezone: localTz,
    readme: `Private / Bogon IP address (${cls.type}). ${cls.scope}. Does not route through public internet gateways.`,
  };
}

/**
 * Resolves a target hostname, URL, interface name, or IP string into an IPv4/IPv6 address and optional domain name.
 */
export function resolveTargetToIp(target?: string): {
  ip?: string;
  domain?: string;
} {
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
    const matchedIface = ifaces.find(
      (i) => i.name.toLowerCase() === cleaned.toLowerCase(),
    );
    if (matchedIface) {
      return { ip: matchedIface.address, domain: matchedIface.name };
    }
  } catch {}

  // 1. Fast synchronous DoH via curl (resolves in ~50ms even inside blocking webview runloops)
  const dohGoogle = syncFetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(cleaned)}&type=A`,
    { Accept: "application/dns-json" },
    2,
  );
  const answerGoogle = dohGoogle?.Answer?.find(
    (a: any) => a.type === 1 && a.data && isIpAddress(a.data),
  );
  if (answerGoogle?.data) {
    return { ip: answerGoogle.data, domain: cleaned };
  }

  const dohCf = syncFetchJson(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleaned)}&type=A`,
    { Accept: "application/dns-json" },
    2,
  );
  const answerCf = dohCf?.Answer?.find(
    (a: any) => a.type === 1 && a.data && isIpAddress(a.data),
  );
  if (answerCf?.data) {
    return { ip: answerCf.data, domain: cleaned };
  }

  // 2. Synchronous system resolver fallback (host / dscacheutil)
  if (!cleaned.startsWith("-")) {
    try {
      const hostProc = Bun.spawnSync(["host", "-W", "2", "--", cleaned]);
      if (hostProc.exitCode === 0) {
        const out = hostProc.stdout.toString();
        const match = out.match(
          /has address\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/,
        );
        if (match && match[1] && isIpAddress(match[1])) {
          return { ip: match[1], domain: cleaned };
        }
      }
    } catch {}

    try {
      const dsProc = Bun.spawnSync([
        "dscacheutil",
        "-q",
        "host",
        "-a",
        "name",
        cleaned,
      ]);
      if (dsProc.exitCode === 0) {
        const out = dsProc.stdout.toString();
        const match = out.match(
          /ip_address:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/,
        );
        if (match && match[1] && isIpAddress(match[1])) {
          return { ip: match[1], domain: cleaned };
        }
      }
    } catch {}
  }

  throw new Error(`[IpInfoResolve] Could not resolve host to IP: ${target}`);
}

/**
 * Asynchronously resolves a target hostname, URL, interface name, or IP string into an IPv4/IPv6 address without blocking the event loop.
 */
export async function resolveTargetToIpAsync(target?: string): Promise<{
  ip?: string;
  domain?: string;
}> {
  if (!target || target === "myip") return {};
  const cleaned = cleanTarget(target);
  if (isIpAddress(cleaned)) {
    return { ip: cleaned };
  }
  if (cleaned.toLowerCase() === "localhost") {
    return { ip: "127.0.0.1", domain: cleaned };
  }

  try {
    const ifaces = getLocalInterfaces();
    const matchedIface = ifaces.find(
      (i) => i.name.toLowerCase() === cleaned.toLowerCase(),
    );
    if (matchedIface) {
      return { ip: matchedIface.address, domain: matchedIface.name };
    }
  } catch {}

  if (!cleaned.startsWith("-")) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resolved = await Promise.race([
        lookup(cleaned),
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error("DNS timeout")), 2500);
        }),
      ]);
      if (resolved?.address && isIpAddress(resolved.address)) {
        return { ip: resolved.address, domain: cleaned };
      }
    } catch {
      // Fall through to DoH
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  const dohGoogle = await asyncFetchJson(
    `https://dns.google/resolve?name=${encodeURIComponent(cleaned)}&type=A`,
    { Accept: "application/dns-json" },
    2500,
  );
  const answerGoogle = dohGoogle?.Answer?.find(
    (a: any) => a.type === 1 && a.data && isIpAddress(a.data),
  );
  if (answerGoogle?.data) {
    return { ip: answerGoogle.data, domain: cleaned };
  }

  const dohCf = await asyncFetchJson(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleaned)}&type=A`,
    { Accept: "application/dns-json" },
    2500,
  );
  const answerCf = dohCf?.Answer?.find(
    (a: any) => a.type === 1 && a.data && isIpAddress(a.data),
  );
  if (answerCf?.data) {
    return { ip: answerCf.data, domain: cleaned };
  }

  throw new Error(`[IpInfoResolve] Could not resolve host to IP: ${target}`);
}

/**
 * Asynchronously fetches geolocation and ASN details for an IP address without spawning `curl` subprocesses,
 * handling private/bogon ranges locally before any remote network request.
 */
export async function fetchIpDetailsAsync(
  ip?: string,
  token?: string,
): Promise<IpInfoResult> {
  if (ip && ip !== "myip") {
    const cls = classifyIp(ip);
    if (cls.isPrivateOrBogon) {
      return createPrivateIpResult(ip, cls);
    }
  }

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

  const cleanIp =
    ip && ip !== "myip" ? `${encodeURIComponent(ip.trim())}/` : "";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const primaryUrl = `https://ipinfo.io/${cleanIp}json${query}`;

  const ipinfoData = await asyncFetchJson(
    primaryUrl,
    { Accept: "application/json", "User-Agent": "bun-ipinfo/1.0" },
    3000,
  );
  if (ipinfoData) {
    if (ipinfoData.bogon) {
      return createPrivateIpResult(ip || ipinfoData.ip || "127.0.0.1");
    }
    if (ipinfoData.ip) {
      return ipinfoData as IpInfoResult;
    }
  }

  const targetIp = ip && ip !== "myip" ? encodeURIComponent(ip.trim()) : "";
  const fallbackUrl = targetIp
    ? `https://ipwho.is/${targetIp}`
    : `https://ipwho.is/`;
  const ipwhoData = await asyncFetchJson(
    fallbackUrl,
    { Accept: "application/json" },
    3000,
  );
  if (ipwhoData) {
    if (
      ipwhoData.success === false &&
      String(ipwhoData.message).toLowerCase().includes("reserved")
    ) {
      return createPrivateIpResult(ip || ip?.trim() || "127.0.0.1");
    }
    if (ipwhoData.success !== false && ipwhoData.ip) {
      return {
        ip: ipwhoData.ip || ip || "",
        hostname: ipwhoData.connection?.domain || undefined,
        city: ipwhoData.city,
        region: ipwhoData.region,
        country: ipwhoData.country_code,
        loc:
          ipwhoData.latitude !== undefined && ipwhoData.longitude !== undefined
            ? `${ipwhoData.latitude},${ipwhoData.longitude}`
            : undefined,
        org:
          ipwhoData.connection?.org || ipwhoData.connection?.isp
            ? `AS${ipwhoData.connection?.asn || ""} ${ipwhoData.connection?.org || ipwhoData.connection?.isp}`.trim()
            : undefined,
        postal: ipwhoData.postal,
        timezone: ipwhoData.timezone?.id,
        readme: "Resolved via ipwho.is",
      };
    }
  }

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
      readme:
        "Could not retrieve geolocation telemetry from upstream providers. Check internet connection or API token.",
    };
  }

  throw new Error(
    `[IpInfoFetch] Failed to fetch IP details for: ${ip || "myip"}`,
  );
}

/**
 * Fetches geolocation and ASN details for an IP address (or the caller's public IP when omitted),
 * handling private ranges locally and falling back from `ipinfo.io` to `ipwho.is`.
 */
export function fetchIpDetails(ip?: string, token?: string): IpInfoResult {
  const isLoopback =
    ip === "127.0.0.1" || ip === "::1" || ip?.startsWith("127.");
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
  const ipinfoData = syncFetchJson(
    primaryUrl,
    { Accept: "application/json", "User-Agent": "bun-ipinfo/1.0" },
    2,
  );
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
  const fallbackUrl = targetIp
    ? `https://ipwho.is/${targetIp}`
    : `https://ipwho.is/`;
  const ipwhoData = syncFetchJson(
    fallbackUrl,
    { Accept: "application/json" },
    2,
  );
  if (ipwhoData) {
    if (
      ipwhoData.success === false &&
      String(ipwhoData.message).toLowerCase().includes("reserved")
    ) {
      return createPrivateIpResult(ip || targetIp || "127.0.0.1");
    }
    if (ipwhoData.success !== false && ipwhoData.ip) {
      return {
        ip: ipwhoData.ip || ip || "",
        hostname: ipwhoData.connection?.domain || undefined,
        city: ipwhoData.city,
        region: ipwhoData.region,
        country: ipwhoData.country_code,
        loc:
          ipwhoData.latitude !== undefined && ipwhoData.longitude !== undefined
            ? `${ipwhoData.latitude},${ipwhoData.longitude}`
            : undefined,
        org:
          ipwhoData.connection?.org || ipwhoData.connection?.isp
            ? `AS${ipwhoData.connection?.asn || ""} ${ipwhoData.connection?.org || ipwhoData.connection?.isp}`.trim()
            : undefined,
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
      readme:
        "Could not retrieve geolocation telemetry from upstream providers. Check internet connection or API token.",
    };
  }

  throw new Error(
    `[IpInfoFetch] Failed to fetch IP details for: ${ip || "myip"}`,
  );
}

/**
 * Extracts a single named property from an `IpInfoResult`, throwing if the property is missing.
 */
export function extractField(data: IpInfoResult, fieldName: string): string {
  const key = fieldName.toLowerCase().trim() as keyof IpInfoResult;
  const val = data[key];
  if (val === undefined || val === null) {
    throw new Error(`[IpInfoExtract] Field not found: ${fieldName}`);
  }
  return typeof val === "string" ? val : JSON.stringify(val);
}

/**
 * Formats an `IpInfoResult` as a colorized key-value summary for terminal display.
 */
export function formatSummary(data: IpInfoResult): string {
  const mapUrl = data.loc
    ? `https://maps.google.com/?q=${data.loc}`
    : undefined;
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
    .map(
      ([label, val]) => `${colors.bold(colors.cyan(label.padEnd(14)))}: ${val}`,
    );

  return lines.join("\n");
}

/**
 * Serializes one or more `IpInfoResult` objects as pretty-printed JSON.
 */
export function formatJson(data: IpInfoResult | IpInfoResult[]): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats a single `IpInfoResult` as a two-line CSV string (header row plus values row).
 */
export function formatCsv(data: IpInfoResult): string {
  const headers = [
    "ip",
    "hostname",
    "city",
    "region",
    "country",
    "loc",
    "org",
    "postal",
    "timezone",
  ];
  const values = headers.map((h) => {
    const val = (data as any)[h] ?? "";
    return `"${String(val).replace(/"/g, '""')}"`;
  });
  return `${headers.join(",")}\n${values.join(",")}`;
}

/**
 * Reads a newline-delimited list of IP/host targets from a file path or stdin (`"-"`), ignoring blank lines and `#` comments.
 */
export async function readIpTargets(target: string): Promise<string[]> {
  const text =
    target === "-" ? await Bun.stdin.text() : await Bun.file(target).text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Renders an array of `IpInfoResult` records as an aligned CLI table.
 */
export function formatBulkTable(results: IpInfoResult[]): string {
  const columns: ColumnDef<IpInfoResult>[] = [
    {
      header: "IP",
      align: "left",
      getValue: (r) => colors.bold(colors.cyan(r.ip)),
    },
    { header: "CITY", align: "left", getValue: (r) => r.city ?? "-" },
    { header: "REGION", align: "left", getValue: (r) => r.region ?? "-" },
    { header: "COUNTRY", align: "left", getValue: (r) => r.country ?? "-" },
    {
      header: "ORGANIZATION",
      align: "left",
      getValue: (r) => colors.yellow(r.org ?? "-"),
    },
  ];
  return renderTable(columns, results);
}

/**
 * Converts a dotted-quad IPv4 string into an unsigned 32-bit integer.
 */
export function ipToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

/**
 * Converts an unsigned 32-bit integer into a dotted-quad IPv4 string.
 */
export function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join(".");
}

/**
 * Computes network, broadcast, netmask, wildcard mask, usable host range, and host counts for an IPv4 CIDR block.
 */
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

/**
 * Formats a `SubnetInfo` calculation into a colorized key-value summary for terminal output.
 */
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

/**
 * Enumerates all configured network interfaces on the local host (or returns deterministic mock interfaces in screenshot mode).
 */
export function getLocalInterfaces(): LocalInterfaceInfo[] {
  if (process.env.SCREENSHOT_MODE === "1") {
    return [
      {
        name: "lo0",
        address: "127.0.0.1",
        family: "IPv4",
        netmask: "255.0.0.0",
        mac: "00:00:00:00:00:00",
        internal: true,
      },
      {
        name: "en0",
        address: "192.168.1.50",
        family: "IPv4",
        netmask: "255.255.255.0",
        mac: "02:00:00:00:00:01",
        internal: false,
      },
      {
        name: "en1",
        address: "10.0.0.15",
        family: "IPv4",
        netmask: "255.255.0.0",
        mac: "02:00:00:00:00:02",
        internal: false,
      },
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

/**
 * Renders an array of `LocalInterfaceInfo` entries as a formatted CLI table.
 */
export function formatLocalInterfaces(ifaces: LocalInterfaceInfo[]): string {
  const columns: ColumnDef<LocalInterfaceInfo>[] = [
    {
      header: "INTERFACE",
      align: "left",
      getValue: (i) => colors.bold(colors.cyan(i.name)),
    },
    { header: "FAMILY", align: "left", getValue: (i) => i.family },
    {
      header: "ADDRESS",
      align: "left",
      getValue: (i) => colors.yellow(i.address),
    },
    {
      header: "NETMASK",
      align: "left",
      getValue: (i) => colors.dim(i.netmask),
    },
    { header: "MAC", align: "left", getValue: (i) => colors.dim(i.mac) },
    {
      header: "TYPE",
      align: "left",
      getValue: (i) => (i.internal ? "internal" : "external"),
    },
  ];
  return renderTable(columns, ifaces);
}

/**
 * Performs an asynchronous reverse-DNS (`PTR`) lookup for an IP address, returning the first hostname or `undefined`.
 */
export async function lookupPtr(ip: string): Promise<string | undefined> {
  if (!isIpAddress(ip)) return undefined;
  try {
    const hostnames = await reverse(ip);
    return hostnames[0];
  } catch {
    return undefined;
  }
}
