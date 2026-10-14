/**
 * Strict checking of names for the subdomain engine: the domain a person types, every host a source returns (all of
 * it untrusted), page titles, port lists and spreadsheet-safe cells. Nothing here touches the network.
 */
import { isIP } from "node:net";
import { domainToASCII, domainToUnicode } from "node:url";

export const MAX_DOMAIN_LENGTH = 253;
export const MAX_LABEL_LENGTH = 63;
export const MAX_PORTS = 20;
export const MAX_TITLE_CHARS = 120;

/** Control, zero-width and bidirectional-control characters: never part of a real host name, and used to disguise text. */
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Second-level names that many separate organisations share ("co.uk"), and well-known sites that hand out subdomains to the public. */
const SHARED_SUFFIXES = new Set(`
co.uk org.uk me.uk ltd.uk plc.uk net.uk sch.uk ac.uk gov.uk nhs.uk police.uk
com.au net.au org.au edu.au gov.au asn.au id.au
co.nz net.nz org.nz govt.nz ac.nz school.nz
co.jp ne.jp or.jp ac.jp go.jp ad.jp ed.jp gr.jp lg.jp
com.br net.br org.br gov.br edu.br
com.cn net.cn org.cn gov.cn edu.cn
co.in net.in org.in gov.in ac.in res.in firm.in gen.in ind.in
co.za org.za net.za gov.za ac.za
co.kr or.kr ne.kr go.kr ac.kr
com.mx org.mx gob.mx edu.mx net.mx
com.ar org.ar net.ar gob.ar edu.ar
com.tr org.tr net.tr gov.tr edu.tr
com.ru net.ru org.ru com.ua net.ua org.ua com.pl net.pl org.pl
com.hk org.hk net.hk edu.hk gov.hk com.sg org.sg net.sg edu.sg gov.sg
com.tw org.tw net.tw edu.tw gov.tw com.my com.ph co.id or.id go.id co.th or.th ac.th go.th com.vn
com.ng co.ke com.eg co.il org.il com.sa com.pk co.ae
blogspot.com github.io gitlab.io herokuapp.com appspot.com azurewebsites.net cloudfront.net
netlify.app vercel.app pages.dev workers.dev web.app firebaseapp.com wordpress.com
s3.amazonaws.com amazonaws.com cloudapp.net trafficmanager.net
`.split(/\s+/).filter(Boolean));

/** Parts of a name like "com.xx" or "co.xx" that, in front of a two-letter country code, are always a shared suffix. */
const GENERIC_SECOND_LEVEL = new Set(["com", "co", "org", "net", "gov", "edu", "ac", "mil"]);

/** True when `ascii` (a lower-case ASCII name) is a top-level or shared suffix that nobody owns alone. */
export function isPublicSuffix(ascii: string): boolean {
  const labels = ascii.split(".");
  if (labels.length === 1) return true;
  if (SHARED_SUFFIXES.has(ascii)) return true;
  return labels.length === 2 && /^[a-z]{2}$/.test(labels[1]!) && GENERIC_SECOND_LEVEL.has(labels[0]!);
}

export type DomainCheck = { ok: true; ascii: string; unicode: string } | { ok: false; reason: string };

const HELP = "Type just the name of the site, like example.com.";
const bad = (reason: string): DomainCheck => ({ ok: false, reason });

