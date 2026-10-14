/**
 * DNS inspector: A, AAAA, MX, TXT, NS, SOA, CAA, CNAME, reverse (PTR) and a full audit. The computer's own DNS
 * settings are tried first; only if no DNS server can be reached at all are the public Cloudflare / Google
 * servers asked, and the answer says which one replied. Every question has a time limit.
 */
import * as dns from "node:dns/promises";
import { isIP } from "node:net";
import { FmError } from "./fmPaths";
import { addActivity, cleanText, round1, timeout, type NetState } from "./fmNetCore";

export const DNS_TYPES = ["A", "AAAA", "MX", "TXT", "NS", "SOA", "CAA", "CNAME", "PTR"] as const;
export type DnsType = (typeof DNS_TYPES)[number];
export const AUDIT_TYPES: DnsType[] = ["A", "AAAA", "MX", "TXT", "NS", "SOA", "CNAME", "CAA"];

export interface DnsResolverLike {
  resolve4(host: string): Promise<unknown>;
  resolve6(host: string): Promise<unknown>;
  resolveMx(host: string): Promise<unknown>;
  resolveTxt(host: string): Promise<unknown>;
  resolveNs(host: string): Promise<unknown>;
  resolveSoa(host: string): Promise<unknown>;
  resolveCaa(host: string): Promise<unknown>;
  resolveCname(host: string): Promise<unknown>;
  reverse(ip: string): Promise<string[]>;
}

export interface DnsDeps {
  system: DnsResolverLike;
  publicResolver: () => DnsResolverLike;
  lookup: (host: string) => Promise<Array<{ address: string; family: number }>>;
}

export const defaultDnsDeps: DnsDeps = {
  system: dns,
  publicResolver: () => {
    const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
    resolver.setServers(["1.1.1.1", "8.8.8.8"]);
    return resolver;
  },
  lookup: (host) => dns.lookup(host, { all: true }),
};

const EXPLAIN: Record<DnsType, string> = {
  A: "A records are the IPv4 addresses (like 93.184.216.34) that this name points to.",
  AAAA: "AAAA records are the IPv6 addresses (long ones with colons) that this name points to.",
  MX: "MX records say which mail servers receive email for this name. The lower number is tried first.",
  TXT: "TXT records hold free text, often used to prove who owns a domain or to fight spam (SPF, DKIM, DMARC).",
  NS: "NS records list the name servers that are in charge of this domain.",
  SOA: "The SOA record describes the domain's main name server and how other servers should refresh their copy.",
  CAA: "CAA records say which companies are allowed to issue SSL certificates for this domain.",
  CNAME: "A CNAME says this name is just another name for a different one.",
  PTR: "A reverse (PTR) lookup turns an IP address back into a name. Many addresses have none, and that is normal.",
};

const NO_DATA = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN", "ENOENT"]);
const SERVER_PROBLEM = new Set(["ECONNREFUSED", "ETIMEOUT", "ETIMEDOUT", "ESERVFAIL", "EREFUSED", "ECONNRESET", "EAI_AGAIN", "ENOTINITIALIZED", "ECANCELLED", "EBADRESP", "ENOTIMP", "ENOMEM", "ENETUNREACH", "EHOSTUNREACH"]);
const errorCode = (err: unknown): string => String((err as NodeJS.ErrnoException)?.code ?? "UNKNOWN");

export function formatRecords(type: DnsType, records: unknown): string[] {
  const list = Array.isArray(records) ? records : records === null || records === undefined ? [] : [records];
  const lines: string[] = [];
  for (const rec of list) {
    if (type === "MX") lines.push(`${(rec as { priority: number }).priority} ${(rec as { exchange: string }).exchange}`);
    else if (type === "TXT") lines.push(Array.isArray(rec) ? rec.join("") : String(rec));
    else if (type === "SOA") {
      const s = rec as Record<string, unknown>;
      lines.push(`Primary name server: ${s.nsname}`, `Responsible mailbox: ${s.hostmaster}`, `Serial number: ${s.serial}`, `Refresh every: ${s.refresh} s`, `Retry after: ${s.retry} s`, `Expires after: ${s.expire} s`, `Minimum time to keep: ${s.minttl} s`);
    } else if (type === "CAA") {
      const c = rec as Record<string, unknown>;
      const tag = Object.keys(c).find((k) => k !== "critical" && k !== "type") ?? "tag";
      lines.push(`${c.critical ?? 0} ${tag} "${c[tag]}"`);
    } else lines.push(String(rec));
  }
  return lines.slice(0, 200).map((l) => cleanText(l, 1500));
}

export interface DnsAnswer {
  host: string;
  type: DnsType;
  source: "system" | "public" | "os" | "local";
  sourceLabel: string;
  elapsedMs: number;
  lines: string[];
  noData: boolean;
  error: { code: string; message: string } | null;
  explain: string;
}

