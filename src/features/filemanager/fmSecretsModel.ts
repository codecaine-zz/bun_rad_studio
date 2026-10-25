/**
 * The vault's database: what an item is, which of its fields are secret, how requests are validated and what the
 * list and detail views may show. Pure functions on plain objects; nothing here touches disk.
 */
import { randomUUID } from "node:crypto";
import { FmError } from "./fmPaths";

export const ITEM_TYPES = ["login", "note", "card", "identity", "api", "wifi", "ssh", "custom"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const CUSTOM_KINDS = ["text", "hidden", "url", "date", "otp"] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];

export const LIMITS = {
  items: 5000,
  title: 200,
  folder: 200,
  tags: 20,
  tag: 50,
  notes: 100_000,
  field: 4096,
  longField: 20_000,
  custom: 50,
  customValue: 10_000,
  label: 100,
  history: 10,
  attachmentBytes: 1024 * 1024,
  attachmentsTotal: 10 * 1024 * 1024,
  attachmentsPerItem: 10,
  audit: 500,
  dbBytes: 64 * 1024 * 1024,
} as const;

export interface FieldSpec {
  key: string;
  label: string;
  secret: boolean;
  kind: "text" | "password" | "url" | "date" | "otp" | "multiline";
}
const f = (key: string, label: string, secret = false, kind: FieldSpec["kind"] = "text"): FieldSpec => ({ key, label, secret, kind });

export const TYPE_FIELDS: Record<ItemType, FieldSpec[]> = {
  login: [f("username", "Username"), f("password", "Password", true, "password"), f("url", "Website", false, "url"), f("totp", "One-time code (2FA) secret", true, "otp")],
  note: [],
  card: [f("cardholder", "Name on card"), f("number", "Card number", true), f("expiry", "Expires"), f("cvv", "Security code", true), f("pin", "PIN", true)],
  identity: [f("fullName", "Full name"), f("email", "Email"), f("phone", "Phone"), f("address", "Address", false, "multiline"), f("birthday", "Birthday", false, "date"), f("idNumber", "ID number", true)],
  api: [f("endpoint", "Address", false, "url"), f("key", "Key or token", true, "password"), f("secret", "Secret", true, "password")],
  wifi: [f("ssid", "Network name"), f("security", "Security"), f("password", "Password", true, "password")],
  ssh: [f("host", "Host"), f("username", "Username"), f("privateKey", "Private key", true, "multiline"), f("publicKey", "Public key", false, "multiline"), f("passphrase", "Key passphrase", true, "password")],
  custom: [],
};

export interface CustomField {
  id: string;
  label: string;
  kind: CustomKind;
  value: string;
}
export interface Attachment {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  /** base64 of the file's bytes */
  data: string;
}
export interface SecretItem {
  id: string;
  type: ItemType;
  title: string;
  favorite: boolean;
  tags: string[];
  folder: string;
  notes: string;
  fields: Record<string, string>;
  custom: CustomField[];
  history: Array<{ value: string; at: number }>;
  attachments: Attachment[];
  createdAt: number;
  modifiedAt: number;
  pwChangedAt: number;
  deletedAt: number | null;
}
export interface Settings {
  /** 0 = never */
  autoLockMinutes: number;
  /** 0 = never clear */
  clipboardSeconds: number;
  lockOnBlur: boolean;
  /** "Unlock with this computer" stops working after this many days without the master password (1 to 90). */
  deviceMaxDays: number;
}
export interface AuditEvent {
  t: number;
  ev: string;
  n?: number;
}
export interface Db {
  v: 1;
  createdAt: number;
  modifiedAt: number;
  settings: Settings;
  items: Record<string, SecretItem>;
  audit: AuditEvent[];
}

export const DEFAULT_SETTINGS: Settings = { autoLockMinutes: 5, clipboardSeconds: 30, lockOnBlur: false, deviceMaxDays: 14 };

export function emptyDb(now: number): Db {
  return { v: 1, createdAt: now, modifiedAt: now, settings: { ...DEFAULT_SETTINGS }, items: {}, audit: [] };
}

