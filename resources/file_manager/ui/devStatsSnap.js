// Export and snapshots of the Code stats section. Export turns the numbers into CSV, JSON or a Markdown table that you
// can copy or save as a new file in the folder (never over an existing file). A snapshot keeps today's numbers under a
// name, so a later count can show what grew or shrank per language.
import { call } from "./api.js";
import { h } from "./dom.js";
import { btn, createStatus, createTable, errorText, field, num, signed } from "./devCore.js";
import { confirmBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { formatDate } from "./util.js";

const MAX_COPY = 100_000;
const DIFF_COLUMNS = [
  { key: "name", label: "Language", rowHeader: true },
  { key: "status", label: "Change" },
  { key: "files", label: "Files now", num: true },
  { key: "filesDelta", label: "Files +/−", num: true },
  { key: "code", label: "Code now", num: true },
  { key: "codeDelta", label: "Code +/−", num: true },
  { key: "commentsDelta", label: "Comments +/−", num: true },
  { key: "blanksDelta", label: "Blanks +/−", num: true },
];
const STATUS_TEXT = { added: "▲ new language", removed: "▼ gone", changed: "● changed", same: "= same" };

export function createSnapshots(env) {
  let list = [];
  const status = createStatus();
  const format = h("select", { id: "dev-export-format", title: "CSV opens in a spreadsheet, JSON is for programs, Markdown is a table you can paste into a README." },
    h("option", { value: "csv" }, "CSV"), h("option", { value: "json" }, "JSON"), h("option", { value: "md" }, "Markdown table"));
  const scope = h("select", { id: "dev-export-scope", title: "Export the table of languages, or the list of files as shown above." },
    h("option", { value: "languages" }, "Languages table"), h("option", { value: "files" }, "Files (as listed above)"));
  const name = h("input", { type: "text", id: "dev-snap-name", maxlength: "60", spellcheck: "false", autocomplete: "off", placeholder: "Before the refactor", title: "A name to recognize this snapshot by." });
  const picker = h("select", { id: "dev-snap-list", title: "Snapshots saved earlier. Pick one to compare today's numbers with it." });
  const diffHost = h("div", { class: "dev-diff" });
  const compare = btn("Compare", "Show what changed per language since the chosen snapshot.", () => doCompare());
  const remove = btn("Delete snapshot", "Delete the chosen snapshot.", () => doDelete(), { danger: true });
  const diffTable = createTable({ caption: "Change since the snapshot. + means more than then, − means fewer.", columns: DIFF_COLUMNS, className: "dev-diff-table" });
  diffHost.append(diffTable.el);
  diffHost.hidden = true;

  const body = () => ({ id: env.getCurrent()?.id, format: format.value, scope: scope.value, ...(scope.value === "files" ? env.getFilter() : {}) });
  const need = () => {
    if (env.getCurrent()) return true;
    status.set("Count the code first, then export or save a snapshot.", true);
    return false;
  };

  async function copy() {
    if (!need()) return;
    try {
      const res = await call("dev/export", body());
      if (res.text.length > MAX_COPY) return status.set("That is too long to copy. Use “Save to folder” instead.", true);
      const r = await call("copytext", { text: res.text });
      status.set(r.copied === false ? "The clipboard isn't available on this computer." : `Copied ${res.rows} rows as ${format.selectedOptions[0].textContent}.`, r.copied === false);
    } catch (err) {
      status.set(errorText(err, "Couldn't copy that."), true);
    }
  }

  async function save() {
    if (!need()) return;
    try {
      const res = await call("dev/export/save", { ...body(), folder: env.getCurrent().result.root });
      status.set(`Saved ${res.rows} rows as ${res.name} in the scanned folder.`);
      toast(`Saved ${res.name}`, { kind: "success" });
    } catch (err) {
      status.set(errorText(err, "Couldn't save the file."), true);
    }
  }

  async function refresh(selectId) {
    try {
      const res = await call("dev/snapshot/list", { root: env.getCurrent()?.result.root ?? env.getRoot() });
      list = res.snapshots;
    } catch {
      list = [];
    }
    list.sort((a, b) => Number(b.sameFolder) - Number(a.sameFolder));
    picker.replaceChildren(...(list.length ? list.map((s) => h("option", { value: s.id }, `${s.name} — ${formatDate(Date.parse(s.createdAt))} — ${num(s.totals.code)} code lines${s.sameFolder ? "" : ` (${s.root})`}`)) : [h("option", { value: "" }, "No snapshots yet")]));
    if (selectId) picker.value = selectId;
    compare.disabled = remove.disabled = !list.length;
  }

  async function saveSnapshot() {
    if (!need()) return;
    try {
      const res = await call("dev/snapshot/save", { id: env.getCurrent().id, name: name.value || `Snapshot ${new Date().toISOString().slice(0, 10)}` });
      name.value = "";
      await refresh(res.snapshot.id);
      status.set(`Snapshot “${res.snapshot.name}” saved: ${num(res.snapshot.totals.code)} lines of code.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't save the snapshot."), true);
    }
  }

  async function doCompare() {
    if (!need() || !picker.value) return status.set("Pick a snapshot to compare with.", true);
    try {
      const res = await call("dev/snapshot/diff", { id: env.getCurrent().id, snapshotId: picker.value });
      const d = res.totals.delta;
      diffTable.render([
        ...res.rows.map((r) => ({ cells: [r.name, STATUS_TEXT[r.status], num(r.files), signed(r.filesDelta), num(r.code), signed(r.codeDelta), signed(r.commentsDelta), signed(r.blanksDelta)] })),
        { cells: ["Total", "", num(res.totals.after.files), signed(d.files), num(res.totals.after.code), signed(d.code), signed(d.comments), signed(d.blanks)] },
      ]);
      diffHost.hidden = false;
      status.set(`Compared with “${res.snapshot.name}” (${formatDate(Date.parse(res.snapshot.createdAt))}): code ${signed(d.code)} lines, files ${signed(d.files)}.`);
    } catch (err) {
      status.set(errorText(err, "Couldn't compare."), true);
    }
  }

  async function doDelete() {
    const chosen = list.find((s) => s.id === picker.value);
    if (!chosen) return;
    if (!(await confirmBox({ title: "Delete this snapshot?", message: `“${chosen.name}” will be removed. Your files are not touched.`, confirmLabel: "Delete snapshot", danger: true }))) return;
    try {
      await call("dev/snapshot/delete", { snapshotId: chosen.id });
      diffHost.hidden = true;
      await refresh();
      status.set("Snapshot deleted.");
    } catch (err) {
      status.set(errorText(err, "Couldn't delete it."), true);
    }
  }

  const el = h("div", { class: "pw-card dev-snaps", hidden: true },
    h("h3", {}, "Export and compare"),
    h("div", { class: "pw-row" }, field("Format", format), field("What", scope),
      btn("Copy", "Copy the export to the clipboard.", () => copy()), btn("Save to folder", "Save the export as a new file in the scanned folder. An existing file is never replaced.", () => save())),
    h("div", { class: "pw-row" }, field("Snapshot name", name), btn("Save snapshot", "Remember today's numbers under this name, to compare with later.", () => saveSnapshot()),
      field("Saved snapshots", picker), compare, remove),
    status.el, diffHost);

  return {
    el,
    setResult() {
      el.hidden = false;
      diffHost.hidden = true;
      refresh();
    },
  };
}