function answer(host: string, type: DnsType, started: number, source: DnsAnswer["source"], records: unknown, extra: Partial<DnsAnswer> = {}): DnsAnswer {
  const lines = formatRecords(type, records);
  const label = { system: "Your computer's DNS server", public: "Public DNS (Cloudflare / Google)", os: "Your computer's name lookup", local: "This computer" }[source];
  const noData = lines.length === 0 && !extra.error;
  return {
    host, type, source, sourceLabel: label, elapsedMs: round1(performance.now() - started), lines, noData, error: null,
    explain: noData ? `No ${type} records were found for ${host}. That's normal if it doesn't use this feature (or the name doesn't exist).` : EXPLAIN[type],
    ...extra,
  };
}

function run(resolver: DnsResolverLike, host: string, type: DnsType): Promise<unknown> {
  switch (type) {
    case "A": return resolver.resolve4(host);
    case "AAAA": return resolver.resolve6(host);
    case "MX": return resolver.resolveMx(host);
    case "TXT": return resolver.resolveTxt(host);
    case "NS": return resolver.resolveNs(host);
    case "SOA": return resolver.resolveSoa(host);
    case "CAA": return resolver.resolveCaa(host);
    case "CNAME": return resolver.resolveCname(host);
    case "PTR": return resolver.reverse(host);
  }
}

/** Runs one lookup but gives up after `ms`. */
async function limited<T>(state: NetState, work: Promise<T>, ms: number): Promise<T> {
  let cancel = () => {};
  const limit = new Promise<never>((_, reject) => {
    cancel = timeout(state, () => reject(Object.assign(new Error("The DNS server didn't answer in time."), { code: "ETIMEOUT" })), ms);
  });
  work.catch(() => {});
  try {
    return await Promise.race([work, limit]);
  } finally {
    cancel();
  }
}

const isLoopback = (host: string) => host === "localhost" || host === "::1" || /^127\./.test(host);

function localAnswer(host: string, type: DnsType, started: number): DnsAnswer | null {
  if (!isLoopback(host)) return null;
  const name = isIP(host) === 0;
  if (type === "A") return answer(host, type, started, "local", name || isIP(host) === 4 ? ["127.0.0.1"] : []);
  if (type === "AAAA") return answer(host, type, started, "local", name || host === "::1" ? ["::1"] : []);
  if (type === "PTR") return answer(host, type, started, "local", ["localhost"]);
  return answer(host, type, started, "local", []);
}

export async function dnsQuery(state: NetState, host: string, type: DnsType, deps: DnsDeps = defaultDnsDeps, timeoutMs = 4000): Promise<DnsAnswer> {
  const started = performance.now();
  const isAddress = isIP(host) !== 0;
  if (type === "PTR" && !isAddress) throw new FmError("NEEDS_IP", "A reverse lookup (PTR) needs an IP address like 8.8.8.8. Type an address in the Computer box, or look up the A record of a name first.");
  const local = localAnswer(host, type, started);
  if (local) return local;
  if (isAddress && type !== "PTR") {
    return answer(host, type, started, "local", [], { explain: `${host} is already an IP address. ${type} records belong to names, not numbers. Try "Reverse lookup (PTR)" instead.` });
  }

  let result: DnsAnswer;
  try {
    result = answer(host, type, started, "system", await limited(state, run(deps.system, host, type), timeoutMs));
  } catch (first) {
    result = await recover(state, host, type, deps, timeoutMs, started, first);
  }
  addActivity(state, "dns", `${host} ${type}`, result.error ? "failed" : result.noData ? "no records" : `${result.lines.length} line(s)`, result.elapsedMs);
  return result;
}

async function recover(state: NetState, host: string, type: DnsType, deps: DnsDeps, timeoutMs: number, started: number, first: unknown): Promise<DnsAnswer> {
  let code = errorCode(first);
  if (SERVER_PROBLEM.has(code)) {
    try {
      return answer(host, type, started, "public", await limited(state, run(deps.publicResolver(), host, type), timeoutMs));
    } catch (second) {
      code = errorCode(second);
    }
  }
  if (type === "A" || type === "AAAA") {
    try {
      const found = (await limited(state, deps.lookup(host), timeoutMs)).filter((l) => l.family === (type === "A" ? 4 : 6)).map((l) => l.address);
      if (found.length > 0) return answer(host, type, started, "os", found);
    } catch {
      // fall through to the plain "nothing found" / "can't reach DNS" answers
    }
  }
  if (NO_DATA.has(code)) return answer(host, type, started, "system", []);
  const message = SERVER_PROBLEM.has(code)
    ? "Couldn't reach a DNS server. You may be offline, or your network blocks DNS."
    : `The lookup failed (${code}).`;
  return answer(host, type, started, "system", [], { error: { code, message }, noData: false, explain: message });
}

export async function dnsAudit(state: NetState, host: string, deps: DnsDeps = defaultDnsDeps) {
  const started = performance.now();
  const types: DnsType[] = isIP(host) !== 0 ? ["PTR"] : AUDIT_TYPES;
  const results = await Promise.all(types.map((t) => dnsQuery(state, host, t, deps)));
  const active = results.filter((r) => r.lines.length > 0).length;
  return { host, results, active, elapsedMs: round1(performance.now() - started) };
}