const reject = (message: string): never => {
  throw new FmError("BAD_REQUEST", message);
};

function text(value: unknown, max: number, what: string, { required = false, trim = true }: { required?: boolean; trim?: boolean } = {}): string {
  if (value === undefined || value === null) return required ? reject(`Give the ${what}.`) : "";
  if (typeof value !== "string") return reject(`The ${what} must be text.`);
  const s = trim ? value.trim() : value;
  if (required && !s) return reject(`Give the ${what}.`);
  if ([...s].length > max) return reject(`The ${what} is too long (the limit is ${max.toLocaleString("en-US")} characters).`);
  if (s.includes("\0")) return reject(`The ${what} can't contain null characters.`);
  return s;
}

export function normalizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  if (input === undefined) return { ...base };
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("The settings must be an object.");
  const s = input as Record<string, unknown>;
  const out = { ...base };
  if (s.autoLockMinutes !== undefined) {
    const n = Number(s.autoLockMinutes);
    if (!Number.isInteger(n) || (n !== 0 && (n < 1 || n > 60))) reject("Auto-lock can be 1 to 60 minutes, or never (0).");
    out.autoLockMinutes = n;
  }
  if (s.clipboardSeconds !== undefined) {
    const n = Number(s.clipboardSeconds);
    if (!Number.isInteger(n) || (n !== 0 && (n < 10 || n > 120))) reject("The clipboard can be cleared after 10 to 120 seconds, or never (0).");
    out.clipboardSeconds = n;
  }
  if (s.lockOnBlur !== undefined) out.lockOnBlur = s.lockOnBlur === true;
  if (s.deviceMaxDays !== undefined) {
    const n = Number(s.deviceMaxDays);
    if (!Number.isInteger(n) || n < 1 || n > 90) reject("“Unlock with this computer” can last 1 to 90 days between master-password entries.");
    out.deviceMaxDays = n;
  }
  return out;
}

export function folderPath(value: unknown): string {
  const raw = text(value, LIMITS.folder, "folder name");
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 5) reject("Folders can be at most 5 levels deep.");
  return parts.join("/");
}

function tagList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return reject("Tags must be a list.");
  if (value.length > LIMITS.tags) reject(`An item can have at most ${LIMITS.tags} tags.`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const t = text(raw, LIMITS.tag, "tag");
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

const specFor = (type: ItemType, key: string): FieldSpec | undefined => TYPE_FIELDS[type].find((s) => s.key === key);

export const isItemType = (v: unknown): v is ItemType => typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);

/**
 * Builds the stored item from a request. For an update, a secret field (or the notes) that is missing or null in the request
 * keeps its old value, so the page never has to fetch a secret just to save something else. `keep: true` does the same
 * for a hidden custom field.
 */
