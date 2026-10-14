/**
 * Looking up where an address is. Private and reserved addresses are answered on this computer and never sent
 * anywhere. Public ones go to ipinfo.io (with the optional token) and, only if that fails, to ipwho.is.
 */
import type { IpInfoResult } from "../ipinfo/ipinfoTypes";
import { createPrivateIpResult } from "../ipinfo/ipinfoDoers";
import { BULK_HEADERS } from "../ipinfo/ipinfoTools";
import { makeTable, subnetAnswer, summaryText, toCsv, type Act } from "./fmIpCalc";
import { asnOf, buildExternalUrl, cleanToken, httpsJson, netLimits, parseLocation, parseTarget, resolveHostname, validHostname, type LinkKind, type MapProvider, type Target } from "./fmIpNet";
import { canonicalIp, classifyAny, familyOf } from "./fmIpMath";
import { FmError } from "./fmPaths";

export const MAX_BULK_TARGETS = 100;
export const BULK_CONCURRENCY = 10;
const OFFLINE_STOP = 5;

const clip = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, max);
  return s || undefined;
};

function cleanLoc(v: unknown): string | undefined {
  return parseLocation(v) ? String(v).trim() : undefined;
}

/** Keeps only the fields we know, as short plain strings (what a service sends is not trusted). */
function fromIpinfo(o: any): IpInfoResult | null {
  const ip = clip(o?.ip, 60);
  if (!ip || !familyOf(ip)) return null;
  return { ip: canonicalIp(ip), hostname: clip(o.hostname), city: clip(o.city), region: clip(o.region), country: clip(o.country, 60), loc: cleanLoc(o.loc), org: clip(o.org), postal: clip(o.postal, 40), timezone: clip(o.timezone, 80) };
}

function fromIpwho(o: any): IpInfoResult | null {
  const ip = clip(o?.ip, 60);
  if (!ip || !familyOf(ip) || o.success === false) return null;
  const conn = o.connection ?? {};
  const org = clip(conn.org) ?? clip(conn.isp);
  const loc = o.latitude !== undefined && o.longitude !== undefined ? cleanLoc(`${o.latitude},${o.longitude}`) : undefined;
  return { ip: canonicalIp(ip), hostname: clip(conn.domain), city: clip(o.city), region: clip(o.region), country: clip(o.country_code, 60), loc, org: org ? `${conn.asn ? `AS${Number(conn.asn) || ""} ` : ""}${org}`.trim().slice(0, 200) : undefined, postal: clip(o.postal, 40), timezone: clip(o.timezone?.id, 80) };
}

interface Upstream {
  data: IpInfoResult;
  source: string;
  warnings: string[];
  /** The service said this is a private or reserved address. */
  bogon: boolean;
}

