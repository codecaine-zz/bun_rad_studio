import type {
  BrowseRequest,
  BrowseResult,
  Capabilities,
  ColumnInfo,
  ConnectionConfig,
  DbAdapter,
  DbSession,
  EditableInfo,
  Engine,
  ObjectRef,
  Param,
  QueryOptions,
  QueryResult,
  RowDelete,
  RowInsert,
  RowUpdate,
  ServerInfo,
  TableInfo,
  WireValue,
} from "../types";
import { DbError } from "../errors";
import { LIKE_ESCAPE, escapeLike, placeholder, quoteIdent, quoteRef } from "../quote";
import { csvCell } from "../wire";

export const MAX_PAGE = 5000;
export const SQLITE_ROWID_COLUMN = "__rowid__";

export type Executor = (sql: string, params: Param[], options?: QueryOptions) => Promise<QueryResult>;

/** Shared behavior built on top of an engine-specific `execute` + catalog introspection. */
export abstract class BaseAdapter implements DbAdapter {
  abstract readonly engine: Engine;
  readonly config: Readonly<Omit<ConnectionConfig, "password">>;
  protected readonly password: string | undefined;

  constructor(config: ConnectionConfig) {
    const { password, ...rest } = config;
    this.password = password;
    this.config = Object.freeze({ ...rest });
  }

  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;
  abstract ping(): Promise<ServerInfo>;
  abstract capabilities(): Promise<Capabilities>;
  abstract openSession(): Promise<DbSession>;
  abstract listObjects(): Promise<ObjectRef[]>;
  abstract describeTable(ref: ObjectRef): Promise<TableInfo>;
  protected abstract execute: Executor;
  /** Expression to select a column so that its text/exact form survives (e.g. MySQL DATETIME). */
  protected selectExpr(col: ColumnInfo): string {
    return quoteIdent(this.engine, col.name);
  }
  protected abstract textCast(expr: string): string;
  /** Equality predicate for conflict detection / key matching on one column. */
  protected eqExpr(col: ColumnInfo, ph: string): string {
    return `${quoteIdent(this.engine, col.name)} = ${ph}`;
  }

  query(sql: string, params: Param[] = [], options?: QueryOptions): Promise<QueryResult> {
    return this.execute(sql, params, options);
  }

  protected ph(n: number): string {
    return placeholder(this.engine, n);
  }

  /** Resolve and validate a table reference against the real catalog (never trust client names). */
  protected async resolveTable(ref: ObjectRef): Promise<TableInfo> {
    if (!ref || typeof ref.name !== "string" || ref.name === "") throw new DbError("INVALID_REQUEST", "Table name is required");
    return this.describeTable(ref);
  }

  editableInfo(t: TableInfo): EditableInfo {
    if (t.type === "view") return { ok: false, reason: "Views are read-only. Edit the underlying table instead." };
    if (t.primaryKey.length > 0) return { ok: true, keyColumns: t.primaryKey, keyKind: "primary" };
    if (this.engine === "sqlite" && t.hasRowid) return { ok: true, keyColumns: ["rowid"], keyKind: "rowid" };
    return {
      ok: false,
      reason: "This table has no primary key, so a row cannot be identified safely. Add a primary key to enable editing.",
    };
  }

