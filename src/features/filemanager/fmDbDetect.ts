/**
 * Reads connection settings out of an environment view (real variables and `.env` files) the way each studio does,
 * and finds the connections a person has set up in their environment. It never connects to anything.
 */
import { promises as fsp } from "fs";
import { basename } from "path";
import { provenanceText, type EnvVar, type EnvView, type Provenance } from "./fmDbEnvView";
import { ENGINES, GENERIC_ENV, OTHER_ENV, STUDIO_ENV, connectionFingerprint, engineOfScheme, isEngineVariable, parseConnectionUrl, validHost, validPort, type DbEngine, type FieldName } from "./fmDbModel";

export interface FieldValue {
  value: string | number | boolean;
  /** The variable the value was read from (DATABASE_URL when it was part of an address). */
  name: string;
  prov: Provenance;
  viaUrl?: boolean;
}

export interface EnvConnection {
  engine: DbEngine;
  fields: Partial<Record<FieldName, FieldValue>>;
  /** Kept on the server: it is never put in a response. */
  password?: FieldValue;
  variables: string[];
  files: Array<{ file: string; where: Provenance["where"]; shown: string; loaded: boolean }>;
  /** Connection variables that are set but did not contribute (hidden by an address or another variable). */
  ignored: string[];
  warnings: string[];
  ambiguous: boolean;
  fingerprint: string;
  /** The set of variables the connection came from: the same slot with other values means "the environment changed". */
  slot: string;
  suggestedName: string;
  /** SQLite: whether the file exists (looked at with a stat, nothing is opened). */
  fileExists?: boolean;
}

export interface ReadOptions {
  /** Only the names the studio itself reads (used when working out what a studio would get). */
  studioOnly: boolean;
  /** Ignore values that are only written in a file and not really in the environment. */
  loadedOnly: boolean;
  /** With `loadedOnly`: also count a value written in a file the studio will itself load when it starts (Bun reads `.env` from the folder it starts in). */
  childLoads?: (p: Provenance) => boolean;
}

const GENERIC_URLS = ["DATABASE_URL", "DB_URL", "TLS_DATABASE_URL"];
const TRUE = new Set(["1", "true", "yes", "on", "require", "required", "verify-ca", "verify-full"]);
const FIELDS: FieldName[] = ["host", "port", "user", "database", "schema", "tls", "path", "dbIndex"];

