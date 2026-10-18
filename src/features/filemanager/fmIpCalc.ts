/**
 * The offline half of the IP info tool: subnet maths, "is this address in that block", splitting, notations,
 * the netmask converter and this computer's network adapters. Every answer has the same shape the page draws:
 * `table` (with optional click actions), `summary` (plain text), `json`, `csv` and a short `label` for the history.
 */
import { calculateSubnet, getLocalInterfaces } from "../ipinfo/ipinfoDoers";
import { cidrContains, maskToPrefix, prefixToMask, splitCidr } from "../ipinfo/ipinfoTools";
import {
  canonicalIp, classifyAny, containsV6, familyOf, formatRows, groupDigits, mappedV4, powerNote, splitV6, subnetV6, type Family,
} from "./fmIpMath";
import { parseTarget } from "./fmIpNet";
import { FmError } from "./fmPaths";

export type Act = { kind: "lookup"; target: string } | { kind: "map"; target: string };
export interface Table {
  headers: string[];
  rows: string[][];
  /** For each row: what clicking its value does. */
  acts: Array<Act | null>;
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?)?$/;
/** A leading apostrophe stops spreadsheets from running a cell that starts like a formula. Numbers and "lat,lon" stay as they are. */
const csvSafe = (v: string): string => (!PLAIN_NUMBER.test(v) && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export const csvCell = (v: unknown): string => `"${csvSafe(String(v ?? "")).replace(/"/g, '""')}"`;

/** CSV that spreadsheet programs can't mistake for a formula. */
export const toCsv = (headers: string[], rows: unknown[][]): string => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

export const summaryText = (rows: string[][]): string => {
  const width = Math.min(24, Math.max(...rows.map((r) => (r[0] ?? "").length), 4));
  return rows.map((r) => `${(r[0] ?? "").padEnd(width)} : ${r[1] ?? ""}`).join("\n");
};

export const makeTable = (headers: string[], rows: string[][], acts: Array<Act | null> = []): Table => ({ headers, rows, acts: rows.map((_, i) => acts[i] ?? null) });
const lookupAct = (target: string): Act => ({ kind: "lookup", target });

const plain = (err: unknown, fallback: string): FmError => (err instanceof FmError ? err : new FmError("BAD_REQUEST", err instanceof Error && err.message ? err.message : fallback));

function cidrOf(input: unknown): { cidr: string; family: Family; ip: string; prefix: number } {
  const t = parseTarget(input);
  if (t.kind !== "cidr") throw new FmError("BAD_CIDR", "Type a CIDR block: an address, a slash and a prefix, like 192.168.1.0/24 or 2001:db8::/32.");
  return t;
}

const COLS = ["Property", "Value", "Category", "Description"];

export function subnetAnswer(input: unknown) {
  const t = cidrOf(input);
  let subnet: Record<string, string | number>;
  let rows: string[][];
  let acts: Array<Act | null>;
  let label: string;
  if (t.family === "v4") {
    const s = calculateSubnet(t.cidr);
    const usable = String(s.usableHosts);
    const total = String(s.totalHosts);
    subnet = { cidr: s.cidr, family: "v4", prefix: t.prefix, network: s.network, broadcast: s.broadcast, netmask: s.netmask, wildcard: s.wildcard, firstHost: s.firstHost, lastHost: s.lastHost, totalHosts: total, usableHosts: usable };
    rows = [
      ["CIDR Block", s.cidr, "Subnet", "The block you typed"],
      ["Network Address", s.network, "Subnet", "First address of the block (names the network)"],
      ["Broadcast Address", s.broadcast, "Subnet", "Last address of the block (talks to everyone)"],
      ["Subnet Netmask", s.netmask, "Addressing", "The prefix written as four numbers"],
      ["Wildcard Mask", s.wildcard, "Addressing", "The netmask turned inside out (used in router rules)"],
      ["First Usable Host", s.firstHost, "Host Range", "First address a device can use"],
      ["Last Usable Host", s.lastHost, "Host Range", "Last address a device can use"],
      ["Total Usable Hosts", groupDigits(usable), "Capacity", "How many devices fit"],
      ["Total Addresses", groupDigits(total), "Capacity", "Every address in the block"],
      ["Address Type", classifyAny(s.network).type, "Info", "What kind of addresses these are"],
    ];
    acts = [null, lookupAct(s.network), lookupAct(s.broadcast), null, null, lookupAct(s.firstHost), lookupAct(s.lastHost)];
    label = `${groupDigits(usable)} usable hosts`;
  } else {
    const s = subnetV6(t.cidr);
    subnet = { ...s };
    rows = [
      ["CIDR Block", s.cidr, "Subnet", "The block you typed"],
      ["Network Address", s.network, "Subnet", "First address of the block"],
      ["Last Address", s.lastAddress, "Subnet", "Last address of the block (IPv6 has no broadcast address)"],
      ["Prefix Length", `/${s.prefix}`, "Addressing", "How many leading bits name the network"],
      ["Netmask", s.netmask, "Addressing", "The prefix written as an IPv6 address"],
      ["Total Addresses", `${groupDigits(s.totalHosts)}${powerNote(s.totalHosts)}`, "Capacity", "Every address in the block"],
      ["Address Type", classifyAny(s.network).type, "Info", "What kind of addresses these are"],
    ];
    acts = [null, lookupAct(s.network), lookupAct(s.lastAddress)];
    label = `${groupDigits(s.totalHosts)} addresses`;
  }
  const keys = Object.keys(subnet);
  return { kind: "cidr" as const, family: t.family, cidr: String(subnet.cidr), subnet, table: makeTable(COLS, rows, acts), summary: summaryText(rows), json: JSON.stringify(subnet, null, 2), csv: toCsv(keys, [keys.map((k) => subnet[k])]), label };
}

/** Normalizes an address typed for a CIDR test: IPv4 (also as a number or hex), IPv6, or IPv4-mapped IPv6. */
function testAddress(input: unknown): { ip: string; family: Family } {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) throw new FmError("BAD_IP", "Type the address to test, like 192.168.1.77.");
  if (text.includes(":")) {
    if (!familyOf(text)) throw new FmError("BAD_IP", "That isn't a valid IPv6 address.");
    const inner = mappedV4(text);
    return inner ? { ip: inner, family: "v4" } : { ip: canonicalIp(text), family: "v6" };
  }
  try {
    // Reuses the formats parser: dotted, decimal or 0x hex.
    return { ip: formatRows(text).ip, family: "v4" };
  } catch {
    throw new FmError("BAD_IP", "Type the address to test like 192.168.1.77 (or a number such as 3232235853).");
  }
}

