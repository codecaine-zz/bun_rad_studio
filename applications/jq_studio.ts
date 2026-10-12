import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  validateJson, formatJson, minifyJson, sortKeysDeep, indentFrom, jsonToCsv, csvToJson, jsonToYaml, jsonStats, searchJson,
} from "../src/json_tools";

const DEFAULT_SAMPLE_JSON = JSON.stringify(
  {
    status: "success",
    project: "Bun RAD Studio",
    version: "2.0.0",
    author: {
      name: "Alex",
      github: "https://github.com/codecaine-zz/bun_rad_studio",
      active: true,
    },
    metrics: {
      stars: 4800,
      forks: 350,
      open_issues: 0,
      license: "MIT",
    },
    modules: [
      { name: "simplegui", lines: 3900, status: "stable", priority: 1 },
      { name: "simplecli", lines: 4500, status: "stable", priority: 2 },
      { name: "applications", lines: 2800, status: "stable", priority: 3 },
      { name: "designer", lines: 1200, status: "preview", priority: 4 },
    ],
    tags: ["bun", "typescript", "native-mac", "cocoa", "reactive", "responsive"],
  },
  null,
  2
);

/** Split on a top-level separator, ignoring occurrences inside quotes, (), [] or {}. */
function splitTopLevel(q: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && q.startsWith(sep, i)) { out.push(q.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  out.push(q.slice(start));
  return out;
}

function parseLiteral(s: string): any {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t !== "" && !Number.isNaN(Number(t))) return Number(t);
  throw new Error(`Cannot parse value: ${s}`);
}

/** Evaluate a select()/any()/all() condition against one item: comparisons, contains/test/startswith/endswith, truthiness. */
function evalCondition(item: any, cond: string): boolean {
  const c = cond.trim();
  const andParts = splitTopLevel(c, " and ");
  if (andParts.length > 1) return andParts.every((p) => evalCondition(item, p));
  const orParts = splitTopLevel(c, " or ");
  if (orParts.length > 1) return orParts.some((p) => evalCondition(item, p));
  const cmpM = c.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (cmpM && cmpM[1]!.trim().startsWith(".")) {
    const left = evaluateBunJsonQuery(item, cmpM[1]!.trim());
    const right = parseLiteral(cmpM[3]!);
    switch (cmpM[2]) {
      case "==": return left === right;
      case "!=": return left !== right;
      case ">": return left > right;
      case "<": return left < right;
      case ">=": return left >= right;
      default: return left <= right;
    }
  }
  if (c.startsWith("not ") ) return !evalCondition(item, c.slice(4));
  const v = evaluateBunJsonQuery(item, c);
  return v !== null && v !== undefined && v !== false;
}

/**
 * Pure Bun / TypeScript JSON Query Engine
 * Zero Homebrew CLI dependency: evaluates standard jq query syntax and expressions natively
 */
