import { Resolver } from "node:dns/promises";
import type { DnsAnswer, DnsRecordType, DoggoResponse } from "./doggoTypes.ts";
import { colors } from "../../shared/colors.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";

export const RECORD_TYPES: DnsRecordType[] = [
  "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "CAA", "SRV"
];

export function parseTargetArgs(args: string[]): {
  domain?: string;
  type?: DnsRecordType;
  nameserver?: string;
} {
  let domain: string | undefined;
  let type: DnsRecordType | undefined;
  let nameserver: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("@")) {
      nameserver = arg.slice(1);
    } else if (RECORD_TYPES.includes(arg.toUpperCase() as DnsRecordType)) {
      type = arg.toUpperCase() as DnsRecordType;
    } else if (!domain) {
      domain = arg;
    }
  }

  return { domain, type, nameserver };
}

export function isIpAddress(target: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || target.includes(":");
}

export function formatRecordData(type: DnsRecordType, item: any): { data: string; ttl?: number } {
  if (typeof item === "string") return { data: item };
  if (Array.isArray(item)) return { data: `"${item.join(" ")}"` };
  if (item.address) return { data: item.address, ttl: item.ttl };
  if (typeof item.exchange === "string") return { data: `${item.priority} ${item.exchange || "."}` };
  if (item.nsname) {
    const parts = [item.nsname, item.hostmaster, item.serial, item.refresh, item.retry, item.expire, item.minttl].filter(Boolean);
    return { data: parts.join(" ") };
  }
  if (item.critical !== undefined) {
    const tag = item.issue ? "issue" : item.issuewild ? "issuewild" : item.iodef ? "iodef" : "contactemail";
    const val = item.issue ?? item.issuewild ?? item.iodef ?? "";
    return { data: `${item.critical ? "128" : "0"} ${tag} "${val}"` };
  }
  if (item.name && item.port) return { data: `${item.priority} ${item.weight} ${item.port} ${item.name}` };
  return { data: JSON.stringify(item) };
}

export async function performDnsLookup(
  domain: string,
  type: DnsRecordType,
  nameserver?: string
): Promise<DoggoResponse> {
  // Clean target domain: remove protocol, paths, whitespace
  let cleanDomain = domain.trim().replace(/^https?:\/\//i, "").split(/[\/\s]/)[0] ?? domain;
  if (!cleanDomain) cleanDomain = domain;

  const resolver = new Resolver();
  if (nameserver) {
    const cleanNs = nameserver.trim().replace(/^@/, "");
    if (cleanNs) resolver.setServers([cleanNs]);
  }
  const activeServer = nameserver ? nameserver.trim().replace(/^@/, "") : resolver.getServers()[0] ?? "default";

  const start = performance.now();
  let rawRecords: any[] = [];

  const timeoutMs = 3500;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`DNS resolution timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    const lookupPromise = (async () => {
      if (type === "A") return await resolver.resolve4(cleanDomain, { ttl: true });
      if (type === "AAAA") return await resolver.resolve6(cleanDomain, { ttl: true });
      if (type === "CNAME") return await resolver.resolveCname(cleanDomain);
      if (type === "MX") return await resolver.resolveMx(cleanDomain);
      if (type === "TXT") return await resolver.resolveTxt(cleanDomain);
      if (type === "NS") return await resolver.resolveNs(cleanDomain);
      if (type === "SOA") return [await resolver.resolveSoa(cleanDomain)];
      if (type === "PTR") {
        return isIpAddress(cleanDomain)
          ? await resolver.reverse(cleanDomain)
          : await resolver.resolvePtr(cleanDomain);
      }
      if (type === "CAA") return await resolver.resolveCaa(cleanDomain);
      if (type === "SRV") return await resolver.resolveSrv(cleanDomain);
      return [];
    })();

    rawRecords = await Promise.race([lookupPromise, timeoutPromise]);
  } catch (err: any) {
    if (err.code !== "ENODATA" && err.code !== "ENOTFOUND") {
      throw err;
    }
  }

  const queryTimeMs = Math.round(performance.now() - start);
  const answers: DnsAnswer[] = (rawRecords || []).map((item) => {
    const { data, ttl } = formatRecordData(type, item);
    return { name: `${cleanDomain}.`, type, class: "IN", ttl, data };
  });

  return { domain: cleanDomain, queryType: type, answers, queryTimeMs, server: activeServer, protocol: "UDP" };
}

export const DNS_TYPE_MAP: Record<number, string> = {
  1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 257: "CAA"
};

export async function performDohLookup(
  domain: string,
  type: string = "A",
  dohUrl: string = "https://cloudflare-dns.com/dns-query"
): Promise<DoggoResponse> {
  const start = performance.now();
  const url = `${dohUrl}?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`[DoggoDoH] HTTP error ${res.status}: ${res.statusText}`);
  const json: any = await res.json();
  const queryTimeMs = Math.round(performance.now() - start);
  const answers: DnsAnswer[] = (json.Answer ?? []).map((ans: any) => ({
    name: ans.name,
    type: DNS_TYPE_MAP[ans.type] ?? String(ans.type),
    class: "IN",
    ttl: ans.TTL,
    data: ans.data,
  }));
  return { domain, queryType: type, answers, queryTimeMs, server: dohUrl, protocol: "DoH" };
}