export function inCidrAnswer(cidrInput: unknown, ipInput: unknown) {
  const t = cidrOf(cidrInput);
  const a = testAddress(ipInput);
  if (a.family !== t.family) throw new FmError("MIXED_FAMILIES", `${a.ip} is ${a.family === "v4" ? "IPv4" : "IPv6"} but ${t.cidr} is ${t.family === "v4" ? "IPv4" : "IPv6"}, so they can't be compared.`);
  let inside: boolean;
  try {
    inside = t.family === "v4" ? cidrContains(t.cidr, a.ip) : containsV6(t.cidr, a.ip);
  } catch (err) {
    throw plain(err, "That couldn't be checked.");
  }
  const word = inside ? "inside" : "outside";
  const rows = [
    ["CIDR Block", t.cidr, "Subnet", "The block being checked"],
    ["Tested IP", a.ip, "Address", "The address being tested"],
    ["Contained", inside ? "YES" : "NO", "Result", `The address is ${word} the block`],
  ];
  const message = `${a.ip} is ${word} ${t.cidr}.`;
  return { kind: "incidr" as const, inside, cidr: t.cidr, ip: a.ip, message, table: makeTable(["Check", "Result", "Category", "Description"], rows, [lookupAct(t.cidr), lookupAct(a.ip)]), summary: summaryText(rows), json: JSON.stringify({ cidr: t.cidr, ip: a.ip, inside }, null, 2), csv: toCsv(["cidr", "ip", "inside"], [[t.cidr, a.ip, inside]]), label: message };
}

export const MAX_SPLIT_BLOCKS = 1024;

export function splitAnswer(cidrInput: unknown, prefixInput: unknown, limitInput?: unknown) {
  const t = cidrOf(cidrInput);
  const prefix = typeof prefixInput === "string" && /^\/?\d{1,3}$/.test(prefixInput.trim()) ? Number(prefixInput.trim().replace("/", "")) : prefixInput;
  const max = t.family === "v4" ? 32 : 128;
  if (typeof prefix !== "number" || !Number.isInteger(prefix) || prefix < 0 || prefix > max) throw new FmError("BAD_PREFIX", `Type the new prefix as a whole number from 0 to ${max}, like ${t.family === "v4" ? 26 : 64}.`);
  if (prefix <= t.prefix) throw new FmError("BAD_PREFIX", `To split ${t.cidr} into smaller blocks, pick a prefix bigger than /${t.prefix} (a bigger number means smaller blocks).`);
  const limit = Math.min(MAX_SPLIT_BLOCKS, Math.max(1, Math.floor(Number(limitInput ?? 256)) || 256));
  let res: { blocks: string[]; total: string; truncated: boolean };
  try {
    if (t.family === "v4") {
      const r = splitCidr(t.cidr, prefix, limit);
      res = { blocks: r.blocks, total: String(r.total), truncated: r.truncated };
    } else {
      res = splitV6(t.cidr, prefix, limit);
    }
  } catch (err) {
    throw plain(err, "That block couldn't be split.");
  }
  const rows = res.blocks.map((b, i) => [`#${i + 1}`, b, "Subnet", `/${prefix} block`]);
  const message = `${t.cidr} splits into ${groupDigits(res.total)} blocks of /${prefix}${res.truncated ? ` (showing the first ${res.blocks.length})` : ""}.`;
  return {
    kind: "split" as const, cidr: t.cidr, prefix, total: res.total, truncated: res.truncated, blocks: res.blocks, message,
    table: makeTable(["Block", "CIDR", "Category", "Description"], rows, res.blocks.map(lookupAct)),
    summary: res.blocks.join("\n"), json: JSON.stringify({ cidr: t.cidr, prefix, total: res.total, truncated: res.truncated, blocks: res.blocks }, null, 2),
    csv: toCsv(["block", "cidr"], res.blocks.map((b, i) => [i + 1, b])), label: message,
  };
}

