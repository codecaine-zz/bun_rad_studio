/**
 * The IP info tool's contact with the outside world, and the checks that guard it:
 *   - what a person may type (an address, a domain, a block) and what is refused;
 *   - looking a domain up with the computer's own resolver;
 *   - the only two internet services that are ever contacted, with a time limit, a size limit and no redirects;
 *   - building the few web pages "Open" may start (the host list is fixed, the page never supplies a URL).
 * Tests change `netLimits` and `ipHooks`; nothing else here is meant to be replaced.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { getLocalInterfaces } from "../ipinfo/ipinfoDoers";
import { canonicalIp, familyOf, mappedV4, type Family } from "./fmIpMath";
import { FmError } from "./fmPaths";

export const netLimits = {
  /** Longest wait for one web request (including reading the answer). */
  fetchTimeoutMs: 8000,
  /** Longest wait for a domain name to be looked up. */
  dnsTimeoutMs: 5000,
  /** One lookup may spend this long in total, over every service it tries. */
  lookupTotalMs: 15000,
  /** A bulk lookup stops starting new lookups after this long. */
  bulkTotalMs: 60000,
  maxAnswerBytes: 64 * 1024,
};

export const ipHooks = {
  /** Replaceable in tests. Returns the addresses of a name. */
  resolveHost: async (host: string): Promise<string[]> => (await dnsLookup(host, { all: true })).map((a) => a.address),
};

// ---------------------------------------------------------------------------------------------------------------
// What may be typed
// ---------------------------------------------------------------------------------------------------------------

export type Target =
  | { kind: "myip" }
  | { kind: "ip"; ip: string; mappedFrom?: string }
  | { kind: "cidr"; cidr: string; family: Family; ip: string; prefix: number }
  | { kind: "host"; host: string }
  | { kind: "iface"; name: string; ip: string };

export const MAX_TARGET_LENGTH = 253;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const HELP = "Type an IP address (like 8.8.8.8), a domain name (like example.com) or a CIDR block (like 192.168.1.0/24).";

function interfaceByName(name: string): { name: string; ip: string } | null {
  try {
    const wanted = name.toLowerCase();
    const matches = getLocalInterfaces().filter((i) => i.name.toLowerCase() === wanted && familyOf(i.address));
    const pick = matches.find((i) => familyOf(i.address) === "v4") ?? matches[0];
    return pick ? { name: pick.name, ip: canonicalIp(pick.address) } : null;
  } catch {
    return null;
  }
}

