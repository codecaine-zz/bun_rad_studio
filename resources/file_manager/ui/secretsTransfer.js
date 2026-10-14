// Moving data in and out: import from other password managers (with a preview first), restore or export an encrypted
// backup, and the dangerous plain-text CSV export (password again, a loud warning, a file only you can read).
import { call } from "./api.js";
import { h } from "./dom.js";
import { pickFolder } from "./findPicker.js";
import { toast } from "./menus.js";
import { formDialog } from "./secretsDialogs.js";
import { confirmFields } from "./secretsRecovery.js";
import { fullPath, setStatus, sx } from "./secretsState.js";
import { emit, state } from "./state.js";
import { joinPath, plural } from "./util.js";

const today = () => new Date().toISOString().slice(0, 10);

/** "Save in: <folder> [Choose…]" and a file name. */
function whereToSave(defaultName) {
  let folder = state.home;
  const shown = h("span", { class: "sx-value" }, folder);
  const name = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "File name", title: "The name of the new file" });
  name.value = defaultName;
  return {
    el: h("div", { class: "sx-where" }, h("div", { class: "sx-field" }, h("span", { class: "sx-label" }, "Save in"), shown, h("button", { type: "button", class: "btn sx-btn", title: "Choose a different folder", onclick: async () => { const f = await pickFolder({ title: "Save in", start: folder }); if (f) { folder = f; shown.textContent = f; } } }, "Choose…")), h("label", { class: "sx-flabel" }, "File name", name)),
    path: () => joinPath(folder, name.value.trim(), state.sep),
  };
}

export function exportBackupDialog() {
  const where = whereToSave(`secrets-backup-${today()}.radsec`);
  return formDialog({
    title: "Export an encrypted backup", submitLabel: "Save the backup", tip: "Save a copy of the vault as one encrypted file",
    intro: h("p", {}, "This saves a copy of your vault as a single encrypted .radsec file. It opens with the same master password (and key file) as now. Keep it somewhere safe, such as a USB stick; it is protected exactly as strongly as the vault."),
    fields: where.el,
    run: async () => {
      const res = await call("secrets/export-backup", { path: where.path() });
      toast(`Backup saved: ${res.path}`, { kind: "success" });
    },
  });
}

export function exportCsvDialog() {
  const confirm = confirmFields(sx.status);
  const where = whereToSave(`secrets-export-${today()}.csv`);
  const agree = h("input", { type: "checkbox", id: "sx-csv-agree", title: "Tick to confirm you understand the file will not be encrypted" });
  return formDialog({
    title: "Export as a plain-text file", submitLabel: "Export without encryption", danger: true, tip: "Write every password to a plain, unencrypted file",
    intro: [h("p", { class: "sx-warning" }, "WARNING: this writes ALL your passwords and notes to a plain file that is NOT encrypted. Anyone who gets the file can read everything. Only do this to move your data to another program, and delete the file right afterwards."), h("p", { class: "sx-hint" }, "Open it in a plain text editor, not a spreadsheet. The file can only be read by your computer account.")],
    fields: [confirm.el, where.el, h("label", { class: "sx-check" }, agree, " I understand this file is not encrypted")],
    run: async () => {
      if (!agree.checked) throw new Error("agree");
      const res = await call("secrets/export-csv", { ...confirm.values(), path: where.path(), confirm: true });
      toast(`Saved ${plural(res.count, "item")} in ${res.path}. ${res.reminder}`, { kind: "info", timeout: 15000 });
    },
    onClose: confirm.clear,
  });
}

/** Import from another manager (a CSV or Bitwarden JSON file) after a preview, or restore a backup. */
export function importDialog({ backupOnly = false, path: initialPath = "", mode: initialMode = "" } = {}) {
  let mode = backupOnly || initialMode === "backup" ? "backup" : "other";
  let token = "";
  let d = null;
  const mk = (value, label, tip) => {
    const input = h("input", { type: "radio", name: "sx-imp-mode", value, title: tip });
    input.checked = value === mode;
    input.addEventListener("change", () => { mode = value; paint(); });
    return h("label", { class: "sx-check", title: tip }, input, ` ${label}`);
  };
  const path = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "File location", placeholder: "Location of the file, for example ~/Downloads/passwords.csv", title: "Where the file is saved" });
  path.value = initialPath;
  const pass = h("input", { type: "password", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "Master password of the backup", title: "The master password the backup was made with" });
  const keyFile = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "Key file location (if the backup needs one)", placeholder: "Key file location, only if the backup needs one", title: "Only needed if the vault used a key file" });
  const preview = h("div", { class: "sx-preview-box", role: "status" });
  const backupFields = h("div", {}, h("label", { class: "sx-flabel" }, "Master password of that backup", pass), h("label", { class: "sx-flabel" }, "Key file (optional)", keyFile), h("p", { class: "sx-hint" }, "The backup is opened here first to check it. Your current vault is kept as backup .1 before it is replaced."));
  const otherHint = h("p", { class: "sx-hint" }, "Works with exports from Chrome, Edge, Firefox, Safari, 1Password, LastPass, KeePass (CSV) and Bitwarden (unencrypted JSON). You will see a preview before anything is added. Delete the export file afterwards: it isn't encrypted.");
  const unlocked = sx.status?.locked === false;

  function paint() {
    backupFields.hidden = mode !== "backup";
    otherHint.hidden = mode !== "other";
    preview.replaceChildren();
    token = "";
    if (d) d.submit.textContent = mode === "backup" ? "Restore this backup" : "Preview";
  }

  d = formDialog({
    title: backupOnly ? "Restore a backup" : "Import or restore", submitLabel: backupOnly ? "Restore this backup" : "Preview", tip: "Check the file first; nothing is changed until you confirm",
    fields: [backupOnly || !unlocked ? null : h("div", { class: "sx-row" }, mk("other", "From another password manager", "Import a file exported from another program"), mk("backup", "Restore an encrypted backup", "Replace this vault with a .radsec backup")),
      h("label", { class: "sx-flabel" }, "File", path), otherHint, backupFields, preview],
    run: async () => {
      if (mode === "backup") {
        const res = await call("secrets/import-backup", { path: fullPath(path.value, state.home), password: pass.value, ...(keyFile.value.trim() ? { keyFile: fullPath(keyFile.value, state.home) } : {}) });
        pass.value = "";
        setStatus(res.status);
        emit("secrets-items");
        toast("Backup restored.", { kind: "success" });
        return;
      }
      if (!token) {
        const res = await call("secrets/import", { path: fullPath(path.value, state.home) });
        token = res.token;
        preview.replaceChildren(h("div", {},
          h("p", {}, `Found ${plural(res.count, "item")} from ${res.dialect}.${res.duplicates ? ` ${plural(res.duplicates, "item")} already in your vault will be skipped.` : ""}${res.skipped ? ` ${plural(res.skipped, "item")} couldn't be read.` : ""}`),
          res.sample.length ? h("ul", { class: "sx-plainlist" }, res.sample.map((s) => h("li", {}, [s.title, s.subtitle, s.host].filter(Boolean).join(" · ")))) : null,
          res.warnings.map((w) => h("p", { class: "sx-hint" }, w))));
        if (res.count > 0) d.submit.textContent = `Import ${plural(res.count, "item")}`;
        else token = "";
        return "stay";
      }
      const res = await call("secrets/import", { commit: true, token });
      emit("secrets-items");
      toast(`Imported ${plural(res.imported, "item")}. Now delete the file you imported: it isn't encrypted.`, { kind: "success", timeout: 12000 });
    },
  });
  paint();
  return d;
}
