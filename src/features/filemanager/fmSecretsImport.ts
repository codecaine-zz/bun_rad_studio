/**
 * Reading other password managers' exports (Chrome, Edge, Firefox, Safari, 1Password, LastPass, KeePass CSV and
 * Bitwarden JSON) and writing the plain CSV export. Everything is parsed defensively as text: a cell such as
 * `=cmd|' /C calc'!A0` is just a string. Nothing here logs, and a failure never quotes the content.
 */
import { FmError } from "./fmPaths";
import { LIMITS } from "./fmSecretsModel";

export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

/** RFC 4180 CSV: quotes, doubled quotes, line breaks inside quotes, CRLF or LF, a leading byte order mark. */
export function parseCsv(input: string, maxRows = LIMITS.items + 2): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    started = false;
    if (rows.length > maxRows) throw new FmError("TOO_LARGE", `That file has more than ${LIMITS.items.toLocaleString("en-US")} rows, more than a vault can hold.`);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && !started) {
      quoted = true;
      started = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      started = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
      started = true;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

export interface ImportedItem {
  type: string;
  title: string;
  fields: Record<string, string>;
  notes?: string;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  custom?: Array<{ label: string; kind: string; value: string }>;
}
export interface ImportParse {
  dialect: string;
  items: ImportedItem[];
  warnings: string[];
}

const SYNONYMS: Record<string, string[]> = {
  title: ["title", "name", "account", "site name"],
  url: ["url", "website", "login_uri", "uri", "web site", "login url"],
  username: ["username", "login_username", "user", "login", "user name", "login name", "email address"],
  password: ["password", "login_password", "pass"],
  notes: ["notes", "note", "extra", "comments", "notesplain"],
  totp: ["totp", "otpauth", "login_totp", "otp", "one-time password"],
  folder: ["folder", "group", "grouping"],
  tags: ["tags"],
  favorite: ["favorite", "fav", "favourite"],
  type: ["type"],
};

function dialectOf(h: Set<string>): string {
  if (h.has("httprealm") || h.has("formactionorigin")) return "Firefox";
  if (h.has("login_uri") || h.has("login_username")) return "Bitwarden CSV";
  if (h.has("archived") && h.has("otpauth")) return "1Password";
  if (h.has("grouping") && h.has("extra")) return "LastPass";
  if (h.has("group") && (h.has("icon") || h.has("last modified"))) return "KeePass";
  if (h.has("otpauth") && h.has("title")) return "Safari";
  if (h.has("name") && h.has("url") && h.has("username") && h.has("password")) return "Chrome or Edge";
  return "CSV";
}

const truthy = (v: string): boolean => /^(1|true|yes|y|x)$/i.test(v.trim());

export function importCsv(text: string): ImportParse {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new FmError("BAD_IMPORT", "That file has no rows to import.");
  const header = rows[0]!.map((c) => c.trim().toLowerCase());
  const names = new Set(header);
  const col: Record<string, number> = {};
  for (const [key, list] of Object.entries(SYNONYMS)) {
    const i = header.findIndex((c) => list.includes(c));
    if (i >= 0) col[key] = i;
  }
  if (col.password === undefined && col.url === undefined && col.username === undefined) throw new FmError("BAD_IMPORT", "That doesn't look like a password export: it has no password, website or username column.");
  const get = (r: string[], key: string): string => (col[key] === undefined ? "" : (r[col[key]!] ?? "").trim());
  const items: ImportedItem[] = [];
  let blank = 0;
  for (const r of rows.slice(1)) {
    const url = get(r, "url");
    const username = get(r, "username");
    const password = (col.password === undefined ? "" : r[col.password] ?? "");
    const title = get(r, "title");
    const notes = col.notes === undefined ? "" : r[col.notes] ?? "";
    if (!title && !url && !username && !password && !notes) {
      blank++;
      continue;
    }
    const isNote = get(r, "type").toLowerCase().includes("note") && !password;
    const fallback = url.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "") || username || "Untitled";
    items.push({
      type: isNote ? "note" : "login",
      title: title || fallback,
      fields: isNote ? {} : { username, password, url, totp: get(r, "totp") },
      notes,
      folder: get(r, "folder").replace(/\\/g, "/"),
      tags: get(r, "tags").split(/[,;]/).map((t) => t.trim()).filter(Boolean),
      favorite: truthy(get(r, "favorite")),
    });
  }
  return { dialect: dialectOf(names), items, warnings: blank ? [`${blank} empty ${blank === 1 ? "row was" : "rows were"} skipped.`] : [] };
}