/** Turns what was typed into a safe, typed target, or throws a plain-language FmError. */
export function parseTarget(input: unknown): Target {
  if (typeof input !== "string") throw new FmError("BAD_TARGET", HELP);
  const text = input.trim();
  if (!text || text.toLowerCase() === "myip") return { kind: "myip" };
  if (text.length > MAX_TARGET_LENGTH) throw new FmError("BAD_TARGET", `That is too long (the limit is ${MAX_TARGET_LENGTH} characters). ${HELP}`);
  if (CONTROL.test(text)) throw new FmError("BAD_TARGET", "That contains invisible control characters. Type the address again.");
  if (text.includes("@")) throw new FmError("BAD_TARGET", `Leave out the "@" and anything before it. ${HELP}`);

  const iface = interfaceByName(text);
  if (iface) return { kind: "iface", ...iface };

  if (/\s/.test(text)) throw new FmError("BAD_TARGET", `Type one address at a time, without spaces. ${HELP}`);
  if (text.includes("://") || /[\\?#]/.test(text) || text.startsWith("//")) throw new FmError("BAD_TARGET", `Web addresses aren't needed: leave out "https://", the path and anything after "?". ${HELP}`);
  if (text.startsWith("[") || text.includes("%")) throw new FmError("BAD_TARGET", `Type the address without brackets or a "%" zone name. ${HELP}`);

  if (text.includes("/")) {
    const [addr, prefixText, ...extra] = text.split("/");
    const family = familyOf(addr ?? "");
    if (extra.length || !family || !/^\d{1,3}$/.test(prefixText ?? "")) throw new FmError("BAD_TARGET", "That isn't a CIDR block. Write an address, a slash and a prefix, like 192.168.1.0/24 or 2001:db8::/32.");
    const prefix = Number(prefixText);
    if (prefix > (family === "v4" ? 32 : 128)) throw new FmError("BAD_TARGET", `The prefix after the slash can be at most ${family === "v4" ? 32 : 128} for ${family === "v4" ? "IPv4" : "IPv6"}.`);
    const ip = canonicalIp(addr!);
    return { kind: "cidr", cidr: `${ip}/${prefix}`, family, ip, prefix };
  }

  const family = familyOf(text);
  if (family === "v4") return { kind: "ip", ip: text };
  if (family === "v6") {
    const inner = mappedV4(text);
    return inner ? { kind: "ip", ip: inner, mappedFrom: canonicalIp(text) } : { kind: "ip", ip: canonicalIp(text) };
  }
  if (text.includes(":")) throw new FmError("BAD_TARGET", `That isn't a valid IPv6 address, and ports (":80") aren't needed. ${HELP}`);
  if (/^[\d.]+$/.test(text)) throw new FmError("BAD_TARGET", "That isn't a valid IPv4 address: it needs four numbers from 0 to 255 with dots between, like 192.168.1.10.");
  return { kind: "host", host: validHostname(text) };
}

/** A domain name in its plain (ASCII) form, or an error. Names that the system could read as a number are refused. */
export function validHostname(text: string): string {
  const bad = () => new FmError("BAD_TARGET", "That doesn't look like a valid domain name. Use letters, digits and hyphens, like example.com.");
  const ascii = domainToASCII(text.replace(/\.$/, "")).toLowerCase();
  if (!ascii || ascii.length > 253) throw bad();
  const labels = ascii.split(".");
  if (!labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) throw bad();
  if (/^(0x[0-9a-f]*|\d+)$/.test(labels[labels.length - 1]!)) throw bad();
  return ascii;
}

/** The ipinfo.io token: undefined when empty, an error when it has characters a token never has. */
export function cleanToken(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new FmError("BAD_TOKEN", "That token doesn't look right.");
  const token = raw.trim();
  if (!token) return undefined;
  if (!/^[A-Za-z0-9_.-]{4,100}$/.test(token)) throw new FmError("BAD_TOKEN", "That token doesn't look right. An ipinfo.io token is a short mix of letters and digits.");
  return token;
}

// ---------------------------------------------------------------------------------------------------------------
// Names and web requests
// ---------------------------------------------------------------------------------------------------------------

const TIMED_OUT = Symbol("timed out");

/** Resolves with `work`, or throws TIMED_OUT after `ms` (also when `work` never answers). */
async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(TIMED_OUT);
    }, ms);
  });
  work.catch(() => {});
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** The addresses of a domain name, IPv4 first. "localhost" never goes to the network. */
export async function resolveHostname(host: string): Promise<string[]> {
  if (host === "localhost") return ["127.0.0.1"];
  let found: string[];
  try {
    found = await withTimeout(ipHooks.resolveHost(host), netLimits.dnsTimeoutMs);
  } catch (err: any) {
    if (err === TIMED_OUT) throw new FmError("DNS_TIMEOUT", `Looking up "${host}" took too long. Check your internet connection and try again.`);
    if (err?.code === "ENOTFOUND" || err?.code === "ENODATA") throw new FmError("NO_SUCH_HOST", `Couldn't find "${host}". Check the spelling, or your internet connection.`);
    throw new FmError("NO_DNS", `Couldn't look up "${host}". You may be offline, or the name may not exist.`);
  }
  const valid = [...new Set(found.filter((a) => typeof a === "string" && familyOf(a)).map(canonicalIp))];
  const ordered = [...valid.filter((a) => familyOf(a) === "v4"), ...valid.filter((a) => familyOf(a) === "v6")].slice(0, 10);
  if (!ordered.length) throw new FmError("NO_SUCH_HOST", `"${host}" doesn't have an address.`);
  return ordered;
}

/** The only services the tool talks to. The ipinfo.io token is only ever sent to the first one. */
const FETCH_HOSTS = new Set(["ipinfo.io", "ipwho.is"]);

const OFFLINE = "Can't reach the internet right now. Check your connection (or a firewall) and try again.";

