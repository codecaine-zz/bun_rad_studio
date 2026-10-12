/**
 * Pure helpers for Redis Studio: dangerous-command detection, export-document
 * validation, delete-pattern safety and export file naming. No network access.
 */

export const REDIS_EXPORT_VERSION = 1;
export const REDIS_EXPORTABLE_TYPES = ["string", "hash", "list", "set", "zset"] as const;
export type RedisExportableType = (typeof REDIS_EXPORTABLE_TYPES)[number];

export interface RedisExportKey {
  key: string;
  type: RedisExportableType;
  /** Seconds to live, or -1 for persistent. */
  ttl: number;
  value: any;
}

export interface RedisExportDoc {
  format: "redis-studio-export";
  version: number;
  db: number;
  exportedAt: string;
  keys: RedisExportKey[];
  skipped?: number;
}

const DANGEROUS = new Set(["FLUSHALL", "FLUSHDB", "SHUTDOWN", "DEBUG", "SLAVEOF", "REPLICAOF", "ACL", "MODULE", "BGREWRITEAOF"]);

/** True for commands that can destroy data or reconfigure the server (asks the user to confirm). */
export function isDangerousCommand(line: string): boolean {
  const tokens = (line || "").trim().split(/\s+/);
  const cmd = (tokens[0] || "").toUpperCase();
  if (DANGEROUS.has(cmd)) return true;
  if (cmd === "CONFIG" && /^(SET|REWRITE|RESETSTAT)$/i.test(tokens[1] || "")) return true;
  return false;
}

/** Validates a bulk-delete glob. Rejects empty patterns; flags "match everything". */
export function normalizeDeletePattern(raw: string): { ok: boolean; pattern: string; matchesAll: boolean; error?: string } {
  const pattern = (raw || "").trim();
  if (!pattern) return { ok: false, pattern, matchesAll: false, error: "A key pattern is required (e.g. session:*)" };
  return { ok: true, pattern, matchesAll: /^\*+$/.test(pattern) };
}

export function exportFileName(db: number, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `redis_export_db${db}_${stamp}.json`;
}

function validValue(type: string, value: any): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "hash": return !!value && typeof value === "object" && !Array.isArray(value);
    case "list":
    case "set": return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "zset": return Array.isArray(value) && value.every((v) => v && typeof v.member === "string" && Number.isFinite(Number(v.score)));
    default: return false;
  }
}

/** Parses/validates an export document (object or JSON text). */
export function validateExportDoc(input: unknown): { ok: boolean; doc?: RedisExportDoc; errors: string[] } {
  const errors: string[] = [];
  let doc: any = input;
  if (typeof input === "string") {
    try { doc = JSON.parse(input); } catch (e: any) { return { ok: false, errors: [`Invalid JSON: ${e.message}`] }; }
  }
  if (!doc || typeof doc !== "object") return { ok: false, errors: ["Export document must be a JSON object"] };
  if (doc.format !== "redis-studio-export") errors.push("Not a Redis Studio export file (missing format marker)");
  if (!Array.isArray(doc.keys)) errors.push("Missing 'keys' array");
  if (errors.length) return { ok: false, errors };
  const keys: RedisExportKey[] = [];
  doc.keys.forEach((k: any, i: number) => {
    if (!k || typeof k.key !== "string" || !k.key) { errors.push(`keys[${i}]: missing key name`); return; }
    if (!(REDIS_EXPORTABLE_TYPES as readonly string[]).includes(k.type)) { errors.push(`keys[${i}] '${k.key}': unsupported type '${k.type}'`); return; }
    if (!validValue(k.type, k.value)) { errors.push(`keys[${i}] '${k.key}': invalid ${k.type} value`); return; }
    keys.push({ key: k.key, type: k.type, ttl: Number.isFinite(Number(k.ttl)) ? Number(k.ttl) : -1, value: k.value });
  });
  return { ok: errors.length === 0, doc: { ...doc, keys }, errors };
}
