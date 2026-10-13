import type { Capabilities, ColumnInfo, ForeignKeyInfo, IndexInfo, ObjectRef, TableInfo } from "../types";
import { DbError, normalizeError } from "../errors";
import { BunSqlAdapter } from "./bunsql";

const TEMPORAL = /^(date|datetime|timestamp|time|year)/i;

export class MysqlAdapter extends BunSqlAdapter {
  readonly engine = "mysql" as const;
  protected readonly beginSql = "START TRANSACTION";
  protected readonly beginReadOnlySql = "START TRANSACTION READ ONLY";
  protected readonly versionSql = "SELECT VERSION() AS v, DATABASE() AS d";
  protected readonly backendIdSql = "SELECT CONNECTION_ID() AS id";

  protected driverOptions() {
    return { allowPublicKeyRetrieval: Boolean(this.config.allowPublicKeyRetrieval) };
  }
  protected setTimeoutSql(ms: number) {
    return `SET SESSION max_execution_time = ${Math.max(0, Math.trunc(ms))}`;
  }
  protected resetTimeoutSql() {
    return "SET SESSION max_execution_time = 0";
  }
  protected cancelSql(id: string) {
    if (!/^\d+$/.test(id)) throw new Error("bad connection id");
    return `KILL QUERY ${id}`;
  }
  /**
   * Session-level read-only also blocks DDL. (A per-statement START TRANSACTION READ ONLY does not:
   * MySQL implicitly commits and then runs DDL.) The statement filter stops `SET` from undoing it.
   */
  protected override prepareReadOnlyConnection() {
    return ["SET SESSION transaction_read_only = 1"];
  }
  protected async enterGuard(conn: { unsafe(sql: string): Promise<unknown> }, timeoutMs: number) {
    if (timeoutMs) await conn.unsafe(this.setTimeoutSql(timeoutMs));
    return false;
  }
  protected async leaveGuard(conn: { unsafe(sql: string): Promise<unknown> }, _began: boolean, timeoutMs: number) {
    if (timeoutMs) await conn.unsafe(this.resetTimeoutSql());
  }

