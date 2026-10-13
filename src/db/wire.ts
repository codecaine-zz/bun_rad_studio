import type { Param, WireValue } from "./types";

const INT_RE = /^[+-]?\d+$/;
const DECIMAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Convert a driver value to a JSON-safe value without losing precision or binary content. */
export function toWire(value: unknown): WireValue {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "bigint":
      return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
    case "object":
      break;
    default:
      return String(value);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array) return { $binary: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64") };
  if (value instanceof ArrayBuffer) return { $binary: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(toWire);
  const out: Record<string, WireValue> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toWire(v);
  return out;
}

export class ParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate a client-supplied typed parameter and convert it to the value handed to the driver. */
export function decodeParam(p: unknown, engine?: string): unknown {
  if (p === null || typeof p === "boolean" || typeof p === "string") return p;
  if (typeof p === "number") {
    if (!Number.isFinite(p)) throw new ParamError("Numeric parameter must be finite");
    return p;
  }
  if (!isRecord(p)) throw new ParamError("Parameter must be null, boolean, number, string or a tagged object");
  const keys = Object.keys(p);
  if (keys.length !== 1) throw new ParamError("Tagged parameter must have exactly one tag");
  const tag = keys[0]!;
  const v = p[tag];
  switch (tag) {
    case "$bigint":
      if (typeof v !== "string" || !INT_RE.test(v)) throw new ParamError("$bigint must be an integer string");
      return BigInt(v);
    case "$decimal":
      if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new ParamError("$decimal must be a decimal number string");
      return v;
    case "$binary":
      if (typeof v !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) throw new ParamError("$binary must be base64");
      return new Uint8Array(Buffer.from(v, "base64"));
    case "$date":
      if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new ParamError("$date must be an ISO date/time string");
      return v;
    case "$json":
      // Bun's PostgreSQL client serialises objects for json/jsonb parameters itself; other engines take JSON text.
      return engine === "postgres" && v !== null && typeof v === "object" ? v : JSON.stringify(v ?? null);
    default:
      throw new ParamError(`Unknown parameter tag ${tag}`);
  }
}

export function decodeParams(params: unknown[] | undefined, engine?: string): unknown[] {
  if (params === undefined) return [];
  if (!Array.isArray(params)) throw new ParamError("params must be an array");
  return params.map((p) => decodeParam(p, engine));
}

/**
 * Encode a value as an RFC 4180 CSV cell. NULL is written as an empty unquoted field and the empty
 * string as `""`, so the two stay distinguishable. Binary is written as base64.
 */
export function csvCell(value: WireValue): string {
  if (value === null) return "";
  if (value === "") return '""';
  const s = typeof value === "string" ? value : typeof value === "object" ? ("$binary" in (value as object) && !Array.isArray(value) ? (value as { $binary: string }).$binary : JSON.stringify(value)) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type { Param };