export function evaluateBunJsonQuery(jsonVal: any, query: string): any {
  const q = query.trim();
  if (!q || q === ".") return jsonVal;

  // JavaScript function / expression mode: "$..." or contains "=>"
  if (q.startsWith("$") || q.includes("=>")) {
    const fn = new Function("$", `return (${q});`);
    return fn(jsonVal);
  }

  // Handle pipeline splits (e.g. .modules | map(.name)) -- ignores pipes inside quotes / parentheses
  const stages = splitTopLevel(q, " | ");
  if (stages.length > 1) {
    let current = jsonVal;
    for (const stage of stages) {
      current = evaluateBunJsonQuery(current, stage.trim());
    }
    return current;
  }

  // Alternative operator: .a // "default"
  const alt = splitTopLevel(q, " // ");
  if (alt.length > 1) {
    for (const part of alt.slice(0, -1)) {
      let v: any = null;
      try { v = evaluateBunJsonQuery(jsonVal, part); } catch { v = null; }
      if (v !== null && v !== undefined && v !== false) return v;
    }
    return evaluateBunJsonQuery(jsonVal, alt[alt.length - 1]!);
  }

  // Literals
  if (/^-?\d+(\.\d+)?$/.test(q) || q === "true" || q === "false" || q === "null" || /^"[^"]*"$/.test(q)) return parseLiteral(q);

  // String / array helpers taking one string argument: contains("x"), startswith("x"), test("re"), split(","), ltrimstr("x") ...
  const strFn = q.match(/^(contains|startswith|endswith|test|split|ltrimstr|rtrimstr)\((["'])(.*)\2\)$/);
  if (strFn) {
    const [, fn, , arg] = strFn as unknown as [string, string, string, string];
    if (fn === "contains") {
      if (typeof jsonVal === "string") return jsonVal.includes(arg);
      if (Array.isArray(jsonVal)) return jsonVal.some((x) => x === arg || (typeof x === "string" && x.includes(arg)));
      return false;
    }
    const s = String(jsonVal ?? "");
    if (fn === "startswith") return s.startsWith(arg);
    if (fn === "endswith") return s.endsWith(arg);
    if (fn === "test") return new RegExp(arg).test(s);
    if (fn === "split") return s.split(arg);
    if (fn === "ltrimstr") return s.startsWith(arg) ? s.slice(arg.length) : s;
    return s.endsWith(arg) ? s.slice(0, s.length - arg.length) : s;
  }

  // Key-based helpers: group_by / unique_by / min_by / max_by / del
  const byM = q.match(/^(group_by|unique_by|min_by|max_by)\((.+)\)$/);
  if (byM && Array.isArray(jsonVal)) {
    const keyOf = (x: any) => evaluateBunJsonQuery(x, byM[2]!.trim());
    const kcmp = (a: any, b: any) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)));
    if (byM[1] === "group_by") {
      const groups = new Map<string, any[]>();
      for (const x of [...jsonVal].sort((a, b) => kcmp(keyOf(a), keyOf(b)))) {
        const k = JSON.stringify(keyOf(x));
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(x);
      }
      return [...groups.values()];
    }
    if (byM[1] === "unique_by") {
      const seen = new Map<string, any>();
      for (const x of jsonVal) { const k = JSON.stringify(keyOf(x)); if (!seen.has(k)) seen.set(k, x); }
      return [...seen.values()];
    }
    const sorted = [...jsonVal].sort((a, b) => kcmp(keyOf(a), keyOf(b)));
    return byM[1] === "min_by" ? (sorted[0] ?? null) : (sorted[sorted.length - 1] ?? null);
  }
  const delM = q.match(/^del\(\.([A-Za-z0-9_]+)\)$/);
  if (delM && jsonVal && typeof jsonVal === "object") {
    if (Array.isArray(jsonVal)) return jsonVal.map((x) => { if (x && typeof x === "object") { const { [delM[1]!]: _, ...rest } = x; return rest; } return x; });
    const { [delM[1]!]: _, ...rest } = jsonVal;
    return rest;
  }
  const anyAll = q.match(/^(any|all)\((.+)\)$/);
  if (anyAll && Array.isArray(jsonVal)) {
    return anyAll[1] === "any" ? jsonVal.some((x) => evalCondition(x, anyAll[2]!)) : jsonVal.every((x) => evalCondition(x, anyAll[2]!));
  }
  if (q === "from_entries" && Array.isArray(jsonVal)) {
    return Object.fromEntries(jsonVal.map((e: any) => [e.key ?? e.name ?? e.k, e.value ?? e.v]));
  }
  if (q === "keys_unsorted" && jsonVal && typeof jsonVal === "object") return Object.keys(jsonVal);
  if (q === "floor") return Math.floor(Number(jsonVal));
  if (q === "ceil") return Math.ceil(Number(jsonVal));
  if (q === "round") return Math.round(Number(jsonVal));
  if (q === "abs") return Math.abs(Number(jsonVal));
  if (q === "empty") return null;
  if (q === "ascii" || q === "trim") return String(jsonVal).trim();
  if (q === "tojson") return JSON.stringify(jsonVal);
  if (q === "fromjson") return JSON.parse(String(jsonVal));

  // Built-in jq primitives
  if (q === "keys") {
    if (Array.isArray(jsonVal)) return jsonVal.map((_, i) => i);
    if (typeof jsonVal === "object" && jsonVal !== null) return Object.keys(jsonVal);
    return [];
  }

  if (q === "length" || q === ".length") {
    if (Array.isArray(jsonVal)) return jsonVal.length;
    if (typeof jsonVal === "object" && jsonVal !== null) return Object.keys(jsonVal).length;
    return String(jsonVal).length;
  }

  if (q === "add") {
    if (Array.isArray(jsonVal)) {
      const items = jsonVal.filter((v) => v !== null);
      if (items.length === 0) return null;
      if (items.every((v) => typeof v === "number")) return items.reduce((a, v) => a + v, 0);
      if (items.every((v) => typeof v === "string")) return items.join("");
      if (items.every((v) => Array.isArray(v))) return items.flat(1);
      if (items.every((v) => v && typeof v === "object" && !Array.isArray(v))) return Object.assign({}, ...items);
      throw new Error("add: cannot add values of mixed types");
    }
    return jsonVal;
  }

  // Common zero-argument jq builtins
  const cmp = (a: any, b: any) => (typeof a === "number" && typeof b === "number" ? a - b : String(JSON.stringify(a)).localeCompare(String(JSON.stringify(b))));
  switch (q) {
    case "sort": if (Array.isArray(jsonVal)) return [...jsonVal].sort(cmp); throw new Error("sort: input must be an array");
    case "unique": if (Array.isArray(jsonVal)) return [...new Map(jsonVal.map((v) => [JSON.stringify(v), v])).values()].sort(cmp); throw new Error("unique: input must be an array");
    case "reverse": if (Array.isArray(jsonVal)) return [...jsonVal].reverse(); if (typeof jsonVal === "string") return [...jsonVal].reverse().join(""); return jsonVal;
    case "first": return Array.isArray(jsonVal) ? (jsonVal[0] ?? null) : jsonVal;
    case "last": return Array.isArray(jsonVal) ? (jsonVal[jsonVal.length - 1] ?? null) : jsonVal;
    case "min": return Array.isArray(jsonVal) && jsonVal.length ? [...jsonVal].sort(cmp)[0] : null;
    case "max": return Array.isArray(jsonVal) && jsonVal.length ? [...jsonVal].sort(cmp).pop() : null;
    case "flatten": return Array.isArray(jsonVal) ? jsonVal.flat(Infinity) : jsonVal;
    case "values": return jsonVal !== null && typeof jsonVal === "object" ? Object.values(jsonVal) : [];
    case "to_entries": return jsonVal && typeof jsonVal === "object" ? Object.entries(jsonVal).map(([key, value]) => ({ key, value })) : [];
    case "type": return jsonVal === null ? "null" : Array.isArray(jsonVal) ? "array" : typeof jsonVal;
    case "not": return !jsonVal;
    case "tostring": return typeof jsonVal === "string" ? jsonVal : JSON.stringify(jsonVal);
    case "tonumber": { const n = Number(jsonVal); if (Number.isNaN(n)) throw new Error(`Cannot parse '${jsonVal}' as number`); return n; }
    case "ascii_downcase": return String(jsonVal).toLowerCase();
    case "ascii_upcase": return String(jsonVal).toUpperCase();
  }

  // has("key") / sort_by(.k)
  const hasMatch = q.match(/^has\((["'])(.*?)\1\)$/);
  if (hasMatch) return jsonVal !== null && typeof jsonVal === "object" && hasMatch[2]! in jsonVal;
  const sortByMatch = q.match(/^sort_by\((.+)\)$/);
  if (sortByMatch && Array.isArray(jsonVal)) {
    const key = sortByMatch[1]!.trim();
    return [...jsonVal].sort((a, b) => cmp(evaluateBunJsonQuery(a, key), evaluateBunJsonQuery(b, key)));
  }

  // map(...)
  const mapMatch = q.match(/^map\((.+)\)$/);
  if (mapMatch && mapMatch[1] && Array.isArray(jsonVal)) {
    const inner = mapMatch[1].trim();
    const mapped = jsonVal.map((item) => evaluateBunJsonQuery(item, inner));
    // map(select(...)) filters, like real jq
    return inner.startsWith("select(") ? mapped.filter((x) => x !== null && x !== undefined) : mapped;
  }

  // join(...)
  const joinMatch = q.match(/^join\((["'])(.*?)\1\)$/);
  if (joinMatch && joinMatch[2] !== undefined && Array.isArray(jsonVal)) {
    return jsonVal.join(joinMatch[2]);
  }

  // select(...)
  const selectMatch = q.match(/^select\((.+)\)$/);
  if (selectMatch && selectMatch[1]) {
    const condStr = selectMatch[1].trim();
    if (Array.isArray(jsonVal)) return jsonVal.filter((x) => evalCondition(x, condStr));
    return evalCondition(jsonVal, condStr) ? jsonVal : null;
  }

  // Array wrap reduction: e.g. [.modules[].lines]
  if (q.startsWith("[") && q.endsWith("]")) {
    const inner = q.slice(1, -1).trim();
    const evaluated = evaluateBunJsonQuery(jsonVal, inner);
    return Array.isArray(evaluated) ? evaluated : [evaluated];
  }

  // Mid-path iteration: .modules[].lines  -> map the remaining path over every element
  const iterM = q.match(/^(.*?)\[\](\..+|\[\d+\].*)$/);
  if (iterM) {
    const base = iterM[1]!.trim();
    const arr = base ? evaluateBunJsonQuery(jsonVal, base) : jsonVal;
    const items = Array.isArray(arr) ? arr : arr && typeof arr === "object" ? Object.values(arr) : [];
    return items.map((x: any) => evaluateBunJsonQuery(x, iterM[2]!));
  }

  // Array splat: .modules[]
  if (q.endsWith("[]")) {
    const base = q.slice(0, -2).trim();
    const arr = base ? evaluateBunJsonQuery(jsonVal, base) : jsonVal;
    return Array.isArray(arr) ? arr : [];
  }

  // Array select splat: .modules[] | select(...)
  // Handled already by pipeline split

  // Standard property path traversal: .author.name or .modules[0].name
  const pathParts = q.replace(/^\./, "").split(/(?:\.|\b)/).filter((p) => p && p !== ".");
  let cur = jsonVal;
  
  // Normalized tokenizer for foo[0].bar
  const tokens = q.match(/(\.[a-zA-Z0-9_]+|\[\d+\]|\[\?.*?\])/g);
  if (tokens) {
    for (const t of tokens) {
      if (cur === null || cur === undefined) return null;
      if (t.startsWith(".")) {
        const prop = t.slice(1);
        cur = cur[prop];
      } else if (t.startsWith("[") && t.endsWith("]")) {
        const idx = parseInt(t.slice(1, -1), 10);
        cur = Array.isArray(cur) ? cur[idx] : undefined;
      }
    }
    return cur;
  }

  // Fallback simple property lookup
  if (q.startsWith(".")) {
    const prop = q.slice(1);
    return cur ? cur[prop] : undefined;
  }

  return cur;
}

function findExternalJq(): string | null {
  const candidates = ["/opt/homebrew/bin/jq", "/usr/local/bin/jq", "/usr/bin/jq"];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const [out, code] = Sys.exec("which jq");
  if (code === 0 && out.trim()) return out.trim();
  return null;
}

export function createJqStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const externalJq = findExternalJq();
  const win = newSimpleWindow("JSON Query Studio Pro (JQ Studio Pro) -- Native JSON Query & Transformation Workbench", 1120, 880, {
    appId: "jq_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Header Bar
  win.beginRow();
  win.addHeading("JSON Query Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- Powered by Bun's Native High-Speed JSON & JS Query Engine");

  // Query Configuration
  win.beginGroupBox("Query Configuration & Filter Presets");
  win.beginRow();
  win.addLabel("lbl_filter", "JSON Query:");
  win.addInput("txt_filter", ".").width(360);
  win.addLabel("lbl_engine", "Engine:");
  win.addDropdown(
    "dd_engine",
    [
      "Bun Native Engine (Zero Homebrew)",
      externalJq ? `External jq CLI (${externalJq})` : "External jq CLI (Not Installed)",
    ],
    "Bun Native Engine (Zero Homebrew)"
  ).width(250);
  win.addButton("btn_execute", "⚡ Run Query");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_presets", "Recipes:");
  win.addDropdown(
    "dd_presets",
    [
      "1. Pretty-Print Identity (.)",
      "2. Extract Root Keys (keys)",
      "3. Map Module Names (.modules | map(.name))",
      "4. Filter Stable Modules (.modules[] | select(.status == \"stable\"))",
      "5. Extract Tags (.tags | join(\", \"))",
      "6. Calculate Total Lines ([.modules[].lines] | add)",
      "7. Summary Metrics (.metrics)",
      "8. JS Expression ($.modules.map(m => m.name.toUpperCase()))",
    ],
    "1. Pretty-Print Identity (.)"
  );
  win.addButton("btn_reset_sample", "Reset Sample");
  win.endRow();
  win.endGroupBox();

  // Document Tools: file I/O, formatting, validation, conversion, search
  win.beginGroupBox("Document Tools");
  win.beginRow();
  win.addButton("btn_open", "📂 Open File...");
  win.addButton("btn_url", "🌐 Load URL...");
  win.addButton("btn_save_out", "💾 Save Output...");
  win.addButton("btn_save_in", "💾 Save Input...");
  win.addButton("btn_copy_out", "📋 Copy Output");
  win.addButton("btn_swap", "⇄ Output → Input");
  win.addButton("btn_clear_all", "🗑 Clear");
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_indent", "Indent:");
  win.addDropdown("dd_indent", ["2 spaces", "4 spaces", "Tab"], "2 spaces").width(110);
  win.addButton("btn_format", "✨ Format");
  win.addButton("btn_minify", "🗜 Minify");
  win.addButton("btn_sort_keys", "🔤 Sort Keys");
  win.addButton("btn_validate", "✔ Validate");
  win.addButton("btn_stats", "📊 Stats");
  win.addCheckbox("chk_compact", "Compact Output", false);
  win.addCheckbox("chk_live", "Live Query", false);
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_convert", "Convert Output:");
  win.addButton("btn_to_csv", "→ CSV");
  win.addButton("btn_to_yaml", "→ YAML");
  win.addButton("btn_csv_in", "CSV Input → JSON");
  win.addLabel("lbl_find", "Find:");
  win.addInput("txt_find", "", "Search keys & values...").width(220);
  win.addButton("btn_find", "🔍 Find");
  win.endRow();
  win.endGroupBox();

  // Split View: JSON Input and Output
  win.beginGroupBox("Input Source JSON Document");
  win.addTextarea("txt_input_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  win.beginGroupBox("Transformed Query Output");
  win.addTextarea("txt_output_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("jq_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Engine: Bun Native  |  Status: Ready  |  Syntax: Valid JSON  |  Latency: 0ms");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("JQ Studio state saved successfully!");
  });

  win.onClick("btn_reset_sample", () => {
    win.setText("txt_input_json", DEFAULT_SAMPLE_JSON);
    win.setText("txt_filter", ".");
    win.setText("txt_output_json", DEFAULT_SAMPLE_JSON);
    win.appendConsole("jq_console", "[JQ Studio] Sample JSON reset to default\n", 1);
  });

  const executeQuery = () => {
    const filter = win.getValue("txt_filter") || ".";
    const rawJson = win.getValue("txt_input_json") || "{}";
    const selectedEngine = win.getValue("dd_engine") || "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e: any) {
      win.setText("txt_output_json", `[JSON Parse Error]: ${e.message}`);
      win.appendConsole("jq_console", `[JQ Studio] Invalid Input JSON: ${e.message}\n`, 3);
      win.setStatus("JSON Syntax Error");
      return;
    }

    const t0 = performance.now();

    // Option A: External jq CLI if explicitly chosen and installed
    if (selectedEngine.startsWith("External jq") && externalJq) {
      const proc = Bun.spawnSync([externalJq, filter], { stdin: new TextEncoder().encode(rawJson), stdout: "pipe", stderr: "pipe" });
      const out = proc.stdout.toString() + proc.stderr.toString();
      const code = proc.exitCode;
      const elapsed = (performance.now() - t0).toFixed(2);

      if (code === 0) {
        win.setText("txt_output_json", out);
        win.appendConsole("jq_console", `[External jq] Query '${filter}' evaluated in ${elapsed}ms\n`, 2);
        win.setText("lbl_status", `Engine: External jq  |  Query OK (${elapsed}ms)`);
        win.setStatus(`Query OK (${elapsed}ms)`);
      } else {
        win.setText("txt_output_json", `[JQ CLI Error]:\n${out}`);
        win.appendConsole("jq_console", `[External jq] Filter error: ${out}\n`, 3);
        win.setStatus(`Filter Error (${elapsed}ms)`);
      }
      return;
    }

    // Option B: Native Bun Query Engine (Default, zero Homebrew dependency)
    try {
      const result = evaluateBunJsonQuery(parsed, filter);
      const elapsed = (performance.now() - t0).toFixed(2);
      const formatted = typeof result === "string" ? result : JSON.stringify(result, null, win.getBool("chk_compact") ? 0 : indentFrom(win.getValue("dd_indent")));

      win.setText("txt_output_json", formatted ?? "null");
      win.appendConsole(
        "jq_console",
        `[Bun Native Engine] Evaluated '${filter}' in ${elapsed}ms (Zero Homebrew)\n`,
        2
      );
      win.setText(
        "lbl_status",
        `Engine: Bun Native  |  Status: OK  |  Query: '${filter}'  |  Latency: ${elapsed}ms`
      );
      win.setStatus(`Evaluated in ${elapsed}ms`);
    } catch (err: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_output_json", `[Bun Query Error]:\n${err.message}`);
      win.appendConsole("jq_console", `[Bun Native Engine] Query error: ${err.message}\n`, 3);
      win.setStatus(`Query Error (${elapsed}ms)`);
    }
  };

  win.onClick("btn_execute", executeQuery);

  // ---------------------------------------------------------------- Document tools
  const say = (msg: string, kind: 1 | 2 | 3 = 2) => win.appendConsole("jq_console", `[JSON Studio] ${msg}\n`, kind);
  const outputText = () => win.getValue("txt_output_json") || "";
  const inputText = () => win.getValue("txt_input_json") || "";

  /** Parse a document or report a located syntax error. */
  const parseOrReport = (label: string, text: string): { ok: true; value: any } | { ok: false } => {
    const v = validateJson(text);
    if (!v.ok) {
      const where = v.line ? ` (line ${v.line}, column ${v.col})` : "";
      say(`${label} is not valid JSON${where}: ${v.error}`, 3);
      win.setStatus(`Invalid JSON${where}`);
      win.toast(`${label}: invalid JSON${where}`, 3500, "error");
      return { ok: false };
    }
    return { ok: true, value: JSON.parse(text) };
  };

  win.onClick("btn_open", () => {
    win.openFile({ title: "Open JSON / CSV file", filter: "json,csv,txt,geojson" }, (p) => {
      if (!p) return;
      try {
        const text = readFileSync(p, "utf8");
        const isCsv = /\.csv$/i.test(p);
        win.setText("txt_input_json", isCsv ? JSON.stringify(csvToJson(text), null, 2) : text);
        say(`Loaded ${p} (${text.length.toLocaleString()} chars${isCsv ? ", converted from CSV" : ""})`);
        win.toast(`Loaded ${p.split(/[\\/]/).pop()}`, 2000, "success");
        if (!isCsv && !validateJson(text).ok) win.toast("File loaded, but it is not valid JSON.", 3500, "warning");
      } catch (e: any) {
        say(`Could not read file: ${e.message}`, 3);
        win.toast(`Could not read file: ${e.message}`, 4000, "error");
      }
    });
  });

  win.onClick("btn_url", () => {
    win.prompt("Enter a URL that returns JSON:", "Load from URL", (url?: string | null) => {
      if (!url || !/^https?:\/\//i.test(url.trim())) {
        if (url) win.toast("Please enter an http(s) URL.", 3000, "warning");
        return;
      }
      say(`Fetching ${url} ...`);
      fetch(url.trim())
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .then((text) => {
          let shown = text;
          try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch {}
          win.setText("txt_input_json", shown);
          say(`Fetched ${text.length.toLocaleString()} chars from ${url}`);
          win.toast("URL loaded", 2000, "success");
        })
        .catch((e: any) => { say(`Fetch failed: ${e.message}`, 3); win.toast(`Fetch failed: ${e.message}`, 4000, "error"); });
    });
  });

  const saveText = (title: string, name: string, text: string, filter = "json") => {
    win.saveFile({ title, defaultName: name, filter }, (p) => {
      if (!p) return;
      try {
        writeFileSync(p, text);
        say(`Saved ${p}`);
        win.toast(`Saved ${p.split(/[\\/]/).pop()}`, 2500, "success");
      } catch (e: any) {
        say(`Could not save: ${e.message}`, 3);
        win.toast(`Could not save: ${e.message}`, 4000, "error");
      }
    });
  };
  win.onClick("btn_save_out", () => {
    const t = outputText();
    const looksCsv = !validateJson(t).ok && /^[^\n{\[]+,[^\n]*\n/.test(t);
    const looksYaml = !validateJson(t).ok && !looksCsv && /^[\w"-]+:/.test(t);
    saveText("Save query output", looksCsv ? "output.csv" : looksYaml ? "output.yaml" : "output.json", t, looksCsv ? "csv" : looksYaml ? "yaml,yml" : "json");
  });
  win.onClick("btn_save_in", () => saveText("Save input document", "input.json", inputText()));

  win.onClick("btn_copy_out", () => {
    win.copyToClipboard(outputText());
    win.toast("Output copied to clipboard.", 1800, "success");
  });
  win.onClick("btn_swap", () => {
    win.setText("txt_input_json", outputText());
    say("Output moved into the input document (chain another query).");
  });
  win.onClick("btn_clear_all", () => {
    win.setText("txt_input_json", "");
    win.setText("txt_output_json", "");
    win.setText("txt_filter", ".");
    say("Cleared input, output and query.");
  });

  win.onClick("btn_format", () => {
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    win.setText("txt_input_json", formatJson(inputText(), indentFrom(win.getValue("dd_indent"))));
    say("Input formatted.");
  });
  win.onClick("btn_minify", () => {
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    const min = minifyJson(inputText());
    win.setText("txt_input_json", min);
    say(`Input minified (${min.length.toLocaleString()} chars).`);
  });
  win.onClick("btn_sort_keys", () => {
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    win.setText("txt_input_json", JSON.stringify(sortKeysDeep(r.value), null, indentFrom(win.getValue("dd_indent"))));
    say("Object keys sorted alphabetically (recursively).");
  });
  win.onClick("btn_validate", () => {
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    say("Input is valid JSON.");
    win.setStatus("Valid JSON");
    win.toast("Valid JSON ✔", 1800, "success");
  });
  win.onClick("btn_stats", () => {
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    const s = jsonStats(r.value, inputText());
    say(`Stats: ${s.bytes.toLocaleString()} bytes, depth ${s.depth}, ${s.objects} objects, ${s.arrays} arrays, ${s.keys} keys, ${s.strings} strings, ${s.numbers} numbers, ${s.booleans} booleans, ${s.nulls} nulls.`);
    win.setText("lbl_status", `Size: ${s.bytes.toLocaleString()} B  |  Depth: ${s.depth}  |  Keys: ${s.keys}  |  Objects: ${s.objects}  |  Arrays: ${s.arrays}`);
  });

  win.onClick("btn_to_csv", () => {
    const r = parseOrReport("Output", outputText());
    if (!r.ok) return;
    win.setText("txt_output_json", jsonToCsv(r.value));
    say("Output converted to CSV.");
  });
  win.onClick("btn_to_yaml", () => {
    const r = parseOrReport("Output", outputText());
    if (!r.ok) return;
    win.setText("txt_output_json", jsonToYaml(r.value));
    say("Output converted to YAML.");
  });
  win.onClick("btn_csv_in", () => {
    const rows = csvToJson(inputText());
    if (rows.length === 0) { win.toast("Paste CSV (with a header row) into the input first.", 3000, "warning"); return; }
    win.setText("txt_input_json", JSON.stringify(rows, null, 2));
    say(`CSV converted: ${rows.length} record(s).`);
  });

  const runFind = () => {
    const term = (win.getValue("txt_find") || "").trim();
    if (!term) { win.toast("Type something to search for.", 2000, "info"); return; }
    const r = parseOrReport("Input", inputText());
    if (!r.ok) return;
    const hits = searchJson(r.value, term, 100);
    if (hits.length === 0) { say(`No matches for "${term}".`, 1); return; }
    say(`${hits.length}${hits.length >= 100 ? "+" : ""} match(es) for "${term}":`);
    for (const h of hits) win.appendConsole("jq_console", `   ${h.path}  (${h.kind}) ${h.preview}\n`, 1);
    win.setText("txt_output_json", hits.map((h) => h.path).join("\n"));
  };
  win.onClick("btn_find", runFind);
  win.onEnter?.("txt_find", runFind);

  // Live Query: re-run as the query text changes
  win.onChange("txt_filter", () => { if (win.getBool("chk_live")) executeQuery(); });

  win.onChange("dd_presets", (_w, recipe: string) => {
    if (recipe.includes("Identity")) win.setText("txt_filter", ".");
    else if (recipe.includes("Root Keys")) win.setText("txt_filter", "keys");
    else if (recipe.includes("Module Names")) win.setText("txt_filter", ".modules | map(.name)");
    else if (recipe.includes("Filter Stable")) win.setText("txt_filter", ".modules[] | select(.status == \"stable\")");
    else if (recipe.includes("Extract Tags")) win.setText("txt_filter", ".tags | join(\", \")");
    else if (recipe.includes("Total Lines")) win.setText("txt_filter", "[.modules[].lines] | add");
    else if (recipe.includes("Summary Metrics")) win.setText("txt_filter", ".metrics");
    else if (recipe.includes("JS Expression")) win.setText("txt_filter", "$.modules.map(m => m.name.toUpperCase())");
    executeQuery();
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

export const createJsonStudio = createJqStudio;

if (import.meta.main) {
  const win = createJsonStudio({ fullscreen: true });
  console.log("Launching JSON Query Studio Pro (Bun Native)...");
  win.run();
}