export async function performAllLookup(
  domain: string,
  nameserver?: string,
  isDoh?: boolean
): Promise<DoggoResponse> {
  const types: DnsRecordType[] = ["A", "AAAA", "MX", "TXT", "NS"];
  const settled = await Promise.allSettled(
    types.map((t) => (isDoh ? performDohLookup(domain, t) : performDnsLookup(domain, t, nameserver)))
  );
  const successful = settled
    .filter((s): s is PromiseFulfilledResult<DoggoResponse> => s.status === "fulfilled")
    .map((s) => s.value);

  const answers = successful.flatMap((l) => l.answers);
  const queryTimeMs = successful.length > 0 ? Math.max(...successful.map((l) => l.queryTimeMs)) : 0;
  const server = successful[0]?.server ?? nameserver ?? "default";
  return { domain, queryType: "ALL", answers, queryTimeMs, server, protocol: isDoh ? "DoH" : "UDP" };
}

export function formatDoggoTable(res: DoggoResponse, showTime: boolean = true): string {
  const proto = res.protocol ? ` (${res.protocol})` : "";
  const footer = showTime ? `\n${colors.dim(`Query time: ${res.queryTimeMs}ms  Server: ${res.server}${proto}`)}` : "";
  if (res.answers.length === 0) {
    return `${colors.dim(`No ${res.queryType} records found for ${res.domain}.`)}${footer}`;
  }

  const columns: ColumnDef<DnsAnswer>[] = [
    { header: "NAME", align: "left", getValue: (a) => colors.bold(a.name) },
    { header: "TYPE", align: "left", getValue: (a) => colors.yellow(a.type) },
    { header: "CLASS", align: "left", getValue: (a) => colors.dim(a.class) },
    { header: "TTL", align: "right", getValue: (a) => (a.ttl ? colors.dim(a.ttl.toString()) : "-") },
    { header: "ADDRESS / DATA", align: "left", getValue: (a) => colors.cyan(a.data) },
  ];

  const table = renderTable(columns, res.answers);
  return `${table}${footer}`;
}

export function formatShortOutput(res: DoggoResponse): string {
  return res.answers.map((a) => a.data).join("\n");
}

export function formatJsonOutput(res: DoggoResponse): string {
  return JSON.stringify(res, null, 2);
}

export function performDnsLookupSync(
  domain: string,
  type: DnsRecordType | string = "A",
  nameserver?: string,
  isDoh: boolean = false,
  dohUrl: string = "https://cloudflare-dns.com/dns-query"
): DoggoResponse {
  const start = performance.now();
  let cleanDomain = domain.trim().replace(/^https?:\/\//i, "").split(/[\/\s]/)[0] ?? domain;
  if (!cleanDomain) cleanDomain = domain;

  let answers: DnsAnswer[] = [];
  let serverUsed = nameserver ? nameserver.replace(/^@/, "") : "System Default";

  if (isDoh || !nameserver) {
    const url = `${dohUrl}?name=${encodeURIComponent(cleanDomain)}&type=${encodeURIComponent(type)}`;
    try {
      const res = Bun.spawnSync(["curl", "-s", "--max-time", "3", "-H", "Accept: application/dns-json", url]);
      if (res.exitCode === 0) {
        const json = JSON.parse(res.stdout.toString());
        serverUsed = dohUrl;
        answers = (json.Answer || []).map((a: any) => ({
          name: a.name,
          type: DNS_TYPE_MAP[a.type] || String(a.type),
          class: "IN",
          ttl: a.TTL,
          data: a.data,
        }));
      }
    } catch {}
  }

  if (answers.length === 0) {
    const args = ["dig", "+noall", "+answer", "+time=2", "+tries=1", cleanDomain, String(type)];
    if (nameserver) {
      const ns = nameserver.replace(/^@/, "");
      args.push(`@${ns}`);
      serverUsed = ns;
    }
    try {
      const res = Bun.spawnSync(args);
      const lines = res.stdout.toString().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          answers.push({
            name: parts[0]!,
            ttl: parseInt(parts[1]!, 10),
            class: parts[2]!,
            type: parts[3]! as DnsRecordType,
            data: parts.slice(4).join(" "),
          });
        }
      }
    } catch {}
  }

  return {
    domain: cleanDomain,
    queryType: type as DnsRecordType,
    answers,
    queryTimeMs: Math.round(performance.now() - start),
    server: serverUsed,
    protocol: isDoh ? "DoH" : "UDP",
  };
}

export function performAllLookupSync(
  domain: string,
  nameserver?: string,
  isDoh?: boolean,
  dohUrl?: string
): DoggoResponse {
  const types: DnsRecordType[] = ["A", "AAAA", "MX", "TXT", "NS"];
  const answers: DnsAnswer[] = [];
  let maxTime = 0;
  let server = nameserver ? nameserver.replace(/^@/, "") : (dohUrl || "System Default");

  for (const t of types) {
    const res = performDnsLookupSync(domain, t, nameserver, isDoh, dohUrl);
    if (res.answers.length > 0) answers.push(...res.answers);
    if (res.queryTimeMs > maxTime) maxTime = res.queryTimeMs;
    if (res.server) server = res.server;
  }

  return {
    domain,
    queryType: "ALL",
    answers,
    queryTimeMs: maxTime,
    server,
    protocol: isDoh ? "DoH" : "UDP",
  };
}
