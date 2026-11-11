/**
 * Shared server side of the macro system for the networked studios
 * (MySQL Studio / Postgres Studio).
 *
 *  - MacroStore: macros + saved queries persisted as JSON per connection, so nothing is ever
 *    created inside the user's database.
 *  - runMacroAsync: the async macro engine (stop-on-error, onError policy, [Enter ...] prompts,
 *    RunMacro sub-macros, dry-run / atomic transactions on a pinned connection).
 *  - handleMacroRoute: the /api/macros/* and /api/queries/* HTTP surface.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  type MacroAction,
  type MacroDefinition,
  type MacroDialect,
  type MacroExecutionResult,
  type MacroStepExecutionLog,
  type SavedQueryDefinition,
  applyPromptParams,
  buildDeleteRecordSql,
  buildEmptyTableSql,
  buildMakeTableStatements,
  buildUpdateRecordSql,
  createDefaultMacros,
  evaluateMacroCondition,
  extractPromptParams,
  macroToBunJs,
  macroToSqlScript,
  macroToVba,
  parseRecordFieldsToInsertSql,
  quoteIdentFor,
  validateMacro,
} from "./sqlite_studio_macros.ts";
import { handleCodegenRequest } from "./studio_codegen.ts";

export interface MacroQueryResult {
  success: boolean;
  rows?: any[];
  columns?: string[];
  rowCount?: number;
  rowsAffected?: number;
  error?: string;
}

export type MacroQueryFn = (sql: string) => Promise<MacroQueryResult>;

export interface MacroTransaction {
  query: MacroQueryFn;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** What a studio manager has to provide so the shared engine can run against its database. */
export interface MacroAdapter {
  dialect: Exclude<MacroDialect, "sqlite">;
  /** Stable identifier of the current connection (host:port/database) used to pick the store file. */
  connectionKey(): string;
  query: MacroQueryFn;
  beginTransaction(): Promise<MacroTransaction>;
  maintenance(analyze: boolean): Promise<string>;
  backup(mode: string): Promise<string>;
  listTables(): Promise<string[]>;
}

// -------------------------------------------------------------------------------------------------
// Persistence
// -------------------------------------------------------------------------------------------------

interface StoreFile {
  macros: MacroDefinition[];
  queries: SavedQueryDefinition[];
}

export class MacroStore {
  private sessionSavedIds = new Set<string>();

  constructor(
    private dialect: Exclude<MacroDialect, "sqlite">,
    private keyFn: () => string,
  ) {}

  isSessionSavedMacro(id?: string): boolean {
    return Boolean(id && this.sessionSavedIds.has(id));
  }

  private file(): string {
    const dir =
      process.env.STUDIO_MACRO_STORE_DIR ||
      join(homedir(), ".bun_rad_studio", "macros");
    mkdirSync(dir, { recursive: true });
    const safe = `${this.dialect}_${this.keyFn()}`
      .replace(/[^A-Za-z0-9_.-]+/g, "_")
      .slice(0, 120);
    return join(dir, `${safe}.json`);
  }

  private read(): StoreFile {
    const f = this.file();
    if (existsSync(f)) {
      try {
        const parsed = JSON.parse(readFileSync(f, "utf-8"));
        return { macros: parsed.macros || [], queries: parsed.queries || [] };
      } catch {}
    }
    const fresh: StoreFile = {
      macros: createDefaultMacros(this.dialect),
      queries: [],
    };
    this.write(fresh);
    return fresh;
  }

  private write(data: StoreFile) {
    writeFileSync(this.file(), JSON.stringify(data, null, 2));
  }

  getMacros(): MacroDefinition[] {
    return [...this.read().macros].sort(
      (a, b) =>
        Number(!!b.isAutoExec) - Number(!!a.isAutoExec) ||
        a.name.localeCompare(b.name),
    );
  }

  saveMacro(macro: MacroDefinition): {
    success: boolean;
    macro?: MacroDefinition;
    error?: string;
  } {
    if (!macro || !macro.name || !String(macro.name).trim())
      return { success: false, error: "Macro name is required" };
    const data = this.read();
    const name = macro.name.trim();
    const id =
      macro.id ||
      `macro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (
      data.macros.some(
        (m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return {
        success: false,
        error: `A macro named '${name}' already exists`,
      };
    }
    const now = new Date().toISOString();
    const existing = data.macros.find((m) => m.id === id);
    const saved: MacroDefinition = {
      ...macro,
      id,
      name,
      description: macro.description || "",
      isAutoExec: !!macro.isAutoExec,
      onError: macro.onError === "continue" ? "continue" : "stop",
      actions: macro.actions || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (saved.isAutoExec)
      data.macros.forEach((m) => {
        if (m.id !== id) m.isAutoExec = false;
      });
    data.macros = data.macros.filter((m) => m.id !== id).concat(saved);
    this.write(data);
    this.sessionSavedIds.add(id);
    return { success: true, macro: saved };
  }

  deleteMacro(idOrName: string): { success: boolean; error?: string } {
    const data = this.read();
    data.macros = data.macros.filter(
      (m) => m.id !== idOrName && m.name !== idOrName,
    );
    this.write(data);
    return { success: true };
  }

  getSavedQueries(): SavedQueryDefinition[] {
    return [...this.read().queries].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  saveQuery(query: SavedQueryDefinition): {
    success: boolean;
    query?: SavedQueryDefinition;
    error?: string;
  } {
    if (!query || !query.name?.trim() || !query.sql?.trim())
      return { success: false, error: "Query name and SQL are required" };
    const data = this.read();
    const name = query.name.trim();
    const existing =
      data.queries.find((q) => q.id === query.id) ||
      data.queries.find((q) => q.name.toLowerCase() === name.toLowerCase());
    const now = new Date().toISOString();
    const saved: SavedQueryDefinition = {
      ...query,
      id:
        existing?.id ||
        query.id ||
        `query_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    data.queries = data.queries.filter((q) => q.id !== saved.id).concat(saved);
    this.write(data);
    return { success: true, query: saved };
  }

