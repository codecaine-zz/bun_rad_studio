// "Code stats" section of the Dev tool (a "tokei studio"): counts the lines of code, comments and blanks per language
// in the chosen folder, with the real tokei program when it's installed or the built-in counter, and shows a table,
// a chart, and a per-file drill-down. Exports and snapshots live in devStatsSnap.js, the file table in devStatsFiles.js.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { shareBar, barCell } from "./devChart.js";
import { btn, checkbox, createStatus, createTable, errorText, field, num, percent, runJob, seconds } from "./devCore.js";
import { createFiles } from "./devStatsFiles.js";
import { createSnapshots } from "./devStatsSnap.js";
import { plural } from "./util.js";

const COLUMNS = [
  { key: "name", label: "Language", sort: true, rowHeader: true },
  { key: "files", label: "Files", num: true, sort: true },
  { key: "code", label: "Code", num: true, sort: true },
  { key: "comments", label: "Comments", num: true, sort: true },
  { key: "blanks", label: "Blanks", num: true, sort: true },
  { key: "lines", label: "Lines", num: true, sort: true },
  { key: "share", label: "Share of code" },
];

export function createStats(env) {
  let meta = null;
  let job = null;
  let current = null; // { id, result }
  let seq = 0;
  let sort = { key: "code", dir: "desc" };
  let activeLanguage = "";

  const status = createStatus();
  const engine = h("select", { id: "dev-engine", title: "Which program counts. Automatic uses tokei when it is installed and the built-in counter otherwise." },
    h("option", { value: "auto" }, "Automatic"), h("option", { value: "tokei" }, "tokei"), h("option", { value: "builtin" }, "Built-in counter"));
  const gitignore = checkbox("dev-gitignore", "Respect .gitignore", "Skip files that the project's .gitignore files list (build output, dependencies). Usually what you want.", true);
  const hidden = checkbox("dev-hidden", "Include hidden files", "Also count files and folders whose names start with a dot.", false);
  const vendored = checkbox("dev-vendored", "Include vendored folders", "Also count node_modules, target, dist, build and .git. These hold other people's code or build output, so they are left out by default.", false);
  const docs = checkbox("dev-docs", "Treat doc comments as comments", "Count documentation comments (like /// in Rust or docstrings in Python) as comments instead of code. Only the built-in counter can do this.", true);
  const excludes = h("input", { type: "text", id: "dev-excludes", class: "dev-excludes", spellcheck: "false", autocomplete: "off", placeholder: "*.min.js, docs/**", title: "Patterns to leave out, separated by commas, like .gitignore lines. Example: *.min.js, vendor/" });
  const run = btn("Count code", "Count the lines of code, comments and blanks in this folder. Nothing is changed.", () => start(), { primary: true });
  const cancel = btn("Cancel", "Stop counting.", () => job?.cancel());
  cancel.hidden = true;
  const engineLine = h("p", { class: "dev-engine-line", role: "status" });
  const switchBtn = btn("Count again with the other counter", "Run the same count with the other program, to compare.", () => switchEngine());
  switchBtn.hidden = true;
  const note = h("p", { class: "pw-hint dev-note" });
  const filter = h("input", { type: "search", id: "dev-lang-filter", class: "dev-filter", spellcheck: "false", autocomplete: "off", "aria-label": "Filter languages", placeholder: "Filter languages", title: "Type part of a language name to show only the matching languages." });

  const summary = h("div", { class: "dev-cards", "aria-label": "Totals" });
  const chart = h("div", { class: "dev-chart" });
  const table = createTable({ caption: "Lines per language. Press a language to see its files.", columns: COLUMNS, onSort: (key, dir) => { sort = { key, dir }; renderTable(); } });
  const results = h("div", { class: "pw-card dev-results", hidden: true }, h("h3", {}, "Results"), summary, chart,
    h("div", { class: "pw-row" }, filter), table.el);
  const files = createFiles({ ...env, getCurrent: () => current });
  const snaps = createSnapshots({ ...env, getCurrent: () => current, getFilter: files.currentQuery });

  const controls = h("div", { class: "pw-card dev-controls" },
    h("h3", {}, "Count lines of code"),
    h("div", { class: "pw-row" }, field("Counter", engine), run, cancel),
    h("div", { class: "pw-row" }, gitignore, hidden, vendored, docs),
    h("div", { class: "pw-row" }, field("Leave out (patterns)", excludes)),
    engineLine, switchBtn, note, status.el);

  filter.addEventListener("input", () => renderTable());

  function options(forceEngine) {
    return {
      root: env.getRoot(),
      engine: forceEngine ?? engine.value,
      respectGitignore: gitignore.querySelector("input").checked,
      hidden: hidden.querySelector("input").checked,
      vendored: vendored.querySelector("input").checked,
      docAsComment: docs.querySelector("input").checked,
      excludes: excludes.value.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }

  async function loadMeta() {
    if (meta) return;
    try {
      meta = await call("dev/meta");
    } catch {
      return;
    }
    const tokei = engine.querySelector('option[value="tokei"]');
    if (!meta.tokei.installed) {
      tokei.disabled = true;
      tokei.textContent = "tokei (not installed)";
      note.textContent = `tokei isn't installed, so the built-in counter does the counting (${meta.languageCount} languages). ${meta.installHint}`;
    } else note.textContent = `tokei ${meta.tokei.version ?? ""} is installed and is used by default. The built-in counter knows ${meta.languageCount} languages.`;
  }

  async function start(forceEngine) {
    const body = options(forceEngine);
    if (!body.root) return status.set("Choose a folder first: type its location above or press “Use current folder”.", true);
    await loadMeta();
    const mine = ++seq;
    run.disabled = true;
    cancel.hidden = false;
    switchBtn.hidden = true;
    status.set("Counting…");
    try {
      job = runJob("dev/stats/start", body, (p, ms) => mine === seq && status.set(`Counting… ${num(p.files ?? 0)} files, ${num(p.lines ?? 0)} lines so far (${seconds(ms)}).`));
      const done = await job.promise;
      if (mine !== seq) return;
      if (!done.result) return status.set("Cancelled.");
      current = { id: done.id, result: done.result };
      show(done.result, done.state === "cancelled");
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "The count didn't work."), true);
    } finally {
      if (mine === seq) {
        run.disabled = false;
        cancel.hidden = true;
        job = null;
      }
    }
  }

  function switchEngine() {
    const was = current?.result?.engine;
    return start(was === "tokei" ? "builtin" : "tokei");
  }

  function show(result, partial) {
    results.hidden = false;
    const t = result.totals;
    summary.replaceChildren(...[["Files", t.files], ["Code", t.code], ["Comments", t.comments], ["Blanks", t.blanks], ["Lines", t.lines]].map(([label, value]) => h("div", { class: "dev-card" }, h("span", { class: "dev-card-n" }, num(value)), h("span", { class: "dev-card-l" }, label))));
    const { svg, legend } = shareBar(result.languages.filter((l) => l.code > 0).map((l) => ({ name: l.name, value: l.code })), { unit: "lines of code" });
    chart.replaceChildren(h("p", { class: "dev-chart-title" }, "Where the code is"), svg, legend);
    engineLine.textContent = `Counted with ${result.engineLabel} in ${seconds(result.elapsedMs)}: ${plural(t.files, "file")}, ${num(t.code)} lines of code.${partial ? " (Stopped early.)" : ""}`;
    switchBtn.hidden = false;
    const other = result.engine === "tokei" ? "the built-in counter" : "tokei";
    switchBtn.textContent = `Count again with ${other}`;
    switchBtn.disabled = result.engine === "builtin" && !meta?.tokei?.installed;
    switchBtn.title = switchBtn.disabled ? `tokei isn't installed. ${meta?.installHint ?? ""}` : `Run the same count with ${other}, to compare.`;
    const bits = [...result.notes];
    const s = result.skipped;
    if (result.engine === "builtin") {
      if (s.binary || s.tooBig) bits.push(`Skipped ${s.binary} binary and ${s.tooBig} over-size files.`);
      if (s.symlinks) bits.push(`${plural(s.symlinks, "symbolic link")} skipped (never followed).`);
    }
    if (result.stoppedBy) bits.push(`The count stopped at the limit for ${result.stoppedBy}, so these numbers are partial.`);
    note.textContent = bits.join(" ");
    files.setResult(result);
    snaps.setResult(result);
    status.set(partial ? "Stopped. The numbers below are what was counted so far." : `Done: ${plural(result.languages.length, "language")}.`);
    announce(`Counted ${num(t.code)} lines of code in ${plural(t.files, "file")}.`);
    renderTable();
  }

  function renderTable() {
    if (!current) return;
    const result = current.result;
    const needle = filter.value.trim().toLowerCase();
    const rows = result.languages.filter((l) => !needle || l.name.toLowerCase().includes(needle));
    const key = sort.key;
    const sign = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => (key === "name" ? a.name.localeCompare(b.name) : a[key] - b[key]) * sign || a.name.localeCompare(b.name));
    table.setSort(sort.key, sort.dir);
    table.render(rows.map((l) => ({
      key: l.name,
      selected: l.name === activeLanguage,
      onclick: () => { activeLanguage = l.name; files.setLanguage(l.name); renderTable(); },
      cells: [l.name, num(l.files), num(l.code), num(l.comments), num(l.blanks), num(l.lines), h("span", { class: "dev-share-cell" }, barCell(l.code, result.totals.code, `${l.name}: ${percent(l.code, result.totals.code)} of the code`), h("span", { class: "dev-share-text" }, percent(l.code, result.totals.code)))],
    })));
    if (rows.length) {
      const t = result.totals;
      table.table.querySelector("tbody").append(h("tr", { class: "dev-total" }, h("th", { scope: "row" }, "Total"), h("td", { class: "num" }, num(t.files)), h("td", { class: "num" }, num(t.code)), h("td", { class: "num" }, num(t.comments)), h("td", { class: "num" }, num(t.blanks)), h("td", { class: "num" }, num(t.lines)), h("td", {}, "")));
    }
  }

  return {
    el: h("div", { class: "dev-section" }, controls, results, files.el, snaps.el),
    start: () => start(),
    show() {
      loadMeta();
    },
    hasResult: () => !!current,
    cancel: () => job?.cancel(),
  };
}
