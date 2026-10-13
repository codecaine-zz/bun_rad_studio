import type { Capabilities, ColumnInfo, ForeignKeyInfo, IndexInfo, ObjectRef, TableInfo } from "../types";
import { DbError, normalizeError } from "../errors";
import { BunSqlAdapter } from "./bunsql";

export class PostgresAdapter extends BunSqlAdapter {
  readonly engine = "postgres" as const;
  protected readonly beginSql = "BEGIN";
  protected readonly beginReadOnlySql = "BEGIN READ ONLY";
  protected readonly versionSql = "SELECT version() AS v, current_database() AS d";
  protected readonly backendIdSql = "SELECT pg_backend_pid() AS id";

  protected driverOptions() {
    return {};
  }
  protected setTimeoutSql(ms: number) {
    return `SET statement_timeout = ${Math.max(0, Math.trunc(ms))}`;
  }
  protected resetTimeoutSql() {
    return "SET statement_timeout = 0";
  }
  protected cancelSql(id: string) {
    if (!/^\d+$/.test(id)) throw new Error("bad backend pid");
    return `SELECT pg_cancel_backend(${id})`;
  }
  /** Each statement runs alone in `BEGIN READ ONLY ... ROLLBACK`; the statement filter blocks COMMIT/SET tricks. */
  protected async enterGuard(conn: { unsafe(sql: string): Promise<unknown> }, timeoutMs: number) {
    await conn.unsafe(this.readOnly ? this.beginReadOnlySql : this.beginSql);
    if (timeoutMs) await conn.unsafe(`SET LOCAL statement_timeout = ${Math.max(0, Math.trunc(timeoutMs))}`);
    return true;
  }
  protected async leaveGuard(conn: { unsafe(sql: string): Promise<unknown> }, began: boolean, _t: number, failed: boolean) {
    if (!began) return;
    await conn.unsafe(failed || this.readOnly ? "ROLLBACK" : "COMMIT");
  }

  protected textCast(expr: string) {
    return `${expr}::text`;
  }
  /** `json` and `xml` have no equality operator; compare their text form. */
  protected override eqExpr(col: ColumnInfo, ph: string) {
    const q = '"' + col.name.replace(/"/g, '""') + '"';
    return /^(json|xml)$/i.test(col.dataType) ? `${q}::text = ${ph}::text` : `${q} = ${ph}`;
  }

  async capabilities(): Promise<Capabilities> {
    const info = await this.ping();
    return {
      engine: "postgres",
      version: info.version,
      schemas: true,
      transactionalDdl: true,
      cancelQuery: true,
      statementTimeout: true,
      readOnlyEnforcement: this.readOnly ? "transaction" : "none",
      explainAnalyze: true,
      routines: true,
      sequences: true,
      notes: {
        explainAnalyze: "EXPLAIN ANALYZE executes the statement. This tool never runs it automatically for data-changing statements.",
        readOnly: "Read-only runs each statement in BEGIN READ ONLY (always rolled back) plus a statement filter. For a hard guarantee use a role without write privileges.",
        timeout: "statement_timeout is enforced by the server and cancels the running statement.",
      },
    };
  }

  async listObjects(): Promise<ObjectRef[]> {
    try {
      const rows = (await this.p.unsafe(
        `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%'
         ORDER BY n.nspname, c.relname`,
      )) as { schema: string; name: string; kind: string }[];
      return rows.map((r) => ({ schema: r.schema, name: r.name, type: r.kind === "v" || r.kind === "m" ? "view" : "table" }));
    } catch (e) {
      throw normalizeError("postgres", e, [this.password]);
    }
  }

  async describeTable(ref: ObjectRef): Promise<TableInfo> {
    const schema = ref.schema || this.config.schema || "public";
    try {
      const rel = (await this.p.unsafe(
        `SELECT c.oid::bigint AS oid, c.relkind AS kind, obj_description(c.oid, 'pg_class') AS comment
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m','f')`,
        [schema, ref.name],
      )) as { oid: string | number; kind: string; comment: string | null }[];
      if (!rel[0]) throw new DbError("OBJECT_NOT_FOUND", `Table or view "${schema}.${ref.name}" does not exist.`);
      const oid = String(rel[0].oid);
      const cols = (await this.p.unsafe(
        `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS data_type, NOT a.attnotnull AS nullable,
                pg_get_expr(d.adbin, d.adrelid) AS dflt, a.attidentity AS identity, a.attgenerated AS generated, col_description(a.attrelid, a.attnum) AS comment
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [oid],
      )) as { name: string; data_type: string; nullable: boolean; dflt: string | null; identity: string; generated: string; comment: string | null }[];
      const pk = (await this.p.unsafe(
        `SELECT a.attname AS name FROM pg_constraint c
         JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.conrelid = $1::oid AND c.contype = 'p' ORDER BY k.ord`,
        [oid],
      )) as { name: string }[];
      const pkPos = new Map(pk.map((r, i) => [r.name, i + 1]));
      const columns: ColumnInfo[] = cols.map((c) => ({
        name: c.name,
        dataType: c.data_type,
        nullable: Boolean(c.nullable),
        defaultValue: c.dflt,
        primaryKeyPosition: pkPos.get(c.name) ?? null,
        autoIncrement: Boolean(c.identity) || /^nextval\(/i.test(c.dflt ?? ""),
        generated: c.generated === "s",
        comment: c.comment,
      }));
      const fkRows = (await this.p.unsafe(
        `SELECT c.conname AS name, rn.nspname AS ref_schema, rc.relname AS ref_table, c.confdeltype AS del, c.confupdtype AS upd,
                (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
                (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS ref_cols
         FROM pg_constraint c JOIN pg_class rc ON rc.oid = c.confrelid JOIN pg_namespace rn ON rn.oid = rc.relnamespace
         WHERE c.conrelid = $1::oid AND c.contype = 'f' ORDER BY c.conname`,
        [oid],
      )) as { name: string; ref_schema: string; ref_table: string; del: string; upd: string; cols: string[]; ref_cols: string[] }[];
      const rule = (x: string) => ({ a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" })[x] ?? x;
      const foreignKeys: ForeignKeyInfo[] = fkRows.map((f) => ({ name: f.name, columns: f.cols, refSchema: f.ref_schema, refTable: f.ref_table, refColumns: f.ref_cols, onDelete: rule(f.del), onUpdate: rule(f.upd) }));
      const idxRows = (await this.p.unsafe(
        `SELECT ic.relname AS name, i.indisunique AS uniq, i.indisprimary AS prim,
                (SELECT array_agg(pg_get_indexdef(i.indexrelid, k, true) ORDER BY k) FROM generate_series(1, i.indnkeyatts) k) AS cols
         FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid = $1::oid ORDER BY ic.relname`,
        [oid],
      )) as { name: string; uniq: boolean; prim: boolean; cols: string[] }[];
      const indexes: IndexInfo[] = idxRows.map((i) => ({ name: i.name, unique: i.uniq, primary: i.prim, columns: i.cols }));
      return { schema, name: ref.name, type: rel[0].kind === "v" || rel[0].kind === "m" ? "view" : "table", columns, primaryKey: pk.map((r) => r.name), foreignKeys, indexes, comment: rel[0].comment };
    } catch (e) {
      throw normalizeError("postgres", e, [this.password]);
    }
  }
}