  deleteQuery(idOrName: string): { success: boolean; error?: string } {
    const data = this.read();
    data.queries = data.queries.filter(
      (q) => q.id !== idOrName && q.name !== idOrName,
    );
    this.write(data);
    return { success: true };
  }
}

// -------------------------------------------------------------------------------------------------
// Execution
// -------------------------------------------------------------------------------------------------

export interface RunMacroOptions {
  transaction?: boolean;
  dryRun?: boolean;
  params?: Record<string, any>;
  confirmRunCode?: boolean;
  confirmedAutoExec?: boolean;
  autoExec?: boolean;
  trigger?: string;
}

const MAX_MACRO_DEPTH = 8;
const DDL_PATTERN = /^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME)\b/i;
export const FORBIDDEN_STUDIO_MACRO_RE =
  /(?:\b(?:process|Bun|Deno|ShadowRealm|importValue|BroadcastChannel|MessageChannel|MessagePort|FinalizationRegistry|WeakRef|HTMLRewriter|Loader|globalThis|global|window|self|frames|parent|top|Reflect|Proxy|constructor|__proto__|prototype|mainModule|require|import|child_process|Function|AsyncFunction|GeneratorFunction|AsyncGeneratorFunction|eval|WebSocket|XMLHttpRequest|EventSource|fetch|Worker|SharedArrayBuffer|Atomics|WebAssembly|__dirname|__filename)\b|\bnode:)/;

