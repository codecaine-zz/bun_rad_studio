// Feature: RAD - tomlutils
// High-performance TOML parsing and serialization powered natively by Bun.TOML (C++/Zig engine)
// See: https://bun.sh/docs/runtime/toml

declare module "bun" {
  namespace TOML {
    function stringify(data: any): string;
  }
}

// Doer: Parse TOML configuration text into JavaScript object using native Bun.TOML.parse
export function parseToml<T = Record<string, any>>(content: string): T {
  return Bun.TOML.parse(content) as T;
}

// Doer: Serialize JavaScript object into TOML string using native Bun.TOML.stringify
export function stringifyToml(data: unknown): string {
  return Bun.TOML.stringify(data as any);
}

// Coordinator: Load and parse TOML file asynchronously using Bun.file and native Bun.TOML.parse
export async function loadToml<T = Record<string, any>>(filePath: string, fallback?: T): Promise<T> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      if (fallback !== undefined) return fallback;
      throw new Error(`[tomlutils] TOML file not found: ${filePath}`);
    }
    const text = await file.text();
    return Bun.TOML.parse(text) as T;
  } catch (err: any) {
    if (fallback !== undefined) return fallback;
    throw new Error(`[tomlutils] Failed to load TOML from ${filePath}: ${err.message}`);
  }
}

// Coordinator: Serialize and write data to TOML file asynchronously using native Bun.TOML.stringify and Bun.write
export async function saveToml(filePath: string, data: unknown): Promise<number> {
  const content = Bun.TOML.stringify(data as any);
  return await Bun.write(filePath, content);
}

// Doer: Resolve nested path like "server.port" from document
function resolveKeyPath(doc: Record<string, any>, keyPath: string): any {
  if (!doc || typeof doc !== "object") return undefined;
  const parts = keyPath.split(".");
  let cur: any = doc;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

// Doer: Typed string accessor
export function getString(doc: Record<string, any>, keyPath: string, fallback = ""): string {
  const val = resolveKeyPath(doc, keyPath);
  return val !== undefined ? String(val) : fallback;
}

// Doer: Typed integer accessor
export function getInt(doc: Record<string, any>, keyPath: string, fallback = 0): number {
  const val = resolveKeyPath(doc, keyPath);
  if (typeof val === "number") return Math.floor(val);
  if (typeof val === "string") {
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

// Doer: Typed boolean accessor
export function getBool(doc: Record<string, any>, keyPath: string, fallback = false): boolean {
  const val = resolveKeyPath(doc, keyPath);
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  return fallback;
}

// Doer: Typed array accessor
export function getArray<T = any>(doc: Record<string, any>, keyPath: string, fallback: T[] = []): T[] {
  const val = resolveKeyPath(doc, keyPath);
  return Array.isArray(val) ? (val as T[]) : fallback;
}

export const tomlutils = {
  parse: Bun.TOML.parse,
  stringify: Bun.TOML.stringify,
  parseToml,
  stringifyToml,
  loadToml,
  saveToml,
  getString,
  getInt,
  getBool,
  getArray,
};