/** Asks ipinfo.io, then ipwho.is. `ip` null means "this computer's public address". */
async function fetchUpstream(ip: string | null, token: string | undefined): Promise<Upstream> {
  const warnings: string[] = [];
  const started = Date.now();
  let primary: FmError | null = null;
  let reached = false;
  let rateLimited = false;

  try {
    const { status, json } = await httpsJson(ip ? `https://ipinfo.io/${ip}/json` : "https://ipinfo.io/json", { bearer: token });
    reached = true;
    if (status >= 200 && status < 300 && json && typeof json === "object") {
      if (json.bogon === true) return { data: { ip: ip ?? "" }, source: "ipinfo.io", warnings, bogon: true };
      const data = fromIpinfo(json);
      if (data) return { data, source: "ipinfo.io", warnings, bogon: false };
    } else if (status === 429) {
      rateLimited = true;
      warnings.push("ipinfo.io says too many lookups were made from this computer for now, so another free service was used.");
    } else if (status === 401 || status === 403) {
      warnings.push(token ? "ipinfo.io didn't accept the token, so another free service was used." : "ipinfo.io wouldn't answer without a token, so another free service was used.");
    } else if (status >= 500) warnings.push("ipinfo.io is having trouble, so another free service was used.");
  } catch (err) {
    primary = err instanceof FmError ? err : new FmError("LOOKUP_FAILED", "The lookup didn't work.");
    warnings.push("ipinfo.io didn't answer, so another free service was used.");
  }

  const remaining = netLimits.lookupTotalMs - (Date.now() - started);
  let secondary: FmError | null = null;
  if (remaining >= 1000) {
    try {
      const { status, json } = await httpsJson(ip ? `https://ipwho.is/${ip}` : "https://ipwho.is/", { timeoutMs: remaining });
      reached = true;
      if (json && typeof json === "object") {
        if (json.success === false && /reserved|private/i.test(String(json.message))) return { data: { ip: ip ?? "" }, source: "ipwho.is", warnings, bogon: true };
        const data = status >= 200 && status < 300 ? fromIpwho(json) : null;
        if (data) return { data, source: "ipwho.is", warnings, bogon: false };
      }
    } catch (err) {
      secondary = err instanceof FmError ? err : null;
    }
  }

  if (!reached) throw [primary, secondary].find((e) => e && e.code !== "OFFLINE") ?? new FmError("OFFLINE", "Can't reach the internet right now. Check your connection (or a firewall) and try again.");
  if (rateLimited) throw new FmError("RATE_LIMITED", "ipinfo.io says too many lookups were made for now. Wait a few minutes, or add a free token from ipinfo.io.");
  throw new FmError("LOOKUP_FAILED", "The lookup services answered, but had no details for that address. Try again later.");
}

export interface Core {
  target: Target;
  ip: string;
  domain?: string;
  resolved: string[];
  isPrivate: boolean;
  type: string;
  rfc?: string;
  scope: string;
  source: string;
  warnings: string[];
  data: IpInfoResult;
}

/** The shared lookup: resolve the target, decide private or public, fetch details. `skipNetwork` lets bulk stop early. */
export async function lookupCore(target: Target, token: string | undefined, skipNetwork?: () => boolean): Promise<Core> {
  let domain: string | undefined;
  let resolved: string[] = [];
  let ip: string | null = null;
  if (target.kind === "ip" || target.kind === "iface") ip = target.ip;
  else if (target.kind === "host") {
    resolved = await resolveHostname(target.host);
    domain = target.host;
    ip = resolved[0]!;
  } else if (target.kind !== "myip") throw new FmError("BAD_TARGET", "Type an IP address or a domain name here. A CIDR block has its own calculator.");
  if (target.kind === "iface") domain = target.name;

  const warnings: string[] = [];
  if (target.kind === "ip" && target.mappedFrom) warnings.push(`${target.mappedFrom} is an IPv4 address written the IPv6 way, so ${target.ip} was looked up.`);
  if (resolved.length > 1) warnings.push(`${domain} has ${resolved.length} addresses; the first one was looked up.`);

  if (ip) {
    const cls = classifyAny(ip);
    if (cls.isPrivateOrBogon) return { target, ip, domain, resolved, isPrivate: true, type: cls.type, rfc: cls.rfc, scope: cls.scope, source: "this computer", warnings, data: createPrivateIpResult(ip, cls) };
  }
  if (skipNetwork?.()) throw new FmError("OFFLINE", "Skipped: the internet couldn't be reached for the earlier lookups.");
  const up = await fetchUpstream(ip, cleanToken(token));
  warnings.push(...up.warnings);
  const found = up.data.ip || ip || "";
  if (!found) throw new FmError("LOOKUP_FAILED", "The lookup services answered, but had no details for that address. Try again later.");
  if (up.bogon || (found && classifyAny(found).isPrivateOrBogon)) {
    const cls = classifyAny(found);
    return { target, ip: found, domain, resolved, isPrivate: true, type: cls.type, rfc: cls.rfc, scope: cls.scope, source: up.source, warnings, data: createPrivateIpResult(found, cls) };
  }
  const cls = classifyAny(found);
  return { target, ip: found, domain, resolved, isPrivate: false, type: cls.type, rfc: cls.rfc, scope: cls.scope, source: up.source, warnings, data: up.data };
}

