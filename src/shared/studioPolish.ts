// @ts-nocheck
/**
 * Shared visual polish for the SQLite, MySQL and PostgreSQL studios.
 *
 * The three studio pages use the same class names (header, .kpi-row, .view-tabs, .tab-btn, .grid-toolbar,
 * table.data-grid, .btn, .modal-card, ...), so one theme-aware stylesheet and one small script lift all of them:
 *
 *   STUDIO_POLISH_STYLE  design tokens (4/8px rhythm, type scale, borders / hover / zebra derived from the theme's own
 *                        colors with color-mix, so every studio theme keeps working, light or dark), buttons, tabs,
 *                        toolbars, readable data grids (sticky header, zebra, tabular numbers, NULL badge), menus,
 *                        modals, toasts, focus rings, scrollbars, empty / loading states, narrow-pane layout and
 *                        prefers-reduced-motion.
 *   STUDIO_POLISH_SCRIPT tab keyboard access (roles, Arrow keys), live-region toasts, a loading state while a table
 *                        loads, and a cell enhancer that marks numbers, NULLs, booleans and dates in the grids.
 *
 * It only adds classes and attributes; it never changes the text of a cell and does not rename ids or classes the
 * studios and their tests rely on. Nothing is loaded from the network.
 */

export const STUDIO_POLISH_STYLE = `
    /* ===== Shared polish (src/shared/studioPolish.ts) ===== */
    :root {
      --sc-line: color-mix(in srgb, var(--text-main) 12%, transparent);
      --sc-line-strong: color-mix(in srgb, var(--text-main) 24%, transparent);
      --sc-hover: color-mix(in srgb, var(--text-main) 7%, transparent);
      --sc-zebra: color-mix(in srgb, var(--text-main) 2.5%, transparent);
      --sc-accent-soft: color-mix(in srgb, var(--cyan) 16%, transparent);
      --sc-surface-2: color-mix(in srgb, var(--bg-surface) 94%, var(--text-main));
      --sc-radius: 8px;
      --sc-radius-sm: 6px;
      --sc-fs-xs: 11px;
      --sc-fs-sm: 12px;
      --sc-fs-md: 13px;
      --sc-fs-lg: 15px;
      --border-subtle: var(--sc-line);
      --bg-card: var(--bg-surface);
      --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    html { -webkit-text-size-adjust: 100%; }
    body { font-size: var(--sc-fs-sm); line-height: 1.45; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    ::selection { background: color-mix(in srgb, var(--cyan) 35%, transparent); }

    /* Scrollbars that follow the theme */
    * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--text-main) 30%, transparent) transparent; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-main) 24%, transparent); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
    ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--text-main) 42%, transparent); background-clip: content-box; }
    ::-webkit-scrollbar-corner { background: transparent; }

    /* Focus ring: always visible for keyboard users */
    :focus { outline: none; }
    :focus-visible, .tab-btn:focus-visible, .tree-item:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; border-radius: var(--sc-radius-sm); }
    input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--cyan); outline-offset: 0; box-shadow: 0 0 0 4px var(--cyan-glow); }

    /* Surfaces follow the theme (the original sheets hard-code dark panels, which left light themes half dark) */
    header { background: var(--bg-surface); border-bottom-color: var(--sc-line); backdrop-filter: none; }
    .theme-control { background: color-mix(in srgb, var(--text-main) 5%, var(--bg-surface)); border-color: var(--sc-line-strong); box-shadow: none; }
    .kpi-row { background: var(--bg-base); border-bottom-color: var(--sc-line); }
    aside, #sidebar, #mainSidebar { background: var(--bg-surface); }
    .sidebar-search-box, .sidebar-subbar, .sidebar-db-card, .sidebar-header { background: transparent; border-color: var(--sc-line); }
    .sidebar-mini-btn { background: color-mix(in srgb, var(--text-main) 5%, transparent); color: var(--text-muted); }
    .sidebar-mini-btn:hover { color: var(--text-main); }
    .tree-group { background: color-mix(in srgb, var(--text-main) 3%, transparent); border: 1px solid var(--sc-line); }
    .tree-item-title, .tree-header-left { color: var(--text-main); }
    footer { background: var(--bg-surface); color: var(--text-muted); }
    .editor-banner, .editor-section { background: var(--bg-surface); }
    .editor-top { border-bottom-color: var(--sc-line); }
    main { background: var(--bg-base); }
    .card { background: var(--bg-surface); border-color: var(--sc-line); }

    header { height: auto; min-height: 48px; padding: 6px 16px; gap: 12px; flex-wrap: nowrap; }
    header .brand { flex-shrink: 0; }
    header .brand-title { white-space: nowrap; font-size: var(--sc-fs-lg); }
    header .header-actions { min-width: 0; flex: 1 1 0; justify-content: flex-start; overflow-x: auto; padding: 2px; scrollbar-width: none; }
    header .header-actions > :first-child { margin-left: auto; }
    header .header-actions::-webkit-scrollbar { display: none; }
    header .header-actions > * { flex-shrink: 0; }
    .brand-badge { letter-spacing: 0.02em; color: var(--cyan) !important; background: color-mix(in srgb, var(--cyan) 14%, transparent) !important; border-color: color-mix(in srgb, var(--cyan) 50%, transparent) !important; }
    aside, #sidebar, #mainSidebar { width: 300px; min-width: 220px; }

    /* Buttons: one height scale, clear primary / secondary / danger, short transitions */
    .btn { min-height: 28px; padding: 4px 12px; font-family: inherit; font-size: var(--sc-fs-sm); font-weight: 600; line-height: 1.2; border-radius: var(--sc-radius-sm); border: 1px solid var(--sc-line-strong); background: color-mix(in srgb, var(--text-main) 5%, transparent); color: var(--text-main); transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease; }
    .btn:hover:not([disabled]):not(.disabled) { background: var(--sc-hover); border-color: color-mix(in srgb, var(--text-main) 38%, transparent); }
    .btn:active:not([disabled]):not(.disabled) { transform: translateY(1px); }
    .btn.btn-sm, .btn-sm { min-height: 24px; padding: 2px 9px; font-size: var(--sc-fs-xs); }
    .btn[disabled], .btn.disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { box-shadow: 0 1px 2px rgba(0,0,0,0.25) !important; }
    .btn-danger { color: var(--rose); border-color: color-mix(in srgb, var(--rose) 60%, transparent); }
    .btn-danger:hover:not([disabled]):not(.disabled) { background: color-mix(in srgb, var(--rose) 14%, transparent); }
    .sidebar-mini-btn { border-radius: var(--sc-radius-sm); border-color: var(--sc-line); }
    .sidebar-mini-btn:hover { background: var(--sc-hover); }

    /* Form controls use the theme's text color (inline "#fff" styles break light themes) */
    input[type="text"], input[type="search"], input[type="number"], input:not([type]), select, textarea { color: var(--text-main); font-family: inherit; }
    .grid-toolbar input[type="text"], .grid-toolbar input[type="search"], .activity-toolbar input[type="text"], #formCurrentRecordInput, .sidebar-search-input, .preset-select { color: var(--text-main) !important; background-color: color-mix(in srgb, var(--text-main) 6%, transparent) !important; border: 1px solid var(--sc-line-strong) !important; border-radius: var(--sc-radius-sm) !important; min-height: 28px; padding: 3px 10px !important; font-size: var(--sc-fs-sm) !important; }
    input::placeholder, textarea::placeholder { color: var(--text-dim); opacity: 1; }
    select { color-scheme: normal; border-color: var(--sc-line-strong); background-color: color-mix(in srgb, var(--text-main) 5%, var(--bg-surface)); color: var(--text-main); }
    .brand-title { background: none !important; -webkit-text-fill-color: var(--text-main) !important; color: var(--text-main); }
    option, optgroup { background: var(--bg-surface); color: var(--text-main); }

    /* KPI strip: compact, hides the secondary line when the window is short, disappears in narrow panes */
    .kpi-row { padding: 6px 16px; gap: 8px; }
    .kpi-card { padding: 4px 12px; border-radius: var(--sc-radius); background: var(--bg-surface); border-color: var(--sc-line); }
    .kpi-title { font-size: 10px; letter-spacing: 0.06em; }
    .kpi-value { font-size: 14px; line-height: 1.25; }
    @media (max-height: 880px) { .kpi-sub { display: none; } .kpi-card { padding: 3px 12px; } }
    @media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } .kpi-row .kpi-card:nth-child(n+4) { display: none; } }
    @media (max-width: 700px), (max-height: 700px) { .kpi-row { display: none !important; } }

    /* SQL editor area */
    .editor-banner, .editor-section { border-bottom-color: var(--sc-line); }
    .sql-input-box { padding: 8px 16px; gap: 8px; }
    .sql-textarea, .editor-textarea { font-size: var(--sc-fs-sm); line-height: 1.5; border-color: var(--sc-line-strong); border-radius: var(--sc-radius-sm); background: color-mix(in srgb, var(--bg-base) 70%, var(--text-main) 2%); }
    @media (max-height: 880px) { .sql-textarea { height: 52px; } }
    .editor-controls { gap: 8px; flex-wrap: wrap; }
    .editor-controls-left { flex-wrap: wrap; gap: 6px; row-gap: 4px; min-width: 0; }
    .editor-controls-left .btn { min-height: 26px; padding: 3px 10px; }
    #resultSummary { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .editor-top, .editor-toolbar { gap: 8px; white-space: nowrap; }
    .editor-top > *, .editor-toolbar > * { min-width: 0; }
    .preset-selector-wrap { min-width: 0; }
    .preset-selector-wrap > select, .preset-select, .editor-toolbar select { min-width: 0; max-width: 100%; text-overflow: ellipsis; }
    #openWorkbench { bottom: 3px !important; right: 96px !important; padding: 2px 10px !important; font-size: 11px !important; opacity: 0.9; }

    /* Tabs: one scrolling row, accent underline on the active tab */
    .view-tabs, .tabs-bar { height: auto; min-height: 38px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; padding: 0 12px; gap: 2px; background: var(--bg-surface); border-bottom: 1px solid var(--sc-line); scrollbar-width: thin; }
    .view-tabs::-webkit-scrollbar, .tabs-bar::-webkit-scrollbar { height: 6px; }
    .tab-btn { flex-shrink: 0; white-space: nowrap; min-height: 34px; padding: 0 12px; border-radius: var(--sc-radius-sm) var(--sc-radius-sm) 0 0; font-size: var(--sc-fs-sm); font-weight: 600; color: var(--text-muted); transition: background-color 0.12s ease, color 0.12s ease; }
    .tab-btn:hover { background: var(--sc-hover); color: var(--text-main); }
    .tab-btn.active { background: var(--sc-accent-soft); color: var(--text-main); box-shadow: inset 0 -2px 0 var(--cyan); }

    /* Toolbars: grouped, wrap instead of overflowing, quiet hints */
    .crud-bar { gap: 6px; row-gap: 4px; padding: 6px 12px; background: var(--bg-surface); border-bottom-color: var(--sc-line); }
    .crud-bar .crud-sep { height: 20px; background: var(--sc-line-strong); margin: 0 4px; }
    .crud-bar .crud-hint { font-size: var(--sc-fs-xs); color: var(--text-dim); }
    @media (max-width: 1100px) { .crud-bar .crud-hint { display: none; } }
    .grid-toolbar { height: auto; min-height: 36px; padding: 6px 12px; flex-wrap: wrap; row-gap: 6px; background: var(--bg-surface); border-bottom: 1px solid var(--sc-line); }
    .grid-toolbar > div { flex-wrap: wrap; row-gap: 4px; min-width: 0; }
    .grid-toolbar #gridSearchInput { width: 120px !important; }
    .grid-pagination, #gridPageInfo { white-space: nowrap; font-variant-numeric: tabular-nums; }
    #gridTargetTitle { color: var(--text-main) !important; font-size: var(--sc-fs-sm) !important; max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    main { overflow-y: auto; }
    .tab-content { min-height: 320px; }

    /* Sidebar / tree */
    aside, #sidebar, #mainSidebar { border-right-color: var(--sc-line); }
    .tree-header { border-radius: var(--sc-radius-sm); }
    .tree-header:hover, .tree-item:hover { background: var(--sc-hover); }
    .tree-item { border-radius: var(--sc-radius-sm); transition: background-color 0.1s ease; }
    .tree-item.active { background: var(--sc-accent-soft); box-shadow: inset 2px 0 0 var(--cyan); color: var(--text-main); }
    .tree-badge { font-variant-numeric: tabular-nums; }
    .sidebar-search-input:focus { border-color: var(--cyan) !important; }

    /* Data grid: sticky header, comfortable rows, zebra / hover / selection, numbers right aligned */
    .grid-table-container, .grid-scroll { background: var(--bg-base); }
    table.data-grid { font-size: var(--sc-fs-sm); border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; }
    table.data-grid th { background: var(--bg-surface); color: var(--text-main); font-family: var(--font-sans); font-size: var(--sc-fs-xs); font-weight: 700; letter-spacing: 0.02em; padding: 0 12px; height: 32px; border-bottom: 1px solid var(--sc-line-strong); box-shadow: 0 1px 0 var(--sc-line); }
    table.data-grid thead tr:nth-child(2) th { top: 32px; }
    table.data-grid th:hover { background: var(--sc-surface-2); }
    table.data-grid td { padding: 0 12px; height: 30px; line-height: 1.3; border-bottom: 1px solid var(--sc-line); color: var(--text-main); user-select: text; -webkit-user-select: text; }
    table.data-grid tbody tr:nth-child(even) td { background: var(--sc-zebra); }
    table.data-grid tbody tr:hover td { background: var(--sc-accent-soft); }
    table.data-grid tr.crud-selected td { background: color-mix(in srgb, var(--cyan) 22%, transparent) !important; }
    table.data-grid th.sc-num, table.data-grid td.sc-num { text-align: right; }
    table.data-grid td.sc-date { color: var(--text-muted); }
    table.data-grid td.sc-bool { text-align: center; }
    table.data-grid td.sc-bool[data-bool="true"] { color: var(--emerald); font-weight: 700; }
    table.data-grid td.sc-bool[data-bool="false"] { color: var(--text-dim); }
    table.data-grid td.crud-rownum, table.data-grid th.crud-rownum { color: var(--text-dim); font-size: var(--sc-fs-xs); text-align: right; width: 44px; }
    table.data-grid th.crud-check, table.data-grid td.crud-check { width: 32px; text-align: center; }
    table.data-grid input[type="checkbox"] { accent-color: var(--cyan); }
    .sc-null-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-family: var(--font-sans); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; line-height: 1.4; font-style: normal; color: var(--text-muted); background: color-mix(in srgb, var(--text-main) 9%, transparent); border: 1px solid var(--sc-line); }
    td.cell-null { color: var(--text-muted) !important; font-style: normal !important; }
    table.data-grid td.sc-empty-cell { display: block; width: 100%; padding: 40px 16px; height: auto; text-align: center; white-space: normal; color: var(--text-muted); border-bottom: 0; background: transparent !important; }
    table.data-grid td.sc-empty-cell::before { content: ""; display: block; width: 36px; height: 36px; margin: 0 auto 10px; border-radius: 10px; background: var(--sc-accent-soft); box-shadow: inset 0 0 0 1px var(--sc-line); }
    table.data-grid td.crud-empty { padding: 36px 16px; height: auto; color: var(--text-muted); }

    /* Loading state while a table loads */
    .sc-loading { opacity: 0.6; transition: opacity 0.15s ease; }
    #gridTableContainer.sc-loading::before { content: ""; position: sticky; top: 0; left: 0; display: block; height: 2px; z-index: 20; background: linear-gradient(90deg, transparent, var(--cyan), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: sc-slide 1s linear infinite; }
    @keyframes sc-slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }

    /* Menus, modals, toasts */
    .crud-menu, .context-menu { background: var(--bg-surface) !important; color: var(--text-main); border: 1px solid var(--sc-line-strong) !important; border-radius: 10px !important; box-shadow: 0 16px 40px rgba(0,0,0,0.4) !important; }
    .modal-overlay { backdrop-filter: blur(6px); }
    .modal-card { background: var(--bg-surface); border: 1px solid var(--sc-line-strong); border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.5); color: var(--text-main); }
    .modal-header { border-bottom-color: var(--sc-line); }
    .modal-title { font-size: var(--sc-fs-lg); letter-spacing: -0.01em; }
    .modal-close { border-radius: var(--sc-radius-sm); }
    .crud-scroll th, table.crud-table th { background: var(--bg-surface) !important; color: var(--text-main) !important; }
    .toast, #toast { position: fixed; left: 50%; right: auto; bottom: 40px; transform: translate(-50%, 8px); max-width: min(560px, calc(100vw - 32px)); padding: 10px 16px; border-radius: 10px; font-size: var(--sc-fs-sm); background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--sc-line-strong); box-shadow: 0 12px 32px rgba(0,0,0,0.4); pointer-events: none; z-index: 10500; }
    .toast.show, #toast.show { transform: translate(-50%, 0); }
    footer { font-size: var(--sc-fs-xs); border-top-color: var(--sc-line); }

    /* Narrow panes (File Manager side panes, small windows) */
    @media (max-width: 820px) {
      aside, #sidebar, #mainSidebar { width: 220px !important; min-width: 180px; }
      header { padding: 6px 10px; }
      .grid-toolbar, .crud-bar { padding: 6px 8px; }
    }
    @media (max-width: 620px) {
      .workspace { flex-direction: column; }
      aside, #sidebar, #mainSidebar { width: 100% !important; max-width: none; min-width: 0; max-height: 30vh; border-right: 0; border-bottom: 1px solid var(--sc-line); }
      .sidebar-resizer { display: none; }
      footer { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
    }
`;