async function readCapped(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new FmError("TOO_BIG", "The lookup service sent back far more than expected, so it was ignored.");
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > max) throw new FmError("TOO_BIG", "The lookup service sent back far more than expected, so it was ignored.");
    return text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new FmError("TOO_BIG", "The lookup service sent back far more than expected, so it was ignored.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * GETs a JSON answer from an allowed service. Throws FmError for: no internet (OFFLINE), too slow (TIMEOUT),
 * a redirect (REDIRECT, never followed) and a too-large answer (TOO_BIG). `json` is null when the body isn't JSON.
 * Error messages never contain the token.
 */
export async function httpsJson(url: string, options: { bearer?: string; timeoutMs?: number } = {}): Promise<{ status: number; json: any }> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !FETCH_HOSTS.has(target.hostname)) throw new FmError("BAD_REQUEST", "That service isn't allowed.");
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "bun-rad-studio-file-manager/1.0" };
  if (options.bearer && target.hostname === "ipinfo.io") headers.Authorization = `Bearer ${options.bearer}`;
  const controller = new AbortController();
  const work = (async () => {
    const res = await globalThis.fetch(target.href, { method: "GET", headers, redirect: "manual", signal: controller.signal });
    if (res.status >= 300 && res.status < 400) throw new FmError("REDIRECT", "The lookup service tried to send the request somewhere else, which isn't followed for safety.");
    if (res.url) {
      try {
        if (new URL(res.url).hostname !== target.hostname) throw new FmError("REDIRECT", "The lookup service tried to send the request somewhere else, which isn't followed for safety.");
      } catch (err) {
        if (err instanceof FmError) throw err;
      }
    }
    const text = await readCapped(res, netLimits.maxAnswerBytes);
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON: the caller decides what that means
    }
    return { status: res.status, json };
  })();
  try {
    return await withTimeout(work, Math.min(options.timeoutMs ?? Infinity, netLimits.fetchTimeoutMs, 10_000), () => controller.abort());
  } catch (err: any) {
    if (err instanceof FmError) throw err;
    if (err === TIMED_OUT) throw new FmError("TIMEOUT", "The lookup service took too long to answer. Try again in a moment.");
    throw new FmError("OFFLINE", OFFLINE);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Pages that "Open" may start
// ---------------------------------------------------------------------------------------------------------------

export type LinkKind = "map" | "ipinfo" | "bgp";
export type MapProvider = "google" | "osm";

/** Hosts a web page may be opened on. Anything else is refused. */
export const OPEN_HOSTS = new Set(["ipinfo.io", "www.google.com", "bgp.he.net", "www.openstreetmap.org"]);

const COORD = /^(-?\d{1,3}(?:\.\d{1,8})?),(-?\d{1,3}(?:\.\d{1,8})?)$/;

/** "37.4,-122.07" as numbers, or null when it isn't a real place ("0,0" counts as no place). */
export function parseLocation(text: unknown): { lat: number; lon: number } | null {
  const m = typeof text === "string" ? COORD.exec(text.trim()) : null;
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** The AS number an organization text starts with ("AS15169 Google LLC" -> "AS15169"). */
export const asnOf = (text: unknown): string | null => {
  const m = typeof text === "string" ? /^AS(\d{1,10})\b/i.exec(text.trim()) : null;
  return m ? `AS${Number(m[1])}` : null;
};

const exactAsn = (text: unknown): string | null => {
  const m = typeof text === "string" ? /^AS(\d{1,10})$/i.exec(text.trim()) : null;
  return m ? `AS${Number(m[1])}` : null;
};

/** Builds the page address from validated data. Throws when the target isn't an address, an AS number or a place. */
export function buildExternalUrl(kind: unknown, target: unknown, provider: unknown = "google"): string {
  let url: string;
  if (kind === "map") {
    const place = parseLocation(target);
    if (!place) throw new FmError("BAD_TARGET", "There's no place to show on a map for this address.");
    url = provider === "osm"
      ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=10/${place.lat}/${place.lon}`
      : `https://www.google.com/maps?q=${place.lat},${place.lon}`;
  } else if (kind === "ipinfo" || kind === "bgp") {
    const asn = exactAsn(target);
    const ip = typeof target === "string" && familyOf(target.trim()) ? canonicalIp(target.trim()) : null;
    if (!asn && !ip) throw new FmError("BAD_TARGET", "Choose an IP address (or an AS number like AS15169) to open.");
    url = kind === "ipinfo" ? `https://ipinfo.io/${asn ?? ip}` : asn ? `https://bgp.he.net/${asn}` : `https://bgp.he.net/ip/${ip}`;
  } else {
    throw new FmError("BAD_REQUEST", "That kind of page can't be opened from here.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !OPEN_HOSTS.has(parsed.hostname) || (parsed.hostname === "www.google.com" && !parsed.pathname.startsWith("/maps"))) throw new FmError("BAD_REQUEST", "That page isn't on the list of places this can open.");
  return url;
}
