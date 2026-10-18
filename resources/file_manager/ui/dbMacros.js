// Bun JavaScript & Visual Macro Studio for the File Manager Databases tool.
// Brings Microsoft Access-style visual macros (DoCmd, RunSQL, OpenQuery, SetTempVar, RunCode) and
// VBA-style modules (CurrentDb, OpenRecordset, DLookup/DCount/DSum, TempVars, MsgBox, Debug.print)
// powered by the Bun JavaScript/TypeScript runtime across SQLite, MySQL, PostgreSQL, and Redis.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog, promptBox } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { isSqliteFile } from "./dbFiles.js";
import { db, engineInfo, errorText, field, loadOverview, summaryOf } from "./dbState.js";
import { toast } from "./menus.js";
import { state } from "./state.js";
import { baseName } from "./util.js";

const TARGET_MEMORY = "__memory_scratch__";
const TARGET_SQLITE_FILE = "__sqlite_file__";

const CODE_SNIPPETS = [
  {
    label: "CurrentDb.query",
    tip: "Run a SELECT query and get an array of row objects",
    code: `const rows = await CurrentDb.query("SELECT * FROM customers WHERE points >= ?", [100]);\nDebug.print("Rows:", rows.length);\nreturn rows;`,
  },
  {
    label: "OpenRecordset",
    tip: "Iterate rows using a Microsoft Access-style DAO Recordset",
    code: `const rs = await CurrentDb.OpenRecordset("SELECT id, name, points FROM customers ORDER BY points DESC");\nwhile (!rs.EOF) {\n  Debug.print(rs.Fields("name"), "->", rs.Fields("points"));\n  rs.MoveNext();\n}\nrs.Close();`,
  },
  {
    label: "DCount / DLookup / DSum",
    tip: "Use Microsoft Access Domain Aggregate functions",
    code: `const count = await DCount("*", "customers", "points >= 100");\nconst topName = await DLookup("name", "customers", "points >= 100");\nconst totalPaid = await DSum("total_cents", "orders", "status = 'paid'");\nDebug.print({ count, topName, totalPaid });`,
  },
  {
    label: "DoCmd.RunSQL + TempVars",
    tip: "Run parameterized DML SQL and store state in TempVars",
    code: `await DoCmd.SetTempVar("bonusPoints", 25);\nawait DoCmd.RunSQL("UPDATE customers SET points = points + ? WHERE active = 1", [TempVars.bonusPoints]);\nMsgBox(\`Added \${TempVars.bonusPoints} points to \${CurrentDb.RecordsAffected} customer(s).\`, "Points Bonus", "success");`,
  },
  {
    label: "db.transaction",
    tip: "Wrap multiple writes in a savepoint transaction",
    code: `await db.transaction(async (tx) => {\n  await tx.insert("audit_logs", { event: "batch_start", detail: "Starting update", created_at: new Date().toISOString() });\n  await tx.update("customers", { tier: "VIP" }, "points >= ?", [200]);\n});`,
  },
  {
    label: "connections.use()",
    tip: "Connect to another saved database connection in the same macro",
    code: `const list = connections.list();\nDebug.print("Saved connections:", list.map((c) => \`\${c.name} (\${c.engine})\`).join(", "));\n// const other = await connections.use("My Other DB");\n// const rows = await other.db.query("SELECT 1 AS ok");`,
  },
];

function safeStr(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return "";
    }
  }
  return String(val);
}

function parseParamsInput(rawText) {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const out = {};
  for (const part of trimmed.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k) out[k] = v;
    }
  }
  return out;
}