function decodeJsEscapesForAudit(src: string): string {
  return src
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

/**
 * Validates and transpiles a RunCode snippet, checking FORBIDDEN_STUDIO_MACRO_RE
 * BEFORE and AFTER transpilation (and after decoding unicode/hex escapes), and
 * verifying dual-context brace containment so user code cannot close __studioRunCode early.
 */
export function transpileSafeRunCode(rawCode: string): string {
  const code = String(rawCode || "").trim();
  if (!code) throw new Error("RunCode requires code");
  if (
    FORBIDDEN_STUDIO_MACRO_RE.test(code) ||
    FORBIDDEN_STUDIO_MACRO_RE.test(decodeJsEscapesForAudit(code))
  ) {
    throw new Error("RunCode references restricted host or process APIs");
  }
  const transpiler = new Bun.Transpiler({
    loader: "ts",
    target: "browser",
  });
  // Dual-context parse check: inside an object-literal method, only `,` or `}` can follow
  // an early closing `}`, whereas in top-level statement position `,` or unmatched `}` is a SyntaxError.
  // No snippet with an unmatched `}` escaping the function body can satisfy both grammars.
  try {
    transpiler.transformSync(
      `({\nasync __guard() {\n"use strict";\n${code}\n}\n})`,
    );
  } catch (err: any) {
    throw new Error(
      `RunCode syntax or scope breakout error: ${err?.message || String(err)}`,
    );
  }
  let transpiled: string;
  try {
    transpiled = transpiler.transformSync(
      `async function __studioRunCode(CurrentDb, db, DoCmd, TempVars, vars, DCount, DLookup, DSum, MsgBox, Debug) {\n"use strict";\n${code}\n}`,
    );
  } catch (err: any) {
    throw new Error(`RunCode syntax error: ${err?.message || String(err)}`);
  }
  if (
    FORBIDDEN_STUDIO_MACRO_RE.test(transpiled) ||
    FORBIDDEN_STUDIO_MACRO_RE.test(decodeJsEscapesForAudit(transpiled))
  ) {
    throw new Error("RunCode references restricted host or process APIs");
  }
  return transpiled;
}

export interface RunCodeRpcHandlers {
  dialect: MacroDialect;
  query(sql: string): Promise<any[]>;
  execute(sql: string): Promise<{ affectedRows: number }>;
  tables(): Promise<string[]>;
}

/**
 * Executes a validated RunCode snippet inside an isolated Worker thread with:
 * - Zero host object/function references (preventing .constructor AsyncFunction escapes)
 * - Wiped & non-configurable Bun/process/require/fetch/WebSocket/Worker/Function/eval globals
 * - Strict mode ("use strict") so `this` is undefined
 * - Enforced wall-clock timeout terminating hung loops cleanly
 */
export async function executeIsolatedRunCode(
  rawCode: string,
  initialVariables: Record<string, any>,
  rpc: RunCodeRpcHandlers,
  timeoutMs = 5000,
): Promise<{
  returnValue: any;
  variables: Record<string, any>;
  debugLogs: string[];
}> {
  const transpiledFn = transpileSafeRunCode(rawCode);
  const d = rpc.dialect;

  const workerScript = `"use strict";
let __registerStudioRunner = (() => {
  const _postMessage = self.postMessage.bind(self);
  const _addEventListener = self.addEventListener.bind(self);
  const _Object = Object;
  const _Array = Array;
  const _Promise = Promise;
  const _Map = Map;
  const _Set = Set;
  const _JSON = JSON;
  const _Number = Number;
  const _String = String;
  const _Boolean = Boolean;
  const _Error = Error;
  const _Math = Math;

  let _userRunner = null;
  let nextId = 1;
  const pending = new _Map();

  function callHost(method, args) {
    return new _Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      _postMessage({ type: "rpc", id, method, args });
    });
  }

  function safeClone(val) {
    if (val === undefined || typeof val === "function" || typeof val === "symbol") return undefined;
    try {
      return _JSON.parse(_JSON.stringify(val));
    } catch {
      return _String(val);
    }
  }

  _addEventListener("message", async (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "rpc_res") {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.value);
      else entry.reject(new _Error(msg.error || "RunCode RPC failed"));
      return;
    }
    if (msg.type === "start") {
      const TempVars = _Object.assign({}, msg.variables || {});
      const debugLogs = [];
      let recordsAffected = 0;

      const CurrentDb = _Object.freeze(_Object.assign(_Object.create(null), {
        dialect: ${JSON.stringify(d)},
        get RecordsAffected() { return recordsAffected; },
        async query(sql) {
          return await callHost("query", [_String(sql ?? "")]);
        },
        async execute(sql) {
          const res = await callHost("execute", [_String(sql ?? "")]);
          recordsAffected = _Number(res && res.affectedRows ? res.affectedRows : 0);
          TempVars.lastRowsAffected = recordsAffected;
          return { affectedRows: recordsAffected };
        },
        async tables() {
          return await callHost("tables", []);
        },
      }));

      const DCount = async (expr = "*", domain = "", criteria = "") => {
        return await callHost("dcount", [_String(expr ?? "*"), _String(domain ?? ""), criteria ? _String(criteria) : ""]);
      };
      const DLookup = async (expr = "", domain = "", criteria = "") => {
        return await callHost("dlookup", [_String(expr ?? ""), _String(domain ?? ""), criteria ? _String(criteria) : ""]);
      };
      const DSum = async (expr = "", domain = "", criteria = "") => {
        return await callHost("dsum", [_String(expr ?? ""), _String(domain ?? ""), criteria ? _String(criteria) : ""]);
      };

      const DoCmd = _Object.freeze(_Object.assign(_Object.create(null), {
        RunSQL: (sql) => CurrentDb.execute(sql),
        OpenQuery: (sql) => CurrentDb.query(sql),
        OpenTable: (table, where = "", limit = 200) =>
          callHost("openTable", [_String(table ?? ""), where ? _String(where) : "", _Number(limit) || 200]),
        InsertRecord: async (table, fields) => {
          const res = await callHost("insertRecord", [_String(table ?? ""), safeClone(fields)]);
          recordsAffected = _Number(res && res.affectedRows ? res.affectedRows : 0);
          TempVars.lastRowsAffected = recordsAffected;
          return res;
        },
        UpdateRecord: async (table, setVals, where = "") => {
          const res = await callHost("updateRecord", [_String(table ?? ""), _String(setVals ?? ""), where ? _String(where) : ""]);
          recordsAffected = _Number(res && res.affectedRows ? res.affectedRows : 0);
          TempVars.lastRowsAffected = recordsAffected;
          return res;
        },
        DeleteRecord: async (table, where = "") => {
          const res = await callHost("deleteRecord", [_String(table ?? ""), where ? _String(where) : ""]);
          recordsAffected = _Number(res && res.affectedRows ? res.affectedRows : 0);
          TempVars.lastRowsAffected = recordsAffected;
          return res;
        },
        EmptyTable: async (table) => {
          const res = await callHost("emptyTable", [_String(table ?? "")]);
          recordsAffected = _Number(res && res.affectedRows ? res.affectedRows : 0);
          TempVars.lastRowsAffected = recordsAffected;
          return res;
        },
        SetTempVar: (k, v) => { TempVars[_String(k)] = v; },
        RemoveTempVar: (k) => { delete TempVars[_String(k)]; },
        MessageBox: (m) => { debugLogs.push(_String(m)); },
        Beep: () => {},
      }));

      const formatDebug = (args) =>
        args.map((x) => (typeof x === "string" ? x : _JSON.stringify(x))).join(" ");
      const Debug = _Object.freeze(_Object.assign(_Object.create(null), {
        print: (...args) => { debugLogs.push(formatDebug(args)); },
        Print: (...args) => { debugLogs.push(formatDebug(args)); },
      }));

      try {
        if (typeof _userRunner !== "function") {
          throw new _Error("RunCode runner failed to initialize");
        }
        const ret = await _userRunner(
          CurrentDb,
          CurrentDb,
          DoCmd,
          TempVars,
          TempVars,
          DCount,
          DLookup,
          DSum,
          DoCmd.MessageBox,
          Debug
        );
        _postMessage({
          type: "done",
          ok: true,
          returnValue: safeClone(ret),
          variables: safeClone(TempVars) || {},
          debugLogs,
        });
      } catch (err) {
        _postMessage({
          type: "done",
          ok: false,
          error: err && err.message ? _String(err.message) : _String(err),
        });
      }
    }
  });

  const blockedCtor = function BlockedConstructor() {
    throw new _Error("Dynamic Function constructor is disabled in RunCode sandbox");
  };
  const protos = [
    Function.prototype,
    _Object.getPrototypeOf(async function () {}),
    _Object.getPrototypeOf(function* () {}),
    _Object.getPrototypeOf(async function* () {}),
  ];
  for (const proto of protos) {
    if (proto) {
      try {
        _Object.defineProperty(proto, "constructor", {
          value: blockedCtor,
          writable: false,
          configurable: false,
        });
      } catch {}
    }
  }

  const ALLOWED_GLOBALS = new _Set([
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Math",
    "Date",
    "JSON",
    "RegExp",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Symbol",
    "BigInt",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "AggregateError",
    "ArrayBuffer",
    "DataView",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "Intl",
    "TextEncoder",
    "TextDecoder",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURI",
    "decodeURI",
    "encodeURIComponent",
    "decodeURIComponent",
    "atob",
    "btoa",
    "structuredClone",
    "setTimeout",
    "clearTimeout",
    "queueMicrotask",
    "globalThis",
    "undefined",
    "NaN",
    "Infinity",
  ]);

  let protoCursor = _Object.getPrototypeOf(globalThis);
  while (protoCursor && protoCursor !== _Object.prototype) {
    const nextProto = _Object.getPrototypeOf(protoCursor);
    for (const key of _Object.getOwnPropertyNames(protoCursor)) {
      if (key === "constructor") continue;
      try { delete protoCursor[key]; } catch {}
      try {
        _Object.defineProperty(protoCursor, key, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      } catch {}
    }
    protoCursor = nextProto;
  }
  try { _Object.setPrototypeOf(globalThis, _Object.prototype); } catch {}

  for (const key of _Object.getOwnPropertyNames(globalThis)) {
    if (ALLOWED_GLOBALS.has(key)) continue;
    try { delete globalThis[key]; } catch {}
    try {
      _Object.defineProperty(globalThis, key, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    } catch {}
  }

  let registered = false;
  return function registerOnce(fn) {
    if (registered) return;
    registered = true;
    _userRunner = fn;
  };
})();

__registerStudioRunner((() => {
  "use strict";
  ${transpiledFn}
  return __studioRunCode;
})());
__registerStudioRunner = undefined;`;

  const blob = new Blob([workerScript], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl, { type: "module" });

  let safeInitialVars: Record<string, any> = {};
  try {
    safeInitialVars = JSON.parse(JSON.stringify(initialVariables || {}));
  } catch {
    safeInitialVars = {};
  }

  const assertSafeExpr = (expr: string, label: string) => {
    const s = String(expr || "").trim();
    if (!s || /[;]/.test(s) || /--|\/\*/.test(s)) {
      throw new Error(`Unsafe ${label} expression in RunCode`);
    }
    return s;
  };

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {}
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(new Error(`RunCode execution timed out after ${timeoutMs}ms`)),
      );
    }, timeoutMs);

    worker.onerror = (ev: any) => {
      finish(() =>
        reject(new Error(ev?.message || "Isolated RunCode worker error")),
      );
    };

    worker.onmessage = async (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "done") {
        if (msg.ok) {
          finish(() =>
            resolve({
              returnValue: msg.returnValue,
              variables: msg.variables || {},
              debugLogs: Array.isArray(msg.debugLogs) ? msg.debugLogs : [],
            }),
          );
        } else {
          finish(() => reject(new Error(msg.error || "RunCode failed")));
        }
        return;
      }
      if (msg.type === "rpc") {
        try {
          const args = Array.isArray(msg.args) ? msg.args : [];
          let value: any;
          switch (msg.method) {
            case "query":
              value = await rpc.query(String(args[0] ?? ""));
              break;
            case "execute":
              value = await rpc.execute(String(args[0] ?? ""));
              break;
            case "tables":
              value = await rpc.tables();
              break;
            case "openTable": {
              const tbl = quoteIdentFor(d, String(args[0] ?? ""));
              const where = args[1]
                ? ` WHERE ${assertSafeExpr(String(args[1]), "WHERE")}`
                : "";
              const lim = Math.min(Math.max(1, Number(args[2]) || 200), 10000);
              value = await rpc.query(
                `SELECT * FROM ${tbl}${where} LIMIT ${lim}`,
              );
              break;
            }
            case "insertRecord":
              value = await rpc.execute(
                parseRecordFieldsToInsertSql(String(args[0] ?? ""), args[1], d),
              );
              break;
            case "updateRecord":
              value = await rpc.execute(
                buildUpdateRecordSql(
                  String(args[0] ?? ""),
                  String(args[1] ?? ""),
                  args[2] ? String(args[2]) : undefined,
                  d,
                ),
              );
              break;
            case "deleteRecord":
              value = await rpc.execute(
                buildDeleteRecordSql(
                  String(args[0] ?? ""),
                  args[1] ? String(args[1]) : undefined,
                  d,
                ),
              );
              break;
            case "emptyTable":
              value = await rpc.execute(
                buildEmptyTableSql(String(args[0] ?? ""), d),
              );
              break;
            case "dcount": {
              const expr =
                String(args[0] || "*").trim() === "*"
                  ? "*"
                  : assertSafeExpr(String(args[0]), "DCount");
              const tbl = quoteIdentFor(d, String(args[1] ?? ""));
              const w =
                args[2] && String(args[2]).trim()
                  ? ` WHERE ${assertSafeExpr(String(args[2]), "criteria")}`
                  : "";
              const r = await rpc.query(
                `SELECT COUNT(${expr}) AS c FROM ${tbl}${w}`,
              );
              value = Number(r[0]?.c ?? Object.values(r[0] || {})[0] ?? 0);
              break;
            }
            case "dlookup": {
              const expr = assertSafeExpr(String(args[0] ?? ""), "DLookup");
              const tbl = quoteIdentFor(d, String(args[1] ?? ""));
              const w =
                args[2] && String(args[2]).trim()
                  ? ` WHERE ${assertSafeExpr(String(args[2]), "criteria")}`
                  : "";
              const r = await rpc.query(
                `SELECT ${expr} AS v FROM ${tbl}${w} LIMIT 1`,
              );
              value = r[0]?.v ?? (r[0] ? Object.values(r[0])[0] : null) ?? null;
              break;
            }
            case "dsum": {
              const expr = assertSafeExpr(String(args[0] ?? ""), "DSum");
              const tbl = quoteIdentFor(d, String(args[1] ?? ""));
              const w =
                args[2] && String(args[2]).trim()
                  ? ` WHERE ${assertSafeExpr(String(args[2]), "criteria")}`
                  : "";
              const r = await rpc.query(
                `SELECT COALESCE(SUM(${expr}), 0) AS s FROM ${tbl}${w}`,
              );
              value = Number(r[0]?.s ?? Object.values(r[0] || {})[0] ?? 0);
              break;
            }
            default:
              throw new Error(`Unsupported RunCode RPC method '${msg.method}'`);
          }
          if (!settled) {
            worker.postMessage({
              type: "rpc_res",
              id: msg.id,
              ok: true,
              value,
            });
          }
        } catch (err: any) {
          if (!settled) {
            worker.postMessage({
              type: "rpc_res",
              id: msg.id,
              ok: false,
              error: err?.message || String(err),
            });
          }
        }
      }
    };

    worker.postMessage({ type: "start", variables: safeInitialVars });
  });
}