/** What the environment gives one engine, field by field, using the studio's own order and its "address wins" rule. */
export function readEnvFields(engine: DbEngine, view: EnvView, opts: ReadOptions): { fields: EnvConnection["fields"]; password?: FieldValue; used: Set<string>; present: string[]; warnings: string[] } {
  const used = new Set<string>();
  const warnings: string[] = [];
  const names = (field: FieldName | "url"): string[] => {
    const list = [...(STUDIO_ENV[engine][field] ?? []), ...(opts.studioOnly ? [] : OTHER_ENV[engine][field] ?? [])];
    // Looking for connections (not working out what a studio reads), a generic address may hold any engine's connection: its scheme decides.
    if (field === "url" && !opts.studioOnly) for (const n of GENERIC_URLS) if (!list.includes(n)) list.push(n);
    return list;
  };
  const get = (n: string): EnvVar | undefined => {
    const v = view.vars.get(n);
    if (!v) return undefined;
    if (opts.loadedOnly && v.prov.kind === "file" && !v.prov.loaded && !opts.childLoads?.(v.prov)) return undefined;
    return v;
  };
  const present = [...view.vars.keys()].filter((n) => isEngineVariable(engine, n) && get(n));
  const fields: EnvConnection["fields"] = {};
  let password: FieldValue | undefined;

  // An address (MSQL_URL, DATABASE_URL, REDIS_URL ...) overrides the single variables, as in the studios.
  for (const n of names("url")) {
    const v = get(n);
    if (!v) continue;
    const scheme = engineOfScheme(v.value);
    const parsed = scheme === engine ? parseConnectionUrl(v.value) : null;
    if (!parsed || !parsed.ok) {
      if (scheme && scheme !== engine) warnings.push(`${n} is a ${ENGINES[scheme].label} address, so it isn't used for ${ENGINES[engine].label}.`);
      else if (parsed && !parsed.ok) warnings.push(`${n} isn't a valid address and was ignored.`);
      continue;
    }
    const u = parsed.value;
    used.add(n);
    const put = (f: FieldName, value: string | number | boolean | undefined) => {
      if (value !== undefined && fields[f] === undefined) fields[f] = { value, name: n, prov: v.prov, viaUrl: true };
    };
    put("host", u.host);
    put("port", u.port);
    put("user", u.user);
    put("database", u.database);
    put("schema", u.schema);
    put("tls", u.tls);
    put("path", u.path);
    put("dbIndex", u.dbIndex);
    if (u.password !== undefined) password = { value: u.password, name: n, prov: v.prov, viaUrl: true };
    break;
  }

  for (const field of FIELDS) {
    if (fields[field] !== undefined) continue;
    const candidates = names(field).map(get).filter((x): x is EnvVar => !!x);
    for (const v of candidates) {
      const text = v.value;
      let value: string | number | boolean | undefined;
      if (field === "port") {
        const p = /^\d{1,5}$/.test(text) ? Number(text) : NaN;
        if (validPort(p)) value = p;
        else {
          warnings.push(`${v.name} isn't a valid port number and was ignored.`);
          continue;
        }
      } else if (field === "dbIndex") {
        if (/^\d{1,2}$/.test(text) && Number(text) <= 15) value = Number(text);
        else {
          warnings.push(`${v.name} isn't a Redis database number from 0 to 15 and was ignored.`);
          continue;
        }
      } else if (field === "tls") value = v.name === "PGSSLMODE" ? TRUE.has(text.toLowerCase()) : TRUE.has(text.toLowerCase());
      else if (field === "host") {
        if (!validHost(text)) {
          warnings.push(`${v.name} isn't a valid host name and was ignored.`);
          continue;
        }
        value = text.toLowerCase();
      } else if (text === "") continue;
      else value = text;
      fields[field] = { value, name: v.name, prov: v.prov };
      used.add(v.name);
      // The same field set by several variables to different values: the first one wins, say so.
      const others = candidates.filter((c) => c !== v && c.value !== text);
      if (others.length) warnings.push(`${[v.name, ...others.map((o) => o.name)].join(", ")} disagree; ${v.name} is the one used.`);
      break;
    }
  }

  if (!password) {
    const pw = names("password").map(get).filter((x): x is EnvVar => !!x);
    if (pw.length) {
      password = { value: pw[0]!.value, name: pw[0]!.name, prov: pw[0]!.prov };
      used.add(pw[0]!.name);
    }
  }
  return { fields, password, used, present, warnings };
}

const SPECIFIC_IGNORED = new Set(["PG_STUDIO_PORT", "STUDIO_WORKER", "PG_STUDIO_DB", "MYSQL_STUDIO_DB", "PG_DB_PATH", "MYSQL_DB_PATH", "SQLITE_DB_PATH"]);
const generic = new Set(GENERIC_ENV);

const hostLabel = (f: EnvConnection["fields"], engine: DbEngine) => {
  if (engine === "sqlite") return basename(String(f.path?.value ?? "database"));
  const host = String(f.host?.value ?? "localhost");
  const db = engine === "redis" ? (f.dbIndex ? `/${f.dbIndex.value}` : "") : f.database ? `/${f.database.value}` : "";
  return `${host}${f.port ? `:${f.port.value}` : ""}${db}`;
};