function studioPolishClient() {
  if (window.StudioPolish || typeof document === "undefined" || typeof document.querySelector !== "function") return;

  const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  const NUM_TYPE = /(int|serial|real|float|double|numeric|decimal|number|money|fixed)/i;
  const BOOL_TYPE = /^(bool|boolean)$|^tinyint\(1\)$|^bit\(1\)$/i;
  const DATE_TYPE = /(date|time|year)/i;

  function metaFor(id) {
    const inst = window.StudioCols && window.StudioCols.instances && window.StudioCols.instances[id];
    return inst && inst.meta ? inst.meta : {};
  }

  function enhanceBody(body, id) {
    const meta = metaFor(id);
    const numericCols = new Set();
    const rows = body.rows;
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].cells;
      if (cells.length === 1 && !cells[0].dataset.col && !cells[0].dataset.sc) {
        const t = cells[0];
        t.dataset.sc = "1";
        if (!t.classList.contains("crud-empty") && !/^\(0 columns\)$/.test(t.textContent.trim())) t.classList.add("sc-empty-cell");
        continue;
      }
      for (let c = 0; c < cells.length; c++) {
        const td = cells[c];
        const col = td.dataset.col;
        if (td.dataset.sc) continue;
        td.dataset.sc = "1";
        if (!col) continue;
        const text = td.textContent;
        const type = meta[col] && meta[col].type ? String(meta[col].type) : "";
        const isNull = text === "NULL" && (td.classList.contains("cell-null") || /text-dim/.test(td.getAttribute("style") || ""));
        if (isNull) {
          td.classList.add("sc-null");
          if (!td.children.length) { td.textContent = ""; const b = document.createElement("span"); b.className = "sc-null-badge"; b.textContent = "NULL"; td.appendChild(b); }
          continue;
        }
        if (type && BOOL_TYPE.test(type.trim())) {
          td.classList.add("sc-bool");
          const v = text.trim().toLowerCase();
          td.dataset.bool = v === "true" || v === "1" || v === "t" ? "true" : v === "false" || v === "0" || v === "f" ? "false" : "";
        } else if (type ? NUM_TYPE.test(type) && NUM.test(text.trim()) : NUM.test(text.trim()) && !/^[-+]?0\d/.test(text.trim())) {
          td.classList.add("sc-num");
        } else if (type && DATE_TYPE.test(type)) {
          td.classList.add("sc-date");
        }
        if (!td.title && text.length > 24) td.title = text;
      }
    }
    if (rows.length) for (let c = 0; c < rows[0].cells.length; c++) { const td = rows[0].cells[c]; if (td.classList.contains("sc-num") && td.dataset.col) numericCols.add(td.dataset.col); }
    const table = body.closest("table");
    if (table) table.querySelectorAll("thead th[data-col]").forEach((th) => th.classList.toggle("sc-num", numericCols.has(th.dataset.col)));
  }

  function watchBody(bodyId, instId) {
    const body = document.getElementById(bodyId);
    if (!body || body.__scWatched) return;
    body.__scWatched = true;
    let queued = false;
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        try { enhanceBody(body, instId); } catch (e) {}
        obs.takeRecords();
      });
    });
    obs.observe(body, { childList: true, subtree: true });
    try { enhanceBody(body, instId); } catch (e) {}
  }

  // The tab strip is made of divs: give it tab semantics and keyboard access.
  function setupTabs() {
    const strip = document.querySelector(".view-tabs, .tabs-bar");
    if (!strip || strip.__scTabs) return;
    strip.__scTabs = true;
    strip.setAttribute("role", "tablist");
    const sync = () => {
      strip.querySelectorAll(".tab-btn").forEach((t) => {
        if (!t.hasAttribute("role")) t.setAttribute("role", "tab");
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
        t.setAttribute("aria-selected", t.classList.contains("active") ? "true" : "false");
      });
    };
    sync();
    new MutationObserver(sync).observe(strip, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    strip.addEventListener("keydown", (e) => {
      const tab = e.target.closest && e.target.closest(".tab-btn");
      if (!tab) return;
      const tabs = Array.from(strip.querySelectorAll(".tab-btn"));
      const i = tabs.indexOf(tab);
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tab.click(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); const n = tabs[(i + 1) % tabs.length]; n.focus(); n.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); const n = tabs[(i - 1 + tabs.length) % tabs.length]; n.focus(); n.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      else if (e.key === "Home") { e.preventDefault(); tabs[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); tabs[tabs.length - 1].focus(); }
    });
  }

  function wrapLoader(name) {
    const f = window[name];
    if (typeof f !== "function" || f.__scWrapped) return;
    const w = async function () {
      const c = document.getElementById("gridTableContainer");
      if (c) { c.classList.add("sc-loading"); c.setAttribute("aria-busy", "true"); }
      try { return await f.apply(this, arguments); }
      finally { if (c) { c.classList.remove("sc-loading"); c.removeAttribute("aria-busy"); } }
    };
    w.__scWrapped = true;
    window[name] = w;
  }

  // SQL editor: remember Minimize / Expand; in short windows start minimized so the grid gets the room
  function setupEditorCollapse() {
    const btn = document.getElementById("btnToggleEditor");
    const banner = document.querySelector(".editor-banner");
    if (!btn || !banner || btn.__scEditor || typeof window.toggleEditorCollapse !== "function") return;
    btn.__scEditor = true;
    const KEY = "bunrad.editor.collapsed";
    let pref = null;
    try { pref = window.localStorage.getItem(KEY); } catch (e) {}
    const want = pref === null ? window.innerHeight < 700 : pref === "1";
    if (want !== banner.classList.contains("collapsed")) window.toggleEditorCollapse();
    btn.addEventListener("click", () => { try { window.localStorage.setItem(KEY, banner.classList.contains("collapsed") ? "1" : "0"); } catch (e) {} });
  }

  function init() {
    // The window shortcut script blocks right-click everywhere unless a region opts in: grid and sidebar keep their menus
    document.querySelectorAll("#gridTableContainer, .grid-scroll, aside, #sidebar, #mainSidebar").forEach((el) => el.setAttribute("data-allow-contextmenu", ""));
    watchBody("gridBody", "grid");
    watchBody("sqlResultsBody", "sql");
    setupTabs();
    setupEditorCollapse();
    ["toastBox", "toast"].forEach((id) => { const t = document.getElementById(id); if (t) { t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.addEventListener("load", () => { wrapLoader("fetchTableData"); wrapLoader("loadTableData"); init(); });
  window.StudioPolish = { enhanceBody, init };
}

export const STUDIO_POLISH_SCRIPT = `(${studioPolishClient.toString()})();`;