/** Turns what a person typed into a clean domain, or says in plain words why it can't be used. */
export function validateTargetDomain(input: unknown): DomainCheck {
  if (typeof input !== "string") return bad(`No domain was given. ${HELP}`);
  if (input.length > 400) return bad("That is far too long to be a domain name.");
  let text = input.trim();
  if (!text) return bad(`No domain was given. ${HELP}`);
  if (HIDDEN_CHARS.test(text)) return bad("That contains hidden or invisible characters. Type the domain again by hand.");
  if (/\s/.test(text)) return bad(`A domain can't contain spaces. ${HELP}`);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /[/\\?#@]/.test(text)) return bad(`That looks like a web address, not a domain. Remove http://, any path, and any user name. ${HELP}`);
  const bracketless = text.replace(/^\[|\]$/g, "");
  if (isIP(bracketless) !== 0 || bracketless.includes(":") && /^[0-9a-f:.]+$/i.test(bracketless)) return bad("That is an IP address. Subdomain discovery needs a domain name like example.com.");
  if (/:\d*$/.test(text)) return bad(`Leave the port number out. ${HELP}`);
  if (text.includes(":")) return bad(`A domain can't contain a colon. ${HELP}`);
  if (text.includes("*")) return bad(`A wildcard (*) can't be used here. ${HELP}`);
  if (text.endsWith(".")) text = text.slice(0, -1);
  if (!text) return bad(`No domain was given. ${HELP}`);
  if (text.startsWith(".") || text.includes("..")) return bad("A domain can't start with a dot or contain an empty part (two dots in a row).");

  let ascii = text.toLowerCase();
  if (/[^\x00-\x7f]/.test(ascii)) {
    ascii = domainToASCII(ascii);
    if (!ascii) return bad(`That has characters a domain name can't have. ${HELP}`);
  }
  if (ascii.length > MAX_DOMAIN_LENGTH) return bad(`That is too long: a domain can be at most ${MAX_DOMAIN_LENGTH} characters.`);
  const labels = ascii.split(".");
  for (const label of labels) {
    if (label.length > MAX_LABEL_LENGTH) return bad(`"${label.slice(0, 20)}…" is too long: each part between dots can be at most ${MAX_LABEL_LENGTH} characters.`);
    if (label.includes("_")) return bad("A domain can't contain an underscore (_). Use letters, digits and hyphens.");
    if (!LABEL.test(label)) return bad(`"${label.slice(0, 30)}" isn't allowed in a domain name. Use letters, digits and hyphens only, and no hyphen at the start or end.`);
    if (label.slice(2, 4) === "--" && !label.startsWith("xn--")) return bad(`"${label.slice(0, 30)}" isn't allowed in a domain name.`);
  }
  const last = labels[labels.length - 1]!;
  if (labels.length === 1) {
    return bad(last === "localhost" ? "\"localhost\" is this computer, not a domain on the internet. Type a real domain like example.com." : `"${last}" is a top-level domain, shared by everyone. Type a site name under it, like example.${last.length <= 6 ? last : "com"}.`);
  }
  if (/^\d+$/.test(last) || /^0x[0-9a-f]*$/.test(last)) return bad("That looks like a number or an IP address, not a domain name.");
  if (last === "localhost" || last === "invalid" || last === "arpa") return bad(`Names ending in .${last} can't be looked up on the internet.`);
  if (!TLD.test(last)) return bad(`".${last.slice(0, 20)}" doesn't look like a real top-level domain.`);
  if (isPublicSuffix(ascii)) return bad(`"${ascii}" is a shared suffix: many unrelated organisations have names under it. Type a name under it, like example.${ascii}.`);
  const unicode = domainToUnicode(ascii);
  if (!unicode || unicode.split(".").length !== labels.length) return bad(`That has characters a domain name can't have. ${HELP}`);
  return { ok: true, ascii, unicode };
}

/**
 * A host name from a source, made safe, or null: lower case, a leading "*." removed, internationalised names turned
 * into their ASCII (xn--) form, every part checked against the strict pattern, and kept only if it is `scope` itself
 * or ends with ".scope". Hostile text is refused, never "cleaned up" into something valid.
 */
export function normaliseHost(raw: unknown, scope: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 400) return null;
  let host = raw.trim();
  if (HIDDEN_CHARS.test(host)) return null;
  if (host.startsWith("*.")) host = host.slice(2);
  if (host.endsWith(".")) host = host.slice(0, -1);
  host = host.toLowerCase();
  if (/[^\x00-\x7f]/.test(host)) {
    host = domainToASCII(host);
    if (!host) return null;
  }
  if (host.length === 0 || host.length > MAX_DOMAIN_LENGTH) return null;
  if (host !== scope && !host.endsWith(`.${scope}`)) return null;
  for (const label of host.split(".")) {
    if (!LABEL.test(label)) return null;
    if (label.slice(2, 4) === "--" && !label.startsWith("xn--")) return null;
  }
  return host;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", copy: "©", reg: "®", mdash: "—", ndash: "–", hellip: "…", middot: "·", laquo: "«", raquo: "»" };

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi, (whole, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[String(name).toLowerCase()] ?? whole;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
  });
}

