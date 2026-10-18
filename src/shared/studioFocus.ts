// @ts-nocheck
/**
 * Focus mode for the SQLite, MySQL and PostgreSQL studios: any major section can fill the whole window.
 *
 * Sections: every tab panel (data grid, query designer, schema, macros, ...), the SQL editor, the sidebar / object tree.
 * Entry points: a "Focus" button in each section's header, a double-click on the header, and Alt+Enter (Option+Enter on a
 * Mac; Ctrl/Cmd+Shift+F is the application's own window full-screen toggle and Esc belongs to dialogs and menus, so
 * neither is used). A slim bar stays at the top with the section name, an Editor / Both / Results switch where a section has
 * an editor and a result, and an always-present "Exit focus" button.
 *
 * Nothing is moved or rebuilt: focus only toggles classes on <body>, so the grid layout, scroll position, selection and
 * the editor's text survive. The browser Fullscreen API is never used. The last focus state of each tab is remembered
 * (localStorage, per studio), so it also survives a reload.
 */

export const STUDIO_FOCUS_STYLE = `
    /* ===== Focus mode ===== */
    .sf-btn { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap; margin-left: auto; padding: 2px 9px; min-height: 24px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--cyan) 50%, transparent); background: color-mix(in srgb, var(--cyan) 10%, transparent); color: var(--cyan); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
    .sf-btn:hover { background: color-mix(in srgb, var(--cyan) 22%, transparent); }
    .sf-btn[aria-pressed="true"] { background: var(--cyan); color: var(--bg-base); }
    .sf-btn:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .view-tabs > .sf-btn { margin-left: 0; margin-right: 8px; }
    .sf-bar { display: none; }
    body.sf-on { padding-top: 38px; box-sizing: border-box; }
    body.sf-on .sf-bar { display: flex; position: fixed; z-index: 10200; top: 0; left: 0; right: 0; height: 38px; align-items: center; gap: 10px; padding: 0 12px; background: var(--bg-surface); color: var(--text-main); border-bottom: 2px solid var(--cyan); box-shadow: 0 2px 10px rgba(0,0,0,0.25); font-size: 12px; }
    .sf-bar .sf-title { font-weight: 700; display: inline-flex; gap: 6px; align-items: center; min-width: 0; }
    .sf-bar .sf-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sf-bar .sf-hint { margin-left: auto; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
    .sf-bar .sf-seg { display: inline-flex; border: 1px solid color-mix(in srgb, var(--text-main) 28%, transparent); border-radius: 6px; overflow: hidden; }
    .sf-bar .sf-seg button { border: 0; background: transparent; color: var(--text-main); font: inherit; font-size: 11px; padding: 3px 10px; cursor: pointer; }
    .sf-bar .sf-seg button + button { border-left: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); }
    .sf-bar .sf-seg button[aria-pressed="true"] { background: var(--cyan); color: var(--bg-base); font-weight: 700; }
    .sf-bar .sf-seg button:focus-visible, .sf-bar .sf-exit:focus-visible { outline: 2px solid var(--cyan); outline-offset: 1px; }
    .sf-bar .sf-exit { border: 1px solid var(--cyan); background: var(--cyan); color: var(--bg-base); border-radius: 6px; font: inherit; font-size: 11px; font-weight: 700; padding: 4px 12px; cursor: pointer; }
    .sf-bar .sf-exit:hover { filter: brightness(1.08); }
    .sf-bar .sf-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    /* what is hidden */
    body.sf-on > header, body.sf-on > .kpi-row, body.sf-on > footer, body.sf-on .view-tabs, body.sf-on .sidebar-resizer { display: none !important; }
    body.sf-on.sf-k-pane aside, body.sf-on.sf-k-editor aside { display: none !important; }
    body.sf-on.sf-k-pane.sf-m-results .editor-banner { display: none !important; }
    body.sf-on.sf-k-pane.sf-m-both .editor-banner { max-height: 45%; overflow: auto; }
    body.sf-on.sf-m-both .editor-banner.collapsed .sql-input-box, body.sf-on.sf-k-editor .editor-banner.collapsed .sql-input-box { display: flex !important; }
    body.sf-on .editor-banner #btnToggleEditor { display: none; }
    body.sf-on.sf-k-editor .tab-content, body.sf-on.sf-k-editor .tab-pane { display: none !important; }
    body.sf-on.sf-k-editor .editor-banner { flex: 1; min-height: 0; }
    body.sf-on.sf-k-editor .editor-banner .sql-input-box { flex: 1; min-height: 0; }
    body.sf-on.sf-k-editor .editor-banner .sql-textarea { flex: 1; height: auto; min-height: 120px; resize: none; }
    body.sf-on.sf-k-sidebar main, body.sf-on.sf-k-sidebar .sidebar-resizer { display: none !important; }
    body.sf-on.sf-k-sidebar aside { width: 100% !important; max-width: none !important; flex: 1; }
    body.sf-on.sf-p-tabSql .editor-banner { display: none !important; }
    body.sf-on.sf-p-tabSql.sf-m-editor #tabSql .grid-container { display: none !important; }
    body.sf-on.sf-p-tabSql.sf-m-results #tabSql .editor-section { display: none !important; }
    body.sf-on.sf-p-tabSql.sf-m-editor #tabSql .editor-section { flex: 1; min-height: 0; }
    body.sf-on.sf-p-tabSql.sf-m-editor #tabSql .sql-textarea, body.sf-on.sf-p-tabSql.sf-m-editor #tabSql textarea { height: 100% !important; }
    .sf-focused:focus { outline: none; }
    .tab-pane { position: relative; }
    .sf-btn.sf-float { position: absolute; top: 6px; right: 14px; z-index: 6; margin: 0; }
    body.sf-on .sf-btn { display: none !important; }
    @media (max-width: 720px) { .sf-bar .sf-hint { display: none; } .sf-bar .sf-seg button { padding: 3px 7px; } .sf-btn .sf-lbl { display: none; } }
    @media (prefers-reduced-motion: no-preference) { body.sf-on .sf-bar { animation: sf-in 0.12s ease-out; } @keyframes sf-in { from { transform: translateY(-100%); } to { transform: none; } } }
`;

