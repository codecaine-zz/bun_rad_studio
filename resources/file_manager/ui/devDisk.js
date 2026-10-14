// "Disk & files" section of the Dev tool: where the space in the folder goes, build folders that can be rebuilt (with
// a "Move to Recycle Bin" button that always asks first), the largest files, empty files and folders, and the newest and
// oldest files. Duplicates have their own panel (devDupes.js). Everything here is read only.
import { announce, h } from "./dom.js";
import { barCell } from "./devChart.js";
import { joinRoot, revealPath, trashFolders } from "./devActions.js";
import { btn, createStatus, createTable, errorText, linkButton, num, runJob, seconds } from "./devCore.js";
import { createDupes } from "./devDupes.js";
import { formatDate, formatSize, plural } from "./util.js";

function listCard(title, caption, paths, count, root) {
  const table = createTable({ caption, columns: [{ key: "path", label: "Path", rowHeader: true }, { key: "go", label: "Show" }] });
  table.render(paths.map((p) => ({ cells: [p, linkButton("Show in file list", `Select ${p} in the file list.`, () => revealPath(joinRoot(root, p)))] })));
  return h("section", { class: "pw-card", "aria-label": title }, h("h3", {}, `${title} (${num(count)})`), paths.length ? table.el : h("p", { class: "pw-hint" }, "None."), count > paths.length ? h("p", { class: "pw-hint" }, `Showing the first ${paths.length}.`) : null);
}

