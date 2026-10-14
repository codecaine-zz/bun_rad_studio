/**
 * The Secrets operations that work on items: list, get, reveal, copy, save, trash, one-time codes, the audit and breach
 * check, import and plain-text export, and attachments. List and get never return a secret value; `reveal` and `copy`
 * return or use exactly one field the person asked for.
 */
import { closeSync, fsyncSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { absolutePath, type FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { openCommand } from "./fmOpen";
import { optionalText, credsOf, newFilePath, secretsOp } from "./fmSecretsGuard";
import { breachCheck, healthReport } from "./fmSecretsHealth";
import { CSV_HEADER, MAX_IMPORT_BYTES, csvRow, importAny } from "./fmSecretsImport";
import { LIMITS, TYPE_FIELDS, buildItem, detailView, listView, secretValue, type SecretItem } from "./fmSecretsModel";
import type { SecretsService } from "./fmSecretsService";
import { parseTotp, totpAt } from "./fmSecretsTotp";

const items = (svc: SecretsService): SecretItem[] => Object.values(svc.requireSession().database().items);
const live = (svc: SecretsService): SecretItem[] => items(svc).filter((i) => i.deletedAt === null);

function find(svc: SecretsService, id: unknown): SecretItem {
  const item = typeof id === "string" ? svc.requireSession().database().items[id] : undefined;
  if (!item) throw new FmError("NOT_FOUND", "That item no longer exists.");
  return item;
}

function searchText(i: SecretItem): string {
  const plain = TYPE_FIELDS[i.type].filter((s) => !s.secret).map((s) => i.fields[s.key] ?? "");
  const custom = i.custom.flatMap((c) => [c.label, c.kind === "hidden" || c.kind === "otp" ? "" : c.value]);
  return [i.title, ...plain, ...i.tags, i.folder, ...custom, ...i.attachments.map((a) => a.name), i.notes].join("\n").toLowerCase();
}

/** The current one-time code for a field, as { code, secondsLeft, ... }. */
function codeFor(svc: SecretsService, item: SecretItem, field: unknown) {
  const f = field === undefined ? "totp" : field;
  const raw = secretValue(item, f);
  if (raw === null || raw === "") throw new FmError("BAD_TOTP", "There is no one-time code secret on this item yet.");
  const spec = parseTotp(raw);
  return { ...totpAt(spec, svc.hooks.now()), ...(spec.issuer ? { issuer: spec.issuer } : {}) };
}

const dedupeKey = (i: SecretItem): string => [i.type, i.title, i.fields.username ?? "", i.fields.url ?? "", i.fields.password ?? ""].join("\0");

const MAX_TEXT_IMPORT = 900_000;

export const itemOperations: Record<string, FmHandler> = {
  "secrets/list": secretsOp((svc, _ctx, b) => {
    const trash = b.trash === true;
    let rows = items(svc).filter((i) => (i.deletedAt !== null) === trash);
    if (typeof b.type === "string" && b.type) rows = rows.filter((i) => i.type === b.type);
    if (b.favorite === true) rows = rows.filter((i) => i.favorite);
    if (typeof b.tag === "string" && b.tag) rows = rows.filter((i) => i.tags.some((t) => t.toLowerCase() === (b.tag as string).toLowerCase()));
    if (typeof b.folder === "string" && b.folder) rows = rows.filter((i) => i.folder === b.folder || i.folder.startsWith(`${b.folder}/`));
    if (b.flagged === true) {
      const flagged = new Set(healthReport(live(svc), svc.hooks.now()).flagged);
      rows = rows.filter((i) => flagged.has(i.id));
    }
    const terms = typeof b.query === "string" ? b.query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8) : [];
    if (terms.length) rows = rows.filter((i) => { const hay = searchText(i); return terms.every((t) => hay.includes(t)); });
    const by = b.sort === "modified" || b.sort === "created" || b.sort === "type" ? b.sort : "title";
    const dir = b.dir === "desc" ? -1 : 1;
    rows.sort((x, y) => {
      if (b.favoritesFirst !== false && x.favorite !== y.favorite) return x.favorite ? -1 : 1;
      const c = by === "modified" ? y.modifiedAt - x.modifiedAt : by === "created" ? y.createdAt - x.createdAt : by === "type" ? x.type.localeCompare(y.type) : 0;
      return (c || x.title.localeCompare(y.title, undefined, { sensitivity: "base", numeric: true })) * (by === "title" ? dir : 1);
    });
    const offset = Math.max(0, Math.floor(Number(b.offset) || 0));
    const limit = Math.min(1000, Math.max(1, Math.floor(Number(b.limit) || 200)));
    return { total: rows.length, offset, items: rows.slice(offset, offset + limit).map(listView) };
  }),

  "secrets/facets": secretsOp((svc) => {
    const all = items(svc);
    const tags = new Map<string, number>();
    const folders = new Map<string, number>();
    const types: Record<string, number> = {};
    for (const i of all.filter((x) => x.deletedAt === null)) {
      for (const t of i.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
      if (i.folder) folders.set(i.folder, (folders.get(i.folder) ?? 0) + 1);
      types[i.type] = (types[i.type] ?? 0) + 1;
    }
    const sorted = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
    return { tags: sorted(tags), folders: sorted(folders), types, total: all.filter((x) => x.deletedAt === null).length, favorites: all.filter((x) => x.deletedAt === null && x.favorite).length, trash: all.filter((x) => x.deletedAt !== null).length };
  }),

  "secrets/get": secretsOp((svc, _ctx, b) => ({ item: detailView(find(svc, b.id)) })),

  /** The kinds of item and the fields each has (for the "New item" form). Nothing secret. */
  "secrets/types": secretsOp(() => ({ types: TYPE_FIELDS }), { touch: false }),

  "secrets/reveal": secretsOp((svc, _ctx, b) => {
    const value = secretValue(find(svc, b.id), b.field);
    if (value === null) throw new FmError("BAD_REQUEST", "That item has no such field.");
    return { value };
  }),

  "secrets/copy": secretsOp((svc, _ctx, b) => {
    const item = find(svc, b.id);
    const isCode = b.field === "totp" || (typeof b.field === "string" && b.field.startsWith("custom:") && item.custom.find((c) => c.id === (b.field as string).slice(7))?.kind === "otp");
    const value = isCode ? codeFor(svc, item, b.field).code : secretValue(item, b.field);
    if (value === null || value === "") throw new FmError("BAD_REQUEST", "There is nothing to copy in that field.");
    const seconds = svc.requireSession().database().settings.clipboardSeconds;
    if (!svc.copy(value, seconds)) throw new FmError("CLIPBOARD_FAILED", "Couldn't use the clipboard on this computer.");
    return { copied: true, clearsInSeconds: seconds > 0 ? seconds : null };
  }),

  "secrets/save": secretsOp((svc, _ctx, b) => {
    const s = svc.requireSession();
    const existing = b.id === undefined || b.id === null ? null : find(svc, b.id);
    if (existing?.deletedAt != null) throw new FmError("IN_TRASH", "That item is in the Trash. Restore it before changing it.");
    if (!existing && Object.keys(s.database().items).length >= LIMITS.items) throw new FmError("TOO_MANY", `A vault holds at most ${LIMITS.items.toLocaleString("en-US")} items. Delete some first.`);
    const item = buildItem(existing, b.item, svc.hooks.now());
    s.change((db) => { db.items[item.id] = item; });
    return { item: detailView(item) };
  }),

  "secrets/delete": secretsOp((svc, _ctx, b) => {
    const s = svc.requireSession();
    const item = find(svc, b.id);
    if (b.permanent === true) {
      if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Deleting for good needs your confirmation.");
      s.change((db) => { delete db.items[item.id]; });
    } else {
      if (item.deletedAt !== null) throw new FmError("IN_TRASH", "That item is already in the Trash.");
      s.change((db) => { db.items[item.id] = { ...item, deletedAt: svc.hooks.now() }; });
    }
    return {};
  }),

  "secrets/restore": secretsOp((svc, _ctx, b) => {
    const item = find(svc, b.id);
    svc.requireSession().change((db) => { db.items[item.id] = { ...item, deletedAt: null }; });
    return {};
  }),

  "secrets/empty-trash": secretsOp((svc, _ctx, b) => {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Emptying the Trash deletes those items for good. Please confirm.");
    let removed = 0;
    svc.requireSession().change((db) => {
      for (const i of Object.values(db.items)) if (i.deletedAt !== null) { delete db.items[i.id]; removed++; }
    });
    return { removed };
  }),

  "secrets/duplicate": secretsOp((svc, _ctx, b) => {
    const s = svc.requireSession();
    const src = find(svc, b.id);
    if (Object.keys(s.database().items).length >= LIMITS.items) throw new FmError("TOO_MANY", `A vault holds at most ${LIMITS.items.toLocaleString("en-US")} items. Delete some first.`);
    const now = svc.hooks.now();
    const copy: SecretItem = { ...src, id: randomUUID(), title: `${src.title} (copy)`.slice(0, LIMITS.title), history: [], fields: { ...src.fields }, tags: [...src.tags], custom: src.custom.map((c) => ({ ...c, id: randomUUID() })), attachments: src.attachments.map((a) => ({ ...a, id: randomUUID() })), createdAt: now, modifiedAt: now, pwChangedAt: now, deletedAt: null };
    s.change((db) => { db.items[copy.id] = copy; });
    return { item: detailView(copy) };
  }),

  "secrets/totp": secretsOp((svc, _ctx, b) => ({ ...codeFor(svc, find(svc, b.id), b.field) })),

  "secrets/health": secretsOp((svc, _ctx, b) => {
    const days = b.oldDays === undefined ? 365 : Number(b.oldDays);
    if (!Number.isInteger(days) || days < 30 || days > 3650) throw new FmError("BAD_REQUEST", "“Old” can be 30 to 3650 days.");
    return { report: healthReport(live(svc), svc.hooks.now(), days) };
  }),

  "secrets/breach": secretsOp(async (svc, _ctx, b) => {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "The breach check sends the first 5 characters of a fingerprint of each password to haveibeenpwned.com. Please confirm that you want that.");
    return { result: await breachCheck(live(svc), svc.hooks) };
  }),

  "secrets/import": secretsOp((svc, ctx, b) => {
    const s = svc.requireSession();
    const now = svc.hooks.now();
    if (b.commit === true) {
      const pending = s.pendingImport;
      if (!pending || pending.token !== b.token) throw new FmError("BAD_REQUEST", "That preview has expired. Choose the file again.");
      const fresh = pending.items as SecretItem[];
      if (Object.keys(s.database().items).length + fresh.length > LIMITS.items) throw new FmError("TOO_MANY", `That would be more than ${LIMITS.items.toLocaleString("en-US")} items, the most a vault holds.`);
      s.change((db) => {
        for (const i of fresh) db.items[i.id] = i;
        s.audit("import", fresh.length);
      });
      s.pendingImport = null;
      return { imported: fresh.length };
    }
    let text: string;
    if (typeof b.text === "string") {
      if (b.text.length > MAX_TEXT_IMPORT) throw new FmError("TOO_LARGE", "That text is too big to paste. Choose the file instead.");
      text = b.text;
    } else {
      const path = absolutePath(ctx, b.path);
      let size: number;
      try {
        const st = statSync(path);
        if (!st.isFile()) throw new Error("not a file");
        size = st.size;
      } catch {
        throw new FmError("BAD_PATH", "That file couldn't be read. Check the location.");
      }
      if (size > MAX_IMPORT_BYTES) throw new FmError("TOO_LARGE", `That file is too big to import (the limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`);
      text = readFileSync(path, "utf8");
    }
    const parsed = importAny(text, optionalText(b.format, "format"));
    const have = new Set(live(svc).map(dedupeKey));
    const fresh: SecretItem[] = [];
    let duplicates = 0;
    let skipped = 0;
    for (const input of parsed.items) {
      try {
        const item = buildItem(null, input, now);
        const key = dedupeKey(item);
        if (have.has(key)) duplicates++;
        else {
          have.add(key);
          fresh.push(item);
        }
      } catch {
        skipped++;
      }
    }
    const token = randomUUID();
    s.pendingImport = { token, items: fresh, dialect: parsed.dialect, warnings: parsed.warnings };
    return {
      token, dialect: parsed.dialect, count: fresh.length, duplicates, skipped, warnings: parsed.warnings,
      sample: fresh.slice(0, 8).map((i) => ({ title: i.title, subtitle: listView(i).subtitle, host: listView(i).host })),
    };
  }),

  "secrets/export-csv": secretsOp((svc, ctx, b) => svc.serial(async () => {
    const s = svc.requireSession();
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "A CSV export is NOT encrypted: anyone who gets the file can read every password. Please confirm.");
    (await svc.verify(s, credsOf(b)))?.fill(0);
    const path = newFilePath(ctx, b.path);
    const rows = [csvRow(CSV_HEADER)];
    const all = live(svc);
    for (const i of all) {
      const extra = i.type === "login" ? [] : TYPE_FIELDS[i.type].map((sp) => (i.fields[sp.key] ? `${sp.label}: ${i.fields[sp.key]}` : "")).filter(Boolean);
      const notes = [i.notes, ...extra, ...i.custom.map((c) => `${c.label}: ${c.value}`)].filter(Boolean).join("\n");
      rows.push(csvRow([i.title, i.fields.url ?? "", i.fields.username ?? "", i.fields.password ?? "", notes, i.fields.totp ?? "", i.type, i.folder, i.tags.join(";"), i.favorite ? "1" : "0"]));
    }
    const fd = openSync(path, "wx", 0o600);
    try {
      writeSync(fd, `${rows.join("\r\n")}\r\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    s.change(() => s.audit("export-csv", all.length));
    return { path, count: all.length, reminder: "This file is NOT encrypted. Open it only in a plain text editor, move it somewhere safe or import it where you need it, then delete it and empty your trash." };
  })),

  "secrets/attach": secretsOp((svc, ctx, b) => {
    const item = find(svc, b.id);
    const path = absolutePath(ctx, b.path);
    let size: number;
    try {
      const st = statSync(path);
      if (!st.isFile()) throw new Error("not a file");
      size = st.size;
    } catch {
      throw new FmError("BAD_PATH", "That file couldn't be read. Check the location.");
    }
    if (size > LIMITS.attachmentBytes) throw new FmError("TOO_LARGE", "Attachments can be at most 1 MB each.");
    if (item.attachments.length >= LIMITS.attachmentsPerItem) throw new FmError("TOO_MANY", `An item can have at most ${LIMITS.attachmentsPerItem} attachments.`);
    const total = items(svc).reduce((n, i) => n + i.attachments.reduce((m, a) => m + a.size, 0), 0);
    if (total + size > LIMITS.attachmentsTotal) throw new FmError("TOO_LARGE", "The vault's attachments can total at most 10 MB.");
    const data = readFileSync(path);
    const next: SecretItem = { ...item, modifiedAt: svc.hooks.now(), attachments: [...item.attachments, { id: randomUUID(), name: basename(path).slice(0, 200), size: data.length, addedAt: svc.hooks.now(), data: data.toString("base64") }] };
    svc.requireSession().change((db) => { db.items[item.id] = next; });
    return { item: detailView(next) };
  }),

  "secrets/save-attachment": secretsOp((svc, ctx, b) => {
    const att = find(svc, b.id).attachments.find((a) => a.id === b.attachmentId);
    if (!att) throw new FmError("NOT_FOUND", "That attachment no longer exists.");
    const path = newFilePath(ctx, b.path);
    const fd = openSync(path, "wx", 0o600);
    try {
      writeSync(fd, Buffer.from(att.data, "base64"));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return { path };
  }),

  "secrets/remove-attachment": secretsOp((svc, _ctx, b) => {
    const item = find(svc, b.id);
    if (!item.attachments.some((a) => a.id === b.attachmentId)) throw new FmError("NOT_FOUND", "That attachment no longer exists.");
    const next: SecretItem = { ...item, modifiedAt: svc.hooks.now(), attachments: item.attachments.filter((a) => a.id !== b.attachmentId) };
    svc.requireSession().change((db) => { db.items[item.id] = next; });
    return { item: detailView(next) };
  }),

  "secrets/open-url": secretsOp(async (svc, ctx, b) => {
    const item = find(svc, b.id);
    const raw = (item.fields.url ?? item.fields.endpoint ?? "").trim();
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new FmError("BAD_URL", "That address isn't a valid web address.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FmError("BAD_URL", "Only web addresses starting with http:// or https:// can be opened from here.");
    const { command, args } = openCommand(ctx.platform, url.href);
    try {
      await ctx.launch(command, args);
    } catch {
      throw new FmError("OPEN_FAILED", "Couldn't open your web browser.");
    }
    return { opened: url.hostname };
  }),
};