function evaluateCondition(
  condition: string,
  variables: Record<string, any>,
): boolean {
  return evaluateMacroCondition(condition, variables);
}

function resolvePrompts(
  sql: string,
  values: Record<string, any>,
  dialect: MacroDialect,
): string {
  const missing = extractPromptParams(sql).filter((n) => !(n in values));
  if (missing.length > 0)
    throw new Error(
      `Missing parameter value(s): ${missing.map((n) => `[${n}]`).join(", ")}`,
    );
  return applyPromptParams(sql, values, dialect === "mysql");
}

/**
 * Runs a macro. With `transaction` (or `dryRun`) all steps share one pinned connection that is
 * rolled back on failure; `dryRun` always rolls back. MySQL cannot roll back DDL, so DDL steps are
 * refused in those modes instead of silently committing.
 */
export async function runMacroAsync(
  adapter: MacroAdapter,
  store: MacroStore,
  macroOrId: MacroDefinition | string,
  initialVariables: Record<string, any> = {},
  opts: RunMacroOptions = {},
): Promise<MacroExecutionResult> {
  const useTx = Boolean(opts.transaction || opts.dryRun);
  let tx: MacroTransaction | null = null;
  if (useTx) {
    try {
      tx = await adapter.beginTransaction();
    } catch (err: any) {
      return {
        success: false,
        macroName:
          typeof macroOrId === "string"
            ? macroOrId
            : macroOrId?.name || "Unknown",
        totalSteps: 0,
        executedSteps: 0,
        skippedSteps: 0,
        failedSteps: 1,
        totalLatencyMs: 0,
        logs: [],
        error: `Cannot start transaction: ${err?.message || err}`,
      };
    }
  }

  const exec: MacroQueryFn = tx ? tx.query : adapter.query;
  let result: MacroExecutionResult;
  try {
    result = await runCore(
      adapter,
      store,
      exec,
      !!tx,
      macroOrId,
      initialVariables,
      opts.params || {},
      0,
      opts,
    );
  } catch (err) {
    if (tx) {
      try {
        await tx.rollback();
      } catch {}
    }
    throw err;
  }

  if (tx) {
    try {
      if (result.success && !opts.dryRun) {
        await tx.commit();
        result.committed = true;
      } else {
        await tx.rollback();
        result.rolledBack = true;
      }
    } catch (err: any) {
      try {
        await tx.rollback();
      } catch {}
      result.success = false;
      result.rolledBack = true;
      result.error = `Transaction finalize failed: ${err?.message || err}`;
    }
  }
  if (opts.dryRun) result.dryRun = true;
  return result;
}

