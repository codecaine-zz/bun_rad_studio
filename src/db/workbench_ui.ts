/**
 * Shared database workbench page (MySQL / PostgreSQL / SQLite). Plain HTML + JavaScript, no framework.
 * All database content is inserted with textContent / createTextNode, never as HTML. The page holds no
 * credentials: passwords are sent once to the backend, which keeps them in the OS credential store.
 */
export interface WorkbenchHtmlOptions {
  token: string;
  title?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function generateWorkbenchHtml(opts: WorkbenchHtmlOptions): string {
  const title = esc(opts.title ?? "Database Workbench");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wb-token" content="${esc(opts.token)}">
<title>${title}</title>
<style>
:root{--bg:#0f172a;--panel:#111c33;--panel2:#16233f;--line:#26364f;--fg:#e2e8f0;--mute:#94a3b8;--acc:#38bdf8;--ok:#22c55e;--warn:#f59e0b;--bad:#ef4444}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--fg);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
header h1{font-size:15px;margin:0}
#connBadge{padding:3px 10px;border-radius:999px;font-weight:600;border:2px solid var(--line)}
.env-development{border-color:#22c55e!important;color:#86efac}.env-test{border-color:#38bdf8!important;color:#7dd3fc}
.env-staging{border-color:#f59e0b!important;color:#fcd34d}.env-production{border-color:#ef4444!important;color:#fca5a5;background:#450a0a}
#main{flex:1;display:flex;min-height:0}
aside{width:290px;border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
aside section{padding:10px;border-bottom:1px solid var(--line);overflow:auto}
aside h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:0 0 8px}
#content{flex:1;display:flex;flex-direction:column;min-width:0}
.tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid var(--line);background:var(--panel)}
.tab{padding:7px 14px;border:1px solid transparent;border-bottom:none;border-radius:6px 6px 0 0;cursor:pointer;color:var(--mute);background:none;font:inherit}
.tab[aria-selected=true]{color:var(--fg);background:var(--bg);border-color:var(--line)}
.pane{flex:1;display:none;flex-direction:column;min-height:0;padding:10px}
.pane.active{display:flex}
button,select,input,textarea{font:inherit;color:var(--fg);background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:5px 9px}
button{cursor:pointer}button:hover:not(:disabled){border-color:var(--acc)}button:disabled{opacity:.45;cursor:not-allowed}
button.primary{background:#0369a1;border-color:#0ea5e9}button.danger{background:#7f1d1d;border-color:#ef4444}
:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.grow{flex:1}
.mute{color:var(--mute)}
.banner{padding:6px 10px;border-radius:6px;margin-bottom:8px;border:1px solid var(--line);background:var(--panel2)}
.banner.ro{border-color:var(--warn);color:#fcd34d}.banner.ok{border-color:#166534;color:#86efac}.banner.err{border-color:var(--bad);color:#fca5a5}
.gridwrap{flex:1;overflow:auto;border:1px solid var(--line);border-radius:6px;min-height:80px}
table{border-collapse:collapse;width:max-content;min-width:100%}
th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:4px 8px;text-align:left;white-space:pre;max-width:420px;overflow:hidden;text-overflow:ellipsis}
th{position:sticky;top:0;background:var(--panel2);cursor:pointer;user-select:none;z-index:1}
td.null{color:var(--mute);font-style:italic}td.num{text-align:right;font-variant-numeric:tabular-nums}
tr.changed td{background:#422006}tr.deleted td{background:#450a0a;text-decoration:line-through}tr.added td{background:#052e16}
td.dirty{outline:2px solid var(--warn);outline-offset:-2px}
.item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;cursor:pointer}
.item:hover,.item.sel{background:var(--panel2)}
.dot{width:9px;height:9px;border-radius:50%;flex:none}
.dev{background:#22c55e}.tst{background:#38bdf8}.stg{background:#f59e0b}.prd{background:#ef4444}
dialog{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:10px;max-width:min(720px,92vw);padding:16px}
dialog::backdrop{background:rgba(0,0,0,.6)}
dialog h3{margin:0 0 10px}
dialog label{display:block;margin:6px 0 2px;color:var(--mute)}
dialog input,dialog select{width:100%}
pre.sql{background:#020617;border:1px solid var(--line);border-radius:6px;padding:8px;overflow:auto;max-height:200px;white-space:pre-wrap}
textarea#sqlText{width:100%;min-height:140px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#toast{position:fixed;right:14px;bottom:14px;max-width:420px;padding:10px 14px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);display:none;z-index:50}
</style>
</head>
<body>
<header>
  <h1>🗄️ ${title}</h1>
  <span id="connBadge" class="mute">Not connected</span>
  <span id="txBadge" class="mute" hidden>transaction open</span>
  <span class="grow"></span>
  <span id="secretNote" class="mute"></span>
</header>
<div id="main">
  <aside>
    <section id="secProfiles">
      <h2>Connections</h2>
      <div class="row"><button id="btnNewConn" class="primary">+ New connection</button></div>
      <div id="profileList" role="list"></div>
    </section>
    <section id="secExplorer" style="flex:1">
      <h2>Explorer</h2>
      <input id="objFilter" placeholder="Search tables…" aria-label="Search tables" style="width:100%;margin-bottom:6px">
      <div id="objList" role="list"><span class="mute">Connect to browse objects.</span></div>
    </section>
  </aside>
  <div id="content">
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" id="tabData" aria-selected="true" data-pane="paneData">Data</button>
      <button class="tab" role="tab" id="tabStruct" aria-selected="false" data-pane="paneStruct">Structure</button>
      <button class="tab" role="tab" id="tabSql" aria-selected="false" data-pane="paneSql">SQL</button>
    </div>
    <div id="paneData" class="pane active">
      <div id="dataBanner" class="banner mute">Choose a table in the explorer.</div>
      <div class="row">
        <select id="fCol" aria-label="Filter column"></select>
        <select id="fOp" aria-label="Filter operator">
          <option value="contains">contains</option><option value="startsWith">starts with</option><option value="eq">=</option><option value="ne">≠</option>
          <option value="lt">&lt;</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="gte">≥</option>
          <option value="isNull">is NULL</option><option value="notNull">is not NULL</option>
        </select>
        <input id="fVal" placeholder="value" aria-label="Filter value">
        <button id="btnFilter">Search</button><button id="btnClearFilter">Clear</button>
        <span class="grow"></span>
        <select id="pageSize" aria-label="Rows per page"><option>25</option><option selected>50</option><option>100</option><option>500</option></select>
        <button id="btnPrev">◀</button><span id="pageInfo" class="mute"></span><button id="btnNext">▶</button>
        <button id="btnRefresh">Refresh</button><button id="btnExport">Export CSV</button>
      </div>
      <div class="row">
        <button id="btnAddRow">+ Add row</button><button id="btnDelRow">Delete selected</button>
        <span class="grow"></span>
        <span id="pendingInfo" class="mute"></span>
        <button id="btnPreview" disabled>Preview changes</button><button id="btnSave" class="primary" disabled>Save</button><button id="btnDiscard" disabled>Discard</button>
      </div>
      <div class="gridwrap"><table id="grid" aria-label="Table data"></table></div>
    </div>
    <div id="paneStruct" class="pane"><div id="structBody" class="mute">Choose a table in the explorer.</div></div>
    <div id="paneSql" class="pane">
      <textarea id="sqlText" spellcheck="false" aria-label="SQL" placeholder="SELECT * FROM …"></textarea>
      <div class="row" style="margin-top:8px">
        <button id="btnRun" class="primary">Run statement</button><button id="btnRunScript">Run script</button>
        <select id="onError" aria-label="On error"><option value="stop">Stop on error</option><option value="continue">Continue on error</option></select>
        <label><input type="checkbox" id="atomic"> all-or-nothing</label>
        <button id="btnCancel">Cancel</button>
        <span class="grow"></span>
        <button id="btnBegin">Begin</button><button id="btnCommit">Commit</button><button id="btnRollback">Rollback</button>
      </div>
      <div id="sqlStatus" class="banner mute">No connection.</div>
      <div id="sqlResults" class="gridwrap" style="padding:6px"></div>
    </div>
  </div>
</div>
<dialog id="dlg"><div id="dlgBody"></div><div class="row" style="margin-top:12px;justify-content:flex-end" id="dlgButtons"></div></dialog>
<div id="toast" role="status"></div>
<script>
(function(){
"use strict";
var TOKEN = document.querySelector('meta[name="wb-token"]').content;
var $ = function(id){ return document.getElementById(id); };
var state = { profiles: [], conn: null, objects: [], table: null, info: null, page: null, sort: [], filter: null, offset: 0, selected: -1,
  pending: { updates: {}, deletes: {}, inserts: [] }, busy: false };

function el(tag, attrs, children){
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) { if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k]; else if (k.slice(0,2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
  (children || []).forEach(function(c){ e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}
function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); }
var toastTimer;
function toast(msg, bad){ var t = $("toast"); t.textContent = msg; t.style.display = "block"; t.style.borderColor = bad ? "#ef4444" : "#26364f"; clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.style.display = "none"; }, 5000); }

function api(path, body){
  var opts = { method: body === undefined ? "GET" : "POST", headers: { "X-Workbench-Token": TOKEN } };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  return fetch(path, opts).then(function(r){
    var ct = r.headers.get("content-type") || "";
    if (ct.indexOf("application/json") < 0) return r;
    return r.json().then(function(j){ if (!j.ok) { var e = new Error(j.error && j.error.message || "Request failed"); e.info = j.error || {}; throw e; } return j; });
  });
}
function errText(e){ return e && e.info && e.info.hint ? e.message + " — " + e.info.hint : (e && e.message) || String(e); }
function fail(e){ toast(errText(e), true); }

// ---- confirmation dialog -------------------------------------------------------------------------------------
function closeDialog(d){ if (d.close) d.close(); else { d.removeAttribute("open"); if (d.onclose) d.onclose(); } }
function showDialog(build, buttons){
  var d = $("dlg"); clear($("dlgBody")); clear($("dlgButtons"));
  build($("dlgBody"));
  return new Promise(function(resolve){
    buttons.forEach(function(b){
      $("dlgButtons").appendChild(el("button", { text: b.label, class: b.cls || "", id: b.id || "", onclick: function(){ var v = b.value; if (b.collect) v = b.collect(); if (v === false) return; resolve(v); closeDialog(d); } }));
    });
    d.onclose = function(){ resolve(undefined); };
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  });
}
function confirmDialog(c){
  var typedInput;
  return showDialog(function(body){
    var s = c.summary;
    body.appendChild(el("h3", { text: "Confirm: " + s.operation }));
    body.appendChild(el("p", { text: "Connection: " + s.connection + " (" + s.engine + (s.database ? ", " + s.database : "") + ") — " + s.environment.toUpperCase() }));
    s.reasons.forEach(function(r){ body.appendChild(el("p", { class: "banner err", text: r })); });
    body.appendChild(el("pre", { class: "sql", text: s.statements.join("\\n") }));
    if (c.requireTyped) {
      body.appendChild(el("label", { text: "This is a PRODUCTION connection. Type  " + c.requireTyped + "  to continue:" }));
      typedInput = el("input", { id: "confirmTyped", autocomplete: "off" }); body.appendChild(typedInput);
    }
  }, [{ label: "Cancel", value: null, id: "confirmCancel" }, { label: "Confirm", cls: "danger", id: "confirmOk", collect: function(){ return { typed: typedInput ? typedInput.value : undefined }; } }]);
}
// Run a request; if the server asks for confirmation, show the exact operation and retry with the token.
function withConfirm(path, body){
  return api(path, body).then(function(j){
    if (!j.needsConfirmation) return j;
    return confirmDialog(j).then(function(ans){
      if (!ans) { var e = new Error("Cancelled"); e.cancelled = true; throw e; }
      var b2 = Object.assign({}, body, { confirmToken: j.token, confirmTyped: ans.typed });
      return api(path, b2);
    });
  });
}

// ---- profiles --------------------------------------------------------------------------------------------------
var ENV_DOT = { development: "dev", test: "tst", staging: "stg", production: "prd" };
function loadProfiles(){
  return api("/api/v2/profiles").then(function(j){
    state.profiles = j.profiles;
    $("secretNote").textContent = j.secretStore === "os-keychain" ? "🔐 Passwords: OS keychain" : "⚠ OS keychain unavailable — passwords kept in memory only";
    renderProfiles();
  }).catch(fail);
}
function renderProfiles(){
  var list = $("profileList"); clear(list);
  if (!state.profiles.length) list.appendChild(el("span", { class: "mute", text: "No saved connections yet." }));
  var sorted = state.profiles.slice().sort(function(a, b){ return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name); });
  sorted.forEach(function(p){
    var row = el("div", { class: "item", role: "listitem", "data-profile": p.id }, [
      el("span", { class: "dot " + ENV_DOT[p.environment], title: p.environment }),
      el("span", { class: "grow", text: (p.favorite ? "★ " : "") + p.name + (p.readOnly ? " 🔒" : "") }),
      el("span", { class: "mute", text: p.engine })
    ]);
    row.addEventListener("click", function(){ connectProfile(p); });
    var menu = el("span", {}, [
      el("button", { text: "Edit", title: "Edit", onclick: function(ev){ ev.stopPropagation(); profileForm(p); } }),
      el("button", { text: "⧉", title: "Duplicate", onclick: function(ev){ ev.stopPropagation(); api("/api/v2/profiles/duplicate", { id: p.id }).then(loadProfiles).catch(fail); } }),
      el("button", { text: "✕", title: "Delete", onclick: function(ev){ ev.stopPropagation(); if (window.confirm("Delete connection \\"" + p.name + "\\"? Its stored password is removed too.")) api("/api/v2/profiles/delete", { id: p.id }).then(loadProfiles).catch(fail); } })
    ]);
    row.appendChild(menu);
    list.appendChild(row);
  });
}
function profileForm(p){
  var f = {}; p = p || { engine: "sqlite", environment: "development", sqliteMode: "readwrite", tags: [] };
  function field(label, name, val, type){ var i = el("input", { id: "pf_" + name, value: val == null ? "" : String(val), type: type || "text", autocomplete: "off" }); f[name] = i; return [el("label", { text: label, for: "pf_" + name }), i]; }
  function select(label, name, opts, val){ var s = el("select", { id: "pf_" + name }); opts.forEach(function(o){ var op = el("option", { value: o, text: o }); if (o === val) op.selected = true; s.appendChild(op); }); f[name] = s; return [el("label", { text: label, for: "pf_" + name }), s]; }
  var serverFields = [];
  return showDialog(function(body){
    body.appendChild(el("h3", { text: p.id ? "Edit connection" : "New connection" }));
    [].concat(field("Name", "name", p.name), select("Engine", "engine", ["sqlite", "mysql", "postgres"], p.engine), select("Environment", "environment", ["development", "test", "staging", "production"], p.environment), field("Folder", "folder", p.folder), field("Tags (comma separated)", "tags", (p.tags || []).join(", "))).forEach(function(n){ body.appendChild(n); });
    var sq = el("div", { id: "pf_sqlite" });
    [].concat(select("SQLite mode", "sqliteMode", ["readwrite", "readonly", "create", "memory"], p.sqliteMode || "readwrite"), field("File path", "path", p.path)).forEach(function(n){ sq.appendChild(n); });
    sq.appendChild(el("p", { class: "mute", text: "readwrite opens an existing file; create makes a NEW file (never overwrites); memory is temporary and lost on close." }));
    var sv = el("div", { id: "pf_server" });
    [].concat(field("Host", "host", p.host || "localhost"), field("Port", "port", p.port, "number"), field("User", "user", p.user), field("Password", "password", "", "password"), field("…or password environment variable", "passwordEnv", p.passwordEnv), field("Database", "database", p.database), field("Schema (PostgreSQL)", "schema", p.schema)).forEach(function(n){ sv.appendChild(n); });
    var tls = el("label", {}, [ (f.tls = el("input", { type: "checkbox", id: "pf_tls" })), " Use TLS (certificate verification stays on)" ]); if (p.tls) f.tls.checked = true;
    sv.appendChild(tls);
    sv.appendChild(el("p", { class: "mute", text: p.hasPassword ? "A password is stored. Leave the password blank to keep it." : "The password is stored in the OS keychain, never in the connection file." }));
    body.appendChild(sq); body.appendChild(sv);
    var ro = el("label", {}, [ (f.readOnly = el("input", { type: "checkbox", id: "pf_readOnly" })), " Read-only connection" ]); if (p.readOnly) f.readOnly.checked = true;
    var fav = el("label", {}, [ (f.favorite = el("input", { type: "checkbox", id: "pf_favorite" })), " Favorite" ]); if (p.favorite) f.favorite.checked = true;
    body.appendChild(ro); body.appendChild(fav);
    function sync(){ var sqlite = f.engine.value === "sqlite"; sq.hidden = !sqlite; sv.hidden = sqlite; }
    f.engine.addEventListener("change", sync); sync();
  }, [{ label: "Cancel", value: null, id: "pfCancel" }, { label: "Test", id: "pfTest", collect: function(){ collectProfile(f).then(function(c){ return api("/api/v2/test", { profile: c.profile, password: c.password || undefined, profileId: p.id && !c.password ? p.id : undefined }); }).then(function(r){ toast("Connection OK — " + r.version + " (" + r.latencyMs + " ms)"); }).catch(fail); return false; } },
     { label: "Save", cls: "primary", id: "pfSave", collect: function(){ collectProfile(f).then(function(c){ return api("/api/v2/profiles/save", { id: p.id, profile: c.profile, password: c.password === "" ? undefined : c.password }); }).then(function(){ closeDialog($("dlg")); return loadProfiles(); }).catch(fail); return false; } }]);
}
function collectProfile(f){
  var engine = f.engine.value;
  var profile = { name: f.name.value, engine: engine, environment: f.environment.value, folder: f.folder.value || undefined, tags: f.tags.value.split(",").map(function(t){ return t.trim(); }).filter(Boolean), readOnly: f.readOnly.checked, favorite: f.favorite.checked };
  if (engine === "sqlite") { profile.sqliteMode = f.sqliteMode.value; profile.path = f.path.value || undefined; }
  else { profile.host = f.host.value || undefined; profile.port = f.port.value ? Number(f.port.value) : undefined; profile.user = f.user.value || undefined; profile.database = f.database.value || undefined; profile.schema = f.schema.value || undefined; profile.passwordEnv = f.passwordEnv.value || undefined; if (f.tls.checked) profile.tls = true; }
  return Promise.resolve({ profile: profile, password: engine === "sqlite" ? "" : f.password.value });
}

// ---- connection ------------------------------------------------------------------------------------------------
function connectProfile(p){
  var go = function(){ return api("/api/v2/connect", { profileId: p.id }).then(function(j){ return afterConnect(j.connection); }); };
  var chain = state.conn ? disconnect().then(go) : go();
  chain.catch(function(e){ if (!e.cancelled) fail(e); });
}
function disconnect(){
  if (!state.conn) return Promise.resolve();
  if (hasPending() && !window.confirm("You have unsaved row changes. Discard them and switch connection?")) return Promise.reject(Object.assign(new Error("Cancelled"), { cancelled: true }));
  var id = state.conn.connectionId;
  return api("/api/v2/disconnect", { connectionId: id }).catch(function(e){
    if (e.info && /open transaction/.test(e.message) && window.confirm("This connection has an open transaction. Roll it back and disconnect?")) return api("/api/v2/disconnect", { connectionId: id, discardTransaction: true });
    throw e;
  }).then(function(){ state.conn = null; state.table = null; discardPending(); renderConn(); renderObjects(); clearGrid(); });
}
function afterConnect(c){
  state.conn = c; state.table = null; renderConn();
  if (c.temporary) toast("In-memory database: its data is lost when you disconnect.");
  return refreshObjects();
}
function renderConn(){
  var b = $("connBadge"); b.className = "";
  var c = state.conn;
  if (!c) { b.textContent = "Not connected"; b.className = "mute"; $("txBadge").hidden = true; $("sqlStatus").textContent = "No connection."; return; }
  b.className = "env-" + c.environment;
  b.id = "connBadge";
  b.textContent = c.name + " · " + c.engine + " " + c.version.split(" ")[0] + (c.database ? " · " + c.database : "") + " · " + c.environment.toUpperCase() + (c.readOnly ? " · READ-ONLY" : "");
  $("txBadge").hidden = !c.inTransaction;
  $("sqlStatus").textContent = "Connected to " + c.name + ". " + (c.capabilities.notes.statementTimeout || "");
  $("btnCancel").disabled = !c.capabilities.cancelQuery;
  $("btnCancel").title = c.capabilities.cancelQuery ? "Ask the server to stop the running statement" : (c.capabilities.notes.cancelQuery || "Not supported by this engine");
}
function refreshObjects(){
  return api("/api/v2/objects", { connectionId: state.conn.connectionId }).then(function(j){ state.objects = j.objects; renderObjects(); }).catch(fail);
}
function renderObjects(){
  var list = $("objList"); clear(list);
  var q = $("objFilter").value.toLowerCase();
  if (!state.conn) { list.appendChild(el("span", { class: "mute", text: "Connect to browse objects." })); return; }
  var shown = state.objects.filter(function(o){ return (o.schema ? o.schema + "." : "").concat(o.name).toLowerCase().indexOf(q) >= 0; });
  if (!shown.length) list.appendChild(el("span", { class: "mute", text: state.objects.length ? "No matches." : "No tables or views." }));
  shown.forEach(function(o){
    var label = (o.schema ? o.schema + "." : "") + o.name;
    var it = el("div", { class: "item" + (state.table && state.table.name === o.name && state.table.schema === o.schema ? " sel" : ""), role: "listitem", "data-object": label }, [ el("span", { text: o.type === "view" ? "👁" : "▦" }), el("span", { class: "grow", text: label }), el("span", { class: "mute", text: o.type }) ]);
    it.addEventListener("click", function(){ openTable(o); });
    list.appendChild(it);
  });
}

// ---- data grid -------------------------------------------------------------------------------------------------
function hasPending(){ return Object.keys(state.pending.updates).length || Object.keys(state.pending.deletes).length || state.pending.inserts.length; }
function discardPending(){ state.pending = { updates: {}, deletes: {}, inserts: [] }; updatePendingUi(); }
function openTable(o){
  if (hasPending() && !window.confirm("Discard your unsaved changes to the current table?")) return;
  discardPending(); state.table = o; state.sort = []; state.filter = null; state.offset = 0; state.selected = -1;
  renderObjects(); loadPage(); loadStructure();
}
function browseBody(){
  return { connectionId: state.conn.connectionId, table: state.table, limit: Number($("pageSize").value), offset: state.offset, orderBy: state.sort, filters: state.filter ? [state.filter] : [] };
}
function loadPage(){
  if (!state.conn || !state.table) return Promise.resolve();
  return api("/api/v2/browse", browseBody()).then(function(j){ state.page = j; renderGrid(); }).catch(function(e){ clearGrid(); $("dataBanner").className = "banner err"; $("dataBanner").textContent = errText(e); });
}
function clearGrid(){ clear($("grid")); $("pageInfo").textContent = ""; if (!state.conn) { $("dataBanner").className = "banner mute"; $("dataBanner").textContent = "Choose a table in the explorer."; } }
function isBinary(v){ return v && typeof v === "object" && typeof v.$binary === "string"; }
function display(v){
  if (v === null || v === undefined) return { text: "NULL", cls: "null" };
  if (isBinary(v)) return { text: "[binary " + Math.floor(v.$binary.length * 3 / 4) + " bytes]", cls: "" };
  if (typeof v === "object") return { text: JSON.stringify(v), cls: "" };
  if (typeof v === "number") return { text: String(v), cls: "num" };
  return { text: String(v), cls: "" };
}
function colByName(n){ return state.page.columns.filter(function(c){ return c.name === n; })[0]; }
function keyOf(row){
  var e = state.page.editable; var k = {};
  e.keyColumns.forEach(function(c){ k[c] = typedValue(c === "rowid" ? { dataType: "integer" } : colByName(c), c === "rowid" ? row.__rowid__ : row[c]); });
  return k;
}
function rowId(row){ return JSON.stringify(keyOf(row)); }
// Convert a displayed/typed value into the exact typed parameter the backend expects.
function typedValue(col, v){
  if (v === null || v === undefined) return null;
  if (isBinary(v)) return v;
  var t = (col && col.dataType || "").toLowerCase();
  if (typeof v === "object") return { $json: v };
  if (typeof v === "boolean") return v;
  if (/int|serial/.test(t) && /^-?\\d+$/.test(String(v))) return { $bigint: String(v) };
  if (/numeric|decimal|money/.test(t) && /^-?\\d*\\.?\\d+$/.test(String(v))) return { $decimal: String(v) };
  return v;
}
function parseInput(col, text, isNull){
  if (isNull) return null;
  var t = (col.dataType || "").toLowerCase();
  if (/bool|tinyint\\(1\\)/.test(t) && /^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/json/.test(t)) { try { return { $json: JSON.parse(text) }; } catch (e) { throw new Error(col.name + ": not valid JSON"); } }
  if (/int|serial/.test(t)) { if (!/^-?\\d+$/.test(text.trim())) throw new Error(col.name + ": enter a whole number"); return { $bigint: text.trim() }; }
  if (/numeric|decimal|money/.test(t)) { if (!/^-?\\d*\\.?\\d+$/.test(text.trim())) throw new Error(col.name + ": enter a number"); return { $decimal: text.trim() }; }
  if (/float|double|real/.test(t)) { var n = Number(text); if (!isFinite(n)) throw new Error(col.name + ": enter a number"); return n; }
  return text;
}
function renderGrid(){
  var p = state.page, g = $("grid"); clear(g);
  var banner = $("dataBanner");
  if (p.editable.ok) { banner.className = "banner ok"; banner.textContent = "Editable table — rows identified by " + (p.editable.keyKind === "rowid" ? "SQLite rowid" : "primary key (" + p.editable.keyColumns.join(", ") + ")") + ". Double-click a cell to edit."; }
  else { banner.className = "banner ro"; banner.textContent = "Read-only: " + p.editable.reason; }
  var head = el("tr"); head.appendChild(el("th", { text: "#" }));
  p.columns.forEach(function(c){
    var dir = state.sort.length && state.sort[0].column === c.name ? (state.sort[0].direction === "asc" ? " ▲" : " ▼") : "";
    var th = el("th", { text: c.name + dir, title: c.dataType + (c.nullable ? "" : " NOT NULL") + (c.primaryKeyPosition ? " PRIMARY KEY" : ""), "data-col": c.name });
    th.addEventListener("click", function(){ var next = state.sort.length && state.sort[0].column === c.name && state.sort[0].direction === "asc" ? "desc" : "asc"; state.sort = [{ column: c.name, direction: next }]; state.offset = 0; loadPage(); });
    head.appendChild(th);
  });
  g.appendChild(el("thead", {}, [head]));
  var tb = el("tbody");
  p.rows.forEach(function(row, i){
    var id = p.editable.ok ? rowId(row) : null;
    var upd = id && state.pending.updates[id], del = id && state.pending.deletes[id];
    var tr = el("tr", { "data-row": String(i), class: del ? "deleted" : upd ? "changed" : "" });
    tr.appendChild(el("td", { class: "num", text: String(state.offset + i + 1) }));
    p.columns.forEach(function(c){
      var v = upd && Object.prototype.hasOwnProperty.call(upd.display, c.name) ? upd.display[c.name] : row[c.name];
      var d = display(v);
      var td = el("td", { class: d.cls + (upd && Object.prototype.hasOwnProperty.call(upd.display, c.name) ? " dirty" : ""), text: d.text, "data-col": c.name });
      if (p.editable.ok && !c.generated && !isBinary(row[c.name])) td.addEventListener("dblclick", function(){ editCell(row, c, td); });
      tr.appendChild(td);
    });
    tr.addEventListener("click", function(){ state.selected = i; Array.prototype.forEach.call(tb.children, function(r){ r.style.outline = ""; }); tr.style.outline = "1px solid #38bdf8"; });
    tb.appendChild(tr);
  });
  state.pending.inserts.forEach(function(ins, i){
    var tr = el("tr", { class: "added", "data-insert": String(i) }); tr.appendChild(el("td", { text: "new" }));
    p.columns.forEach(function(c){ var v = ins.display[c.name]; var d = display(v === undefined ? null : v); var td = el("td", { class: d.cls, text: v === undefined ? "(default)" : d.text }); td.addEventListener("dblclick", function(){ editInsertCell(ins, c, td); }); tr.appendChild(td); });
    tb.appendChild(tr);
  });
  g.appendChild(tb);
  var from = p.total ? state.offset + 1 : 0, to = Math.min(state.offset + p.rows.length, p.total);
  $("pageInfo").textContent = from + "–" + to + " of " + p.total;
  $("btnPrev").disabled = state.offset <= 0; $("btnNext").disabled = state.offset + p.limit >= p.total;
  var fc = $("fCol"); if (fc.options.length !== p.columns.length || fc.getAttribute("data-t") !== state.table.name) { clear(fc); p.columns.forEach(function(c){ fc.appendChild(el("option", { value: c.name, text: c.name })); }); fc.setAttribute("data-t", state.table.name); }
  $("btnAddRow").disabled = !p.editable.ok && state.table.type === "view"; $("btnDelRow").disabled = !p.editable.ok;
  updatePendingUi();
}
function cellEditor(col, current){
  var input, nullBox;
  return showDialog(function(body){
    body.appendChild(el("h3", { text: "Edit " + col.name + " (" + col.dataType + ")" }));
    var long = typeof current === "string" && current.length > 80 || (current && typeof current === "object");
    input = long ? el("textarea", { id: "cellInput", rows: "8", style: "width:100%" }) : el("input", { id: "cellInput" });
    input.value = current === null || current === undefined ? "" : typeof current === "object" ? JSON.stringify(current, null, 2) : String(current);
    body.appendChild(input);
    nullBox = el("input", { type: "checkbox", id: "cellNull" }); if (current === null || current === undefined) nullBox.checked = true;
    if (col.nullable) body.appendChild(el("label", {}, [nullBox, " NULL"])); else body.appendChild(el("p", { class: "mute", text: "This column does not allow NULL." }));
  }, [{ label: "Cancel", value: undefined, id: "cellCancel" }, { label: "OK", cls: "primary", id: "cellOk", collect: function(){ return { text: input.value, isNull: col.nullable && nullBox.checked }; } }]);
}
function editCell(row, col, td){
  var id = rowId(row); var upd = state.pending.updates[id];
  var cur = upd && Object.prototype.hasOwnProperty.call(upd.display, col.name) ? upd.display[col.name] : row[col.name];
  cellEditor(col, cur).then(function(ans){
    if (!ans) return;
    var newVal; try { newVal = parseInput(col, ans.text, ans.isNull); } catch (e) { toast(e.message, true); return; }
    var u = state.pending.updates[id] || (state.pending.updates[id] = { key: keyOf(row), expected: {}, changes: {}, display: {}, row: row });
    if (!Object.prototype.hasOwnProperty.call(u.expected, col.name)) { u.expected[col.name] = /float|double|real/i.test(col.dataType) ? undefined : typedValue(col, row[col.name]); }
    u.changes[col.name] = newVal; u.display[col.name] = ans.isNull ? null : (newVal && typeof newVal === "object" && "$json" in newVal ? newVal.$json : (newVal && typeof newVal === "object" ? ans.text : newVal));
    if (JSON.stringify(newVal) === JSON.stringify(typedValue(col, row[col.name]))) { delete u.changes[col.name]; delete u.display[col.name]; delete u.expected[col.name]; if (!Object.keys(u.changes).length) delete state.pending.updates[id]; }
    renderGrid();
  });
}
function editInsertCell(ins, col){
  cellEditor(col, ins.display[col.name]).then(function(ans){
    if (!ans) return;
    try { ins.values[col.name] = parseInput(col, ans.text, ans.isNull); } catch (e) { toast(e.message, true); return; }
    ins.display[col.name] = ans.isNull ? null : ans.text; renderGrid();
  });
}
function updatePendingUi(){
  var nU = Object.keys(state.pending.updates).length, nD = Object.keys(state.pending.deletes).length, nI = state.pending.inserts.length;
  var total = nU + nD + nI;
  $("pendingInfo").textContent = total ? total + " pending change" + (total === 1 ? "" : "s") + " (" + nU + " edit, " + nI + " new, " + nD + " delete)" : "";
  ["btnPreview", "btnSave", "btnDiscard"].forEach(function(id){ $(id).disabled = !total; });
}
function pendingOps(){
  var ops = [], t = state.table;
  Object.keys(state.pending.updates).forEach(function(id){ var u = state.pending.updates[id]; var exp = {}; Object.keys(u.expected).forEach(function(k){ if (u.expected[k] !== undefined) exp[k] = u.expected[k]; }); ops.push({ path: "/api/v2/row/update", label: "UPDATE " + t.name + " SET " + Object.keys(u.changes).join(", ") + " WHERE " + JSON.stringify(u.key), body: { table: t, key: u.key, expected: exp, changes: u.changes } }); });
  state.pending.inserts.forEach(function(ins){ ops.push({ path: "/api/v2/row/insert", label: "INSERT INTO " + t.name + " (" + Object.keys(ins.values).join(", ") + ")", body: { table: t, values: ins.values } }); });
  Object.keys(state.pending.deletes).forEach(function(id){ var d = state.pending.deletes[id]; ops.push({ path: "/api/v2/row/delete", label: "DELETE FROM " + t.name + " WHERE " + JSON.stringify(d.key), body: { table: t, key: d.key, expected: d.expected } }); });
  return ops;
}
function previewChanges(){
  var ops = pendingOps();
  return showDialog(function(body){ body.appendChild(el("h3", { text: "Changes to be saved" })); body.appendChild(el("pre", { class: "sql", id: "previewText", text: ops.map(function(o){ return o.label; }).join("\\n") })); body.appendChild(el("p", { class: "mute", text: "Each change is applied to one row identified by its key and fails if the row was modified by someone else." })); }, [{ label: "Close", value: true, id: "previewClose" }]);
}
function saveChanges(){
  var ops = pendingOps(); var done = 0;
  state.busy = true;
  return ops.reduce(function(p, op){
    return p.then(function(){
      var body = Object.assign({ connectionId: state.conn.connectionId }, op.body);
      return withConfirm(op.path, body).then(function(){ done++; });
    });
  }, Promise.resolve()).then(function(){ toast("Saved " + done + " change" + (done === 1 ? "" : "s") + "."); discardPending(); return loadPage(); })
  .catch(function(e){ if (e.cancelled) { toast("Save cancelled. " + done + " of " + ops.length + " changes were already applied."); } else { toast("Stopped after " + done + " of " + ops.length + " changes: " + errText(e), true); }
    // Drop the changes that were applied so a retry does not repeat them.
    return loadPage().then(function(){ if (done) { discardPending(); renderGrid(); } }); })
  .then(function(){ state.busy = false; });
}
function exportCsv(){
  if (!state.conn || !state.table) return;
  fetch("/api/v2/export/csv", { method: "POST", headers: { "X-Workbench-Token": TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: state.conn.connectionId, table: state.table }) })
    .then(function(r){ if (!r.ok) return r.json().then(function(j){ throw new Error(j.error && j.error.message || "Export failed"); }); return r.blob(); })
    .then(function(blob){ var a = el("a", { href: URL.createObjectURL(blob), download: state.table.name + ".csv" }); document.body.appendChild(a); a.click(); a.remove(); toast("Exported " + state.table.name + ".csv"); }).catch(fail);
}

// ---- structure -------------------------------------------------------------------------------------------------
function loadStructure(){
  var body = $("structBody"); clear(body);
  api("/api/v2/describe", { connectionId: state.conn.connectionId, table: state.table }).then(function(j){
    var t = j.table;
    body.appendChild(el("h3", { text: (t.schema ? t.schema + "." : "") + t.name + " (" + t.type + ")" }));
    var tbl = el("table", { id: "structCols" }); tbl.appendChild(el("tr", {}, ["Column", "Type", "Null", "Default", "Key", "Extra"].map(function(h){ return el("th", { text: h }); })));
    t.columns.forEach(function(c){ tbl.appendChild(el("tr", {}, [c.name, c.dataType, c.nullable ? "YES" : "NO", c.defaultValue === null ? "" : c.defaultValue, c.primaryKeyPosition ? "PK" + c.primaryKeyPosition : "", [c.autoIncrement ? "auto-increment" : "", c.generated ? "generated" : ""].filter(Boolean).join(", ")].map(function(x){ return el("td", { text: String(x) }); }))); });
    body.appendChild(tbl);
    body.appendChild(el("h3", { text: "Foreign keys" }));
    if (!t.foreignKeys.length) body.appendChild(el("p", { class: "mute", text: "None." }));
    t.foreignKeys.forEach(function(f){ var link = el("a", { href: "#", text: (f.refSchema ? f.refSchema + "." : "") + f.refTable, style: "color:#38bdf8" }); link.addEventListener("click", function(ev){ ev.preventDefault(); var target = state.objects.filter(function(o){ return o.name === f.refTable && (!f.refSchema || o.schema === f.refSchema); })[0]; if (target) { showTab("paneData"); openTable(target); } }); body.appendChild(el("p", {}, [f.columns.join(", ") + " → ", link, "(" + f.refColumns.join(", ") + ")" + (f.onDelete ? "  ON DELETE " + f.onDelete : "")])); });
    body.appendChild(el("h3", { text: "Indexes" }));
    if (!t.indexes.length) body.appendChild(el("p", { class: "mute", text: "None." }));
    t.indexes.forEach(function(i){ body.appendChild(el("p", { text: i.name + (i.primary ? " (primary)" : i.unique ? " (unique)" : "") + ": " + i.columns.join(", ") })); });
  }).catch(function(e){ body.appendChild(el("p", { class: "banner err", text: errText(e) })); });
}

// ---- SQL ------------------------------------------------------------------------------------------------------
function resultTable(r){
  var wrap = el("div", { style: "margin-bottom:10px" });
  var info = r.columns.length ? r.rowCount + " row" + (r.rowCount === 1 ? "" : "s") + (r.truncated ? " (truncated — more rows exist)" : "") : (r.affectedRows === null ? "OK" : r.affectedRows + " row(s) affected" + (r.lastInsertId ? ", last insert id " + r.lastInsertId : ""));
  wrap.appendChild(el("div", { class: "mute", text: info + " · " + r.elapsedMs + " ms · read-only result" }));
  if (r.columns.length) {
    var t = el("table"); t.appendChild(el("tr", {}, r.columns.map(function(c){ return el("th", { text: c }); })));
    r.rows.forEach(function(row){ t.appendChild(el("tr", {}, r.columns.map(function(c){ var d = display(row[c]); return el("td", { class: d.cls, text: d.text }); }))); });
    wrap.appendChild(t);
  }
  return wrap;
}
function showSqlResult(nodes){ var box = $("sqlResults"); clear(box); nodes.forEach(function(n){ box.appendChild(n); }); }
function sqlError(e){ showSqlResult([el("div", { class: "banner err", text: errText(e) })]); }
function refreshTxState(){ if (!state.conn) return; api("/api/v2/connections").then(function(j){ var c = j.connections.filter(function(x){ return x.connectionId === state.conn.connectionId; })[0]; if (c) { state.conn = c; $("txBadge").hidden = !c.inTransaction; } }).catch(function(){}); }
function runSql(){
  if (!state.conn) return toast("Connect first.", true);
  withConfirm("/api/v2/query", { connectionId: state.conn.connectionId, sql: $("sqlText").value, maxRows: 1000 }).then(function(j){ showSqlResult([resultTable(j.result)]); refreshTxState(); }).catch(function(e){ if (!e.cancelled) sqlError(e); });
}
function runScript(){
  if (!state.conn) return toast("Connect first.", true);
  withConfirm("/api/v2/script", { connectionId: state.conn.connectionId, sql: $("sqlText").value, onError: $("onError").value, atomic: $("atomic").checked }).then(function(j){
    var s = j.script, nodes = [];
    s.statements.forEach(function(st){
      nodes.push(el("div", { class: "mute", text: "Statement " + (st.index + 1) + " (line " + st.line + "): " + st.sql.slice(0, 80) }));
      nodes.push(st.ok ? resultTable(st.result) : el("div", { class: "banner err", text: st.error.message + (st.error.hint ? " — " + st.error.hint : "") }));
    });
    if (s.stoppedAt !== null) nodes.push(el("div", { class: "banner err", text: "Stopped at statement " + (s.stoppedAt + 1) + "." + (s.rolledBack ? " All changes were rolled back." : " Earlier statements were already applied.") }));
    showSqlResult(nodes); refreshTxState();
  }).catch(function(e){ if (!e.cancelled) sqlError(e); });
}
function tx(action){ if (!state.conn) return; api("/api/v2/transaction", { connectionId: state.conn.connectionId, action: action }).then(function(j){ state.conn.inTransaction = j.inTransaction; $("txBadge").hidden = !j.inTransaction; toast("Transaction: " + action); if (action !== "begin") loadPage(); }).catch(fail); }

// ---- wiring ----------------------------------------------------------------------------------------------------
function showTab(paneId){ ["paneData", "paneStruct", "paneSql"].forEach(function(id){ $(id).classList.toggle("active", id === paneId); }); Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){ t.setAttribute("aria-selected", String(t.getAttribute("data-pane") === paneId)); }); }
Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){ t.addEventListener("click", function(){ showTab(t.getAttribute("data-pane")); }); });
$("btnNewConn").addEventListener("click", function(){ profileForm(null); });
$("objFilter").addEventListener("input", renderObjects);
$("btnFilter").addEventListener("click", function(){ var op = $("fOp").value, col = $("fCol").value, v = $("fVal").value; if (!col) return; if (op !== "isNull" && op !== "notNull" && v === "") { state.filter = null; } else { var c = colByName(col); var val = (op === "contains" || op === "startsWith") ? v : (c ? (function(){ try { return parseInput(c, v, false); } catch (e) { toast(e.message, true); return undefined; } })() : v); if (val === undefined) return; state.filter = { column: col, op: op, value: val }; } state.offset = 0; loadPage(); });
$("btnClearFilter").addEventListener("click", function(){ state.filter = null; $("fVal").value = ""; state.offset = 0; loadPage(); });
$("pageSize").addEventListener("change", function(){ state.offset = 0; loadPage(); });
$("btnPrev").addEventListener("click", function(){ state.offset = Math.max(0, state.offset - Number($("pageSize").value)); loadPage(); });
$("btnNext").addEventListener("click", function(){ state.offset += Number($("pageSize").value); loadPage(); });
$("btnRefresh").addEventListener("click", function(){ if (hasPending() && !window.confirm("Refreshing discards unsaved changes. Continue?")) return; discardPending(); loadPage(); });
$("btnExport").addEventListener("click", exportCsv);
$("btnAddRow").addEventListener("click", function(){ if (!state.page) return; state.pending.inserts.push({ values: {}, display: {} }); renderGrid(); });
$("btnDelRow").addEventListener("click", function(){ if (!state.page || state.selected < 0) return toast("Select a row first (click it).", true); var row = state.page.rows[state.selected]; if (!row) return; var id = rowId(row); var expected = {}; state.page.columns.forEach(function(c){ if (!/float|double|real|json|blob|bytea/i.test(c.dataType) && !isBinary(row[c.name])) expected[c.name] = typedValue(c, row[c.name]); }); state.pending.deletes[id] = { key: keyOf(row), expected: expected }; renderGrid(); });
$("btnPreview").addEventListener("click", previewChanges);
$("btnSave").addEventListener("click", saveChanges);
$("btnDiscard").addEventListener("click", function(){ discardPending(); if (state.page) renderGrid(); });
$("btnRun").addEventListener("click", runSql);
$("btnRunScript").addEventListener("click", runScript);
$("btnCancel").addEventListener("click", function(){ if (!state.conn) return; api("/api/v2/cancel", { connectionId: state.conn.connectionId }).then(function(j){ toast(j.canceled ? "Cancel requested." : (j.explanation || "Nothing to cancel.")); }).catch(fail); });
$("btnBegin").addEventListener("click", function(){ tx("begin"); });
$("btnCommit").addEventListener("click", function(){ tx("commit"); });
$("btnRollback").addEventListener("click", function(){ tx("rollback"); });
window.addEventListener("beforeunload", function(ev){ if (hasPending() || (state.conn && state.conn.inTransaction)) { ev.preventDefault(); ev.returnValue = ""; } });
window.__wb = { state: state, loadProfiles: loadProfiles };
loadProfiles();
})();
</script>
</body>
</html>`;
}