export function createDisk(env) {
  const status = createStatus();
  const host = h("div", { class: "dev-cardgrid" });
  let job = null;
  let seq = 0;
  let last = null;
  const run = btn("Scan disk usage", "Measure the folder: what is big, what can be rebuilt, what is empty. Nothing is changed.", () => start(), { primary: true });
  const cancel = btn("Cancel", "Stop the scan.", () => job?.cancel());
  cancel.hidden = true;
  const dupes = createDupes(env);

  function render(r) {
    const root = r.root;
    const cards = [];
    cards.push(h("section", { class: "pw-card", "aria-label": "Summary" }, h("h3", {}, "Summary"), h("div", { class: "dev-cards" },
      ...[["Size", formatSize(r.totalBytes)], ["Files", num(r.files)], ["Folders", num(r.folders)]].map(([l, v]) => h("div", { class: "dev-card" }, h("span", { class: "dev-card-n" }, v), h("span", { class: "dev-card-l" }, l)))),
    r.symlinks ? h("p", { class: "pw-hint" }, `${plural(r.symlinks, "symbolic link")} skipped (never followed).`) : null,
    r.stoppedBy ? h("p", { class: "pw-hint pw-bad" }, `✗ The scan stopped at its limit (${r.stoppedBy}), so these numbers are partial.`) : null));

    const top = createTable({ caption: "Size by top-level entry, largest first", columns: [{ key: "name", label: "Entry", rowHeader: true }, { key: "bytes", label: "Size", num: true }, { key: "files", label: "Files", num: true }, { key: "share", label: "Share" }] });
    top.render(r.top.map((t) => ({ cells: [t.isDir ? `${t.name}/` : t.name, formatSize(t.bytes), num(t.files), barCell(t.bytes, r.totalBytes, `${t.name}: ${r.totalBytes ? Math.round((t.bytes / r.totalBytes) * 100) : 0}% of the folder`)], onclick: () => revealPath(joinRoot(root, t.name)) })));
    cards.push(h("section", { class: "pw-card", "aria-label": "By top-level entry" }, h("h3", {}, "Where the space goes"), top.el));

    const exts = createTable({ caption: "File types by size", columns: [{ key: "ext", label: "Type", rowHeader: true }, { key: "files", label: "Files", num: true }, { key: "bytes", label: "Size", num: true }, { key: "share", label: "Share of size" }] });
    exts.render(r.exts.map((e) => ({ cells: [e.ext === "(none)" ? "(no extension)" : `.${e.ext}`, num(e.files), formatSize(e.bytes), barCell(e.bytes, r.totalBytes, `.${e.ext}: ${r.totalBytes ? Math.round((e.bytes / r.totalBytes) * 100) : 0}% of the size`)] })));
    cards.push(h("section", { class: "pw-card", "aria-label": "File types" }, h("h3", {}, "File types"), exts.el));

    const heavy = createTable({ caption: "Folders that can usually be rebuilt", columns: [{ key: "path", label: "Folder", rowHeader: true }, { key: "bytes", label: "Size", num: true }, { key: "files", label: "Files", num: true }, { key: "act", label: "Action" }] });
    heavy.render(r.heavy.map((f) => ({ cells: [`${f.path}/`, formatSize(f.bytes), num(f.files),
      btn("Move to Recycle Bin…", `Move ${f.path} to the Recycle Bin after you confirm. It goes to the Recycle Bin, not deleted for good.`, async () => { if (await trashFolders([joinRoot(root, f.path)], `"${f.path}" (${formatSize(f.bytes)}) usually holds files that a build or install makes again.`)) start(); }, { danger: true })] })));
    cards.push(h("section", { class: "pw-card", "aria-label": "Heavy folders" }, h("h3", {}, "Heavy folders"),
      h("p", { class: "pw-hint" }, "node_modules, target, .venv, dist, build, .next, __pycache__, Pods, .gradle and DerivedData are usually rebuilt by your tools. Check that a folder holds no work of yours before moving it; it goes to the Recycle Bin and can be restored."),
      r.heavy.length ? heavy.el : h("p", { class: "pw-hint" }, "None found.")));

    const largest = createTable({ caption: "Largest files", columns: [{ key: "path", label: "File", rowHeader: true }, { key: "bytes", label: "Size", num: true }, { key: "mtime", label: "Modified" }] });
    largest.render(r.largest.map((f) => ({ cells: [f.path, formatSize(f.bytes), formatDate(f.mtimeMs)], onclick: () => revealPath(joinRoot(root, f.path)) })));
    cards.push(h("section", { class: "pw-card", "aria-label": "Largest files" }, h("h3", {}, "Largest files"), largest.el));

    for (const [title, rows] of [["Newest files", r.newest], ["Oldest files", r.oldest]]) {
      const t = createTable({ caption: title, columns: [{ key: "path", label: "File", rowHeader: true }, { key: "mtime", label: "Modified" }, { key: "bytes", label: "Size", num: true }] });
      t.render(rows.map((f) => ({ cells: [f.path, formatDate(f.mtimeMs), formatSize(f.bytes)], onclick: () => revealPath(joinRoot(root, f.path)) })));
      cards.push(h("section", { class: "pw-card", "aria-label": title }, h("h3", {}, title), t.el));
    }
    cards.push(listCard("Empty files", "Files with no content", r.emptyFiles.paths, r.emptyFiles.count, root), listCard("Empty folders", "Folders with nothing in them", r.emptyFolders.paths, r.emptyFolders.count, root));
    host.replaceChildren(...cards);
  }

  async function start() {
    const root = env.getRoot();
    if (!root) return status.set("Choose a folder first.", true);
    const mine = ++seq;
    run.disabled = true;
    cancel.hidden = false;
    status.set("Measuring…");
    try {
      job = runJob("dev/disk/start", { root }, (p, ms) => mine === seq && status.set(`Measuring… ${num(p.files ?? 0)} files, ${formatSize(p.bytes ?? 0)} so far (${seconds(ms)}).`));
      const done = await job.promise;
      if (mine !== seq) return;
      last = done.result;
      if (!last) return status.set("Cancelled.");
      render(last);
      status.set(`${done.state === "cancelled" ? "Stopped early. " : ""}${plural(last.files, "file")} using ${formatSize(last.totalBytes)}, measured in ${seconds(last.elapsedMs)}.`);
      announce(status.el.textContent);
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "The scan didn't work."), true);
    } finally {
      if (mine === seq) {
        run.disabled = false;
        cancel.hidden = true;
        job = null;
      }
    }
  }

  return {
    el: h("div", { class: "dev-section" },
      h("div", { class: "pw-card" }, h("h3", {}, "Disk & files"),
        h("p", { class: "pw-hint" }, "Everything below is read only. Symbolic links are never followed, and a very large folder is measured only up to a limit (200,000 files or 60 seconds)."),
        h("div", { class: "pw-row" }, run, cancel), status.el),
      host, dupes.el),
    start,
    cancel: () => { job?.cancel(); dupes.cancel(); },
    last: () => last,
  };
}