function formatParamsInput(obj) {
  if (!obj || typeof obj !== "object") return "";
  return Object.entries(obj)
    .filter(([k, v]) => k && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

/**
 * Opens the Bun JS & Visual Macro Studio dialog in the File Manager Databases tool.
 * @param { { profileId?: string, sqlitePath?: string, macroId?: string } } [opts]
 */
export async function showMacrosDialog(opts = {}) {
  if (!db.loaded) {
    try {
      await loadOverview();
    } catch (err) {
      toast(errorText(err, "The saved database connections couldn't be loaded."), { kind: "error" });
      return null;
    }
  }

  let listRes;
  try {
    listRes = await call("db/macros/list", {});
  } catch (err) {
    toast(errorText(err, "Database macros couldn't be loaded."), { kind: "error" });
    return null;
  }

  let macros = Array.isArray(listRes.macros) ? listRes.macros : [];
  const catalog = Array.isArray(listRes.catalog) ? listRes.catalog : [];
  const bunVersion = safeStr(listRes.bunVersion || "1.x");

  const initialTargetVal = opts.sqlitePath
    ? TARGET_SQLITE_FILE
    : opts.profileId && db.profiles.some((p) => p.id === opts.profileId)
      ? opts.profileId
      : db.selectedId && db.profiles.some((p) => p.id === db.selectedId)
        ? db.selectedId
        : TARGET_MEMORY;

  let current = macros.find((m) => m.id === opts.macroId) ?? macros[0] ?? {
    id: "",
    name: "New Bun JS Macro",
    description: "",
    mode: "code",
    engine: "any",
    code: `// Bun JS Macro — use CurrentDb, DoCmd, DCount, DLookup, DSum, TempVars, MsgBox, Debug.print\nconst tables = await CurrentDb.tables();\nDebug.print("Tables:", tables.length);\nreturn tables;`,
    actions: [],
    transaction: false,
    timeoutMs: 10000,
    defaultParams: {},
  };
  current = structuredClone(current);

  let searchFilter = "";
  let lastRunResult = null;

  // Sidebar controls
  const filterInput = h("input", {
    type: "search",
    class: "text-input",
    placeholder: "Filter macros…",
    "aria-label": "Filter macros by name or description",
    autocomplete: "off",
  });
  const newCodeBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Create a new macro written in Bun JavaScript / TypeScript with CurrentDb and DoCmd",
    },
    "＋ Bun JS",
  );
  const newActionsBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Create a new visual Microsoft Access-style action macro",
    },
    "＋ Visual Actions",
  );
  const macroListBox = h("div", { class: "db-macro-list", role: "listbox", "aria-label": "Saved database macros" });

  // Editor header controls
  const nameInput = h("input", {
    type: "text",
    class: "text-input",
    placeholder: "Macro name",
    "aria-label": "Macro name",
    value: safeStr(current.name),
    autocomplete: "off",
  });
  const descInput = h("input", {
    type: "text",
    class: "text-input",
    placeholder: "What this macro automates…",
    "aria-label": "Macro description",
    value: safeStr(current.description),
    autocomplete: "off",
  });
  const engineSelect = h(
    "select",
    {
      class: "text-input",
      "aria-label": "Macro target engine compatibility",
      title: "Restrict this macro to a specific database engine or allow any engine",
    },
    h("option", { value: "any" }, "🌐 Any Engine"),
    h("option", { value: "sqlite" }, "🪶 SQLite"),
    h("option", { value: "mysql" }, "🐬 MySQL / MariaDB"),
    h("option", { value: "postgres" }, "🐘 PostgreSQL"),
    h("option", { value: "redis" }, "🟥 Redis"),
  );

  // Target connection bar
  const targetSelect = h(
    "select",
    {
      class: "text-input",
      "aria-label": "Target database connection",
      title: "Choose which database connection, SQLite file, or scratch database to run this macro against",
    },
    h("option", { value: TARGET_MEMORY, selected: initialTargetVal === TARGET_MEMORY }, "🧪 Scratch SQLite (In-Memory Demo DB)"),
    ...db.profiles.map((p) => {
      const info = engineInfo(p.engine);
      return h(
        "option",
        { value: p.id, selected: p.id === initialTargetVal },
        `${info.icon} ${p.name} (${info.label} · ${summaryOf(p)})`,
      );
    }),
    h("option", { value: TARGET_SQLITE_FILE, selected: initialTargetVal === TARGET_SQLITE_FILE }, "🪶 SQLite file on disk…"),
  );

  const sqlitePathInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    placeholder: "/path/to/database.sqlite",
    "aria-label": "Target SQLite file path",
    value: safeStr(opts.sqlitePath ?? ""),
    autocomplete: "off",
    spellcheck: "false",
  });
  const sqliteFileWrap = h(
    "div",
    { class: "pw-row", hidden: initialTargetVal !== TARGET_SQLITE_FILE },
    field("SQLite file path", sqlitePathInput, "Full path to a local SQLite database file.", "db-wide"),
  );

  const txCheck = h("input", {
    type: "checkbox",
    checked: Boolean(current.transaction),
    "aria-label": "Wrap macro execution in an atomic transaction",
  });
  const dryRunCheck = h("input", {
    type: "checkbox",
    checked: false,
    "aria-label": "Dry run mode: execute macro and roll back all changes at the end",
  });
  const paramsInput = h("input", {
    type: "text",
    class: "text-input pw-mono",
    placeholder: "minPoints=100, newTier=VIP",
    "aria-label": "Runtime macro parameters (key=value or JSON)",
    value: formatParamsInput(current.defaultParams),
    autocomplete: "off",
  });

  // Mode switcher & conversion buttons
  const modeCodeBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Author macro using Bun JavaScript / TypeScript code (like Access VBA modules)",
    },
    "🥟 Bun JS Code (VBA Style)",
  );
  const modeActionsBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Author macro using visual action rows (like the Access Macro Designer)",
    },
    "⚡ Visual Actions (DoCmd)",
  );
  const convertToCodeBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Convert visual action rows into Bun JavaScript code (like Access 'Convert Macro to Visual Basic')",
    },
    "⇄ Convert Actions to Bun JS",
  );
  const validateBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Transpile and validate macro syntax with Bun.Transpiler without executing it",
    },
    "✓ Check Syntax",
  );

  // Code editor pane
  const codeTextarea = h("textarea", {
    class: "text-input pw-mono db-macro-code",
    rows: 13,
    spellcheck: "false",
    "aria-label": "Bun JavaScript macro source code",
    placeholder: "// Write Bun JavaScript or TypeScript using CurrentDb, DoCmd, DLookup, DCount, TempVars, MsgBox, Debug.print…",
  });
  codeTextarea.value = safeStr(current.code);

  const snippetRow = h(
    "div",
    { class: "pw-row db-macro-snippets", role: "group", "aria-label": "Insert Access-style Bun JS snippet" },
    h("span", { class: "pw-hint" }, "Insert snippet:"),
    ...CODE_SNIPPETS.map((s) =>
      h(
        "button",
        {
          type: "button",
          class: "pw-btn db-macro-chip",
          title: s.tip,
          onclick: () => {
            const cur = codeTextarea.value;
            codeTextarea.value = cur.trim() ? `${cur.trimEnd()}\n\n${s.code}\n` : `${s.code}\n`;
            current.code = codeTextarea.value;
            codeTextarea.focus();
          },
        },
        s.label,
      ),
    ),
  );

  const codePane = h(
    "div",
    { class: "db-macro-code-pane" },
    snippetRow,
    codeTextarea,
    h(
      "p",
      { class: "pw-hint" },
      `Bun v${bunVersion} globals: `,
      h("code", {}, "CurrentDb / db"),
      ", ",
      h("code", {}, "DoCmd"),
      ", ",
      h("code", {}, "DCount / DLookup / DSum / DAvg / DMin / DMax"),
      ", ",
      h("code", {}, "TempVars"),
      ", ",
      h("code", {}, "params"),
      ", ",
      h("code", {}, "MsgBox"),
      ", ",
      h("code", {}, "Debug.print"),
      ", ",
      h("code", {}, "redis"),
      ", ",
      h("code", {}, "connections.use()"),
      ".",
    ),
  );

  // Visual actions builder pane
  const actionRowsBox = h("div", { class: "db-macro-actions-list", role: "region", "aria-label": "Visual macro action steps" });
  const addActionStepBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Append a new DoCmd / RunCode action step to this macro",
    },
    "＋ Add Action Step",
  );
  const actionsPane = h(
    "div",
    { class: "db-macro-actions-pane", hidden: true },
    actionRowsBox,
    h("div", { class: "pw-row" }, addActionStepBtn, convertToCodeBtn),
  );

  // Action bar buttons (Save, Duplicate, Delete, Export)
  const saveBtn = h("button", { type: "button", class: "pw-btn", title: "Save changes to this macro" }, "💾 Save Macro");
  const dupBtn = h("button", { type: "button", class: "pw-btn", title: "Duplicate this macro" }, "📋 Duplicate");
  const delBtn = h("button", { type: "button", class: "pw-btn danger", title: "Delete this saved macro" }, "🗑️ Delete");
  const exportBunBtn = h("button", { type: "button", class: "pw-btn", title: "Export as a standalone runnable Bun TypeScript script (.ts)" }, "🥟 Export .ts");
  const exportVbaBtn = h("button", { type: "button", class: "pw-btn", title: "Export as a Microsoft Access VBA Module (.bas)" }, "🧾 Export VBA");
  const exportSqlBtn = h("button", { type: "button", class: "pw-btn", title: "Export SQL statements from this macro (.sql)" }, "📄 Export .sql");

  // Validation / Export / Immediate output boxes
  const statusBanner = h("div", { class: "db-macro-status", role: "status", "aria-live": "polite" });
  const exportBox = h("div", { class: "db-macro-export", hidden: true });
  const outputBox = h("div", { class: "db-macro-output", "aria-live": "polite" });

  function syncDraftFromInputs() {
    current.name = nameInput.value.trim() || "Untitled Macro";
    current.description = descInput.value.trim();
    current.engine = engineSelect.value;
    current.transaction = txCheck.checked;
    current.code = codeTextarea.value;
    current.defaultParams = parseParamsInput(paramsInput.value);
  }

  function renderMacroSidebar() {
    clear(macroListBox);
    const q = searchFilter.trim().toLowerCase();
    const filtered = macros.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        m.mode.toLowerCase().includes(q),
    );
    if (filtered.length === 0) {
      macroListBox.append(h("p", { class: "pw-hint" }, "No macros match your filter."));
      return;
    }
    for (const m of filtered) {
      const active = m.id && m.id === current.id;
      const badgeText = m.mode === "actions" ? "⚡ Actions" : "🥟 Bun JS";
      const item = h(
        "button",
        {
          type: "button",
          role: "option",
          "aria-selected": active ? "true" : "false",
          class: `db-macro-item${active ? " active" : ""}`,
          title: `${m.name} — ${m.description || badgeText}`,
          onclick: () => {
            current = structuredClone(m);
            loadMacroIntoEditor();
          },
        },
        h(
          "div",
          { class: "db-macro-item-top" },
          h("strong", {}, safeStr(m.name)),
          h("span", { class: "db-tag" }, badgeText),
        ),
        m.description ? h("div", { class: "db-macro-item-desc pw-hint" }, safeStr(m.description)) : null,
      );
      macroListBox.append(item);
    }
  }

  function renderActionRows() {
    clear(actionRowsBox);
    if (!Array.isArray(current.actions) || current.actions.length === 0) {
      actionRowsBox.append(
        h(
          "p",
          { class: "pw-hint" },
          "No visual action steps yet. Click “＋ Add Action Step” to add RunSQL, OpenQuery, SetTempVar, RunCode, or MessageBox steps.",
        ),
      );
      return;
    }

    current.actions.forEach((row, idx) => {
      const catEntry = catalog.find((c) => c.action === row.action) ?? catalog[0];
      const enabledChk = h("input", {
        type: "checkbox",
        checked: row.enabled !== false,
        "aria-label": `Enable step ${idx + 1}`,
        title: "Enable or disable this macro step",
        onchange: () => {
          row.enabled = enabledChk.checked;
        },
      });

      const actSelect = h(
        "select",
        {
          class: "text-input db-macro-act-select",
          "aria-label": `Action for step ${idx + 1}`,
          title: "Choose the Access / Bun macro action for this step",
          onchange: () => {
            row.action = actSelect.value;
            row.params = row.params || {};
            renderActionRows();
          },
        },
        ...catalog.map((c) =>
          h("option", { value: c.action, selected: c.action === row.action }, `${c.label} — ${c.category}`),
        ),
      );

      const moveUpBtn = h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          disabled: idx === 0,
          title: `Move step ${idx + 1} up`,
          "aria-label": `Move step ${idx + 1} up`,
          onclick: () => {
            if (idx <= 0) return;
            const tmp = current.actions[idx - 1];
            current.actions[idx - 1] = current.actions[idx];
            current.actions[idx] = tmp;
            renderActionRows();
          },
        },
        "↑",
      );

      const moveDownBtn = h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          disabled: idx === current.actions.length - 1,
          title: `Move step ${idx + 1} down`,
          "aria-label": `Move step ${idx + 1} down`,
          onclick: () => {
            if (idx >= current.actions.length - 1) return;
            const tmp = current.actions[idx + 1];
            current.actions[idx + 1] = current.actions[idx];
            current.actions[idx] = tmp;
            renderActionRows();
          },
        },
        "↓",
      );

      const removeStepBtn = h(
        "button",
        {
          type: "button",
          class: "pw-btn danger",
          title: `Remove step ${idx + 1}`,
          "aria-label": `Remove step ${idx + 1}`,
          onclick: () => {
            current.actions.splice(idx, 1);
            renderActionRows();
          },
        },
        "✕",
      );

      const paramFields = (catEntry?.fields ?? []).map((f) => {
        const val = safeStr(row.params?.[f.key] ?? "");
        const ctrl = f.multiline
          ? h("textarea", {
              class: "text-input pw-mono",
              rows: 2,
              placeholder: f.placeholder,
              "aria-label": `Step ${idx + 1} ${f.label}`,
              spellcheck: "false",
              oninput: (e) => {
                row.params = row.params || {};
                row.params[f.key] = e.target.value;
              },
            })
          : h("input", {
              type: "text",
              class: "text-input pw-mono",
              value: val,
              placeholder: f.placeholder,
              "aria-label": `Step ${idx + 1} ${f.label}`,
              autocomplete: "off",
              oninput: (e) => {
                row.params = row.params || {};
                row.params[f.key] = e.target.value;
              },
            });
        if (f.multiline) ctrl.value = val;
        return field(f.label, ctrl, undefined, "db-wide");
      });

      const condInput = h("input", {
        type: "text",
        class: "text-input pw-mono",
        value: safeStr(row.condition ?? ""),
        placeholder: "Optional JS condition, e.g. Number(TempVars.vipCount) > 0",
        "aria-label": `Step ${idx + 1} condition expression`,
        autocomplete: "off",
        oninput: (e) => {
          row.condition = e.target.value;
        },
      });

      const commentInput = h("input", {
        type: "text",
        class: "text-input",
        value: safeStr(row.comment ?? ""),
        placeholder: "Step note…",
        "aria-label": `Step ${idx + 1} comment`,
        autocomplete: "off",
        oninput: (e) => {
          row.comment = e.target.value;
        },
      });

      const stepCard = h(
        "div",
        { class: "db-macro-step-card" },
        h(
          "div",
          { class: "pw-row db-macro-step-head" },
          h("span", { class: "db-tag" }, `#${idx + 1}`),
          enabledChk,
          actSelect,
          h("span", { class: "pw-hint db-macro-step-desc" }, safeStr(catEntry?.description ?? "")),
          moveUpBtn,
          moveDownBtn,
          removeStepBtn,
        ),
        paramFields.length > 0 ? h("div", { class: "pw-row db-macro-step-params" }, ...paramFields) : null,
        h(
          "div",
          { class: "pw-row db-macro-step-meta" },
          field("Condition (If)", condInput, undefined, "db-wide"),
          field("Comment", commentInput, undefined, "db-wide"),
        ),
      );
      actionRowsBox.append(stepCard);
    });
  }

  function updateModeVisibility() {
    const isActions = current.mode === "actions";
    codePane.hidden = isActions;
    actionsPane.hidden = !isActions;
    modeCodeBtn.classList.toggle("primary", !isActions);
    modeActionsBtn.classList.toggle("primary", isActions);
    convertToCodeBtn.hidden = !isActions;
    if (isActions) renderActionRows();
  }

  function loadMacroIntoEditor() {
    nameInput.value = safeStr(current.name);
    descInput.value = safeStr(current.description);
    engineSelect.value = current.engine || "any";
    txCheck.checked = Boolean(current.transaction);
    codeTextarea.value = safeStr(current.code);
    paramsInput.value = formatParamsInput(current.defaultParams);
    exportBox.hidden = true;
    clear(statusBanner);
    updateModeVisibility();
    renderMacroSidebar();
  }

  function renderRunOutput(res) {
    lastRunResult = res;
    clear(outputBox);
    if (!res) return;

    const statusBadgeClass = res.ok
      ? res.dryRun
        ? "db-badge-staging"
        : "db-badge-local"
      : "db-badge-prod";
    const statusLabel = res.dryRun
      ? "🧪 Dry Run (Rolled Back)"
      : res.status === "stopped"
        ? "⏹ Stopped"
        : res.ok
          ? "✓ Completed"
          : "✕ Failed";

    const summaryBar = h(
      "div",
      { class: "pw-row db-macro-run-summary" },
      h("span", { class: `db-env ${statusBadgeClass}` }, statusLabel),
      h("strong", {}, safeStr(res.macroName)),
      h("span", { class: "pw-hint" }, `Target: ${safeStr(res.target?.label)} (${safeStr(res.target?.engineLabel)})`),
      h("span", { class: "db-tag" }, `${Number(res.elapsedMs ?? 0)} ms`),
      h("span", { class: "db-tag" }, `${Number(res.affectedRows ?? 0)} row(s) affected`),
      res.beeps > 0 ? h("span", { class: "db-tag" }, `🔔 ${Number(res.beeps)} beep(s)`) : null,
    );
    outputBox.append(summaryBar);

    if (res.error) {
      const loc = res.error.line ? ` (line ${res.error.line}${res.error.column ? `:${res.error.column}` : ""})` : "";
      outputBox.append(
        h("p", { class: "power-error", role: "alert" }, `${safeStr(res.error.message)}${loc}`),
      );
    }

    // MessageBox alerts
    if (Array.isArray(res.messages) && res.messages.length > 0) {
      const msgSection = h(
        "div",
        { class: "db-macro-messages" },
        ...res.messages.map((m) =>
          h(
            "div",
            { class: `db-macro-msgbox db-macro-msg-${safeStr(m.type || "info")}`, role: "status" },
            h("strong", {}, `${safeStr(m.title || "Macro")}: `),
            h("span", {}, safeStr(m.message)),
          ),
        ),
      );
      outputBox.append(msgSection);
    }

    // Result Set tables
    if (Array.isArray(res.resultSets) && res.resultSets.length > 0) {
      for (const rs of res.resultSets) {
        const cols = Array.isArray(rs.columns) ? rs.columns : [];
        const rows = Array.isArray(rs.rows) ? rs.rows : [];
        const tbl = h(
          "table",
          { class: "db-clone-table db-macro-result-table" },
          cols.length > 0
            ? h(
                "thead",
                {},
                h(
                  "tr",
                  {},
                  ...cols.map((c) => h("th", {}, safeStr(c))),
                ),
              )
            : null,
          h(
            "tbody",
            {},
            ...(rows.length > 0
              ? rows.map((r) =>
                  h(
                    "tr",
                    {},
                    ...cols.map((c) => h("td", { class: "pw-mono" }, safeStr(r?.[c]))),
                  ),
                )
              : [
                  h(
                    "tr",
                    {},
                    h("td", { colspan: String(Math.max(1, cols.length)), class: "pw-hint" }, "(0 rows)"),
                  ),
                ]),
          ),
        );
        outputBox.append(
          h(
            "div",
            { class: "db-macro-resultset" },
            h(
              "div",
              { class: "pw-row" },
              h("h5", { class: "db-h2" }, `${safeStr(rs.label)} (${Number(rs.rowCount ?? rows.length)} row(s))`),
              rs.sql ? h("code", { class: "pw-hint pw-mono" }, safeStr(rs.sql)) : null,
            ),
            h("div", { class: "db-clone-table-wrap" }, tbl),
          ),
        );
      }
    }

    // Return value (when not already rendered as a row table)
    if (res.returnValue !== undefined && !(Array.isArray(res.returnValue) && res.returnValue.length > 0 && typeof res.returnValue[0] === "object")) {
      outputBox.append(
        h(
          "div",
          { class: "db-macro-return" },
          h("h5", { class: "db-h2" }, "Return Value"),
          h("pre", { class: "pw-mono db-macro-pre" }, typeof res.returnValue === "object" ? JSON.stringify(res.returnValue, null, 2) : safeStr(res.returnValue)),
        ),
      );
    }

    // Immediate Window (Debug.print & console logs)
    if (Array.isArray(res.logs) && res.logs.length > 0) {
      outputBox.append(
        h(
          "div",
          { class: "db-macro-immediate" },
          h("h5", { class: "db-h2" }, `Immediate Window / Console (${res.logs.length})`),
          h(
            "div",
            { class: "db-macro-log-lines pw-mono" },
            ...res.logs.map((l) =>
              h(
                "div",
                { class: `db-macro-log-line db-log-${safeStr(l.level)}` },
                h("span", { class: "pw-hint" }, `[+${Number(l.elapsedMs ?? 0)}ms] `),
                h("span", {}, safeStr(l.text)),
              ),
            ),
          ),
        ),
      );
    }

    // TempVars snapshot
    const tvEntries = res.tempVars && typeof res.tempVars === "object" ? Object.entries(res.tempVars) : [];
    if (tvEntries.length > 0) {
      outputBox.append(
        h(
          "div",
          { class: "db-macro-tempvars" },
          h("h5", { class: "db-h2" }, "TempVars State"),
          h(
            "div",
            { class: "pw-row" },
            ...tvEntries.map(([k, v]) => h("span", { class: "db-tag pw-mono" }, `${safeStr(k)} = ${safeStr(v)}`)),
          ),
        ),
      );
    }

    // Executed Step Trace
    if (Array.isArray(res.steps) && res.steps.length > 0) {
      const stepTable = h(
        "table",
        { class: "db-clone-table" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, "#"),
            h("th", {}, "Action"),
            h("th", {}, "Status"),
            h("th", {}, "Detail / SQL"),
            h("th", {}, "Rows / Affected"),
            h("th", {}, "Time"),
          ),
        ),
        h(
          "tbody",
          {},
          ...res.steps.map((s) =>
            h(
              "tr",
              {},
              h("td", {}, String(Number(s.index ?? 0))),
              h("td", { class: "pw-mono" }, safeStr(s.action)),
              h("td", {}, safeStr(s.status)),
              h("td", { class: "pw-mono" }, safeStr(s.detail)),
              h(
                "td",
                {},
                s.affectedRows !== undefined
                  ? `${Number(s.affectedRows)} affected`
                  : s.rowCount !== undefined
                    ? `${Number(s.rowCount)} rows`
                    : "—",
              ),
              h("td", {}, `${Number(s.elapsedMs ?? 0)} ms`),
            ),
          ),
        ),
      );
      outputBox.append(
        h(
          "details",
          { class: "db-macro-steps-details", open: !res.ok || res.steps.length <= 8 },
          h("summary", { class: "db-h2" }, `Execution Step Trace (${res.steps.length} step(s))`),
          h("div", { class: "db-clone-table-wrap" }, stepTable),
        ),
      );
    }
  }

  function buildTargetSpec() {
    const val = targetSelect.value;
    if (val === TARGET_MEMORY) return { kind: "memory" };
    if (val === TARGET_SQLITE_FILE) return { kind: "sqliteFile", path: sqlitePathInput.value.trim() };
    return { kind: "profile", profileId: val };
  }

  async function executeCurrentMacro(forceDryRun, confirmWrites = false, extraParams = {}) {
    syncDraftFromInputs();
    clear(statusBanner);
    statusBanner.append(h("p", { class: "pw-hint" }, "Running macro on Bun runtime…"));

    const mergedParams = { ...current.defaultParams, ...extraParams };
    const dryRun = forceDryRun ? true : dryRunCheck.checked;

    try {
      const res = await call("db/macros/run", {
        macro: current,
        target: buildTargetSpec(),
        params: mergedParams,
        dryRun,
        transaction: current.transaction,
        confirmWrites,
      });
      clear(statusBanner);

      // Handle interactive [Enter ...] prompts if any were discovered
      if (!res.ok && Array.isArray(res.promptsRequired) && res.promptsRequired.length > 0) {
        const collected = { ...extraParams };
        for (const promptName of res.promptsRequired) {
          const val = await promptBox({
            title: `Macro Parameter: ${promptName}`,
            message: `Enter a value for [${promptName}]:`,
            initial: safeStr(collected[promptName] ?? ""),
            confirmLabel: "Continue Macro",
          });
          if (val === null) return;
          collected[promptName] = val;
        }
        return await executeCurrentMacro(forceDryRun, confirmWrites, collected);
      }

      renderRunOutput(res);
    } catch (err) {
      clear(statusBanner);
      if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
        const ok = await confirmBox({
          title: `Run "${current.name}" on ${err.details?.name ?? "this connection"}?`,
          message: err.message,
          confirmLabel: "Run Macro",
          danger: true,
        });
        if (ok) {
          return await executeCurrentMacro(forceDryRun, true, extraParams);
        }
        return;
      }
      statusBanner.append(h("p", { class: "power-error", role: "alert" }, errorText(err, "Macro execution failed.")));
    }
  }

  // Wire event handlers
  filterInput.addEventListener("input", () => {
    searchFilter = filterInput.value;
    renderMacroSidebar();
  });

  newCodeBtn.addEventListener("click", () => {
    current = {
      id: "",
      name: `New Bun Macro ${macros.length + 1}`,
      description: "Custom Bun JS database macro",
      mode: "code",
      engine: "any",
      code: `// Access-style Bun JS Macro\nconst tables = await CurrentDb.tables();\nfor (const t of tables) {\n  const count = await DCount("*", t.name);\n  Debug.print(\`\${t.name}: \${count} row(s)\`);\n}\nreturn tables;`,
      actions: [],
      transaction: false,
      timeoutMs: 10000,
      defaultParams: {},
    };
    loadMacroIntoEditor();
    nameInput.focus();
  });

  newActionsBtn.addEventListener("click", () => {
    current = {
      id: "",
      name: `New Action Macro ${macros.length + 1}`,
      description: "Visual DoCmd action macro",
      mode: "actions",
      engine: "any",
      code: "",
      actions: [
        {
          id: "step-1",
          action: "SetTempVar",
          params: { name: "limitRows", expression: "25" },
          comment: "Default row limit",
          enabled: true,
        },
        {
          id: "step-2",
          action: "OpenTable",
          params: { table: "customers", orderBy: "id ASC", limit: "25" },
          comment: "Inspect customers table",
          enabled: true,
        },
      ],
      transaction: false,
      timeoutMs: 10000,
      defaultParams: {},
    };
    loadMacroIntoEditor();
    nameInput.focus();
  });

  targetSelect.addEventListener("change", () => {
    sqliteFileWrap.hidden = targetSelect.value !== TARGET_SQLITE_FILE;
  });

  modeCodeBtn.addEventListener("click", () => {
    syncDraftFromInputs();
    current.mode = "code";
    updateModeVisibility();
  });

  modeActionsBtn.addEventListener("click", () => {
    syncDraftFromInputs();
    current.mode = "actions";
    if (!Array.isArray(current.actions) || current.actions.length === 0) {
      current.actions = [
        {
          id: "step-1",
          action: "RunCode",
          params: { code: current.code || "Debug.print('Hello from RunCode');" },
          comment: "Bun JS code step",
          enabled: true,
        },
      ];
    }
    updateModeVisibility();
  });

  addActionStepBtn.addEventListener("click", () => {
    current.actions = Array.isArray(current.actions) ? current.actions : [];
    current.actions.push({
      id: `step-${current.actions.length + 1}`,
      action: "RunSQL",
      params: { sql: "" },
      enabled: true,
    });
    renderActionRows();
  });

  convertToCodeBtn.addEventListener("click", async () => {
    syncDraftFromInputs();
    try {
      const res = await call("db/macros/convert", { name: current.name, actions: current.actions });
      current.code = safeStr(res.code);
      current.mode = "code";
      codeTextarea.value = current.code;
      updateModeVisibility();
      toast("Converted visual actions to Bun JavaScript.", { kind: "info" });
    } catch (err) {
      toast(errorText(err, "Couldn't convert macro actions."), { kind: "error" });
    }
  });

  validateBtn.addEventListener("click", async () => {
    syncDraftFromInputs();
    clear(statusBanner);
    try {
      const res = await call("db/macros/validate", {
        mode: current.mode,
        code: current.code,
        actions: current.actions,
      });
      if (res.valid) {
        statusBanner.append(
          h(
            "p",
            { class: "db-macro-valid" },
            `✓ Valid ${current.mode === "actions" ? "Visual Action Macro" : `Bun TypeScript / JavaScript (Bun v${bunVersion})`}.`,
          ),
        );
      } else {
        for (const e of res.errors || []) {
          const loc = e.line ? ` (line ${e.line}${e.column ? `:${e.column}` : ""})` : "";
          statusBanner.append(h("p", { class: "power-error", role: "alert" }, `Syntax Error${loc}: ${safeStr(e.message)}`));
        }
      }
      for (const w of res.warnings || []) {
        statusBanner.append(h("p", { class: "pw-hint" }, `⚠️ ${safeStr(w)}`));
      }
    } catch (err) {
      statusBanner.append(h("p", { class: "power-error", role: "alert" }, errorText(err, "Validation failed.")));
    }
  });

  saveBtn.addEventListener("click", async () => {
    syncDraftFromInputs();
    try {
      const res = await call("db/macros/save", { macro: current });
      current = structuredClone(res.macro);
      macros = Array.isArray(res.macros) ? res.macros : macros;
      renderMacroSidebar();
      toast(`Saved macro "${current.name}".`, { kind: "info" });
    } catch (err) {
      toast(errorText(err, "The macro couldn't be saved."), { kind: "error" });
    }
  });

  dupBtn.addEventListener("click", async () => {
    syncDraftFromInputs();
    if (!current.id) {
      current.name = `${current.name} (Copy)`;
      nameInput.value = current.name;
      return;
    }
    try {
      const res = await call("db/macros/duplicate", { id: current.id });
      current = structuredClone(res.macro);
      macros = Array.isArray(res.macros) ? res.macros : macros;
      loadMacroIntoEditor();
      toast(`Duplicated as "${current.name}".`, { kind: "info" });
    } catch (err) {
      toast(errorText(err, "Couldn't duplicate macro."), { kind: "error" });
    }
  });

  delBtn.addEventListener("click", async () => {
    if (!current.id) return;
    if (
      !(await confirmBox({
        title: `Delete macro "${current.name}"?`,
        message: "This removes the saved macro from the File Manager.",
        confirmLabel: "Delete Macro",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const res = await call("db/macros/delete", { id: current.id });
      macros = Array.isArray(res.macros) ? res.macros : [];
      current = structuredClone(macros[0] ?? {
        id: "",
        name: "New Macro",
        description: "",
        mode: "code",
        engine: "any",
        code: "return await CurrentDb.tables();",
        actions: [],
        transaction: false,
        timeoutMs: 10000,
        defaultParams: {},
      });
      loadMacroIntoEditor();
      toast("Macro deleted.", { kind: "info" });
    } catch (err) {
      toast(errorText(err, "Couldn't delete macro."), { kind: "error" });
    }
  });

  async function showExportPreview(format) {
    syncDraftFromInputs();
    try {
      const res = await call("db/macros/export", { macro: current, format });
      clear(exportBox);
      exportBox.hidden = false;
      const copyExportBtn = h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Copy exported code to clipboard",
          onclick: async () => {
            try {
              await navigator.clipboard?.writeText(safeStr(res.content));
              toast(`Copied ${safeStr(res.filename)} to clipboard.`, { kind: "info" });
            } catch {}
          },
        },
        "📋 Copy",
      );
      const closeExportBtn = h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Hide exported code preview",
          onclick: () => {
            exportBox.hidden = true;
          },
        },
        "Close preview",
      );
      exportBox.append(
        h(
          "div",
          { class: "pw-row" },
          h("strong", {}, `Export: ${safeStr(res.filename)}`),
          copyExportBtn,
          closeExportBtn,
        ),
        h("pre", { class: "pw-mono db-macro-pre" }, safeStr(res.content)),
      );
    } catch (err) {
      toast(errorText(err, "Export failed."), { kind: "error" });
    }
  }

  exportBunBtn.addEventListener("click", () => void showExportPreview("bun"));
  exportVbaBtn.addEventListener("click", () => void showExportPreview("vba"));
  exportSqlBtn.addEventListener("click", () => void showExportPreview("sql"));

  loadMacroIntoEditor();

  const layout = h(
    "div",
    { class: "db-macro-studio" },
    h(
      "aside",
      { class: "db-macro-sidebar" },
      h("div", { class: "pw-row" }, newCodeBtn, newActionsBtn),
      filterInput,
      macroListBox,
    ),
    h(
      "div",
      { class: "db-macro-main" },
      h(
        "div",
        { class: "pw-row" },
        field("Macro name", nameInput, undefined, "db-wide"),
        field("Description", descInput, undefined, "db-wide"),
        field("Engine", engineSelect),
      ),
      h(
        "div",
        { class: "pw-row db-macro-target-bar" },
        field("Run against database", targetSelect, undefined, "db-wide"),
        field("Parameters (params.*)", paramsInput, undefined, "db-wide"),
      ),
      sqliteFileWrap,
      h(
        "div",
        { class: "pw-row db-macro-flags" },
        h("label", { class: "pw-check" }, txCheck, "Atomic transaction (BEGIN / COMMIT / ROLLBACK)"),
        h("label", { class: "pw-check" }, dryRunCheck, "Dry run (preview & roll back all writes)"),
      ),
      h(
        "div",
        { class: "pw-row db-macro-mode-bar" },
        modeCodeBtn,
        modeActionsBtn,
        validateBtn,
        saveBtn,
        dupBtn,
        delBtn,
        exportBunBtn,
        exportVbaBtn,
        exportSqlBtn,
      ),
      codePane,
      actionsPane,
      statusBanner,
      exportBox,
      outputBox,
    ),
  );

  return await new Promise((resolve) => {
    const dlg = openDialog({
      title: "⚡ Database Macros — Bun JavaScript Runtime & Visual DoCmd",
      wide: true,
      describe:
        "Build and run Microsoft Access-style database macros using the Bun JavaScript runtime (CurrentDb, DoCmd, DLookup/DCount/DSum, TempVars, MsgBox) or visual action rows.",
      body: [layout],
      buttons: [
        { label: "Close", value: "close" },
        { label: "🧪 Dry Run (Rollback)", value: "dryrun" },
        { label: "▶ Run Macro", value: "run", primary: true },
      ],
    });

    const footerBtns = dlg.el.querySelectorAll(".dialog-buttons button");
    const dryBtn = footerBtns[1];
    const runBtn = footerBtns[2];

    if (dryBtn) {
      dryBtn.addEventListener(
        "click",
        (e) => {
          e.stopImmediatePropagation();
          void executeCurrentMacro(true);
        },
        true,
      );
    }
    if (runBtn) {
      runBtn.addEventListener(
        "click",
        (e) => {
          e.stopImmediatePropagation();
          void executeCurrentMacro(false);
        },
        true,
      );
    }

    dlg.result.then(() => resolve(lastRunResult));
  });
}

/** Context-menu item for running a Bun JS macro directly on a SQLite file in the File Manager. */
export function macroSqliteMenuItems(entries) {
  if (entries.length !== 1 || entries[0].isDir || !isSqliteFile(entries[0])) return [];
  const e = entries[0];
  return [
    {
      label: "Run Bun JS macro on database…",
      icon: "⚡",
      tip: `Open the Bun JS & Visual Macro Studio targeting ${baseName(e.path, state.sep)}.`,
      action: async () => {
        await showMacrosDialog({ sqlitePath: e.path });
      },
    },
  ];
}
