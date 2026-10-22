// @ts-nocheck
/**
 * Shared IDE enhancements for SQLite, MySQL, and PostgreSQL Studios:
 *  1. Multi-tab SQL Worksheets (persisted per studio) + Run Highlighted Selection
 *  2. 1-Click Format SQL (Shift+Alt+F -> /api/sql/format)
 *  3. Schema-aware SQL Autocomplete Popup (Ctrl+Space or table. trigger)
 *  4. Searchable Query History Drawer with latency, row count, and 1-click Load/Run
 *  5. Transaction Controls (BEGIN / COMMIT / ROLLBACK) & Read-Only Safety Guard
 *  6. Server-backed Column Quick Filters & Multi-Column Sorting (Shift+Click on headers)
 *  7. Foreign Key Cell Drill-Down (↗ badge + Alt+Click to jump to referenced parent row)
 *  8. Collapsible Row / JSON / BLOB Side Inspector
 *  9. Full-Database Interactive SVG ER Diagram & Schema Diff / Migration DDL Generator in #tabSchema
 */

export const STUDIO_IDE_ENHANCEMENTS_STYLE = `
    /* ===== Studio IDE Enhancements (src/shared/studioIdeEnhancements.ts) ===== */
    .studio-ws-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      padding: 2px 0 4px;
      border-bottom: 1px solid var(--sc-line, rgba(255,255,255,0.1));
    }
    .studio-ws-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px 6px 0 0;
      border: 1px solid var(--sc-line, rgba(255,255,255,0.12));
      border-bottom: none;
      background: color-mix(in srgb, var(--text-main, #fff) 4%, transparent);
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
      user-select: none;
    }
    .studio-ws-tab.active {
      background: color-mix(in srgb, var(--cyan, #38bdf8) 16%, transparent);
      color: var(--text-main, #fff);
      border-color: var(--cyan, #38bdf8);
    }
    .studio-ws-tab .ws-close {
      opacity: 0.6;
      font-size: 11px;
      line-height: 1;
      padding: 0 2px;
      border-radius: 3px;
    }
    .studio-ws-tab .ws-close:hover {
      opacity: 1;
      background: rgba(239,68,68,0.25);
      color: #fca5a5;
    }
    .studio-ws-add {
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 5px;
      border: 1px dashed var(--sc-line-strong, rgba(255,255,255,0.2));
      background: transparent;
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
    }
    .studio-ws-add:hover {
      color: var(--text-main, #fff);
      border-color: var(--cyan, #38bdf8);
    }
    .studio-sel-badge {
      margin-left: auto;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--cyan, #38bdf8) 18%, transparent);
      color: var(--cyan, #38bdf8);
      border: 1px solid color-mix(in srgb, var(--cyan, #38bdf8) 45%, transparent);
      display: none;
    }
    .studio-tx-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--text-main, #fff) 4%, transparent);
      border: 1px solid var(--sc-line, rgba(255,255,255,0.12));
    }
    .studio-tx-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.45);
      display: none;
    }
    .studio-ro-active {
      background: rgba(239, 68, 68, 0.2) !important;
      color: #fca5a5 !important;
      border-color: rgba(239, 68, 68, 0.55) !important;
    }
    /* Autocomplete Popup */
    #studioSqlSuggest {
      position: fixed;
      z-index: 10600;
      width: 320px;
      max-height: 240px;
      overflow-y: auto;
      background: var(--bg-surface, #0f172a);
      border: 1px solid var(--cyan, #38bdf8);
      border-radius: 8px;
      box-shadow: 0 14px 36px rgba(0,0,0,0.55);
      padding: 4px;
      display: none;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
    }
    .studio-ac-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 5px;
      cursor: pointer;
      color: var(--text-main, #f8fafc);
    }
    .studio-ac-item:hover, .studio-ac-item.active {
      background: color-mix(in srgb, var(--cyan, #38bdf8) 22%, transparent);
    }
    .studio-ac-kind {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--text-main, #fff) 10%, transparent);
      color: var(--text-muted, #94a3b8);
    }
    /* Query History Popover */
    #studioSqlHistoryDrawer {
      position: fixed;
      top: 110px;
      right: 24px;
      width: min(520px, calc(100vw - 32px));
      max-height: 420px;
      display: none;
      flex-direction: column;
      z-index: 10550;
      background: var(--bg-surface, #0f172a);
      border: 1px solid var(--sc-line-strong, rgba(255,255,255,0.22));
      border-radius: 10px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .studio-hist-item {
      padding: 8px 12px;
      border-bottom: 1px solid var(--sc-line, rgba(255,255,255,0.08));
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .studio-hist-item:hover {
      background: color-mix(in srgb, var(--text-main, #fff) 5%, transparent);
    }
    /* Foreign Key Drill-down Badge & Multi-Sort Badge */
    .studio-fk-jump {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 6px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.4;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--cyan, #38bdf8) 45%, transparent);
      background: color-mix(in srgb, var(--cyan, #38bdf8) 14%, transparent);
      color: var(--cyan, #38bdf8);
      cursor: pointer;
      vertical-align: middle;
    }
    .studio-fk-jump:hover {
      background: var(--cyan, #38bdf8);
      color: var(--bg-base, #000);
    }
    .studio-multisort-badge {
      display: inline-block;
      margin-left: 4px;
      padding: 0 4px;
      font-size: 9px;
      font-weight: 800;
      border-radius: 4px;
      background: color-mix(in srgb, var(--cyan, #38bdf8) 22%, transparent);
      color: var(--cyan, #38bdf8);
    }
    /* Row / JSON / BLOB Side Inspector */
    #studioRowInspector {
      width: 340px;
      min-width: 260px;
      max-width: 45vw;
      border-left: 1px solid var(--sc-line-strong, rgba(255,255,255,0.18));
      background: var(--bg-surface, #0f172a);
      display: none;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }
    #studioRowInspector.open {
      display: flex;
    }
    .studio-grid-split {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .studio-grid-split > #gridTableContainer {
      flex: 1;
      min-width: 0;
    }
    /* Schema Sub-Navigation (Table Designer / Full ER Diagram / Schema Diff) */
    .studio-schema-subnav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 14px;
      background: var(--bg-surface, #0f172a);
      border-bottom: 1px solid var(--sc-line, rgba(255,255,255,0.12));
      flex-shrink: 0;
    }
`;