/** The connections the environment describes: at most one per engine (MySQL, PostgreSQL, Redis, SQLite). */
export async function detectConnections(view: EnvView): Promise<EnvConnection[]> {
  const out: EnvConnection[] = [];
  const hasSpecific = (e: DbEngine) => [...view.vars.keys()].some((n) => isEngineVariable(e, n) && !generic.has(n) && !SPECIFIC_IGNORED.has(n));
  const urlSignal = (e: DbEngine) => ["DATABASE_URL", "DB_URL", "TLS_DATABASE_URL"].some((n) => view.vars.has(n) && engineOfScheme(view.vars.get(n)!.value) === e);
  const sqlRank = ["mysql", "postgres"] as DbEngine[];
  const genericOnly = !DB_SIGNAL_ENGINES.some((e) => hasSpecific(e) || urlSignal(e)) && [...view.vars.keys()].some((n) => generic.has(n) && !(view.vars.get(n)!.value.includes("://") && engineOfScheme(view.vars.get(n)!.value)));

  for (const engine of ["mysql", "postgres", "redis", "sqlite"] as DbEngine[]) {
    const signal = hasSpecific(engine) || urlSignal(engine) || (genericOnly && sqlRank.includes(engine));
    if (!signal) continue;
    const r = readEnvFields(engine, view, { studioOnly: false, loadedOnly: false });
    if (!FIELDS.some((f) => r.fields[f] !== undefined)) continue;
    const conn = finish(engine, r, view, genericOnly && sqlRank.includes(engine));
    if (engine === "sqlite") {
      const p = String(conn.fields.path?.value ?? "");
      conn.fileExists = p === ":memory:" ? true : await fsp.stat(p).then((s) => s.isFile(), () => false);
      if (!conn.fileExists) conn.warnings.push("That file doesn't exist (yet).");
    }
    out.push(conn);
  }
  return out;
}

const DB_SIGNAL_ENGINES: DbEngine[] = ["mysql", "postgres", "redis", "sqlite"];

function finish(engine: DbEngine, r: ReturnType<typeof readEnvFields>, view: EnvView, ambiguous: boolean): EnvConnection {
  const values = Object.values(r.fields).filter((x): x is FieldValue => !!x);
  const all = [...values, ...(r.password ? [r.password] : [])];
  const variables = [...new Set(all.map((x) => x.name))].sort();
  const files: EnvConnection["files"] = [];
  for (const x of all) {
    if (x.prov.kind !== "file") continue;
    if (!files.some((f) => f.file === x.prov.file && f.where === x.prov.where)) files.push({ file: x.prov.file!, where: x.prov.where, shown: x.prov.shown!, loaded: !!x.prov.loaded });
  }
  const f = r.fields;
  const fp = connectionFingerprint(engine, {
    host: f.host ? String(f.host.value) : undefined,
    port: f.port ? Number(f.port.value) : undefined,
    user: f.user ? String(f.user.value) : undefined,
    database: f.database ? String(f.database.value) : undefined,
    path: f.path ? String(f.path.value) : undefined,
    dbIndex: f.dbIndex ? Number(f.dbIndex.value) : undefined,
  });
  const warnings = [...r.warnings];
  if (ambiguous) warnings.push("Only generic DB_* names were found, so this could be MySQL or PostgreSQL. Save the one you use.");
  return {
    engine,
    fields: r.fields,
    password: r.password && String(r.password.value) !== "" ? r.password : undefined,
    variables,
    files,
    ignored: r.present.filter((n) => !r.used.has(n)).sort(),
    warnings,
    ambiguous,
    fingerprint: fp,
    slot: `${engine}:${variables.join(",")}`,
    suggestedName: hostLabel(r.fields, engine),
  };
}

/** A card for the page: every value the environment gave except the password, with where each one came from. */
export function publicConnection(c: EnvConnection) {
  const fields: Record<string, { value: string | number | boolean; name: string; source: string; loaded?: boolean; file?: string }> = {};
  for (const [k, v] of Object.entries(c.fields)) {
    if (v) fields[k] = { value: v.value, name: v.name, source: provenanceText(v.prov), ...(v.prov.kind === "file" ? { loaded: !!v.prov.loaded, file: v.prov.file } : {}) };
  }
  return {
    key: `${c.engine}:${c.fingerprint}`,
    engine: c.engine,
    label: ENGINES[c.engine].label,
    name: c.suggestedName,
    fields,
    password: c.password ? { present: true, name: c.password.name, source: provenanceText(c.password.prov) } : { present: false },
    variables: c.variables,
    files: c.files,
    ignored: c.ignored,
    warnings: c.warnings,
    ambiguous: c.ambiguous,
    fileExists: c.fileExists,
  };
}
