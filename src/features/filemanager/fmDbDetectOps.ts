/**
 * Finding database connections in the environment (and in a `.env` file the person points at), and saving them to
 * the manager. Nothing here connects to a database, and nothing returns or logs a value that is a password.
 *
 * Only places that belong to the application are looked at on their own: the folder it was started in and its
 * install folder (see fmDbEnvView.ts). Any other `.env` file is read only when the person chooses it.
 */
import { basename, dirname } from "path";
import type { ConnectionProfile } from "../../db/profiles";
import { absolutePath, type FmContext, type FmHandler } from "./fmCore";
import { isObject } from "./fmDbCommon";
import { detectConnections, publicConnection, type EnvConnection } from "./fmDbDetect";
import { expandValue, parseDotenv, readDotenvFile } from "./fmDbDotenv";
import { tilde, provenanceText, type EnvVar, type EnvView } from "./fmDbEnvView";
import { ENGINES, isAnyConnectionVariable, type DbEngine } from "./fmDbModel";
import { checkSqlitePath, dbState, envView, guarded, profileFingerprint, sameSecret } from "./fmDbState";
import type { DbProfile, ProfileMeta, PublicDbProfile, RedisProfile } from "./fmDbStore";
import { FmError } from "./fmPaths";

export type CardStatus = "new" | "changed" | "saved" | "dismissed" | "snoozed";

export interface Card extends ReturnType<typeof publicConnection> {
  status: CardStatus;
  profileId?: string;
  profileName?: string;
  /** For "changed": what differs, field by field (the password only as a yes/no). */
  diff?: Array<{ field: string; saved: string; now: string }>;
  passwordChanged?: boolean;
}

const keyOf = (c: EnvConnection) => `${c.engine}:${c.fingerprint}`;

function savedValues(p: DbProfile): Record<string, string> {
  const out: Record<string, string> = {};
  const c = p as unknown as Record<string, any>;
  if (p.engine === "sqlite") out.path = String(c.path ?? "");
  else {
    out.host = c.host ?? "";
    out.port = String(c.port ?? ENGINES[p.engine as DbEngine].defaultPort ?? "");
    out.user = c.user ?? "";
    if (p.engine === "redis") out.dbIndex = String(c.dbIndex ?? 0);
    else out.database = c.database ?? "";
    if (p.engine === "postgres") out.schema = c.schema ?? "";
    out.tls = c.tls ? "on" : "off";
  }
  return out;
}

function nowValues(c: EnvConnection): Record<string, string> {
  const f = c.fields;
  const out: Record<string, string> = {};
  const take = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = String(v);
  };
  take("path", f.path?.value);
  take("host", f.host?.value);
  take("port", f.port?.value ?? (f.host || f.user ? ENGINES[c.engine].defaultPort : undefined));
  take("user", f.user?.value);
  take("database", f.database?.value);
  take("dbIndex", f.dbIndex?.value);
  take("schema", f.schema?.value);
  if (f.tls) out.tls = f.tls.value ? "on" : "off";
  return out;
}

/** The detected connections, each marked new, changed since it was saved, already saved, or put aside by the person. */
export async function annotate(ctx: FmContext, conns: EnvConnection[]): Promise<Card[]> {
  const st = dbState(ctx);
  const settings = st.store.getSettings();
  const profiles = st.store.listPlain();
  const cards: Card[] = [];
  for (const c of conns) {
    const key = keyOf(c);
    const card: Card = { ...publicConnection(c), status: "new" };
    const sameSlot = profiles.find((p) => settings.meta[p.id]?.slot === c.slot);
    const sameWhere = profiles.find((p) => p.engine === c.engine && profileFingerprint(p) === c.fingerprint);
    if (sameSlot) {
      const saved = savedValues(sameSlot);
      const now = nowValues(c);
      const diff = Object.keys(now).filter((k) => saved[k] !== undefined && saved[k] !== now[k]).map((k) => ({ field: k, saved: saved[k]!, now: now[k]! }));
      let passwordChanged = false;
      if (c.password) passwordChanged = !sameSecret(st, String(c.password.value), await st.store.password(sameSlot.id));
      Object.assign(card, { profileId: sameSlot.id, profileName: sameSlot.name });
      if (diff.length || passwordChanged) Object.assign(card, { status: "changed", diff, passwordChanged });
      else card.status = "saved";
    } else if (sameWhere) {
      Object.assign(card, { status: "saved", profileId: sameWhere.id, profileName: sameWhere.name });
    } else if (settings.dismissed.includes(key)) card.status = "dismissed";
    else if (st.snoozed.has(key)) card.status = "snoozed";
    cards.push(card);
  }
  return cards;
}

function uniqueName(existing: DbProfile[], wanted: string): string {
  const taken = new Set(existing.map((p) => p.name));
  let name = wanted.slice(0, 80);
  for (let n = 2; taken.has(name); n++) name = `${wanted.slice(0, 74)} (${n})`;
  return name;
}

