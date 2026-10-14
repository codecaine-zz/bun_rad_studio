/**
 * Address maths for the IP info tool that needs more than the IPv4-only helpers of the stand-alone IP Info Studio:
 * IPv6 (BigInt), IPv4-mapped addresses, notation tables, and a classifier that understands IPv6 properly.
 * Everything here is pure: no network, no disk.
 */
import { isIP } from "node:net";
import { classifyIp, type IpClassification } from "../ipinfo/ipinfoDoers";
import { describeIpv4, intToIpv4, ipv4ToInt, parseIpv4Flexible } from "../ipinfo/ipinfoTools";
import { FmError } from "./fmPaths";

const V6_MAX = (1n << 128n) - 1n;

export type Family = "v4" | "v6";

export const familyOf = (ip: string): Family | null => {
  const k = isIP(ip);
  return k === 4 ? "v4" : k === 6 && !ip.includes("%") ? "v6" : null;
};

/** The 128-bit number of an IPv6 address (accepts "::" and a dotted IPv4 tail). */
export function parseV6(input: string): bigint {
  if (familyOf(input) !== "v6") throw new FmError("BAD_IP", `"${input.slice(0, 60)}" isn't a valid IPv6 address.`);
  let s = input.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = ipv4ToInt(tail[1]!);
    s = `${s.slice(0, -tail[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length > 1 ? [...head, ...Array(8 - head.length - rest.length).fill("0"), ...rest] : head;
  let n = 0n;
  for (const g of groups) n = (n << 16n) | BigInt(parseInt(g || "0", 16));
  return n;
}

/** Eight four-digit groups, e.g. 2001:0db8:0000:... */
export function expandV6(n: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) groups.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16).padStart(4, "0"));
  return groups.join(":");
}

/** The short form (RFC 5952): the longest run of zero groups becomes "::". */
export function compressV6(n: bigint): string {
  const groups = expandV6(n).split(":").map((g) => g.replace(/^0+(?=.)/, ""));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  if (bestLen < 2) return groups.join(":");
  return `${groups.slice(0, bestStart).join(":")}::${groups.slice(bestStart + bestLen).join(":")}`;
}

/** The IPv4 address inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d), or null. */
export function mappedV4(ip: string): string | null {
  if (familyOf(ip) !== "v6") return null;
  const n = parseV6(ip);
  return n >> 32n === 0xffffn ? intToIpv4(Number(n & 0xffffffffn)) : null;
}

/** One spelling per address: IPv4 as is, IPv6 short and lower case. */
export const canonicalIp = (ip: string): string => (familyOf(ip) === "v6" ? compressV6(parseV6(ip)) : ip);

/** Like the studio's classifier, but correct for IPv6 (it only looks at text prefixes) and a few more ranges. */
export function classifyAny(ip: string): IpClassification {
  if (familyOf(ip) === "v4") {
    if (ip.startsWith("0.") && ip !== "0.0.0.0") return { isPrivateOrBogon: true, type: "Current Network", rfc: "RFC 1122 (0.0.0.0/8)", scope: "Non-routable Default" };
    return classifyIp(ip);
  }
  const n = parseV6(ip);
  if (n === 0n) return classifyIp("::");
  if (n === 1n) return classifyIp("::1");
  const inner = mappedV4(ip);
  if (inner) {
    const c = classifyAny(inner);
    return { ...c, type: `IPv4-mapped IPv6 (${c.type})` };
  }
  if (n >> 96n === 0x20010db8n) return { isPrivateOrBogon: true, type: "IPv6 Documentation", rfc: "RFC 3849 (2001:db8::/32)", scope: "Documentation / Examples" };
  return classifyIp(expandV6(n));
}

export interface SubnetV6 {
  cidr: string;
  family: "v6";
  prefix: number;
  network: string;
  lastAddress: string;
  netmask: string;
  firstHost: string;
  lastHost: string;
  totalHosts: string;
  usableHosts: string;
}

/** "2001:db8::1/64" split into the address number and prefix. Throws a plain-language error when it isn't a v6 CIDR. */
export function parseCidrV6(cidr: string): { ip: bigint; prefix: number } {
  const [addr, p, ...extra] = cidr.trim().split("/");
  if (extra.length || !addr || !p || !/^\d{1,3}$/.test(p) || Number(p) > 128) throw new FmError("BAD_CIDR", "An IPv6 block looks like 2001:db8::/32 (a prefix from 0 to 128).");
  return { ip: parseV6(addr), prefix: Number(p) };
}

const hostMask = (prefix: number, bits: number): bigint => (1n << BigInt(bits - prefix)) - 1n;

export function subnetV6(cidr: string): SubnetV6 {
  const { ip, prefix } = parseCidrV6(cidr);
  const host = hostMask(prefix, 128);
  const network = ip & ~host & V6_MAX;
  const last = network | host;
  const total = host + 1n;
  return {
    cidr: `${compressV6(ip)}/${prefix}`,
    family: "v6",
    prefix,
    network: compressV6(network),
    lastAddress: compressV6(last),
    netmask: compressV6(~host & V6_MAX),
    firstHost: compressV6(network),
    lastHost: compressV6(last),
    totalHosts: total.toString(),
    usableHosts: total.toString(),
  };
}

export const containsV6 = (cidr: string, ip: string): boolean => {
  const { ip: base, prefix } = parseCidrV6(cidr);
  const host = hostMask(prefix, 128);
  return ((base & ~host) & V6_MAX) === ((parseV6(ip) & ~host) & V6_MAX);
};

export function splitV6(cidr: string, newPrefix: number, limit: number): { blocks: string[]; total: string; truncated: boolean } {
  const { ip, prefix } = parseCidrV6(cidr);
  if (!Number.isInteger(newPrefix) || newPrefix > 128 || newPrefix <= prefix) throw new FmError("BAD_PREFIX", `Pick a prefix longer than /${prefix} and at most /128.`);
  const network = ip & ~hostMask(prefix, 128) & V6_MAX;
  const total = 1n << BigInt(newPrefix - prefix);
  const size = 1n << BigInt(128 - newPrefix);
  const count = total < BigInt(limit) ? Number(total) : limit;
  const blocks: string[] = [];
  for (let i = 0; i < count; i++) blocks.push(`${compressV6(network + BigInt(i) * size)}/${newPrefix}`);
  return { blocks, total: total.toString(), truncated: total > BigInt(count) };
}

/** 1234567 -> "1,234,567" without losing precision for huge IPv6 counts. */
export const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "2^64" for exact powers of two, which reads better than twenty digits. */
export function powerNote(digits: string): string {
  const n = BigInt(digits);
  if (n < 1_000_000n || (n & (n - 1n)) !== 0n) return "";
  return ` (2^${n.toString(2).length - 1})`;
}

/** The rows of the "IP formats" table, for an IPv4 address (dotted, decimal or 0x hex) or an IPv6 address. */
export function formatRows(input: string): { ip: string; rows: string[][] } {
  const text = input.trim();
  if (!text || text.length > 80 || /[\s\0-\x1f%/@]/.test(text)) throw new FmError("BAD_IP", "Type an address like 192.168.1.10, 3232235786, 0xC0A8010A or 2001:db8::1.");
  const row = (name: string, value: string, note = "") => [name, value, "Format", note || "Another way to write the same address"];
  if (text.includes(":")) {
    const n = parseV6(text);
    const nibbles = expandV6(n).replace(/:/g, "").split("").reverse().join(".");
    const inner = mappedV4(text);
    const rows = [
      row("Short form", compressV6(n), "The usual way to write an IPv6 address"),
      row("Full form", expandV6(n), "All eight groups, with leading zeros"),
      row("Integer", n.toString(), "The address as one big number"),
      row("Hexadecimal", `0x${n.toString(16).padStart(32, "0")}`),
      row("Binary (by group)", expandV6(n).split(":").map((g) => parseInt(g, 16).toString(2).padStart(16, "0")).join(" ")),
      row("Reverse DNS name", `${nibbles}.ip6.arpa`, "Used to look up the name that belongs to the address"),
    ];
    if (inner) rows.push(row("IPv4 inside", inner, "This is an IPv4 address written the IPv6 way"));
    rows.push(["Type", classifyAny(compressV6(n)).type, "Info", "What kind of address this is"]);
    return { ip: compressV6(n), rows };
  }
  let ip: string;
  try {
    ip = parseIpv4Flexible(text);
  } catch {
    throw new FmError("BAD_IP", "Type an address like 192.168.1.10, 3232235786, 0xC0A8010A or 2001:db8::1.");
  }
  const n = ipv4ToInt(ip);
  const hex = n.toString(16).padStart(8, "0");
  const rows = describeIpv4(ip).map(([name, value]) => row(name!, value!));
  rows.push(
    row("IPv4-mapped IPv6", `::ffff:${ip}`, "How an IPv4 address looks inside an IPv6 network"),
    row("IPv4-mapped (hex)", `::ffff:${hex.slice(0, 4).replace(/^0+(?=.)/, "")}:${hex.slice(4).replace(/^0+(?=.)/, "")}`),
    row("6to4 network", `2002:${hex.slice(0, 4)}:${hex.slice(4)}::/48`, "The IPv6 block that 6to4 tunnels give this address"),
    ["Type", classifyAny(ip).type, "Info", "What kind of address this is"],
  );
  return { ip, rows };
}