export function buildItem(existing: SecretItem | null, input: unknown, now: number): SecretItem {
  if (!input || typeof input !== "object" || Array.isArray(input)) return reject("There is nothing to save.");
  const b = input as Record<string, any>;
  const type = existing ? existing.type : b.type === undefined ? "login" : b.type;
  if (!isItemType(type)) return reject("Choose what kind of item this is.");
  if (existing && b.type !== undefined && b.type !== existing.type) reject("The kind of an existing item can't be changed.");
  const fields: Record<string, string> = {};
  const given = b.fields === undefined ? {} : b.fields;
  if (!given || typeof given !== "object" || Array.isArray(given)) reject("The fields must be an object.");
  for (const key of Object.keys(given)) if (!specFor(type, key)) reject(`This kind of item has no “${key.slice(0, 40)}” field.`);
  for (const spec of TYPE_FIELDS[type]) {
    const v = given[spec.key];
    const keep = existing && (v === undefined || v === null);
    fields[spec.key] = keep ? existing.fields[spec.key] ?? "" : text(v, spec.kind === "multiline" ? LIMITS.longField : LIMITS.field, spec.label.toLowerCase(), { trim: !spec.secret });
  }
  const notes = existing && (b.notes === undefined || b.notes === null) ? existing.notes : text(b.notes, LIMITS.notes, "notes", { trim: false });
  const oldCustom = new Map((existing?.custom ?? []).map((c) => [c.id, c]));
  const customIn = b.custom === undefined ? (existing ? existing.custom : []) : b.custom;
  if (!Array.isArray(customIn)) reject("Custom fields must be a list.");
  if (customIn.length > LIMITS.custom) reject(`An item can have at most ${LIMITS.custom} custom fields.`);
  const ids = new Set<string>();
  const custom: CustomField[] = customIn.map((c: any) => {
    if (!c || typeof c !== "object") return reject("A custom field is not valid.");
    const kind = c.kind === undefined ? "text" : c.kind;
    if (!(CUSTOM_KINDS as readonly string[]).includes(kind)) reject("A custom field has an unknown kind.");
    const id = typeof c.id === "string" && /^[\w-]{1,64}$/.test(c.id) && !ids.has(c.id) ? c.id : randomUUID();
    ids.add(id);
    const old = oldCustom.get(id);
    const value = (c.keep === true || c.value === undefined || c.value === null) && old ? old.value : text(c.value, LIMITS.customValue, "custom field value", { trim: false });
    return { id, label: text(c.label, LIMITS.label, "custom field name", { required: true }), kind, value };
  });
  const title = text(b.title === undefined && existing ? existing.title : b.title, LIMITS.title, "title", { required: true });
  const pw = type === "login" || type === "wifi" ? "password" : null;
  const oldPw = existing && pw ? existing.fields[pw] ?? "" : "";
  const newPw = pw ? fields[pw] ?? "" : "";
  const history = existing ? existing.history.map((h) => ({ ...h })) : [];
  const changed = pw !== null && existing !== null && oldPw !== newPw;
  if (changed && oldPw) history.unshift({ value: oldPw, at: existing!.pwChangedAt });
  return {
    id: existing?.id ?? randomUUID(),
    type,
    title,
    favorite: b.favorite === undefined ? existing?.favorite ?? false : b.favorite === true,
    tags: b.tags === undefined && existing ? existing.tags : tagList(b.tags),
    folder: b.folder === undefined && existing ? existing.folder : folderPath(b.folder),
    notes,
    fields,
    custom,
    history: history.slice(0, LIMITS.history),
    attachments: existing?.attachments ?? [],
    createdAt: existing?.createdAt ?? now,
    modifiedAt: now,
    pwChangedAt: !existing || changed ? now : existing.pwChangedAt,
    deletedAt: existing?.deletedAt ?? null,
  };
}

/** The host name of a web address, or "". */
export function hostOf(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const SUBTITLE_KEYS = ["username", "email", "ssid", "host", "cardholder", "fullName", "endpoint"];

/** What the list may show: no password, note body, one-time secret or card number. */
export function listView(item: SecretItem) {
  const subtitle = SUBTITLE_KEYS.map((k) => item.fields[k]).find((v) => v) ?? "";
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle,
    host: hostOf(item.fields.url ?? item.fields.endpoint ?? ""),
    favorite: item.favorite,
    tags: item.tags,
    folder: item.folder,
    modifiedAt: item.modifiedAt,
    deleted: item.deletedAt !== null,
    hasTotp: Boolean(item.fields.totp) || item.custom.some((c) => c.kind === "otp" && c.value),
    hasPassword: Boolean(item.fields.password),
    hasNotes: item.notes.length > 0,
    attachments: item.attachments.length,
  };
}