/** Saves one detected connection to the manager (the password to the keychain). Saving the same one twice changes nothing. */
export async function saveDetected(ctx: FmContext, conn: EnvConnection, view: EnvView, source: "detected" | "envfile"): Promise<{ profile: PublicDbProfile; already: boolean; noLongerNeeded: Array<{ name: string; origin: string }> }> {
  const st = dbState(ctx);
  const existing = st.store.listPlain().find((p) => p.engine === conn.engine && profileFingerprint(p) === conn.fingerprint);
  const needed = (names: string[]) => names.flatMap((n) => (view.vars.has(n) ? [{ name: n, origin: provenanceText(view.vars.get(n)!.prov) }] : []));
  if (existing) {
    const list = await st.store.list();
    return { profile: list.find((p) => p.id === existing.id)!, already: true, noLongerNeeded: source === "detected" ? needed(conn.variables) : [] };
  }
  const f = conn.fields;
  const input: Record<string, any> = {
    engine: conn.engine,
    name: uniqueName(st.store.listPlain(), `${ENGINES[conn.engine].label}: ${conn.suggestedName}`),
    folder: "From environment",
    tags: [],
    favorite: false,
    environment: "development",
    readOnly: false,
  };
  if (conn.engine === "sqlite") {
    const path = String(f.path?.value ?? "");
    const memory = path === ":memory:";
    input.sqliteMode = memory ? "memory" : conn.fileExists ? "readwrite" : "create";
    input.path = await checkSqlitePath(ctx, memory ? ":memory:" : path, input.sqliteMode);
  } else {
    input.host = f.host ? String(f.host.value) : "localhost";
    if (f.port) input.port = Number(f.port.value);
    if (f.user) input.user = String(f.user.value);
    if (conn.engine === "redis") {
      if (f.dbIndex) input.dbIndex = Number(f.dbIndex.value);
    } else {
      if (f.database) input.database = String(f.database.value);
      if (f.schema && conn.engine === "postgres") input.schema = String(f.schema.value);
    }
    if (f.tls) input.tls = Boolean(f.tls.value);
  }
  const password = conn.password && String(conn.password.value) !== "" ? String(conn.password.value) : undefined;
  const saved = await guarded(() => st.store.save(input, password));
  const allFiles = conn.files.length > 0 && conn.variables.every((n) => view.vars.get(n)?.prov.kind === "file");
  const meta: ProfileMeta = { source: source === "envfile" ? "envfile" : allFiles ? "dotenv" : "environment", variables: source === "envfile" ? [] : conn.variables, slot: source === "envfile" ? undefined : conn.slot, fingerprint: conn.fingerprint, savedAt: new Date().toISOString() };
  st.store.setMeta(saved.id, meta);
  return { profile: { ...saved, meta }, already: false, noLongerNeeded: source === "detected" ? needed(conn.variables) : [] };
}

const wanted = (b: Record<string, any>) => (typeof b.key === "string" && /^[a-z]+:[0-9a-f]{16}$/.test(b.key) ? (b.key as string) : null);

/** A view that contains only what one chosen file says (nothing from this program's own environment). */
async function viewOfFile(ctx: FmContext, input: unknown): Promise<{ view: EnvView; name: string; shown: string; count: number }> {
  const path = absolutePath(ctx, input);
  const name = basename(path);
  if (!/^\.env(\.[A-Za-z0-9_.-]+)?$|\.env$/.test(name)) throw new FmError("BAD_REQUEST", "Choose a file named .env, .env.local, .env.production ... or ending in .env.");
  const read = await readDotenvFile(path);
  if (!read) throw new FmError("NOT_FOUND", "That file doesn't exist.");
  if ("skipped" in read) {
    const why = { link: "That is a link, and links are not followed.", "not-a-file": "That isn't a file.", "too-big": "That file is too big for a settings file (over 256 KB).", binary: "That doesn't look like a text file.", unreadable: "That file couldn't be read." }[read.skipped];
    throw new FmError("BAD_FILE", why);
  }
  const defined = new Map<string, string>();
  const entries = parseDotenv(read.text);
  const shown = tilde(dirname(path), ctx.home);
  const vars = new Map<string, EnvVar>();
  for (const e of entries) {
    const value = expandValue(e.raw, e.quote, (n) => defined.get(n));
    defined.set(e.name, value);
    if (isAnyConnectionVariable(e.name)) vars.set(e.name, { name: e.name, value, prov: { kind: "file", variable: e.name, file: name, where: "chosen", shown: `${shown}/${name}`, loaded: true } });
  }
  return { view: { vars, files: [{ file: name, where: "start", shown, count: entries.length }], nodeEnv: "" }, name, shown, count: entries.length };
}