async function runCore(
  adapter: MacroAdapter,
  store: MacroStore,
  exec: MacroQueryFn,
  inTx: boolean,
  macroOrId: MacroDefinition | string,
  initialVariables: Record<string, any>,
  promptParams: Record<string, any>,
  depth: number,
  opts: RunMacroOptions = {},
): Promise<MacroExecutionResult> {
  const d = adapter.dialect;
  const qi = (ident: string) => quoteIdentFor(d, ident);
  const all = store.getMacros();
  const macro: MacroDefinition | null =
    typeof macroOrId === "string"
      ? all.find(
          (m) =>
            m.id === macroOrId ||
            m.name.toLowerCase() === macroOrId.toLowerCase(),
        ) || null
      : macroOrId;

  const fail = (
    name: string,
    total: number,
    error: string,
    failed = 1,
  ): MacroExecutionResult => ({
    success: false,
    macroName: name,
    totalSteps: total,
    executedSteps: 0,
    skippedSteps: 0,
    failedSteps: failed,
    totalLatencyMs: 0,
    logs: [],
    error,
  });

  if (!macro)
    return fail(
      typeof macroOrId === "string" ? macroOrId : "Unknown",
      0,
      `Macro '${typeof macroOrId === "string" ? macroOrId : ""}' not found`,
    );
  if (depth > MAX_MACRO_DEPTH)
    return fail(
      macro.name,
      macro.actions.length,
      "RunMacro nesting too deep (possible recursion)",
    );

  if (
    (opts.autoExec || opts.trigger === "AutoExec") &&
    opts.confirmedAutoExec !== true
  ) {
    return {
      ...fail(
        macro.name,
        macro.actions.length,
        "AutoExec macro execution requires explicit user consent (confirmedAutoExec: true)",
      ),
      requiresConsent: true,
    } as MacroExecutionResult;
  }

  const blocking = validateMacro(
    macro,
    all.map((m) => m.name),
  ).filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    return fail(
      macro.name,
      macro.actions.length,
      "Validation failed: " +
        blocking
          .map((i) => (i.stepIndex ? `step ${i.stepIndex}: ` : "") + i.message)
          .join("; "),
      blocking.length,
    );
  }

  const tStart = performance.now();
  const logs: MacroStepExecutionLog[] = [];
  const variables: Record<string, any> = { ...initialVariables };
  let executedSteps = 0;
  let skippedSteps = 0;
  let failedSteps = 0;
  const total = macro.actions.length;
  const elapsed = () => Number((performance.now() - tStart).toFixed(2));
  const summary = (
    extra: Partial<MacroExecutionResult> = {},
  ): MacroExecutionResult => ({
    success: true,
    macroName: macro.name,
    totalSteps: total,
    executedSteps,
    skippedSteps,
    failedSteps,
    totalLatencyMs: elapsed(),
    logs,
    variables,
    ...extra,
  });

  const lookupQuerySql = (name: string): string | undefined =>
    store
      .getSavedQueries()
      .find(
        (q) =>
          q.name.toLowerCase() === String(name).toLowerCase() || q.id === name,
      )?.sql;

  const run = async (sql: string, what: string): Promise<MacroQueryResult> => {
    if (inTx && d === "mysql" && DDL_PATTERN.test(sql)) {
      throw new Error(
        `${what}: MySQL commits implicitly on DDL, so it cannot run in a dry-run/atomic macro`,
      );
    }
    const res = await exec(sql);
    if (!res.success) throw new Error(res.error || `${what} failed`);
    return res;
  };

  for (let i = 0; i < macro.actions.length; i++) {
    const act: MacroAction = macro.actions[i]!;
    if (act.enabled === false) {
      skippedSteps++;
      continue;
    }

    let conditionError: string | null = null;
    if (act.condition && act.condition.trim()) {
      try {
        if (!evaluateCondition(act.condition, variables)) {
          skippedSteps++;
          logs.push({
            stepIndex: i + 1,
            actionId: act.id,
            action: act.action,
            condition: act.condition,
            conditionMet: false,
            parameters: act.parameters || {},
            status: "skipped",
            message: `Skipped: condition [${act.condition}] evaluated to false`,
            latencyMs: 0,
          });
          continue;
        }
      } catch (err: any) {
        const em = String(err?.message || err);
        conditionError = em.startsWith("Invalid condition")
          ? em
          : `Invalid condition [${act.condition}]: ${em}`;
      }
    }

    const t0 = performance.now();
    const lat = () => Number((performance.now() - t0).toFixed(2));
    try {
      if (conditionError) throw new Error(conditionError);
      const p = act.parameters || {};
      const tbl = p.table || p.tableName || p.targetTable;
      let output: any = null;
      let message = `Action ${act.action} executed`;

      switch (act.action) {
        case "OpenTable": {
          const targetTbl = tbl || variables.activeTable;
          if (!targetTbl) throw new Error("OpenTable requires target table");
          variables.activeTable = targetTbl;
          const res = await run(
            `SELECT * FROM ${qi(targetTbl)} LIMIT 100;`,
            "OpenTable",
          );
          variables.totalRows = res.rows?.length || 0;
          output = {
            table: targetTbl,
            columns: res.columns,
            rows: res.rows,
            rowsCount: res.rows?.length || 0,
          };
          message = `Opened table '${targetTbl}' (${res.rows?.length || 0} rows)`;
          break;
        }
        case "ApplyFilter": {
          const cond = p.condition || p.where || p.whereCondition;
          const targetTbl = tbl || variables.activeTable || "customers";
          if (!cond) {
            message = "No filter condition provided";
            break;
          }
          const resolvedCond = resolvePrompts(String(cond), promptParams, d);
          const res = await run(
            `SELECT * FROM ${qi(targetTbl)} WHERE ${resolvedCond} LIMIT 100;`,
            "ApplyFilter",
          );
          variables.totalRows = res.rows?.length || 0;
          output = {
            table: targetTbl,
            condition: resolvedCond,
            columns: res.columns,
            rows: res.rows,
            rowsCount: res.rows?.length || 0,
          };
          message = `Applied filter '${resolvedCond}' (${res.rows?.length || 0} matching records)`;
          break;
        }
        case "OpenQuery": {
          let sql: string | undefined = p.sql;
          if (p.queryName) {
            const found = lookupQuerySql(p.queryName);
            if (found) sql = found;
            else if (!sql)
              throw new Error(`Saved query '${p.queryName}' not found`);
          }
          if (!sql)
            throw new Error("OpenQuery missing SQL query or query name");
          const res = await run(
            resolvePrompts(sql, promptParams, d),
            "OpenQuery",
          );
          output = { columns: res.columns, rowsCount: res.rows?.length || 0 };
          message = `Executed query '${p.queryName || "custom"}' (${res.rows?.length || 0} rows returned)`;
          break;
        }
        case "RunSQL": {
          const res = await run(
            resolvePrompts(p.sql, promptParams, d),
            "RunSQL",
          );
          variables.lastRowsAffected =
            res.rowsAffected ?? res.rows?.length ?? 0;
          message = `Executed SQL (${variables.lastRowsAffected} rows)`;
          break;
        }
        case "InsertRecord": {
          await run(
            parseRecordFieldsToInsertSql(
              tbl,
              p.fields || p.record || p.values,
              d,
            ),
            "InsertRecord",
          );
          variables.lastRowsAffected = 1;
          message = `Appended 1 record into '${tbl}'`;
          break;
        }
        case "UpdateRecord": {
          const res = await run(
            buildUpdateRecordSql(
              tbl,
              p.setValues || p.set || p.updates,
              p.whereCondition || p.where || p.condition,
              d,
            ),
            "UpdateRecord",
          );
          variables.lastRowsAffected = res.rowsAffected ?? 0;
          message = `Updated records in '${tbl}' (${variables.lastRowsAffected} rows affected)`;
          break;
        }
        case "DeleteRecord": {
          const res = await run(
            buildDeleteRecordSql(
              tbl,
              p.whereCondition || p.where || p.condition,
              d,
            ),
            "DeleteRecord",
          );
          variables.lastRowsAffected = res.rowsAffected ?? 0;
          message = `Deleted records from '${tbl}' (${variables.lastRowsAffected} rows affected)`;
          break;
        }
        case "EmptyTable": {
          const res = await run(buildEmptyTableSql(tbl, d), "EmptyTable");
          message = `Emptied table '${tbl}' (${res.rowsAffected ?? 0} rows removed)`;
          break;
        }
        case "MakeTable": {
          const newTbl = p.newTable || p.newTableName || p.tableName || p.table;
          let selectSql: string | undefined =
            p.selectSql || p.sourceSql || p.sql;
          if (p.queryName) {
            const found = lookupQuerySql(p.queryName);
            if (found) selectSql = found;
            else if (!selectSql)
              throw new Error(
                `Saved query '${p.queryName}' not found for MakeTable`,
              );
          }
          if (!selectSql)
            throw new Error(
              "MakeTable requires source SELECT query or saved query name",
            );
          for (const stmt of buildMakeTableStatements(
            newTbl,
            resolvePrompts(selectSql, promptParams, d),
            p.dropExisting !== false,
            d,
          )) {
            await run(stmt, "MakeTable");
          }
          output = { newTable: newTbl };
          message = `Created table '${newTbl}' from query`;
          break;
        }
        case "VacuumDatabase": {
          if (inTx)
            throw new Error(
              "Maintenance cannot run inside a transaction; run it as a separate (non-transactional) macro",
            );
          message = await adapter.maintenance(Boolean(p.analyze));
          break;
        }
        case "BackupDatabase": {
          message = await adapter.backup(p.mode || "all");
          break;
        }
        case "SetValue": {
          variables[p.item || "var"] = p.expression;
          message = `SetValue: [${p.item || "var"}] = ${JSON.stringify(p.expression)}`;
          break;
        }
        case "SetVariable": {
          variables[p.name || "var1"] = p.expression;
          message = `Variable [${p.name || "var1"}] set to ${JSON.stringify(p.expression)}`;
          break;
        }
        case "SetWarnings": {
          variables.warningsOn = Boolean(p.warningsOn);
          message = `SetWarnings: ${variables.warningsOn ? "ON" : "OFF"}`;
          break;
        }
        case "Comment": {
          message = `Remark: ${p.comment || ""}`;
          break;
        }
        case "RunCode": {
          const code = String(p.code ?? p.functionName ?? "").trim();
          if (!code) throw new Error("RunCode requires code");
          const canRunCode =
            opts.confirmRunCode === true ||
            (opts.confirmRunCode !== false &&
              Boolean(macro.id && store.isSessionSavedMacro(macro.id)));
          if (!canRunCode) {
            throw new Error(
              "RunCode requires explicit user confirmation (confirmRunCode: true)",
            );
          }
          const iso = await executeIsolatedRunCode(code, variables, {
            dialect: d,
            async query(sql: string) {
              const r = await run(
                resolvePrompts(sql, promptParams, d),
                "RunCode.query",
              );
              return r.rows || [];
            },
            async execute(sql: string) {
              const r = await run(
                resolvePrompts(sql, promptParams, d),
                "RunCode.execute",
              );
              const affected = r.rowsAffected ?? 0;
              variables.lastRowsAffected = affected;
              return { affectedRows: affected };
            },
            async tables() {
              return await adapter.listTables();
            },
          });
          Object.assign(variables, iso.variables);
          output = { returnValue: iso.returnValue, debugLogs: iso.debugLogs };
          message =
            iso.debugLogs.length > 0
              ? `RunCode: ${iso.debugLogs.join(" | ")}`
              : `Executed Bun JS RunCode`;
          break;
        }
        case "RunMacro": {
          const sub = await runCore(
            adapter,
            store,
            exec,
            inTx,
            p.macroName,
            variables,
            promptParams,
            depth + 1,
            opts,
          );
          logs.push({
            stepIndex: i + 1,
            actionId: act.id,
            action: act.action,
            condition: act.condition,
            conditionMet: true,
            parameters: p,
            status: sub.success ? "success" : "error",
            message: sub.success
              ? `Sub-macro '${sub.macroName}' finished (${sub.executedSteps} steps)`
              : `Sub-macro '${sub.macroName}' failed: ${sub.error}`,
            output: { logs: sub.logs },
            latencyMs: lat(),
          });
          executedSteps += sub.executedSteps;
          skippedSteps += sub.skippedSteps;
          Object.assign(variables, sub.variables || {});
          if (!sub.success) {
            failedSteps++;
            if (act.continueOnError ?? macro.onError === "continue") continue;
            return summary({ success: false, error: sub.error });
          }
          if (sub.halted) return summary({ halted: true });
          continue;
        }
        case "StopMacro": {
          logs.push({
            stepIndex: i + 1,
            actionId: act.id,
            action: act.action,
            condition: act.condition,
            conditionMet: true,
            parameters: p,
            status: "success",
            message: `Macro halted: ${p.reason || "Normal"}`,
            latencyMs: lat(),
          });
          executedSteps++;
          return summary({ halted: true });
        }
        default:
          // UI-only actions (dialogs, navigation, reports) have no server-side effect.
          message = `Validated action '${act.action}' for execution`;
      }

      logs.push({
        stepIndex: i + 1,
        actionId: act.id,
        action: act.action,
        condition: act.condition,
        conditionMet: true,
        parameters: p,
        status: "success",
        message,
        output,
        latencyMs: lat(),
      });
      executedSteps++;
    } catch (err: any) {
      failedSteps++;
      logs.push({
        stepIndex: i + 1,
        actionId: act.id,
        action: act.action,
        condition: act.condition,
        conditionMet: true,
        parameters: act.parameters || {},
        status: "error",
        message: err?.message || String(err),
        latencyMs: lat(),
      });
      if (act.continueOnError ?? macro.onError === "continue") continue;
      return summary({ success: false, error: err?.message || String(err) });
    }
  }

  return summary();
}

