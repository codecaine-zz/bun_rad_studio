// Cross-engine database and table cloning wizard: clone whole databases, selected tables, views, indexes,
// foreign keys, and Redis key groups between SQLite, MySQL / MariaDB, PostgreSQL, Redis, and SQLite files on disk.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { isSqliteFile } from "./dbFiles.js";
import { db, engineInfo, errorText, field, loadOverview, summaryOf } from "./dbState.js";
import { toast } from "./menus.js";
import { openPower } from "./power.js";
import { emit, state } from "./state.js";
import { baseName } from "./util.js";

const fmt = (n) => Number(n ?? 0).toLocaleString();
const SRC_SQLITE_FILE = "__sqlite_file__";
const DST_NEW_SQLITE = "__new_sqlite__";
const DST_SQLITE_FILE = "__sqlite_file__";

function cleanStem(label) {
  const base = String(label ?? "database")
    .replace(/\.(sqlite|sqlite3|db|db3|s3db)$/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "database";
}

function buildEndpointSpec(selectVal, fileInputVal, newSqliteControls) {
  if (selectVal === DST_NEW_SQLITE && newSqliteControls) {
    return {
      kind: "newSqlite",
      folder: newSqliteControls.folder.value.trim(),
      name: newSqliteControls.name.value.trim(),
      saveProfile: newSqliteControls.save.checked,
    };
  }
  if (selectVal === SRC_SQLITE_FILE || selectVal === DST_SQLITE_FILE) {
    return {
      kind: "sqliteFile",
      path: fileInputVal.trim(),
    };
  }
  return {
    kind: "profile",
    profileId: selectVal,
  };
}

/**
 * Opens the Clone Database / Tables dialog.
 * @param { { sourceProfileId?: string, sourcePath?: string, targetProfileId?: string } } [opts]
 */
export async function showCloneDialog(opts = {}) {
  if (!db.loaded) {
    try {
      await loadOverview();
    } catch (err) {
      toast(errorText(err, "The saved database connections couldn't be loaded."), { kind: "error" });
      return null;
    }
  }

  const cloneableProfiles = db.profiles.filter((p) => !(p.engine === "sqlite" && p.sqliteMode === "memory"));
  const folderNow = state.location?.kind === "folder" && state.location.path ? state.location.path : state.home;

  const initialSourceVal = opts.sourcePath
    ? SRC_SQLITE_FILE
    : opts.sourceProfileId && cloneableProfiles.some((p) => p.id === opts.sourceProfileId)
      ? opts.sourceProfileId
      : cloneableProfiles[0]?.id ?? SRC_SQLITE_FILE;

  const otherProfile = cloneableProfiles.find((p) => p.id !== initialSourceVal);
  const initialTargetVal =
    opts.targetProfileId && cloneableProfiles.some((p) => p.id === opts.targetProfileId)
      ? opts.targetProfileId
      : otherProfile?.id ?? DST_NEW_SQLITE;

  // Source controls
  const srcSelect = h(
    "select",
    { class: "text-input", "aria-label": "Source database", title: "Choose the source connection or SQLite file to clone from" },
    ...cloneableProfiles.map((p) => {
      const info = engineInfo(p.engine);
      return h("option", { value: p.id, selected: p.id === initialSourceVal }, `${info.icon} ${p.name} (${info.label} · ${summaryOf(p)})`);
    }),
    h("option", { value: SRC_SQLITE_FILE, selected: initialSourceVal === SRC_SQLITE_FILE }, "🪶 SQLite file on disk…"),
  );
  const srcPathInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    placeholder: "/path/to/source.sqlite",
    "aria-label": "Source SQLite file path",
    value: opts.sourcePath ?? "",
    autocomplete: "off",
    spellcheck: "false",
  });
  const srcLoadFileBtn = h("button", { type: "button", class: "pw-btn", title: "Inspect this SQLite file and list its tables and views" }, "Inspect file");
  const srcFileRow = h(
    "div",
    { class: "pw-row db-clone-filerow", hidden: initialSourceVal !== SRC_SQLITE_FILE },
    field("Source SQLite file", srcPathInput, "Full path of an existing SQLite database file (opened read-only).", "db-wide"),
    srcLoadFileBtn,
  );
  const srcSummary = h("div", { class: "db-clone-summary pw-hint", "aria-live": "polite" });

  // Target controls
  const dstSelect = h(
    "select",
    { class: "text-input", "aria-label": "Target database", title: "Choose the destination database connection or SQLite file" },
    h("option", { value: DST_NEW_SQLITE, selected: initialTargetVal === DST_NEW_SQLITE }, "🪶 New SQLite database file…"),
    ...cloneableProfiles.map((p) => {
      const info = engineInfo(p.engine);
      return h("option", { value: p.id, selected: p.id === initialTargetVal }, `${info.icon} ${p.name} (${info.label} · ${summaryOf(p)})`);
    }),
    h("option", { value: DST_SQLITE_FILE, selected: initialTargetVal === DST_SQLITE_FILE }, "🪶 Existing SQLite file on disk…"),
  );
  const dstFolderInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    "aria-label": "Folder for the new SQLite file",
    value: folderNow ?? "",
    autocomplete: "off",
    spellcheck: "false",
  });
  const dstNameInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    "aria-label": "File name for the new SQLite file",
    value: "cloned_database.sqlite",
    autocomplete: "off",
    spellcheck: "false",
  });
  let dstNameTouched = false;
  dstNameInput.addEventListener("input", () => {
    dstNameTouched = true;
  });
  const dstSaveCheck = h("input", { type: "checkbox", checked: true, "aria-label": "Save new SQLite file as a connection" });
  const dstNewSqliteBox = h(
    "div",
    { class: "db-form db-clone-target-sub", hidden: initialTargetVal !== DST_NEW_SQLITE },
    field("Folder", dstFolderInput, "Existing folder where the new .sqlite file will be created."),
    field("New file name", dstNameInput, ".sqlite is added automatically if omitted."),
    h(
      "label",
      { class: "db-check db-wide", title: "Save the newly created SQLite file in your Databases connections list" },
      dstSaveCheck,
      " Also save the new SQLite file as a connection in Databases",
    ),
  );
  const dstPathInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    placeholder: "/path/to/target.sqlite",
    "aria-label": "Target SQLite file path",
    autocomplete: "off",
    spellcheck: "false",
  });
  const dstFileRow = h(
    "div",
    { class: "db-clone-target-sub", hidden: initialTargetVal !== DST_SQLITE_FILE },
    field("Target SQLite file", dstPathInput, "Full path of an existing SQLite file to clone tables into.", "db-wide"),
  );

  // Object selection state & UI
  let inspectedObjects = [];
  const selectedNames = new Set();
  const renameOverrides = new Map();
  let objectFilter = "";

  const filterInput = h("input", {
    type: "search",
    class: "text-input db-clone-filter",
    placeholder: "Filter tables, views or key groups",
    "aria-label": "Filter tables, views or key groups",
    autocomplete: "off",
  });
  const selectAllBtn = h("button", { type: "button", class: "pw-btn", title: "Select all listed tables, views and key groups" }, "Select all");
  const selectNoneBtn = h("button", { type: "button", class: "pw-btn", title: "Deselect all objects" }, "Select none");
  const tablesOnlyBtn = h("button", { type: "button", class: "pw-btn", title: "Select only tables and key groups (exclude views)" }, "Tables only");
  const refreshBtn = h("button", { type: "button", class: "pw-btn", title: "Reload tables, views and row counts from the source database" }, "↻ Refresh");
  const selectionMeta = h("span", { class: "pw-hint db-clone-selmeta", "aria-live": "polite" });
  const objectList = h("div", { class: "db-clone-list", role: "group", "aria-label": "Tables, views and key groups to clone" });

  // Clone options controls
  const contentSelect = h(
    "select",
    { class: "text-input", "aria-label": "What to copy", title: "Choose whether to copy structure and data, structure only, or data only" },
    h("option", { value: "all", selected: true }, "Structure and data (tables + rows / keys)"),
    h("option", { value: "schema" }, "Structure only (DDL — no rows)"),
    h("option", { value: "data" }, "Data only (rows / keys)"),
  );
  const conflictSelect = h(
    "select",
    { class: "text-input", "aria-label": "When a target table or key already exists", title: "Choose how existing target tables or keys should be handled" },
    h("option", { value: "replace", selected: true }, "Drop and recreate table / overwrite keys"),
    h("option", { value: "truncate" }, "Clear existing rows (truncate), then copy"),
    h("option", { value: "append" }, "Keep existing rows, append new (ignore conflicts)"),
    h("option", { value: "upsert" }, "Keep existing rows, update matching primary keys (upsert)"),
    h("option", { value: "skip" }, "Skip tables / keys that already exist"),
    h("option", { value: "fail" }, "Stop with an error if any target exists"),
  );
  const prefixInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    placeholder: "e.g. copy_ or bak_",
    "aria-label": "Target table or key prefix",
    autocomplete: "off",
    spellcheck: "false",
  });
  const rowLimitInput = h("input", {
    type: "number",
    class: "text-input pw-mono",
    min: "1",
    max: "1000000",
    placeholder: "All rows",
    "aria-label": "Row limit per table",
  });
  const redisFormatSelect = h(
    "select",
    { class: "text-input", "aria-label": "Redis key format when cloning SQL tables to Redis", title: "How SQL rows are stored when cloning into Redis" },
    h("option", { value: "hash", selected: true }, "Redis Hash per row (<table>:<pk> with column fields)"),
    h("option", { value: "json" }, "JSON string per row (<table>:<pk>)"),
  );
  const idxCheck = h("input", { type: "checkbox", checked: true, "aria-label": "Copy secondary indexes" });
  const fkCheck = h("input", { type: "checkbox", checked: true, "aria-label": "Copy foreign key constraints" });
  const viewCheck = h("input", { type: "checkbox", checked: true, "aria-label": "Include views" });
  const matViewCheck = h("input", { type: "checkbox", checked: false, "aria-label": "Materialize views as tables" });

  const previewBox = h("div", { class: "db-clone-preview", "aria-live": "polite", hidden: true });

  function updateSelectionMeta() {
    const active = inspectedObjects.filter((o) => selectedNames.has(o.name) && (viewCheck.checked || o.kind !== "view"));
    const rows = active.reduce((s, o) => s + (o.rowCount ?? 0), 0);
    selectionMeta.textContent = `${active.length} of ${inspectedObjects.length} selected · ${fmt(rows)} total rows/keys`;
  }

  function renderObjects() {
    clear(objectList);
    updateSelectionMeta();
    if (!inspectedObjects.length) {
      objectList.append(h("p", { class: "pw-hint db-clone-empty" }, "No tables, views or keys were found in this source database."));
      return;
    }
    const q = objectFilter.trim().toLowerCase();
    const visible = inspectedObjects.filter((o) => {
      if (!viewCheck.checked && o.kind === "view") return false;
      if (!q) return true;
      const cols = (o.columns ?? []).map((c) => c.name).join(" ");
      return `${o.name} ${o.kind} ${cols}`.toLowerCase().includes(q);
    });
    if (!visible.length) {
      objectList.append(h("p", { class: "pw-hint db-clone-empty" }, "No objects match that filter."));
      return;
    }

    for (const obj of visible) {
      const cb = h("input", {
        type: "checkbox",
        checked: selectedNames.has(obj.name),
        "aria-label": `Include ${obj.name}`,
        onchange: () => {
          if (cb.checked) selectedNames.add(obj.name);
          else selectedNames.delete(obj.name);
          updateSelectionMeta();
        },
      });
      const kindBadge = h(
        "span",
        { class: `db-tag db-clone-kind db-clone-kind-${obj.kind}` },
        obj.kind === "redis_group" ? `redis ${obj.redisKeyType ?? "keys"}` : obj.kind,
      );
      const details = [];
      details.push(`${fmt(obj.rowCount)} ${obj.kind === "redis_group" ? (obj.rowCount === 1 ? "key" : "keys") : obj.rowCount === 1 ? "row" : "rows"}`);
      if (obj.columns?.length) details.push(`${obj.columns.length} ${obj.columns.length === 1 ? "col" : "cols"}`);
      if (obj.primaryKey?.length) details.push(`PK: ${obj.primaryKey.join(", ")}`);
      if (obj.indexes?.filter((i) => !i.primary).length) {
        const ic = obj.indexes.filter((i) => !i.primary).length;
        details.push(`${ic} ${ic === 1 ? "index" : "indexes"}`);
      }
      if (obj.foreignKeys?.length) {
        details.push(`FK → ${obj.foreignKeys.map((f) => f.refTable).join(", ")}`);
      }

      const renameInput = h("input", {
        type: "text",
        class: "text-input pw-mono db-clone-rename",
        placeholder: `Target name (${obj.name})`,
        "aria-label": `Target name for ${obj.name}`,
        title: `Optional new target name for ${obj.name}`,
        value: renameOverrides.get(obj.name) ?? "",
        autocomplete: "off",
        spellcheck: "false",
        oninput: () => {
          const v = renameInput.value.trim();
          if (v) renameOverrides.set(obj.name, v);
          else renameOverrides.delete(obj.name);
        },
      });

      const colPreview = (obj.columns ?? [])
        .slice(0, 8)
        .map((c) => `${c.name}:${c.dataType || c.canonicalType}`)
        .join(", ");

      objectList.append(
        h(
          "div",
          { class: "db-clone-item", title: colPreview ? `Columns: ${colPreview}` : obj.name },
          h("label", { class: "db-clone-item-main" }, cb, kindBadge, h("span", { class: "pw-mono db-clone-item-name" }, obj.name), h("span", { class: "pw-hint db-clone-item-meta" }, details.join(" · "))),
          renameInput,
        ),
      );
    }
  }

  let inspectToken = 0;
  async function inspectCurrentSource() {
    const myToken = ++inspectToken;
    srcFileRow.hidden = srcSelect.value !== SRC_SQLITE_FILE;
    previewBox.hidden = true;
    clear(previewBox);

    if (srcSelect.value === SRC_SQLITE_FILE && !srcPathInput.value.trim()) {
      inspectedObjects = [];
      selectedNames.clear();
      srcSummary.textContent = "Type the full path of a SQLite file above and click “Inspect file”.";
      renderObjects();
      return;
    }

    srcSummary.textContent = "Inspecting source database…";
    objectList.replaceChildren(h("p", { class: "pw-hint db-clone-empty" }, "Loading tables, views and row counts…"));

    try {
      const source = buildEndpointSpec(srcSelect.value, srcPathInput.value, null);
      const res = await call("db/clone/inspect", { source });
      if (myToken !== inspectToken) return;
      inspectedObjects = res.objects ?? [];
      selectedNames.clear();
      renameOverrides.clear();
      for (const o of inspectedObjects) {
        if (viewCheck.checked || o.kind !== "view") selectedNames.add(o.name);
      }
      if (!dstNameTouched) {
        dstNameInput.value = `${cleanStem(res.source.label)}_clone.sqlite`;
      }
      const tCount = inspectedObjects.filter((o) => o.kind === "table").length;
      const vCount = inspectedObjects.filter((o) => o.kind === "view").length;
      const gCount = inspectedObjects.filter((o) => o.kind === "redis_group").length;
      const parts = [`${res.source.engineLabel} · ${res.source.label}`];
      if (gCount) parts.push(`${gCount} key ${gCount === 1 ? "group" : "groups"}`);
      else parts.push(`${tCount} ${tCount === 1 ? "table" : "tables"}, ${vCount} ${vCount === 1 ? "view" : "views"}`);
      parts.push(`${fmt(res.totalRows)} total ${res.source.engine === "redis" ? "keys" : "rows"}`);
      srcSummary.textContent = parts.join(" · ");
      renderObjects();
    } catch (err) {
      if (myToken !== inspectToken) return;
      inspectedObjects = [];
      selectedNames.clear();
      srcSummary.textContent = errorText(err, "Could not inspect that source database.");
      renderObjects();
    }
  }

  function syncTargetVisibility() {
    dstNewSqliteBox.hidden = dstSelect.value !== DST_NEW_SQLITE;
    dstFileRow.hidden = dstSelect.value !== DST_SQLITE_FILE;
    previewBox.hidden = true;
  }

  function gatherPayload() {
    const source = buildEndpointSpec(srcSelect.value, srcPathInput.value, null);
    const target = buildEndpointSpec(dstSelect.value, dstPathInput.value, {
      folder: dstFolderInput,
      name: dstNameInput,
      save: dstSaveCheck,
    });
    const renameMap = {};
    for (const [k, v] of renameOverrides.entries()) {
      if (v) renameMap[k] = v;
    }
    const tables = inspectedObjects.filter((o) => selectedNames.has(o.name) && (viewCheck.checked || o.kind !== "view")).map((o) => o.name);
    const limitVal = Number(rowLimitInput.value);
    return {
      source,
      target,
      options: {
        tables,
        tablePrefix: prefixInput.value.trim(),
        renameMap,
        contentMode: contentSelect.value,
        conflictMode: conflictSelect.value,
        includeIndexes: idxCheck.checked,
        includeForeignKeys: fkCheck.checked,
        includeViews: viewCheck.checked,
        viewMode: matViewCheck.checked ? "table" : "view",
        ...(Number.isFinite(limitVal) && limitVal > 0 ? { rowLimit: Math.trunc(limitVal) } : {}),
        redisFormat: redisFormatSelect.value,
      },
    };
  }

  srcSelect.addEventListener("change", () => void inspectCurrentSource());
  srcLoadFileBtn.addEventListener("click", () => void inspectCurrentSource());
  dstSelect.addEventListener("change", syncTargetVisibility);
  filterInput.addEventListener("input", () => {
    objectFilter = filterInput.value;
    renderObjects();
  });
  selectAllBtn.addEventListener("click", () => {
    for (const o of inspectedObjects) {
      if (viewCheck.checked || o.kind !== "view") selectedNames.add(o.name);
    }
    renderObjects();
  });
  selectNoneBtn.addEventListener("click", () => {
    selectedNames.clear();
    renderObjects();
  });
  tablesOnlyBtn.addEventListener("click", () => {
    selectedNames.clear();
    for (const o of inspectedObjects) {
      if (o.kind !== "view") selectedNames.add(o.name);
    }
    renderObjects();
  });
  refreshBtn.addEventListener("click", () => void inspectCurrentSource());
  viewCheck.addEventListener("change", () => {
    if (!viewCheck.checked) {
      for (const o of inspectedObjects) if (o.kind === "view") selectedNames.delete(o.name);
    }
    renderObjects();
  });

  const previewBtn = h("button", { type: "button", class: "pw-btn", title: "Preview the planned target tables, row counts, cross-engine type mappings and generated DDL" }, "Preview plan & SQL");

  previewBtn.addEventListener("click", async () => {
    dlg.setError("");
    previewBtn.disabled = true;
    previewBtn.textContent = "Previewing…";
    try {
      const res = await call("db/clone/preview", gatherPayload());
      clear(previewBox);
      previewBox.hidden = false;
      const head = h(
        "p",
        { class: "db-clone-preview-head" },
        `Plan: ${res.plans.length} ${res.plans.length === 1 ? "object" : "objects"} from ${res.source.label} (${res.source.engineLabel}) → ${res.target.label} (${res.target.engineLabel}) · ~${fmt(res.totalEstimatedRows)} rows/keys.`,
      );
      previewBox.append(head);
      if (res.warnings?.length) {
        previewBox.append(
          h(
            "ul",
            { class: "db-warnings" },
            ...res.warnings.map((w) => h("li", {}, `ℹ ${w}`)),
          ),
        );
      }
      const planRows = res.plans.map((p) =>
        h(
          "li",
          { class: "db-clone-plan-item" },
          h("span", { class: "pw-mono" }, `${p.sourceName} → ${p.targetName}`),
          h("span", { class: "pw-hint" }, ` (${p.action}${p.targetExists ? ", exists on target" : ", new"} · ${fmt(p.estimatedRows)} rows/keys)`),
          p.ddl?.length ? h("pre", { class: "pw-mono db-clone-ddl" }, p.ddl.join(";\n") + ";") : null,
        ),
      );
      previewBox.append(h("ul", { class: "db-clone-plan-list" }, ...planRows));
    } catch (err) {
      dlg.setError(errorText(err, "Could not build the clone preview."));
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = "Preview plan & SQL";
    }
  });

  const dlg = openDialog({
    title: "Clone database or tables",
    wide: true,
    body: [
      h(
        "p",
        { class: "pw-hint" },
        "Clone an entire database or selected tables, views, indexes, foreign keys and Redis key groups across SQLite, MySQL / MariaDB, PostgreSQL and Redis.",
      ),
      h(
        "div",
        { class: "db-form" },
        field("Source database", srcSelect, "Where tables, views or keys are read from (read-only)."),
        field("Target database", dstSelect, "Where tables, views or keys will be written."),
      ),
      srcFileRow,
      dstNewSqliteBox,
      dstFileRow,
      srcSummary,
      h(
        "div",
        { class: "pw-row db-clone-bar" },
        filterInput,
        selectAllBtn,
        selectNoneBtn,
        tablesOnlyBtn,
        refreshBtn,
        selectionMeta,
      ),
      objectList,
      h(
        "div",
        { class: "db-form" },
        field("What to copy", contentSelect, "Copy structure + rows, structure only, or rows only."),
        field("If target exists", conflictSelect, "How to handle tables or keys already in the target."),
        field("Target name prefix", prefixInput, "Optional prefix added to every cloned table or key group."),
        field("Row / key limit per table", rowLimitInput, "Leave blank to copy all rows/keys."),
        field("SQL → Redis format", redisFormatSelect, "Used when the target is a Redis connection."),
      ),
      h(
        "div",
        { class: "db-checks" },
        h("label", { class: "db-check", title: "Recreate secondary indexes on the target database" }, idxCheck, " Copy indexes"),
        h("label", { class: "db-check", title: "Recreate foreign key constraints between cloned tables" }, fkCheck, " Copy foreign keys"),
        h("label", { class: "db-check", title: "Include database views in the clone" }, viewCheck, " Include views"),
        h("label", { class: "db-check", title: "Create views as regular tables holding their rows" }, matViewCheck, " Materialize views as tables"),
        previewBtn,
      ),
      previewBox,
    ],
    buttons: [
      { label: "Cancel", value: null },
      { label: "Clone now", value: "go", primary: true },
    ],
    describe: "Choose a source database, which tables or key groups to clone, a destination database, and conflict options.",
    initialFocus: srcSelect,
  });

  syncTargetVisibility();
  void inspectCurrentSource();

  const goBtn = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    async function executeRun(confirmWrites = false) {
      dlg.setError("");
      goBtn.disabled = true;
      goBtn.textContent = "Cloning…";
      dlg.el.setAttribute("aria-busy", "true");
      try {
        const payload = { ...gatherPayload(), ...(confirmWrites ? { confirmWrites: true } : {}) };
        const res = await call("db/clone/run", payload);
        dlg.close("go");
        await loadOverview().catch(() => {});
        emit("db-overview");
        const s = res.summary;
        const msg = `Cloned ${s.results.filter((r) => r.status !== "skipped").length} ${s.results.length === 1 ? "object" : "objects"} (${fmt(s.rowsCopied)} ${s.targetEngine === "redis" ? "keys" : "rows"}) from ${s.sourceLabel} to ${s.targetLabel} in ${s.elapsedMs} ms.`;
        toast(msg, { kind: "info" });
        resolve(res);
      } catch (err) {
        goBtn.disabled = false;
        goBtn.textContent = "Clone now";
        dlg.el.removeAttribute("aria-busy");
        if (err instanceof ApiError && err.code === "NEEDS_CONFIRM" && !confirmWrites) {
          const ok = await confirmBox({
            title: err.details?.reason === "production" ? "Write to a production database?" : "Write to a read-only connection?",
            message: err.message,
            confirmLabel: "Clone anyway",
            danger: true,
          });
          if (ok) return await executeRun(true);
          return;
        }
        dlg.setError(errorText(err, "The database clone couldn't be completed."));
      }
    }

    goBtn.addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        void executeRun(false);
      },
      true,
    );
    dlg.result.then(() => resolve(null));
  });
}

/** Context-menu item for cloning a selected SQLite file in the File Manager. */
export function cloneSqliteMenuItems(entries) {
  if (entries.length !== 1 || entries[0].isDir || !isSqliteFile(entries[0])) return [];
  const e = entries[0];
  return [
    {
      label: "Clone database / tables…",
      icon: "🧬",
      tip: `Clone ${baseName(e.path, state.sep)} (or selected tables from it) into another database connection or a new SQLite file.`,
      action: async () => {
        const res = await showCloneDialog({ sourcePath: e.path });
        if (res?.createdProfile?.id) {
          openPower("databases", { select: res.createdProfile.id });
        }
      },
    },
  ];
}
