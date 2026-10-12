/**
 * System Studio -- productivity layer (favorites, recents, JSON search, multi-format export, snapshot compare,
 * keyboard shortcuts, auto-refresh, sparklines, threshold alerts, light/dark theme).
 *
 * The page script below is a String.raw template: it must NOT contain backticks or "${" sequences.
 */
import { systemReportClientSource } from "../src/system_report";

export const SYSTEM_STUDIO_EXTRA_CSS = `<style id="sysExtraCss">
  html.light {
    --bg-base: #eef2f7; --bg-surface: #ffffff; --bg-card: rgba(255,255,255,0.95); --bg-glass: rgba(226,232,240,0.75);
    --border-subtle: rgba(15,23,42,0.14); --text-main: #0f172a; --text-muted: #475569; --text-dim: #64748b;
    --cyan: #0284c7; --cyan-glow: rgba(2,132,199,0.2);
  }
  html.light body { background-image: none; }
  .quick-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 20px; border-bottom:1px solid var(--border-subtle); background: var(--bg-surface); }
  .quick-chips { display:flex; gap:6px; flex-wrap:wrap; flex:1; min-width:200px; align-items:center; }
  .chip { border:1px solid var(--border-subtle); background:var(--bg-glass); color:var(--text-main); padding:3px 10px; border-radius:999px; font-size:11px; cursor:pointer; font-family:var(--font-mono); }
  .chip:hover { border-color:var(--cyan); color:var(--cyan); }
  .chip.fav { border-color:var(--amber); color:var(--amber); }
  .chip-hint { font-size:11px; color:var(--text-dim); }
  .quick-settings { display:flex; gap:12px; align-items:center; font-size:11px; color:var(--text-muted); flex-wrap:wrap; }
  .quick-settings select, .json-search input, .extra-controls select { background:var(--bg-glass); color:var(--text-main); border:1px solid var(--border-subtle); border-radius:6px; padding:4px 8px; font-size:12px; outline:none; }
  .quick-settings label { display:flex; gap:4px; align-items:center; cursor:pointer; }
  .extra-controls { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px; }
  .json-search { display:flex; gap:10px; align-items:center; padding:0 0 8px 0; }
  .json-search input { flex:1; max-width:380px; }
  #jsonSearchCount { font-size:11px; color:var(--text-dim); }
  mark.hit { background: rgba(251,191,36,0.35); color: inherit; border-radius:2px; }
  .spark { width:100%; height:26px; display:block; margin-top:6px; }
  .overlay { position:fixed; inset:0; background:rgba(2,6,23,0.6); display:none; align-items:center; justify-content:center; z-index:9999; }
  .overlay.show { display:flex; }
  .overlay-card { width:min(860px,92vw); max-height:82vh; overflow:auto; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; padding:16px 20px; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
  .overlay-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-weight:700; }
  .overlay table { width:100%; border-collapse:collapse; font-size:12px; font-family:var(--font-mono); }
  .overlay td, .overlay th { border-bottom:1px solid var(--border-subtle); padding:5px 8px; text-align:left; vertical-align:top; word-break:break-word; }
  .diff-add { color:#34d399; } .diff-del { color:#f43f5e; } .diff-chg { color:#fbbf24; }
  kbd { background:var(--bg-glass); border:1px solid var(--border-subtle); border-radius:4px; padding:1px 6px; font-family:var(--font-mono); font-size:11px; }
</style>`;

export const SYSTEM_STUDIO_EXTRA_HEADER_HTML = `
      <button class="btn" id="btnTheme" onclick="toggleTheme()" title="Switch light / dark theme">🌓 Theme</button>
      <button class="btn" id="btnHelp" onclick="showShortcuts()" title="Keyboard shortcuts (?)">⌨ Shortcuts</button>`;