export function formatsAnswer(input: unknown) {
  const { ip, rows } = formatRows(typeof input === "string" ? input : "");
  return { kind: "formats" as const, ip, table: makeTable(["Notation", "Value", "Category", "Description"], rows), summary: summaryText(rows), json: JSON.stringify(Object.fromEntries(rows.map((r) => [r[0], r[1]])), null, 2), csv: toCsv(["notation", "value"], rows.map((r) => [r[0], r[1]])), label: `Notations for ${ip}` };
}

export function maskAnswer(input: unknown) {
  const text = (typeof input === "string" ? input : "").trim().replace(/^\//, "");
  const help = new FmError("BAD_MASK", "Type a prefix like /24 (or just 24) or a mask like 255.255.255.0.");
  let prefix: number;
  let note = "";
  if (/^\d{1,3}$/.test(text)) prefix = Number(text);
  else if (familyOf(text) === "v4") {
    try {
      prefix = maskToPrefix(text);
    } catch {
      const inverted = text.split(".").map((o) => 255 - Number(o)).join(".");
      try {
        prefix = maskToPrefix(inverted);
        note = "That is a wildcard mask (the inside-out form), shown here as its netmask.";
      } catch {
        throw new FmError("BAD_MASK", "That isn't a valid netmask: its 1-bits must all come first, like 255.255.240.0.");
      }
    }
  } else throw help;
  if (prefix > 128) throw new FmError("BAD_MASK", "A prefix goes from 0 to 32 for IPv4 (or up to 128 for IPv6).");
  let rows: string[][];
  let label: string;
  let data: Record<string, string | number>;
  if (prefix <= 32) {
    const mask = prefixToMask(prefix);
    const total = 2 ** (32 - prefix);
    const usable = prefix >= 31 ? total : Math.max(0, total - 2);
    const wildcard = mask.split(".").map((o) => 255 - Number(o)).join(".");
    data = { prefix, netmask: mask, wildcard, usableHosts: usable, totalAddresses: total };
    rows = [
      ["Prefix Length", `/${prefix}`, "Subnet", "The CIDR prefix"],
      ["Netmask", mask, "Subnet", "The prefix written as four numbers"],
      ["Wildcard Mask", wildcard, "Subnet", "The netmask turned inside out"],
      ["Hosts per block", usable.toLocaleString("en-US"), "Capacity", "Devices that fit in one block"],
      ["Addresses per block", total.toLocaleString("en-US"), "Capacity", "Every address in one block"],
    ];
    label = `/${prefix} = ${mask}`;
  } else {
    const total = (1n << BigInt(128 - prefix)).toString();
    const mask = subnetV6(`::/${prefix}`).netmask;
    data = { prefix, netmask: mask, totalAddresses: total };
    rows = [
      ["Prefix Length", `/${prefix}`, "Subnet", "An IPv6 prefix (IPv4 stops at /32)"],
      ["Netmask", mask, "Subnet", "The prefix written as an IPv6 address"],
      ["Addresses per block", `${groupDigits(total)}${powerNote(total)}`, "Capacity", "Every address in one block"],
    ];
    label = `/${prefix} (IPv6)`;
  }
  if (note) rows.push(["Note", note, "Info", "How your input was read"]);
  return { kind: "mask" as const, prefix, table: makeTable(COLS, rows), summary: summaryText(rows), json: JSON.stringify(data, null, 2), csv: toCsv(Object.keys(data), [Object.values(data)]), label };
}

export function interfacesAnswer() {
  const list = getLocalInterfaces().map((i) => ({ ...i, address: canonicalIp(i.address), type: classifyAny(i.address).type }));
  const rows = list.map((i) => [
    i.name, i.address, i.family,
    `${i.internal ? "Built-in loopback (this computer only)" : "Network adapter"} | ${i.type} | MAC: ${i.mac || "-"} | Mask: ${i.netmask || "-"}`,
  ]);
  const text = list.map((i) => `${i.name.padEnd(10)} | ${i.family.padEnd(4)} | ${i.address.padEnd(24)} | MAC: ${i.mac}`).join("\n");
  return {
    kind: "interfaces" as const, interfaces: list, count: list.length,
    table: makeTable(["Interface", "IP Address", "Family", "Adapter Details"], rows, list.map((i) => lookupAct(i.address))),
    summary: text, json: JSON.stringify(list, null, 2),
    csv: toCsv(["name", "address", "family", "netmask", "mac", "internal", "type"], list.map((i) => [i.name, i.address, i.family, i.netmask, i.mac, i.internal, i.type])),
    label: `${list.length} network adapters`,
  };
}
