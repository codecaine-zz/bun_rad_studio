// The Secrets tab's dialogs: settings, vault info, the activity log, change the master password, re-key, and erase.
// Anything that changes the keys asks for the master password again. Errors appear inside the dialog, so nothing typed is lost.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { openDialog } from "./dialogs.js";
import { toast } from "./menus.js";
import { confirmFields, deviceDialog, recoveryDialog } from "./secretsRecovery.js";
import { errorText, fullPath, refreshStatus, setStatus, sx } from "./secretsState.js";
import { state } from "./state.js";
import { formatDate, formatSize, plural } from "./util.js";
import { passwordFields } from "./vaultForm.js";

/**
 * A dialog with one form. `run()` does the work; when it throws, the message shows in the dialog and nothing is lost.
 * If `run()` resolves "stay", the dialog stays open (used for a preview step).
 * @param {{ title: string, intro?: any, fields?: any, submitLabel: string, tip: string, run: () => Promise<any>, wide?: boolean, danger?: boolean, onClose?: () => void }} options
 */
export function formDialog({ title, intro = null, fields = null, submitLabel, tip, run, wide = true, danger = false, onClose = () => {} }) {
  let d = null;
  const submit = h("button", { type: "submit", class: `btn primary${danger ? " danger" : ""}`, title: tip }, submitLabel);
  const form = h("form", {
    class: "sx-form", autocomplete: "off", "aria-label": title,
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      d.setError("");
      try {
        if ((await run()) === "stay") {
          submit.disabled = false;
          return;
        }
        d.close(true);
      } catch (err) {
        d.setError(errorText(err));
        submit.disabled = false;
      }
    },
  }, intro, fields, h("div", { class: "sx-row" }, submit));
  d = openDialog({ title, wide, body: form, buttons: [{ label: "Cancel", value: null }] });
  d.el.setAttribute("data-copy", "off");
  d.result.then(onClose);
  return Object.assign(d, { submit });
}

const select = (options, value, label, tip) => {
  const el = h("select", { class: "text-input", "aria-label": label, title: tip }, options.map(([v, l]) => h("option", { value: String(v) }, l)));
  el.value = String(value);
  return el;
};
const labelled = (text, control) => h("label", { class: "sx-flabel" }, text, control);

