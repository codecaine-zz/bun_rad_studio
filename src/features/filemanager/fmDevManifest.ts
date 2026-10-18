/**
 * Small, forgiving readers for project manifests: a size-capped text read, a "TOML-lite" parser (enough for Cargo.toml
 * and pyproject.toml: sections, strings, numbers, booleans, arrays) and license detection from license text.
 * Nothing here runs a manifest or leaves the folder.
 */
import { MAX_MANIFEST_BYTES, readManifestText } from "./fmDevRead";

export { MAX_MANIFEST_BYTES };
export const readText = readManifestText;

type TomlValue = string | number | boolean | string[];

function stripComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

function scalar(raw: string): string | number | boolean {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function splitList(body: string): string[] {
  const items: string[] = [];
  let cur = "";
  let quote = "";
  let depth = 0;
  for (const c of body) {
    if (quote) {
      cur += c;
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === "[" || c === "{") {
      depth++;
      cur += c;
    } else if (c === "]" || c === "}") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      if (cur.trim()) items.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

/** Sections by dotted name (`[tool.poetry.dependencies]` -> "tool.poetry.dependencies"), each a map of key -> value. Never throws. */
export function parseTomlLite(text: string): Record<string, Record<string, TomlValue>> {
  const out: Record<string, Record<string, TomlValue>> = { "": {} };
  let section = "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && i < 20_000; i++) {
    const line = stripComment(lines[i]!).trim();
    if (!line) continue;
    const head = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (head) {
      section = head[1]!.replace(/\s*\.\s*/g, ".").replace(/"/g, "");
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, "");
    let value = line.slice(eq + 1).trim();
    if (value.startsWith("[") && !value.endsWith("]")) {
      // an array that continues on the next lines
      while (i + 1 < lines.length && !value.endsWith("]") && value.length < 20_000) value += ` ${stripComment(lines[++i]!).trim()}`;
    }
    const table = out[section] ?? (out[section] = {});
    if (value.startsWith("[") && value.endsWith("]")) table[key] = splitList(value.slice(1, -1)).map((s) => String(scalar(s)));
    else if (value.startsWith("{")) table[key] = value;
    else table[key] = scalar(value);
  }
  return out;
}

const LICENSES: Array<[string, (t: string) => boolean]> = [
  ["AGPL-3.0", (t) => t.includes("gnu affero general public license")],
  ["LGPL-3.0", (t) => t.includes("gnu lesser general public license") && t.includes("version 3")],
  ["LGPL-2.1", (t) => t.includes("gnu lesser general public license") || t.includes("gnu library general public license")],
  ["GPL-3.0", (t) => t.includes("gnu general public license") && t.includes("version 3")],
  ["GPL-2.0", (t) => t.includes("gnu general public license") && t.includes("version 2")],
  ["Apache-2.0", (t) => t.includes("apache license") && t.includes("version 2.0")],
  ["MPL-2.0", (t) => t.includes("mozilla public license") && t.includes("2.0")],
  ["EPL-2.0", (t) => t.includes("eclipse public license")],
  ["BSL-1.0", (t) => t.includes("boost software license")],
  ["CC0-1.0", (t) => t.includes("cc0 1.0 universal")],
  ["Unlicense", (t) => t.includes("free and unencumbered software released into the public domain")],
  ["ISC", (t) => t.includes("permission to use, copy, modify, and/or distribute this software for any purpose with or without fee")],
  ["MIT", (t) => t.includes("permission is hereby granted, free of charge")],
  ["BSD-3-Clause", (t) => t.includes("redistribution and use in source and binary forms") && /neither the name|endorse or promote/.test(t)],
  ["BSD-2-Clause", (t) => t.includes("redistribution and use in source and binary forms")],
  ["Zlib", (t) => t.includes("altered source versions must be plainly marked")],
  ["WTFPL", (t) => t.includes("do what the fuck you want to")],
];

/** The short SPDX-style name of a license text (MIT, Apache-2.0, GPL-3.0 ...), or null when it isn't one we know. */
export function detectLicense(text: string): string | null {
  const t = text.slice(0, 40_000).toLowerCase().replace(/\s+/g, " ");
  return LICENSES.find(([, test]) => test(t))?.[0] ?? null;
}
