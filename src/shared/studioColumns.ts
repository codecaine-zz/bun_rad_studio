// @ts-nocheck
/**
 * Shared "Columns" control for the SQLite, MySQL and PostgreSQL studios.
 *
 * Every studio page embeds the same CSS (STUDIO_COLUMNS_STYLE) and the same browser script
 * (STUDIO_COLUMNS_SCRIPT). The script exposes `window.StudioCols.create(options)`, which returns a controller that
 * owns one data grid:
 *
 *   - a labelled "Columns" button (icon + text + "5 of 8" badge) mounted in the grid toolbar,
 *   - a popover with a checkbox per column (type + PK / FK / IDX marks), a filter box for wide tables,
 *     Show all / Hide all / Only keys / Reset to default and the "include hidden columns in exports" option,
 *   - a strip above the grid ("3 hidden columns - Show all") so nothing is silently lost,
 *   - a per-header menu (button + right-click + Shift+F10 / ContextMenu key) with "Hide column",
 *   - persistence per studio + database + table (localStorage, same store the studios use for theme / saved queries).
 *
 * The studios keep their own rendering code. They call `controller.visible(allColumns, { kind, meta })` at the start of
 * a render and draw only the returned columns, call `controller.decorate(th, name)` for each header cell and use
 * `controller.exportColumns()` / `controller.exportRows()` when they copy or export the grid.
 *
 * `studioColumnsClient` is serialized with Function.toString() and executed in the page.
 */

export const STUDIO_COLUMNS_STYLE = `
    /* ===== Columns control (shared by the SQLite / MySQL / PostgreSQL studios) ===== */
    [hidden] { display: none !important; }
    .sc-btn { gap: 6px; }
    .sc-btn svg { flex-shrink: 0; opacity: 0.9; }
    .sc-btn .sc-count { font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 700; line-height: 1; padding: 3px 7px; border-radius: 999px; background: color-mix(in srgb, var(--text-main) 12%, transparent); color: var(--text-muted); }
    .sc-btn.has-hidden { border-color: var(--cyan); background: color-mix(in srgb, var(--cyan) 14%, transparent); }
    .sc-btn.has-hidden .sc-count { background: var(--cyan); color: var(--bg-base); }
    .sc-btn[aria-expanded="true"] { border-color: var(--cyan); box-shadow: 0 0 0 2px var(--cyan-glow); }

    .sc-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 5px 12px; font-size: 12px; color: var(--text-main); background: color-mix(in srgb, var(--cyan) 9%, var(--bg-surface)); border-bottom: 1px solid color-mix(in srgb, var(--cyan) 35%, transparent); flex-shrink: 0; }
    .sc-strip svg { flex-shrink: 0; color: var(--cyan); }
    .sc-strip .sc-strip-title { font-weight: 700; white-space: nowrap; }
    .sc-strip .sc-strip-names { display: inline-flex; flex-wrap: nowrap; gap: 4px; min-width: 60px; flex: 1 1 0; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); }
    .sc-chip { flex-shrink: 0; }
    .sc-strip .sc-warn { flex-basis: 100%; font-size: 11px; color: var(--amber); }
    .sc-strip .sc-spacer { flex: 1; }
    .sc-strip .sc-link { white-space: nowrap; }
    .sc-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 180px; padding: 2px 8px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); background: color-mix(in srgb, var(--text-main) 6%, transparent); color: var(--text-main); font: inherit; font-size: 11px; cursor: pointer; }
    .sc-chip .sc-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
    .sc-chip:hover { border-color: var(--cyan); }
    .sc-link { border: 0; background: none; padding: 2px 4px; color: var(--cyan); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; border-radius: 4px; text-decoration: underline; text-underline-offset: 2px; }
    .sc-link:hover { background: var(--cyan-glow); }

    .sc-pop, .sc-menu { position: fixed; z-index: 10200; background: var(--bg-surface); color: var(--text-main); border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); border-radius: 10px; box-shadow: 0 18px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25); font-family: var(--font-sans); font-size: 12px; user-select: none; -webkit-user-select: none; }
    .sc-pop { width: min(340px, calc(100vw - 16px)); max-height: calc(100vh - 16px); display: flex; flex-direction: column; }
    .sc-pop-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; }
    .sc-pop-title { font-weight: 700; font-size: 13px; }
    .sc-pop-count { margin-left: auto; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .sc-x { border: 0; background: none; color: var(--text-muted); width: 24px; height: 24px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .sc-x:hover { background: color-mix(in srgb, var(--text-main) 10%, transparent); color: var(--text-main); }
    .sc-search-wrap { padding: 0 12px 8px; }
    .sc-search { width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); background: color-mix(in srgb, var(--text-main) 6%, transparent); color: var(--text-main); font: inherit; outline: none; user-select: text; -webkit-user-select: text; }
    .sc-actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px; }
    .sc-act { padding: 3px 9px; font: inherit; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 20%, transparent); background: color-mix(in srgb, var(--text-main) 5%, transparent); color: var(--text-main); cursor: pointer; }
    .sc-act:hover:not([disabled]) { border-color: var(--cyan); background: color-mix(in srgb, var(--cyan) 14%, transparent); }
    .sc-act[disabled] { opacity: 0.45; cursor: not-allowed; }
    .sc-list { flex: 1; min-height: 60px; overflow: auto; padding: 2px 6px 6px; border-top: 1px solid color-mix(in srgb, var(--text-main) 12%, transparent); }
    .sc-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
    .sc-item:hover { background: color-mix(in srgb, var(--text-main) 7%, transparent); }
    .sc-item input { accent-color: var(--cyan); width: 15px; height: 15px; margin: 0; flex-shrink: 0; cursor: pointer; }
    .sc-item.is-off .sc-name { color: var(--text-muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--text-main) 35%, transparent); }
    .sc-item.is-locked { cursor: not-allowed; }
    .sc-name { font-family: var(--font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .sc-type { margin-left: auto; padding-left: 6px; color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); white-space: nowrap; flex-shrink: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
    .sc-mark { font-size: 9px; font-weight: 800; letter-spacing: 0.3px; line-height: 1; padding: 2px 4px; border-radius: 4px; border: 1px solid currentColor; flex-shrink: 0; }
    .sc-mark.pk { color: var(--amber); }
    .sc-mark.fk { color: var(--purple); }
    .sc-mark.idx { color: var(--cyan); }
    .sc-mark.nn { color: var(--text-muted); }
    .sc-empty { padding: 14px 12px; color: var(--text-muted); text-align: center; }
    .sc-foot { padding: 8px 12px 10px; border-top: 1px solid color-mix(in srgb, var(--text-main) 12%, transparent); display: flex; flex-direction: column; gap: 6px; }
    .sc-opt { display: flex; align-items: flex-start; gap: 8px; color: var(--text-main); font-size: 11px; cursor: pointer; }
    .sc-opt input { accent-color: var(--cyan); margin-top: 1px; }
    .sc-hint { color: var(--text-muted); font-size: 11px; line-height: 1.4; }
    .sc-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    .sc-menu { min-width: 220px; padding: 4px; }
    .sc-menu button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 7px 10px; border: 0; border-radius: 6px; background: none; color: var(--text-main); font: inherit; cursor: pointer; }
    .sc-menu button:hover:not([disabled]), .sc-menu button:focus-visible { background: color-mix(in srgb, var(--cyan) 18%, transparent); outline: none; }
    .sc-menu button[disabled] { opacity: 0.45; cursor: not-allowed; }
    .sc-menu button .sc-kbd { margin-left: auto; color: var(--text-muted); font-size: 10px; }
    .sc-menu hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--text-main) 14%, transparent); margin: 4px 2px; }
    .sc-menu .sc-menu-title { padding: 4px 10px 2px; color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }

    th.sc-th { position: relative; padding-right: 26px !important; }
    th.sc-th .sc-th-btn { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; opacity: 0.45; transition: opacity 0.12s ease, background 0.12s ease; }
    th.sc-th:hover .sc-th-btn, th.sc-th:focus-within .sc-th-btn, th.sc-th .sc-th-btn[aria-expanded="true"] { opacity: 1; }
    th.sc-th .sc-th-btn:hover { background: color-mix(in srgb, var(--text-main) 14%, transparent); color: var(--text-main); }
    th.sc-th:focus-visible, th.sc-th .sc-th-btn:focus-visible, .sc-btn:focus-visible, .sc-act:focus-visible, .sc-x:focus-visible, .sc-chip:focus-visible, .sc-link:focus-visible, .sc-search:focus-visible, .sc-item input:focus-visible, .sc-opt input:focus-visible { outline: 2px solid var(--cyan); outline-offset: 1px; }
    /* ===== Datasheet (Access style): widths, display names, order, frozen columns, filters, formatting ===== */
    table.sc-fixed { table-layout: fixed; }
    table.sc-fixed th, table.sc-fixed td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sc-rz { position: absolute; top: 0; right: -4px; width: 9px; height: 100%; cursor: col-resize; z-index: 9; touch-action: none; }
    .sc-rz::after { content: ""; position: absolute; top: 24%; bottom: 24%; left: 4px; width: 1px; background: color-mix(in srgb, var(--text-main) 30%, transparent); transition: background 0.1s ease; }
    .sc-rz:hover::after, th.sc-resizing .sc-rz::after { background: var(--cyan); width: 2px; left: 3px; top: 0; bottom: 0; }
    .sc-guide { position: fixed; top: 0; bottom: 0; width: 0; border-left: 2px solid var(--cyan); z-index: 10250; pointer-events: none; box-shadow: 0 0 8px var(--cyan-glow); }
    body.sc-col-resizing, body.sc-col-resizing * { cursor: col-resize !important; user-select: none !important; -webkit-user-select: none !important; }
    th.sc-th[draggable="true"] { cursor: grab; }
    th.sc-dragging { opacity: 0.45; }
    th.sc-drop-before { box-shadow: inset 3px 0 0 var(--cyan); }
    th.sc-drop-after { box-shadow: inset -3px 0 0 var(--cyan); }
    th.sc-aliased { text-decoration: underline dotted color-mix(in srgb, var(--cyan) 70%, transparent); text-underline-offset: 4px; }
    th.sc-filtered { box-shadow: inset 0 -3px 0 var(--amber); }
    tr.sc-row-hidden { display: none; }
    th.sc-colsel, td.sc-colsel { background-color: color-mix(in srgb, var(--cyan) 15%, var(--bg-base)) !important; }
    th.sc-colsel { box-shadow: inset 0 3px 0 var(--cyan); }
    .sc-frozen { position: sticky !important; }
    table td.sc-frozen { z-index: 3; background-color: var(--bg-base) !important; }
    table tbody tr:nth-child(even) td.sc-frozen { background-image: linear-gradient(var(--sc-zebra, rgba(128,128,128,0.07)), var(--sc-zebra, rgba(128,128,128,0.07))); }
    table tbody tr:hover td.sc-frozen { background-image: linear-gradient(var(--sc-accent-soft, rgba(56,189,248,0.12)), var(--sc-accent-soft, rgba(56,189,248,0.12))); }
    table tr.crud-selected td.sc-frozen, table tr.selected td.sc-frozen { background-image: linear-gradient(color-mix(in srgb, var(--cyan) 22%, transparent), color-mix(in srgb, var(--cyan) 22%, transparent)); }
    table th.sc-frozen { z-index: 30 !important; }
    .sc-frozen-last { box-shadow: 7px 0 7px -6px rgba(0,0,0,0.5); border-right: 1px solid color-mix(in srgb, var(--cyan) 55%, transparent) !important; }
    table[data-sc-row="compact"] tbody td { height: 22px !important; }
    table[data-sc-row="normal"] tbody td { height: 32px !important; }
    table[data-sc-row="spacious"] tbody td { height: 46px !important; }
    table.sc-nozebra tbody tr:nth-child(even) td:not(.sc-colsel) { background-color: transparent; }
    table.sc-nozebra tbody tr:nth-child(even) td.sc-frozen { background-image: none; }
    .sc-real { color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); white-space: nowrap; margin-left: 4px; }
    .sc-ren { margin-left: auto; border: 0; background: none; color: var(--text-muted); cursor: pointer; border-radius: 5px; width: 22px; height: 22px; flex-shrink: 0; opacity: 0.55; }
    .sc-item:hover .sc-ren, .sc-ren:focus-visible { opacity: 1; background: color-mix(in srgb, var(--text-main) 12%, transparent); }
    .sc-item .sc-type { margin-left: 4px; }
    .sc-layout { border-top: 1px solid color-mix(in srgb, var(--text-main) 12%, transparent); padding: 6px 12px 2px; }
    .sc-layout summary { cursor: pointer; font-weight: 700; font-size: 11px; color: var(--text-muted); padding: 2px 0 6px; }
    .sc-layout .sc-actions { padding: 0 0 6px; }
    .sc-fmt { display: grid; gap: 6px; padding-bottom: 6px; }
    .sc-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; }
    .sc-sel { padding: 3px 6px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); background: color-mix(in srgb, var(--text-main) 6%, transparent); color: var(--text-main); font: inherit; font-size: 11px; }
    .sc-fl { max-height: 200px; overflow: auto; border: 1px solid color-mix(in srgb, var(--text-main) 16%, transparent); border-radius: 6px; padding: 2px 4px; margin-top: 4px; }
    .sc-fl-row { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 5px; font-weight: 400; cursor: pointer; }
    .sc-fl-row:hover { background: color-mix(in srgb, var(--text-main) 8%, transparent); }
    .sc-fl-v { font-family: var(--font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .sc-fl-n { color: var(--text-muted); font-size: 10px; }
    .sc-fl-row input { accent-color: var(--cyan); }
    .sc-fd .sd-label { margin-top: 4px; }
    .sc-filter-note { color: var(--amber); }
    .sc-th:focus-visible { outline-offset: -2px; }
    @media (prefers-reduced-motion: reduce) { th.sc-th .sc-th-btn { transition: none; } }
    @media (max-width: 640px) { .sc-btn .sc-label { display: none; } }
`;

