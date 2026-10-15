// @ts-nocheck
/**
 * The "Import with staging" wizard that runs inside the SQLite, MySQL and PostgreSQL studio pages.
 * `studioStagingClient` is serialized with Function.toString() and executed in the page, so it must stay self-contained.
 * All text is set with textContent and all elements are built with createElement: no HTML strings, no external resources.
 */
export function studioStagingClient(cfg) {
  "use strict";
  var ENGINE = cfg.engine;
  var STEPS = ["Source", "Map", "Load to staging", "Check", "Review & promote"];
  var STEP_LABELS = {
    trim: "Remove spaces at the start and end", collapse: "Tidy spaces", emptyToNull: "Empty means no value (NULL)", upper: "UPPER CASE", lower: "lower case", title: "Title Case",
    digits: "Keep digits only", date: "Read as a date", datetime: "Read as a date and time", number: "Read as a number", boolean: "Read yes/no/Y/N/1/0 as true/false", replace: "Replace text", default: "If empty, use a default",
  };
  var NEW_KINDS = ["text", "integer", "decimal", "boolean", "date", "timestamp", "json", "uuid"];
  var KIND_LABELS = { text: "Text", integer: "Whole number", decimal: "Decimal number", boolean: "Yes / no", date: "Date", timestamp: "Date and time", json: "JSON", uuid: "UUID" };

  // ---- small helpers -------------------------------------------------------------------------------------------------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "selected" || k === "readOnly" || k === "tabIndex" || k === "multiple") el[k] = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      });
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) return add(c);
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function fmtN(n) { return Number(n || 0).toLocaleString(); }
  function fmtBytes(n) {
    if (n === null || n === undefined) return "";
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0, v = Number(n);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)) + " " + u[i];
  }
  function plural(n, one, many) { return fmtN(n) + " " + (Number(n) === 1 ? one : (many || one + "s")); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ctrlKey(e) { return e.ctrlKey || e.metaKey; }

  function api(path, body) {
    var opts = { method: body === undefined ? "GET" : "POST", headers: { "X-Studio-Staging": "1" }, credentials: "same-origin" };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch("/api/staging/" + path, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: { message: "The studio gave an unexpected answer (" + res.status + ")." } }; }).then(function (j) {
        if (!j.ok) { var e = new Error((j.error && j.error.message) || "Something went wrong."); e.code = j.error && j.error.code; e.hint = j.error && j.error.hint; throw e; }
        return j;
      });
    });
  }
  function download(path, body, name) {
    return fetch("/api/staging/" + path, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) return res.json().then(function (j) { throw new Error((j.error && j.error.message) || "The download failed."); });
      return res.blob();
    }).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  function runJob(path, body, onTick, ref) {
    return api(path, body).then(function (r) {
      var job = r.job;
      if (ref) ref.id = job.id;
      function poll() {
        return api("job?id=" + job.id).then(function (x) {
          job = x.job;
          if (onTick) onTick(job);
          if (job.state === "running") return sleep(job.seconds < 2 ? 150 : 400).then(poll);
          if (job.state === "done") return job.result;
          var e = new Error((job.error && job.error.message) || "The step did not finish.");
          e.code = job.error && job.error.code; e.hint = job.error && job.error.hint; e.cancelled = job.state === "cancelled";
          throw e;
        });
      }
      return poll();
    });
  }
  function readBlob(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(blob); });
  }

  // ---- state -----------------------------------------------------------------------------------------------------------
  var S = null;
  var els = {};
  var lastFocus = null;
  var toastTimer = null;
  var openState = false;
  var pollTimer = null;

  function fresh() {
    return {
      step: 0, maxStep: 0, info: null, tables: [], source: null, upload: null, analysis: null, settings: {}, pasteText: "", mode: "file",
      targetMode: "existing", table: "", tableInfo: null, rules: [], keyColumns: [], userRules: [], newName: "", newSpec: null, mapping: null, savedUsed: false, dateOrder: null,
      sample: null, batch: null, loadResult: null, summary: null, needsCheck: false, filter: { column: "", code: "" }, problems: [], problemsNext: null, tab: "problems", rowsPage: null,
      promoteMode: "upsert", updateColumns: [], preview: null, previewBusy: false, typed: "", result: null, jobRef: {}, busy: false, area: null, view: "wizard",
    };
  }

  // ---- shell -----------------------------------------------------------------------------------------------------------
  function toast(msg, kind) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.className = "stg-toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = "stg-toast"; }, 5000);
  }
  function banner(kind, text, hint) {
    return h("div", { class: "stg-banner " + kind, role: kind === "error" ? "alert" : "status" }, h("div", { text: text }), hint ? h("div", { class: "stg-hint", text: hint }) : null);
  }
  function errBanner(e) { return banner("error", e.message || String(e), e.hint && e.hint !== e.message ? e.hint : null); }

  function build() {
    if (els.overlay) return;
    var title = h("h2", { id: "stgTitle", text: "Import with staging" });
    els.sub = h("div", { class: "stg-sub", text: "" });
    els.closeBtn = h("button", { class: "stg-iconbtn", type: "button", "aria-label": "Close the import", title: "Close (Esc)", text: "✕", onclick: function () { close(); } });
    els.areaBtn = h("button", { class: "stg-btn", type: "button", title: "See every staging table and past import of this database", text: "🗂 Staging area", onclick: function () { showArea(); } });
    els.steps = h("ol", { class: "stg-steps", "aria-label": "Steps" });
    els.body = h("div", { class: "stg-body", tabIndex: -1 });
    els.foot = h("div", { class: "stg-foot" });
    els.toast = h("div", { class: "stg-toast", role: "status", "aria-live": "polite" });
    els.dialog = h("div", { class: "stg-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "stgTitle" },
      h("div", { class: "stg-head" }, h("div", { class: "stg-headtext" }, title, els.sub), els.areaBtn, els.closeBtn),
      els.steps, els.body, els.foot, els.toast);
    els.overlay = h("div", { class: "stg-overlay", hidden: true }, els.dialog);
    els.overlay.addEventListener("keydown", onKey, true);
    document.body.appendChild(els.overlay);
  }

  function focusables() {
    return Array.prototype.slice.call(els.dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(function (e) { return !e.disabled && !e.closest("[hidden]") && e.offsetParent !== null || e === document.activeElement; });
  }
  function onKey(e) {
    if (!openState) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      var sub = els.dialog.querySelector(".stg-sheet");
      if (sub) { sub.remove(); return; }
      if (S.busy) { toast("A step is running. Use Cancel first.", "warn"); return; }
      close();
      return;
    }
    if (e.key === "Tab") {
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !els.dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !els.dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    // keep the studio's own shortcuts (window shortcuts, query run) from reacting to typing in the wizard
    if (e.key !== "Tab" && e.key !== "Escape") e.stopPropagation();
  }

  function open(opts) {
    build();
    opts = opts || {};
    if (!openState) { S = fresh(); lastFocus = document.activeElement; }
    openState = true;
    els.overlay.hidden = false;
    document.documentElement.classList.add("stg-open");
    return api("info").then(function (info) {
      S.info = info;
      els.sub.textContent = (ENGINE === "sqlite" ? "SQLite" : ENGINE === "mysql" ? "MySQL / MariaDB" : "PostgreSQL") + " · " + info.database + (info.schema ? " · schema " + info.schema : "");
      return api("tables");
    }).then(function (t) {
      S.tables = t.tables;
      render();
      if (opts.fromGrant) return takeGrant();
      if (opts.batchId) return openBatch(opts.batchId);
    }).catch(function (e) { clear(els.body).appendChild(errBanner(e)); renderFoot([]); });
  }
  function close() {
    if (!openState) return;
    if (S && S.source && S.source.id && !(S.batch)) api("source/release", { sourceId: S.source.id }).catch(function () {});
    openState = false;
    els.overlay.hidden = true;
    document.documentElement.classList.remove("stg-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function renderSteps() {
    clear(els.steps);
    STEPS.forEach(function (name, i) {
      var reachable = i <= S.maxStep && !S.busy && S.view === "wizard" && (i !== 2 || !!S.batch);
      var li = h("li", { class: "stg-step" + (i === S.step ? " current" : i < S.step ? " done" : "") + (reachable ? "" : " locked") });
      var b = h("button", { type: "button", class: "stg-stepbtn", disabled: !reachable, "aria-current": i === S.step ? "step" : null, title: reachable ? "Go to step " + (i + 1) + ": " + name : "Not available yet", onclick: function () { go(i); } },
        h("span", { class: "stg-stepnum", text: String(i + 1) }), h("span", { class: "stg-steplabel", text: name }));
      li.appendChild(b);
      els.steps.appendChild(li);
    });
  }
  function go(i) {
    if (S.busy) return;
    S.view = "wizard";
    S.step = i;
    S.maxStep = Math.max(S.maxStep, i);
    render();
  }
  function render() {
    if (!S) return;
    renderSteps();
    els.steps.hidden = S.view !== "wizard";
    clear(els.body);
    if (S.view === "area") return renderArea();
    [renderSource, renderMap, renderLoad, renderCheck, renderPromote][S.step]();
    els.body.scrollTop = 0;
  }
  function renderFoot(buttons) {
    clear(els.foot);
    buttons.forEach(function (b) { if (b) els.foot.appendChild(b); });
  }
  function btn(label, onclick, opts) {
    opts = opts || {};
    return h("button", { type: "button", class: "stg-btn" + (opts.primary ? " primary" : "") + (opts.danger ? " danger" : ""), disabled: !!opts.disabled, title: opts.title || label, onclick: onclick, "aria-label": opts.aria || null }, label);
  }
  function setBusy(v) { S.busy = v; renderSteps(); els.closeBtn.disabled = v; els.areaBtn.disabled = v; }

  // ---- Step 1: Source ---------------------------------------------------------------------------------------------------
  function renderSource() {
    clear(els.body);
    var drop = h("div", { class: "stg-drop", tabIndex: 0, role: "button", "aria-label": "Choose a data file, or drop one here", title: "Choose a CSV, TSV, JSON or JSON Lines file" },
      h("div", { class: "stg-drop-big", text: "Drop a file here, or choose one" }),
      h("div", { class: "stg-muted", text: "CSV, TSV, semicolon- or pipe-separated text, a JSON list, or JSON Lines (NDJSON)." }),
      h("div", { class: "stg-muted", text: "The file stays on this computer: it is sent only to this studio, never over the internet." }));
    var input = h("input", { type: "file", class: "stg-file", accept: ".csv,.tsv,.txt,.tab,.psv,.dat,.json,.ndjson,.jsonl,.log,text/*,application/json", "aria-label": "Choose a data file", hidden: true });
    input.addEventListener("change", function () { if (input.files && input.files[0]) chooseFile(input.files[0]); });
    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    ["dragenter", "dragover"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) chooseFile(f); });

    var paste = h("details", { class: "stg-paste" }, h("summary", { text: "Or paste the data as text" }),
      h("textarea", { class: "stg-textarea", rows: 5, "aria-label": "Paste CSV, TSV or JSON text here", placeholder: "id,name\n1,Ann\n2,Bob", value: S.pasteText, oninput: function (e) { S.pasteText = e.target.value; } }),
      h("div", {}, btn("Use this text", function () { usePaste(); }, { title: "Read the pasted text" })));
    var excel = h("p", { class: "stg-muted" }, "Excel files (.xlsx, .xls) can't be read here. In Excel use File → Save As → “CSV UTF-8” and choose that file.");
    els.srcInfo = h("div", { class: "stg-srcinfo", "aria-live": "polite" });
    els.body.appendChild(h("div", { class: "stg-pane" }, h("h3", { text: "1 · Where is the data?" }), drop, input, paste, excel, els.srcInfo));
    drawSource();
    renderFoot([btn("Next: choose where it goes →", function () { toMap(); }, { primary: true, disabled: !S.analysis || S.busy, title: "Choose the table this data is for" })]);
  }

  function chooseFile(file) {
    S.pasteText = "";
    S.mode = "file";
    if (S.source && S.source.id) api("source/release", { sourceId: S.source.id }).catch(function () {});
    S.source = null; S.analysis = null; S.settings = {};
    var limit = S.info && S.info.limits && S.info.limits.maxFileBytes;
    if (limit && file.size > limit) { clear(els.srcInfo).appendChild(banner("error", "That file is " + fmtBytes(file.size) + ", which is more than the " + fmtBytes(limit) + " limit. Split it into smaller files and load them one after another.")); return; }
    S.upload = { name: file.name, size: file.size, sent: 0, cancel: false };
    setBusy(true);
    drawSource();
    uploadFile(file).then(function (src) {
      S.source = src;
      S.upload = null;
      return analyze({});
    }).catch(function (e) {
      S.upload = null;
      if (!e.cancelled) clear(els.srcInfo).appendChild(errBanner(e));
    }).then(function () { setBusy(false); if (S.step === 0 && S.view === "wizard") renderSource(); });
  }
  function uploadFile(file) {
    var CH = 8 * 1024 * 1024;
    var id = null;
    return api("upload/start", { name: file.name, size: file.size }).then(function (r) {
      id = r.uploadId;
      CH = r.chunkBytes || CH;
      var offset = 0;
      function next() {
        if (S.upload && S.upload.cancel) { api("upload/cancel", { uploadId: id }).catch(function () {}); var c = new Error("Cancelled."); c.cancelled = true; throw c; }
        if (offset >= file.size) return api("upload/finish", { uploadId: id });
        var blob = file.slice(offset, Math.min(file.size, offset + CH));
        return readBlob(blob).then(function (buf) {
          return fetch("/api/staging/upload/chunk?id=" + id + "&offset=" + offset, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/octet-stream" }, body: buf });
        }).then(function (res) { return res.json(); }).then(function (j) {
          if (!j.ok) throw new Error(j.error && j.error.message || "The upload failed.");
          offset = j.received;
          if (S.upload) { S.upload.sent = offset; drawSource(); }
          return next();
        });
      }
      return next();
    }).then(function (done) { return { id: done.sourceId, name: done.name, size: done.size }; });
  }
  function usePaste() {
    if (!S.pasteText.trim()) { toast("Paste some text first.", "warn"); return; }
    setBusy(true);
    api("paste", { text: S.pasteText }).then(function (r) {
      S.source = { id: r.sourceId, name: r.name, size: r.size };
      S.mode = "paste";
      return analyze({});
    }).catch(function (e) { clear(els.srcInfo).appendChild(errBanner(e)); }).then(function () { setBusy(false); renderSource(); });
  }
  function takeGrant() {
    setBusy(true);
    return api("source/grant", {}).then(function (r) {
      S.source = { id: r.sourceId, name: r.name, size: r.size };
      return api("pending/clear", {}).catch(function () {}).then(function () { return analyze({}); });
    }).catch(function (e) { if (els.srcInfo) clear(els.srcInfo).appendChild(errBanner(e)); }).then(function () { setBusy(false); render(); });
  }
  function analyze(overrides) {
    var merged = Object.assign({}, S.settings, overrides);
    return api("analyze", { sourceId: S.source.id, settings: merged }).then(function (r) {
      S.analysis = r.analysis;
      S.settings = r.analysis.settings;
      S.rules = []; S.mapping = null; S.tableInfo = null; S.sample = null;
    });
  }

  function select(options, value, onchange, label, title) {
    var s = h("select", { class: "stg-select", "aria-label": label, title: title || label, onchange: function (e) { onchange(e.target.value); } });
    options.forEach(function (o) { s.appendChild(h("option", { value: o[0], text: o[1], selected: String(o[0]) === String(value) })); });
    return s;
  }
  function labelled(text, control, hint) { return h("label", { class: "stg-field" }, h("span", { class: "stg-fieldlabel", text: text }), control, hint ? h("span", { class: "stg-muted small", text: hint }) : null); }

  function drawSource() {
    if (!els.srcInfo) return;
    clear(els.srcInfo);
    if (S.upload) {
      var pct = S.upload.size ? Math.round(100 * S.upload.sent / S.upload.size) : 0;
      els.srcInfo.appendChild(h("div", { class: "stg-card" },
        h("div", { text: "Sending " + S.upload.name + " to the studio… " + pct + "% (" + fmtBytes(S.upload.sent) + " of " + fmtBytes(S.upload.size) + ")" }),
        bar(pct), btn("Cancel", function () { if (S.upload) S.upload.cancel = true; }, { title: "Stop sending the file" })));
      return;
    }
    var a = S.analysis;
    if (!a) return;
    els.srcInfo.appendChild(h("div", { class: "stg-card" },
      h("div", { class: "stg-strong", text: a.fileName + " · " + fmtBytes(a.size) }),
      h("div", { class: "stg-muted", text: a.summary }),
      a.warnings.map(function (w) { return banner("warn", w); }),
      settingsForm(a),
      h("div", { class: "stg-tablewrap" }, previewTable(a))));
  }
  function settingsForm(a) {
    var s = a.settings;
    var delimOpts = [[",", "Comma ( , )"], ["\t", "Tab"], [";", "Semicolon ( ; )"], ["|", "Pipe ( | )"], ["", "None (one column)"]];
    var isCsv = s.format === "csv";
    return h("div", { class: "stg-settings" },
      labelled("File layout", select([["csv", "Delimited text (CSV, TSV…)"], ["json", "JSON list [ … ]"], ["ndjson", "JSON Lines (one record per line)"]], s.format, function (v) { reread({ format: v }); }, "File layout", "How the file is organised")),
      isCsv ? labelled("Separator", select(delimOpts, s.delimiter, function (v) { reread({ delimiter: v }); }, "Separator between values", "The character that separates the values in a row")) : null,
      isCsv ? labelled("Quote", select([['"', 'Double quote ( " )'], ["'", "Single quote ( ' )"], ["", "No quotes"]], s.quote, function (v) { reread({ quote: v }); }, "Quote character", "The character that wraps values containing the separator")) : null,
      labelled("Text encoding", select([["utf-8", "UTF-8"], ["utf-16le", "UTF-16 (little-endian)"], ["utf-16be", "UTF-16 (big-endian)"], ["windows-1252", "Latin-1 / Windows-1252"]], s.encoding, function (v) { reread({ encoding: v }); }, "Text encoding", "Detected: " + a.encodingLabel + ". Change it if accented letters look wrong.")),
      h("label", { class: "stg-check", title: "Tick when the first row holds column names" }, h("input", { type: "checkbox", checked: s.hasHeader, onchange: function (e) { reread({ hasHeader: e.target.checked }); } }), h("span", { text: "The first row has column names" })));
  }
  function reread(o) {
    setBusy(true);
    analyze(o).catch(function (e) { clear(els.srcInfo).appendChild(errBanner(e)); }).then(function () { setBusy(false); if (S.step === 0) renderSource(); });
  }
  function previewTable(a) {
    var t = h("table", { class: "stg-table", "aria-label": "Preview of the first rows" });
    t.appendChild(h("thead", {}, h("tr", {}, h("th", { class: "num", text: "Row" }), a.columns.map(function (c) { return h("th", { title: c.name + " — looks like: " + c.inferred.kind }, h("div", { text: c.name }), h("div", { class: "stg-chip", text: c.inferred.kind })); }))));
    var tb = h("tbody");
    a.rows.forEach(function (r) {
      tb.appendChild(h("tr", { class: r.problem ? "bad" : "", title: r.problem || null }, h("td", { class: "num", text: String(r.n) }), r.cells.map(function (c) { return h("td", { class: c === null ? "null" : "", text: c === null ? "NULL" : (c.length > 60 ? c.slice(0, 60) + "…" : c) }); })));
    });
    t.appendChild(tb);
    return t;
  }
  function bar(pct, label) {
    var inner = h("div", { class: "stg-barfill" });
    inner.style.width = Math.max(0, Math.min(100, pct)) + "%";
    return h("div", { class: "stg-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct), "aria-label": label || "Progress" }, inner);
  }

  // ---- Step 2: Map ------------------------------------------------------------------------------------------------------
  function toMap() {
    if (!S.analysis) return;
    S.step = 1; S.maxStep = Math.max(S.maxStep, 1);
    S.view = "wizard";
    render();
    if (!S.rules.length) loadSuggestion();
  }
  function savedKey(table) { return "studio-staging:" + ENGINE + ":" + (S.info ? S.info.database : "") + ":" + table; }
  function loadSaved(table) { try { return JSON.parse(localStorage.getItem(savedKey(table)) || "null"); } catch (e) { return null; } }
  function saveMapping() {
    try {
      var key = savedKey(S.targetMode === "new" ? "(new)" : S.table);
      if (S.targetMode === "new") return;
      localStorage.setItem(key, JSON.stringify({ sourceNames: S.analysis.columns.map(function (c) { return c.name; }), rules: S.rules, keyColumns: S.keyColumns, userRules: S.userRules }));
    } catch (e) {}
  }

  function loadSuggestion() {
    var want = S.targetMode === "new" ? null : S.table;
    if (S.targetMode === "existing" && !want) { drawMap(); return; }
    S.busy = true; drawMap();
    api("suggest", { sourceId: S.source.id, settings: S.settings, table: want, newName: S.newName || undefined }).then(function (r) {
      S.busy = false;
      if (want) {
        S.tableInfo = r.table; S.mapping = r.mapping; S.rules = r.mapping.rules; S.keyColumns = r.keyColumns; S.userRules = []; S.savedUsed = false;
        var saved = loadSaved(want);
        var names = S.analysis.columns.map(function (c) { return c.name; });
        if (saved && JSON.stringify(saved.sourceNames) === JSON.stringify(names)) { S.rules = saved.rules; S.keyColumns = saved.keyColumns || S.keyColumns; S.userRules = saved.userRules || []; S.savedUsed = true; }
      } else {
        S.newSpec = r.newTable.spec; S.rules = r.newTable.rules; S.newName = S.newName || r.newTable.name; S.keyColumns = [];
        S.tableInfo = null;
      }
      S.dateOrder = null;
      drawMap(); refreshSample();
    }).catch(function (e) { S.busy = false; drawMap(e); });
  }

  function renderMap() {
    clear(els.body);
    els.mapPane = h("div", { class: "stg-pane" });
    els.body.appendChild(els.mapPane);
    drawMap();
    if (S.rules.length) refreshSample();
  }
  function planBody() {
    var plan = { target: S.targetMode === "new" ? S.newName : S.table, createTable: S.targetMode === "new", rules: S.rules, keyColumns: S.keyColumns, userRules: S.userRules };
    if (S.targetMode === "new") plan.newTable = S.newSpec;
    return plan;
  }
  function mapReady() {
    if (S.targetMode === "existing") return !!S.tableInfo && S.rules.some(function (r) { return r.source.kind !== "skip"; }) && missingRequired().length === 0;
    return !!S.newSpec && /^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(S.newName || "");
  }
  function missingRequired() {
    if (!S.tableInfo) return [];
    return S.tableInfo.columns.filter(function (c) {
      if (!c.required) return false;
      var r = S.rules.find(function (x) { return x.target === c.name; });
      return !r || r.source.kind === "skip";
    }).map(function (c) { return c.name; });
  }

  function drawMap(error) {
    if (!els.mapPane || S.step !== 1) return;
    var pane = clear(els.mapPane);
    pane.appendChild(h("h3", { text: "2 · Where should it go, and how do the columns line up?" }));
    if (error) pane.appendChild(errBanner(error));
    var newOpt = "__new__";
    var tableSelect = select([["", "— choose a table —"]].concat(S.tables.map(function (t) { return [t, t]; })).concat([[newOpt, "➕ Create a new table from this data"]]), S.targetMode === "new" ? newOpt : S.table, function (v) {
      if (v === newOpt) { S.targetMode = "new"; S.table = ""; }
      else { S.targetMode = "existing"; S.table = v; S.newSpec = null; }
      S.rules = []; S.tableInfo = null; S.mapping = null; S.sample = null;
      loadSuggestion();
    }, "Target table", "The table this data is ultimately for. Nothing is written to it until step 5.");
    pane.appendChild(h("div", { class: "stg-card" }, labelled("Load into", tableSelect, "The data goes to a staging table first. Your table is not touched until you promote."),
      S.targetMode === "new" ? labelled("New table name", h("input", { class: "stg-input", type: "text", value: S.newName, maxlength: 60, "aria-label": "Name of the new table", title: "Letters, digits and underscores", onchange: function (e) { S.newName = e.target.value.trim(); drawMap(); } })) : null));
    if (S.busy && !S.rules.length) { pane.appendChild(h("p", { class: "stg-muted", text: "Matching the columns…" })); renderMapFoot(); return; }
    if (S.targetMode === "existing" && S.tableInfo) drawExistingMap(pane);
    if (S.targetMode === "new" && S.newSpec) drawNewMap(pane);
    renderMapFoot();
  }
  function renderMapFoot() {
    var reason = !mapReady() ? (S.targetMode === "existing" && S.tableInfo && missingRequired().length ? "Map the required columns first: " + missingRequired().join(", ") : "Choose a table (or a name for a new one) and map at least one column.") : "";
    renderFoot([btn("← Back", function () { go(0); }), reason ? h("span", { class: "stg-muted foot-reason", text: reason }) : null, btn("Next: load into staging →", function () { startLoad(); }, { primary: true, disabled: !mapReady() || S.busy, title: "Copy the rows into a staging table. Your table is not touched." })]);
  }

  function sourceOptions() {
    var o = [["skip", "— don't fill (the table's default is used) —"]];
    S.analysis.columns.forEach(function (c) { o.push(["col:" + c.name, c.name + (c.samples.length ? "   e.g. " + c.samples[0] : "")]); });
    o.push(["concat", "Join several columns…"], ["split", "Split one column…"], ["const", "A fixed value…"]);
    return o;
  }
  function sourceValue(r) { var s = r.source; return s.kind === "column" ? "col:" + s.column : s.kind === "skip" ? "skip" : s.kind === "constant" ? "const" : s.kind; }
  function setSource(rule, v) {
    var first = S.analysis.columns[0] ? S.analysis.columns[0].name : "";
    if (v === "skip") rule.source = { kind: "skip" };
    else if (v.indexOf("col:") === 0) rule.source = { kind: "column", column: v.slice(4) };
    else if (v === "concat") rule.source = { kind: "concat", columns: S.analysis.columns.slice(0, 2).map(function (c) { return c.name; }), separator: " " };
    else if (v === "split") rule.source = { kind: "split", column: first, separator: " ", part: 1 };
    else rule.source = { kind: "constant", value: "" };
  }
  function sourceExtra(rule, redraw) {
    var s = rule.source;
    if (s.kind === "concat") {
      return h("div", { class: "stg-extra" },
        h("div", { class: "stg-checks", role: "group", "aria-label": "Columns to join" }, S.analysis.columns.map(function (c) {
          return h("label", { class: "stg-check small" }, h("input", { type: "checkbox", checked: s.columns.indexOf(c.name) >= 0, onchange: function (e) { s.columns = S.analysis.columns.map(function (x) { return x.name; }).filter(function (n) { return n === c.name ? e.target.checked : s.columns.indexOf(n) >= 0; }); redraw(); } }), h("span", { text: c.name }));
        })),
        labelled("Put this between them", h("input", { class: "stg-input short", type: "text", value: s.separator, "aria-label": "Text between the joined columns", onchange: function (e) { s.separator = e.target.value; redraw(); } })));
    }
    if (s.kind === "split") {
      return h("div", { class: "stg-extra" },
        select(S.analysis.columns.map(function (c) { return [c.name, c.name]; }), s.column, function (v) { s.column = v; redraw(); }, "Column to split"),
        labelled("Split at", h("input", { class: "stg-input short", type: "text", value: s.separator, "aria-label": "Split at this text", onchange: function (e) { s.separator = e.target.value || " "; redraw(); } })),
        labelled("Take part number", h("input", { class: "stg-input short", type: "number", min: 1, max: 50, value: s.part, "aria-label": "Which part to take, counting from 1", onchange: function (e) { s.part = Math.max(1, Number(e.target.value) || 1); redraw(); } })));
    }
    if (s.kind === "constant") return h("div", { class: "stg-extra" }, h("input", { class: "stg-input", type: "text", value: s.value === null ? "" : s.value, "aria-label": "The fixed value", placeholder: "value for every row", onchange: function (e) { s.value = e.target.value; redraw(); } }));
    return null;
  }

  function stepChip(rule, idx, redraw) {
    var st = rule.steps[idx];
    var inner = [h("span", { text: STEP_LABELS[st.t] || st.t })];
    if (st.t === "date" || st.t === "datetime") inner.push(select([["MDY", "month first (03/04 = March 4)"], ["DMY", "day first (03/04 = 3 April)"], ["YMD", "year first"], ["auto", "work it out"]], st.order || "auto", function (v) { st.order = v; redraw(); }, "How dates are written", "Which comes first in 03/04/2024"));
    if (st.t === "number") inner.push(select([["auto", "work it out"], ["us", "1,234.56"], ["eu", "1.234,56"]], st.locale || "auto", function (v) { st.locale = v; redraw(); }, "How numbers are written"));
    if (st.t === "replace") { inner.push(h("input", { class: "stg-input tiny", type: "text", value: st.find, "aria-label": "Text to find", onchange: function (e) { st.find = e.target.value; redraw(); } }), h("span", { text: "→" }), h("input", { class: "stg-input tiny", type: "text", value: st.with, "aria-label": "Replace with", onchange: function (e) { st.with = e.target.value; redraw(); } })); }
    if (st.t === "default") inner.push(h("input", { class: "stg-input tiny", type: "text", value: st.value, "aria-label": "Default value", onchange: function (e) { st.value = e.target.value; redraw(); } }));
    inner.push(h("button", { type: "button", class: "stg-x", "aria-label": "Remove clean-up: " + (STEP_LABELS[st.t] || st.t), title: "Remove this clean-up", text: "×", onclick: function () { rule.steps.splice(idx, 1); redraw(); } }));
    return h("span", { class: "stg-stepchip" }, inner);
  }
  function addStepSelect(rule, redraw) {
    var o = [["", "+ Add a clean-up…"]];
    Object.keys(STEP_LABELS).forEach(function (k) { o.push([k, STEP_LABELS[k]]); });
    return select(o, "", function (v) {
      if (!v) return;
      var st = { t: v };
      if (v === "date" || v === "datetime") st.order = S.dateOrder || "MDY";
      if (v === "number") st.locale = "auto";
      if (v === "replace") { st.find = ""; st.with = ""; }
      if (v === "default") st.value = "";
      rule.steps.push(st); redraw();
    }, "Add a clean-up step", "Clean the values before they are loaded");
  }
  function typeBadges(c) {
    var b = [h("span", { class: "stg-chip", text: c.type })];
    if (c.pk) b.push(h("span", { class: "stg-chip key", text: "key", title: "Part of the primary key" }));
    if (c.required) b.push(h("span", { class: "stg-chip req", text: "required", title: "Cannot be empty and has no default" }));
    else if (!c.nullable) b.push(h("span", { class: "stg-chip", text: "not empty" }));
    if (c.auto) b.push(h("span", { class: "stg-chip", text: "auto", title: "Filled in by the database when left out" }));
    return b;
  }

  function drawExistingMap(pane) {
    var redraw = function () { drawMap(); refreshSample(); };
    var info = S.tableInfo;
    if (S.savedUsed) pane.appendChild(banner("info", "Your saved mapping for this table was applied. Change anything below if you like."));
    var matched = S.rules.filter(function (r) { return r.source.kind !== "skip"; }).length;
    pane.appendChild(h("p", { class: "stg-muted", text: plural(matched, "column") + " of " + info.columns.length + " matched by name. Check each line; change the source, or add clean-ups so the values fit." }));
    var amb = S.mapping && S.mapping.ambiguousDates && S.mapping.ambiguousDates.length;
    if (amb) {
      var lang = (navigator.language || "en-US");
      var dflt = /^en-(US|PH)|^en$/.test(lang) ? "MDY" : "DMY";
      if (!S.dateOrder) S.dateOrder = dflt;
      pane.appendChild(h("div", { class: "stg-banner warn" }, h("div", { text: "Some dates, like 03/04/2024, could be read two ways." }),
        select([["MDY", "Month first: 03/04/2024 is March 4"], ["DMY", "Day first: 03/04/2024 is 3 April"]], S.dateOrder, function (v) {
          S.dateOrder = v;
          S.rules.forEach(function (r) { r.steps.forEach(function (st) { if (st.t === "date" || st.t === "datetime") st.order = v; }); });
          redraw();
        }, "How the dates in this file are written")));
    }
    var t = h("table", { class: "stg-table map", "aria-label": "Column mapping" });
    t.appendChild(h("thead", {}, h("tr", {}, h("th", { text: "Table column" }), h("th", { text: "Comes from" }), h("th", { text: "Clean-up" }))));
    var tb = h("tbody");
    info.columns.forEach(function (c) {
      var rule = S.rules.find(function (r) { return r.target === c.name; });
      if (!rule) { rule = { target: c.name, source: { kind: "skip" }, steps: [] }; S.rules.push(rule); }
      var missing = c.required && rule.source.kind === "skip";
      var tr = h("tr", { class: missing ? "missing" : rule.source.kind === "skip" ? "skipped" : "" });
      tr.appendChild(h("td", {}, h("div", { class: "stg-strong", text: c.name }), h("div", { class: "stg-chips" }, typeBadges(c)), missing ? h("div", { class: "stg-rose small", text: "Needs a source" }) : null));
      tr.appendChild(h("td", {}, select(sourceOptions(), sourceValue(rule), function (v) { setSource(rule, v); redraw(); }, "Where " + c.name + " comes from", "Choose the file column that fills " + c.name), sourceExtra(rule, redraw)));
      tr.appendChild(h("td", {}, rule.source.kind === "skip" ? h("span", { class: "stg-muted", text: "—" }) : h("div", { class: "stg-steplist" }, rule.steps.map(function (s, i) { return stepChip(rule, i, redraw); }), addStepSelect(rule, redraw))));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    pane.appendChild(h("div", { class: "stg-tablewrap" }, t));
    var unused = S.mapping ? S.analysis.columns.map(function (c) { return c.name; }).filter(function (n) { return !S.rules.some(function (r) { var s = r.source; return (s.kind === "column" && s.column === n) || (s.kind === "concat" && s.columns.indexOf(n) >= 0) || (s.kind === "split" && s.column === n); }); }) : [];
    if (unused.length) pane.appendChild(banner("info", "Not used (they are kept in the raw copy of each row): " + unused.join(", ")));
    pane.appendChild(keyAndRules(info.columns.map(function (c) { return c.name; })));
    pane.appendChild(samplePanel());
  }

  function keyAndRules(colNames) {
    var mapped = S.rules.filter(function (r) { return r.source.kind !== "skip"; }).map(function (r) { return r.target; });
    var keyBox = h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "Which columns say two rows are the same?" }),
      h("div", { class: "stg-muted", text: "Used to find rows that already exist, and repeats in the file. Usually the primary key." }),
      h("div", { class: "stg-checks", role: "group", "aria-label": "Key columns" }, mapped.map(function (n) {
        return h("label", { class: "stg-check", title: "Use " + n + " to recognise the same row" }, h("input", { type: "checkbox", checked: S.keyColumns.indexOf(n) >= 0, onchange: function (e) { S.keyColumns = mapped.filter(function (m) { return m === n ? e.target.checked : S.keyColumns.indexOf(m) >= 0; }); } }), h("span", { text: n }));
      })));
    var rules = h("details", { class: "stg-card", open: S.userRules.length > 0 }, h("summary", { class: "stg-strong", text: "Your own checks (optional)" }));
    var list = h("div", { class: "stg-rules" });
    function drawRules() {
      clear(list);
      S.userRules.forEach(function (r, i) {
        list.appendChild(h("div", { class: "stg-rule" },
          select(mapped.map(function (n) { return [n, n]; }), r.column, function (v) { r.column = v; }, "Rule column"),
          select([["notempty", "must not be empty"], ["regex", "matches the pattern"], ["min", "is at least"], ["max", "is at most"], ["oneof", "is one of (comma list)"], ["length", "length (5, or 3-10)"]], r.kind, function (v) { r.kind = v; }, "Rule kind"),
          h("input", { class: "stg-input", type: "text", value: r.value, "aria-label": "Rule value", placeholder: "value", onchange: function (e) { r.value = e.target.value; } }),
          h("input", { class: "stg-input", type: "text", value: r.message || "", "aria-label": "Message shown when the rule fails", placeholder: "message (optional)", onchange: function (e) { r.message = e.target.value; } }),
          h("button", { type: "button", class: "stg-x", "aria-label": "Remove this rule", title: "Remove this rule", text: "×", onclick: function () { S.userRules.splice(i, 1); drawRules(); } })));
      });
      list.appendChild(btn("+ Add a check", function () { S.userRules.push({ column: mapped[0] || colNames[0], kind: "notempty", value: "" }); drawRules(); }, { title: "Add a rule such as “email matches .+@.+” or “age is at most 120”" }));
    }
    drawRules();
    rules.appendChild(list);
    return h("div", { class: "stg-two" }, keyBox, rules);
  }

  function drawNewMap(pane) {
    var redraw = function () { drawMap(); refreshSample(); };
    var spec = S.newSpec;
    pane.appendChild(h("p", { class: "stg-muted", text: "A new table will be created when you promote. The column types are guessed from the data; change them if you know better." }));
    var t = h("table", { class: "stg-table map", "aria-label": "Columns of the new table" });
    t.appendChild(h("thead", {}, h("tr", {}, h("th", { text: "From the file" }), h("th", { text: "New column" }), h("th", { text: "Type" }), h("th", { text: "May be empty" }), h("th", { text: "Clean-up" }))));
    var tb = h("tbody");
    spec.columns.forEach(function (col, i) {
      var rule = S.rules[i];
      var from = rule.source.kind === "column" ? rule.source.column : "";
      tb.appendChild(h("tr", {},
        h("td", { class: "stg-strong", text: from }),
        h("td", {}, h("input", { class: "stg-input", type: "text", value: col.name, "aria-label": "Name of column " + from, onchange: function (e) {
          var v = e.target.value.trim().replace(/[^A-Za-z0-9_]/g, "_"); if (!v || /^\d/.test(v)) v = "c_" + v;
          if (spec.columns.some(function (x, j) { return j !== i && x.name.toLowerCase() === v.toLowerCase(); })) { toast("Two columns can't have the same name.", "warn"); redraw(); return; }
          S.keyColumns = S.keyColumns.map(function (k) { return k === col.name ? v : k; });
          col.name = v; rule.target = v; redraw();
        } })),
        h("td", {}, select(NEW_KINDS.map(function (k) { return [k, KIND_LABELS[k]]; }), col.kind, function (v) { col.kind = v; redraw(); }, "Type of " + col.name)),
        h("td", {}, h("input", { type: "checkbox", checked: col.nullable, "aria-label": col.name + " may be empty", onchange: function (e) { col.nullable = e.target.checked; } })),
        h("td", {}, h("div", { class: "stg-steplist" }, rule.steps.map(function (s, j) { return stepChip(rule, j, redraw); }), addStepSelect(rule, redraw)))));
    });
    t.appendChild(tb);
    pane.appendChild(h("div", { class: "stg-tablewrap" }, t));
    var names = spec.columns.map(function (c) { return c.name; });
    pane.appendChild(h("label", { class: "stg-check", title: "Adds a column called id that the database numbers for you" }, h("input", { type: "checkbox", checked: spec.autoId, disabled: names.some(function (n) { return n.toLowerCase() === "id"; }), onchange: function (e) { spec.autoId = e.target.checked; } }), h("span", { text: "Add an automatic id column (primary key)" })));
    pane.appendChild(keyAndRules(names));
    pane.appendChild(samplePanel());
  }

  function samplePanel() {
    var box = h("div", { class: "stg-card stg-sample" });
    els.samplePanel = box;
    drawSample();
    return box;
  }
  var sampleTimer = null;
  function refreshSample() {
    clearTimeout(sampleTimer);
    sampleTimer = setTimeout(function () {
      if (!S || !S.source || !S.rules.length || S.step !== 1 || !mapReady()) { S.sample = null; drawSample(); return; }
      api("map/sample", { sourceId: S.source.id, settings: S.settings, plan: planBody() }).then(function (r) { S.sample = r; drawSample(); }).catch(function (e) { S.sample = { error: e }; drawSample(); });
    }, 250);
  }
  function drawSample() {
    var box = els.samplePanel;
    if (!box || !box.isConnected) return;
    clear(box);
    box.appendChild(h("div", { class: "stg-strong", text: "What will be loaded (first rows)" }));
    var s = S.sample;
    if (!s) { box.appendChild(h("div", { class: "stg-muted", text: "Choose a table and map the columns to see a preview." })); return; }
    if (s.error) { box.appendChild(errBanner(s.error)); return; }
    var bad = s.rows.filter(function (r) { return r.problems.length; });
    if (bad.length) box.appendChild(banner("warn", plural(bad.length, "of the first rows has", "of the first rows have") + " values the table will not accept yet. You can fix or skip them after loading, or add clean-ups above.", bad.slice(0, 3).map(function (r) { return "Row " + r.n + ": " + r.problems[0].message; }).join(" · ")));
    var t = h("table", { class: "stg-table", "aria-label": "Preview of the loaded values" });
    t.appendChild(h("thead", {}, h("tr", {}, h("th", { class: "num", text: "Row" }), s.columns.map(function (c) { return h("th", { text: c }); }))));
    var tb = h("tbody");
    s.rows.forEach(function (r) {
      tb.appendChild(h("tr", { class: r.problems.length || r.damaged ? "bad" : "" }, h("td", { class: "num", text: String(r.n) }), r.values.map(function (v, i) {
        var p = r.problems.find(function (x) { return x.column === s.columns[i]; });
        return h("td", { class: (v === null ? "null " : "") + (p ? "cellbad" : ""), title: p ? p.message : null, text: v === null ? "NULL" : (v.length > 50 ? v.slice(0, 50) + "…" : v) });
      })));
    });
    t.appendChild(tb);
    box.appendChild(h("div", { class: "stg-tablewrap" }, t));
  }

  // ---- Step 3: Load into staging ------------------------------------------------------------------------------------------
  function startLoad() {
    saveMapping();
    S.step = 2; S.maxStep = Math.max(S.maxStep, 2);
    S.loadResult = null; S.batch = null;
    render();
    var ref = {};
    S.jobRef = ref;
    setBusy(true);
    var start = Date.now();
    runJob("load", { sourceId: S.source.id, settings: S.settings, plan: planBody() }, function (j) {
      if (!els.loadStatus) return;
      var pct = Math.round(100 * j.fraction);
      els.loadStatus.textContent = fmtN(j.rows) + " rows copied" + (S.source.size ? " · " + pct + "% of the file" : "");
      var b = els.loadBar; if (b) { b.firstChild.style.width = pct + "%"; b.setAttribute("aria-valuenow", String(pct)); }
      if (els.loadTime) els.loadTime.textContent = Math.round((Date.now() - start) / 1000) + " s";
    }, ref).then(function (res) {
      S.loadResult = res; S.batch = res.batch;
      S.needsCheck = true; S.summary = null;
      setBusy(false);
      renderLoad();
    }).catch(function (e) {
      setBusy(false);
      S.loadResult = { error: e };
      renderLoad();
    });
  }
  function renderLoad() {
    clear(els.body);
    var pane = h("div", { class: "stg-pane" }, h("h3", { text: "3 · Copying the rows into a staging table" }));
    els.body.appendChild(pane);
    var r = S.loadResult;
    if (!r) {
      els.loadBar = bar(0, "Loading progress");
      els.loadStatus = h("div", { class: "stg-strong", text: "Starting…" });
      els.loadTime = h("div", { class: "stg-muted" });
      pane.appendChild(h("div", { class: "stg-card" }, els.loadStatus, els.loadBar, els.loadTime, h("p", { class: "stg-muted", text: "Everything is stored as plain text first, so nothing is changed or lost. Your table is not touched." })));
      renderFoot([btn("Cancel", function () { if (S.jobRef.id) api("job/cancel", { id: S.jobRef.id }).catch(function () {}); toast("Cancelling…"); }, { danger: true, title: "Stop and throw away what was copied so far" })]);
      return;
    }
    if (r.error) {
      pane.appendChild(r.error.cancelled ? banner("info", "Cancelled. Nothing was kept, and your table was not touched.") : errBanner(r.error));
      renderFoot([btn("← Back to the mapping", function () { S.maxStep = 1; go(1); }, { primary: true })]);
      return;
    }
    var b = r.batch;
    pane.appendChild(h("div", { class: "stg-card ok" },
      h("div", { class: "stg-big", text: plural(r.rowsLoaded, "row") + " copied" }),
      h("div", { class: "stg-muted", text: "Into the staging table " }), h("code", { class: "stg-code", text: r.stagingTable }),
      h("p", { class: "stg-muted", text: "Your table “" + b.targetTable + "” has not been touched." }),
      r.problemRows ? banner("warn", plural(r.problemRows, "row") + " in the file " + (r.problemRows === 1 ? "was" : "were") + " damaged (wrong number of fields or invalid JSON). " + (r.problemRows === 1 ? "It is" : "They are") + " marked as a problem.") : null,
      r.warnings.map(function (w) { return banner("warn", w); })));
    renderFoot([btn("Check the rows →", function () { toCheck(); }, { primary: true, title: "Look for problems before anything goes into your table" })]);
  }

  // ---- Step 4: Check --------------------------------------------------------------------------------------------------------
  function toCheck() {
    S.step = 3; S.maxStep = Math.max(S.maxStep, 3);
    S.view = "wizard";
    render();
    if (S.needsCheck || !S.summary) runCheck();
  }
  function runCheck() {
    if (S.busy) return;
    var ref = {};
    S.jobRef = ref;
    setBusy(true);
    S.checkProgress = { phase: "Starting", pct: 0 };
    drawCheck();
    var body = { batchId: S.batch.batchId, keyColumns: S.keyColumns, userRules: S.userRules };
    runJob("validate", body, function (j) { S.checkProgress = { phase: j.phase, pct: Math.round(100 * j.fraction), rows: j.rows }; drawCheckProgress(); }, ref).then(function (sum) {
      S.summary = sum; S.needsCheck = false; S.checkProgress = null; S.problems = []; S.problemsNext = null;
      setBusy(false); drawCheck(); loadProblems(true);
    }).catch(function (e) { S.checkProgress = null; S.checkError = e; setBusy(false); drawCheck(); });
  }
  function drawCheckProgress() {
    if (!els.chkStatus || !S.checkProgress) return;
    els.chkStatus.textContent = S.checkProgress.phase + (S.checkProgress.rows ? " · " + fmtN(S.checkProgress.rows) + " rows" : "");
    if (els.chkBar) els.chkBar.firstChild.style.width = (S.checkProgress.pct || 3) + "%";
  }
  function renderCheck() {
    clear(els.body);
    els.checkPane = h("div", { class: "stg-pane" });
    els.body.appendChild(els.checkPane);
    drawCheck();
  }
  function card(label, value, filter, cls, title) {
    var c = h(filter ? "button" : "div", { class: "stg-stat " + (cls || ""), type: filter ? "button" : null, title: title || label, onclick: filter ? function () { S.tab = filter.tab; S.rowStatus = filter.status; S.rowMatch = filter.match; S.rowsPage = null; drawCheck(); loadTab(true); } : null },
      h("div", { class: "stg-statnum", text: fmtN(value) }), h("div", { class: "stg-statlabel", text: label }));
    return c;
  }
  function drawCheck() {
    var pane = els.checkPane;
    if (!pane || !pane.isConnected) return;
    clear(pane);
    pane.appendChild(h("h3", { text: "4 · Check the rows" }));
    if (S.checkError && !S.busy) { pane.appendChild(errBanner(S.checkError)); S.checkError = null; }
    if (S.busy && S.checkProgress) {
      els.chkBar = bar(S.checkProgress.pct || 3, "Checking progress");
      els.chkStatus = h("div", { class: "stg-strong", text: S.checkProgress.phase });
      pane.appendChild(h("div", { class: "stg-card" }, els.chkStatus, els.chkBar, h("p", { class: "stg-muted", text: "The check only reads the staging table and your table. Nothing is changed in your table." })));
      renderFoot([btn("Cancel", function () { if (S.jobRef.id) api("job/cancel", { id: S.jobRef.id }).catch(function () {}); }, { danger: true })]);
      return;
    }
    var sum = S.summary;
    if (!sum) {
      if (S.batch && S.batch.status === "undone") pane.appendChild(banner("info", "This import was undone: your table is back the way it was. You can check the rows again and promote them again, or close the wizard."));
      renderFoot([btn("← Back", function () { go(S.batch ? 2 : 1); }), btn("Check now", function () { runCheck(); }, { primary: true })]);
      return;
    }
    if (S.needsCheck) pane.appendChild(banner("warn", "You changed rows since the last check. Check again before you go on.", null));
    sum.blocking.forEach(function (m) { pane.appendChild(banner("error", m)); });
    sum.notes.forEach(function (m) { pane.appendChild(banner("info", m)); });
    var stats = h("div", { class: "stg-stats" },
      card("Rows in the file", sum.total, { tab: "rows", status: "" }, "", "Show every staged row"),
      card("Ready", sum.valid, { tab: "rows", status: "valid" }, "good", "Rows that passed every check"),
      card("Problems", sum.invalid, { tab: "problems" }, sum.invalid ? "bad" : "", "Rows with something to fix"),
      card("Repeated in the file", sum.duplicate, { tab: "rows", status: "duplicate" }, sum.duplicate ? "warn" : "", "Rows whose key already appeared earlier in the file"),
      card("Skipped by you", sum.skipped, { tab: "rows", status: "skipped" }, "", "Rows you chose to leave out"),
      card("New to the table", sum.newRows, { tab: "rows", status: "valid", match: "new" }, "", "Ready rows that are not in the table yet"),
      card("Already there, changed", sum.changed, { tab: "rows", status: "valid", match: "changed" }, "", "Ready rows that exist in the table with different values"),
      card("Already there, same", sum.same, { tab: "rows", status: "valid", match: "same" }, "", "Ready rows that exist in the table and are identical"));
    pane.appendChild(stats);
    var tools = h("div", { class: "stg-toolbar" },
      btn("Check again", function () { runCheck(); }, { primary: S.needsCheck, title: "Run the checks again (after fixing rows)" }),
      btn("⬇ Download the problem rows (CSV)", function () { download("rejects", { batchId: S.batch.batchId }, "rejected-rows.csv").catch(function (e) { toast(e.message, "error"); }); }, { disabled: !(sum.invalid + sum.duplicate), title: "Save the rows with problems, with the reasons, as a CSV file" }),
      btn("Skip all problem rows", function () { skipAll(); }, { disabled: !(sum.invalid + sum.duplicate), title: "Leave every row with a problem out of the import (you can bring them back)" }),
      btn("Bring skipped rows back", function () { api("skip", { batchId: S.batch.batchId, skip: false }).then(function () { S.needsCheck = true; drawCheck(); }).catch(function (e) { toast(e.message, "error"); }); }, { disabled: !sum.skipped, title: "Return the rows you skipped to the check" }),
      btn("🧽 Clean a column…", function () { cleanSheet(); }, { title: "Apply a clean-up (trim, date, number…) to a whole staged column" }));
    pane.appendChild(tools);
    var tabs = h("div", { class: "stg-tabs", role: "tablist" },
      ["problems", "rows"].map(function (t) { return h("button", { type: "button", role: "tab", class: "stg-tab" + (S.tab === t ? " on" : ""), "aria-selected": S.tab === t ? "true" : "false", onclick: function () { S.tab = t; drawCheck(); loadTab(true); } }, t === "problems" ? "Problems to fix" : "All staged rows"); }));
    pane.appendChild(tabs);
    els.tabBody = h("div", { class: "stg-tabbody" });
    pane.appendChild(els.tabBody);
    drawTab();
    var ready = sum.valid > 0 && sum.blocking.length === 0 && !S.needsCheck;
    renderFoot([btn("← Back", function () { go(S.batch ? 2 : 1); }), ready ? null : h("span", { class: "stg-muted foot-reason", text: S.needsCheck ? "Check again first." : sum.blocking.length ? "Fix the setup problems above." : sum.valid === 0 ? "No row is ready yet." : "" }), btn("Next: review & promote →", function () { toPromote(); }, { primary: true, disabled: !ready, title: "See exactly what would happen to your table" })]);
  }
  function loadTab(reset) { if (S.tab === "problems") loadProblems(reset); else loadRows(reset); }
  function loadProblems(reset) {
    if (reset) { S.problems = []; S.problemsNext = 0; }
    var body = { batchId: S.batch.batchId, after: S.problemsNext || 0 };
    if (S.filter.column) body.column = S.filter.column;
    if (S.filter.code) body.code = S.filter.code;
    return api("problems", body).then(function (r) { S.problems = S.problems.concat(r.lines); S.problemsNext = r.next; drawTab(); }).catch(function (e) { if (els.tabBody) { clear(els.tabBody).appendChild(errBanner(e)); } });
  }
  function loadRows(reset) {
    if (reset) S.rowsPage = { rows: [], columns: [], next: 0 };
    var cur = S.rowsPage || { rows: [], columns: [], next: 0 };
    var body = { batchId: S.batch.batchId, after: cur.next || 0, limit: 50 };
    if (S.rowStatus) body.status = S.rowStatus;
    if (S.rowMatch) body.match = S.rowMatch;
    return api("rows", body).then(function (r) { S.rowsPage = { rows: cur.rows.concat(r.rows), columns: r.columns, next: r.next }; drawTab(); }).catch(function (e) { if (els.tabBody) { clear(els.tabBody).appendChild(errBanner(e)); } });
  }
  function drawTab() {
    var box = els.tabBody;
    if (!box || !box.isConnected) return;
    clear(box);
    if (S.tab === "problems") {
      var sum = S.summary;
      if (sum && sum.byColumn.length) {
        box.appendChild(h("div", { class: "stg-filters" }, h("span", { class: "stg-muted", text: "Filter by column: " }),
          h("button", { type: "button", class: "stg-pill" + (!S.filter.column ? " on" : ""), onclick: function () { S.filter.column = ""; loadProblems(true); } }, "All"),
          sum.byColumn.map(function (c) { return h("button", { type: "button", class: "stg-pill" + (S.filter.column === c.column ? " on" : ""), title: plural(c.count, "problem") + " in " + c.column, onclick: function () { S.filter.column = c.column === "(whole row)" ? "" : c.column; loadProblems(true); } }, c.column + " · " + fmtN(c.count)); })));
      }
      if (!S.problems.length) { box.appendChild(h("p", { class: "stg-muted", text: S.problemsNext === 0 && !S.problems.length ? "Loading…" : (S.needsCheck ? "Nothing is left in this list. Check again to update the numbers." : "No problems found. 🎉") })); return; }
      var t = h("table", { class: "stg-table", "aria-label": "Problems" });
      t.appendChild(h("thead", {}, h("tr", {}, ["Row", "Column", "Value", "What is wrong", "Suggested fix", ""].map(function (x) { return h("th", { text: x }); }))));
      var tb = h("tbody");
      S.problems.forEach(function (p) {
        tb.appendChild(h("tr", {}, h("td", { class: "num", text: String(p.rowNumber === null ? "" : p.rowNumber) }), h("td", { text: p.column || "(whole row)" }), h("td", { class: p.value === null ? "null" : "mono", text: p.value === null ? (p.column ? "NULL" : "—") : p.value }), h("td", { text: p.message }), h("td", { class: "stg-muted", text: p.fix || "" }),
          h("td", { class: "nowrap" }, p.column ? btn("Fix…", function () { fixSheet(p.rowId, p.column); }, { aria: "Fix row " + p.rowNumber + " column " + p.column, title: "Correct this value in the staging table" }) : null, btn("Skip row", function () { api("skip", { batchId: S.batch.batchId, rowIds: [p.rowId], skip: true }).then(function () { S.needsCheck = true; S.problems = S.problems.filter(function (x) { return x.rowId !== p.rowId; }); drawCheck(); }).catch(function (e) { toast(e.message, "error"); }); }, { aria: "Skip row " + p.rowNumber, title: "Leave this row out of the import" }))));
      });
      t.appendChild(tb);
      box.appendChild(h("div", { class: "stg-tablewrap" }, t));
      if (S.problemsNext !== null) box.appendChild(btn("Show more", function () { loadProblems(false); }));
    } else {
      var pg = S.rowsPage;
      if (!pg) { loadRows(true); box.appendChild(h("p", { class: "stg-muted", text: "Loading…" })); return; }
      var f = h("div", { class: "stg-filters" }, h("span", { class: "stg-muted", text: "Show: " }), select([["", "All rows"], ["valid", "Ready"], ["invalid", "Problems"], ["duplicate", "Repeated"], ["skipped", "Skipped"], ["promoted", "Imported"]], S.rowStatus || "", function (v) { S.rowStatus = v; S.rowMatch = ""; loadRows(true); }, "Show rows with this status"));
      box.appendChild(f);
      if (!pg.rows.length) { box.appendChild(h("p", { class: "stg-muted", text: "No rows." })); return; }
      var t2 = h("table", { class: "stg-table", "aria-label": "Staged rows" });
      t2.appendChild(h("thead", {}, h("tr", {}, h("th", { class: "num", text: "Row" }), h("th", { text: "Status" }), pg.columns.map(function (c) { return h("th", { text: c }); }))));
      var tb2 = h("tbody");
      pg.rows.forEach(function (r) {
        var bad = {};
        r.errors.forEach(function (e) { if (e.c) bad[e.c] = e.m; });
        tb2.appendChild(h("tr", { class: r.status === "invalid" ? "bad" : "" }, h("td", { class: "num", text: String(r.rowNumber === null ? "" : r.rowNumber) }), h("td", {}, h("span", { class: "stg-chip st-" + r.status, text: r.status + (r.match ? " · " + r.match : "") })), pg.columns.map(function (c) {
          var v = r.values[c];
          return h("td", { class: (v === null ? "null " : "") + (bad[c] ? "cellbad" : ""), title: bad[c] || "Click to edit this value", tabIndex: 0, role: "button", onclick: function () { fixSheet(r.rowId, c, v); }, onkeydown: function (e) { if (e.key === "Enter") fixSheet(r.rowId, c, v); }, text: v === null ? "NULL" : (v.length > 50 ? v.slice(0, 50) + "…" : v) });
        })));
      });
      t2.appendChild(tb2);
      box.appendChild(h("div", { class: "stg-tablewrap" }, t2));
      if (pg.next !== null) box.appendChild(btn("Show more", function () { loadRows(false); }));
    }
  }
  function skipAll() {
    Promise.all([api("skip", { batchId: S.batch.batchId, status: "invalid", skip: true }), api("skip", { batchId: S.batch.batchId, status: "duplicate", skip: true })]).then(function (r) {
      toast("Skipped " + plural(r[0].changed + r[1].changed, "row") + ".");
      S.needsCheck = true; S.problems = []; drawCheck();
    }).catch(function (e) { toast(e.message, "error"); });
  }
  function sheet(title, content, actions) {
    var old = els.dialog.querySelector(".stg-sheet"); if (old) old.remove();
    var sh = h("div", { class: "stg-sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "stg-sheetbox" }, h("h3", { text: title }), content, h("div", { class: "stg-sheetfoot" }, actions)));
    els.dialog.appendChild(sh);
    var f = sh.querySelector("input, select, textarea, button"); if (f) f.focus();
    return sh;
  }
  function closeSheet() { var s = els.dialog.querySelector(".stg-sheet"); if (s) s.remove(); }
  function fixSheet(rowId, column, current) {
    var input = h("input", { class: "stg-input wide", type: "text", value: current === undefined || current === null ? "" : current, "aria-label": "New value for " + column });
    var errBox = h("div");
    var p = S.problems.find(function (x) { return x.rowId === rowId && x.column === column; });
    sheet("Fix “" + column + "” in row " + (p && p.rowNumber !== null ? p.rowNumber : rowId), h("div", {}, p ? h("p", { class: "stg-muted", text: p.message }) : null, h("label", { class: "stg-field" }, h("span", { class: "stg-fieldlabel", text: "New value" }), input), h("label", { class: "stg-check small" }, h("input", { type: "checkbox", id: "stgFixNull" }), h("span", { text: "Empty (NULL)" })), errBox),
      [btn("Cancel", closeSheet), btn("Save", function () {
        var isNull = els.dialog.querySelector("#stgFixNull").checked;
        api("fix", { batchId: S.batch.batchId, rowId: rowId, column: column, value: isNull ? null : input.value }).then(function () { closeSheet(); S.needsCheck = true; S.problems = S.problems.filter(function (x) { return !(x.rowId === rowId); }); S.rowsPage = null; drawCheck(); toast("Saved. Check again to see if it is fine now."); }).catch(function (e) { clear(errBox).appendChild(errBanner(e)); });
      }, { primary: true })]);
  }
  function cleanSheet() {
    var cols = S.loadResult && S.loadResult.batch ? (S.batch.config && S.batch.config.dataColumns) || [] : [];
    if (!cols.length) cols = (S.rules || []).filter(function (r) { return r.source.kind !== "skip"; }).map(function (r) { return r.target; });
    var colSel = select(cols.map(function (c) { return [c, c]; }), cols[0], function () {}, "Column to clean");
    var stepSel = select(Object.keys(STEP_LABELS).filter(function (k) { return k !== "default" && k !== "replace"; }).map(function (k) { return [k, STEP_LABELS[k]]; }), "trim", function () {}, "Clean-up to apply");
    var ord = select([["MDY", "date: month first"], ["DMY", "date: day first"], ["YMD", "date: year first"]], S.dateOrder || "MDY", function () {}, "Date order");
    var errBox = h("div");
    sheet("Clean a whole column", h("div", {}, h("p", { class: "stg-muted", text: "Applies to every staged row that is not yet imported. Then check again." }), labelled("Column", colSel), labelled("Clean-up", stepSel), labelled("Date order (for date clean-ups)", ord), errBox),
      [btn("Cancel", closeSheet), btn("Apply", function () {
        var step = { t: stepSel.value }; if (step.t === "date" || step.t === "datetime") step.order = ord.value; if (step.t === "number") step.locale = "auto";
        runJob("transform", { batchId: S.batch.batchId, column: colSel.value, step: step }).then(function (r) { closeSheet(); S.needsCheck = true; S.rowsPage = null; drawCheck(); toast(plural(r.changed, "value") + " changed. Check again."); }).catch(function (e) { clear(errBox).appendChild(errBanner(e)); });
      }, { primary: true })]);
  }

  // ---- Step 5: Review & promote -----------------------------------------------------------------------------------------------
  function toPromote() {
    S.step = 4; S.maxStep = Math.max(S.maxStep, 4);
    S.view = "wizard"; S.result = null; S.preview = null;
    var hasKey = S.keyColumns.length > 0;
    if (!hasKey && (S.promoteMode === "upsert" || S.promoteMode === "insert-new" || S.promoteMode === "update-only")) S.promoteMode = "append";
    render();
    loadPreview();
  }
  var MODES = [
    ["insert-new", "Add new rows only", "Rows that are already in the table are left alone.", true],
    ["upsert", "Add new rows and update existing ones (upsert)", "Rows with a matching key are updated; the rest are added. Nothing is ever deleted.", true],
    ["update-only", "Update existing rows only", "Nothing is added; only rows that match a key are changed.", true],
    ["insert-all", "Add every row, stop if one clashes", "All-or-nothing: if any row clashes with an existing one, nothing is changed.", false],
    ["append", "Append all valid rows", "Adds the ready rows. No key needed; repeats are already left out.", false],
  ];
  function renderPromote() {
    clear(els.body);
    els.promotePane = h("div", { class: "stg-pane" });
    els.body.appendChild(els.promotePane);
    drawPromote();
  }
  function allUpdateCandidates() {
    var key = S.keyColumns;
    return S.rules.filter(function (r) { return r.source.kind !== "skip" && key.indexOf(r.target) < 0; }).map(function (r) { return r.target; });
  }
  function drawPromote() {
    var pane = els.promotePane;
    if (!pane || !pane.isConnected) return;
    clear(pane);
    pane.appendChild(h("h3", { text: "5 · Review, then promote into “" + (S.batch ? S.batch.targetTable : "") + "”" }));
    if (S.result) { drawResult(pane); return; }
    var hasKey = S.keyColumns.length > 0;
    var modeBox = h("div", { class: "stg-modes", role: "radiogroup", "aria-label": "What to do with the rows" });
    MODES.forEach(function (m) {
      var disabled = m[3] && !hasKey;
      modeBox.appendChild(h("label", { class: "stg-mode" + (S.promoteMode === m[0] ? " on" : "") + (disabled ? " off" : ""), title: disabled ? "Needs a key column. Choose one in step 2." : m[2] },
        h("input", { type: "radio", name: "stgMode", value: m[0], checked: S.promoteMode === m[0], disabled: disabled, onchange: function () { S.promoteMode = m[0]; drawPromote(); loadPreview(); } }),
        h("div", {}, h("div", { class: "stg-strong", text: m[1] }), h("div", { class: "stg-muted small", text: disabled ? "Needs a key column (step 2)." : m[2] }))));
    });
    pane.appendChild(modeBox);
    if (S.promoteMode === "upsert" || S.promoteMode === "update-only") {
      var cands = allUpdateCandidates();
      if (!S.updateColumns.length) S.updateColumns = cands.slice();
      pane.appendChild(h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "Columns to overwrite on rows that already exist" }),
        h("div", { class: "stg-checks", role: "group", "aria-label": "Columns to update" }, cands.map(function (c) {
          return h("label", { class: "stg-check", title: "Overwrite " + c + " with the file's value" }, h("input", { type: "checkbox", checked: S.updateColumns.indexOf(c) >= 0, onchange: function (e) { S.updateColumns = cands.filter(function (x) { return x === c ? e.target.checked : S.updateColumns.indexOf(x) >= 0; }); loadPreview(); } }), h("span", { text: c }));
        }))));
    }
    els.previewBox = h("div", { class: "stg-previewbox", "aria-live": "polite" });
    pane.appendChild(els.previewBox);
    drawPreview();
    var guarded = S.info && (S.info.production || S.info.readOnlyMarked);
    if (guarded) {
      var typed = h("input", { class: "stg-input", type: "text", value: S.typed, "aria-label": "Type the table name to confirm", placeholder: S.batch.targetTable, oninput: function (e) { S.typed = e.target.value; updatePromoteButton(); } });
      pane.appendChild(h("div", { class: "stg-banner error" }, h("div", { class: "stg-strong", text: S.info.production ? "This is a production connection." : "This connection is marked read-only." }), h("div", { text: "To change data, type the table name “" + S.batch.targetTable + "” to confirm." }), typed));
    }
    els.promoteBtn = btn("Promote", function () { doPromote(); }, { primary: true, disabled: true, title: "Run the import in one transaction" });
    renderFoot([btn("← Back to the check", function () { go(3); }), els.promoteBtn]);
    updatePromoteButton();
  }
  function updatePromoteButton() {
    if (!els.promoteBtn) return;
    var p = S.preview;
    var n = p ? p.counts.insert + p.counts.update : 0;
    var guarded = S.info && (S.info.production || S.info.readOnlyMarked);
    var ok = p && n > 0 && !S.previewBusy && !S.busy && (!p.rehearsal || p.rehearsal.ok) && (!guarded || S.typed === S.batch.targetTable);
    els.promoteBtn.disabled = !ok;
    els.promoteBtn.textContent = n > 0 ? "Promote " + plural(n, "row") + " now" : "Nothing to promote";
  }
  var previewSeq = 0;
  function loadPreview() {
    var seq = ++previewSeq;
    S.preview = null; S.previewBusy = true; S.previewError = null;
    drawPreview();
    api("preview", { batchId: S.batch.batchId, mode: S.promoteMode, updateColumns: S.updateColumns.length ? S.updateColumns : undefined, rehearse: true }).then(function (r) {
      if (seq !== previewSeq) return;
      S.preview = r.preview; S.previewBusy = false; drawPreview(); updatePromoteButton();
    }).catch(function (e) { if (seq !== previewSeq) return; S.previewBusy = false; S.previewError = e; drawPreview(); updatePromoteButton(); });
  }
  function drawPreview() {
    var box = els.previewBox;
    if (!box || !box.isConnected) return;
    clear(box);
    if (S.previewBusy) { box.appendChild(h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "Working out exactly what would happen…" }), h("div", { class: "stg-muted", text: "This is a dry run. Your table is not changed." }))); return; }
    if (S.previewError) { box.appendChild(errBanner(S.previewError)); return; }
    var p = S.preview;
    if (!p) return;
    var c = p.counts;
    box.appendChild(h("div", { class: "stg-stats" },
      h("div", { class: "stg-stat good" }, h("div", { class: "stg-statnum", text: fmtN(c.insert) }), h("div", { class: "stg-statlabel", text: "will be added" })),
      h("div", { class: "stg-stat good" }, h("div", { class: "stg-statnum", text: fmtN(c.update) }), h("div", { class: "stg-statlabel", text: "will be updated" })),
      h("div", { class: "stg-stat" }, h("div", { class: "stg-statnum", text: fmtN(c.skipped) }), h("div", { class: "stg-statlabel", text: "left alone (nothing to change)" })),
      h("div", { class: "stg-stat " + (c.invalid + c.duplicate ? "warn" : "") }, h("div", { class: "stg-statnum", text: fmtN(c.invalid + c.duplicate + c.skippedByPerson) }), h("div", { class: "stg-statlabel", text: "left out (problems or skipped)" }))));
    if (p.rehearsal) box.appendChild(p.rehearsal.ok ? banner("ok", p.rehearsal.skipped ? p.rehearsal.skipped : "Test run passed: the database accepted these changes (then they were rolled back, so nothing was kept).") : banner("error", "The database would refuse this: " + p.rehearsal.error, "Nothing was changed. Fix the rows in step 4, or choose another option."));
    p.warnings.forEach(function (w) { box.appendChild(banner("warn", w)); });
    box.appendChild(banner(p.undo.available ? "info" : "warn", p.undo.available ? "You will be able to undo this import afterwards (as long as nobody changes those rows in the meantime)." : "This import will not be undoable. " + (p.undo.reason || "")));
    if (p.sample.updates.length) {
      var t = h("table", { class: "stg-table", "aria-label": "Sample of updates, before and after" });
      t.appendChild(h("thead", {}, h("tr", {}, ["Row", "Key", "Column", "Before", "After"].map(function (x) { return h("th", { text: x }); }))));
      var tb = h("tbody");
      p.sample.updates.forEach(function (u) { u.changes.forEach(function (ch, i) { tb.appendChild(h("tr", {}, h("td", { class: "num", text: i === 0 ? String(u.row) : "" }), h("td", { class: "mono", text: i === 0 ? u.key : "" }), h("td", { text: ch.column }), h("td", { class: "mono del", text: ch.before === null ? "NULL" : ch.before }), h("td", { class: "mono add", text: ch.after === null ? "NULL" : ch.after }))); }); });
      t.appendChild(tb);
      box.appendChild(h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "Sample of rows that would be updated" }), h("div", { class: "stg-tablewrap" }, t)));
    }
    if (p.sample.inserts.length) {
      var keys = Object.keys(p.sample.inserts[0].values);
      var t3 = h("table", { class: "stg-table", "aria-label": "Sample of new rows" });
      t3.appendChild(h("thead", {}, h("tr", {}, h("th", { class: "num", text: "Row" }), keys.map(function (k) { return h("th", { text: k }); }))));
      var tb3 = h("tbody");
      p.sample.inserts.forEach(function (r) { tb3.appendChild(h("tr", {}, h("td", { class: "num", text: String(r.row) }), keys.map(function (k) { var v = r.values[k]; return h("td", { class: v === null ? "null" : "", text: v === null ? "NULL" : v }); }))); });
      t3.appendChild(tb3);
      box.appendChild(h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "Sample of rows that would be added" }), h("div", { class: "stg-tablewrap" }, t3)));
    }
    var sqlText = p.sql.join(";\n\n") + ";";
    box.appendChild(h("details", { class: "stg-card" }, h("summary", { class: "stg-strong", text: "The exact SQL (no values are typed in: they come from the staging table)" }), h("pre", { class: "stg-sql", tabIndex: 0, "aria-label": "SQL that will run", text: sqlText }),
      btn("Copy SQL", function () { copyText(sqlText); }, { title: "Copy the SQL to the clipboard" })));
  }
  function copyText(text) {
    var done = function () { toast("Copied."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) { var ta = h("textarea", { value: text, "aria-hidden": "true" }); document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }

  function doPromote() {
    var ref = {};
    S.jobRef = ref;
    setBusy(true);
    var wait = h("div", { class: "stg-card" }, h("div", { class: "stg-strong", id: "stgPromoteStatus", text: "Promoting…" }), bar(8, "Promotion progress"));
    clear(els.previewBox).appendChild(wait);
    els.promoteBtn.disabled = true;
    runJob("promote", { batchId: S.batch.batchId, mode: S.promoteMode, updateColumns: S.updateColumns.length ? S.updateColumns : undefined, confirmTyped: S.typed || undefined }, function (j) { var el = document.getElementById("stgPromoteStatus"); if (el) el.textContent = j.phase; }, ref).then(function (res) {
      S.result = res; S.batch = res.batch; setBusy(false); drawPromote();
    }).catch(function (e) { setBusy(false); S.previewError = e; drawPromote(); updatePromoteButton(); });
  }
  function drawResult(pane) {
    var r = S.result, b = r.batch;
    pane.appendChild(h("div", { class: "stg-card ok" }, h("div", { class: "stg-big", text: "Done." }),
      h("p", { text: plural(r.counts.inserted, "row") + " added, " + plural(r.counts.updated, "row") + " updated, " + plural(r.counts.skipped, "row") + " left alone." }),
      h("p", { class: "stg-muted", text: "Recorded as import " + b.batchId + " in the table _import_batches." })));
    var area = h("div", { class: "stg-card" }, h("div", { class: "stg-strong", text: "The staging table " + b.stagingTable }), h("p", { class: "stg-muted", text: "It is kept for " + (S.info.limits.retainDays) + " days so you can look back at it. It is never dropped without you asking." }),
      h("div", { class: "stg-toolbar" }, btn("Drop it now", function () { api("drop", { batchId: b.batchId }).then(function () { toast("Staging table dropped."); b.droppedAt = new Date().toISOString(); drawPromote(); }).catch(function (e) { toast(e.message, "error"); }); }, { disabled: !!b.droppedAt, title: "Delete the staging table (the import record stays)" }), btn("Keep it", function () { toast("It stays in the staging area."); }, { title: "Leave the staging table where it is" })));
    pane.appendChild(area);
    var undoBtn = btn("↩ Undo this import", function () { undoSheet(b); }, { disabled: !r.undo.available, danger: true, title: r.undo.available ? "Put the table back the way it was before this import" : (r.undo.reason || "Not available") });
    pane.appendChild(h("div", { class: "stg-toolbar" }, undoBtn, btn("Import another file", function () { S = Object.assign(fresh(), { info: S.info, tables: S.tables }); render(); }, { title: "Start again with a new file" }), btn("🗂 Staging area", function () { showArea(); })));
    renderFoot([btn("Close", function () { close(); }, { primary: true })]);
  }
  function undoSheet(b) {
    var errBox = h("div");
    var typed = null;
    var guarded = S.info && (S.info.production || S.info.readOnlyMarked);
    if (guarded) typed = h("input", { class: "stg-input", type: "text", "aria-label": "Type the table name to confirm", placeholder: b.targetTable });
    sheet("Undo this import?", h("div", {}, h("p", { text: "The rows this import added will be removed, and the rows it changed will get their old values back. This only works if nobody has changed those rows since. Otherwise nothing is touched and you will see which rows are in the way." }), typed, errBox),
      [btn("Cancel", closeSheet), btn("Undo the import", function () {
        api("undo", { batchId: b.batchId, confirmTyped: typed ? typed.value : undefined }).then(function (r) {
          if (r.result.ok) { closeSheet(); toast("Undone: " + plural(r.result.deleted, "row") + " removed, " + plural(r.result.restored, "row") + " restored."); S.result = null; S.batch = r.result.batch; S.step = 3; S.needsCheck = true; S.summary = null; render(); return; }
          clear(errBox).appendChild(banner("error", "These rows were changed after the import, so nothing was undone:", r.result.conflicts.slice(0, 10).map(function (c) { return c.key + " — " + c.reason; }).join("; ")));
        }).catch(function (e) { clear(errBox).appendChild(errBanner(e)); });
      }, { danger: true })]);
  }

  // ---- Staging area -------------------------------------------------------------------------------------------------------------------
  function showArea() {
    if (S.busy) return;
    S.view = "area"; render();
  }
  function openBatch(batchId) {
    return api("batch/open", { batchId: batchId }).then(function (r) {
      var b = r.batch;
      if (!b.config || !b.config.plan) throw new Error("This import has no saved mapping, so it can't be re-opened.");
      var plan = b.config.plan;
      S.batch = b; S.view = "wizard";
      S.targetMode = plan.createTable ? "new" : "existing"; S.table = plan.createTable ? "" : plan.target; S.newName = plan.createTable ? plan.target : "";
      S.rules = plan.rules; S.keyColumns = plan.keyColumns; S.userRules = plan.userRules || [];
      S.tableInfo = r.table; S.newSpec = plan.createTable ? { columns: plan.newTable.columns, autoId: plan.newTable.autoId } : null;
      S.loadResult = { batch: b, stagingTable: b.stagingTable, rowsLoaded: b.rowsTotal, problemRows: 0, warnings: [] };
      S.summary = null; S.needsCheck = true; S.maxStep = 4;
      if (b.status === "promoted") { S.result = { batch: b, counts: { inserted: b.rowsInserted, updated: b.rowsUpdated, skipped: b.rowsSkipped }, undo: { available: b.undoable, reason: b.undoNote } }; S.step = 4; render(); return; }
      if (!b.stagingTable || b.droppedAt) throw new Error("The staging table of this import was dropped.");
      S.step = 3; render(); runCheck();
    }).catch(function (e) { toast(e.message, "error"); S.view = "area"; render(); });
  }
  function renderArea() {
    var pane = h("div", { class: "stg-pane" }, h("h3", { text: "Staging area" }), h("p", { class: "stg-muted", text: "Every import of this database, with the staging table it left behind. Staging tables are never dropped unless you say so." }));
    els.body.appendChild(pane);
    var box = h("div"); pane.appendChild(box);
    api("area", {}).then(function (a) {
      S.area = a; clear(box);
      if (!a.entries.length && !a.orphans.length) box.appendChild(h("p", { class: "stg-muted", text: "Nothing here yet. Imports you start will be listed." }));
      if (a.entries.length) {
        var t = h("table", { class: "stg-table", "aria-label": "Imports and staging tables" });
        t.appendChild(h("thead", {}, h("tr", {}, ["Staging table", "File", "Target", "Status", "Rows", "Size", "Age", ""].map(function (x) { return h("th", { text: x }); }))));
        var tb = h("tbody");
        a.entries.forEach(function (e) {
          var b = e.batch;
          var gone = !b.stagingTable || e.rows === null;
          tb.appendChild(h("tr", { class: e.stale ? "stale" : "" },
            h("td", { class: "mono nowrap", text: gone ? (b.stagingTable ? b.stagingTable + " (dropped)" : "—") : b.stagingTable }), h("td", { class: "nowrap", text: b.sourceName || "" }), h("td", { class: "nowrap", text: (b.targetTable || "") + (b.newTable ? " (new)" : "") }),
            h("td", { class: "nowrap" }, h("span", { class: "stg-chip st-" + b.status, text: b.status }), e.stale ? h("div", { class: "stg-amber small", text: "older than " + a.retainDays + " days: drop it?" }) : null),
            h("td", { class: "num", text: e.rows === null ? String(b.rowsTotal) : fmtN(e.rows) }), h("td", { class: "nowrap", text: fmtBytes(e.bytes) }), h("td", { class: "nowrap", text: e.ageDays + " d" }),
            h("td", { class: "nowrap" },
              btn(b.status === "promoted" ? "View" : "Open", function () { openBatch(b.batchId); }, { disabled: gone && b.status !== "promoted", title: "Open this import again" }),
              btn("Export problems", function () { download("rejects", { batchId: b.batchId }, "rejected-rows.csv").catch(function (x) { toast(x.message, "error"); }); }, { disabled: gone, title: "Download the rows with problems as CSV" }),
              b.status === "promoted" && b.undoable ? btn("Undo", function () { S.batch = b; S.result = null; undoFromArea(b); }, { danger: true, title: "Undo this import" }) : null,
              btn("Drop staging", function () { window.studioConfirm("Drop the staging table " + b.stagingTable + "? The import record is kept.", { title: "Drop staging table", okLabel: "Drop", danger: true }).then(function (ok) { if (ok) api("drop", { batchId: b.batchId }).then(function () { renderArea2(); }).catch(function (x) { toast(x.message, "error"); }); }); }, { disabled: gone, title: "Delete the staging table" }),
              b.status !== "promoted" && gone ? btn("Forget", function () { api("forget", { batchId: b.batchId }).then(renderArea2).catch(function (x) { toast(x.message, "error"); }); }, { title: "Remove this record" }) : null)));
        });
        t.appendChild(tb);
        box.appendChild(h("div", { class: "stg-tablewrap" }, t));
      }
      if (a.orphans.length) box.appendChild(banner("warn", "Staging tables without a record (left by an interrupted load): " + a.orphans.join(", ") + ". You can drop them in the table list."));
    }).catch(function (e) { clear(box).appendChild(errBanner(e)); });
    renderFoot([btn("← Back to the import", function () { S.view = "wizard"; render(); }, { primary: true })]);
  }
  function renderArea2() { render(); }
  function undoFromArea(b) { undoSheetArea(b); }
  function undoSheetArea(b) {
    var errBox = h("div");
    var guarded = S.info && (S.info.production || S.info.readOnlyMarked);
    var typed = guarded ? h("input", { class: "stg-input", type: "text", "aria-label": "Type the table name to confirm", placeholder: b.targetTable }) : null;
    sheet("Undo import " + b.batchId + "?", h("div", {}, h("p", { text: "Removes the rows it added and restores the old values of the rows it changed, if nobody changed them since." }), typed, errBox),
      [btn("Cancel", closeSheet), btn("Undo the import", function () {
        api("undo", { batchId: b.batchId, confirmTyped: typed ? typed.value : undefined }).then(function (r) {
          if (r.result.ok) { closeSheet(); toast("Undone."); render(); return; }
          clear(errBox).appendChild(banner("error", "Nothing was undone. These rows were changed after the import:", r.result.conflicts.slice(0, 10).map(function (c) { return c.key + " — " + c.reason; }).join("; ")));
        }).catch(function (e) { clear(errBox).appendChild(errBanner(e)); });
      }, { danger: true })]);
  }

  // ---- entry points -----------------------------------------------------------------------------------------------------------------------
  function mountButton() {
    var host = document.querySelector("header .header-actions") || document.querySelector(".header-actions");
    if (!host || document.getElementById("btnStagingImport")) return;
    var b = h("button", { class: "btn", id: "btnStagingImport", type: "button", title: "Bring data in safely: load it into a staging table, check it, then promote it into your table. Undoable.", text: "📥 Import with staging", onclick: function () { open(); } });
    var full = document.getElementById("btnFullscreen");
    if (full && full.parentNode === host) host.insertBefore(b, full); else host.appendChild(b);
  }
  function watchPending() {
    if (pollTimer) return;
    function tick() {
      if (openState || document.hidden) return;
      api("pending").then(function (r) {
        if (!r.pending || openState) return;
        open({ fromGrant: !!r.pending.path });
      }).catch(function () {});
    }
    tick();
    pollTimer = setInterval(tick, 2500);
  }
  function init() { mountButton(); watchPending(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.StudioStaging = { open: open, close: close, state: function () { return S; } };
}