  async browse(req: BrowseRequest): Promise<BrowseResult> {
    const table = await this.resolveTable(req.table);
    const limit = Math.min(Math.max(Math.trunc(Number(req.limit) || 50), 1), MAX_PAGE);
    const offset = Math.max(Math.trunc(Number(req.offset) || 0), 0);
    const byName = new Map(table.columns.map((c) => [c.name, c]));
    const params: Param[] = [];
    const where: string[] = [];
    for (const f of req.filters ?? []) {
      const col = byName.get(f.column);
      if (!col) throw new DbError("INVALID_REQUEST", `Unknown column "${f.column}"`);
      const q = quoteIdent(this.engine, col.name);
      const bind = (v: Param) => {
        params.push(v);
        return this.ph(params.length);
      };
      switch (f.op) {
        case "isNull":
          where.push(`${q} IS NULL`);
          break;
        case "notNull":
          where.push(`${q} IS NOT NULL`);
          break;
        case "contains":
        case "startsWith": {
          if (typeof f.value !== "string") throw new DbError("INVALID_REQUEST", `Filter on "${f.column}" needs a text value`);
          const text = escapeLike(f.value);
          where.push(`${this.textCast(q)} LIKE ${bind(f.op === "contains" ? `%${text}%` : `${text}%`)} ESCAPE '${LIKE_ESCAPE}'`);
          break;
        }
        default: {
          const sym = { eq: "=", ne: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" }[f.op];
          if (!sym) throw new DbError("INVALID_REQUEST", `Unsupported filter operator "${String(f.op)}"`);
          if (f.value === undefined || f.value === null) throw new DbError("INVALID_REQUEST", `Filter on "${f.column}" needs a value (use isNull to match NULL)`);
          where.push(`${q} ${sym} ${bind(f.value)}`);
        }
      }
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const editable = this.editableInfo(table);
    const order: string[] = [];
    for (const o of req.orderBy ?? []) {
      const col = byName.get(o.column);
      if (!col) throw new DbError("INVALID_REQUEST", `Cannot sort by unknown column "${o.column}"`);
      order.push(`${quoteIdent(this.engine, col.name)} ${o.direction === "desc" ? "DESC" : "ASC"}`);
    }
    // A stable order makes paging deterministic: fall back to the identifying key, then all columns.
    if (order.length === 0) {
      if (editable.ok && editable.keyKind === "rowid") order.push("rowid ASC");
      else if (table.primaryKey.length) for (const k of table.primaryKey) order.push(`${quoteIdent(this.engine, k)} ASC`);
    }

    const rowidSel = editable.ok && editable.keyKind === "rowid" ? `, rowid AS ${quoteIdent(this.engine, SQLITE_ROWID_COLUMN)}` : "";
    const sel = table.columns.map((c) => this.selectExpr(c)).join(", ") + rowidSel;
    const from = quoteRef(this.engine, table);
    const orderSql = order.length ? ` ORDER BY ${order.join(", ")}` : "";
    const n = params.length;
    const page = await this.execute(
      `SELECT ${sel} FROM ${from}${whereSql}${orderSql} LIMIT ${this.ph(n + 1)} OFFSET ${this.ph(n + 2)}`,
      [...params, limit, offset],
    );
    const count = await this.execute(`SELECT COUNT(*) AS total FROM ${from}${whereSql}`, params);
    const total = Number(count.rows[0]?.total ?? 0);
    return { columns: table.columns, rows: page.rows, total, limit, offset, editable };
  }

  /** Build `col = ?` (or IS NULL) predicates; returns SQL and appends values to `params`. */
  private predicates(table: TableInfo, values: Record<string, Param>, params: Param[]): string[] {
    const out: string[] = [];
    for (const [name, v] of Object.entries(values)) {
      const col = table.columns.find((c) => c.name === name);
      if (!col) throw new DbError("INVALID_REQUEST", `Unknown column "${name}"`);
      if (v === null) {
        out.push(`${quoteIdent(this.engine, name)} IS NULL`);
      } else {
        params.push(v);
        out.push(this.eqExpr(col, this.ph(params.length)));
      }
    }
    return out;
  }

  private async keyWhere(table: TableInfo, key: Record<string, Param>, params: Param[]): Promise<string[]> {
    const editable = this.editableInfo(table);
    if (!editable.ok) throw new DbError("NOT_EDITABLE", editable.reason);
    const given = Object.keys(key ?? {}).sort();
    const need = [...editable.keyColumns].sort();
    if (given.length !== need.length || given.some((g, i) => g !== need[i])) {
      throw new DbError("INVALID_REQUEST", `Row key must contain exactly: ${editable.keyColumns.join(", ")}`);
    }
    for (const k of need) if (key[k] === null || key[k] === undefined) throw new DbError("INVALID_REQUEST", `Key column "${k}" cannot be NULL`);
    if (editable.keyKind === "rowid") {
      params.push(key.rowid as Param);
      return [`rowid = ${this.ph(params.length)}`];
    }
    return this.predicates(table, key, params);
  }

  async insertRow(req: RowInsert): Promise<QueryResult> {
    const table = await this.resolveTable(req.table);
    if (table.type === "view") throw new DbError("NOT_EDITABLE", "Views are read-only.");
    const names = Object.keys(req.values ?? {});
    const params: Param[] = [];
    let sql: string;
    if (names.length === 0) {
      sql = this.engine === "mysql" ? `INSERT INTO ${quoteRef(this.engine, table)} () VALUES ()` : `INSERT INTO ${quoteRef(this.engine, table)} DEFAULT VALUES`;
    } else {
      const cols: string[] = [];
      for (const name of names) {
        const col = table.columns.find((c) => c.name === name);
        if (!col) throw new DbError("INVALID_REQUEST", `Unknown column "${name}"`);
        if (col.generated) throw new DbError("INVALID_REQUEST", `Column "${name}" is generated and cannot be set`);
        cols.push(quoteIdent(this.engine, name));
        params.push(req.values[name] as Param);
      }
      sql = `INSERT INTO ${quoteRef(this.engine, table)} (${cols.join(", ")}) VALUES (${params.map((_, i) => this.ph(i + 1)).join(", ")})`;
    }
    return this.execute(sql, params);
  }

  async updateRow(req: RowUpdate): Promise<QueryResult> {
    const table = await this.resolveTable(req.table);
    const changes = Object.entries(req.changes ?? {});
    if (changes.length === 0) throw new DbError("INVALID_REQUEST", "No changes to save");
    const params: Param[] = [];
    const sets: string[] = [];
    for (const [name, v] of changes) {
      const col = table.columns.find((c) => c.name === name);
      if (!col) throw new DbError("INVALID_REQUEST", `Unknown column "${name}"`);
      if (col.generated) throw new DbError("INVALID_REQUEST", `Column "${name}" is generated and cannot be changed`);
      params.push(v);
      sets.push(`${quoteIdent(this.engine, name)} = ${this.ph(params.length)}`);
    }
    const where = await this.keyWhere(table, req.key, params);
    const guard = this.predicates(table, req.expected ?? {}, params);
    const from = quoteRef(this.engine, table);
    const res = await this.execute(`UPDATE ${from} SET ${sets.join(", ")} WHERE ${[...where, ...guard].join(" AND ")}`, params);
    return this.confirmWrite(res, table, req.key, req.expected ?? {}, "update");
  }

  async deleteRow(req: RowDelete): Promise<QueryResult> {
    const table = await this.resolveTable(req.table);
    const params: Param[] = [];
    const where = await this.keyWhere(table, req.key, params);
    const guard = this.predicates(table, req.expected ?? {}, params);
    const res = await this.execute(`DELETE FROM ${quoteRef(this.engine, table)} WHERE ${[...where, ...guard].join(" AND ")}`, params);
    return this.confirmWrite(res, table, req.key, req.expected ?? {}, "delete");
  }

  /**
   * An UPDATE/DELETE that touched no rows means the row was changed or removed since the client read it.
   * (MySQL also reports 0 when an UPDATE sets identical values, so re-check before declaring a conflict.)
   */
  private async confirmWrite(res: QueryResult, table: TableInfo, key: Record<string, Param>, expected: Record<string, Param>, op: "update" | "delete"): Promise<QueryResult> {
    if ((res.affectedRows ?? 0) > 0) {
      if (res.affectedRows! > 1) throw new DbError("CONFLICT", `Refusing to continue: ${op} affected ${res.affectedRows} rows instead of 1. Verify the table's key.`);
      return res;
    }
    if (op === "update" && res.affectedRows === 0 && this.engine === "mysql") {
      const params: Param[] = [];
      const where = [...(await this.keyWhere(table, key, params)), ...this.predicates(table, expected, params)];
      const still = await this.execute(`SELECT 1 AS present FROM ${quoteRef(this.engine, table)} WHERE ${where.join(" AND ")}`, params);
      if (still.rows.length === 1) return res;
    }
    throw new DbError(
      "CONFLICT",
      `The row was changed or deleted by someone else since you loaded it, so nothing was ${op === "update" ? "updated" : "deleted"}.`,
      "Refresh the data and apply your change again.",
    );
  }

  async *exportCsv(source: { table: ObjectRef; excludeColumns?: string[] } | { sql: string; params?: Param[] }): AsyncGenerator<string> {
    if ("sql" in source) {
      yield* this.exportSqlCsv(source.sql, source.params ?? []);
      return;
    }
    const table = await this.resolveTable(source.table);
    const exclude = new Set(source.excludeColumns ?? []);
    for (const name of exclude) if (!table.columns.some((c) => c.name === name)) throw new DbError("INVALID_REQUEST", `Unknown column "${name}"`);
    const cols = table.columns.filter((c) => !exclude.has(c.name));
    if (cols.length === 0) throw new DbError("INVALID_REQUEST", "No columns left to export");
    yield cols.map((c) => csvCell(c.name)).join(",") + "\r\n";
    const editable = this.editableInfo(table);
    const order = table.primaryKey.length ? table.primaryKey : editable.ok && editable.keyKind === "rowid" ? ["rowid"] : table.columns.map((c) => c.name);
    const orderSql = order.map((c) => (c === "rowid" && editable.ok && editable.keyKind === "rowid" ? "rowid" : quoteIdent(this.engine, c))).join(", ");
    const sel = cols.map((c) => this.selectExpr(c)).join(", ");
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.execute(`SELECT ${sel} FROM ${quoteRef(this.engine, table)} ORDER BY ${orderSql} LIMIT ${this.ph(1)} OFFSET ${this.ph(2)}`, [pageSize, offset]);
      for (const row of page.rows) yield cols.map((c) => csvCell(row[c.name] ?? null)).join(",") + "\r\n";
      if (page.rows.length < pageSize) return;
    }
  }

  protected async *exportSqlCsv(sql: string, params: Param[]): AsyncGenerator<string> {
    const res = await this.execute(sql, params);
    if (res.columns.length) yield res.columns.map((c) => csvCell(c)).join(",") + "\r\n";
    for (const row of res.rows) yield res.columns.map((c) => csvCell(row[c] ?? null)).join(",") + "\r\n";
  }
}

export type { WireValue };