export const SYSTEM_STUDIO_EXTRA_QUICKBAR_HTML = `
  <section class="quick-bar" id="quickBar">
    <div class="quick-chips" id="quickChips"></div>
    <div class="quick-settings">
      <span>Auto-refresh:
        <select id="selAutoRefresh" onchange="applyAutoRefresh()">
          <option value="0">Off</option><option value="1">1s</option><option value="2">2s</option>
          <option value="5">5s</option><option value="10">10s</option><option value="30">30s</option>
        </select>
      </span>
      <label><input type="checkbox" id="chkAutoRun" onchange="saveSettings()"> Re-run method</label>
      <label title="Warn when CPU load or memory reaches 90%"><input type="checkbox" id="chkAlerts" onchange="saveSettings()"> Alerts (90%)</label>
    </div>
  </section>`;

export const SYSTEM_STUDIO_EXTRA_BANNER_HTML = `
        <div class="extra-controls">
          <button class="btn" id="btnFav" onclick="toggleFavorite()" title="Pin this method to the quick bar (*)">☆ Favorite</button>
          <button class="btn" onclick="takeSnapshot()" title="Remember the current result">📸 Snapshot</button>
          <button class="btn" id="btnCompare" onclick="compareSnapshot()" disabled title="Re-run and diff against the snapshot">🔀 Compare</button>
          <select id="selExportFormat" onchange="saveSettings()" title="Export format">
            <option value="json">JSON</option><option value="csv">CSV</option><option value="md">Markdown</option><option value="html">HTML report</option>
          </select>
          <button class="btn" onclick="exportFormatted()" title="Export in the chosen format (Cmd/Ctrl+S)">⬇ Export</button>
          <button class="btn" onclick="fullReport()" title="Run a full system audit and save an HTML report">📄 Full Report</button>
        </div>`;

export const SYSTEM_STUDIO_EXTRA_JSONSEARCH_HTML = `
          <div class="json-search"><input type="text" id="jsonSearch" placeholder="Search keys & values in the JSON..." oninput="applyJsonSearch()"><span id="jsonSearchCount"></span></div>`;

export const SYSTEM_STUDIO_EXTRA_OVERLAY_HTML = `
  <div class="overlay" id="overlay" onclick="if(event.target===this)closeOverlay()">
    <div class="overlay-card"><div class="overlay-head"><span id="overlayTitle"></span><button class="btn" onclick="closeOverlay()">✕ Close</button></div><div id="overlayBody"></div></div>
  </div>`;

