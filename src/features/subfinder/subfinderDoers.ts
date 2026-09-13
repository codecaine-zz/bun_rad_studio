import { lookup, Resolver } from "node:dns/promises";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

const asyncResolver = new Resolver();

export function cleanDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^[a-zA-Z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:[0-9]+$/, "");
}

export function cleanSubdomain(raw: string, rootDomain: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/[^a-z0-9.-]/g, "");

  if (!cleaned || cleaned === rootDomain) return cleaned || null;
  if (!cleaned.endsWith(`.${rootDomain}`) && cleaned !== rootDomain) return null;
  return cleaned;
}

export function deduplicateSubdomains(list: string[]): string[] {
  return Array.from(new Set(list)).sort();
}

export async function queryHackerTarget(
  domain: string,
  timeoutMs: number = 4000
): Promise<string[]> {
  try {
    const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 4000)),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (text.includes("error") || text.includes("No DNS records found")) return [];
    return text
      .split("\n")
      .map((line) => line.split(",")[0]?.trim())
      .filter((h): h is string => Boolean(h));
  } catch {
    return [];
  }
}

export async function queryCrtSh(
  domain: string,
  timeoutMs: number = 4000
): Promise<string[]> {
  try {
    const res = await fetch(`https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 4000)),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ name_value?: string }>;
    if (!Array.isArray(data)) return [];
    const results: string[] = [];
    for (const item of data.slice(0, 100)) {
      if (!item.name_value) continue;
      const subdomains = item.name_value.split("\n");
      results.push(...subdomains);
    }
    return results;
  } catch {
    return [];
  }
}

export async function queryAlienVault(
  domain: string,
  timeoutMs: number = 3000
): Promise<string[]> {
  try {
    const url = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 3000)),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { passive_dns?: Array<{ hostname?: string }> };
    return (data.passive_dns ?? [])
      .map((d) => d.hostname)
      .filter((h): h is string => Boolean(h));
  } catch {
    return [];
  }
}

export async function queryAnubis(
  domain: string,
  timeoutMs: number = 3000
): Promise<string[]> {
  try {
    const res = await fetch(`https://jldc.me/anubis/subdomains/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 3000)),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return [];
    return (await res.json()) as string[];
  } catch {
    return [];
  }
}

export async function queryCertSpotter(
  domain: string,
  timeoutMs: number = 3500
): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 3500)),
      }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data)) return [];
    const subs: string[] = [];
    for (const item of data.slice(0, 100)) {
      if (Array.isArray(item.dns_names)) {
        for (const d of item.dns_names) {
          subs.push(d);
        }
      }
    }
    return subs;
  } catch {
    return [];
  }
}

export const COMMON_SUBDOMAINS = [
  "www", "mail", "api", "dev", "app", "admin", "blog", "portal", "cloud",
  "staging", "auth", "login", "cdn", "vpn", "m", "docs", "support", "test",
  "status", "shop", "beta", "secure", "git", "drive", "news", "maps", "ns1", "ns2"
];

export async function queryCommonDns(domain: string): Promise<string[]> {
  const root = cleanDomain(domain);
  const results = await Promise.all(
    COMMON_SUBDOMAINS.map(async (sub) => {
      const host = `${sub}.${root}`;
      try {
        const res = await Promise.race([
          lookup(host),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DNS timeout")), 1500)),
        ]);
        if (res && res.address) return host;
      } catch {}
      return null;
    })
  );
  return results.filter((h): h is string => Boolean(h));
}

export async function resolveHostDns(host: string): Promise<string[]> {
  try {
    const res = await Promise.race([
      asyncResolver.resolve4(host),
      new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("DNS timeout")), 1200)),
    ]);
    return res;
  } catch {
    try {
      const fallback = await Promise.race([
        lookup(host, { all: true }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DNS timeout")), 1000)),
      ]);
      return fallback.map((a: any) => a.address);
    } catch {
      return [];
    }
  }
}

