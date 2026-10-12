/**
 * Pure helpers for IpInfo Studio's productivity toolkit (bulk lookup, subnet math,
 * IP format conversion, history). No GUI, no direct network access unless the default
 * lookup dependencies are used.
 */
import { isIP } from "node:net";
import { cleanTarget, resolveTargetToIp, fetchIpDetails } from "./ipinfoDoers.ts";
import type { IpInfoResult } from "./ipinfoTypes.ts";

// ---------------------------------------------------------------------------
// Validation & conversion
// ---------------------------------------------------------------------------

export function isValidIpv4(s: string): boolean {
  return isIP(s.trim()) === 4;
}
export function isValidIp(s: string): boolean {
  return isIP(s.trim()) !== 0;
}

export function ipv4ToInt(ip: string): number {
  const p = ip.trim().split(".").map((x) => parseInt(x, 10));
  if (!isValidIpv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return (((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!) >>> 0;
}
export function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/** Accept dotted-quad, a decimal integer (e.g. 3232235777) or 0x hex, and return dotted-quad. */
export function parseIpv4Flexible(input: string): string {
  const s = input.trim();
  if (isValidIpv4(s)) return s;
  let n: number;
  if (/^0x[0-9a-f]{1,8}$/i.test(s)) n = parseInt(s, 16);
  else if (/^\d{1,10}$/.test(s)) n = parseInt(s, 10);
  else throw new Error(`Not an IPv4 address, decimal or 0x hex value: ${input}`);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) throw new Error(`Value out of IPv4 range: ${input}`);
  return intToIpv4(n);
}

/** Rows describing an IPv4 address in several notations. */
export function describeIpv4(input: string): string[][] {
  const ip = parseIpv4Flexible(input);
  const n = ipv4ToInt(ip);
  const octets = ip.split(".").map((o) => parseInt(o, 10));
  return [
    ["Dotted Decimal", ip],
    ["Integer", String(n)],
    ["Hexadecimal", "0x" + n.toString(16).toUpperCase().padStart(8, "0")],
    ["Binary", octets.map((o) => o.toString(2).padStart(8, "0")).join(".")],
    ["Octal (per octet)", octets.map((o) => "0" + o.toString(8)).join(".")],
    ["Reverse DNS Zone", `${octets.slice().reverse().join(".")}.in-addr.arpa`],
  ];
}

export function prefixToMask(prefix: number): string {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Prefix must be 0-32, got ${prefix}`);
  return intToIpv4(prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0);
}

/** Convert a dotted netmask to a prefix length; rejects non-contiguous masks. */
export function maskToPrefix(mask: string): number {
  const n = ipv4ToInt(mask);
  const bits = n.toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(bits)) throw new Error(`Not a valid netmask (non-contiguous bits): ${mask}`);
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

/** Strict CIDR validation (valid IPv4 octets and a 0-32 prefix). */
export function isValidCidr(s: string): boolean {
  const parts = s.trim().split("/");
  if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1]!)) return false;
  const prefix = parseInt(parts[1]!, 10);
  return isValidIpv4(parts[0]!) && prefix >= 0 && prefix <= 32;
}

function cidrRange(cidr: string): { start: number; end: number; prefix: number } {
  if (!isValidCidr(cidr)) throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  const [ip, p] = cidr.trim().split("/");
  const prefix = parseInt(p!, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const start = (ipv4ToInt(ip!) & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end, prefix };
}

export function cidrContains(cidr: string, ip: string): boolean {
  const { start, end } = cidrRange(cidr);
  const n = ipv4ToInt(parseIpv4Flexible(ip));
  return n >= start && n <= end;
}

/** Do two CIDR blocks overlap? */
export function cidrsOverlap(a: string, b: string): boolean {
  const x = cidrRange(a);
  const y = cidrRange(b);
  return x.start <= y.end && y.start <= x.end;
}

/** Split a CIDR into smaller blocks of `newPrefix`. Returns at most `limit` blocks. */
export function splitCidr(cidr: string, newPrefix: number, limit = 256): { blocks: string[]; total: number; truncated: boolean } {
  const { start, prefix } = cidrRange(cidr);
  if (!Number.isInteger(newPrefix) || newPrefix < 0 || newPrefix > 32) throw new Error(`New prefix must be 0-32, got ${newPrefix}`);
  if (newPrefix <= prefix) throw new Error(`New prefix /${newPrefix} must be longer than /${prefix}`);
  const total = Math.pow(2, newPrefix - prefix);
  const size = Math.pow(2, 32 - newPrefix);
  const count = Math.min(total, limit);
  const blocks: string[] = [];
  for (let i = 0; i < count; i++) blocks.push(`${intToIpv4(start + i * size)}/${newPrefix}`);
  return { blocks, total, truncated: total > count };
}

// ---------------------------------------------------------------------------
// Target parsing
// ---------------------------------------------------------------------------

export const MAX_BULK_TARGETS = 50;

/** Split pasted text into unique cleaned targets. `#` starts a comment. */
export function parseTargets(text: string, max = MAX_BULK_TARGETS): { targets: string[]; skipped: number } {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    for (const tok of line.split(/[\s,;]+/)) {
      const t = tok.trim();
      if (!t) continue;
      const cleaned = t.includes("/") && isValidCidr(t) ? t : cleanTarget(t);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(cleaned);
    }
  }
  return { targets: all.slice(0, max), skipped: Math.max(0, all.length - max) };
}

// ---------------------------------------------------------------------------
// Bulk lookup
// ---------------------------------------------------------------------------

export interface BulkRow {
  target: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  org: string;
  status: "ok" | "error";
  error?: string;
}

export interface BulkDeps {
  resolve: (target: string) => { ip?: string; domain?: string };
  fetch: (ip?: string, token?: string) => IpInfoResult;
}

const defaultDeps: BulkDeps = { resolve: resolveTargetToIp, fetch: fetchIpDetails };

export function bulkLookup(
  targets: string[],
  token?: string,
  deps: BulkDeps = defaultDeps,
  onProgress?: (done: number, total: number) => void
): BulkRow[] {
  const rows: BulkRow[] = [];
  targets.forEach((target, i) => {
    try {
      if (isValidCidr(target)) throw new Error("CIDR blocks are not looked up in bulk; use the subnet calculator");
      const r = deps.resolve(target);
      const d = deps.fetch(r.ip, token);
      rows.push({
        target,
        ip: d.ip || r.ip || "",
        city: d.city || "-",
        region: d.region || "-",
        country: d.country || "-",
        org: d.org || "-",
        status: "ok",
      });
    } catch (e: any) {
      rows.push({ target, ip: "", city: "-", region: "-", country: "-", org: "-", status: "error", error: String(e?.message || e) });
    }
    onProgress?.(i + 1, targets.length);
  });
  return rows;
}

export const BULK_HEADERS = ["Target", "IP", "City", "Region", "Country", "Organization / ASN", "Status"];

export function bulkToTableRows(rows: BulkRow[]): string[][] {
  return rows.map((r) => [r.target, r.ip || "-", r.city, r.region, r.country, r.org, r.status === "ok" ? "OK" : `Error: ${r.error}`]);
}

const csvCell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function bulkToCsv(rows: BulkRow[]): string {
  const header = ["target", "ip", "city", "region", "country", "org", "status", "error"];
  return [header.join(","), ...rows.map((r) => header.map((h) => csvCell((r as any)[h])).join(","))].join("\n");
}

export function tableToTsv(headers: string[], rows: string[][]): string {
  const clean = (s: any) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  return [headers.map(clean).join("\t"), ...rows.map((r) => r.map(clean).join("\t"))].join("\n");
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoryEntry { target: string; summary: string; time: string }

/** Add to the front, de-duplicating by target (case-insensitive), capped at `max`. */
export function pushHistory(list: HistoryEntry[], entry: HistoryEntry, max = 20): HistoryEntry[] {
  const key = entry.target.trim().toLowerCase();
  return [entry, ...list.filter((h) => h.target.trim().toLowerCase() !== key)].slice(0, max);
}

export function ipInfoUrl(ip: string): string {
  return `https://ipinfo.io/${encodeURIComponent(ip)}`;
}
export function bgpUrl(ip: string): string {
  return `https://bgp.he.net/ip/${encodeURIComponent(ip)}`;
}

export function tableToCsv(headers: string[], rows: string[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}