  protected textCast(expr: string) {
    return `CAST(${expr} AS CHAR)`;
  }
  /** Select temporal columns as text so DATETIME values are not reinterpreted as UTC instants. */
  protected override selectExpr(col: ColumnInfo) {
    const q = "`" + col.name.replace(/`/g, "``") + "`";
    return TEMPORAL.test(col.dataType) ? `CAST(${q} AS CHAR) AS ${q}` : q;
  }
  /** Compare text case-sensitively so that conflict detection is not fooled by a case-insensitive collation. */
  protected override eqExpr(col: ColumnInfo, ph: string) {
    const q = "`" + col.name.replace(/`/g, "``") + "`";
    return /char|text|enum|set/i.test(col.dataType) ? `BINARY ${q} = BINARY ${ph}` : `${q} = ${ph}`;
  }

  async capabilities(): Promise<Capabilities> {
    const info = await this.ping();
    const mariadb = /mariadb/i.test(info.version);
    return {
      engine: "mysql",
      version: info.version,
      schemas: false,
      transactionalDdl: false,
      cancelQuery: true,
      statementTimeout: true,
      readOnlyEnforcement: this.readOnly ? "transaction" : "none",
      explainAnalyze: /^8\.0\.(1[89]|[2-9]\d)|^8\.[1-9]|^9\./.test(info.version) && !mariadb,
      routines: true,
      sequences: false,
      notes: {
        transactionalDdl: "MySQL commits implicitly before and after DDL statements; DDL cannot be rolled back.",
        statementTimeout: "max_execution_time applies to SELECT statements only; other statements are not time-limited.",
        schemas: "In MySQL a schema is a database; this connection is bound to one database.",
        readOnly: "Read-only uses a session-level read-only setting plus a statement filter. For a hard guarantee use an account without write privileges.",
        temporal: "DATETIME/TIMESTAMP values are shown as stored text (no time-zone conversion).",
      },
    };
  }

  async listObjects(): Promise<ObjectRef[]> {
    try {
      const rows = (await this.p.unsafe(
        "SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type IN ('BASE TABLE','VIEW') ORDER BY table_name",
      )) as { name: string; type: string }[];
      return rows.map((r) => ({ name: r.name, type: /view/i.test(r.type) ? "view" : "table" }));
    } catch (e) {
      throw normalizeError("mysql", e, [this.password]);
    }
  }

  async describeTable(ref: ObjectRef): Promise<TableInfo> {
    try {
      const t = (await this.p.unsafe("SELECT table_name AS name, table_type AS type, table_comment AS comment FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", [ref.name])) as { name: string; type: string; comment: string }[];
      if (!t[0]) throw new DbError("OBJECT_NOT_FOUND", `Table or view "${ref.name}" does not exist.`);
      const cols = (await this.p.unsafe(
        "SELECT column_name AS name, column_type AS data_type, is_nullable AS nullable, column_default AS dflt, column_key AS ckey, extra AS extra, generation_expression AS gen, column_comment AS comment FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
        [ref.name],
      )) as { name: string; data_type: string; nullable: string; dflt: string | null; ckey: string; extra: string; gen: string | null; comment: string }[];
      const pk = (await this.p.unsafe(
        "SELECT column_name AS name, ordinal_position AS pos FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = 'PRIMARY' ORDER BY ordinal_position",
        [ref.name],
      )) as { name: string; pos: number }[];
      const pkPos = new Map(pk.map((r, i) => [r.name, i + 1]));
      const columns: ColumnInfo[] = cols.map((c) => ({
        name: c.name,
        dataType: c.data_type,
        nullable: c.nullable === "YES",
        defaultValue: c.dflt,
        primaryKeyPosition: pkPos.get(c.name) ?? null,
        autoIncrement: /auto_increment/i.test(c.extra),
        generated: /generated/i.test(c.extra),
        comment: c.comment || null,
      }));
      const fkRows = (await this.p.unsafe(
        "SELECT k.constraint_name AS name, k.column_name AS col, k.referenced_table_name AS ref_table, k.referenced_column_name AS ref_col, r.delete_rule AS del, r.update_rule AS upd, k.ordinal_position AS pos FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name WHERE k.table_schema = DATABASE() AND k.table_name = ? AND k.referenced_table_name IS NOT NULL ORDER BY k.constraint_name, k.ordinal_position",
        [ref.name],
      )) as { name: string; col: string; ref_table: string; ref_col: string; del: string; upd: string }[];
      const fks = new Map<string, ForeignKeyInfo>();
      for (const f of fkRows) {
        const e = fks.get(f.name) ?? { name: f.name, columns: [], refTable: f.ref_table, refColumns: [], onDelete: f.del, onUpdate: f.upd };
        e.columns.push(f.col);
        e.refColumns.push(f.ref_col);
        fks.set(f.name, e);
      }
      const idxRows = (await this.p.unsafe(
        "SELECT index_name AS name, non_unique AS non_unique, column_name AS col, seq_in_index AS seq FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index",
        [ref.name],
      )) as { name: string; non_unique: number | string; col: string | null }[];
      const idx = new Map<string, IndexInfo>();
      for (const r of idxRows) {
        const e = idx.get(r.name) ?? { name: r.name, unique: Number(r.non_unique) === 0, primary: r.name === "PRIMARY", columns: [] };
        e.columns.push(r.col ?? "<expression>");
        idx.set(r.name, e);
      }
      return {
        name: t[0].name,
        type: /view/i.test(t[0].type) ? "view" : "table",
        columns,
        primaryKey: pk.map((r) => r.name),
        foreignKeys: [...fks.values()],
        indexes: [...idx.values()],
        comment: t[0].comment || null,
      };
    } catch (e) {
      throw normalizeError("mysql", e, [this.password]);
    }
  }
}