/** Text from a web page made safe to store and show: entities decoded, control and bidi characters removed, spaces collapsed, cut to `max` characters. */
export function cleanTitle(raw: string, max = MAX_TITLE_CHARS): string {
  const stripped = decodeEntities(raw.slice(0, 4000)).replace(new RegExp(HIDDEN_CHARS.source, "g"), " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(stripped);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : stripped;
}

/** The page title in the start of an HTML page, cleaned, or "" when there isn't one (or the data is not text at all). */
export function extractTitle(html: string): string {
  const head = html.slice(0, 65536);
  let odd = 0;
  const sample = head.slice(0, 2000);
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || c === 0xfffd) odd++;
  }
  if (sample.length > 0 && odd / sample.length > 0.05) return "";
  const open = /<title(?:\s[^>]{0,200})?>/i.exec(head);
  if (!open) return "";
  const from = open.index + open[0].length;
  const close = head.slice(from, from + 4000).search(/<\/title/i);
  return cleanTitle(close >= 0 ? head.slice(from, from + close) : head.slice(from, from + 4000));
}

export type PortsCheck = { ok: true; ports: number[] } | { ok: false; reason: string };

/** "80,443,8000-8003" (or a list of numbers) to a sorted list of at most MAX_PORTS distinct ports. */
export function parsePortList(input: unknown): PortsCheck {
  if (input === undefined || input === null || input === "") return { ok: true, ports: [] };
  const parts: unknown[] = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\s]+/).filter(Boolean) : typeof input === "number" ? [input] : [];
  if (!Array.isArray(input) && typeof input !== "string" && typeof input !== "number") return { ok: false, reason: "Type the ports like 80,443 or 8000-8003." };
  if (typeof input === "string" && input.length > 300) return { ok: false, reason: "That list of ports is too long." };
  if (parts.length > 200) return { ok: false, reason: `Choose at most ${MAX_PORTS} ports.` };
  const found = new Set<number>();
  const one = (v: unknown): number => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,5}$/.test(v.trim()) ? Number(v) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : NaN;
  };
  for (const part of parts) {
    const range = typeof part === "string" ? /^(\d{1,5})-(\d{1,5})$/.exec(part.trim()) : null;
    if (range) {
      const from = one(range[1]!);
      const to = one(range[2]!);
      if (Number.isNaN(from) || Number.isNaN(to) || from > to) return { ok: false, reason: `"${part}" isn't a valid range of ports. Ports are whole numbers from 1 to 65535, like 8000-8003.` };
      if (to - from + 1 > MAX_PORTS) return { ok: false, reason: `That range is more than ${MAX_PORTS} ports. Choose at most ${MAX_PORTS} ports in total.` };
      for (let p = from; p <= to; p++) found.add(p);
    } else {
      const n = one(part);
      if (Number.isNaN(n)) return { ok: false, reason: `"${String(part).slice(0, 12)}" isn't a valid port. Ports are whole numbers from 1 to 65535.` };
      found.add(n);
    }
    if (found.size > MAX_PORTS) return { ok: false, reason: `Choose at most ${MAX_PORTS} ports (you asked for more).` };
  }
  return { ok: true, ports: [...found].sort((a, b) => a - b) };
}

/** One cell of a CSV file. A cell a spreadsheet would run as a formula (it starts with = + - @ or a tab/return) is made plain text first. */
export function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