function studioIdeEnhancementsClient() {
  if (window.StudioIdeEnhancements || typeof document === "undefined") return;

  const getDialect = () => {
    const inst = window.studioGridCols || (window.StudioCols && window.StudioCols.instances && window.StudioCols.instances.grid);
    if (inst && inst.studio) return inst.studio;
    const title = (document.title || "").toLowerCase();
    if (title.includes("postgres")) return "postgres";
    if (title.includes("mysql")) return "mysql";
    return "sqlite";
  };

  const getSchema = () => {
    try { if (typeof currentSchema !== "undefined" && currentSchema) return currentSchema; } catch (e) {}
    return window.currentSchema || null;
  };

  const getActiveTable = () => {
    try { if (typeof activeTable !== "undefined" && activeTable) return activeTable; } catch (e) {}
    return window.activeTable || "";
  };

  const getActiveColumnFilters = () => {
    try { if (typeof activeColumnFilters !== "undefined" && activeColumnFilters) return activeColumnFilters; } catch (e) {}
    if (!window.activeColumnFilters) window.activeColumnFilters = {};
    return window.activeColumnFilters;
  };

  const getGridRows = () => {
    try { if (typeof currentGridRows !== "undefined" && Array.isArray(currentGridRows)) return currentGridRows; } catch (e) {}
    if (Array.isArray(window.currentGridRows)) return window.currentGridRows;
    try { if (typeof currentGridData !== "undefined" && currentGridData && Array.isArray(currentGridData.rows)) return currentGridData.rows; } catch (e) {}
    return [];
  };

  const getGridColumns = () => {
    try { if (typeof currentGridColumns !== "undefined" && Array.isArray(currentGridColumns)) return currentGridColumns; } catch (e) {}
    if (Array.isArray(window.currentGridColumns)) return window.currentGridColumns;
    try { if (typeof currentGridData !== "undefined" && currentGridData && Array.isArray(currentGridData.columns)) return currentGridData.columns; } catch (e) {}
    const rows = getGridRows();
    return rows.length > 0 ? Object.keys(rows[0]) : [];
  };

  const triggerTableReload = (resetPage) => {
    try {
      if (resetPage) {
        try { if (typeof gridPage !== "undefined") gridPage = 1; } catch (e) {}
        try { if (typeof gridCurrentPage !== "undefined") gridCurrentPage = 1; } catch (e) {}
      }
      if (typeof window.fetchTableData === "function") return window.fetchTableData();
      if (typeof fetchTableData === "function") return fetchTableData();
      const tbl = getActiveTable();
      if (tbl && typeof window.loadTableData === "function") return window.loadTableData(tbl, resetPage ? 1 : undefined);
      if (tbl && typeof loadTableData === "function") return loadTableData(tbl, resetPage ? 1 : undefined);
    } catch (e) {}
  };

  const notify = (msg) => {
    try {
      if (typeof window.showToast === "function") return window.showToast(msg);
      if (typeof showToast === "function") return showToast(msg);
    } catch (e) {}
  };

  const callApi = async (endpoint, payload) => {
    try {
      const fn = window.apiRequest || (typeof apiRequest === "function" ? apiRequest : null);
      if (fn) {
        if (fn.length >= 3) return await fn(endpoint, "POST", payload);
        return await fn(endpoint, payload);
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // =========================================================================
  // 1. Wrap apiRequest for columnFilters, sortColumns, Read-Only Guard & History
  // =========================================================================
  window.__studioSortColumns = window.__studioSortColumns || [];
  window.__studioReadOnlyGuard = false;
  window.__studioInTx = false;
  window.__studioQueryHistory = [];

  const HIST_KEY = () => "bunrad.sqlHistory.v1:" + getDialect();
  const loadHistory = () => {
    try {
      const raw = localStorage.getItem(HIST_KEY());
      if (raw) window.__studioQueryHistory = JSON.parse(raw) || [];
    } catch (e) {}
  };
  const saveHistory = () => {
    try {
      localStorage.setItem(HIST_KEY(), JSON.stringify((window.__studioQueryHistory || []).slice(0, 50)));
    } catch (e) {}
  };

  const recordQueryHistory = (sql, latencyMs, rowCount, ok, errorMsg) => {
    if (!sql || !String(sql).trim()) return;
    const clean = String(sql).trim();
    window.__studioQueryHistory = [
      {
        sql: clean,
        ts: new Date().toLocaleTimeString(),
        latencyMs: latencyMs ?? 0,
        rowCount: rowCount ?? 0,
        ok: Boolean(ok),
        error: errorMsg || "",
      },
      ...(window.__studioQueryHistory || []).filter((h) => h.sql !== clean),
    ].slice(0, 50);
    saveHistory();
    renderHistoryList();
  };

  function wrapApiRequest() {
    const orig = window.apiRequest || (typeof apiRequest === "function" ? apiRequest : null);
    if (!orig || orig.__studioEnhanced) return;
    const wrapped = async function (endpoint, arg2, arg3) {
      let isThreeArg = typeof arg2 === "string";
      let body = isThreeArg ? arg3 : arg2;

      if (endpoint === "/api/table/data" && body && typeof body === "object") {
        const filters = getActiveColumnFilters();
        if (filters && Object.keys(filters).length > 0 && !body.columnFilters) {
          body = Object.assign({}, body, { columnFilters: Object.assign({}, filters) });
        }
        if (Array.isArray(window.__studioSortColumns) && window.__studioSortColumns.length > 0 && !body.sortColumns) {
          body = Object.assign({}, body, { sortColumns: window.__studioSortColumns.slice() });
        }
      }

      if (endpoint === "/api/query" && body && typeof body.sql === "string") {
        const sqlTrim = body.sql.trim();
        if (window.__studioReadOnlyGuard && /^(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|VACUUM)\b/i.test(sqlTrim)) {
          notify("🔒 Read-Only Guard is active — disable it to run mutating SQL.");
          return { success: false, error: "Blocked by Read-Only Guard (mutating statement prevented)" };
        }
        const t0 = performance.now();
        const res = isThreeArg ? await orig.call(this, endpoint, arg2, body) : await orig.call(this, endpoint, body);
        const elapsed = (res && typeof res.latencyMs === "number") ? res.latencyMs : Math.round(performance.now() - t0);
        const rowsCount = res && Array.isArray(res.rows) ? res.rows.length : (res && res.rowsAffected !== undefined ? res.rowsAffected : 0);
        recordQueryHistory(sqlTrim, elapsed, rowsCount, res && res.success !== false, res && res.error);
        return res;
      }

      return isThreeArg ? await orig.call(this, endpoint, arg2, body) : await orig.call(this, endpoint, body);
    };
    wrapped.__studioEnhanced = true;
    window.apiRequest = wrapped;
    try { apiRequest = wrapped; } catch (e) {}
  }

  // =========================================================================
  // 2. Wrap runEditorQuery for Highlighted Selection Execution
  // =========================================================================
  function getPrimaryEditor() {
    const activeTabEl = document.getElementById("tabSql");
    if (activeTabEl && activeTabEl.classList.contains("active")) {
      const ta = document.getElementById("sqlEditorTextarea");
      if (ta) return ta;
    }
    return document.getElementById("sqlEditor") || document.getElementById("sqlEditorTextarea");
  }

  function wrapRunEditorQuery() {
    const orig = window.runEditorQuery || (typeof runEditorQuery === "function" ? runEditorQuery : null);
    if (!orig || orig.__studioSelectionWrapped) return;
    const wrapped = async function () {
      const ed = getPrimaryEditor();
      const ed1 = document.getElementById("sqlEditor");
      const ed2 = document.getElementById("sqlEditorTextarea");
      if (ed && typeof ed.selectionStart === "number" && ed.selectionStart !== ed.selectionEnd) {
        const fullVal = ed.value;
        const start = ed.selectionStart;
        const end = ed.selectionEnd;
        const selected = fullVal.slice(start, end).trim();
        if (selected) {
          ed.value = selected;
          if (ed1 && ed1 !== ed) ed1.value = selected;
          if (ed2 && ed2 !== ed) ed2.value = selected;
          try {
            return await orig.apply(this, arguments);
          } finally {
            ed.value = fullVal;
            if (ed1 && ed1 !== ed) ed1.value = fullVal;
            if (ed2 && ed2 !== ed) ed2.value = fullVal;
            try { ed.setSelectionRange(start, end); } catch (e) {}
          }
        }
      }
      return await orig.apply(this, arguments);
    };
    wrapped.__studioSelectionWrapped = true;
    window.runEditorQuery = wrapped;
    window.executeCurrentQuery = wrapped;
    try { runEditorQuery = wrapped; } catch (e) {}
  }

  // =========================================================================
  // 3. Multi-Tab SQL Worksheets + Format SQL + History + Transactions + ReadOnly
  // =========================================================================
  let worksheets = [{ id: "ws1", title: "Worksheet 1", sql: "" }];
  let activeWsId = "ws1";
  const WS_KEY = () => "bunrad.worksheets.v1:" + getDialect();

  function loadWorksheets(initialSql) {
    try {
      const raw = localStorage.getItem(WS_KEY());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          worksheets = parsed.tabs;
          activeWsId = parsed.activeId || worksheets[0].id;
          return;
        }
      }
    } catch (e) {}
    worksheets = [{ id: "ws1", title: "Worksheet 1", sql: initialSql || "" }];
    activeWsId = "ws1";
  }

  function saveWorksheets() {
    try {
      localStorage.setItem(WS_KEY(), JSON.stringify({ activeId: activeWsId, tabs: worksheets }));
    } catch (e) {}
  }

  function renderWorksheetTabs() {
    const bar = document.getElementById("studioWorksheetBar");
    if (!bar) return;
    const tabsHtml = worksheets.map((w) => {
      const active = w.id === activeWsId ? " active" : "";
      const closeBtn = worksheets.length > 1
        ? `<span class="ws-close" data-ws-close="${esc(w.id)}" title="Close worksheet">×</span>`
        : "";
      return `<button type="button" class="studio-ws-tab${active}" data-ws-id="${esc(w.id)}" title="Double-click to rename">${esc(w.title)}${closeBtn}</button>`;
    }).join("");
    bar.innerHTML = `${tabsHtml}<button type="button" class="studio-ws-add" id="btnAddWorksheet" title="New SQL Worksheet">+</button><span class="studio-sel-badge" id="studioSelectionBadge">Selection active — Execute runs highlighted SQL</span>`;

    bar.querySelectorAll(".studio-ws-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const closeId = e.target && e.target.getAttribute && e.target.getAttribute("data-ws-close");
        if (closeId) {
          e.stopPropagation();
          if (worksheets.length <= 1) return;
          const idx = worksheets.findIndex((w) => w.id === closeId);
          worksheets = worksheets.filter((w) => w.id !== closeId);
          if (activeWsId === closeId) {
            activeWsId = worksheets[Math.max(0, idx - 1)].id;
            const cur = worksheets.find((w) => w.id === activeWsId);
            const ed = document.getElementById("sqlEditor");
            if (ed && cur) ed.value = cur.sql || "";
          }
          saveWorksheets();
          renderWorksheetTabs();
          return;
        }
        const id = btn.getAttribute("data-ws-id");
        const ed = document.getElementById("sqlEditor");
        const prev = worksheets.find((w) => w.id === activeWsId);
        if (prev && ed) prev.sql = ed.value;
        activeWsId = id;
        const next = worksheets.find((w) => w.id === activeWsId);
        if (next && ed) {
          ed.value = next.sql || "";
          const ed2 = document.getElementById("sqlEditorTextarea");
          if (ed2) ed2.value = next.sql || "";
        }
        saveWorksheets();
        renderWorksheetTabs();
      });
      btn.addEventListener("dblclick", async () => {
        const id = btn.getAttribute("data-ws-id");
        const target = worksheets.find((w) => w.id === id);
        if (!target) return;
        const newName = typeof studioPrompt === "function" ? await studioPrompt("Rename worksheet:", target.title) : null;
        if (newName && newName.trim()) {
          target.title = newName.trim();
          saveWorksheets();
          renderWorksheetTabs();
        }
      });
    });

    const addBtn = document.getElementById("btnAddWorksheet");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const ed = document.getElementById("sqlEditor");
        const prev = worksheets.find((w) => w.id === activeWsId);
        if (prev && ed) prev.sql = ed.value;
        const newId = "ws_" + Date.now();
        const num = worksheets.length + 1;
        worksheets.push({ id: newId, title: "Worksheet " + num, sql: "" });
        activeWsId = newId;
        if (ed) ed.value = "";
        saveWorksheets();
        renderWorksheetTabs();
        if (ed) ed.focus();
      });
    }
  }

  async function formatStudioSql() {
    const ed = getPrimaryEditor();
    if (!ed) return;
    const hasSel = typeof ed.selectionStart === "number" && ed.selectionStart !== ed.selectionEnd;
    const rawSql = hasSel ? ed.value.slice(ed.selectionStart, ed.selectionEnd) : ed.value;
    if (!rawSql.trim()) {
      notify("Enter a SQL query to format.");
      return;
    }
    const res = await callApi("/api/sql/format", { sql: rawSql, dialect: getDialect() });
    const formattedSql = res && (typeof res.formatted === "string" ? res.formatted : typeof res.sql === "string" ? res.sql : null);
    if (res && res.success && formattedSql !== null) {
      if (hasSel) {
        const start = ed.selectionStart;
        const end = ed.selectionEnd;
        ed.value = ed.value.slice(0, start) + formattedSql + ed.value.slice(end);
        try { ed.setSelectionRange(start, start + formattedSql.length); } catch (e) {}
      } else {
        ed.value = formattedSql;
      }
      const cur = worksheets.find((w) => w.id === activeWsId);
      if (cur) { cur.sql = ed.value; saveWorksheets(); }
      notify("✨ SQL formatted");
    } else {
      notify("Format error: " + (res?.error || "Unable to format SQL"));
    }
  }
  window.formatStudioSql = formatStudioSql;

  async function runTxCommand(cmd) {
    const prevGuard = window.__studioReadOnlyGuard;
    window.__studioReadOnlyGuard = false;
    try {
      const res = await callApi("/api/query", { sql: cmd });
      if (res && res.success !== false) {
        if (/^BEGIN/i.test(cmd)) window.__studioInTx = true;
        else window.__studioInTx = false;
        const badge = document.getElementById("studioTxBadge");
        if (badge) badge.style.display = window.__studioInTx ? "inline-block" : "none";
        notify("✓ Transaction: " + cmd);
        if (/^(COMMIT|ROLLBACK)/i.test(cmd)) triggerTableReload(false);
      } else {
        notify("Transaction error: " + (res?.error || "Failed"));
      }
    } finally {
      window.__studioReadOnlyGuard = prevGuard;
    }
  }
  window.runStudioTxCommand = runTxCommand;

  function toggleReadOnlyGuard() {
    window.__studioReadOnlyGuard = !window.__studioReadOnlyGuard;
    const btn = document.getElementById("btnReadOnlyGuard");
    if (btn) {
      btn.classList.toggle("studio-ro-active", window.__studioReadOnlyGuard);
      btn.textContent = window.__studioReadOnlyGuard ? "🔒 Read-Only: ON" : "🔓 Read-Only: OFF";
    }
    notify(window.__studioReadOnlyGuard ? "🔒 Read-Only Guard enabled (mutations blocked)" : "🔓 Read-Only Guard disabled");
  }
  window.toggleStudioReadOnlyGuard = toggleReadOnlyGuard;

  // =========================================================================
  // 4. Searchable Query History Drawer
  // =========================================================================
  function ensureHistoryDrawer() {
    if (document.getElementById("studioSqlHistoryDrawer")) return;
    const drawer = document.createElement("div");
    drawer.id = "studioSqlHistoryDrawer";
    drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--sc-line,rgba(255,255,255,0.12));">
        <span style="font-weight:700;font-size:12px;color:var(--cyan,#38bdf8);">🕒 Query History</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="text" id="studioHistSearch" placeholder="Filter history..." style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--sc-line-strong,rgba(255,255,255,0.2));background:rgba(0,0,0,0.25);color:var(--text-main,#fff);width:150px;">
          <button type="button" class="btn btn-sm" id="btnStudioHistClear">Clear</button>
          <button type="button" class="sidebar-mini-btn" id="btnStudioHistClose">✕</button>
        </div>
      </div>
      <div id="studioHistList" style="flex:1;overflow-y:auto;max-height:360px;"></div>
    `;
    document.body.appendChild(drawer);
    document.getElementById("studioHistSearch").addEventListener("input", renderHistoryList);
    document.getElementById("btnStudioHistClear").addEventListener("click", () => {
      window.__studioQueryHistory = [];
      saveHistory();
      renderHistoryList();
    });
    document.getElementById("btnStudioHistClose").addEventListener("click", () => {
      drawer.style.display = "none";
    });
  }

  function renderHistoryList() {
    const listEl = document.getElementById("studioHistList");
    if (!listEl) return;
    const q = (document.getElementById("studioHistSearch")?.value || "").toLowerCase().trim();
    const items = (window.__studioQueryHistory || []).filter((h) => !q || h.sql.toLowerCase().includes(q));
    if (!items.length) {
      listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted,#94a3b8);font-size:11px;">No queries recorded yet.</div>`;
      return;
    }
    listEl.innerHTML = items.map((h, idx) => `
      <div class="studio-hist-item">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text-muted,#94a3b8);">
          <span>${esc(h.ts)} • <b>${esc(h.latencyMs)}ms</b> • ${esc(h.rowCount)} rows ${h.ok ? '<span style="color:#10b981;">✓</span>' : '<span style="color:#ef4444;">⚠️</span>'}</span>
          <div style="display:flex;gap:4px;">
            <button type="button" class="btn btn-sm" data-hist-load="${idx}">Load</button>
            <button type="button" class="btn btn-sm btn-primary" data-hist-run="${idx}">▶ Run</button>
          </div>
        </div>
        <div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text-main,#f8fafc);white-space:pre-wrap;max-height:54px;overflow:hidden;">${esc(h.sql)}</div>
      </div>
    `).join("");

    listEl.querySelectorAll("[data-hist-load]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = items[Number(b.getAttribute("data-hist-load"))];
        const ed = getPrimaryEditor();
        if (item && ed) {
          ed.value = item.sql;
          const cur = worksheets.find((w) => w.id === activeWsId);
          if (cur) { cur.sql = item.sql; saveWorksheets(); }
        }
      });
    });
    listEl.querySelectorAll("[data-hist-run]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = items[Number(b.getAttribute("data-hist-run"))];
        const ed = getPrimaryEditor();
        if (item && ed) {
          ed.value = item.sql;
          document.getElementById("studioSqlHistoryDrawer").style.display = "none";
          window.runEditorQuery();
        }
      });
    });
  }

  function toggleHistoryDrawer() {
    ensureHistoryDrawer();
    const d = document.getElementById("studioSqlHistoryDrawer");
    const open = d.style.display === "flex";
    d.style.display = open ? "none" : "flex";
    if (!open) renderHistoryList();
  }
  window.toggleStudioSqlHistory = toggleHistoryDrawer;

  // =========================================================================
  // 5. Schema-Aware SQL Autocomplete (Ctrl+Space or table.)
  // =========================================================================
  let acItems = [];
  let acIndex = 0;
  let acTargetEditor = null;
  let acReplaceRange = [0, 0];

  function ensureSuggestBox() {
    let box = document.getElementById("studioSqlSuggest");
    if (!box) {
      box = document.createElement("div");
      box.id = "studioSqlSuggest";
      document.body.appendChild(box);
    }
    return box;
  }

  function closeSuggest() {
    const box = document.getElementById("studioSqlSuggest");
    if (box) box.style.display = "none";
    acItems = [];
  }

  function buildSuggestions(ed) {
    const val = ed.value || "";
    const pos = ed.selectionStart || 0;
    const before = val.slice(0, pos);
    const dotMatch = before.match(/([A-Za-z0-9_"]+)\.([A-Za-z0-9_]*)$/);
    const wordMatch = before.match(/([A-Za-z0-9_]*)$/);
    const schema = getSchema();
    const tables = (schema && schema.tables) || [];
    const views = (schema && schema.views) || [];
    const list = [];

    if (dotMatch) {
      const tblPrefix = dotMatch[1].replace(/"/g, "").toLowerCase();
      const colPrefix = (dotMatch[2] || "").toLowerCase();
      acReplaceRange = [pos - (dotMatch[2] || "").length, pos];
      const tbl = [...tables, ...views].find((t) => String(t.name).toLowerCase() === tblPrefix);
      const cols = tbl ? (tbl.columns || []) : tables.flatMap((t) => t.columns || []);
      cols.forEach((c) => {
        if (!colPrefix || String(c.name).toLowerCase().startsWith(colPrefix)) {
          list.push({ label: c.name, insert: c.name, kind: (c.pk ? "🔑 " : "") + (c.type || "col") });
        }
      });
      return list.slice(0, 30);
    }

    const prefix = (wordMatch ? wordMatch[1] : "").toLowerCase();
    acReplaceRange = [pos - prefix.length, pos];
    tables.forEach((t) => {
      if (!prefix || t.name.toLowerCase().includes(prefix)) {
        list.push({ label: t.name, insert: t.name, kind: "table" });
      }
      (t.columns || []).forEach((c) => {
        if (prefix && c.name.toLowerCase().startsWith(prefix)) {
          list.push({ label: `${c.name} (${t.name})`, insert: c.name, kind: c.type || "column" });
        }
      });
    });
    views.forEach((v) => {
      if (!prefix || v.name.toLowerCase().includes(prefix)) {
        list.push({ label: v.name, insert: v.name, kind: "view" });
      }
    });
    ["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "INNER JOIN", "GROUP BY", "ORDER BY", "LIMIT", "INSERT INTO", "UPDATE", "DELETE FROM", "WITH", "HAVING", "DISTINCT", "COUNT(*)"].forEach((kw) => {
      if (!prefix || kw.toLowerCase().startsWith(prefix)) {
        list.push({ label: kw, insert: kw, kind: "sql" });
      }
    });
    return list.slice(0, 30);
  }

  function applySuggestion(item) {
    if (!acTargetEditor || !item) return;
    const v = acTargetEditor.value;
    const [start, end] = acReplaceRange;
    acTargetEditor.value = v.slice(0, start) + item.insert + v.slice(end);
    const caret = start + item.insert.length;
    try { acTargetEditor.setSelectionRange(caret, caret); } catch (e) {}
    acTargetEditor.focus();
    closeSuggest();
  }

  function showSuggestions(ed) {
    acTargetEditor = ed;
    acItems = buildSuggestions(ed);
    const box = ensureSuggestBox();
    if (!acItems.length) {
      closeSuggest();
      return;
    }
    acIndex = 0;
    const rect = ed.getBoundingClientRect();
    box.style.left = Math.min(window.innerWidth - 332, Math.max(8, rect.left + 24)) + "px";
    box.style.top = Math.min(window.innerHeight - 250, rect.bottom + 4) + "px";
    box.style.display = "block";
    renderSuggestItems();
  }

  function renderSuggestItems() {
    const box = document.getElementById("studioSqlSuggest");
    if (!box) return;
    box.innerHTML = acItems.map((it, idx) => `
      <div class="studio-ac-item${idx === acIndex ? " active" : ""}" data-ac-idx="${idx}">
        <span>${esc(it.label)}</span>
        <span class="studio-ac-kind">${esc(it.kind)}</span>
      </div>
    `).join("");
    box.querySelectorAll(".studio-ac-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applySuggestion(acItems[Number(el.getAttribute("data-ac-idx"))]);
      });
    });
  }

  function bindEditorEnhancements(ed) {
    if (!ed || ed.__studioEditorBound) return;
    ed.__studioEditorBound = true;

    const updateSelectionBadge = () => {
      const badge = document.getElementById("studioSelectionBadge");
      if (!badge) return;
      const hasSel = typeof ed.selectionStart === "number" && ed.selectionStart !== ed.selectionEnd && ed.value.slice(ed.selectionStart, ed.selectionEnd).trim().length > 0;
      badge.style.display = hasSel ? "inline-block" : "none";
    };

    ed.addEventListener("select", updateSelectionBadge);
    ed.addEventListener("keyup", updateSelectionBadge);
    ed.addEventListener("mouseup", updateSelectionBadge);

    ed.addEventListener("input", () => {
      const cur = worksheets.find((w) => w.id === activeWsId);
      if (cur && ed.id === "sqlEditor") {
        cur.sql = ed.value;
        saveWorksheets();
      }
      const pos = ed.selectionStart || 0;
      if (pos > 1 && ed.value[pos - 1] === ".") {
        showSuggestions(ed);
      } else if (document.getElementById("studioSqlSuggest")?.style.display === "block") {
        showSuggestions(ed);
      }
    });

    ed.addEventListener("keydown", (e) => {
      const box = document.getElementById("studioSqlSuggest");
      if (box && box.style.display === "block" && acItems.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderSuggestItems(); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderSuggestItems(); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(acItems[acIndex]); return; }
        if (e.key === "Escape") { e.preventDefault(); closeSuggest(); return; }
      }
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        showSuggestions(ed);
        return;
      }
      if (e.shiftKey && e.altKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        formatStudioSql();
      }
    });

    ed.addEventListener("blur", () => setTimeout(closeSuggest, 150));
  }

  function setupEditorUi() {
    const ed = document.getElementById("sqlEditor");
    if (!ed) return;
    loadHistory();
    loadWorksheets(ed.value);
    if (worksheets[0] && !worksheets[0].sql && ed.value) {
      worksheets[0].sql = ed.value;
    } else {
      const cur = worksheets.find((w) => w.id === activeWsId);
      if (cur && cur.sql) ed.value = cur.sql;
    }

    const inputBox = ed.closest(".sql-input-box") || ed.parentElement;
    if (inputBox && !document.getElementById("studioWorksheetBar")) {
      const wsBar = document.createElement("div");
      wsBar.id = "studioWorksheetBar";
      wsBar.className = "studio-ws-bar";
      inputBox.insertBefore(wsBar, ed);
      renderWorksheetTabs();
    }

    const controlsLeft = document.querySelector(".editor-controls-left");
    if (controlsLeft && !document.getElementById("btnStudioFormatSql")) {
      const fmtBtn = document.createElement("button");
      fmtBtn.type = "button";
      fmtBtn.className = "btn";
      fmtBtn.id = "btnStudioFormatSql";
      fmtBtn.title = "Format SQL with sql-formatter (Shift+Alt+F)";
      fmtBtn.textContent = "✨ Format";
      fmtBtn.addEventListener("click", formatStudioSql);
      controlsLeft.appendChild(fmtBtn);

      const histBtn = document.createElement("button");
      histBtn.type = "button";
      histBtn.className = "btn";
      histBtn.id = "btnStudioSqlHistory";
      histBtn.title = "View & search executed query history";
      histBtn.textContent = "🕒 History";
      histBtn.addEventListener("click", toggleHistoryDrawer);
      controlsLeft.appendChild(histBtn);

      const txGroup = document.createElement("span");
      txGroup.className = "studio-tx-group";
      txGroup.id = "studioTxBar";
      txGroup.innerHTML = `
        <span class="studio-tx-badge" id="studioTxBadge">TX ACTIVE</span>
        <button type="button" class="btn btn-sm" id="btnTxBegin" title="Start SQL Transaction">BEGIN</button>
        <button type="button" class="btn btn-sm" id="btnTxCommit" title="Commit Transaction">COMMIT</button>
        <button type="button" class="btn btn-sm" id="btnTxRollback" title="Rollback Transaction">ROLLBACK</button>
        <button type="button" class="btn btn-sm" id="btnReadOnlyGuard" title="Block mutating SQL statements">🔓 Read-Only: OFF</button>
      `;
      controlsLeft.appendChild(txGroup);

      document.getElementById("btnTxBegin")?.addEventListener("click", () => runTxCommand("BEGIN"));
      document.getElementById("btnTxCommit")?.addEventListener("click", () => runTxCommand("COMMIT"));
      document.getElementById("btnTxRollback")?.addEventListener("click", () => runTxCommand("ROLLBACK"));
      document.getElementById("btnReadOnlyGuard")?.addEventListener("click", toggleReadOnlyGuard);
    }

    bindEditorEnhancements(ed);
    const ed2 = document.getElementById("sqlEditorTextarea");
    if (ed2) bindEditorEnhancements(ed2);
  }

  // =========================================================================
  // 6. Server-Backed Quick Filter & Shift+Click Multi-Column Sort
  // =========================================================================
  let filterDebounceTimer = null;
  function wrapColumnFilterInput() {
    const orig = window.onColumnFilterInput || (typeof onColumnFilterInput === "function" ? onColumnFilterInput : null);
    if (!orig || orig.__studioServerWrapped) return;
    const wrapped = function (colName, filterVal) {
      const res = orig.apply(this, arguments);
      if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
      filterDebounceTimer = setTimeout(() => {
        const tbl = getActiveTable();
        const isQuery = Boolean((window.crud && window.crud.source === "query") || window.__gridIsQuery);
        if (tbl && !isQuery) {
          window.__keepFilterRow = true;
          Promise.resolve(triggerTableReload(true)).finally(() => {
            window.__keepFilterRow = false;
          });
        }
      }, 220);
      return res;
    };
    wrapped.__studioServerWrapped = true;
    window.onColumnFilterInput = wrapped;
    try { onColumnFilterInput = wrapped; } catch (e) {}
  }

  function decorateMultiSortHeaders() {
    const thead = document.getElementById("gridHeaderRow");
    if (!thead) return;
    thead.querySelectorAll(".studio-multisort-badge").forEach((b) => b.remove());
    const sorts = window.__studioSortColumns || [];
    if (!sorts.length) return;
    sorts.forEach((s, idx) => {
      const th = thead.querySelector(`th[data-col="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s.col) : s.col}"]`);
      if (th) {
        const badge = document.createElement("span");
        badge.className = "studio-multisort-badge";
        badge.textContent = (s.dir === "DESC" ? "▼" : "▲") + (sorts.length > 1 ? String(idx + 1) : "");
        th.appendChild(badge);
      }
    });
  }

  function setupMultiColumnSort() {
    const thead = document.getElementById("gridHeaderRow");
    if (!thead || thead.__studioMultiSortBound) return;
    thead.__studioMultiSortBound = true;
    thead.addEventListener("click", (e) => {
      if (!e.shiftKey || thead.querySelector("th.sc-colsel")) return;
      const th = e.target && e.target.closest && e.target.closest("th[data-col]");
      if (!th || (e.target && e.target.closest(".sc-th-btn, .sc-rz"))) return;
      const col = th.getAttribute("data-col");
      if (!col || !getActiveTable()) return;
      e.preventDefault();
      e.stopPropagation();
      const list = window.__studioSortColumns || [];
      const existingIdx = list.findIndex((s) => s.col === col);
      if (existingIdx === -1) {
        list.push({ col, dir: "ASC" });
      } else if (list[existingIdx].dir === "ASC") {
        list[existingIdx].dir = "DESC";
      } else {
        list.splice(existingIdx, 1);
      }
      window.__studioSortColumns = list;
      decorateMultiSortHeaders();
      triggerTableReload(false);
    }, true);
  }

  // =========================================================================
  // 7. Foreign Key Cell Drill-Down (↗ badge + Alt+Click) & Row Side Inspector
  // =========================================================================
  function getForeignKeyMapForActiveTable() {
    const schema = getSchema();
    const tblName = getActiveTable();
    const map = {};
    if (!schema || !tblName || !Array.isArray(schema.tables)) return map;
    const tbl = schema.tables.find((t) => t.name === tblName);
    if (!tbl || !Array.isArray(tbl.foreignKeys)) return map;
    tbl.foreignKeys.forEach((fk) => {
      if (fk && fk.from && fk.table) {
        map[fk.from] = { table: fk.table, to: fk.to || "id" };
      }
    });
    return map;
  }

  async function navigateToForeignKeyTarget(refTable, refCol, rawVal) {
    if (!refTable || rawVal === null || rawVal === undefined) return;
    window.__studioSortColumns = [];
    const filters = getActiveColumnFilters();
    for (const k of Object.keys(filters)) delete filters[k];
    filters[refCol] = String(rawVal);

    try { if (typeof accessFilterBarVisible !== "undefined") accessFilterBarVisible = true; } catch (e) {}
    const filterBtn = document.getElementById("btnToggleFilterBar");
    if (filterBtn) filterBtn.classList.add("btn-primary");

    if (typeof window.selectEntity === "function") {
      await window.selectEntity(refTable, "table");
    } else if (typeof window.selectTable === "function") {
      await window.selectTable(refTable);
    } else if (typeof selectTable === "function") {
      await selectTable(refTable);
    }
    const filterRow = document.getElementById("gridFilterBarRow");
    if (filterRow) filterRow.style.display = "table-row";
    notify(`↗ Filtered ${refTable}.${refCol} = ${rawVal}`);
  }
  window.navigateToForeignKeyTarget = navigateToForeignKeyTarget;

  function decorateForeignKeyCells() {
    const tbody = document.getElementById("gridBody");
    if (!tbody) return;
    const fkMap = getForeignKeyMapForActiveTable();
    const fkCols = Object.keys(fkMap);
    if (!fkCols.length) return;
    const rows = getGridRows();

    Array.from(tbody.querySelectorAll("tr")).forEach((tr, rIdx) => {
      const rowData = rows[Number(tr.getAttribute("data-row") ?? rIdx)] || {};
      fkCols.forEach((col) => {
        const td = tr.querySelector(`td[data-col="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(col) : col}"]`);
        if (!td || td.querySelector(".studio-fk-jump") || td.classList.contains("cell-null") || td.classList.contains("sc-null")) return;
        const val = rowData[col] !== undefined ? rowData[col] : td.textContent.trim();
        if (val === null || val === undefined || val === "NULL" || val === "") return;
        const fk = fkMap[col];
        td.setAttribute("data-fk-table", fk.table);
        td.setAttribute("data-fk-col", fk.to);
        td.setAttribute("data-fk-val", String(val));

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "studio-fk-jump";
        btn.title = `Jump to ${fk.table}.${fk.to} = ${val} (or Alt+Click cell)`;
        btn.textContent = "↗";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigateToForeignKeyTarget(fk.table, fk.to, val);
        });
        td.appendChild(btn);
      });
    });
  }

  function setupRowInspector() {
    const gridContainer = document.getElementById("gridTableContainer");
    if (!gridContainer || document.getElementById("studioRowInspector")) return;

    const parent = gridContainer.parentElement;
    const splitWrap = document.createElement("div");
    splitWrap.className = "studio-grid-split";
    parent.insertBefore(splitWrap, gridContainer);
    splitWrap.appendChild(gridContainer);

    const inspector = document.createElement("aside");
    inspector.id = "studioRowInspector";
    inspector.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--sc-line,rgba(255,255,255,0.12));">
        <span style="font-weight:700;font-size:12px;color:var(--cyan,#38bdf8);">🔍 Row &amp; JSON/BLOB Inspector</span>
        <button type="button" class="sidebar-mini-btn" id="btnCloseRowInspector" title="Close Inspector">✕</button>
      </div>
      <div id="studioRowInspectorBody" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;font-size:11px;">
        <div style="color:var(--text-muted,#94a3b8);text-align:center;padding:24px 8px;">Click any row in the data grid to inspect its fields, formatted JSON, and foreign keys.</div>
      </div>
    `;
    splitWrap.appendChild(inspector);

    const filterBtn = document.getElementById("btnToggleFilterBar");
    if (filterBtn && filterBtn.parentElement && !document.getElementById("btnToggleRowInspector")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm";
      btn.id = "btnToggleRowInspector";
      btn.title = "Toggle Row / JSON / BLOB Side Inspector";
      btn.textContent = "🔍 Inspector";
      btn.addEventListener("click", () => {
        const isOpen = inspector.classList.toggle("open");
        btn.classList.toggle("btn-primary", isOpen);
      });
      filterBtn.parentElement.appendChild(btn);
    }

    document.getElementById("btnCloseRowInspector")?.addEventListener("click", () => {
      inspector.classList.remove("open");
      document.getElementById("btnToggleRowInspector")?.classList.remove("btn-primary");
    });

    const tbody = document.getElementById("gridBody");
    if (tbody) {
      tbody.addEventListener("click", (e) => {
        const td = e.target && e.target.closest && e.target.closest("td[data-fk-table]");
        if (td && e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          navigateToForeignKeyTarget(td.getAttribute("data-fk-table"), td.getAttribute("data-fk-col"), td.getAttribute("data-fk-val"));
          return;
        }
        const tr = e.target && e.target.closest && e.target.closest("tr");
        if (!tr) return;
        const rows = getGridRows();
        const rIdx = tr.hasAttribute("data-row") ? Number(tr.getAttribute("data-row")) : Array.from(tbody.children).indexOf(tr);
        if (rows[rIdx]) renderInspectorRow(rows[rIdx], rIdx);
      });
    }
  }

  function renderInspectorRow(row, rIdx) {
    const body = document.getElementById("studioRowInspectorBody");
    if (!body || !row) return;
    const cols = getGridColumns();
    const fkMap = getForeignKeyMapForActiveTable();
    const schema = getSchema();
    const tblMeta = schema && Array.isArray(schema.tables) ? schema.tables.find((t) => t.name === getActiveTable()) : null;
    const colMeta = {};
    if (tblMeta && Array.isArray(tblMeta.columns)) tblMeta.columns.forEach((c) => { colMeta[c.name] = c; });

    body.innerHTML = `<div style="font-size:10px;color:var(--text-muted,#94a3b8);font-weight:700;">Row #${rIdx + 1} in ${esc(getActiveTable() || "Query Result")}</div>` +
      cols.map((c) => {
        const v = row[c];
        const meta = colMeta[c] || {};
        const fk = fkMap[c];
        let displayVal = "";
        let extraBadge = "";
        if (v === null || v === undefined) {
          displayVal = "<i style='color:var(--text-muted,#94a3b8);'>NULL</i>";
        } else if (typeof v === "object") {
          extraBadge = "<span class='sc-mark idx'>JSON</span>";
          displayVal = `<pre style="margin:0;white-space:pre-wrap;color:#fde68a;font-family:var(--font-mono,monospace);">${esc(JSON.stringify(v, null, 2))}</pre>`;
        } else {
          const s = String(v);
          if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
            try {
              const parsed = JSON.parse(s);
              extraBadge = "<span class='sc-mark idx'>JSON</span>";
              displayVal = `<pre style="margin:0;white-space:pre-wrap;color:#fde68a;font-family:var(--font-mono,monospace);">${esc(JSON.stringify(parsed, null, 2))}</pre>`;
            } catch (e) {
              displayVal = esc(s);
            }
          } else {
            displayVal = esc(s);
          }
        }
        const fkBtn = fk && v !== null && v !== undefined
          ? `<button type="button" class="studio-fk-jump" data-insp-fk-tbl="${esc(fk.table)}" data-insp-fk-col="${esc(fk.to)}" data-insp-fk-val="${esc(String(v))}">↗ ${esc(fk.table)}.${esc(fk.to)}</button>`
          : "";
        return `
          <div style="border:1px solid var(--sc-line,rgba(255,255,255,0.1));border-radius:6px;padding:6px 8px;background:rgba(0,0,0,0.2);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;">
              <span style="font-weight:700;font-family:var(--font-mono,monospace);color:var(--cyan,#38bdf8);">${meta.pk ? "🔑 " : ""}${esc(c)}</span>
              <div style="display:flex;gap:4px;align-items:center;">
                ${meta.type ? `<span style="font-size:9px;color:var(--text-muted,#94a3b8);">${esc(meta.type)}</span>` : ""}
                ${extraBadge}
                ${fkBtn}
              </div>
            </div>
            <div style="font-family:var(--font-mono,monospace);word-break:break-all;max-height:140px;overflow:auto;">${displayVal}</div>
          </div>
        `;
      }).join("");

    body.querySelectorAll("[data-insp-fk-tbl]").forEach((b) => {
      b.addEventListener("click", () => {
        navigateToForeignKeyTarget(
          b.getAttribute("data-insp-fk-tbl"),
          b.getAttribute("data-insp-fk-col"),
          b.getAttribute("data-insp-fk-val")
        );
      });
    });
  }

  // =========================================================================
  // 8. Full-Database SVG ER Diagram & Schema Diff / Migration Generator
  // =========================================================================
  let erZoom = 1;
  let baselineSnapshot = null;

  function setupSchemaEnhancements() {
    const tabSchema = document.getElementById("tabSchema");
    const schemaContainer = document.getElementById("schemaContainer");
    if (!tabSchema || !schemaContainer || document.getElementById("studioSchemaSubnav")) return;

    const subnav = document.createElement("div");
    subnav.id = "studioSchemaSubnav";
    subnav.className = "studio-schema-subnav";
    subnav.innerHTML = `
      <div style="display:flex;gap:6px;align-items:center;">
        <button type="button" class="btn btn-sm btn-primary" id="btnSchemaModeTable">📋 Table Designer</button>
        <button type="button" class="btn btn-sm" id="btnSchemaModeEr">🗺️ Full ER Diagram</button>
        <button type="button" class="btn btn-sm" id="btnSchemaModeDiff">🔀 Schema Diff &amp; Migration</button>
      </div>
      <div id="studioErControls" style="display:none;gap:6px;align-items:center;">
        <button type="button" class="btn btn-sm" id="btnErZoomOut">➖</button>
        <span id="studioErZoomLabel" style="font-size:11px;min-width:42px;text-align:center;">100%</span>
        <button type="button" class="btn btn-sm" id="btnErZoomIn">➕</button>
        <button type="button" class="btn btn-sm" id="btnErExportSvg">📥 Export SVG</button>
      </div>
    `;
    tabSchema.insertBefore(subnav, schemaContainer);

    const erPane = document.createElement("div");
    erPane.id = "studioErDiagramPane";
    erPane.style.cssText = "display:none;flex:1;overflow:auto;padding:14px;background:var(--bg-base,#060b14);min-height:420px;";
    tabSchema.appendChild(erPane);

    const diffPane = document.createElement("div");
    diffPane.id = "studioSchemaDiffPane";
    diffPane.style.cssText = "display:none;flex:1;overflow:auto;padding:14px;min-height:420px;";
    diffPane.innerHTML = `
      <div class="card" style="padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--cyan,#38bdf8);">🔀 Schema Diff &amp; Migration DDL Generator</div>
            <div id="studioDiffBaselineInfo" style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:2px;">No baseline snapshot captured yet. Capture a snapshot before making schema changes to generate migration DDL.</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" id="btnCaptureBaseline">📸 Capture Baseline Snapshot</button>
            <button type="button" class="btn btn-sm btn-primary" id="btnRunSchemaDiff">⚡ Compare Current vs Baseline</button>
          </div>
        </div>
      </div>
      <div id="studioSchemaDiffOutput" class="card" style="padding:14px;">
        <div style="color:var(--text-muted,#94a3b8);font-size:12px;">Click "📸 Capture Baseline Snapshot" to snapshot the current schema, then click "⚡ Compare Current vs Baseline" to compute CREATE / ALTER / DROP migration statements.</div>
      </div>
    `;
    tabSchema.appendChild(diffPane);

    const setMode = (mode) => {
      document.getElementById("btnSchemaModeTable")?.classList.toggle("btn-primary", mode === "table");
      document.getElementById("btnSchemaModeEr")?.classList.toggle("btn-primary", mode === "er");
      document.getElementById("btnSchemaModeDiff")?.classList.toggle("btn-primary", mode === "diff");
      schemaContainer.style.display = mode === "table" ? "" : "none";
      erPane.style.display = mode === "er" ? "block" : "none";
      diffPane.style.display = mode === "diff" ? "block" : "none";
      const erCtrls = document.getElementById("studioErControls");
      if (erCtrls) erCtrls.style.display = mode === "er" ? "flex" : "none";
      if (mode === "er") renderFullErDiagram();
    };

    document.getElementById("btnSchemaModeTable")?.addEventListener("click", () => setMode("table"));
    document.getElementById("btnSchemaModeEr")?.addEventListener("click", () => setMode("er"));
    document.getElementById("btnSchemaModeDiff")?.addEventListener("click", () => setMode("diff"));

    document.getElementById("btnErZoomIn")?.addEventListener("click", () => {
      erZoom = Math.min(2, Math.round((erZoom + 0.15) * 100) / 100);
      renderFullErDiagram();
    });
    document.getElementById("btnErZoomOut")?.addEventListener("click", () => {
      erZoom = Math.max(0.4, Math.round((erZoom - 0.15) * 100) / 100);
      renderFullErDiagram();
    });
    document.getElementById("btnErExportSvg")?.addEventListener("click", () => {
      const svg = document.getElementById("studioErDiagramSvg");
      if (!svg) return;
      const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `er_diagram_${getDialect()}_${Date.now()}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("📥 Exported ER Diagram SVG");
    });

    document.getElementById("btnCaptureBaseline")?.addEventListener("click", () => {
      const schema = getSchema();
      baselineSnapshot = JSON.parse(JSON.stringify((schema && schema.tables) || []));
      const info = document.getElementById("studioDiffBaselineInfo");
      if (info) info.textContent = `Baseline captured at ${new Date().toLocaleTimeString()} (${baselineSnapshot.length} tables).`;
      notify(`📸 Captured baseline snapshot (${baselineSnapshot.length} tables)`);
    });

    document.getElementById("btnRunSchemaDiff")?.addEventListener("click", async () => {
      const schema = getSchema();
      const targetTables = (schema && schema.tables) || [];
      const baselineTables = baselineSnapshot || [];
      const res = await callApi("/api/schema/diff", {
        baselineTables,
        targetTables,
        dialect: getDialect(),
      });
      const out = document.getElementById("studioSchemaDiffOutput");
      if (!out) return;
      if (!res || res.success === false) {
        out.innerHTML = `<div style="color:#ef4444;">Schema diff failed: ${esc(res?.error || "Unknown error")}</div>`;
        return;
      }
      const s = res.summary || {};
      const droppedList = s.removedTables || s.droppedTables || [];
      out.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-weight:700;font-size:12px;">Added: <b style="color:#10b981;">${(s.addedTables || []).length}</b> · Dropped: <b style="color:#ef4444;">${droppedList.length}</b> · Modified: <b style="color:#fbbf24;">${(s.modifiedTables || []).length}</b> (${(res.statements || []).length} DDL statements)</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" id="btnCopyDiffDdl">📋 Copy DDL</button>
            <button type="button" class="btn btn-sm btn-primary" id="btnLoadDiffDdl">📝 Load into SQL Editor</button>
          </div>
        </div>
        <textarea id="studioDiffDdlText" readonly spellcheck="false" style="width:100%;height:260px;font-family:var(--font-mono,monospace);font-size:11px;padding:10px;border-radius:6px;background:rgba(0,0,0,0.35);color:var(--cyan,#38bdf8);border:1px solid var(--sc-line,rgba(255,255,255,0.14));">${esc(res.ddl || "-- No differences")}</textarea>
      `;
      document.getElementById("btnCopyDiffDdl")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(res.ddl || "");
        notify("📋 Copied Migration DDL to clipboard");
      });
      document.getElementById("btnLoadDiffDdl")?.addEventListener("click", () => {
        const ed = getPrimaryEditor();
        if (ed && res.ddl) {
          ed.value = res.ddl;
          notify("📝 Loaded Migration DDL into SQL Editor");
        }
      });
    });
  }

  function renderFullErDiagram() {
    const pane = document.getElementById("studioErDiagramPane");
    if (!pane) return;
    const lbl = document.getElementById("studioErZoomLabel");
    if (lbl) lbl.textContent = Math.round(erZoom * 100) + "%";

    const schema = getSchema();
    const tables = (schema && schema.tables) || [];
    if (!tables.length) {
      pane.innerHTML = `<div class="card" style="padding:20px;text-align:center;color:var(--text-muted,#94a3b8);">No tables in current schema to plot.</div>`;
      return;
    }

    const colsPerRow = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
    const boxW = 230;
    const gapX = 76;
    const gapY = 44;
    const positions = {};
    let maxW = 800;
    let maxH = 520;

    const colY = new Array(colsPerRow).fill(28);
    tables.forEach((t, idx) => {
      const cIdx = idx % colsPerRow;
      const colCount = Math.min(14, (t.columns || []).length);
      const boxH = 34 + colCount * 20 + 10;
      const x = 28 + cIdx * (boxW + gapX);
      const y = colY[cIdx];
      positions[t.name] = { x, y, w: boxW, h: boxH, cols: (t.columns || []).slice(0, 14) };
      colY[cIdx] += boxH + gapY;
      if (x + boxW + 40 > maxW) maxW = x + boxW + 40;
      if (colY[cIdx] + 20 > maxH) maxH = colY[cIdx] + 20;
    });

    const edges = [];
    tables.forEach((t) => {
      const src = positions[t.name];
      if (!src) return;
      (t.foreignKeys || []).forEach((fk) => {
        const dst = positions[fk.table];
        if (!dst) return;
        const sIdx = Math.max(0, src.cols.findIndex((c) => c.name === fk.from));
        const dIdx = Math.max(0, dst.cols.findIndex((c) => c.name === fk.to));
        const y1 = src.y + 38 + sIdx * 20;
        const y2 = dst.y + 38 + dIdx * 20;
        const leftToRight = src.x <= dst.x;
        const x1 = leftToRight ? src.x + src.w : src.x;
        const x2 = leftToRight ? dst.x : dst.x + dst.w;
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
        const cx1 = leftToRight ? x1 + dx : x1 - dx;
        const cx2 = leftToRight ? x2 - dx : x2 + dx;
        edges.push(`<path d="M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="4 2" opacity="0.85"><title>${esc(t.name)}.${esc(fk.from)} → ${esc(fk.table)}.${esc(fk.to)}</title></path><circle cx="${x1}" cy="${y1}" r="3.2" fill="#fbbf24"/><circle cx="${x2}" cy="${y2}" r="3.8" fill="#38bdf8"/>`);
      });
    });

    const nodes = tables.map((t) => {
      const p = positions[t.name];
      const fkSet = new Set((t.foreignKeys || []).map((f) => f.from));
      const rowsSvg = p.cols.map((c, i) => {
        const cy = 44 + i * 20;
        const icon = c.pk ? "🔑 " : fkSet.has(c.name) ? "🔗 " : "• ";
        return `<text x="10" y="${cy}" fill="#e2e8f0" font-size="11" font-family="monospace">${icon}${esc(c.name)}</text><text x="${p.w - 8}" y="${cy}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${esc(String(c.type || "").slice(0, 12))}</text>`;
      }).join("");
      return `
        <g class="studio-er-node" data-er-table="${esc(t.name)}" transform="translate(${p.x},${p.y})" style="cursor:pointer;">
          <rect width="${p.w}" height="${p.h}" rx="8" fill="#0f172a" stroke="${t.name === getActiveTable() ? "#38bdf8" : "#334155"}" stroke-width="${t.name === getActiveTable() ? "2.2" : "1.2"}"/>
          <rect width="${p.w}" height="28" rx="8" fill="#1e293b"/>
          <text x="10" y="18" fill="#38bdf8" font-size="12" font-weight="bold" font-family="sans-serif">📋 ${esc(t.name)}</text>
          <text x="${p.w - 8}" y="18" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${esc(t.rowCount ?? 0)}r</text>
          ${rowsSvg}
        </g>
      `;
    }).join("");

    pane.innerHTML = `<svg id="studioErDiagramSvg" width="${Math.round(maxW * erZoom)}" height="${Math.round(maxH * erZoom)}" viewBox="0 0 ${maxW} ${maxH}" xmlns="http://www.w3.org/2000/svg" style="display:block;">${edges.join("")}${nodes}</svg>`;
    pane.querySelectorAll(".studio-er-node").forEach((g) => {
      g.addEventListener("click", () => {
        const tName = g.getAttribute("data-er-table");
        if (!tName) return;
        if (typeof window.selectEntity === "function") window.selectEntity(tName, "table", { switchTab: false });
        else if (typeof window.selectTable === "function") window.selectTable(tName);
        renderFullErDiagram();
      });
    });
  }
  window.renderStudioFullErDiagram = renderFullErDiagram;

  // =========================================================================
  // 9. Observe Grid Body for FK Badges & Multi-Sort Header Badges
  // =========================================================================
  function watchGridChanges() {
    const tbody = document.getElementById("gridBody");
    if (tbody && !tbody.__studioIdeWatched) {
      tbody.__studioIdeWatched = true;
      const obs = new MutationObserver(() => {
        try {
          decorateForeignKeyCells();
          decorateMultiSortHeaders();
        } catch (e) {}
      });
      obs.observe(tbody, { childList: true });
    }
  }

  function init() {
    wrapApiRequest();
    wrapRunEditorQuery();
    wrapColumnFilterInput();
    setupEditorUi();
    setupMultiColumnSort();
    setupRowInspector();
    setupSchemaEnhancements();
    watchGridChanges();
    decorateForeignKeyCells();
    decorateMultiSortHeaders();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("load", init);

  window.StudioIdeEnhancements = {
    init,
    formatStudioSql,
    toggleHistoryDrawer,
    toggleReadOnlyGuard,
    runTxCommand,
    renderFullErDiagram,
    navigateToForeignKeyTarget,
  };
}

export const STUDIO_IDE_ENHANCEMENTS_SCRIPT = `(${studioIdeEnhancementsClient.toString()})();`;
