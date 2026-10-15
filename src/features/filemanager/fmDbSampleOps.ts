/**
 * "New sample database…" of the Databases tab: creates a brand-new SQLite file holding one of the sample datasets
 * (src/db/samples) and saves it as a connection. An existing file is never overwritten and no folder is created.
 */
import { Database } from "bun:sqlite";
import { statSync } from "fs";
import { catalog, getDataset } from "../../db/samples/catalog";
import { SCALES, type Scale } from "../../db/samples/model";
import { SampleError, createSqliteFile } from "../../db/samples/targets";
import { absolutePath, pathApi, type FmHandler } from "./fmCore";
import { checkSqlitePath, dbState, guarded } from "./fmDbState";
import { FmError } from "./fmPaths";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$/;

export const sampleOperations: Record<string, FmHandler> = {
  async "db/sample/catalog"() {
    return {
      scales: SCALES,
      datasets: catalog("sqlite").map((d) => ({
        id: d.id, title: d.title, tagline: d.tagline, description: d.description, tags: d.tags, highlights: d.highlights,
        tableCount: d.tableCount, viewCount: d.viewCount, queryCount: d.queries.length, rows: d.rows, estimatedSeconds: d.estimatedSeconds,
        tables: d.tables.map((t) => ({ name: t.name, rows: t.rows })), syntheticNotice: d.syntheticNotice,
      })),
    };
  },

  async "db/sample/create"(ctx, b) {
    const ds = getDataset(String(b.datasetId ?? ""));
    if (!ds) throw new FmError("BAD_REQUEST", "Choose a sample database.");
    const scale = String(b.scale ?? "small") as Scale;
    if (!SCALES.includes(scale)) throw new FmError("BAD_REQUEST", "Choose Small, Medium or Large.");
    const folder = absolutePath(ctx, b.folder);
    const fst = (() => { try { return statSync(folder); } catch { return null; } })();
    if (!fst?.isDirectory()) throw new FmError("NOT_FOUND", "That folder doesn't exist. Choose an existing folder; none is created for you.");
    const raw = typeof b.name === "string" ? b.name.trim() : "";
    if (!NAME_RE.test(raw)) throw new FmError("BAD_REQUEST", "Give the file a name made of letters, digits, spaces, dots, dashes or underscores.");
    const file = /\.(sqlite|sqlite3|db|db3)$/i.test(raw) ? raw : `${raw}.sqlite`;
    const path = pathApi(ctx).join(folder, file);
    try {
      statSync(path);
      throw new FmError("EXISTS", `A file named ${file} already exists there. Pick another name; existing files are never overwritten.`);
    } catch (e) {
      if (e instanceof FmError) throw e;
    }
    await checkSqlitePath(ctx, path, "create");
    let summary;
    try {
      summary = await createSqliteFile(path, ds, { datasetId: ds.id, scale, target: path, mode: "new" }, {}, (p) => new Database(p, { create: true }));
    } catch (e) {
      if (e instanceof SampleError) throw new FmError(e.code === "exists" ? "EXISTS" : "BAD_REQUEST", e.message);
      throw e;
    }
    let profile = null;
    if (b.save !== false) {
      const st = dbState(ctx);
      const name = typeof b.connectionName === "string" && b.connectionName.trim() ? b.connectionName.trim().slice(0, 80) : `${ds.title} (${scale})`;
      profile = await guarded(() => st.store.save({ engine: "sqlite", name, path, sqliteMode: "readwrite", tags: ["sample"] }, undefined, undefined));
      st.store.setMeta(profile.id, { source: "manual", savedAt: new Date().toISOString() });
    }
    return { path, summary, profile };
  },
};