export const privateExplanation = (c: Pick<Core, "ip" | "type" | "scope">): string =>
  `${c.ip} is a private or reserved address (${c.type}: ${c.scope}). It only works inside a network, so it has no public location. Nothing was sent over the internet.`;

const dash = (v: string | undefined) => v || "-";
const CSV_FIELDS = ["ip", "hostname", "city", "region", "country", "loc", "org", "postal", "timezone"] as const;

export interface Link {
  kind: LinkKind;
  label: string;
  target: string;
  url: string;
  /** For maps: which map site. */
  provider?: MapProvider;
}

function linksFor(c: Core): Link[] {
  if (c.isPrivate) return [];
  const links: Link[] = [];
  const add = (kind: LinkKind, label: string, target: string, provider?: MapProvider) => {
    try {
      links.push({ kind, label, target, url: buildExternalUrl(kind, target, provider), ...(provider ? { provider } : {}) });
    } catch {
      // no link for data that doesn't validate
    }
  };
  if (c.data.loc) {
    add("map", "Map (Google Maps)", c.data.loc, "google");
    add("map", "Map (OpenStreetMap)", c.data.loc, "osm");
  }
  add("ipinfo", "ipinfo.io page", c.ip);
  add("bgp", "BGP / network page", c.ip);
  const asn = asnOf(c.data.org);
  if (asn) {
    add("bgp", `Network ${asn} (BGP)`, asn);
    add("ipinfo", `Network ${asn} (ipinfo.io)`, asn);
  }
  return links;
}