/** Everything about an item except the secret values (those come one at a time from `reveal`). */
export function detailView(item: SecretItem) {
  const secretKeys = new Set(TYPE_FIELDS[item.type].filter((s) => s.secret).map((s) => s.key));
  const fields: Record<string, string> = {};
  const present: Record<string, boolean> = {};
  for (const spec of TYPE_FIELDS[item.type]) {
    const v = item.fields[spec.key] ?? "";
    present[spec.key] = v.length > 0;
    if (!secretKeys.has(spec.key)) fields[spec.key] = v;
  }
  return {
    ...listView(item),
    fields,
    present,
    notesLength: item.notes.length,
    custom: item.custom.map((c) => ({ id: c.id, label: c.label, kind: c.kind, hasValue: c.value.length > 0, ...(c.kind === "hidden" || c.kind === "otp" ? {} : { value: c.value }) })),
    attachmentList: item.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, addedAt: a.addedAt })),
    history: item.history.map((h) => ({ at: h.at })),
    createdAt: item.createdAt,
    pwChangedAt: item.pwChangedAt,
    deletedAt: item.deletedAt,
    spec: TYPE_FIELDS[item.type],
  };
}

/** The stored value of one field, or null when the item has no such field. Fields: a type's secret keys, "notes", "custom:<id>", "history:<n>". */
export function secretValue(item: SecretItem, field: unknown): string | null {
  if (typeof field !== "string") return null;
  if (field === "notes") return item.notes;
  if (field.startsWith("custom:")) return item.custom.find((c) => c.id === field.slice(7))?.value ?? null;
  if (field.startsWith("history:")) {
    const n = Number(field.slice(8));
    return Number.isInteger(n) ? item.history[n]?.value ?? null : null;
  }
  const spec = specFor(item.type, field);
  return spec ? item.fields[field] ?? "" : null;
}

/** Checks the shape of a decrypted database, filling in what an older or damaged one lacks, so no later code meets a missing property. */
export function normalizeDb(raw: unknown, now: number): Db {
  if (!raw || typeof raw !== "object" || (raw as any).v !== 1) throw new FmError("BAD_VAULT", "The vault's contents are not in a format this program understands.");
  const r = raw as Record<string, any>;
  const db = emptyDb(now);
  db.createdAt = Number(r.createdAt) || now;
  db.modifiedAt = Number(r.modifiedAt) || now;
  try {
    db.settings = normalizeSettings(r.settings);
  } catch {
    db.settings = { ...DEFAULT_SETTINGS };
  }
  db.audit = Array.isArray(r.audit) ? r.audit.filter((e: any) => e && typeof e.ev === "string").slice(-LIMITS.audit) : [];
  for (const [id, it] of Object.entries<any>(r.items ?? {})) {
    if (id === "__proto__" || id === "constructor" || id === "prototype") continue;
    if (!it || typeof it !== "object" || !isItemType(it.type)) continue;
    db.items[id] = {
      id, type: it.type, title: String(it.title ?? ""), favorite: it.favorite === true,
      tags: Array.isArray(it.tags) ? it.tags.map(String) : [], folder: String(it.folder ?? ""), notes: String(it.notes ?? ""),
      fields: Object.fromEntries(Object.entries(it.fields ?? {}).map(([k, v]) => [k, String(v)])),
      custom: Array.isArray(it.custom) ? it.custom.filter((c: any) => c && typeof c.id === "string").map((c: any) => ({ id: c.id, label: String(c.label ?? ""), kind: (CUSTOM_KINDS as readonly string[]).includes(c.kind) ? c.kind : "text", value: String(c.value ?? "") })) : [],
      history: Array.isArray(it.history) ? it.history.filter((h: any) => h && typeof h.value === "string").map((h: any) => ({ value: h.value, at: Number(h.at) || 0 })) : [],
      attachments: Array.isArray(it.attachments) ? it.attachments.filter((a: any) => a && typeof a.data === "string").map((a: any) => ({ id: String(a.id), name: String(a.name ?? "file"), size: Number(a.size) || 0, addedAt: Number(a.addedAt) || 0, data: a.data })) : [],
      createdAt: Number(it.createdAt) || now, modifiedAt: Number(it.modifiedAt) || now, pwChangedAt: Number(it.pwChangedAt) || Number(it.createdAt) || now,
      deletedAt: typeof it.deletedAt === "number" ? it.deletedAt : null,
    };
  }
  return db;
}