export function settingsDialog() {
  const s = sx.status.settings;
  const lock = select([[1, "1 minute"], [2, "2 minutes"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [0, "Never"]], s.autoLockMinutes, "Lock after", "How long the vault may sit unused before it locks itself");
  const clip = select([[10, "10 seconds"], [20, "20 seconds"], [30, "30 seconds"], [45, "45 seconds"], [60, "1 minute"], [90, "90 seconds"], [120, "2 minutes"], [0, "Never"]], s.clipboardSeconds, "Clear the clipboard after", "How long a copied password stays on the clipboard before it is cleared (only if you haven't copied something else)");
  const blur = h("input", { type: "checkbox", title: "Lock the vault when you switch to another window or tab" });
  blur.checked = s.lockOnBlur;
  const days = select([[1, "1 day"], [3, "3 days"], [7, "7 days"], [14, "14 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]], s.deviceMaxDays, "Ask for the master password at least every", "“Unlock with this computer” stops working after this long without the master password");
  const warn = h("p", { class: "sx-warning", role: "status", hidden: true }, "With “Never”, the vault stays open until you lock it or close the File Manager. Anyone who sits at your computer could read it.");
  const warnClip = h("p", { class: "sx-warning", role: "status", hidden: true }, "With “Never”, a copied password stays on the clipboard, where other programs can read it, until you copy something else.");
  lock.addEventListener("change", () => (warn.hidden = lock.value !== "0"));
  clip.addEventListener("change", () => (warnClip.hidden = clip.value !== "0"));
  warn.hidden = lock.value !== "0";
  warnClip.hidden = clip.value !== "0";
  return formDialog({
    title: "Vault settings", submitLabel: "Save settings", tip: "Save these settings inside the vault",
    fields: [labelled("Lock after", lock), warn, labelled("Clear the clipboard after", clip), warnClip, h("label", { class: "sx-check" }, blur, " Lock when I switch to another window"), labelled("Ask for the master password at least every", days), h("p", { class: "sx-hint" }, "The last setting only matters when “Unlock with this computer” is on.")],
    run: async () => {
      const res = await call("secrets/settings", { settings: { autoLockMinutes: Number(lock.value), clipboardSeconds: Number(clip.value), lockOnBlur: blur.checked, deviceMaxDays: Number(days.value) } });
      setStatus(res.status);
      toast("Settings saved.", { kind: "success" });
    },
  });
}

const STRENGTH_TEXT = { standard: "Standard", strong: "Strong", maximum: "Maximum", custom: "Custom" };

export async function infoDialog() {
  await refreshStatus();
  const s = sx.status;
  const row = (label, value, ...extra) => h("li", { class: "sx-inforow" }, h("span", { class: "sx-label" }, label), h("span", { class: "sx-value" }, value), extra);
  const p = s.params;
  const d = openDialog({
    title: "Vault info", wide: true,
    body: [
      h("ul", { class: "sx-infolist" },
        row("File", s.path),
        row("Size", formatSize(s.fileBytes ?? 0)),
        row("Format", "RADSEC v1: AES-256-GCM, with the key made by Argon2id and HKDF-SHA-256"),
        row("Key strength", p ? `${STRENGTH_TEXT[p.strength]}: ${p.memoryMiB} MB memory, ${plural(p.passes, "pass", "passes")}, ${plural(p.parallelism, "lane")}` : "Unknown"),
        row("Key file", s.keyFile ? "Needed (as well as the password)" : "Not used"),
        row("Recovery key", s.recovery ? "Yes" : "No", h("button", { type: "button", class: "btn sx-btn", title: "Make, check or remove the recovery key", onclick: () => { d.close(); recoveryDialog(); } }, "Manage…")),
        row("Unlock with this computer", s.device ? "On" : "Off", h("button", { type: "button", class: "btn sx-btn", title: "Turn this computer's secure-storage shortcut on or off", onclick: () => { d.close(); deviceDialog(); } }, "Manage…")),
        row("Items", `${plural(s.items ?? 0, "item")}, ${s.trash ?? 0} in the Trash`),
        row("Last saved", s.savedAt ? formatDate(s.savedAt) : "Not saved yet"),
        row("Backups kept", `${s.backups ?? 0} of 3 (encrypted, next to the vault)`),
        row("Opened with", s.via === "recovery" ? "The recovery key" : s.via === "device" ? "This computer" : "The master password")),
      p?.belowStandard ? h("p", { class: "sx-warning", role: "status" }, "This vault uses lighter key settings than Standard. Use “Re-key” to make guessing more expensive.") : null,
      h("p", { class: "sx-hint" }, "This is a personal vault that has not been independently audited. For high-risk use, prefer a mature, audited password manager."),
    ],
    buttons: [{ label: "Close", value: null }, { label: "Re-key…", value: "rekey", tip: "Change how slow guessing is" }],
  });
  d.el.setAttribute("data-copy", "off");
  if ((await d.result) === "rekey") rekeyDialog();
}

const EVENT_TEXT = {
  created: "Vault created", unlock: "Unlocked with the master password", "recovery-unlock": "Unlocked with the recovery key", "device-unlock": "Unlocked with this computer", lock: "Locked",
  "auto-lock": "Locked automatically after being idle", shutdown: "Locked when the File Manager closed", "conflict-discard": "Locked to reload from disk", "export-backup": "Backup copy exported",
  "import-backup": "Restored from a backup", "export-csv": "Plain-text export made", "change-password": "Master password changed", rekey: "Key settings changed", "recovery-create": "Recovery key made",
  "recovery-remove": "Recovery key removed", "device-on": "“Unlock with this computer” turned on", "device-off": "“Unlock with this computer” turned off", settings: "Settings changed",
};

export async function auditDialog() {
  let events = [];
  try {
    events = (await call("secrets/audit")).events;
  } catch (err) {
    toast(errorText(err), { kind: "error" });
    return;
  }
  const label = (e) => (e.ev === "failed-attempts" ? `${plural(e.n ?? 0, "wrong attempt")} before this unlock` : e.ev === "import" ? `Imported ${plural(e.n ?? 0, "item")}` : e.ev === "export-csv" ? `Plain-text export of ${plural(e.n ?? 0, "item")}` : EVENT_TEXT[e.ev] ?? "Activity");
  const d = openDialog({
    title: "Activity log", wide: true,
    body: [h("p", { class: "sx-hint" }, "A short record of what happened to the vault. It has no passwords or item names and is stored inside the encrypted vault."), h("ul", { class: "sx-infolist sx-audit" }, events.map((e) => h("li", { class: "sx-inforow" }, h("span", { class: "sx-label" }, new Date(e.t).toLocaleString()), h("span", { class: "sx-value" }, label(e)))))],
    buttons: [{ label: "Close", value: null, primary: true }],
  });
  d.el.setAttribute("data-copy", "off");
}

export function changePasswordDialog() {
  const s = sx.status;
  const viaRecovery = s.via === "recovery";
  const current = confirmFields(s);
  const next = passwordFields({ confirm: true, autofocus: false });
  for (const el of [next.first, next.second]) el?.setAttribute("autocomplete", "off");
  const newKey = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "Key file location", placeholder: "Location of the key file to keep using", title: "The key file the vault should keep requiring", hidden: !(s.keyFile && viaRecovery) });
  const drop = h("input", { type: "checkbox", title: "Stop requiring a key file: the new password alone will open the vault" });
  return formDialog({
    title: "Change master password", submitLabel: "Change password", tip: "Set the new master password. The old one stops working.",
    intro: h("p", {}, viaRecovery ? "You opened the vault with the recovery key, so no current password is needed. Choose a new master password." : "Type your current master password, then choose a new one. The old one stops working, and old backups are deleted (they would still open with it)."),
    fields: [viaRecovery ? null : current.el, h("h3", {}, "New master password"), next.el, s.keyFile ? h("div", {}, h("label", { class: "sx-check" }, drop, " Stop using a key file"), newKey) : null],
    run: async () => {
      if (next.problem()) throw new ApiError(next.problem(), "BAD_REQUEST", 0);
      const res = await call("secrets/change-password", { ...(viaRecovery ? {} : current.values()), newPassword: next.password(), dropKeyFile: drop.checked, ...(newKey.value.trim() ? { newKeyFile: fullPath(newKey.value, state.home) } : {}) });
      setStatus(res.status);
      toast("Master password changed.", { kind: "success" });
    },
    onClose: () => { current.clear(); next.clear(); },
  });
}

export function rekeyDialog() {
  const s = sx.status;
  const confirm = confirmFields(s);
  const level = select([["standard", "Standard (256 MB)"], ["strong", "Strong (512 MB)"], ["maximum", "Maximum (1 GB)"]], s.params?.strength === "custom" ? "standard" : s.params?.strength ?? "standard", "Strength", "More memory makes guessing passwords more expensive, and opening the vault a little slower");
  const rotate = h("input", { type: "checkbox", title: "Make completely new encryption keys. The recovery key, the computer shortcut and old backups stop working." });
  return formDialog({
    title: "Re-key the vault", submitLabel: "Re-key", tip: "Re-encrypt the key protection with the strength you chose",
    intro: h("p", {}, "Choose how expensive guessing your master password should be. This is recalculated from your master password now. It takes a few seconds."),
    fields: [confirm.el, labelled("Strength", level), h("label", { class: "sx-check" }, rotate, " Also make brand-new encryption keys (removes the recovery key, the computer shortcut and old backups; make a new recovery key afterwards)")],
    run: async () => {
      const res = await call("secrets/rekey", { ...confirm.values(), strength: level.value, rotateKey: rotate.checked });
      setStatus(res.status);
      toast(`Re-keyed${res.kdfMs ? ` (opening now takes about ${(res.kdfMs / 1000).toFixed(1)} s)` : ""}.`, { kind: "success" });
    },
    onClose: confirm.clear,
  });
}

export function destroyDialog() {
  const word = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "Type DELETE to confirm", title: "Type the word DELETE in capitals to confirm" });
  return formDialog({
    title: "Erase the vault and start over", submitLabel: "Erase everything", danger: true, tip: "Permanently delete the vault, its backups and its keys",
    intro: h("p", { class: "sx-warning" }, "This permanently deletes the vault file and its backups, and everything stored in them. It cannot be undone, and nobody can get the data back. Backup copies you exported yourself are not touched."),
    fields: [labelled("Type DELETE to confirm", word)],
    run: async () => {
      const res = await call("secrets/destroy", { confirm: word.value });
      setStatus(res.status);
      toast("The vault was erased.");
    },
  });
}
