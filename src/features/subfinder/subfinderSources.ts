/**
 * The passive sources of the subdomain engine: where each one is asked, how its answer is read, and how a source
 * that fails is described. The parsers are strict and pure (text in, raw names out); they never trust the shape of
 * the data, and what they return is only candidate text that the caller still has to validate.
 */
import { USER_AGENT, readCappedText, TooLargeError } from "./subfinderNet.ts";

export interface SourceDef {
  id: string;
  label: string;
  /** One plain sentence about what the source is. */
  note: string;
  url(domain: string): string;
  maxBytes: number;
  parse(text: string): string[];
}

export class SourceError extends Error {
  constructor(readonly code: "timeout" | "http" | "rate-limit" | "too-large" | "bad-data" | "network" | "cancelled" | "program", message: string) {
    super(message);
    this.name = "SourceError";
  }
}

/** Most names read from one answer before the rest is ignored. */
export const MAX_RAW_NAMES = 500_000;

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError("bad-data", `${what} sent an answer that isn't valid JSON, so it was ignored.`);
  }
}

export function parseCrtSh(text: string): string[] {
  const data = parseJson(text, "crt.sh");
  if (!Array.isArray(data)) throw new SourceError("bad-data", "crt.sh sent an answer in an unexpected shape, so it was ignored.");
  const names: string[] = [];
  for (const item of data) {
    if (names.length >= MAX_RAW_NAMES) break;
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.name_value === "string") for (const n of entry.name_value.slice(0, 20_000).split("\n")) names.push(n);
    if (typeof entry.common_name === "string") names.push(entry.common_name);
  }
  return names;
}

export function parseHackerTarget(text: string): string[] {
  const first = text.trimStart().slice(0, 200).toLowerCase();
  if (first.startsWith("error") || first.includes("api count exceeded")) {
    const limited = first.includes("api count");
    throw new SourceError(limited ? "rate-limit" : "bad-data", limited ? "HackerTarget's free daily limit has been reached. Try again tomorrow." : "HackerTarget didn't accept the request.");
  }
  if (first.startsWith("no records found") || first.startsWith("no dns records")) return [];
  const names: string[] = [];
  for (const line of text.split("\n")) {
    if (names.length >= MAX_RAW_NAMES) break;
    const name = line.split(",")[0]?.trim();
    if (name) names.push(name);
  }
  return names;
}

export function parseOtx(text: string): string[] {
  const data = parseJson(text, "AlienVault OTX");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new SourceError("bad-data", "AlienVault OTX sent an answer in an unexpected shape, so it was ignored.");
  const list = (data as Record<string, unknown>).passive_dns;
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new SourceError("bad-data", "AlienVault OTX sent an answer in an unexpected shape, so it was ignored.");
  const names: string[] = [];
  for (const item of list) {
    if (names.length >= MAX_RAW_NAMES) break;
    const host = (item as Record<string, unknown> | null)?.hostname;
    if (typeof host === "string") names.push(host);
  }
  return names;
}

export function parseAnubis(text: string): string[] {
  const data = parseJson(text, "Anubis");
  if (!Array.isArray(data)) throw new SourceError("bad-data", "Anubis sent an answer in an unexpected shape, so it was ignored.");
  const names: string[] = [];
  for (const item of data) {
    if (names.length >= MAX_RAW_NAMES) break;
    if (typeof item === "string") names.push(item);
  }
  return names;
}

const MB = 1024 * 1024;

export const PASSIVE_SOURCES: readonly SourceDef[] = [
  { id: "crtsh", label: "crt.sh", note: "Public certificate logs: every name a website ever asked a certificate for.", url: (d) => `https://crt.sh/?q=%25.${d}&output=json`, maxBytes: 16 * MB, parse: parseCrtSh },
  { id: "hackertarget", label: "HackerTarget", note: "A free host-search service (limited number of questions per day).", url: (d) => `https://api.hackertarget.com/hostsearch/?q=${d}`, maxBytes: 4 * MB, parse: parseHackerTarget },
  { id: "alienvault", label: "AlienVault OTX", note: "Passive DNS: names other people's computers have been seen asking for.", url: (d) => `https://otx.alienvault.com/api/v1/indicators/domain/${d}/passive_dns`, maxBytes: 8 * MB, parse: parseOtx },
  { id: "anubis", label: "Anubis", note: "A subdomain database collected from several public sources.", url: (d) => `https://jonlu.ca/anubis/subdomains/${d}`, maxBytes: 4 * MB, parse: parseAnubis },
];

export const PASSIVE_SOURCE_IDS: readonly string[] = PASSIVE_SOURCES.map((s) => s.id);

export type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string>; redirect: "manual"; credentials: "omit"; method: "GET" }) => Promise<Response>;

/**
 * Asks one passive source. `fetch` can be replaced so tests never use the network. Redirects are refused, no
 * cookies or credentials are sent, the answer is read only up to the source's size limit, and the whole question
 * ends after `timeoutMs` or when `signal` is aborted. Throws a SourceError in plain words; returns raw names.
 */
export async function askSource(def: SourceDef, domain: string, o: { fetch: FetchLike; timeoutMs: number; signal?: AbortSignal }): Promise<string[]> {
  if (o.signal?.aborted) throw new SourceError("cancelled", "Cancelled.");
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, o.timeoutMs);
  const onAbort = () => abort.abort();
  o.signal?.addEventListener("abort", onAbort, { once: true });
  // A fetch that ignores its signal must not keep the run waiting: the question is also raced against the abort.
  const aborted = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  aborted.catch(() => {});
  try {
    const work = (async () => {
      const res = await o.fetch(def.url(domain), { method: "GET", signal: abort.signal, redirect: "manual", credentials: "omit", headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain;q=0.8, */*;q=0.1" } });
      if (res.status >= 300 && res.status < 400) throw new SourceError("http", `${def.label} answered with a redirect (HTTP ${res.status}): it has probably moved, and this tool doesn't follow redirects. Try the other sources.`);
      if (res.status === 429) throw new SourceError("rate-limit", `${def.label} says there were too many questions. Wait a while and try again.`);
      if (!res.ok) throw new SourceError("http", `${def.label} answered with an error (HTTP ${res.status}).`);
      return def.parse(await readCappedText(res, def.maxBytes));
    })();
    work.catch(() => {});
    return await Promise.race([work, aborted]);
  } catch (err) {
    if (err instanceof SourceError) throw err;
    if (timedOut) throw new SourceError("timeout", `${def.label} didn't answer within ${Math.round(o.timeoutMs / 1000)} seconds.`);
    if (o.signal?.aborted) throw new SourceError("cancelled", "Cancelled.");
    if (err instanceof TooLargeError) throw new SourceError("too-large", `${def.label}'s answer is bigger than ${Math.round(def.maxBytes / MB)} MB, which is more than this tool reads. Try the other sources.`);
    throw new SourceError("network", `${def.label} couldn't be reached. Check that you are online.`);
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}
