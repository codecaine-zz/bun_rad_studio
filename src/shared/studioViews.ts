// @ts-nocheck
/**
 * Create / edit / drop views for the SQLite, MySQL and PostgreSQL studios.
 *
 *  - `viewTools` (pure): identifier quoting, name and query validation, and the DDL builder for each dialect.
 *  - `viewApi` (server): check / create / definition / drop on top of a tiny adapter around each studio's connection.
 *    The studios' HTTP routes (/api/view/check, /create, /definition, /drop) call it, so the SQL that runs is always
 *    built here from validated parts, never pasted together by the page.
 *  - `STUDIO_VIEWS_SCRIPT` (page): the one "Create view" dialog used by the sidebar buttons, the SQL editor button,
 *    the query designer's "Save as View" and the "Edit view definition" / "Drop view" actions.
 */

function createViewTools() {
  const MAX_NAME = { sqlite: 255, mysql: 64, postgres: 63 };

  function quoteIdent(dialect, name) {
    const n = String(name);
    if (n.indexOf("\u0000") >= 0) throw new Error("A name cannot contain a NUL character.");
    return dialect === "mysql" ? "`" + n.replace(/`/g, "``") + "`" : '"' + n.replace(/"/g, '""') + '"';
  }

  // Returns "" when the name is fine, otherwise a plain-words problem.
  function validateViewName(dialect, name) {
    const n = String(name === undefined || name === null ? "" : name);
    if (!n.trim()) return "Enter a name for the view.";
    if (n !== n.trim()) return "The name cannot start or end with a space.";
    if (/[\u0000-\u001f\u007f]/.test(n)) return "The name cannot contain control characters.";
    if (n.length > (MAX_NAME[dialect] || 255)) return "The name is too long (at most " + MAX_NAME[dialect] + " characters for " + dialect + ").";
    if (dialect === "sqlite" && /^sqlite_/i.test(n)) return "Names starting with sqlite_ are reserved by SQLite.";
    if (dialect === "mysql" && /[\\/.]/.test(n)) return "MySQL view names cannot contain / \\ or a dot.";
    return "";
  }

  // The view's query must be ONE select-like statement. Quotes, comments and dollar-quoted text are skipped so a ';'
  // inside a string is fine and a second statement is not.
  function validateSelect(dialect, sql) {
    const text = String(sql === undefined || sql === null ? "" : sql);
    let i = 0;
    const n = text.length;
    let semi = -1;
    let lastSig = -1;
    while (i < n) {
      const c = text[i];
      const d = text[i + 1];
      if (c === "-" && d === "-") { while (i < n && text[i] !== "\n") i++; continue; }
      if (c === "#" && dialect === "mysql") { while (i < n && text[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === "'" || c === '"' || c === "`") {
        const q = c;
        i++;
        while (i < n) {
          if (text[i] === "\\" && dialect === "mysql" && q !== "`") { i += 2; continue; }
          if (text[i] === q) { if (text[i + 1] === q) { i += 2; continue; } break; }
          i++;
        }
        if (i >= n) return { ok: false, error: "A quote in the query is not closed." };
        lastSig = i;
        i++;
        continue;
      }
      if (c === "$" && dialect === "postgres") {
        const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
        if (m) { const e = text.indexOf(m[0], i + m[0].length); if (e < 0) return { ok: false, error: "A dollar-quoted string in the query is not closed." }; i = e + m[0].length; lastSig = i - 1; continue; }
      }
      if (c === ";") { if (semi < 0) semi = i; i++; continue; }
      if (!/\s/.test(c)) { if (semi >= 0) return { ok: false, error: "A view can hold only one statement. Remove everything after the first semicolon." }; lastSig = i; }
      i++;
    }
    const body = (semi >= 0 ? text.slice(0, semi) : text).trim();
    if (!body) return { ok: false, error: "Enter the SELECT query the view should show." };
    const head = body.replace(/^(\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/|\()+/, "");
    const allowed = dialect === "postgres" ? /^(select|with|values|table)\b/i : /^(select|with|values)\b/i;
    if (!allowed.test(head)) return { ok: false, error: "A view must be defined by a SELECT query (it may start with WITH)." };
    return { ok: true, sql: body };
  }

  function parseColumns(cols) {
    if (!cols) return [];
    const list = Array.isArray(cols) ? cols : String(cols).split(",");
    return list.map((c) => String(c).trim()).filter(Boolean);
  }

  // o: { name, schema, select, orReplace, ifNotExists, materialized, withData, securityBarrier, algorithm, sqlSecurity, columns }
  function buildViewDdl(dialect, o) {
    o = o || {};
    const nameErr = validateViewName(dialect, o.name);
    if (nameErr) throw new Error(nameErr);
    const sel = validateSelect(dialect, o.select);
    if (!sel.ok) throw new Error(sel.error);
    const q = (x) => quoteIdent(dialect, x);
    const cols = parseColumns(o.columns);
    cols.forEach((c) => { const e = validateViewName(dialect, c); if (e) throw new Error("Column name \u201C" + c + "\u201D: " + e); });
    const colList = cols.length ? " (" + cols.map(q).join(", ") + ")" : "";
    const target = (dialect === "postgres" && o.schema ? q(o.schema) + "." : "") + q(o.name);
    if (dialect === "sqlite") {
      return "CREATE VIEW " + (o.ifNotExists && !o.orReplace ? "IF NOT EXISTS " : "") + target + colList + " AS\n" + sel.sql;
    }
    if (dialect === "mysql") {
      const alg = /^(UNDEFINED|MERGE|TEMPTABLE)$/i.test(o.algorithm || "") ? "ALGORITHM = " + String(o.algorithm).toUpperCase() + " " : "";
      const sec = /^(DEFINER|INVOKER)$/i.test(o.sqlSecurity || "") ? "SQL SECURITY " + String(o.sqlSecurity).toUpperCase() + " " : "";
      return "CREATE " + (o.orReplace ? "OR REPLACE " : "") + alg + sec + "VIEW " + target + colList + " AS\n" + sel.sql;
    }
    if (o.materialized) {
      return "CREATE MATERIALIZED VIEW " + (o.ifNotExists ? "IF NOT EXISTS " : "") + target + colList + " AS\n" + sel.sql + "\nWITH " + (o.withData === false ? "NO " : "") + "DATA";
    }
    return "CREATE " + (o.orReplace ? "OR REPLACE " : "") + "VIEW " + target + colList + (o.securityBarrier ? " WITH (security_barrier = true)" : "") + " AS\n" + sel.sql;
  }

  function buildDropViewDdl(dialect, o) {
    o = o || {};
    const nameErr = validateViewName(dialect, o.name);
    if (nameErr) throw new Error(nameErr);
    const q = (x) => quoteIdent(dialect, x);
    const target = (dialect === "postgres" && o.schema ? q(o.schema) + "." : "") + q(o.name);
    return "DROP " + (dialect === "postgres" && o.materialized ? "MATERIALIZED " : "") + "VIEW " + (o.ifExists ? "IF EXISTS " : "") + target;
  }

  // Plain-words version of the common database errors; the original message is always kept underneath.
  function friendlyError(dialect, message) {
    const m = String(message || "");
    let say = "";
    if (/already exists|there is already (a|an) (table|index|view)/i.test(m)) say = "A table or view with that name already exists. Choose another name, or tick \u201CReplace if it exists\u201D (not possible for a table).";
    else if (/no such table|doesn'?t exist|does not exist|relation .* does not exist|unknown table/i.test(m) && !/column/i.test(m)) say = "The query uses a table or view that does not exist.";
    else if (/no such column|unknown column|column .* does not exist|has no column/i.test(m)) say = "The query uses a column that does not exist.";
    else if (/syntax error|error in your sql syntax|near "/i.test(m)) say = "The query has a SQL syntax problem.";
    else if (/duplicate column|specified more than once|column names? .* (are|is) not unique/i.test(m)) say = "Two columns in the result have the same name. Give one of them an alias (AS) or list column names for the view.";
    else if (/permission denied|access denied|command denied|must be owner/i.test(m)) say = "The database account is not allowed to create views here.";
    else if (/cannot change name of view column|cannot drop columns from view/i.test(m)) say = "The new query changes the view's columns. Tick \u201CDrop and re-create\u201D to replace it.";
    return say ? say + "\nDatabase said: " + m : m;
  }

  return { quoteIdent, validateViewName, validateSelect, buildViewDdl, buildDropViewDdl, friendlyError, parseColumns };
}

export const viewTools = createViewTools();

const sqlLit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const stripSemi = (s) => String(s || "").replace(/[\s;]+$/g, "");

/**
 * adapter: { dialect, schema?, run(sql): Promise<rows>, tx(fn(run)): Promise<any>, rollbackProbe(fn(run)): Promise<void>,
 *            describe?(select): Promise<string[]> }
 * op: "check" | "create" | "definition" | "drop"
 */
export async function viewApi(op, body, adapter) {
  const d = adapter.dialect;
  body = body || {};
  try {
    if (op === "definition") {
      const err = viewTools.validateViewName(d, body.name);
      if (err) return { success: false, error: err };
      if (d === "sqlite") {
        const rows = await adapter.run(`SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ${sqlLit(body.name)}`);
        if (!rows.length) return { success: false, error: "No view named \u201C" + body.name + "\u201D." };
        const m = /^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"(?:[^"]|"")*"|\[[^\]]*\]|`[^`]*`|[^\s(]+)\s*(?:\([^)]*\)\s*)?AS\s+([\s\S]*)$/i.exec(String(rows[0].sql));
        return { success: true, kind: "view", select: stripSemi(m ? m[1] : rows[0].sql), name: body.name };
      }
      if (d === "mysql") {
        const rows = await adapter.run(`SELECT VIEW_DEFINITION AS def, SECURITY_TYPE AS sec FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${sqlLit(body.name)}`);
        if (!rows.length) return { success: false, error: "No view named \u201C" + body.name + "\u201D." };
        const r = rows[0];
        return { success: true, kind: "view", select: stripSemi(r.def ?? r.VIEW_DEFINITION), sqlSecurity: String(r.sec ?? r.SECURITY_TYPE ?? ""), name: body.name };
      }
      const schema = body.schema || adapter.schema || "public";
      const rows = await adapter.run(`SELECT c.relkind AS kind, pg_get_viewdef(c.oid, true) AS def FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${sqlLit(schema)} AND c.relname = ${sqlLit(body.name)} AND c.relkind IN ('v','m')`);
      if (!rows.length) return { success: false, error: "No view named \u201C" + body.name + "\u201D in schema " + schema + "." };
      return { success: true, kind: rows[0].kind === "m" ? "materialized" : "view", select: stripSemi(rows[0].def), name: body.name, schema };
    }

    if (op === "drop") {
      const ddl = viewTools.buildDropViewDdl(d, { name: body.name, schema: d === "postgres" ? body.schema || adapter.schema : undefined, materialized: !!body.materialized });
      await adapter.run(ddl);
      return { success: true, ddl };
    }

    const opts = {
      name: body.name,
      schema: d === "postgres" ? body.schema || adapter.schema || "public" : undefined,
      select: body.select,
      orReplace: !!body.orReplace && !body.recreate,
      ifNotExists: !!body.ifNotExists,
      materialized: d === "postgres" && !!body.materialized,
      withData: body.withData !== false,
      securityBarrier: !!body.securityBarrier,
      algorithm: body.algorithm,
      sqlSecurity: body.sqlSecurity,
      columns: body.columns,
    };
    const sel = viewTools.validateSelect(d, body.select);
    if (!sel.ok) return { success: false, error: sel.error };
    const createDdl = viewTools.buildViewDdl(d, opts);
    const dropDdl = viewTools.buildDropViewDdl(d, { name: body.name, schema: opts.schema, materialized: opts.materialized, ifExists: true });
    // SQLite has no CREATE OR REPLACE VIEW: "replace" means drop + create inside one transaction.
    const dropFirst = !!body.recreate || (d === "sqlite" && !!body.orReplace);

    if (op === "check") {
      let columns = [];
      if (d === "mysql") {
        const dup = await adapter.run(`SELECT TABLE_TYPE AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${sqlLit(body.name)}`);
        if (dup.length && !opts.orReplace && !dropFirst) return { success: false, error: viewTools.friendlyError(d, "Table or view '" + body.name + "' already exists") };
        if (dup.length && String(dup[0].t ?? dup[0].TABLE_TYPE).toUpperCase() !== "VIEW") return { success: false, error: viewTools.friendlyError(d, "'" + body.name + "' is a table, not a view; it already exists") };
        await adapter.run(`SELECT * FROM (${sel.sql}) AS _studio_view_check LIMIT 0`);
      } else {
        await adapter.rollbackProbe(async (run) => {
          if (dropFirst) { try { await run(dropDdl); } catch (e) { /* nothing to drop */ } }
          await run(createDdl);
        });
        if (adapter.describe) columns = await adapter.describe(sel.sql);
      }
      return { success: true, columns, ddl: createDdl, message: "The query is valid." + (columns.length ? " It returns " + columns.length + " column" + (columns.length === 1 ? "" : "s") + ": " + columns.join(", ") + "." : "") };
    }

    if (op === "create") {
      // SQLite resolves names lazily, so CREATE VIEW would accept a query that can never run: prepare it first.
      if (adapter.describe) await adapter.describe(sel.sql);
      await adapter.tx(async (run) => {
        if (dropFirst) await run(dropDdl);
        await run(createDdl);
      });
      return { success: true, ddl: createDdl, name: body.name, schema: opts.schema, materialized: opts.materialized, replaced: dropFirst || opts.orReplace };
    }
    return { success: false, error: "Unknown view operation." };
  } catch (err) {
    return { success: false, error: viewTools.friendlyError(d, err && err.message ? err.message : String(err)) };
  }
}

export const STUDIO_VIEWS_STYLE = `
    /* ===== Create view ===== */
    .sv-btn { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 1px 8px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--cyan) 55%, transparent); background: color-mix(in srgb, var(--cyan) 12%, transparent); color: var(--cyan); font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
    .sv-btn:hover { background: color-mix(in srgb, var(--cyan) 24%, transparent); }
    .sv-btn:focus-visible { outline: 2px solid var(--cyan); outline-offset: 1px; }
    .tree-section-title .sv-btn, .tree-header .sv-btn { margin-left: 8px; }
    .sv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
    .sv-grid .sv-full { grid-column: 1 / -1; }
    @media (max-width: 560px) { .sv-grid { grid-template-columns: 1fr; } }
`;

function studioViewsClient() {
  if (window.StudioViews) return;
  const T = __CREATE_VIEW_TOOLS__();
  const D = window.StudioDialogs;
  const el = D.el;
  let cfg = { dialect: "sqlite" };

  async function defaultApi(path, body) {
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      try { return await r.json(); } catch (e) { return { success: false, error: "The server answered HTTP " + r.status + "." }; }
    } catch (e) { return { success: false, error: "The studio server could not be reached: " + (e && e.message ? e.message : e) }; }
  }
  function configure(c) { cfg = Object.assign({ dialect: "sqlite", api: defaultApi }, c || {}); mountButtons(); }
  const post = (path, body) => cfg.api(path, body);
  const existing = () => (cfg.getViewNames ? cfg.getViewNames() : []).map(String);

  function selectionOf(id) {
    const ta = id ? document.getElementById(id) : null;
    if (!ta) return "";
    const s = ta.selectionStart, e = ta.selectionEnd;
    return typeof s === "number" && e > s ? ta.value.slice(s, e) : ta.value;
  }

  // o: { mode: "create" | "edit", name, select, materialized, schema, ... }
  function openDialog(o) {
    o = o || {};
    const d = cfg.dialect;
    const edit = o.mode === "edit";
    const nameInput = el("input", { type: "text", class: "sd-input", id: "svName", value: o.name || "", spellcheck: "false", autocomplete: "off", "aria-describedby": "svNameHint", readonly: edit });
    const nameHint = el("small", { id: "svNameHint", class: "sd-note" }, edit ? "The name cannot be changed here. Use Rename in your database tools or create a copy under a new name." : "Letters, digits, spaces and symbols are allowed; the name is quoted for you.");
    const ta = el("textarea", { class: "sd-textarea", id: "svSql", spellcheck: "false", "aria-label": "SELECT query for the view", rows: 7 });
    ta.value = o.select || "";
    const colsInput = el("input", { type: "text", class: "sd-input", id: "svCols", placeholder: "optional: id, total, ...", "aria-label": "Optional column names", spellcheck: "false" });
    const flags = {};
    const check = (id, label, checked, title) => { const i = el("input", { type: "checkbox", id }); i.checked = !!checked; flags[id] = i; return el("label", { class: "sd-check", title: title || null }, i, label); };
    let schemaSel = null;
    if (d === "postgres") {
      schemaSel = el("select", { class: "sd-select", id: "svSchema", "aria-label": "Schema" });
      const schemas = (cfg.getSchemas ? cfg.getSchemas() : ["public"]);
      schemas.forEach((s) => schemaSel.appendChild(el("option", { value: s }, s)));
      schemaSel.value = o.schema || (cfg.getActiveSchema ? cfg.getActiveSchema() : "public");
      if (edit) schemaSel.disabled = true;
    }
    const kindMat = d === "postgres" ? check("svMat", "Materialized view (stores the result; refresh it when data changes)", !!o.materialized, "CREATE MATERIALIZED VIEW") : null;
    if (kindMat && edit) flags.svMat.disabled = true;
    const replace = check("svReplace", d === "sqlite" ? "Replace if it exists (drop and create in one transaction)" : "Replace if it exists (CREATE OR REPLACE)", edit, d === "sqlite" ? "SQLite has no CREATE OR REPLACE VIEW" : "");
    const ifNot = d === "sqlite" || d === "postgres" ? check("svIfNot", "Only if it does not exist yet (IF NOT EXISTS)", false) : null;
    const recreate = d !== "mysql" ? check("svRecreate", "Drop and re-create (needed when the columns change)", false, "Runs DROP VIEW then CREATE VIEW in one transaction") : null;
    const withData = d === "postgres" ? check("svData", "Fill it with data now (WITH DATA)", true, "Untick for WITH NO DATA: the view is empty until you refresh it") : null;
    const barrier = d === "postgres" ? check("svBarrier", "security_barrier", false, "WITH (security_barrier = true)") : null;
    let algSel = null, secSel = null;
    if (d === "mysql") {
      algSel = el("select", { class: "sd-select", id: "svAlg", "aria-label": "Algorithm" }, ...["", "UNDEFINED", "MERGE", "TEMPTABLE"].map((v) => el("option", { value: v }, v || "Default algorithm")));
      secSel = el("select", { class: "sd-select", id: "svSec", "aria-label": "SQL security" }, ...["", "DEFINER", "INVOKER"].map((v) => el("option", { value: v }, v ? "SQL SECURITY " + v : "Default SQL security")));
      if (o.sqlSecurity && /^(DEFINER|INVOKER)$/i.test(o.sqlSecurity)) secSel.value = o.sqlSecurity.toUpperCase();
    }
    const note = el("p", { class: "sd-note", id: "svNote" });
    const preview = el("pre", { class: "sd-pre", id: "svPreview", "aria-label": "DDL preview", tabindex: "0" });
    const status = el("div", { class: "sd-ok", id: "svStatus", role: "status", hidden: true });

    const grid = el("div", { class: "sv-grid" },
      el("label", { class: "sd-label sv-full" }, edit ? "View name" : "View name", nameInput, nameHint),
      schemaSel ? el("label", { class: "sd-label" }, "Schema", schemaSel) : null,
      el("label", { class: "sd-label" + (schemaSel ? "" : " sv-full") }, "Column names (optional)", colsInput),
      el("label", { class: "sd-label sv-full" }, "SELECT query", ta),
      el("div", { class: "sd-row sv-full" }, ...[kindMat, replace, ifNot, recreate, withData, barrier].filter(Boolean)),
      algSel ? el("label", { class: "sd-label" }, "Algorithm", algSel) : null,
      secSel ? el("label", { class: "sd-label" }, "Security", secSel) : null,
      el("div", { class: "sv-full" }, note),
      el("div", { class: "sd-label sv-full" }, "DDL preview", preview),
      el("div", { class: "sv-full" }, status));

    const collect = () => ({
      name: nameInput.value,
      select: ta.value,
      columns: colsInput.value,
      schema: schemaSel ? schemaSel.value : undefined,
      materialized: !!(flags.svMat && flags.svMat.checked),
      orReplace: !!flags.svReplace.checked,
      ifNotExists: !!(flags.svIfNot && flags.svIfNot.checked),
      recreate: !!(flags.svRecreate && flags.svRecreate.checked),
      withData: flags.svData ? flags.svData.checked : true,
      securityBarrier: !!(flags.svBarrier && flags.svBarrier.checked),
      algorithm: algSel ? algSel.value : undefined,
      sqlSecurity: secSel ? secSel.value : undefined,
    });

    function validateName() {
      const v = nameInput.value;
      let err = T.validateViewName(d, v);
      const c = collect();
      if (!err && !edit && existing().some((n) => n === v) && !c.orReplace && !c.ifNotExists && !c.recreate) err = "A view named \u201C" + v + "\u201D already exists. Pick another name or tick \u201CReplace if it exists\u201D.";
      return err;
    }

    let ctl;
    function refresh() {
      const c = collect();
      if (flags.svMat) {
        flags.svReplace.disabled = c.materialized;
        if (c.materialized) flags.svReplace.checked = false;
        if (flags.svBarrier) flags.svBarrier.disabled = c.materialized;
        if (flags.svData) flags.svData.disabled = !c.materialized;
        note.textContent = c.materialized ? "A materialized view cannot use OR REPLACE. To change one, tick \u201CDrop and re-create\u201D. It also needs REFRESH MATERIALIZED VIEW when the data changes." : "";
      }
      if (flags.svReplace.checked && flags.svRecreate) flags.svRecreate.disabled = false;
      const nameErr = nameInput.value ? validateName() : "";
      nameInput.toggleAttribute("aria-invalid", !!nameErr);
      nameInput.setAttribute("aria-invalid", nameErr ? "true" : "false");
      nameHint.textContent = nameErr || (edit ? "The name cannot be changed here." : "Letters, digits, spaces and symbols are allowed; the name is quoted for you.");
      nameHint.style.color = nameErr ? "var(--rose)" : "";
      try { preview.textContent = T.buildViewDdl(d, Object.assign({}, c, { name: c.name || "new_view", select: c.select || "SELECT 1" })) + ";"; }
      catch (e) { preview.textContent = "-- " + e.message; }
      status.hidden = true;
      if (ctl) ctl.setError("");
    }

    const run = async (kind) => {
      const c = collect();
      const err = validateName();
      if (err) { ctl.setError(err); nameInput.focus(); return false; }
      const v = T.validateSelect(d, c.select);
      if (!v.ok) { ctl.setError(v.error); ta.focus(); return false; }
      ctl.setError("");
      const res = await post(kind === "check" ? "/api/view/check" : "/api/view/create", c);
      if (!res || !res.success) { status.hidden = true; ctl.setError((res && res.error) || "The database did not answer."); return false; }
      if (kind === "check") { status.hidden = false; status.textContent = "\u2713 " + res.message; return false; }
      ctl.close(res);
      if (cfg.afterChange) cfg.afterChange({ kind: edit ? "edit" : "create", result: res, name: c.name, schema: c.schema, materialized: c.materialized });
      return false;
    };

    ctl = D.open({
      title: edit ? "Edit view definition" : (o.materialized ? "Create materialized view" : "Create view"),
      body: grid,
      wide: true,
      cancelValue: null,
      initialFocus: edit ? ta : nameInput,
      buttons: [
        { label: "Check query", id: "svCheck", side: "left", title: "Runs the query without creating anything and explains any problem", onClick: () => run("check") },
        { label: "Cancel", id: "svCancel", onClick: (c) => c.close(null) },
        { label: edit ? "Save changes" : "Create view", kind: "primary", id: "svCreate", onClick: () => run("create") },
      ],
    });
    ctl.node.setAttribute("data-sv-dialog", edit ? "edit" : "create");
    if (edit && o.materialized && flags.svRecreate) flags.svRecreate.checked = true;
    [nameInput, ta, colsInput, algSel, secSel, schemaSel, ...Object.values(flags)].filter(Boolean).forEach((n) => { n.addEventListener("input", refresh); n.addEventListener("change", refresh); });
    refresh();
    return ctl;
  }

  function openFromEditor(textareaId) { return openDialog({ mode: "create", select: selectionOf(textareaId || (cfg.editorId || "sqlEditor")).replace(/[\s;]+$/g, "") }); }
  function openNew(o) { return openDialog(Object.assign({ mode: "create" }, o || {})); }

  async function openEdit(name, o) {
    o = o || {};
    const res = await post("/api/view/definition", { name, schema: o.schema, materialized: o.materialized });
    if (!res || !res.success) { await D.alert({ title: "Edit view definition", message: (res && res.error) || "The definition could not be read." }); return null; }
    return openDialog({ mode: "edit", name, select: res.select, materialized: res.kind === "materialized", schema: res.schema || o.schema, sqlSecurity: res.sqlSecurity });
  }

  async function drop(name, o) {
    o = o || {};
    const ok = await D.confirm({ title: "Drop " + (o.materialized ? "materialized view" : "view"), message: "Drop " + (o.materialized ? "materialized view " : "view ") + "\u201C" + name + "\u201D?\nThe data of the tables it reads is not touched, but anything that uses the view will stop working.", okLabel: "Drop", danger: true });
    if (!ok) return false;
    const res = await post("/api/view/drop", { name, schema: o.schema, materialized: !!o.materialized });
    if (!res || !res.success) { await D.alert({ title: "Drop view", message: (res && res.error) || "The view could not be dropped." }); return false; }
    if (cfg.afterChange) cfg.afterChange({ kind: "drop", result: res, name, schema: o.schema, materialized: !!o.materialized });
    return true;
  }

  // Sidebar headers for views get a visible "+ Create view" button (they are re-rendered often, so keep watching).
  function mountButtons() {
    const root = document.querySelector("aside, #sidebar, #mainSidebar");
    if (!root) return;
    const add = () => {
      root.querySelectorAll(".tree-header, .tree-section-title").forEach((h) => {
        if (h.querySelector(".sv-btn")) return;
        const label = (h.textContent || "").replace(/[0-9]+/g, "").replace(/[^A-Za-z ]/g, "").trim().toLowerCase();
        const mat = /materialized views$/.test(label);
        if (!mat && !/(^| )views$/.test(label)) return;
        if (/saved/.test(label)) return;
        const b = el("button", { type: "button", class: "sv-btn", title: mat ? "Create a materialized view from a SELECT query" : "Create a view from a SELECT query", "aria-label": mat ? "Create materialized view" : "Create view", "data-sv": mat ? "mat" : "view" }, "\uFF0B " + (mat ? "Create materialized view" : "Create view"));
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); openNew({ materialized: mat }); });
        b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });
        const badge = h.querySelector(".tree-badge, .tree-item-badge");
        if (badge) h.insertBefore(b, badge); else h.appendChild(b);
      });
    };
    add();
    if (!root.__svObserver) { root.__svObserver = new MutationObserver(() => add()); root.__svObserver.observe(root, { childList: true, subtree: true }); }
  }

  window.StudioViews = { configure, open: openDialog, openNew, openFromEditor, openEdit, drop, mountButtons, tools: T };
  // The studio's page script says how this dialog talks to its server and refreshes its sidebar
  if (typeof window.studioViewsInit === "function") window.studioViewsInit();
}

// The page script embeds the same pure tools the server uses.
export const STUDIO_VIEWS_SCRIPT = `(${studioViewsClient.toString().replace("__CREATE_VIEW_TOOLS__", "(" + createViewTools.toString() + ")")})();`;