export async function lookupAnswer(input: unknown, tokenInput: unknown) {
  const target = parseTarget(input);
  if (target.kind === "cidr") return subnetAnswer(input);
  const token = cleanToken(tokenInput);
  const c = await lookupCore(target, token);
  const d = c.data;
  const rows: string[][] = [];
  const acts: Array<Act | null> = [];
  const add = (row: string[], act: Act | null = null) => {
    rows.push(row);
    acts.push(act);
  };
  if (target.kind === "host" && c.domain) add(["Typed Name", c.domain, "DNS", "The name you typed, turned into the address below"]);
  add(["IP Address", c.ip, "Network", "The address that was looked up"]);
  let hostAct: Act | null = null;
  try {
    if (d.hostname && !c.isPrivate && !familyOf(d.hostname)) hostAct = { kind: "lookup", target: validHostname(d.hostname) };
  } catch {
    // a hostname that isn't a plain domain name can't be looked up again
  }
  add(["Hostname", dash(d.hostname ?? c.domain), "DNS", "Name that belongs to the address"], hostAct);
  add(["City", dash(d.city), "Geolocation", "Town or city"]);
  add(["Region", dash(d.region), "Geolocation", "State or province"]);
  add(["Country", dash(d.country), "Geolocation", "Two-letter country code"]);
  add(["Coordinates", dash(d.loc), "Geolocation", "Latitude and longitude"]);
  add(["Organization / ASN", dash(d.org), "Routing", "Who runs the network (the AS number comes first)"]);
  add(["Postal Code", dash(d.postal), "Geolocation", "Postal or zip code"]);
  add(["Timezone", dash(d.timezone), "Locale", "Time zone of the place"]);
  add(["Address Type", `${c.type}${c.rfc ? ` (${c.rfc})` : ""}`, "Info", c.scope]);
  const loc = !c.isPrivate && parseLocation(d.loc) ? d.loc! : undefined;
  if (loc) add(["Map Link", "Open this place on a map", "Deep Link", "Opens a map in your web browser"], { kind: "map", target: loc });
  if (c.isPrivate) add(["Note", "Private address: no public location", "Info", privateExplanation(c)]);
  const label = [c.ip, [d.city, d.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const json = JSON.stringify(d, null, 2);
  const data = { ...d, ip: c.ip };
  return {
    kind: "ip" as const, query: typeof input === "string" ? input.trim() : "", ip: c.ip, domain: c.domain, resolved: c.resolved,
    isPrivate: c.isPrivate, classification: { type: c.type, rfc: c.rfc, scope: c.scope }, source: c.source, warnings: c.warnings,
    explanation: c.isPrivate ? privateExplanation(c) : undefined, loc,
    data, table: makeTable(["Property", "Resolved Value", "Category", "Description"], rows, acts), summary: summaryText(rows.filter((r) => r[0] !== "Map Link")),
    json, csv: toCsv([...CSV_FIELDS], [CSV_FIELDS.map((f) => data[f] ?? "")]), links: linksFor(c), label: label || c.ip,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------------------------------------------

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

/** Targets from pasted text or an array: separated by lines, spaces, commas or semicolons; "#" starts a comment. */
export function splitTargets(source: unknown): { targets: string[]; skipped: number } {
  const text = Array.isArray(source) ? source.filter((s) => typeof s === "string").join("\n") : typeof source === "string" ? source : "";
  if (text.length > 300_000) throw new FmError("TOO_LARGE", "That list is too long. Keep it under 100 addresses.");
  const seen = new Set<string>();
  const all: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const tok of line.replace(/#.*$/, "").split(/[\s,;]+/)) {
      const key = tok.toLowerCase();
      if (!tok || seen.has(key)) continue;
      seen.add(key);
      all.push(tok);
    }
  }
  return { targets: all.slice(0, MAX_BULK_TARGETS), skipped: Math.max(0, all.length - MAX_BULK_TARGETS) };
}

export async function bulkAnswer(source: unknown, tokenInput: unknown) {
  const token = cleanToken(tokenInput);
  const { targets, skipped } = splitTargets(source);
  if (!targets.length) throw new FmError("NO_TARGETS", "Add at least one IP address or domain name to the list.");
  const started = Date.now();
  let offline = 0;
  const rows: BulkRow[] = new Array(targets.length);
  let next = 0;
  const fail = (target: string, error: string): BulkRow => ({ target, ip: "", city: "-", region: "-", country: "-", org: "-", status: "error", error });

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const t = targets[i]!;
      if (Date.now() - started > netLimits.bulkTotalMs) {
        rows[i] = fail(t, "Not tried: the list was taking too long.");
        continue;
      }
      try {
        const parsed = parseTarget(t);
        if (parsed.kind === "cidr") throw new FmError("BAD_TARGET", "CIDR blocks aren't looked up in bulk; use the subnet calculator.");
        const c = await lookupCore(parsed, token, () => offline >= OFFLINE_STOP);
        if (!c.isPrivate) offline = 0;
        rows[i] = { target: t, ip: c.ip, city: dash(c.data.city), region: dash(c.data.region), country: dash(c.data.country), org: dash(c.data.org), status: "ok" };
      } catch (err) {
        const e = err instanceof FmError ? err : new FmError("LOOKUP_FAILED", "The lookup didn't work.");
        if (e.code === "OFFLINE") offline++;
        rows[i] = fail(t, e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, targets.length) }, worker));

  const ok = rows.filter((r) => r.status === "ok").length;
  const tableRows = rows.map((r) => [r.target, r.ip || "-", r.city, r.region, r.country, r.org, r.status === "ok" ? "OK" : `Error: ${r.error}`]);
  const secs = Number(((Date.now() - started) / 1000).toFixed(1));
  const header = ["target", "ip", "city", "region", "country", "org", "status", "error"] as const;
  const acts = rows.map((r): Act | null => (r.status === "ok" ? { kind: "lookup", target: r.ip } : null));
  return {
    kind: "bulk" as const, rows, ok, failed: rows.length - ok, skipped, secs,
    table: makeTable(BULK_HEADERS, tableRows, acts), summary: tableRows.map((r) => r.join(" | ")).join("\n"),
    json: JSON.stringify(rows, null, 2), csv: toCsv([...header], rows.map((r) => header.map((h) => r[h] ?? ""))),
    label: `${rows.length} targets, ${ok} found`,
  };
}