export const detectOperations: Record<string, FmHandler> = {
  async "db/detect"(ctx, b) {
    const st = dbState(ctx);
    const settings = st.store.getSettings();
    const manual = b.manual === true;
    if (!settings.detect.auto && !manual) return { enabled: false, autoSave: settings.detect.autoSave, cards: [], files: [], dismissed: 0, announce: false, autoSaved: [] };
    const view = await envView(ctx);
    const conns = await detectConnections(view);
    let cards = await annotate(ctx, conns);
    const autoSaved: Array<{ engine: DbEngine; name: string }> = [];
    if (settings.detect.autoSave && !manual) {
      for (const card of cards.filter((c) => c.status === "new")) {
        const conn = conns.find((c) => keyOf(c) === card.key)!;
        try {
          const r = await saveDetected(ctx, conn, view, "detected");
          autoSaved.push({ engine: conn.engine, name: r.profile.name });
        } catch {
          // a connection that can't be saved (a protected file, say) is simply left as a card
        }
      }
      if (autoSaved.length) cards = await annotate(ctx, conns);
    }
    const shown = manual ? cards : cards.filter((c) => c.status === "new" || c.status === "changed");
    const announce = !st.announced && cards.some((c) => c.status === "new" || c.status === "changed") && b.quiet === true;
    if (b.quiet === true && announce) st.announced = true;
    return { enabled: true, autoSave: settings.detect.autoSave, cards: shown, files: view.files, nodeEnv: view.nodeEnv, dismissed: cards.filter((c) => c.status === "dismissed").length, announce, autoSaved };
  },

  async "db/detect/save"(ctx, b) {
    const key = wanted(b);
    if (!key) throw new FmError("BAD_REQUEST", "That isn't a detected connection.");
    const view = await envView(ctx);
    const conn = (await detectConnections(view)).find((c) => keyOf(c) === key);
    if (!conn) throw new FmError("NOT_FOUND", "That connection isn't in your environment any more.");
    return await saveDetected(ctx, conn, view, "detected");
  },

  async "db/detect/dismiss"(ctx, b) {
    const key = wanted(b);
    if (!key) throw new FmError("BAD_REQUEST", "That isn't a detected connection.");
    const st = dbState(ctx);
    if (b.forever === true) st.store.dismiss(key);
    else st.snoozed.add(key);
    return { key, forever: b.forever === true };
  },

  async "db/detect/restore"(ctx) {
    const st = dbState(ctx);
    st.store.undismissAll();
    st.snoozed.clear();
    return { restored: true };
  },

  async "db/detect/settings"(ctx, b) {
    const st = dbState(ctx);
    return { detect: st.store.setDetect({ auto: b.auto, autoSave: b.autoSave }) };
  },

  async "db/detect/update"(ctx, b) {
    const st = dbState(ctx);
    const profile = typeof b.id === "string" ? st.store.get(b.id) : undefined;
    const meta = profile ? st.store.getSettings().meta[profile.id] : undefined;
    if (!profile || !meta?.slot) throw new FmError("NOT_FOUND", "That connection wasn't made from the environment.");
    const view = await envView(ctx);
    const conn = (await detectConnections(view)).find((c) => c.slot === meta.slot);
    if (!conn) throw new FmError("NOT_FOUND", "Those environment variables are gone, so there is nothing to update from.");
    const f = conn.fields;
    const input: Record<string, any> = { ...profile };
    if (conn.engine === "sqlite") {
      if (f.path) input.path = await checkSqlitePath(ctx, String(f.path.value), input.sqliteMode ?? "readwrite");
    } else {
      if (f.host) input.host = String(f.host.value);
      if (f.port) input.port = Number(f.port.value);
      if (f.user) input.user = String(f.user.value);
      if (conn.engine === "redis") {
        if (f.dbIndex) input.dbIndex = Number(f.dbIndex.value);
      } else if (f.database) input.database = String(f.database.value);
      if (f.schema && conn.engine === "postgres") input.schema = String(f.schema.value);
      if (f.tls) input.tls = Boolean(f.tls.value);
    }
    const password = conn.password && String(conn.password.value) !== "" ? String(conn.password.value) : undefined;
    const saved = await guarded(() => st.store.save(input, password, profile.id));
    const next: ProfileMeta = { ...meta, fingerprint: conn.fingerprint, savedAt: new Date().toISOString() };
    st.store.setMeta(profile.id, next);
    return { profile: { ...saved, meta: next } };
  },

  async "db/envfile/preview"(ctx, b) {
    if (!isObject(b)) throw new FmError("BAD_REQUEST", "No file was given.");
    const { view, name, shown, count } = await viewOfFile(ctx, b.path);
    const cards = await annotate(ctx, await detectConnections(view));
    return { file: { name, shown, count }, cards };
  },

  async "db/envfile/import"(ctx, b) {
    const key = wanted(b);
    if (!key) throw new FmError("BAD_REQUEST", "That isn't a connection from the file.");
    const { view } = await viewOfFile(ctx, b.path);
    const conn = (await detectConnections(view)).find((c) => keyOf(c) === key);
    if (!conn) throw new FmError("NOT_FOUND", "That connection isn't in the file any more.");
    // Nothing is written until this call, and the file itself is never changed.
    return await saveDetected(ctx, conn, view, "envfile");
  },
};