function studioColumnsClient() {
  if (window.StudioCols) return;

  const LS_PREFIX = "bunrad.cols.v1:";
  const EXPORT_KEY = "bunrad.cols.exportHidden";
  const DENSE = 8;
  const MIN_W = 48, MAX_W = 900, STD_W = 140, FIT_MAX = 480;
  const emptyLayout = () => ({ widths: {}, alias: {}, order: [], freeze: 0, fmt: { rowH: "", zebra: null, font: 0 } });
  const ALIAS_KEY = "bunrad.cols.exportAlias";
  const SVG = (inner) => '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + "</svg>";
  const ICON_COLUMNS = SVG('<rect x="2" y="2.5" width="12" height="11" rx="1.6"/><path d="M6.3 2.5v11M9.7 2.5v11"/>');
  const ICON_EYE_OFF = SVG('<path d="M2 2l12 12"/><path d="M6.6 6.7a2 2 0 0 0 2.7 2.7"/><path d="M4.3 4.5C3 5.3 2.1 6.5 1.5 8c1 2.6 3.5 4.5 6.5 4.5 1 0 1.9-.2 2.7-.6"/><path d="M7 3.6c.3 0 .7-.1 1-.1 3 0 5.5 1.9 6.5 4.5-.3.8-.8 1.5-1.4 2.1"/>');
  const ICON_CHEVRON = SVG('<path d="M4 6l4 4 4-4"/>');
  const ICON_CLOSE = SVG('<path d="M4 4l8 8M12 4l-8 8"/>');

  const mem = {};
  const store = {
    get(k) {
      try { const v = window.localStorage.getItem(k); return v === null ? null : v; } catch (e) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
    },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else n.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return n;
  }
  const resolve = (x) => (typeof x === "function" ? x() : typeof x === "string" ? document.getElementById(x) : x) || null;
  const hashOf = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  // Maps a schema table ({ columns:[{name,type,pk,notnull}], indices:[{columns,unique}], foreignKeys:[{from}] }) to column metadata.
  function metaFromTable(t) {
    const meta = {};
    if (!t) return meta;
    (t.columns || []).forEach((c) => { meta[c.name] = { type: c.type || "", pk: !!c.pk, notnull: !!c.notnull, fk: false, idx: false }; });
    (t.foreignKeys || []).forEach((f) => { if (meta[f.from]) meta[f.from].fk = true; });
    (t.indices || []).forEach((ix) => (ix.columns || []).forEach((n) => { if (meta[n]) meta[n].idx = true; }));
    return meta;
  }

  const open = { pop: null, menu: null };
  let globalsBound = false;

  function closeMenu(restoreFocus) {
    const m = open.menu;
    if (!m) return;
    open.menu = null;
    m.node.remove();
    if (m.opener) { m.opener.setAttribute("aria-expanded", "false"); if (restoreFocus) try { m.opener.focus(); } catch (e) {} }
  }
  function closePop(restoreFocus) {
    const p = open.pop;
    if (!p) return;
    open.pop = null;
    p.node.remove();
    p.inst.btn && p.inst.btn.setAttribute("aria-expanded", "false");
    if (restoreFocus && p.inst.btn) try { p.inst.btn.focus(); } catch (e) {}
  }
  function place(node, rect) {
    node.style.visibility = "hidden";
    node.style.left = "0px";
    node.style.top = "0px";
    const w = node.offsetWidth, h = node.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = rect.left;
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    let top = rect.bottom + 6;
    if (top + h > vh - 8) top = rect.top - h - 6 >= 8 ? rect.top - h - 6 : Math.max(8, vh - h - 8);
    node.style.left = Math.round(left) + "px";
    node.style.top = Math.round(top) + "px";
    node.style.visibility = "";
  }
  function focusables(root) {
    return Array.from(root.querySelectorAll("button, input, [tabindex='0']")).filter((n) => !n.disabled && n.offsetParent !== null && !n.hidden);
  }

  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    // Capture phase on window: Esc / Tab / arrows are handled here first, so Esc only closes the popover or menu.
    window.addEventListener("keydown", (e) => {
      if (open.menu) {
        const items = Array.from(open.menu.node.querySelectorAll("button:not([disabled])"));
        const idx = items.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeMenu(true); }
        else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); (items[(idx + 1) % items.length] || items[0]).focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); (items[(idx - 1 + items.length) % items.length] || items[items.length - 1]).focus(); }
        else if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); items[0] && items[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); e.stopPropagation(); items[items.length - 1] && items[items.length - 1].focus(); }
        else if (e.key === "Tab") { closeMenu(false); }
        return;
      }
      const p = open.pop;
      if (!p) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        closePop(true);
        return;
      }
      if (!p.node.contains(document.activeElement)) return;
      if (e.key === "Tab") {
        const f = focusables(p.node);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      const items = Array.from(p.node.querySelectorAll(".sc-item input"));
      const search = p.node.querySelector(".sc-search");
      const at = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (at === -1 && document.activeElement !== search) return;
        e.preventDefault();
        if (e.key === "ArrowDown") { const target = at === -1 ? items[0] : items[Math.min(items.length - 1, at + 1)]; if (target) target.focus(); }
        else if (at <= 0) { search ? search.focus() : items[0] && items[0].focus(); }
        else items[at - 1].focus();
      } else if ((e.key === "Home" || e.key === "End") && at !== -1) {
        e.preventDefault();
        (e.key === "Home" ? items[0] : items[items.length - 1]).focus();
      }
    }, true);
    document.addEventListener("mousedown", (e) => {
      if (open.menu && !open.menu.node.contains(e.target)) closeMenu(false);
      const p = open.pop;
      if (p && !p.node.contains(e.target) && !(p.inst.btn && p.inst.btn.contains(e.target))) closePop(false);
    }, true);
    window.addEventListener("resize", () => { closeMenu(false); if (open.pop) place(open.pop.node, open.pop.inst.btn.getBoundingClientRect()); });
    document.addEventListener("scroll", (e) => { if (open.menu && !open.menu.node.contains(e.target)) closeMenu(false); }, true);
  }

  // ======================================================================================================
  // Datasheet behaviour (Microsoft Access style): widths, display names, order, frozen columns, filters,
  // formatting. Works on the table the studio renders: it never changes how the studio draws or queries.
  // ======================================================================================================
  function installDatasheet(inst, api) {
    const opts = inst.opts;
    const D = () => window.StudioDialogs;
    const css = (s) => String(s).replace(/["\\]/g, "\\$&");
    const clampW = (n) => Math.min(MAX_W, Math.max(MIN_W, Math.round(Number(n) || STD_W)));
    const L = () => inst.layout;
    const filters = {};
    let sel = [];
    let anchor = null;
    let enhancing = false;
    let obs = null;
    let leadW = [];
    const ds = {};
    inst.ds = ds;

    const tableEl = () => {
      const c = resolve(opts.stripBefore);
      if (!c) return null;
      return c.tagName === "TABLE" ? c : c.querySelector("table");
    };
    const dataThs = (t) => Array.from(t.querySelectorAll("th[data-col]")).filter((th) => th.closest("thead"));
    const label = (c) => L().alias[c] || c;
    inst.label = label;
    const say = (m) => { const live = open.pop && open.pop.inst === inst ? open.pop.live : null; if (live) live.textContent = m; if (inst.strip) inst.strip.setAttribute("aria-label", m); };
    const changed = (msg) => { api.persist(); api.refreshUi(); enhance(); if (msg) say(msg); window.dispatchEvent(new CustomEvent("studiocols:change", { detail: inst.state() })); };

    // ---- measuring -----------------------------------------------------------------------------------
    let ctx2d = null;
    function measure(text, font) {
      text = String(text);
      if (!window.CanvasRenderingContext2D) return text.length * 7.5;
      try {
        if (!ctx2d) ctx2d = document.createElement("canvas").getContext("2d");
        if (!ctx2d) return text.length * 7.5;
        ctx2d.font = font || "12px monospace";
        return ctx2d.measureText(text).width;
      } catch (e) { return text.length * 7.5; }
    }
    function bestFit(col) {
      const t = tableEl();
      if (!t) return STD_W;
      const th = t.querySelector('th[data-col="' + css(col) + '"]');
      const td = t.querySelector('td[data-col="' + css(col) + '"]');
      const hf = th ? (window.getComputedStyle(th).font || "") : "";
      const bf = td ? (window.getComputedStyle(td).font || "") : "";
      let w = measure(label(col), hf) + 54;
      const cells = Array.from(t.querySelectorAll('tbody td[data-col="' + css(col) + '"]')).slice(0, 150);
      cells.forEach((c) => { w = Math.max(w, measure((c.textContent || "").trim(), bf) + 28); });
      return Math.min(FIT_MAX, Math.max(MIN_W, Math.ceil(w)));
    }
    const leadWidth = (c, i) => Math.max(c.offsetWidth || 0, c.classList.contains("crud-check") ? 40 : 56);
    const widthOf = (col) => {
      if (L().widths[col]) return L().widths[col];
      const t = tableEl();
      const th = t && t.querySelector('th[data-col="' + css(col) + '"]');
      return (th && th.offsetWidth) || bestFit(col);
    };
    // First manual width: freeze today's widths so the other columns do not jump
    function materialize() {
      if (Object.keys(L().widths).length) return;
      const t = tableEl();
      leadW = [];
      if (t) {
        const ths = dataThs(t);
        if (ths[0]) Array.from(ths[0].parentElement.children).forEach((c, i) => { if (!c.dataset.col) leadW[i] = leadWidth(c, i); });
      }
      // a column keeps the width it has now, but never less than its content needs (up to 320 px), so nothing starts out cut off
      inst.shown.forEach((c) => { L().widths[c] = clampW(Math.max(widthOf(c), Math.min(bestFit(c), 320))); });
    }
    ds.setWidth = (col, w, msg) => { materialize(); L().widths[col] = clampW(w); changed(msg || label(col) + " is " + L().widths[col] + " pixels wide."); };
    ds.fit = (col) => ds.setWidth(col, bestFit(col), label(col) + " fitted to its content.");
    ds.fitAll = () => { materialize(); inst.shown.forEach((c) => { L().widths[c] = bestFit(c); }); changed("All columns fitted to their content."); };
    ds.resetWidths = () => { L().widths = {}; changed("Automatic widths restored."); };
    ds.standardWidth = (col) => ds.setWidth(col, STD_W, label(col) + " set to the standard width.");
    ds.widthDialog = async (col) => {
      const d = D();
      if (!d) return;
      const input = d.el("input", { type: "number", class: "sd-input", min: MIN_W, max: MAX_W, step: 1, value: widthOf(col), "aria-label": "Width in pixels", id: "scWidthInput" });
      const ctl = d.open({
        title: "Field Width: " + label(col),
        body: d.el("div", null, d.el("label", { class: "sd-label" }, "Column width (pixels, " + MIN_W + "\u2013" + MAX_W + ")", input), d.el("p", { class: "sd-note" }, "Standard width is " + STD_W + " px. Best fit measures the widest value on this page. You can also drag the right edge of the header, double-click it to fit, or press Alt+Left / Alt+Right on a focused header.")),
        initialFocus: input,
        buttons: [
          { label: "Standard Width", side: "left", id: "scStd", onClick: (c) => { c.close(null); ds.standardWidth(col); } },
          { label: "Best Fit", side: "left", id: "scBest", onClick: (c) => { c.close(null); ds.fit(col); } },
          { label: "Cancel", id: "scCancel", onClick: (c) => c.close(null) },
          { label: "OK", kind: "primary", id: "scOk", onClick: (c) => { const n = Number(input.value); if (!isFinite(n) || n < MIN_W || n > MAX_W) { c.setError("Enter a width between " + MIN_W + " and " + MAX_W + " pixels."); input.focus(); return false; } c.close(null); ds.setWidth(col, n); } },
        ],
      });
      ctl.node.setAttribute("data-sc-dialog", "width");
      return ctl;
    };

    // ---- display names ---------------------------------------------------------------------------------
    ds.setAlias = (col, alias) => {
      alias = String(alias || "").trim().slice(0, 120);
      if (alias && alias !== col) L().alias[col] = alias; else delete L().alias[col];
      changed(alias ? col + " is shown as \u201C" + alias + "\u201D." : col + " shows its real name again.");
      if (!alias && opts.rerender) opts.rerender();
    };
    ds.rename = async (col) => {
      const d = D();
      if (!d) return;
      const v = await d.prompt({ title: "Rename Field", message: "Display name for column \u201C" + col + "\u201D. Only the caption changes: the database, SQL and the column's real name stay as they are. Leave it empty to use the real name.", value: L().alias[col] || "", okLabel: "Rename" });
      if (v !== null) ds.setAlias(col, v);
    };

    // ---- order and freezing ----------------------------------------------------------------------------
    function setOrder(order, msg) {
      L().order = order.slice();
      if (L().order.join("\u0001") === inst.all.join("\u0001")) L().order = [];
      api.persist();
      if (opts.rerender) opts.rerender();
      api.refreshUi();
      window.dispatchEvent(new CustomEvent("studiocols:change", { detail: inst.state() }));
      if (msg) say(msg);
      enhance();
    }
    ds.moveTo = (col, target, after) => {
      if (col === target) return;
      const ord = inst.ordered.filter((c) => c !== col);
      const at = ord.indexOf(target);
      if (at < 0) return;
      ord.splice(at + (after ? 1 : 0), 0, col);
      setOrder(ord, label(col) + " moved " + (after ? "after " : "before ") + label(target) + ".");
    };
    ds.move = (col, delta) => {
      const vis = inst.shown;
      const i = vis.indexOf(col), j = i + delta;
      if (i < 0 || j < 0 || j >= vis.length) return;
      ds.moveTo(col, vis[j], delta > 0);
    };
    ds.freezeUpTo = (col) => { const i = inst.shown.indexOf(col); if (i < 0) return; L().freeze = i + 1; changed("Columns up to " + label(col) + " are frozen."); };
    ds.unfreeze = () => { L().freeze = 0; changed("No frozen columns."); };
    ds.resetLayout = () => { L().widths = {}; L().order = []; L().freeze = 0; L().fmt = { rowH: "", zebra: null, font: 0 }; api.persist(); if (opts.rerender) opts.rerender(); api.refreshUi(); enhance(); say("Layout reset."); window.dispatchEvent(new CustomEvent("studiocols:change", { detail: inst.state() })); };
    ds.setFormat = (patch) => { Object.assign(L().fmt, patch); changed(); };

    // ---- selecting columns -----------------------------------------------------------------------------
    ds.selection = () => sel.filter((c) => inst.shown.includes(c));
    ds.selectColumn = (col, o) => {
      o = o || {};
      const vis = inst.shown;
      if (o.shift && anchor && vis.includes(anchor)) {
        const a = vis.indexOf(anchor), b = vis.indexOf(col);
        sel = vis.slice(Math.min(a, b), Math.max(a, b) + 1);
      } else if (o.toggle) {
        sel = sel.includes(col) ? sel.filter((c) => c !== col) : sel.concat(col);
        anchor = col;
      } else { sel = [col]; anchor = col; }
      enhance();
      say(plural(sel.length, "column") + " selected.");
    };
    ds.clearSelection = () => { sel = []; enhance(); };

    // ---- filters (on the rows of the page that is showing) ----------------------------------------------
    const numOf = (s) => { const n = Number(String(s).replace(/,/g, "")); return String(s).trim() !== "" && isFinite(n) ? n : null; };
    function matches(text, f) {
      const raw = String(text).trim();
      const isNull = raw === "NULL";
      if (f.op === "isnull") return isNull;
      if (f.op === "notnull") return !isNull;
      if (f.set) return f.set.has(isNull ? "NULL" : raw);
      const a = raw.toLowerCase(), v = String(f.val || "").toLowerCase(), v2 = String(f.val2 || "").toLowerCase();
      const na = numOf(raw), nv = numOf(f.val), nv2 = numOf(f.val2);
      switch (f.op) {
        case "eq": return na !== null && nv !== null ? na === nv : a === v;
        case "ne": return na !== null && nv !== null ? na !== nv : a !== v;
        case "contains": return a.includes(v);
        case "begins": return a.startsWith(v);
        case "ends": return a.endsWith(v);
        case "gt": return na !== null && nv !== null ? na > nv : a > v;
        case "lt": return na !== null && nv !== null ? na < nv : a < v;
        case "between": return na !== null && nv !== null && nv2 !== null ? na >= nv && na <= nv2 : a >= v && a <= v2;
      }
      return true;
    }
    ds.filtered = (col) => !!filters[col];
    ds.hasFilters = () => Object.keys(filters).length > 0;
    ds.filters = () => Object.keys(filters).map((c) => Object.assign({ col: c }, filters[c], { set: filters[c].set ? Array.from(filters[c].set) : null }));
    ds.setFilter = (col, spec) => { if (!spec) delete filters[col]; else filters[col] = spec; enhance(); api.refreshUi(); say(spec ? "Filter on " + label(col) + " applied." : "Filter on " + label(col) + " removed."); };
    ds.clearFilters = () => { Object.keys(filters).forEach((k) => delete filters[k]); enhance(); api.refreshUi(); say("All filters cleared."); };
    ds.rowCounts = () => { const t = tableEl(); if (!t) return { shown: 0, total: 0 }; const rows = Array.from(t.querySelectorAll("tbody tr")).filter((r) => r.querySelector("td[data-col]")); return { total: rows.length, shown: rows.filter((r) => !r.classList.contains("sc-row-hidden")).length }; };
    ds.openFilter = (col) => {
      const d = D();
      const t = tableEl();
      if (!d || !t) return;
      const values = new Map();
      Array.from(t.querySelectorAll('tbody td[data-col="' + css(col) + '"]')).forEach((td) => { const v = (td.textContent || "").trim(); values.set(v, (values.get(v) || 0) + 1); });
      const sorted = Array.from(values.entries()).sort((a, b) => { const na = numOf(a[0]), nb = numOf(b[0]); return na !== null && nb !== null ? na - nb : String(a[0]).localeCompare(String(b[0])); }).slice(0, 300);
      const cur = filters[col] || null;
      const op = d.el("select", { class: "sd-select", id: "scFilterOp", "aria-label": "Condition" },
        ...[["", "(choose values below)"], ["eq", "equals"], ["ne", "does not equal"], ["contains", "contains"], ["begins", "begins with"], ["ends", "ends with"], ["gt", "is greater than"], ["lt", "is less than"], ["between", "is between"], ["isnull", "is empty (NULL)"], ["notnull", "is not empty"]].map(([v, l]) => d.el("option", { value: v }, l)));
      op.value = cur && !cur.set ? cur.op : "";
      const v1 = d.el("input", { type: "text", class: "sd-input", id: "scFilterVal", "aria-label": "Value", value: cur && cur.val ? cur.val : "" });
      const v2 = d.el("input", { type: "text", class: "sd-input", id: "scFilterVal2", "aria-label": "Second value", value: cur && cur.val2 ? cur.val2 : "", placeholder: "and\u2026" });
      const search = d.el("input", { type: "search", class: "sd-input", "aria-label": "Search the values", placeholder: "Search " + sorted.length + " distinct values on this page\u2026", id: "scFilterSearch" });
      const checked = new Set(cur && cur.set ? Array.from(cur.set) : []);
      const list = d.el("div", { class: "sc-fl", role: "group", "aria-label": "Values" });
      const draw = () => {
        list.textContent = "";
        const q = search.value.trim().toLowerCase();
        sorted.forEach(([v, n]) => {
          if (q && !v.toLowerCase().includes(q)) return;
          const cb = d.el("input", { type: "checkbox" });
          cb.checked = checked.has(v);
          cb.addEventListener("change", () => { if (cb.checked) checked.add(v); else checked.delete(v); op.value = ""; });
          list.appendChild(d.el("label", { class: "sc-fl-row" }, cb, d.el("span", { class: "sc-fl-v", title: v }, v === "" ? "(empty text)" : v), d.el("span", { class: "sc-fl-n" }, String(n))));
        });
        if (!list.firstChild) list.appendChild(d.el("div", { class: "sc-empty" }, "No values."));
      };
      search.addEventListener("input", draw);
      draw();
      const body = d.el("div", { class: "sc-fd" },
        d.el("p", { class: "sd-note" }, "Filters the rows of the page that is showing. The database query is not changed; clear the filter to see every row again."),
        d.el("div", { class: "sd-row" }, d.el("label", { class: "sd-label", style: "flex:1" }, "Condition", op)),
        d.el("div", { class: "sd-row" }, d.el("label", { class: "sd-label", style: "flex:1" }, "Value", v1), d.el("label", { class: "sd-label", style: "flex:1" }, "To (between)", v2)),
        d.el("div", { class: "sd-label" }, "Values", search, list));
      const apply = (c) => {
        let spec = null;
        if (op.value) {
          if (/^(eq|ne|contains|begins|ends|gt|lt|between)$/.test(op.value) && !v1.value.trim()) { c.setError("Type a value for this condition."); v1.focus(); return false; }
          if (op.value === "between" && !v2.value.trim()) { c.setError("Type both values for \u201Cis between\u201D."); v2.focus(); return false; }
          spec = { op: op.value, val: v1.value, val2: v2.value, set: null };
        } else if (checked.size) spec = { op: "in", val: "", val2: "", set: new Set(checked) };
        c.close(null);
        ds.setFilter(col, spec);
      };
      const ctl = d.open({
        title: "Filter: " + label(col),
        body,
        initialFocus: search,
        buttons: [
          { label: "Clear filter", side: "left", id: "scFilterClear", onClick: (c) => { c.close(null); ds.setFilter(col, null); } },
          { label: "Cancel", id: "scFilterCancel", onClick: (c) => c.close(null) },
          { label: "Apply", kind: "primary", id: "scFilterApply", onClick: apply },
        ],
      });
      ctl.node.setAttribute("data-sc-dialog", "filter");
      return ctl;
    };

    // ---- applying everything to the rendered table -------------------------------------------------------
    function enhance() {
      if (enhancing || !inst.mounted) return;
      const t = tableEl();
      if (!t) return;
      const ths = dataThs(t);
      enhancing = true;
      try {
        const lay = L();
        t.classList.toggle("sc-nozebra", lay.fmt.zebra === false);
        t.classList.toggle("sc-zebra", lay.fmt.zebra === true);
        if (lay.fmt.rowH) t.setAttribute("data-sc-row", lay.fmt.rowH); else t.removeAttribute("data-sc-row");
        t.style.fontSize = lay.fmt.font ? lay.fmt.font + "px" : "";
        if (!ths.length) return;
        const head = ths[0].parentElement;
        const cells = Array.from(head.children);
        const lead = cells.indexOf(ths[0]);
        // display names
        ths.forEach((th) => {
          const col = th.dataset.col, a = lay.alias[col];
          th.classList.toggle("sc-aliased", !!a);
          const base = (th.getAttribute("data-sc-title") || "");
          if (a) {
            const tn = th.firstChild;
            if (tn && tn.nodeType === 3 && tn.nodeValue.indexOf(col) === 0) tn.nodeValue = a + tn.nodeValue.slice(col.length);
            th.setAttribute("title", "Real column name: " + col + " (shown as \u201C" + a + "\u201D)");
          } else if (th.hasAttribute("title") && /^Real column name: /.test(th.getAttribute("title"))) th.removeAttribute("title");
          th.setAttribute("aria-label", a ? a + " (column " + col + ")" : col);
        });
        // widths
        let cg = t.querySelector("colgroup.sc-cg");
        const custom = Object.keys(lay.widths).length > 0;
        if (!custom) {
          if (cg) cg.remove();
          t.classList.remove("sc-fixed");
          t.style.tableLayout = ""; t.style.width = ""; t.style.minWidth = "";
        } else {
          if (cg) cg.remove();
          cg = document.createElement("colgroup");
          cg.className = "sc-cg";
          let total = 0;
          cells.forEach((c, i) => {
            const col = document.createElement("col");
            let w;
            if (i < lead) { w = leadW[i] || (leadW[i] = leadWidth(c, i)); }
            else { const name = c.dataset.col; w = lay.widths[name] || (lay.widths[name] = clampW(bestFit(name))); }
            col.style.width = w + "px";
            total += w;
            cg.appendChild(col);
          });
          t.insertBefore(cg, t.firstChild);
          t.classList.add("sc-fixed");
          t.style.tableLayout = "fixed";
          t.style.width = total + "px";
          t.style.minWidth = total + "px";
        }
        // frozen columns
        Array.from(t.querySelectorAll(".sc-frozen")).forEach((n) => { n.classList.remove("sc-frozen", "sc-frozen-last"); n.style.left = ""; });
        if (lay.freeze > 0) {
          const nFrozen = Math.min(lay.freeze, ths.length);
          const total = lead + nFrozen;
          const lefts = [];
          let x = 0;
          for (let i = 0; i < total; i++) { lefts[i] = x; const c = cells[i]; x += (custom && i >= lead ? lay.widths[c.dataset.col] : 0) || c.offsetWidth || leadW[i] || (i >= lead ? STD_W : 44); }
          Array.from(t.rows).forEach((r) => {
            let ci = 0;
            Array.from(r.cells).forEach((c) => {
              const span = c.colSpan || 1;
              if (ci + span <= total && lefts[ci] !== undefined) {
                c.classList.add("sc-frozen");
                c.style.left = lefts[ci] + "px";
                if (ci + span === total) c.classList.add("sc-frozen-last");
              }
              ci += span;
            });
          });
        }
        // selected columns
        t.querySelectorAll("th.sc-colsel, td.sc-colsel").forEach((n) => n.classList.remove("sc-colsel"));
        if (sel.length) {
          ths.forEach((th) => { if (sel.includes(th.dataset.col)) { th.classList.add("sc-colsel"); th.setAttribute("aria-selected", "true"); } else th.removeAttribute("aria-selected"); });
          t.querySelectorAll("td[data-col]").forEach((td) => { if (sel.includes(td.dataset.col)) td.classList.add("sc-colsel"); });
        }
        // filtered rows and the filter marks on the headers
        ths.forEach((th) => th.classList.toggle("sc-filtered", !!filters[th.dataset.col]));
        const fcols = Object.keys(filters);
        Array.from(t.querySelectorAll("tbody tr")).forEach((r) => {
          if (!fcols.length) { r.classList.remove("sc-row-hidden"); return; }
          let ok = true;
          for (const c of fcols) { const td = r.querySelector('td[data-col="' + css(c) + '"]'); if (td && !matches(td.textContent, filters[c])) { ok = false; break; } }
          r.classList.toggle("sc-row-hidden", !ok);
        });
      } finally {
        enhancing = false;
        if (obs) obs.takeRecords();
        if (ds.hasFilters()) api.refreshUi();
      }
    }
    ds.enhance = enhance;

    function watch() {
      const c = resolve(opts.stripBefore);
      if (!c || obs || typeof MutationObserver === "undefined") return;
      // runs as a microtask right after the studio redraws the grid, i.e. before the browser paints
      obs = new MutationObserver(() => { if (!enhancing) enhance(); });
      obs.observe(c, { childList: true, subtree: true });
    }
    ds.watch = watch;

    // ---- one header cell ---------------------------------------------------------------------------------
    ds.decorateTh = (th, col) => {
      const rz = el("span", { class: "sc-rz", role: "separator", "aria-orientation": "vertical", title: "Drag to resize the column. Double-click to fit it to its content. Alt+Left / Alt+Right when the header is focused." });
      rz.draggable = false;
      let startX = 0, startW = 0, pending = 0, guide = null;
      const moveH = (ev) => {
        pending = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX));
        if (guide) guide.style.left = Math.round(th.getBoundingClientRect().left + pending) + "px";
      };
      const upH = () => {
        window.removeEventListener("pointermove", moveH, true);
        window.removeEventListener("pointerup", upH, true);
        window.removeEventListener("pointercancel", upH, true);
        if (guide) { guide.remove(); guide = null; }
        th.classList.remove("sc-resizing");
        document.body.classList.remove("sc-col-resizing");
        if (pending && Math.round(pending) !== Math.round(startW)) ds.setWidth(col, pending);
      };
      rz.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault(); e.stopPropagation();
        materialize();
        startX = e.clientX;
        startW = th.offsetWidth || widthOf(col);
        pending = startW;
        guide = el("div", { class: "sc-guide", "aria-hidden": "true" });
        const r = th.getBoundingClientRect();
        guide.style.left = Math.round(r.left + startW) + "px";
        document.body.appendChild(guide);
        th.classList.add("sc-resizing");
        document.body.classList.add("sc-col-resizing");
        try { rz.setPointerCapture(e.pointerId); } catch (err) {}
        window.addEventListener("pointermove", moveH, true);
        window.addEventListener("pointerup", upH, true);
        window.addEventListener("pointercancel", upH, true);
      });
      rz.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); });
      rz.addEventListener("dblclick", (e) => { e.stopPropagation(); e.preventDefault(); ds.fit(col); });
      th.appendChild(rz);

      // header click: Ctrl/Cmd+click toggles, Shift+click extends (a plain click keeps sorting, as before)
      th.addEventListener("click", (e) => {
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
        e.stopImmediatePropagation(); e.preventDefault();
        ds.selectColumn(col, { shift: e.shiftKey, toggle: !e.shiftKey });
      }, true);
      // resize by keyboard
      th.addEventListener("keydown", (e) => {
        if (e.target !== th || !e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          const step = e.shiftKey ? 40 : 10;
          ds.setWidth(col, widthOf(col) + (e.key === "ArrowRight" ? step : -step));
          const again = tableEl() && tableEl().querySelector('th[data-col="' + css(col) + '"]');
          if (again) try { again.focus(); } catch (err) {}
        }
      });
      // drag to reorder
      th.draggable = true;
      th.addEventListener("dragstart", (e) => {
        ds._drag = col;
        th.classList.add("sc-dragging");
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", col); } catch (err) {}
      });
      th.addEventListener("dragend", () => { ds._drag = null; th.classList.remove("sc-dragging"); clearDrop(); });
      th.addEventListener("dragover", (e) => {
        if (!ds._drag || ds._drag === col) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch (err) {}
        const r = th.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        clearDrop();
        th.classList.add(after ? "sc-drop-after" : "sc-drop-before");
      });
      th.addEventListener("dragleave", () => th.classList.remove("sc-drop-before", "sc-drop-after"));
      th.addEventListener("drop", (e) => {
        if (!ds._drag) return;
        e.preventDefault();
        const after = th.classList.contains("sc-drop-after");
        const from = ds._drag;
        ds._drag = null;
        clearDrop();
        ds.moveTo(from, col, after);
      });
    };
    function clearDrop() { const t = tableEl(); if (t) t.querySelectorAll(".sc-drop-before, .sc-drop-after").forEach((n) => n.classList.remove("sc-drop-before", "sc-drop-after")); }

    watch();
  }

  function create(opts) {
    opts = opts || {};
    const inst = {
      id: opts.id || "grid",
      studio: opts.studio || "studio",
      opts,
      all: [],
      shown: [],
      meta: {},
      kind: "table",
      hidden: new Set(),
      layout: emptyLayout(),
      ordered: [],
      scopeKey: "",
      btn: null,
      strip: null,
      mounted: false,
    };

    function scopeFor(kind, all) {
      const db = String((opts.getDb && opts.getDb()) || "");
      if (kind === "query") return LS_PREFIX + inst.studio + "|" + db + "|query:" + inst.id + "|" + hashOf(all.join("\u0001"));
      return LS_PREFIX + inst.studio + "|" + db + "|" + String((opts.getTable && opts.getTable()) || "");
    }
    function hiddenNow() { return inst.all.filter((c) => inst.hidden.has(c)); }
    function keepColumn() {
      const pk = inst.all.find((c) => inst.meta[c] && inst.meta[c].pk);
      return pk || inst.all[0];
    }
    function layoutIsDefault() {
      const l = inst.layout;
      return !Object.keys(l.widths).length && !Object.keys(l.alias).length && !l.order.length && !l.freeze && !l.fmt.rowH && l.fmt.zebra === null && !l.fmt.font;
    }
    function persist() {
      if (!inst.scopeKey) return;
      const arr = Array.from(inst.hidden);
      // plain list of hidden columns while nothing else is customised (the format used before widths, aliases and order existed)
      if (layoutIsDefault()) { if (arr.length) store.set(inst.scopeKey, JSON.stringify(arr)); else store.del(inst.scopeKey); return; }
      store.set(inst.scopeKey, JSON.stringify({ v: 2, hidden: arr, widths: inst.layout.widths, alias: inst.layout.alias, order: inst.layout.order, freeze: inst.layout.freeze, fmt: inst.layout.fmt }));
    }
    function load() {
      inst.hidden = new Set();
      inst.layout = emptyLayout();
      const raw = store.get(inst.scopeKey);
      if (!raw) return;
      try {
        const v = JSON.parse(raw);
        if (Array.isArray(v)) inst.hidden = new Set(v.map(String));
        else if (v && typeof v === "object") {
          inst.hidden = new Set((v.hidden || []).map(String));
          const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
          Object.keys(v.widths || {}).forEach((k) => { const n = num(v.widths[k]); if (n) inst.layout.widths[k] = Math.min(MAX_W, Math.max(MIN_W, Math.round(n))); });
          Object.keys(v.alias || {}).forEach((k) => { if (typeof v.alias[k] === "string" && v.alias[k].trim()) inst.layout.alias[k] = v.alias[k].slice(0, 120); });
          inst.layout.order = Array.isArray(v.order) ? v.order.map(String) : [];
          inst.layout.freeze = Math.max(0, Math.min(50, Math.floor(num(v.freeze) || 0)));
          const f = v.fmt || {};
          inst.layout.fmt = { rowH: ["compact", "normal", "spacious"].includes(f.rowH) ? f.rowH : "", zebra: f.zebra === true || f.zebra === false ? f.zebra : null, font: num(f.font) ? Math.min(22, Math.max(9, Math.round(f.font))) : 0 };
        }
      } catch (e) {}
    }
    inst.includeHiddenInExport = () => store.get(EXPORT_KEY) === "1";
    inst.aliasInExport = () => store.get(ALIAS_KEY) === "1";
    inst.exportColumns = (all) => {
      const base = all || inst.all;
      const cols = inst.includeHiddenInExport() ? base.slice() : base.filter((c) => !inst.hidden.has(c) || !inst.all.includes(c));
      // the grid's own order (drag and drop / Move left and right) is what copy and export follow
      const pos = (c) => { const i = inst.ordered.indexOf(c); return i < 0 ? 1e6 : i; };
      return cols.map((c, i) => [c, i]).sort((x, y) => pos(x[0]) - pos(y[0]) || x[1] - y[1]).map((x) => x[0]);
    };
    // Header names for copy / export: the real column names, or the aliases when "Use aliases in copy/export" is on
    inst.exportNames = (cols) => {
      const used = new Set(cols);
      return cols.map((c) => {
        const a = inst.layout.alias[c];
        if (!a || !inst.aliasInExport() || a === c || (used.has(a) && a !== c)) return c;
        used.add(a);
        return a;
      });
    };
    inst.exportRows = (rows, all) => {
      const cols = inst.exportColumns(all);
      const names = inst.exportNames(cols);
      const same = cols.length === (all || inst.all).length && cols.every((c, i) => c === (all || inst.all)[i]) && names.every((n, i) => n === cols[i]);
      if (same) return rows;
      return rows.map((r) => { const o = {}; cols.forEach((c, i) => { o[names[i]] = r[c]; }); return o; });
    };
    inst.exportLabel = () => {
      const n = hiddenNow().length;
      if (!n) return "all " + plural(inst.all.length, "column") + (inst.aliasInExport() && Object.keys(inst.layout.alias).length ? ", aliases as headers" : "");
      return inst.includeHiddenInExport() ? "all " + plural(inst.all.length, "column") + " (hidden columns included)" : inst.shown.length + " of " + plural(inst.all.length, "column") + " (hidden columns excluded)";
    };
    inst.state = () => ({ all: inst.all.slice(), visible: inst.shown.slice(), hidden: hiddenNow(), scopeKey: inst.scopeKey, kind: inst.kind, order: inst.ordered.slice(), widths: Object.assign({}, inst.layout.widths), alias: Object.assign({}, inst.layout.alias), freeze: inst.layout.freeze, fmt: Object.assign({}, inst.layout.fmt) });

    function mount() {
      if (inst.mounted) return true;
      const host = resolve(opts.buttonHost);
      const before = resolve(opts.stripBefore);
      if (!host) return false;
      inst.btn = el("button", { type: "button", class: "btn btn-sm sc-btn", id: "scBtn-" + inst.id, "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": "scPop-" + inst.id },
        el("span", { html: ICON_COLUMNS }), el("span", { class: "sc-label" }, "Columns"), el("span", { class: "sc-count", "aria-hidden": "true" }, "0"));
      inst.btn.addEventListener("click", () => (open.pop && open.pop.inst === inst ? closePop(true) : openPop()));
      inst.btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && !(open.pop && open.pop.inst === inst)) { e.preventDefault(); openPop(); } });
      host.insertBefore(inst.btn, opts.buttonPosition === "append" ? null : host.firstChild);
      inst.strip = el("div", { class: "sc-strip", id: "scStrip-" + inst.id, role: "status", "aria-live": "polite", hidden: true });
      if (before && before.parentNode) before.parentNode.insertBefore(inst.strip, before);
      inst.mounted = true;
      bindGlobals();
      refreshUi();
      return true;
    }

    function refreshUi() {
      if (!inst.mounted) return;
      const total = inst.all.length, hid = hiddenNow(), shownN = total - hid.length;
      inst.btn.querySelector(".sc-count").textContent = hid.length ? shownN + " of " + total : String(total);
      inst.btn.classList.toggle("has-hidden", hid.length > 0);
      const label = hid.length ? "Columns: " + shownN + " of " + total + " shown, " + plural(hid.length, "column") + " hidden" : "Columns: all " + total + " shown";
      inst.btn.setAttribute("aria-label", label + ". Show or hide columns");
      inst.btn.title = "Show or hide columns - " + label + (inst.kind === "table" ? ". Your choice is remembered for this table." : ".");
      (opts.exportButtons || []).forEach((id) => {
        const b = resolve(id);
        if (!b) return;
        if (b.dataset.scTitle === undefined) b.dataset.scTitle = b.getAttribute("title") || b.getAttribute("data-tip") || "";
        b.title = (b.dataset.scTitle || "Export") + " - columns: " + inst.exportLabel();
      });
      renderStrip(hid);
    }

    function renderStrip(hid) {
      const s = inst.strip;
      if (!s) return;
      s.textContent = "";
      const filters = (opts.activeFilters && opts.activeFilters()) || [];
      const hiddenFilters = filters.filter((c) => hid.includes(c));
      const sort = opts.sortState && opts.sortState();
      const hiddenSort = sort && sort.col && hid.includes(sort.col) ? sort.col : "";
      const nFilters = inst.ds ? inst.ds.filters().length : 0;
      if (!hid.length && !nFilters) { s.hidden = true; return; }
      s.hidden = false;
      if (hid.length) {
        s.appendChild(el("span", { html: ICON_EYE_OFF }));
        s.appendChild(el("span", { class: "sc-strip-title" }, plural(hid.length, "hidden column")));
        const names = el("span", { class: "sc-strip-names" });
        hid.slice(0, 4).forEach((c) => {
          const chip = el("button", { type: "button", class: "sc-chip", title: "Show column " + c, "aria-label": "Show column " + c }, el("span", { class: "sc-chip-name" }, c), el("span", { "aria-hidden": "true" }, "+"));
          chip.addEventListener("click", () => setHiddenOne(c, false));
          names.appendChild(chip);
        });
        if (hid.length > 4) names.appendChild(el("span", { class: "sc-hint" }, "+" + (hid.length - 4) + " more"));
        s.appendChild(names);
        s.appendChild(el("span", { class: "sc-spacer" }));
        const showAll = el("button", { type: "button", class: "sc-link", title: "Show every hidden column again" }, "Show all");
        showAll.addEventListener("click", () => showAllCols());
        const choose = el("button", { type: "button", class: "sc-link", title: "Open the Hide / Unhide Fields list" }, "Unhide Fields\u2026");
        choose.addEventListener("click", () => openPop());
        s.appendChild(showAll);
        s.appendChild(choose);
      } else s.appendChild(el("span", { class: "sc-spacer" }));
      if (nFilters) {
        const rc = inst.ds.rowCounts();
        s.appendChild(el("span", { class: "sc-strip-title sc-filter-note", title: "Filters apply to the rows of this page only" }, "\u2691 " + plural(nFilters, "filter") + ": " + rc.shown + " of " + rc.total + " rows on this page"));
        const clr = el("button", { type: "button", class: "sc-link", title: "Show every row on this page again" }, "Clear all filters");
        clr.addEventListener("click", () => inst.ds.clearFilters());
        s.appendChild(clr);
      }
      if (hiddenFilters.length) s.appendChild(el("span", { class: "sc-warn" }, "\u26A0 A filter is still active on hidden " + (hiddenFilters.length === 1 ? "column " : "columns ") + hiddenFilters.join(", ") + "."));
      if (hiddenSort) s.appendChild(el("span", { class: "sc-warn" }, "\u26A0 Rows are sorted by the hidden column " + hiddenSort + "."));
      if (!inst.includeHiddenInExport()) s.title = "Copy and export use the visible columns only (change this in the Hide / Unhide Fields list).";
      else s.title = "Copy and export include hidden columns (change this in the Hide / Unhide Fields list).";
    }

    function applyHidden(next, message) {
      const vis = inst.all.filter((c) => !next.has(c));
      if (!vis.length && inst.all.length) next.delete(keepColumn());
      inst.hidden = next;
      persist();
      if (opts.rerender) opts.rerender(); else { inst.shown = inst.all.filter((c) => !inst.hidden.has(c)); refreshUi(); }
      syncPop(message);
      window.dispatchEvent(new CustomEvent("studiocols:change", { detail: inst.state() }));
    }
    function setHiddenOne(col, hide) {
      const next = new Set(inst.hidden);
      if (hide) next.add(col); else next.delete(col);
      applyHidden(next, (hide ? "Hid column " : "Showing column ") + col + ".");
    }
    function showAllCols() { applyHidden(new Set(), "All columns are shown."); }
    function targets() {
      const q = open.pop && open.pop.search ? open.pop.search.value.trim().toLowerCase() : "";
      return q ? inst.all.filter((c) => c.toLowerCase().includes(q)) : inst.all;
    }
    function hideAllCols() {
      const next = new Set(inst.hidden);
      targets().forEach((c) => next.add(c));
      applyHidden(next, "Hid all columns except one - at least one column always stays visible.");
    }
    function onlyKeys() {
      const next = new Set(inst.all.filter((c) => { const m = inst.meta[c]; return !(m && (m.pk || m.fk || m.idx)); }));
      applyHidden(next, "Showing only key and indexed columns.");
    }
    function onlyThis(col) { applyHidden(new Set(inst.all.filter((c) => c !== col)), "Showing only column " + col + "."); }
    function resetDefault() {
      store.del(inst.scopeKey);
      store.del(EXPORT_KEY);
      inst.hidden = new Set();
      if (opts.rerender) opts.rerender(); else { inst.shown = inst.all.slice(); refreshUi(); }
      syncPop("Reset to default: all columns shown.");
      window.dispatchEvent(new CustomEvent("studiocols:change", { detail: inst.state() }));
    }

    // ---- popover ----
    function openPop() {
      if (!mount()) return;
      closeMenu(false);
      closePop(false);
      const node = el("div", { class: "sc-pop", id: "scPop-" + inst.id, role: "dialog", "aria-label": "Hide or unhide fields", "aria-modal": "false" });
      const title = el("span", { class: "sc-pop-title" }, "Hide / Unhide Fields");
      const count = el("span", { class: "sc-pop-count" });
      const close = el("button", { type: "button", class: "sc-x", title: "Close (Esc)", "aria-label": "Close the Hide / Unhide Fields list", html: ICON_CLOSE });
      close.addEventListener("click", () => closePop(true));
      node.appendChild(el("div", { class: "sc-pop-head" }, title, count, close));
      let search = null;
      if (inst.all.length > DENSE) {
        search = el("input", { type: "search", class: "sc-search", placeholder: "Filter " + inst.all.length + " columns\u2026", "aria-label": "Filter the column list", title: "Type to filter the list. Show all / Hide all then act on the matches only." });
        search.addEventListener("input", () => syncPop());
        node.appendChild(el("div", { class: "sc-search-wrap" }, search));
      }
      const mk = (label, tip, fn, cls) => { const b = el("button", { type: "button", class: "sc-act" + (cls ? " " + cls : ""), title: tip }, label); b.addEventListener("click", fn); return b; };
      const bShow = mk("Select all", "Show every column (or every match of the filter)", () => {
        const next = new Set(inst.hidden); targets().forEach((c) => next.delete(c)); applyHidden(next, "Showing " + (search && search.value ? "matching" : "all") + " columns.");
      });
      const bHide = mk("Clear", "Hide every column (or every match of the filter). One column always stays visible.", hideAllCols);
      const bKeys = mk("Only keys", "Show only primary key, foreign key and indexed columns", onlyKeys);
      const bReset = mk("Reset to default", "Forget everything saved for this table: show all columns and clear widths, display names, order, frozen columns and row formatting", resetDefault);
      node.appendChild(el("div", { class: "sc-actions", role: "group", "aria-label": "Column actions" }, bShow, bHide, bKeys, bReset));
      const list = el("div", { class: "sc-list", role: "group", "aria-label": "Columns" });
      node.appendChild(list);
      const dsh = inst.ds;
      const lay = el("details", { class: "sc-layout" });
      lay.appendChild(el("summary", { title: "Widths, display names, frozen columns, row height and more" }, "Datasheet layout"));
      const lbtn = (label, tip, fn) => { const b = mk(label, tip, fn); return b; };
      const bFit = lbtn("Fit all columns", "Resize every column to its content", () => dsh.fitAll());
      const bRw = lbtn("Reset widths", "Back to automatic widths", () => dsh.resetWidths());
      const bUf = lbtn("Unfreeze all", "Let every column scroll again", () => dsh.unfreeze());
      const bRl = lbtn("Reset layout", "Widths, order, frozen columns and row formatting back to default (hidden columns and display names are kept)", () => dsh.resetLayout());
      const selOf = (id, label, opts2, cur, onChange) => {
        const sl = el("select", { class: "sc-sel", id, "aria-label": label, title: label });
        opts2.forEach(([v, l]) => sl.appendChild(el("option", { value: v }, l)));
        sl.value = String(cur);
        sl.addEventListener("change", () => onChange(sl.value));
        return el("label", { class: "sc-row" }, el("span", null, label), sl);
      };
      const f = inst.layout.fmt;
      const rowSel = selOf("scRowH-" + inst.id, "Row height", [["", "Default"], ["compact", "Compact"], ["normal", "Normal"], ["spacious", "Spacious"]], f.rowH, (v) => dsh.setFormat({ rowH: v }));
      const fontSel = selOf("scFont-" + inst.id, "Font size", [["0", "Default"], ["11", "11 px"], ["12", "12 px"], ["13", "13 px"], ["14", "14 px"], ["16", "16 px"]], f.font, (v) => dsh.setFormat({ font: Number(v) }));
      const zebra = el("input", { type: "checkbox", id: "scZebra-" + inst.id });
      zebra.checked = f.zebra !== false;
      zebra.addEventListener("change", () => dsh.setFormat({ zebra: zebra.checked ? null : false }));
      const alias = el("input", { type: "checkbox", id: "scAlias-" + inst.id });
      alias.checked = inst.aliasInExport();
      alias.addEventListener("change", () => { if (alias.checked) store.set(ALIAS_KEY, "1"); else store.del(ALIAS_KEY); refreshUi(); syncPop(alias.checked ? "Copy and export use display names as headers." : "Copy and export use the real column names."); });
      lay.appendChild(el("div", { class: "sc-actions" }, bFit, bRw, bUf, bRl));
      lay.appendChild(el("div", { class: "sc-fmt" }, rowSel, fontSel,
        el("label", { class: "sc-opt" }, zebra, el("span", null, "Alternate row colour")),
        el("label", { class: "sc-opt", title: "When ticked, the header row of copied or exported data uses the display names (Rename Field). SQL always uses the real names." }, alias, el("span", null, "Use display names (aliases) in copy/export"))));
      node.appendChild(lay);
      const exp = el("input", { type: "checkbox", id: "scExp-" + inst.id });
      exp.checked = inst.includeHiddenInExport();
      exp.addEventListener("change", () => { if (exp.checked) store.set(EXPORT_KEY, "1"); else store.del(EXPORT_KEY); refreshUi(); syncPop(exp.checked ? "Exports will include hidden columns." : "Exports will use visible columns only."); });
      const live = el("div", { class: "sc-live", "aria-live": "polite" });
      node.appendChild(el("div", { class: "sc-foot" },
        el("label", { class: "sc-opt", title: "When ticked, Copy and Export also include the hidden columns" }, exp, el("span", null, "Include hidden columns when copying or exporting")),
        el("div", { class: "sc-hint" }, inst.kind === "table" ? "Saved for this table in this browser. Space toggles, arrows move, Esc closes." : "Saved for results with these columns. Space toggles, arrows move, Esc closes."),
        live));
      document.body.appendChild(node);
      open.pop = { inst, node, list, count, search, live, bShow, bHide, bKeys, bReset, exp, bFit, bRw, bUf, bRl, zebra };
      inst.btn.setAttribute("aria-expanded", "true");
      syncPop();
      place(node, inst.btn.getBoundingClientRect());
      const first = search || node.querySelector(".sc-item input");
      if (first) first.focus();
    }

    function syncPop(message) {
      const p = open.pop;
      if (!p || p.inst !== inst) return;
      const hid = hiddenNow();
      const shownN = inst.all.length - hid.length;
      p.count.textContent = shownN + " of " + inst.all.length + " shown";
      const q = p.search ? p.search.value.trim().toLowerCase() : "";
      const had = document.activeElement && p.list.contains(document.activeElement) ? document.activeElement.dataset.col : null;
      p.list.textContent = "";
      let rows = 0;
      (inst.ordered.length ? inst.ordered : inst.all).forEach((c, i) => {
        const shownName = inst.layout.alias[c] || c;
        if (q && !c.toLowerCase().includes(q) && !shownName.toLowerCase().includes(q)) return;
        rows++;
        const m = inst.meta[c] || {};
        const on = !inst.hidden.has(c);
        const locked = on && shownN === 1;
        const cb = el("input", { type: "checkbox", "data-col": c, "aria-label": "Show column " + c });
        cb.checked = on;
        cb.disabled = locked;
        const row = el("label", { class: "sc-item" + (on ? "" : " is-off") + (locked ? " is-locked" : ""), title: locked ? "At least one column must stay visible" : (on ? "Hide " : "Show ") + c },
          cb, el("span", { class: "sc-name", title: inst.layout.alias[c] ? "Real name: " + c : c }, shownName), inst.layout.alias[c] ? el("span", { class: "sc-real", title: "Real column name" }, "(" + c + ")") : null,
          m.pk ? el("span", { class: "sc-mark pk", title: "Primary key" }, "PK") : null,
          m.fk ? el("span", { class: "sc-mark fk", title: "Foreign key" }, "FK") : null,
          m.idx && !m.pk ? el("span", { class: "sc-mark idx", title: "Indexed" }, "IDX") : null,
          el("span", { class: "sc-type", title: m.type ? m.type + (m.notnull ? " NOT NULL" : "") : "Column " + (i + 1) }, m.type ? m.type : "#" + (i + 1)));
        cb.addEventListener("change", () => setHiddenOne(c, !cb.checked));
        const ren = el("button", { type: "button", class: "sc-ren", title: "Rename Field: give " + c + " a display name", "aria-label": "Rename field " + c }, "\u270E");
        ren.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); inst.ds.rename(c); });
        row.appendChild(ren);
        p.list.appendChild(row);
      });
      if (!inst.all.length) p.list.appendChild(el("div", { class: "sc-empty" }, "No columns yet. Open a table or run a query first."));
      else if (!rows) p.list.appendChild(el("div", { class: "sc-empty" }, "No column matches \u201C" + p.search.value + "\u201D."));
      if (had) { const again = p.list.querySelector('input[data-col="' + had.replace(/["\\]/g, "\\$&") + '"]'); if (again && !again.disabled) again.focus(); else if (p.search) p.search.focus(); }
      p.bKeys.disabled = !inst.all.some((c) => inst.meta[c] && (inst.meta[c].pk || inst.meta[c].fk || inst.meta[c].idx));
      p.bShow.disabled = !hid.length;
      if (p.bRw) { p.bRw.disabled = !Object.keys(inst.layout.widths).length; p.bUf.disabled = !inst.layout.freeze; }
      p.bHide.disabled = shownN <= 1;
      if (message) p.live.textContent = message + " " + shownN + " of " + inst.all.length + " shown.";
    }

    // ---- header menu ----
    function openMenu(col, opener, ev) {
      closeMenu(false);
      closePop(false);
      const shownN = inst.all.length - hiddenNow().length;
      const node = el("div", { class: "sc-menu", role: "menu", "aria-label": "Column " + col });
      node.appendChild(el("div", { class: "sc-menu-title", title: col }, col));
      const add = (label, fn, o) => {
        const b = el("button", { type: "button", role: "menuitem", disabled: !!(o && o.disabled), title: (o && o.title) || label }, el("span", null, label), o && o.kbd ? el("span", { class: "sc-kbd" }, o.kbd) : null);
        b.addEventListener("click", () => { closeMenu(false); fn(); if (o && o.focusBtn !== false && inst.btn) try { inst.btn.focus(); } catch (e) {} });
        node.appendChild(b);
        return b;
      };
      const dsh = inst.ds;
      const sortable = opts.sort && (!opts.canSort || opts.canSort());
      if (sortable) {
        add("Sort A \u2192 Z", () => opts.sort(col, "ASC"), { focusBtn: false, title: "Sort ascending by " + col });
        add("Sort Z \u2192 A", () => opts.sort(col, "DESC"), { focusBtn: false, title: "Sort descending by " + col });
        if (opts.clearSort && opts.sortState && opts.sortState().col) add("Clear sort", () => opts.clearSort(), { focusBtn: false, title: "Remove the sort order" });
        node.appendChild(el("hr"));
      }
      if (dsh) {
        add("Filter\u2026" + (dsh.filtered(col) ? " (active)" : ""), () => dsh.openFilter(col), { focusBtn: false, title: "Filter the rows on this page by the values of " + col });
        if (dsh.hasFilters()) add("Clear all filters", () => dsh.clearFilters(), { title: "Show every row on this page again" });
        add("Select column", () => dsh.selectColumn(col, {}), { title: "Highlight the column (Ctrl/Cmd+click and Shift+click on headers extend the selection)" });
        node.appendChild(el("hr"));
        add("Rename Field\u2026", () => dsh.rename(col), { focusBtn: false, title: "Give the column a display name (caption). The database is not changed" });
        if (inst.layout.alias[col]) add("Use real name", () => dsh.setAlias(col, ""), { title: "Remove the display name of " + col });
      }
      const sel = dsh ? dsh.selection() : [];
      const hideSet = sel.length > 1 && sel.includes(col) ? sel : [col];
      const canHide = inst.all.length - hiddenNow().length - hideSet.filter((c) => !inst.hidden.has(c)).length >= 1;
      add(hideSet.length > 1 ? "Hide Fields (" + hideSet.length + " selected)" : "Hide column", () => { const next = new Set(inst.hidden); hideSet.forEach((c) => next.add(c)); applyHidden(next, "Hid " + plural(hideSet.length, "column") + "."); }, { disabled: !canHide, title: !canHide ? "At least one column must stay visible" : "Hide column " + hideSet.join(", ") + " (Unhide Fields brings it back)" });
      add("Hide other columns", () => onlyThis(col), { disabled: shownN <= 1 && !inst.hidden.has(col) && inst.all.length === 1, title: "Show only column " + col });
      add("Unhide Fields\u2026" + (hiddenNow().length ? " (" + hiddenNow().length + " hidden)" : ""), () => openPop(), { focusBtn: false, title: "Open the Hide / Unhide Fields list" });
      if (dsh) {
        node.appendChild(el("hr"));
        add("Field Width\u2026", () => dsh.widthDialog(col), { focusBtn: false, title: "Type a width in pixels, use the standard width, or fit the content" });
        add("Best fit", () => dsh.fit(col), { title: "Resize to the widest value (double-click the header edge does the same)" });
        add("Fit all columns", () => dsh.fitAll(), { title: "Resize every column to its content" });
        add("Reset widths", () => dsh.resetWidths(), { disabled: !Object.keys(inst.layout.widths).length, title: "Back to automatic column widths" });
        node.appendChild(el("hr"));
        const pos = inst.shown.indexOf(col);
        add("Move left", () => dsh.move(col, -1), { disabled: pos <= 0, title: "Move the column one place to the left (you can also drag the header)" });
        add("Move right", () => dsh.move(col, 1), { disabled: pos < 0 || pos >= inst.shown.length - 1, title: "Move the column one place to the right" });
        add("Freeze columns up to here", () => dsh.freezeUpTo(col), { title: "Keep this column and the ones to its left in place while scrolling sideways" });
        add("Unfreeze all columns", () => dsh.unfreeze(), { disabled: !inst.layout.freeze, title: "Let every column scroll again" });
        add("Reset layout", () => dsh.resetLayout(), { title: "Widths, column order, frozen columns and row formatting back to default (hidden columns and display names are kept)" });
      }
      if (hiddenNow().length) add("Show all columns (" + hiddenNow().length + " hidden)", () => showAllCols(), { title: "Show every hidden column again" });
      document.body.appendChild(node);
      const r = opener ? opener.getBoundingClientRect() : { left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY };
      place(node, r);
      open.menu = { inst, node, opener };
      if (opener) opener.setAttribute("aria-expanded", "true");
      const first = node.querySelector("button:not([disabled])");
      if (first) first.focus();
    }

    inst.decorate = (th, col) => {
      if (!th || th.classList.contains("sc-th")) return th;
      th.classList.add("sc-th");
      th.dataset.col = col;
      th.setAttribute("scope", "col");
      if (!th.hasAttribute("tabindex")) th.tabIndex = 0;
      const b = el("button", { type: "button", class: "sc-th-btn", title: "Column options for " + col + ": hide, sort and more. You can also right-click the header.", "aria-label": "Options for column " + col, "aria-haspopup": "menu", "aria-expanded": "false", html: ICON_CHEVRON });
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); openMenu(col, b); });
      b.addEventListener("dblclick", (e) => e.stopPropagation());
      th.appendChild(b);
      if (inst.ds) inst.ds.decorateTh(th, col);
      th.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); openMenu(col, b, e); });
      th.addEventListener("keydown", (e) => {
        if (e.target !== th) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); }
        else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10") || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); openMenu(col, b); }
      });
      return th;
    };
    inst.decorateAll = (root) => { Array.from((root || document).querySelectorAll("th[data-col]")).forEach((th) => inst.decorate(th, th.dataset.col)); };

    // Called by the studio at the start of every render. Returns the columns to draw.
    inst.visible = (all, o) => {
      o = o || {};
      const cols = Array.from(all || []).map(String);
      mount();
      const kind = o.kind || "table";
      const key = scopeFor(kind, cols);
      inst.kind = kind;
      inst.all = cols;
      inst.meta = o.meta || {};
      if (key !== inst.scopeKey) { inst.scopeKey = key; load(); }
      const ord = inst.layout.order.filter((c) => cols.includes(c));
      cols.forEach((c) => { if (!ord.includes(c)) ord.push(c); });
      inst.ordered = ord;
      let vis = ord.filter((c) => !inst.hidden.has(c));
      if (!vis.length && cols.length) { inst.hidden.delete(keepColumn()); vis = ord.filter((c) => !inst.hidden.has(c)); persist(); }
      inst.shown = vis;
      refreshUi();
      return vis;
    };
    inst.refresh = refreshUi;
    inst.open = openPop;
    inst.close = () => closePop(true);
    inst.showAll = showAllCols;
    inst.hide = (c) => setHiddenOne(c, true);
    inst.show = (c) => setHiddenOne(c, false);
    inst.reset = resetDefault;
    installDatasheet(inst, { persist, refreshUi, syncPop, applyHidden, openPop, hiddenNow });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
    StudioCols.instances[inst.id] = inst;
    return inst;
  }

  const StudioCols = { version: 1, create, metaFromTable, instances: {}, DENSE };
  window.StudioCols = StudioCols;
  // The studio's page script defines how its grids are wired; it runs once the control exists
  if (typeof window.studioColsInit === "function") window.studioColsInit();
}

export const STUDIO_COLUMNS_SCRIPT = `(${studioColumnsClient.toString()})();`;