// -------------------------------------------------------------------------------------------------
// HTTP routes
// -------------------------------------------------------------------------------------------------

/** Handles /api/macros/* and /api/queries/*; returns null when the path isn't ours. */
export async function handleMacroRoute(
  adapter: MacroAdapter,
  store: MacroStore,
  req: Request,
  pathname: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  if (
    !pathname.startsWith("/api/macros") &&
    !pathname.startsWith("/api/queries") &&
    pathname !== "/api/codegen"
  )
    return null;
  const ok = (body: any, status = 200) =>
    Response.json(body, { status, headers });
  const bad = (err: any, status = 400) =>
    ok({ success: false, error: err?.message || String(err) }, status);
  const readBody = async () =>
    ((await req.json().catch(() => ({}))) || {}) as any;
  const isPost = req.method === "POST";

  try {
    if (
      (pathname === "/api/macros/list" || pathname === "/api/macros") &&
      (req.method === "GET" || isPost)
    ) {
      return ok({ success: true, macros: store.getMacros() });
    }
    if (pathname === "/api/macros/save" && isPost) {
      const body = await readBody();
      const res = store.saveMacro(body.macro);
      return ok(res, res.success ? 200 : 400);
    }
    if (pathname === "/api/macros/delete" && isPost) {
      const body = await readBody();
      return ok(store.deleteMacro(body.id || body.name || ""));
    }
    if (pathname === "/api/macros/run" && isPost) {
      const body = await readBody();
      const result = await runMacroAsync(
        adapter,
        store,
        body.macro || body.id || body.name || "",
        body.variables || {},
        {
          transaction: body.transaction,
          dryRun: body.dryRun,
          params: body.params,
          confirmRunCode: body.confirmRunCode,
          confirmedAutoExec: body.confirmedAutoExec,
          autoExec: body.autoExec,
          trigger: body.trigger,
        },
      );
      const requiresConsent = Boolean(
        (result as any).requiresConsent ||
        (result.error && /requires explicit/i.test(result.error)),
      );
      return ok({
        ok: result.success,
        success: result.success,
        ...(requiresConsent ? { requiresConsent: true } : {}),
        ...(result.error ? { error: result.error } : {}),
        result,
      });
    }
    if (pathname === "/api/macros/validate" && isPost) {
      const body = await readBody();
      return ok({
        success: true,
        issues: validateMacro(
          body.macro,
          store.getMacros().map((m) => m.name),
        ),
      });
    }
    if (pathname === "/api/macros/export" && isPost) {
      const body = await readBody();
      const macro: MacroDefinition | undefined =
        body.macro ||
        store.getMacros().find((m) => m.id === body.id || m.name === body.id);
      if (!macro) return ok({ success: false, error: "Macro not found" }, 404);
      const queries = store.getSavedQueries();
      const format = body.format || "json";
      const content =
        format === "sql"
          ? macroToSqlScript(macro, queries, adapter.dialect)
          : format === "vba"
            ? macroToVba(macro, queries, adapter.dialect)
            : format === "bun"
              ? macroToBunJs(macro, queries, adapter.dialect)
              : JSON.stringify(macro, null, 2);
      return ok({ success: true, format, content });
    }
    if (pathname === "/api/codegen" && isPost) {
      const body = await readBody();
      const result = handleCodegenRequest(body, {
        sourceDialect: adapter.dialect,
        queries: store.getSavedQueries(),
        macros: store.getMacros(),
        appName:
          adapter.dialect === "mysql"
            ? "MySQL Studio Pro"
            : "Postgres Studio Pro",
      });
      return ok({ success: true, ...result });
    }
    if (pathname === "/api/queries/list" && (req.method === "GET" || isPost)) {
      return ok({ success: true, queries: store.getSavedQueries() });
    }
    if (pathname === "/api/queries/save" && isPost) {
      const body = await readBody();
      const res = store.saveQuery(body.query);
      return ok(res, res.success ? 200 : 400);
    }
    if (pathname === "/api/queries/delete" && isPost) {
      const body = await readBody();
      return ok(store.deleteQuery(body.id || body.name || ""));
    }
  } catch (err) {
    return bad(err);
  }
  return null;
}
