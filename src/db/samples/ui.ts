// @ts-nocheck
/**
 * The "Sample databases" dialog, shared by the SQLite, MySQL and PostgreSQL studios.
 *
 * `samplesClientMain` is serialised with Function.toString() and executed in the studio page (like the CRUD layer), so it only
 * uses browser globals plus a few optional globals of the host page (showToast, refreshAll, loadSchema, loadKpis, switchTab,
 * queryDesignerState). It never uses the browser full-screen API and never contacts anything except the studio's own /api/samples/*.
 */

export const SAMPLES_STYLE = `
    /* ===== Sample databases dialog ===== */
    .sdb-overlay { position: fixed; inset: 0; z-index: 10060; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(3, 7, 18, 0.78); backdrop-filter: blur(6px); }
    .sdb-overlay.open { display: flex; }
    .sdb-card { width: min(1180px, 100%); height: min(780px, 100%); display: flex; flex-direction: column; background: var(--bg-surface, #0e1526); color: var(--text-main, #f8fafc); border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 14px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.7); overflow: hidden; font-family: var(--font-sans, system-ui, sans-serif); font-size: 13px; }
    .sdb-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.1)); }
    .sdb-head h2 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; }
    .sdb-x { background: transparent; border: 1px solid transparent; color: inherit; font-size: 18px; line-height: 1; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; }
    .sdb-x:hover, .sdb-x:focus-visible { border-color: var(--border-focus, #38bdf8); background: rgba(56,189,248,.12); outline: none; }
    .sdb-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.1)); }
    .sdb-search { flex: 1 1 220px; min-width: 160px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); background: var(--bg-card, rgba(15,23,42,.6)); color: inherit; font: inherit; }
    .sdb-search:focus, .sdb-input:focus, .sdb-select:focus { outline: 2px solid var(--border-focus, #38bdf8); outline-offset: 1px; }
    .sdb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .sdb-chip { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); background: transparent; color: var(--text-muted, #94a3b8); font: inherit; font-size: 11px; cursor: pointer; }
    .sdb-chip[aria-pressed="true"] { background: var(--cyan, #38bdf8); border-color: var(--cyan, #38bdf8); color: #04121f; font-weight: 700; }
    .sdb-chip:focus-visible { outline: 2px solid var(--border-focus, #38bdf8); outline-offset: 1px; }
    .sdb-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 42%) 1fr; }
    .sdb-grid { overflow: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; align-content: start; border-right: 1px solid var(--border-subtle, rgba(255,255,255,.1)); }
    .sdb-item { text-align: left; display: flex; flex-direction: column; gap: 5px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--border-subtle, rgba(255,255,255,.12)); background: var(--bg-card, rgba(15,23,42,.6)); color: inherit; font: inherit; cursor: pointer; min-height: 132px; }
    .sdb-item:hover { border-color: var(--cyan, #38bdf8); }
    .sdb-item:focus-visible { outline: 2px solid var(--border-focus, #38bdf8); outline-offset: 2px; }
    .sdb-item[aria-selected="true"] { border-color: var(--cyan, #38bdf8); box-shadow: 0 0 0 1px var(--cyan, #38bdf8) inset, 0 0 18px var(--cyan-glow, rgba(56,189,248,.2)); }
    .sdb-item-title { font-weight: 700; font-size: 13px; }
    .sdb-item-tag { font-size: 11px; color: var(--text-muted, #94a3b8); line-height: 1.35; }
    .sdb-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }
    .sdb-badge { font-size: 10px; padding: 2px 7px; border-radius: 999px; background: rgba(148,163,184,.16); color: var(--text-muted, #94a3b8); white-space: nowrap; }
    .sdb-badge.syn { background: rgba(251,191,36,.16); color: var(--amber, #fbbf24); font-weight: 600; }
    .sdb-badge.dom { background: rgba(56,189,248,.14); color: var(--cyan, #38bdf8); }
    .sdb-detail { overflow: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .sdb-detail h3 { margin: 0; font-size: 17px; }
    .sdb-detail p { margin: 0; line-height: 1.5; color: var(--text-muted, #94a3b8); }
    .sdb-sec { border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 10px; }
    .sdb-sec > summary { cursor: pointer; padding: 8px 12px; font-weight: 600; font-size: 12px; }
    .sdb-sec > summary:focus-visible { outline: 2px solid var(--border-focus, #38bdf8); outline-offset: -2px; border-radius: 10px; }
    .sdb-sec-body { padding: 4px 12px 10px; }
    .sdb-tables { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 2px 14px; font-size: 12px; }
    .sdb-tables div { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; border-bottom: 1px dotted var(--border-subtle, rgba(255,255,255,.08)); }
    .sdb-tables span:last-child { color: var(--text-dim, #64748b); font-variant-numeric: tabular-nums; }
    .sdb-rel { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-muted, #94a3b8); columns: 2 240px; }
    .sdb-q { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px dotted var(--border-subtle, rgba(255,255,255,.08)); }
    .sdb-q-text { flex: 1; min-width: 0; }
    .sdb-q-text b { display: block; font-size: 12px; }
    .sdb-q-text span { color: var(--text-muted, #94a3b8); font-size: 11px; }
    .sdb-foot { max-height: 58%; overflow: auto; border-top: 1px solid var(--border-subtle, rgba(255,255,255,.1)); padding: 10px 16px; display: grid; gap: 8px; background: var(--bg-card, rgba(15,23,42,.5)); }
    .sdb-row { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
    .sdb-row label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
    .sdb-scale { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .sdb-scale label { padding: 4px 10px; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); border-radius: 8px; }
    .sdb-scale label:has(input:checked) { border-color: var(--cyan, #38bdf8); background: rgba(56,189,248,.12); }
    .sdb-scale label:has(input:focus-visible) { outline: 2px solid var(--border-focus, #38bdf8); }
    .sdb-input, .sdb-select { padding: 6px 9px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); background: var(--bg-surface, #0e1526); color: inherit; font: inherit; min-width: 220px; }
    .sdb-note { font-size: 11px; color: var(--text-muted, #94a3b8); line-height: 1.45; }
    .sdb-warn { color: var(--amber, #fbbf24); }
    .sdb-err { color: var(--rose, #f43f5e); font-weight: 600; }
    .sdb-ok { color: var(--emerald, #10b981); font-weight: 600; }
    .sdb-btn { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,.18)); background: var(--bg-card, rgba(30,41,59,.8)); color: inherit; font: inherit; cursor: pointer; }
    .sdb-btn:hover:not([disabled]) { border-color: var(--cyan, #38bdf8); }
    .sdb-btn:focus-visible { outline: 2px solid var(--border-focus, #38bdf8); outline-offset: 2px; }
    .sdb-btn[disabled] { opacity: .45; cursor: not-allowed; }
    .sdb-btn.primary { background: var(--cyan, #38bdf8); border-color: var(--cyan, #38bdf8); color: #04121f; font-weight: 700; }
    .sdb-bar { height: 8px; border-radius: 999px; background: rgba(148,163,184,.2); overflow: hidden; }
    .sdb-bar > div { height: 100%; width: 0; background: linear-gradient(90deg, var(--cyan, #38bdf8), var(--emerald, #10b981)); transition: width .25s ease; }
    .sdb-qpanel { display: grid; gap: 6px; padding: 8px 10px; border: 1px solid var(--border-subtle, rgba(255,255,255,.14)); border-radius: 10px; }
    .sdb-qpanel .sdb-select { flex: 1 1 260px; min-width: 0; }
    .sdb-qtable { max-height: 150px; overflow: auto; border: 1px solid var(--border-subtle, rgba(255,255,255,.1)); border-radius: 8px; }
    .sdb-qtable table { border-collapse: collapse; width: 100%; font-size: 11px; }
    .sdb-qtable th, .sdb-qtable td { padding: 3px 8px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.08)); }
    .sdb-qlines { max-height: 120px; overflow: auto; font-size: 11px; }
    .sdb-empty { padding: 24px; color: var(--text-muted, #94a3b8); text-align: center; grid-column: 1 / -1; }
    .sdb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 860px) {
      .sdb-body { grid-template-columns: 1fr; grid-template-rows: minmax(170px, 38%) 1fr; }
      .sdb-grid { border-right: 0; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,.1)); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
      .sdb-item { min-height: 96px; }
      .sdb-input, .sdb-select { min-width: 0; width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .sdb-bar > div { transition: none; } }
`;

