// Pure helpers of the Subdomains tool: sorting, filtering, the table as text, and the plain-words wording of states.
// No DOM and no network here, so these can be tested on their own.
import { naturalCompare } from "./util.js";
import { rowsToJson, rowsToMarkdown, rowsToTsv } from "./copyformat.js";

export const SOURCE_STATE_WORDS = {
  waiting: "waiting", running: "asking…", done: "answered", failed: "failed", timeout: "timed out", cancelled: "cancelled",
};

/** Columns of the results table: key, heading, and what the heading explains. */
export const COLUMNS = [
  { key: "host", label: "Host", tip: "The name of the host (shown in its plain ASCII form; international names start with xn--)." },
  { key: "sources", label: "Found by", tip: "Which sources reported this host." },
  { key: "ip", label: "IP addresses", tip: "The addresses DNS gave for this host. Empty means DNS had no answer, or DNS wasn't checked." },
  { key: "status", label: "Web", tip: "The HTTP status the website answered with (200 means OK). Empty if it wasn't probed or didn't answer." },
  { key: "title", label: "Page title", tip: "The title of the web page, shortened and cleaned. It is shown as plain text." },
  { key: "ports", label: "Open ports", tip: "Ports that accepted a connection." },
  { key: "wildcard", label: "Wildcard", tip: "Yes means the host only matches the domain's wildcard DNS answer, so it may not be a real separate site." },
];

/** What one row shows in each column, as plain strings. */
export function cells(row) {
  return {
    host: row.host,
    sources: (row.sources ?? []).join(", "),
    ip: (row.ip ?? []).join(", "),
    status: row.httpStatus === undefined ? "" : String(row.httpStatus),
    title: row.httpTitle ?? "",
    ports: (row.openPorts ?? []).join(", "),
    wildcard: row.isWildcard ? "yes" : "",
  };
}

/** True when the host answered DNS or the web. */
export const isLive = (row) => (row.ip?.length ?? 0) > 0 || row.httpStatus !== undefined;

export const statusClass = (row) => (row.httpStatus === undefined ? "none" : `${Math.floor(row.httpStatus / 100)}xx`);

const sortValue = {
  host: (r) => r.host,
  sources: (r) => (r.sources ?? []).join(","),
  ip: (r) => (r.ip ?? [])[0] ?? "",
  title: (r) => r.httpTitle ?? "",
  ports: (r) => (r.openPorts ?? []).join(","),
};

/** Sorted copy. Numbers (status) sort as numbers, and rows without a value always go last. */
export function sortRows(rows, key = "host", dir = "asc") {
  const sign = dir === "desc" ? -1 : 1;
  const missing = (r) => (key === "status" ? r.httpStatus === undefined : key === "wildcard" ? false : (sortValue[key]?.(r) ?? "") === "");
  return [...rows].sort((a, b) => {
    const ma = missing(a);
    const mb = missing(b);
    if (ma !== mb) return ma ? 1 : -1;
    let c = 0;
    if (key === "status") c = (a.httpStatus ?? 0) - (b.httpStatus ?? 0);
    else if (key === "wildcard") c = Number(!!a.isWildcard) - Number(!!b.isWildcard);
    else c = naturalCompare(sortValue[key](a), sortValue[key](b));
    return sign * c || naturalCompare(a.host, b.host);
  });
}

/**
 * Rows that pass the filter: { text, ip: any|has|none, status: any|2xx|3xx|4xx|5xx|none, source: any|<id>, onlyLive }.
 * The text matches the host, title, addresses and sources, ignoring case.
 */
export function filterRows(rows, f = {}) {
  const text = (f.text ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.onlyLive && !isLive(r)) return false;
    if (f.ip === "has" && !(r.ip?.length > 0)) return false;
    if (f.ip === "none" && r.ip?.length > 0) return false;
    if (f.status && f.status !== "any" && statusClass(r) !== f.status) return false;
    if (f.source && f.source !== "any" && !(r.sources ?? []).includes(f.source)) return false;
    if (!text) return true;
    const c = cells(r);
    return [c.host, c.title, c.ip, c.sources].some((v) => v.toLowerCase().includes(text));
  });
}

/** The table as rows of strings, the first row being the headings. */
export function tableRows(rows) {
  return [COLUMNS.map((c) => c.label), ...rows.map((r) => COLUMNS.map((c) => cells(r)[c.key]))];
}

export const hostsText = (rows) => rows.map((r) => r.host).join("\n");
export const tableTsv = (rows) => rowsToTsv(tableRows(rows));
export const tableMarkdown = (rows) => rowsToMarkdown(tableRows(rows));
export const tableJson = (rows) => rowsToJson(tableRows(rows));

/** One CSV cell; a value a spreadsheet would run as a formula is made plain text first. */
export function csvCell(value) {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const tableCsv = (rows) => `${tableRows(rows).map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;

/** The address to open or copy for a host: the scheme that answered, else HTTPS. */
export const urlFor = (row) => `${row.httpScheme === "http" ? "http" : "https"}://${row.host}/`;

/** Counts for the line above the table. */
export function countsLine(all, shown, used) {
  const live = all.filter((r) => (r.ip?.length ?? 0) > 0).length;
  const answered = all.filter((r) => r.httpStatus !== undefined).length;
  const parts = [`${shown.length === all.length ? `${all.length}` : `${shown.length} shown of ${all.length}`} host${all.length === 1 ? "" : "s"}`];
  if (used.resolve) parts.push(`${live} with an IP address`);
  if (used.probeHttp) parts.push(`${answered} answered on the web`);
  if (used.ports) parts.push(`${all.filter((r) => r.openPorts?.length > 0).length} with open ports`);
  if (used.wildcard) parts.push(`${all.filter((r) => r.isWildcard).length} matching the wildcard`);
  return parts.join(" · ");
}

/** A short plain description of a history entry's steps. */
export function stepsWords(steps) {
  const used = [];
  if (steps.resolve) used.push("DNS");
  if (steps.wildcard) used.push("wildcard check");
  if (steps.probeHttp) used.push("web");
  if (steps.ports?.length) used.push(`ports ${steps.ports.join(",")}`);
  return used.length ? `passive + ${used.join(", ")}` : "passive only";
}

/** The numbers in the options, checked on the page before asking the server; returns a plain message or "". */
export function checkNumbers(v, limits) {
  const within = (n, lo, hi) => /^\d+$/.test(String(n).trim()) && Number(n) >= lo && Number(n) <= hi;
  if (!within(v.timeoutSec, limits.minTimeoutSec, limits.maxTimeoutSec)) return { field: "timeout", message: `The time limit per source must be a whole number from ${limits.minTimeoutSec} to ${limits.maxTimeoutSec} seconds.` };
  if (!within(v.maxResults, 1, limits.maxResults)) return { field: "max", message: `The most results to keep must be a whole number from 1 to ${limits.maxResults}.` };
  if (!within(v.dnsConcurrency, 1, limits.maxDnsConcurrency)) return { field: "dns", message: `DNS lookups at once must be a whole number from 1 to ${limits.maxDnsConcurrency}.` };
  if (!within(v.httpConcurrency, 1, limits.maxHttpConcurrency)) return { field: "http", message: `Web checks at once must be a whole number from 1 to ${limits.maxHttpConcurrency}.` };
  return null;
}