const GLUE_JS = String.raw`
(function () {
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem("sysstudio." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("sysstudio." + k, JSON.stringify(v)); } catch (e) {} }
  };
  function $(id) { return document.getElementById(id); }
  function meta() { return { platform: ($("pillPlatform") || {}).textContent || "", generated: new Date().toISOString() }; }
  function hasResult() { return typeof activeResult !== "undefined" && activeResult && activeResult.data !== undefined; }

  // ---------------------------------------------------------------- overlay
  window.showOverlay = function (title, html) { $("overlayTitle").textContent = title; $("overlayBody").innerHTML = html; $("overlay").classList.add("show"); };
  window.closeOverlay = function () { $("overlay").classList.remove("show"); };

  // ---------------------------------------------------------------- theme + settings
  function applyTheme(t) { document.documentElement.classList.toggle("light", t === "light"); }
  window.toggleTheme = function () {
    var next = document.documentElement.classList.contains("light") ? "dark" : "light";
    applyTheme(next); LS.set("theme", next); showToast("Theme: " + next);
  };
  window.saveSettings = function () {
    LS.set("settings", { autoRun: $("chkAutoRun").checked, alerts: $("chkAlerts").checked, format: $("selExportFormat").value });
  };

  // ---------------------------------------------------------------- favorites + recents
  var favorites = LS.get("favs", []);
  var recents = LS.get("recents", []);
  function renderQuickBar() {
    var box = $("quickChips"); if (!box) return;
    box.innerHTML = "";
    function chip(name, cls) {
      var b = document.createElement("button");
      b.className = "chip " + cls; b.textContent = (cls === "fav" ? "★ " : "") + name;
      b.onclick = function () { selectMethod(name, true); };
      box.appendChild(b);
    }
    var rest = recents.filter(function (n) { return favorites.indexOf(n) < 0; }).slice(0, 6);
    if (!favorites.length && !rest.length) {
      box.innerHTML = '<span class="chip-hint">Star a method (press *) or run one - your shortcuts appear here.</span>'; return;
    }
    favorites.forEach(function (n) { chip(n, "fav"); });
    rest.forEach(function (n) { chip(n, "recent"); });
  }
  function updateFavButton() {
    var b = $("btnFav"); if (!b) return;
    var on = favorites.indexOf(activeMethod) >= 0;
    b.textContent = on ? "★ Favorited" : "☆ Favorite";
    b.classList.toggle("btn-primary", on);
  }
  window.toggleFavorite = function () {
    var i = favorites.indexOf(activeMethod);
    if (i >= 0) favorites.splice(i, 1); else favorites.push(activeMethod);
    LS.set("favs", favorites); renderQuickBar(); updateFavButton();
    showToast(i >= 0 ? "Removed from favorites" : "Added to favorites");
  };
  var origSelect = selectMethod;
  selectMethod = async function (name, autoRun) {
    recents = [name].concat(recents.filter(function (x) { return x !== name; })).slice(0, 12);
    LS.set("recents", recents); renderQuickBar();
    var r = await origSelect(name, autoRun);
    updateFavButton();
    return r;
  };

  // ---------------------------------------------------------------- JSON search
  function highlightLine(line, q) {
    var lower = line.toLowerCase(), out = "", pos = 0, at;
    while ((at = lower.indexOf(q, pos)) >= 0) {
      out += escapeHtml(line.slice(pos, at)) + '<mark class="hit">' + escapeHtml(line.slice(at, at + q.length)) + "</mark>";
      pos = at + q.length;
    }
    return out + escapeHtml(line.slice(pos));
  }
  window.applyJsonSearch = function () {
    var q = ($("jsonSearch").value || "").trim().toLowerCase();
    var box = $("jsonInspector"), cnt = $("jsonSearchCount");
    if (!hasResult()) { cnt.textContent = ""; return; }
    if (!q) { box.innerHTML = syntaxHighlight(activeResult.data); cnt.textContent = ""; return; }
    var lines = JSON.stringify(activeResult.data, null, 2).split("\n").filter(function (l) { return l.toLowerCase().indexOf(q) >= 0; });
    cnt.textContent = lines.length + " matching line" + (lines.length === 1 ? "" : "s");
    box.innerHTML = lines.length ? lines.map(function (l) { return highlightLine(l, q); }).join("\n") : "No matches.";
  };
  var origRun = runCurrentMethod;
  runCurrentMethod = async function () { var r = await origRun(); if ($("jsonSearch").value) applyJsonSearch(); return r; };

  // ---------------------------------------------------------------- export
  async function doExport(format, method, data) {
    var m = meta(), content;
    if (format === "csv") content = toCsv(data);
    else if (format === "md") content = toMarkdown(method, data, m);
    else if (format === "html") content = toHtmlReport(method, data, m);
    else content = JSON.stringify({ title: "System Information Studio Pro - Hardware Telemetry Report", timestamp: m.generated, method: method, platform: m.platform, payload: data }, null, 2);
    var res = await apiRequest("/api/export", { method: method, format: format, content: content });
    if (res && res.success) { showToast("Saved " + res.filename); logToConsole("Report exported (" + format + ") to: " + res.path, "ok"); return; }
    try {
      var mime = { csv: "text/csv", md: "text/markdown", html: "text/html" }[format] || "application/json";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([content], { type: mime }));
      a.download = "system_report_" + method + "." + format; document.body.appendChild(a); a.click(); a.remove();
      showToast("Downloaded " + a.download);
    } catch (e) { showToast("Export failed: " + ((res && res.error) || e.message)); }
  }
  window.exportFormatted = function () {
    if (!hasResult()) { showToast("Run a query first!"); return; }
    doExport($("selExportFormat").value, activeMethod, activeResult.data);
  };
  window.fullReport = async function () {
    showToast("Collecting full system audit..."); logToConsole("Collecting full audit (getAllData)...", "info");
    var res = await apiRequest("/api/execute?method=getAllData");
    if (res && res.success) await doExport("html", "getAllData", res.data);
    else showToast("Audit failed: " + ((res && res.error) || "unknown error"));
  };

  // ---------------------------------------------------------------- snapshot + compare
  var snapshot = null;
  window.takeSnapshot = function () {
    if (!hasResult()) { showToast("Run a query first!"); return; }
    snapshot = { method: activeMethod, data: JSON.parse(JSON.stringify(activeResult.data)), at: new Date() };
    $("btnCompare").disabled = false;
    showToast("Snapshot saved for " + activeMethod);
    logToConsole("Snapshot of " + activeMethod + " taken at " + snapshot.at.toLocaleTimeString(), "ok");
  };
  function fmt(v) { return escapeHtml(typeof v === "object" ? JSON.stringify(v) : v); }
  window.compareSnapshot = async function () {
    if (!snapshot) { showToast("Take a snapshot first"); return; }
    if (activeMethod !== snapshot.method) await selectMethod(snapshot.method, false);
    await runCurrentMethod();
    if (!hasResult()) return;
    var d = diffData(snapshot.data, activeResult.data), rows = "";
    d.changed.slice(0, 300).forEach(function (c) { rows += '<tr class="diff-chg"><td>changed</td><td>' + escapeHtml(c.path) + "</td><td>" + fmt(c.from) + " &rarr; " + fmt(c.to) + "</td></tr>"; });
    d.added.slice(0, 200).forEach(function (c) { rows += '<tr class="diff-add"><td>added</td><td>' + escapeHtml(c.path) + "</td><td>" + fmt(c.value) + "</td></tr>"; });
    d.removed.slice(0, 200).forEach(function (c) { rows += '<tr class="diff-del"><td>removed</td><td>' + escapeHtml(c.path) + "</td><td>" + fmt(c.value) + "</td></tr>"; });
    var summary = d.changed.length + " changed, " + d.added.length + " added, " + d.removed.length + " removed, " + d.unchanged + " unchanged";
    logToConsole("Compare " + snapshot.method + " vs snapshot (" + snapshot.at.toLocaleTimeString() + "): " + summary, "info");
    showOverlay("Snapshot comparison: " + snapshot.method, "<p style='margin-bottom:8px;color:var(--text-muted)'>" + summary + "</p>" +
      (rows ? "<table><thead><tr><th>Type</th><th>Path</th><th>Value</th></tr></thead><tbody>" + rows + "</tbody></table>" : "<p>No differences.</p>"));
  };

  // ---------------------------------------------------------------- shortcuts help
  window.showShortcuts = function () {
    var items = [
      ["Cmd/Ctrl + Enter", "Run the selected method"], ["Cmd/Ctrl + K  or  /", "Focus the API filter"],
      ["Cmd/Ctrl + S", "Export in the chosen format"], ["Cmd/Ctrl + Shift + C", "Copy JSON"],
      ["1 / 2 / 3", "Visual / JSON / Log tab"], ["R", "Re-run the method"], ["*", "Toggle favorite"],
      ["?", "This help"], ["Esc", "Close dialogs"]
    ];
    showOverlay("Keyboard shortcuts", "<table>" + items.map(function (i) { return "<tr><td><kbd>" + i[0] + "</kbd></td><td>" + i[1] + "</td></tr>"; }).join("") + "</table>");
  };
  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey, tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (e.key === "Escape") { closeOverlay(); return; }
    if (mod && e.key === "Enter") { e.preventDefault(); runCurrentMethod(); return; }
    if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); $("searchApis").focus(); $("searchApis").select(); return; }
    if (mod && e.shiftKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); copyCurrentJson(); return; }
    if (mod && !e.shiftKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); exportFormatted(); return; }
    if (typing || mod || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); $("searchApis").focus(); }
    else if (e.key === "?") showShortcuts();
    else if (e.key === "1") switchTab("visual");
    else if (e.key === "2") switchTab("json");
    else if (e.key === "3") switchTab("console");
    else if (e.key === "r" || e.key === "R") runCurrentMethod();
    else if (e.key === "*") toggleFavorite();
  }, true);

  // ---------------------------------------------------------------- auto-refresh, sparklines, alerts
  var autoTimer = null, busy = false;
  window.applyAutoRefresh = function () {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    var s = parseInt($("selAutoRefresh").value, 10) || 0;
    LS.set("refresh", s);
    if (!s) return;
    logToConsole("Auto-refresh every " + s + "s" + ($("chkAutoRun").checked ? " (re-running the selected method)" : ""), "info");
    autoTimer = setInterval(async function () {
      if (busy || document.hidden) return;
      busy = true;
      try { await refreshKpiCards(); if ($("chkAutoRun").checked) await runCurrentMethod(); } finally { busy = false; }
    }, s * 1000);
  };

  var hist = { load: [], mem: [] }, lastAlert = {};
  function ensureSpark(cardIndex, id) {
    var cards = document.querySelectorAll(".kpi-card"), card = cards[cardIndex];
    if (!card || $(id)) return;
    var c = document.createElement("canvas"); c.className = "spark"; c.id = id; c.height = 26; card.appendChild(c);
  }
  function drawSpark(id, arr, color) {
    var c = $(id); if (!c) return;
    var w = c.clientWidth || 160, h = 26; c.width = w; c.height = h;
    var g = c.getContext("2d"); g.clearRect(0, 0, w, h);
    if (arr.length < 2) return;
    g.strokeStyle = color; g.lineWidth = 1.6; g.beginPath();
    arr.forEach(function (v, i) {
      var x = (i / (arr.length - 1)) * (w - 2) + 1, y = h - 2 - (Math.min(Math.max(v, 0), 100) / 100) * (h - 4);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.stroke();
  }
  function alertOnce(key, msg) {
    var now = Date.now();
    if (lastAlert[key] && now - lastAlert[key] < 60000) return;
    lastAlert[key] = now; showToast("Warning: " + msg); logToConsole("ALERT: " + msg, "err");
  }
  var origKpi = refreshKpiCards;
  refreshKpiCards = async function () {
    var r = await origKpi();
    try {
      var load = parseFloat($("kpiLoadValue").textContent) || 0, mem = parseFloat($("kpiMemPct").textContent) || 0;
      hist.load.push(load); hist.mem.push(mem);
      if (hist.load.length > 60) { hist.load.shift(); hist.mem.shift(); }
      drawSpark("sparkLoad", hist.load, "#34d399"); drawSpark("sparkMem", hist.mem, "#c084fc");
      if ($("chkAlerts").checked) {
        if (load >= 90) alertOnce("cpu", "CPU load is at " + load.toFixed(0) + "%");
        if (mem >= 90) alertOnce("mem", "memory usage is at " + mem.toFixed(0) + "%");
      }
    } catch (e) {}
    return r;
  };

  // ---------------------------------------------------------------- init
  ensureSpark(1, "sparkLoad"); ensureSpark(2, "sparkMem");
  applyTheme(LS.get("theme", "dark"));
  var st = LS.get("settings", { autoRun: false, alerts: false, format: "json" });
  $("chkAutoRun").checked = !!st.autoRun; $("chkAlerts").checked = !!st.alerts; $("selExportFormat").value = st.format || "json";
  $("selAutoRefresh").value = String(LS.get("refresh", 0));
  renderQuickBar();
  window.addEventListener("DOMContentLoaded", function () { updateFavButton(); applyAutoRefresh(); });
})();
`;

/** Everything that goes into the page's extra <script>: pure helpers (from src/system_report.ts) + UI glue. */
export function systemStudioExtraScript(): string {
  return systemReportClientSource() + "\n" + GLUE_JS;
}