export async function probeHttp(
  host: string,
  timeoutMs: number = 1800
): Promise<{ status?: number; title?: string }> {
  for (const proto of ["https", "http"]) {
    try {
      const res = await fetch(`${proto}://${host}`, {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      const html = await res.text();
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = match ? match[1]!.trim().slice(0, 40) : undefined;
      return { status: res.status, title };
    } catch {}
  }
  return {};
}

export async function detectWildcardDns(rootDomain: string): Promise<string[]> {
  const randomPrefix = `probe-wildcard-${Math.random().toString(36).substring(2, 10)}`;
  const testHost = `${randomPrefix}.${rootDomain}`;
  return resolveHostDns(testHost);
}

export function isWildcardMatch(ips: string[], wildcardIps: string[]): boolean {
  if (wildcardIps.length === 0 || ips.length === 0) return false;
  return ips.every((ip) => wildcardIps.includes(ip));
}

export async function probePort(host: string, port: number, timeoutMs: number = 800): Promise<boolean> {
  try {
    const connectPromise = Bun.connect({
      hostname: host,
      port,
      socket: {
        open(s) {
          s.end();
        },
        data() {},
        error() {},
        close() {},
      },
    }).then((s) => {
      s.end();
      return true;
    }).catch(() => false);

    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    );

    return await Promise.race([connectPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

export async function probePorts(
  host: string,
  ports: number[],
  timeoutMs: number = 800
): Promise<number[]> {
  const openPorts: number[] = [];
  await Promise.all(
    ports.map(async (port) => {
      const isOpen = await probePort(host, port, timeoutMs);
      if (isOpen) openPorts.push(port);
    })
  );
  return openPorts.sort((a, b) => a - b);
}

export function queryCommonDnsSync(domain: string): { host: string; ip?: string[] }[] {
  const root = cleanDomain(domain);
  const candidateHosts = COMMON_SUBDOMAINS.map((s) => `${s}.${root}`);
  try {
    const res = Bun.spawnSync(["dig", "+noall", "+answer", "+time=1", "+tries=1", ...candidateHosts]);
    const lines = res.stdout ? res.stdout.toString().split("\n") : [];
    const map = new Map<string, string[]>();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const rawName = parts[0]!.replace(/\.$/, "").toLowerCase();
        const rType = parts[3]!;
        const rData = parts[4]!;
        if (rType === "A" || rType === "AAAA") {
          const list = map.get(rawName) ?? [];
          if (!list.includes(rData)) list.push(rData);
          map.set(rawName, list);
        }
      }
    }
    return Array.from(map.entries()).map(([host, ip]) => ({ host, ip }));
  } catch {
    return [];
  }
}

export function queryCertSpotterSync(domain: string): string[] {
  try {
    const root = cleanDomain(domain);
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(root)}&include_subdomains=true&expand=dns_names`;
    const res = Bun.spawnSync(["curl", "-s", "--max-time", "2", url]);
    if (res.exitCode !== 0) return [];
    const data = JSON.parse(res.stdout.toString());
    if (!Array.isArray(data)) return [];
    const subs: string[] = [];
    for (const item of data.slice(0, 30)) {
      if (Array.isArray(item.dns_names)) {
        for (const name of item.dns_names) {
          const clean = cleanSubdomain(name, root);
          if (clean) subs.push(clean);
        }
      }
    }
    return deduplicateSubdomains(subs);
  } catch {
    return [];
  }
}

export function queryHackerTargetSync(domain: string): string[] {
  try {
    const root = cleanDomain(domain);
    const url = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(root)}`;
    const res = Bun.spawnSync(["curl", "-s", "--max-time", "2", url]);
    if (res.exitCode !== 0) return [];
    const text = res.stdout ? res.stdout.toString() : "";
    if (text.includes("error") || text.includes("No DNS records found") || text.includes("API count exceeded")) return [];
    const subs: string[] = [];
    for (const line of text.split("\n")) {
      const host = line.split(",")[0]?.trim();
      if (host) {
        const clean = cleanSubdomain(host, root);
        if (clean) subs.push(clean);
      }
    }
    return deduplicateSubdomains(subs);
  } catch {
    return [];
  }
}

export function resolveHostDnsSync(hosts: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (hosts.length === 0) return map;
  try {
    const res = Bun.spawnSync(["dig", "+noall", "+answer", "+time=1", "+tries=1", ...hosts.slice(0, 100)]);
    const lines = res.stdout ? res.stdout.toString().split("\n") : [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const rawName = parts[0]!.replace(/\.$/, "").toLowerCase();
        const rType = parts[3]!;
        const rData = parts[4]!;
        if (rType === "A" || rType === "AAAA") {
          const list = map.get(rawName) ?? [];
          if (!list.includes(rData)) list.push(rData);
          map.set(rawName, list);
        }
      }
    }
  } catch {}
  return map;
}

export function queryOsintSourcesSync(domain: string): { certSubs: string[]; hackerSubs: string[] } {
  const root = cleanDomain(domain);
  const certUrl = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(root)}&include_subdomains=true&expand=dns_names`;
  const hackerUrl = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(root)}`;
  
  const tmpCert = path.join(os.tmpdir(), `subfinder_cs_${process.pid}_${Math.random().toString(36).slice(2, 6)}.json`);
  const tmpHacker = path.join(os.tmpdir(), `subfinder_ht_${process.pid}_${Math.random().toString(36).slice(2, 6)}.txt`);

  try {
    const script = `curl -s --connect-timeout 1 --max-time 2.5 "${certUrl}" > "${tmpCert}" 2>/dev/null & curl -s --connect-timeout 1 --max-time 2.5 "${hackerUrl}" > "${tmpHacker}" 2>/dev/null & wait`;
    Bun.spawnSync(["/bin/sh", "-c", script]);

    let certSubs: string[] = [];
    if (fs.existsSync(tmpCert)) {
      try {
        const raw = fs.readFileSync(tmpCert, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data.slice(0, 50)) {
            if (Array.isArray(item.dns_names)) {
              for (const name of item.dns_names) {
                const clean = cleanSubdomain(name, root);
                if (clean) certSubs.push(clean);
              }
            }
          }
        }
      } catch {}
      try { fs.unlinkSync(tmpCert); } catch {}
    }

    let hackerSubs: string[] = [];
    if (fs.existsSync(tmpHacker)) {
      try {
        const text = fs.readFileSync(tmpHacker, "utf-8");
        if (!text.includes("error") && !text.includes("No DNS records found") && !text.includes("API count exceeded")) {
          for (const line of text.split("\n")) {
            const host = line.split(",")[0]?.trim();
            if (host) {
              const clean = cleanSubdomain(host, root);
              if (clean) hackerSubs.push(clean);
            }
          }
        }
      } catch {}
      try { fs.unlinkSync(tmpHacker); } catch {}
    }

    return {
      certSubs: deduplicateSubdomains(certSubs),
      hackerSubs: deduplicateSubdomains(hackerSubs),
    };
  } catch {
    return { certSubs: [], hackerSubs: [] };
  }
}

export function probeHostsHttpSync(hosts: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (hosts.length === 0) return map;
  const targets = hosts.slice(0, 10);
  const tmpDir = os.tmpdir();
  const script = targets
    .map((h, i) => `curl -s -I --connect-timeout 0.4 --max-time 0.8 "http://${h}" > "${tmpDir}/pb_${process.pid}_${i}.txt" 2>/dev/null &`)
    .join("\n") + "\nwait\n";
  try {
    Bun.spawnSync(["/bin/sh", "-c", script]);
    targets.forEach((h, i) => {
      const f = `${tmpDir}/pb_${process.pid}_${i}.txt`;
      if (fs.existsSync(f)) {
        try {
          const text = fs.readFileSync(f, "utf-8");
          const m = text.match(/HTTP\/[0-9.]+\s+([0-9]{3})/i);
          if (m) map.set(h, parseInt(m[1]!, 10));
        } catch {}
        try { fs.unlinkSync(f); } catch {}
      }
    });
  } catch {}
  return map;
}