const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Bitwarden's unencrypted JSON export. */
export function importBitwarden(text: string): ImportParse {
  let data: any;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new FmError("BAD_IMPORT", "That file isn't valid JSON.");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) throw new FmError("BAD_IMPORT", "That doesn't look like a Bitwarden export.");
  if (data.encrypted === true) throw new FmError("BAD_IMPORT", "That Bitwarden export is encrypted. Export it again as an unencrypted .json file (or CSV) and import that.");
  if (data.items.length > LIMITS.items) throw new FmError("TOO_LARGE", `That file has more than ${LIMITS.items.toLocaleString("en-US")} items, more than a vault can hold.`);
  const folders = new Map<string, string>((Array.isArray(data.folders) ? data.folders : []).filter((f: any) => f && typeof f.id === "string").map((f: any) => [f.id, s(f.name)]));
  const items: ImportedItem[] = [];
  const warnings: string[] = [];
  let unknown = 0;
  for (const it of data.items) {
    if (!it || typeof it !== "object") continue;
    const base = { title: s(it.name) || "Untitled", notes: s(it.notes), folder: folders.get(s(it.folderId)) ?? "", favorite: it.favorite === true } as const;
    const custom: Array<{ label: string; kind: string; value: string }> = (Array.isArray(it.fields) ? it.fields : []).filter((f: any) => f && s(f.name)).map((f: any) => ({ label: s(f.name), kind: f.type === 1 ? "hidden" : "text", value: s(f.value) }));
    if (it.type === 1 && it.login) {
      const uris: string[] = (Array.isArray(it.login.uris) ? it.login.uris : []).map((u: any) => s(u?.uri)).filter(Boolean);
      for (const extra of uris.slice(1, 6)) custom.push({ label: "Another website", kind: "url", value: extra });
      items.push({ ...base, type: "login", fields: { username: s(it.login.username), password: s(it.login.password), url: uris[0] ?? "", totp: s(it.login.totp) }, custom });
    } else if (it.type === 2) {
      items.push({ ...base, type: "note", fields: {}, custom });
    } else if (it.type === 3 && it.card) {
      const c = it.card;
      items.push({ ...base, type: "card", fields: { cardholder: s(c.cardholderName), number: s(c.number), expiry: [s(c.expMonth), s(c.expYear)].filter(Boolean).join("/"), cvv: s(c.code), pin: "" }, custom });
    } else if (it.type === 4 && it.identity) {
      const i = it.identity;
      const address = [s(i.address1), s(i.address2), s(i.address3), [s(i.postalCode), s(i.city)].filter(Boolean).join(" "), s(i.state), s(i.country)].filter(Boolean).join("\n");
      items.push({ ...base, type: "identity", fields: { fullName: [s(i.title), s(i.firstName), s(i.middleName), s(i.lastName)].filter(Boolean).join(" "), email: s(i.email), phone: s(i.phone), address, birthday: "", idNumber: s(i.ssn) || s(i.passportNumber) || s(i.licenseNumber) }, custom });
    } else unknown++;
  }
  if (unknown) warnings.push(`${unknown} ${unknown === 1 ? "item" : "items"} of a kind this program doesn't know ${unknown === 1 ? "was" : "were"} skipped.`);
  return { dialect: "Bitwarden JSON", items, warnings };
}

/** Chooses the reader from the file's first characters (or the given name). */
export function importAny(text: string, format?: string): ImportParse {
  const head = text.replace(/^\uFEFF/, "").trimStart();
  const asJson = format === "bitwarden" || (format === undefined && (head.startsWith("{") || head.startsWith("[")));
  return asJson ? importBitwarden(text) : importCsv(text);
}

// ---------------------------------------------------------------------------------------------------------------
// The plain-text CSV export (dangerous: the caller gates it)
// ---------------------------------------------------------------------------------------------------------------

const quote = (v: string): string => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);

export const CSV_HEADER = ["title", "url", "username", "password", "notes", "totp", "type", "folder", "tags", "favorite"];

export function csvRow(cells: string[]): string {
  return cells.map(quote).join(",");
}