export function samplesClientMain(cfg) {
  var S = { catalog: null, selected: null, scale: "small", tag: "", query: "", job: null, poll: null, lastResult: null, open: false, opener: null, queryText: "" };
  var overlay = null, el = {};

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    if (kids) for (var i = 0; i < kids.length; i++) { var c = kids[i]; if (c === null || c === undefined || c === false) continue; n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString(); }
  function toast(msg) { try { if (typeof showToast === "function") showToast(msg); } catch (e) {} }
  async function api(path, body) {
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "GET" };
    var res = await fetch(path, opts);
    var data = await res.json().catch(function () { return { success: false, error: "HTTP " + res.status }; });
    data._status = res.status;
    return data;
  }
  function kindWord() { return cfg.studio === "sqlite" ? "file" : cfg.studio === "mysql" ? "database" : "schema"; }
  function selectedEntry() { return S.catalog && S.catalog.datasets.find(function (d) { return d.id === S.selected; }); }

  // ---------------------------------------------------------------------------------------------- build the dialog
  function build() {
    if (overlay) return;
    el.title = h("h2", { id: "sdbTitle", text: "Sample databases" });
    el.close = h("button", { class: "sdb-x", type: "button", title: "Close (Esc)", "aria-label": "Close the sample databases dialog", onclick: close, text: "×" });
    el.search = h("input", { class: "sdb-search", type: "search", placeholder: "Search sample databases…", "aria-label": "Search sample databases", title: "Filter by name, topic or feature", oninput: function (e) { S.query = e.target.value.toLowerCase(); renderGrid(); } });
    el.chips = h("div", { class: "sdb-chips", role: "group", "aria-label": "Filter by domain" });
    el.grid = h("div", { class: "sdb-grid", role: "listbox", "aria-label": "Sample databases", "aria-orientation": "vertical" });
    el.detail = h("div", { class: "sdb-detail", id: "sdbDetail", "aria-live": "polite" });
    el.foot = h("div", { class: "sdb-foot" });
    var card = h("div", { class: "sdb-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "sdbTitle" }, [
      h("div", { class: "sdb-head" }, [el.title, h("span", { class: "sdb-badge syn", title: "Every row is generated; none of it is real", text: "Synthetic data" }), el.close]),
      h("div", { class: "sdb-tools" }, [el.search, el.chips]),
      h("div", { class: "sdb-body" }, [el.grid, el.detail]),
      el.foot,
    ]);
    overlay = h("div", { class: "sdb-overlay", id: "sdbOverlay" }, [card]);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay && !(S.job && S.job.status === "running")) close(); });
    overlay.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", function (e) {
      if (S.open && e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); if (!(S.job && S.job.status === "running")) close(); }
    }, true);
  }

  function focusables() {
    return Array.prototype.filter.call(overlay.querySelectorAll("button, input, select, summary, [tabindex]"), function (n) { return !n.disabled && n.tabIndex >= 0 && n.offsetParent !== null; });
  }
  function onKey(e) {
    if (e.key === "Tab") {
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function gridKeys(e) {
    var items = Array.prototype.slice.call(el.grid.querySelectorAll(".sdb-item"));
    var i = items.indexOf(document.activeElement);
    if (i < 0) return;
    var cols = 1;
    if (items.length > 1) { var top = items[0].offsetTop; cols = items.filter(function (n) { return n.offsetTop === top; }).length || 1; }
    var next = i;
    if (e.key === "ArrowRight") next = i + 1; else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown") next = i + cols; else if (e.key === "ArrowUp") next = i - cols;
    else if (e.key === "Home") next = 0; else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(items.length - 1, next));
    items.forEach(function (n, k) { n.tabIndex = k === next ? 0 : -1; });
    items[next].focus();
  }

  // ---------------------------------------------------------------------------------------------- rendering
  function matches(d) {
    if (S.tag && d.tags.indexOf(S.tag) < 0) return false;
    if (!S.query) return true;
    var hay = (d.title + " " + d.tagline + " " + d.tags.join(" ") + " " + d.highlights.join(" ") + " " + d.tables.map(function (t) { return t.name; }).join(" ")).toLowerCase();
    return S.query.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function renderChips() {
    var tags = {};
    S.catalog.datasets.forEach(function (d) { d.tags.forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var names = Object.keys(tags).sort();
    el.chips.textContent = "";
    el.chips.appendChild(h("button", { class: "sdb-chip", type: "button", "aria-pressed": S.tag === "" ? "true" : "false", onclick: function () { S.tag = ""; renderChips(); renderGrid(); }, text: "All (" + S.catalog.datasets.length + ")" }));
    names.forEach(function (t) { el.chips.appendChild(h("button", { class: "sdb-chip", type: "button", "aria-pressed": S.tag === t ? "true" : "false", onclick: function () { S.tag = S.tag === t ? "" : t; renderChips(); renderGrid(); }, title: "Show only " + t, text: t })); });
  }
  function renderGrid() {
    var list = S.catalog.datasets.filter(matches);
    el.grid.textContent = "";
    if (!list.length) { el.grid.appendChild(h("div", { class: "sdb-empty", text: "No sample database matches. Clear the search or the domain filter." })); return; }
    if (!list.some(function (d) { return d.id === S.selected; })) { S.selected = list[0].id; renderDetail(); renderFoot(); }
    list.forEach(function (d) {
      var sel = d.id === S.selected;
      var b = h("button", { class: "sdb-item", type: "button", role: "option", "aria-selected": sel ? "true" : "false", tabindex: sel ? "0" : "-1", "data-id": d.id,
        title: d.title + " - " + d.tableCount + " tables, " + d.viewCount + " views", onclick: function () { choose(d.id); }, onkeydown: gridKeys }, [
        h("span", { class: "sdb-item-title", text: d.title }),
        h("span", { class: "sdb-item-tag", text: d.tagline }),
        h("span", { class: "sdb-meta" }, [
          h("span", { class: "sdb-badge", text: d.tableCount + " tables" }), h("span", { class: "sdb-badge", text: d.viewCount + " views" }),
          h("span", { class: "sdb-badge", title: "Rows at Small / Medium / Large", text: fmt(d.rows.small) + " / " + fmt(d.rows.medium) + " / " + fmt(d.rows.large) + " rows" }),
        ]),
        h("span", { class: "sdb-meta" }, [h("span", { class: "sdb-badge syn", text: "Synthetic data" })].concat(d.tags.slice(0, 2).map(function (t) { return h("span", { class: "sdb-badge dom", text: t }); }))),
      ]);
      el.grid.appendChild(b);
    });
  }
  function choose(id) {
    if (S.job && S.job.status === "running") return;
    S.selected = id; S.lastResult = null; S.job = null; S.qsel = "all"; S.qresult = null; S.qerror = "";
    Array.prototype.forEach.call(el.grid.querySelectorAll(".sdb-item"), function (n) { var on = n.getAttribute("data-id") === id; n.setAttribute("aria-selected", on ? "true" : "false"); n.tabIndex = on ? 0 : -1; });
    renderDetail(); renderFoot();
  }
  function section(title, body, open) { var d = h("details", { class: "sdb-sec" }, [h("summary", { text: title }), h("div", { class: "sdb-sec-body" }, [body])]); if (open) d.setAttribute("open", ""); return d; }
  function renderDetail() {
    var d = selectedEntry();
    el.detail.textContent = "";
    if (!d) return;
    var tables = h("div", { class: "sdb-tables" }, d.tables.map(function (t) { return h("div", { title: t.comment }, [h("span", { text: t.name }), h("span", { text: fmt(t.rows[S.scale]) })]); }));
    var rels = h("div", { class: "sdb-rel" }, d.relationships.map(function (r) { return h("div", { text: r.from + " → " + r.to }); }));
    var views = h("div", { class: "sdb-tables" }, d.views.map(function (v) { return h("div", { title: v.comment }, [h("span", { text: v.name }), h("span", { text: "view" })]); }));
    var queries = h("div", {}, d.queries.map(function (q) {
      return h("div", { class: "sdb-q" }, [h("div", { class: "sdb-q-text" }, [h("b", { text: q.title }), h("span", { text: q.description })])]);
    }));
    queries.appendChild(h("p", { class: "sdb-note", text: "Create the sample first; then you can open these in the SQL editor or run them from this window. They only read data (SELECT)." }));
    el.detail.appendChild(h("div", {}, [h("h3", { text: d.title }), h("div", { class: "sdb-meta", style: "margin-top:6px" }, [h("span", { class: "sdb-badge syn", text: "Synthetic data" })].concat(d.tags.map(function (t) { return h("span", { class: "sdb-badge dom", text: t }); })))]));
    el.detail.appendChild(h("p", { text: d.description }));
    if (d.highlights.length) el.detail.appendChild(h("div", { class: "sdb-meta" }, d.highlights.map(function (x) { return h("span", { class: "sdb-badge", text: x }); })));
    el.detail.appendChild(section("Tables (" + d.tableCount + ") - rows at " + S.scale, tables, true));
    el.detail.appendChild(section("Views (" + d.viewCount + ")", views, false));
    el.detail.appendChild(section("Relationships (" + d.relationships.length + ")", rels, false));
    el.detail.appendChild(section("Example queries (" + d.queries.length + ", read-only)", queries, true));
    el.detail.appendChild(h("p", { class: "sdb-note", text: d.syntheticNotice }));
  }

  function renderFoot() {
    var d = selectedEntry();
    el.foot.textContent = "";
    if (!d) return;
    var running = S.job && S.job.status === "running";
    var done = S.job && S.job.status === "done";
    var scales = h("div", { class: "sdb-scale", role: "radiogroup", "aria-label": "Amount of data" }, ["small", "medium", "large"].map(function (sc) {
      var r = h("input", { type: "radio", name: "sdbScale", value: sc, checked: S.scale === sc ? "checked" : null, disabled: running ? "disabled" : null, onchange: function () { S.scale = sc; renderDetail(); renderFoot(); } });
      if (S.scale === sc) r.checked = true;
      return h("label", { title: fmt(d.rows[sc]) + " rows, about " + d.estimatedSeconds[sc] + " s" }, [r, document.createTextNode(sc.charAt(0).toUpperCase() + sc.slice(1) + " · " + fmt(d.rows[sc]) + " rows · ~" + d.estimatedSeconds[sc] + " s")]);
    }));
    var host = S.catalog.host || {};
    var def = (S.catalog.defaultTargets || {})[d.id] || "";
    var where = S.where || "new";
    el.target = h("input", { class: "sdb-input", id: "sdbTarget", type: "text", value: S.targetFor === d.id ? S.target : def, "aria-label": "Name of the new " + kindWord(), title: "Name of the new " + kindWord(), spellcheck: "false", disabled: running || where === "current" ? "disabled" : null, oninput: function (e) { S.target = e.target.value; S.targetFor = d.id; } });
    if (S.targetFor !== d.id) { S.target = def; }
    var rows = [h("div", { class: "sdb-row" }, [h("strong", { text: "Amount of data" }), scales])];
    var targetRow = [h("label", { for: "sdbTarget" }, [h("strong", { text: cfg.studio === "sqlite" ? "New file name" : cfg.studio === "mysql" ? "New database name" : "New schema name" })]), el.target];
    if (cfg.studio === "sqlite" && host.supportsCurrent) {
      targetRow.unshift(h("span", { class: "sdb-scale", role: "radiogroup", "aria-label": "Where to create the sample" }, [
        h("label", { title: "Creates a brand-new .sqlite file in " + host.sampleDir }, [h("input", { type: "radio", name: "sdbWhere", checked: where === "new" ? "checked" : null, disabled: running ? "disabled" : null, onchange: function () { S.where = "new"; renderFoot(); } }), document.createTextNode("New .sqlite file")]),
        h("label", { title: "Adds the sample's tables to the database that is open now (refused if any name already exists)" }, [h("input", { type: "radio", name: "sdbWhere", checked: where === "current" ? "checked" : null, disabled: running ? "disabled" : null, onchange: function () { S.where = "current"; renderFoot(); } }), document.createTextNode("Open database")]),
      ]));
    }
    rows.push(h("div", { class: "sdb-row" }, targetRow));
    var replaceBox = h("input", { type: "checkbox", id: "sdbReplace", disabled: running ? "disabled" : null, onchange: function (e) { S.replace = e.target.checked; renderFoot(); } });
    replaceBox.checked = !!S.replace;
    var confirmBox = h("input", { type: "checkbox", id: "sdbConfirm", onchange: function (e) { S.confirm = e.target.checked; renderFoot(); } });
    confirmBox.checked = !!S.confirm;
    rows.push(h("div", { class: "sdb-row" }, [h("label", { title: "Only for a " + kindWord() + " that already holds this very sample" }, [replaceBox, document.createTextNode("Replace the sample's tables if it already exists")])]
      .concat(S.replace ? [h("label", { class: "sdb-warn" }, [confirmBox, document.createTextNode("I understand: only this sample's own tables and views are dropped and recreated; nothing else is touched")])] : [])));
    var note = cfg.studio === "sqlite"
      ? (where === "current" ? "Adds " + d.tableCount + " tables and " + d.viewCount + " views to the open database. If any name is already used, nothing is changed. Large samples block the studio for a few seconds." : "Creates a brand-new file in " + (host.sampleDir || "the samples folder") + ". An existing file is never overwritten.")
      : cfg.studio === "mysql" ? "Creates a brand-new database. Existing databases and their tables are never changed; a name that is already taken is refused."
      : "Creates a brand-new schema in the current database. Existing schemas and their tables are never changed; a name that is already taken is refused.";
    rows.push(h("div", { class: "sdb-note", text: note }));
    el.msg = h("div", { id: "sdbMsg", role: "status", "aria-live": "polite", class: "sdb-note" });
    el.bar = h("div", { class: "sdb-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0", "aria-label": "Creation progress", style: running || done ? "" : "display:none" }, [h("div", {})]);
    var actions = [];
    if (done) {
      actions.push(h("button", { class: "sdb-btn primary", type: "button", id: "sdbOpenIt", title: "Switch the studio to the new sample", onclick: openIt, text: "Open it" }));
      actions.push(h("button", { class: "sdb-btn", type: "button", onclick: close, text: "Close" }));
    } else if (running) {
      actions.push(h("button", { class: "sdb-btn", type: "button", id: "sdbCancel", title: "Stop and remove everything created so far", onclick: cancelJob, text: "Cancel" }));
    } else {
      actions.push(h("button", { class: "sdb-btn primary", type: "button", id: "sdbCreate", title: "Create the sample database", disabled: S.replace && !S.confirm ? "disabled" : null, onclick: create, text: "Create sample database" }));
      actions.push(h("button", { class: "sdb-btn", type: "button", onclick: close, text: "Close" }));
    }
    // Once the sample exists the set-up controls are not needed any more: leave room for the example queries.
    if (done) rows = [];
    rows.push(el.bar, el.msg);
    if (done) rows.push(queryPanel());
    rows.push(h("div", { class: "sdb-row" }, actions));
    rows.forEach(function (r) { el.foot.appendChild(r); });
    paintJob();
  }

  function paintJob() {
    var j = S.job;
    if (!el.msg) return;
    el.msg.className = "sdb-note";
    if (!j) { el.msg.textContent = S.error || ""; if (S.error) el.msg.className = "sdb-err"; return; }
    if (j.status === "running") {
      var inner = el.bar.firstChild; inner.style.width = (j.percent || 0) + "%"; el.bar.setAttribute("aria-valuenow", String(j.percent || 0));
      el.msg.textContent = (j.percent || 0) + "% - " + (j.phase === "data" && j.table ? "loading " + j.table : j.phase) + " (" + fmt(j.rowsDone || 0) + " of " + fmt(j.rowsTotal || 0) + " rows)";
    } else if (j.status === "done") {
      el.bar.firstChild.style.width = "100%"; el.bar.setAttribute("aria-valuenow", "100");
      var r = j.result || {};
      el.msg.className = "sdb-ok";
      el.msg.textContent = "Created " + r.tables + " tables, " + r.views + " views and " + fmt(r.rows) + " rows in " + (r.elapsedMs / 1000).toFixed(1) + " s - " + kindWord() + " " + (r.target || j.target);
    } else if (j.status === "cancelled") { el.msg.textContent = "Cancelled. Everything that was created has been removed."; }
    else { el.msg.className = "sdb-err"; el.msg.textContent = j.error || "Failed"; }
  }

  // ---------------------------------------------------------------------------------------------- actions
  async function create() {
    var d = selectedEntry(); if (!d) return;
    S.error = ""; S.qsel = "all"; S.qresult = null; S.qerror = "";
    var where = S.where || "new";
    var body = { datasetId: d.id, scale: S.scale, mode: S.replace ? "replace-sample-tables" : "new", confirm: !!(S.replace && S.confirm), target: where === "current" ? "current" : (S.target || "").trim() };
    var res = await api("/api/samples/seed", body);
    if (!res.success) { S.error = (res.error || "Could not start") + (res.code ? "" : ""); S.job = null; renderFoot(); return; }
    S.job = { id: res.jobId, status: "running", percent: 0, phase: "starting", target: res.target, rowsDone: 0, rowsTotal: d.rows[S.scale] };
    renderFoot();
    S.poll = setInterval(poll, 350);
    poll();
  }
  async function poll() {
    if (!S.job) return;
    var j = await api("/api/samples/job?id=" + encodeURIComponent(S.job.id));
    if (!j.success) { clearInterval(S.poll); S.job = { status: "error", error: j.error || "Lost the job" }; renderFoot(); return; }
    S.job = j;
    if (j.status !== "running") { clearInterval(S.poll); S.poll = null; renderFoot(); var b = document.getElementById(j.status === "done" ? "sdbOpenIt" : "sdbCreate"); if (b) b.focus(); toast(j.status === "done" ? "Sample database created" : j.status === "cancelled" ? "Sample creation cancelled" : "Sample creation failed"); }
    else paintJob();
  }
  async function cancelJob() { if (S.job) await api("/api/samples/cancel", { jobId: S.job.id }); }
  async function openIt() {
    var j = S.job; if (!j || !j.result) return;
    var res = await api("/api/samples/open", { target: j.result.target, datasetId: j.datasetId });
    if (!res.success) { S.job = Object.assign({}, j, { status: "error", error: res.error || "Could not open it" }); renderFoot(); return; }
    toast("Opened " + (res.path || j.result.target));
    await refreshStudio();
    close();
  }
  /** Makes the studio redraw for the database it was just switched to (and forget the table of the previous one). */
  async function refreshStudio() {
    try { if (typeof activeTable !== "undefined") activeTable = null; } catch (e) {}
    try { if (typeof refreshAll === "function") await refreshAll(); else { if (typeof loadSchema === "function") await loadSchema(); if (typeof loadKpis === "function") await loadKpis(); } } catch (e) {}
    try { if (typeof loadWorkspaceDatabases === "function") loadWorkspaceDatabases(); } catch (e) {}
  }

  // ---------------------------------------------------------------------------------------------- example queries
  function editors() { return ["sqlEditor", "sqlEditorTextarea"].map(function (id) { return document.getElementById(id); }).filter(Boolean); }
  function showSql() { try { if (typeof switchTab === "function") switchTab("sql"); } catch (e) {} }
  function chosenQueries(d) {
    var v = S.qsel || "all";
    if (v === "all") return d.queries;
    return d.queries.filter(function (q) { return q.id === v; });
  }
  function queryText(q) { return "-- " + q.title + "\n-- " + q.description + "\n" + q.sql.replace(/;\s*$/, "") + ";"; }
  function queryPanel() {
    var d = selectedEntry();
    var sel = h("select", { class: "sdb-select", id: "sdbQuerySelect", "aria-label": "Which example query", title: "Choose one example query, or all of them", onchange: function (e) { S.qsel = e.target.value; S.qresult = null; S.qerror = ""; renderFoot(); } },
      [h("option", { value: "all", text: "All " + d.queries.length + " example queries" })].concat(d.queries.map(function (q) { return h("option", { value: q.id, text: q.title + " - " + q.description }); })));
    sel.value = S.qsel || "all";
    var one = d.queries.filter(function (q) { return q.id === S.qsel; })[0];
    var box = h("div", { class: "sdb-qpanel", role: "group", "aria-label": "Example queries" }, [
      h("strong", { text: "Example queries" }),
      h("div", { class: "sdb-note", text: "Adds " + d.queries.length + " ready-made queries for this sample to the SQL editor. They only read data (SELECT); nothing is changed. Putting them in the editor first switches the studio to the new sample, so the table names resolve." }),
      h("div", { class: "sdb-row" }, [sel,
        h("button", { class: "sdb-btn primary", type: "button", id: "sdbPutQueries", title: "Switch to the sample and put the chosen query (or all of them) in the SQL editor", onclick: putInEditor, text: "Put in the SQL editor" }),
        h("button", { class: "sdb-btn", type: "button", id: "sdbRunQueries", title: "Run the chosen query (or all of them) here and show the result; nothing is changed", onclick: runChosen, text: "Run it" })]),
      one ? h("div", { class: "sdb-note", text: one.description }) : null,
      h("div", { id: "sdbQMsg", role: "alert", class: S.qerror ? "sdb-err" : "sdb-note", text: S.qerror || "" }),
      S.qresult ? resultView(S.qresult) : null,
    ]);
    return box;
  }
  function resultView(r) {
    if (r.lines) return h("div", { class: "sdb-qlines" }, r.lines.map(function (l) { return h("div", { class: l.ok ? "sdb-ok" : "sdb-err", text: (l.ok ? "OK  " : "FAILED  ") + l.title + " - " + l.text }); }));
    var head = h("tr", {}, r.columns.map(function (c) { return h("th", { text: c }); }));
    var body = r.rows.slice(0, 12).map(function (row) { return h("tr", {}, row.map(function (v) { return h("td", { text: v === null || v === undefined ? "" : String(v) }); })); });
    return h("div", {}, [h("div", { class: "sdb-ok", text: r.title + ": " + fmt(r.rowCount) + " rows in " + r.ms + " ms" + (r.rowCount > 12 ? " (first 12 shown)" : "") }),
      h("div", { class: "sdb-qtable" }, [h("table", {}, [h("thead", {}, [head]), h("tbody", {}, body)])])]);
  }
  async function runChosen() {
    var d = selectedEntry(), j = S.job; if (!d || !j || !j.result) return;
    S.qerror = ""; S.qresult = null;
    var list = chosenQueries(d), lines = [], one = null;
    var runBtn = document.getElementById("sdbRunQueries"); if (runBtn) runBtn.disabled = true;
    for (var i = 0; i < list.length; i++) {
      var r = await api("/api/samples/run", { datasetId: d.id, queryId: list[i].id, target: j.result.target });
      if (r.success) { one = r; lines.push({ ok: true, title: list[i].title, text: fmt(r.rowCount) + " rows" }); }
      else { lines.push({ ok: false, title: list[i].title, text: r.error || "could not run" }); if (list.length === 1) S.qerror = r.error || "The query could not run."; }
    }
    S.qresult = list.length === 1 ? (one || null) : { lines: lines };
    if (list.length > 1) { var bad = lines.filter(function (l) { return !l.ok; }).length; if (bad) S.qerror = bad + " of " + lines.length + " queries could not run; see the list below."; }
    renderFoot();
  }
  async function putInEditor() {
    var d = selectedEntry(), j = S.job; if (!d || !j || !j.result) return;
    S.qerror = "";
    var res = await api("/api/samples/open", { target: j.result.target, datasetId: d.id });
    if (!res.success) { S.qerror = "Could not switch the studio to the sample: " + (res.error || "unknown error"); renderFoot(); return; }
    await refreshStudio();
    var list = chosenQueries(d);
    var eds = editors();
    if (!eds.length) { S.qerror = "The SQL editor was not found on this page. Reload the page and try again."; renderFoot(); return; }
    var text = list.map(queryText).join("\n\n");
    eds.forEach(function (ed) { ed.value = text; try { ed.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} });
    var saved = saveQueries(d, list);
    S.job.opened = true;
    close(); showSql();
    try { eds[0].focus(); } catch (e) {}
    toast(list.length === 1 ? "Put \"" + list[0].title + "\" in the SQL editor" : "Put " + list.length + " example queries in the SQL editor (also saved under Saved queries: " + saved + ")");
  }
  function saveQueries(d, list) {
    var added = 0;
    try {
      var st = typeof queryDesignerState !== "undefined" ? queryDesignerState : null;
      var arr = st && Array.isArray(st.savedQueries) ? st.savedQueries : null;
      if (!arr) { try { arr = JSON.parse(localStorage.getItem(cfg.storageKey) || "[]"); } catch (e) { arr = []; } }
      list.forEach(function (q) {
        var name = d.title + ": " + q.title;
        for (var i = arr.length - 1; i >= 0; i--) if (arr[i] && arr[i].name === name) arr.splice(i, 1);
        arr.unshift({ name: name, sql: q.sql, description: q.description, createdAt: new Date().toISOString() });
        added++;
      });
      if (st) st.savedQueries = arr;
      try { localStorage.setItem(cfg.storageKey, JSON.stringify(arr)); } catch (e) {}
      try { if (typeof persistSavedQueries === "function") persistSavedQueries(); } catch (e) {}
    } catch (e) {}
    return added;
  }

  async function openDialog() {
    build();
    S.opener = document.activeElement;
    S.open = true; S.error = "";
    overlay.classList.add("open");
    if (!S.catalog) {
      el.grid.textContent = ""; el.grid.appendChild(h("div", { class: "sdb-empty", text: "Loading the catalog…" }));
      var res = await api("/api/samples/catalog");
      if (!res.success) { el.grid.textContent = ""; el.grid.appendChild(h("div", { class: "sdb-empty sdb-err", text: "Could not load the catalog: " + (res.error || "unknown error") })); return; }
      S.catalog = res; S.selected = res.datasets[0].id;
      renderChips();
    }
    renderGrid(); renderDetail(); renderFoot();
    var sel = el.grid.querySelector('.sdb-item[aria-selected="true"]') || el.search;
    sel.focus();
  }
  function close() {
    if (!overlay || !S.open) return;
    if (S.job && S.job.status === "running") { toast("Still creating the sample - use Cancel to stop it"); return; }
    if (S.poll) { clearInterval(S.poll); S.poll = null; }
    S.open = false;
    overlay.classList.remove("open");
    if (S.job && S.job.status === "running") { /* the job continues on the server; reopen to see the result */ }
    try { if (S.opener && S.opener.focus) S.opener.focus(); } catch (e) {}
  }

  window.openSampleDatabases = openDialog;
  window.closeSampleDatabases = close;
  window.__sampleDatabases = S;
}

export function samplesScript(studio: string, storageKey: string): string {
  return `(${samplesClientMain.toString()})(${JSON.stringify({ studio, storageKey })});`;
}

export const SAMPLES_SCRIPT_SQLITE = samplesScript("sqlite", "sqlite_studio_saved_queries");
export const SAMPLES_SCRIPT_MYSQL = samplesScript("mysql", "mysql_studio_saved_queries");
export const SAMPLES_SCRIPT_POSTGRES = samplesScript("postgres", "postgres_studio_saved_queries");