function studioFocusClient() {
  if (window.StudioFocus || !document.body || typeof document.createElement !== "function" || typeof document.querySelectorAll !== "function") return;
  const isMac = /Mac|iPhone|iPad/i.test((navigator && (navigator.platform || navigator.userAgent)) || "");
  const KEYS = isMac ? "\u2325+Enter" : "Alt+Enter";
  const studio = /postgres/i.test(document.title) ? "postgres" : /mysql/i.test(document.title) ? "mysql" : "sqlite";
  const STORE = "bunrad.focus.v1:" + studio;
  const SPLIT_PANES = { tabGrid: 1, tabSql: 1 };
  const TIP = "Fill the window with this section; the rest is hidden. Shortcut " + KEYS + " (or double-click the section header). Exit with the Exit focus button or " + KEYS + ".";

  let state = null; // { key: "pane:<id>" | "editor" | "sidebar", mode: "editor"|"both"|"results"|null }
  let trigger = null;
  const keep = new Map();
  let store = { tabs: {} };
  try { const v = JSON.parse(window.localStorage.getItem(STORE) || "null"); if (v && v.tabs) store = v; } catch (e) {}
  const save = () => { try { window.localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {} };

  const q = (s, r) => (r || document).querySelector(s);
  const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const currentTab = () => { try { return typeof activeTab !== "undefined" ? activeTab : "grid"; } catch (e) { return "grid"; } };
  const activePane = () => q(".tab-pane.active") || q(".tab-pane");
  const tabNameOf = (pane) => {
    const id = pane && pane.id ? pane.id.replace(/^tab/, "") : "";
    const btn = id ? document.getElementById("tabBtn" + id) : null;
    const t = btn ? btn.textContent : "";
    return (t || id || "Section").replace(/^[^A-Za-z0-9]+/, "").replace(/\s+/g, " ").trim();
  };
  function sectionEl(key) {
    if (key === "editor") return q("#editorBanner, .editor-banner");
    if (key === "sidebar") return q("aside");
    return document.getElementById(key.replace(/^pane:/, ""));
  }
  function nameOf(key) {
    if (key === "editor") return "SQL editor";
    if (key === "sidebar") return "Object tree";
    return tabNameOf(sectionEl(key));
  }

  // ---- bar -----------------------------------------------------------------
  const bar = document.createElement("div");
  bar.className = "sf-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Focus mode");
  bar.innerHTML = '<div class="sf-title">\u2922 <span id="sfName"></span></div>' +
    '<div class="sf-seg" id="sfSeg" role="group" aria-label="Editor and results" hidden>' +
    '<button type="button" data-m="editor" title="Show only the SQL editor" aria-pressed="false">Editor</button>' +
    '<button type="button" data-m="both" title="Show the editor and the results together" aria-pressed="false">Both</button>' +
    '<button type="button" data-m="results" title="Show only the results" aria-pressed="false">Results</button></div>' +
    '<span class="sf-hint" id="sfHint"></span>' +
    '<button type="button" class="sf-exit" id="sfExit" title="Leave focus mode and show the whole studio again (' + KEYS + ')" aria-label="Exit focus mode">\u2715 Exit focus</button>' +
    '<span class="sf-live" id="sfLive" role="status" aria-live="polite"></span>';
  document.body.appendChild(bar);
  bar.querySelector("#sfHint").textContent = KEYS + " toggles";
  bar.querySelector("#sfExit").addEventListener("click", () => exit());
  bar.querySelector("#sfSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-m]"); if (b) setMode(b.dataset.m); });
  bar.querySelector(".sf-title").addEventListener("dblclick", () => exit());

  // ---- scroll positions survive hidden/shown regions ------------------------
  const SCROLLERS = ".grid-scroll, .object-tree, aside, .tab-pane, .sql-textarea, .designer-layout, .schema-layout, .macro-layout";
  function snapshot() { keep.clear(); qa(SCROLLERS).forEach((el) => { if (el.scrollTop || el.scrollLeft) keep.set(el, [el.scrollTop, el.scrollLeft]); }); }
  function restore() { const apply = () => keep.forEach((v, el) => { if (el.isConnected) { el.scrollTop = v[0]; el.scrollLeft = v[1]; } }); apply(); requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); }); }

  // ---- apply ----------------------------------------------------------------
  const CLS = /^sf-(k|m|p)-/;
  function paint() {
    const b = document.body;
    Array.from(b.classList).filter((c) => CLS.test(c)).forEach((c) => b.classList.remove(c));
    qa(".sf-focused").forEach((n) => n.classList.remove("sf-focused"));
    if (!state) {
      b.classList.remove("sf-on");
    } else {
      b.classList.add("sf-on");
      const kind = state.key === "editor" ? "editor" : state.key === "sidebar" ? "sidebar" : "pane";
      b.classList.add("sf-k-" + kind);
      if (kind === "pane") b.classList.add("sf-p-" + state.key.replace(/^pane:/, ""));
      if (state.mode) b.classList.add("sf-m-" + state.mode);
      const el = sectionEl(state.key);
      if (el) el.classList.add("sf-focused");
    }
    syncUi();
    requestAnimationFrame(() => { try { window.dispatchEvent(new Event("resize")); } catch (e) {} });
  }

  function splitApplies() {
    if (!state) return false;
    if (state.key === "editor") return true;
    const id = state.key.replace(/^pane:/, "");
    return !!SPLIT_PANES[id];
  }
  function syncUi() {
    const on = !!state;
    bar.hidden = !on;
    if (on) {
      bar.querySelector("#sfName").textContent = "Focus: " + nameOf(state.key);
      const seg = bar.querySelector("#sfSeg");
      seg.hidden = !splitApplies();
      const m = state.key === "editor" ? "editor" : state.mode || (state.key === "pane:tabSql" ? "both" : "results");
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.m === m)));
      bar.querySelector("#sfLive").textContent = "Focus mode: " + nameOf(state.key) + ". Press " + KEYS + " or the Exit focus button to leave.";
    } else {
      bar.querySelector("#sfLive").textContent = "";
    }
    const ap = activePane();
    qa(".sf-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sfRole === "active" ? !!state && !!ap && state.key === "pane:" + ap.id : pressedFor(b))));
  }

  function remember() {
    const t = currentTab();
    if (state) store.tabs[t] = { key: state.key, mode: state.mode || null };
    else delete store.tabs[t];
    save();
  }

  function enter(key, mode, opts) {
    opts = opts || {};
    if (!sectionEl(key)) return false;
    if (!state && !opts.silent) trigger = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const was = !!state;
    if (!was) snapshot();
    state = { key, mode: mode || (key === "pane:tabSql" ? "both" : key.indexOf("pane:") === 0 && SPLIT_PANES[key.replace(/^pane:/, "")] ? "results" : null) };
    paint();
    if (!was) restore();
    if (!opts.silent) {
      const el = sectionEl(key);
      if (el) { if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); try { el.focus({ preventScroll: true }); } catch (e) {} }
    }
    remember();
    return true;
  }

  function exit(opts) {
    opts = opts || {};
    if (!state) return;
    snapshot();
    const key = state.key;
    state = null;
    paint();
    restore();
    remember();
    if (!opts.silent) {
      let t = trigger && trigger.isConnected && trigger.offsetParent !== null ? trigger : null;
      if (!t) t = q('.sf-btn[data-sf-key="' + key + '"]') || q(".sf-btn[data-sf-role=active]");
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) {} }
    }
    trigger = null;
  }

  function toggle(key) { if (state && state.key === key) exit(); else enter(key); }

  function setMode(m) {
    if (!state) return;
    const id = state.key.replace(/^pane:/, "");
    if (state.key === "pane:tabSql") { state.mode = m; paint(); remember(); return; }
    if (state.key === "editor") {
      if (m === "editor") return;
      // back to the pane that was showing: Both / Results
      const pane = activePane();
      if (pane) { state = { key: "pane:" + pane.id, mode: m }; paint(); remember(); }
      return;
    }
    if (m === "editor") { state = { key: "editor", mode: null }; paint(); remember(); return; }
    state.mode = m; paint(); remember();
  }

  // ---- buttons in the section headers ----------------------------------------
  const pressedFor = (b) => !!state && b.dataset.sfKey === state.key && (!b.dataset.sfMode || b.dataset.sfMode === state.mode);
  function mkBtn(key, label, mode, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sf-btn";
    b.dataset.sfKey = key;
    if (mode) b.dataset.sfMode = mode;
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", "Focus " + label);
    b.title = TIP;
    b.innerHTML = '\u2922 <span class="sf-lbl">Focus</span>';
    b.addEventListener("click", (e) => { e.stopPropagation(); if (onClick) return onClick(); if (pressedFor(b)) exit(); else enter(key, mode); });
    return b;
  }
  const has = (root, key, mode) => !!root.querySelector('.sf-btn[data-sf-key="' + key + '"]' + (mode ? '[data-sf-mode="' + mode + '"]' : ":not([data-sf-mode])"));
  function inject() {
    const tabs = q(".view-tabs");
    if (tabs && !q(".sf-btn[data-sf-role=active]", tabs)) {
      const b = mkBtn("pane:__active", "the current section", null, () => { const p = activePane(); if (p) toggle("pane:" + p.id); });
      b.dataset.sfRole = "active";
      tabs.insertBefore(b, tabs.firstChild);
    }
    const top = q(".editor-banner .editor-top");
    if (top && !has(top, "editor")) top.appendChild(mkBtn("editor", "the SQL editor"));
    const side = q("aside .sidebar-db-card");
    if (side && !has(side, "sidebar")) { const b = mkBtn("sidebar", "the object tree"); b.style.marginLeft = "8px"; (side.firstElementChild || side).appendChild(b); }
    qa(".tab-pane").forEach((p) => {
      const key = "pane:" + p.id;
      const name = tabNameOf(p);
      const heads = [];
      if (p.id === "tabSql") {
        const e = q(".editor-section .editor-toolbar", p); if (e) heads.push([e, "editor", "SQL editor"]);
        const r = q(".grid-container .grid-toolbar", p); if (r) heads.push([r, "results", "query results"]);
      } else {
        const h = q(".qbe-ribbon, .macro-ribbon, .grid-toolbar, .activity-toolbar, .studio-schema-subnav", p);
        if (h) heads.push([h, null, name]);
      }
      if (!heads.length) {
        // panes without a header row get a small button in their corner
        if (!has(p, key)) { const b = mkBtn(key, name); b.classList.add("sf-float"); p.appendChild(b); }
        return;
      }
      heads.forEach(([h, mode, label]) => { if (!has(h, key, mode)) { qa(":scope > .sf-float", p).forEach((f) => f.remove()); h.appendChild(mkBtn(key, label, mode)); } });
    });
    syncUi();
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; inject(); }); };
  const content = q(".tab-content") || document.body;
  new MutationObserver(schedule).observe(content, { childList: true, subtree: true });
  const aside = q("aside");
  if (aside) new MutationObserver(schedule).observe(aside, { childList: true });
  inject();

  // ---- double-click on a header, keyboard ------------------------------------
  const INTERACTIVE = "button, input, select, textarea, a, label, [contenteditable], .tab-btn:not(.active), th, td";
  document.addEventListener("dblclick", (e) => {
    const t = e.target;
    if (!t || !t.closest || t.closest(INTERACTIVE) && !t.closest(".tab-btn.active")) return;
    if (t.closest(".sf-bar")) return;
    if (t.closest(".tab-btn.active")) { const p = activePane(); if (p) toggle("pane:" + p.id); return; }
    if (t.closest(".editor-top")) return toggle("editor");
    if (t.closest(".sidebar-db-card")) return toggle("sidebar");
    const head = t.closest(".grid-toolbar, .activity-toolbar, .qbe-ribbon, .macro-ribbon, .studio-schema-subnav");
    if (head) { const p = head.closest(".tab-pane"); if (p) toggle("pane:" + p.id); }
  });

  window.addEventListener("keydown", (e) => {
    if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "Enter")) return;
    if (window.StudioDialogs && window.StudioDialogs.isOpen && window.StudioDialogs.isOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (state) return exit();
    const a = document.activeElement;
    if (a && a.closest && a.closest("aside")) return enter("sidebar");
    if (a && a.closest && a.closest(".editor-banner")) return enter("editor");
    const p = activePane();
    if (p) enter("pane:" + p.id);
  }, true);

  // ---- per-tab memory: switching tab applies that tab's last state -----------
  function wrapSwitch() {
    const orig = window.switchTab;
    if (typeof orig !== "function" || orig.__sf) return;
    const w = function (id) {
      const r = orig.apply(this, arguments);
      const mem = store.tabs[id];
      if (mem && sectionEl(mem.key)) enter(mem.key, mem.mode, { silent: true });
      else if (state) exit({ silent: true });
      return r;
    };
    w.__sf = true;
    window.switchTab = w;
  }
  wrapSwitch();

  // restore after the page's own start-up (which may pick the tab from the URL)
  function restoreInitial() {
    const mem = store.tabs[currentTab()];
    if (mem && !state && sectionEl(mem.key)) enter(mem.key, mem.mode, { silent: true });
  }
  setTimeout(restoreInitial, 0);
  window.addEventListener("load", () => setTimeout(restoreInitial, 50));

  if (window.StudioShortcuts) {
    window.StudioShortcuts.add("Focus mode", "Alt+Enter", "Focus the section under the cursor (data grid, editor, designer, tree, ...) / leave focus mode. Option+Enter on a Mac");
    window.StudioShortcuts.add("Focus mode", "Dbl-click", "Double-click a section header to focus it");
  }

  window.StudioFocus = {
    enter, exit, toggle, setMode, keys: KEYS,
    get state() { return state ? { key: state.key, mode: state.mode } : null; },
    isOn: () => !!state,
  };
}

export const STUDIO_FOCUS_SCRIPT = `(${studioFocusClient.toString()})();`;
