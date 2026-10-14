// The recovery key (shown once, as 8 groups of 4) and "Unlock with this computer": the dialogs that explain them
// honestly and ask for the master password again before changing anything.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { openDialog, promptBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { errorText, fullPath, setStatus, sx } from "./secretsState.js";
import { state } from "./state.js";

/** A password box for confirming with the master password (and the key file, when the vault has one). */
export function confirmFields(status) {
  const password = h("input", { type: "password", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "aria-label": "Master password", title: "Type your master password to confirm it is you" });
  const keyFile = status.keyFile ? h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", "aria-label": "Key file location", placeholder: "Location of your key file", title: "Where your key file is saved, for example ~/Documents/vault.key" }) : null;
  return {
    el: h("div", { class: "sx-confirm" }, h("label", { class: "sx-flabel" }, "Master password", password), keyFile ? h("label", { class: "sx-flabel" }, "Key file", keyFile) : null),
    values: () => ({ password: password.value, ...(keyFile ? { keyFile: fullPath(keyFile.value, state.home) } : {}) }),
    clear: () => { password.value = ""; },
    focus: () => password.focus(),
  };
}

/** Copies the shown recovery key to the clipboard (the server clears the clipboard again after a while), so nobody has to type it. */
async function copyRecoveryKey(key) {
  try {
    const res = await call("secrets/copy-recovery", { text: key });
    toast(res.clearsInSeconds ? `Recovery key copied. Paste it somewhere safe now: the clipboard is cleared in ${res.clearsInSeconds} seconds.` : "Recovery key copied. Paste it somewhere safe now.", { kind: "success" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "The recovery key couldn't be copied. Write it down instead.", { kind: "error" });
  }
}

/** Saves the shown recovery key into a new text file that only you can read. */
async function saveRecoveryKey(key) {
  const done = await promptBox({
    title: "Save the recovery key to a file",
    label: "Where to save it, for example ~/Documents/recovery-key.txt",
    value: "~/Documents/codecaine-recovery-key.txt",
    confirmLabel: "Save",
    hint: "The file is a new, plain text file that only you can read. Keep it offline (a USB stick in a drawer) or print it and delete it. Anyone who has this file can open your vault.",
    submit: (text) => call("secrets/save-recovery", { text: key, path: fullPath(text, state.home) }),
  });
  if (done) toast(`The recovery key was saved to ${done.path ?? "the file"}. Keep it somewhere safe.`, { kind: "success" });
}

/** Shows a new recovery key and won't go on until the person says they saved it (closing the window just shows it again). */
export async function showRecoveryKey(key) {
  for (;;) {
    const check = h("input", { type: "checkbox", id: "sx-rk-saved", title: "Tick this once you have written the recovery key down somewhere safe" });
    const code = h("code", { class: "sx-recovery", "aria-label": "Your recovery key" }, key);
    const d = openDialog({
      title: "Your recovery key",
      wide: true,
      body: [
        h("p", {}, "This is the only way back into your vault if you forget the master password. It is shown once. Write it down on paper, or keep it in a different safe place. Do not store it inside this vault."),
        code,
        h("div", { class: "sx-row" },
          h("button", { type: "button", class: "btn primary", title: "Copy the recovery key so you can paste it into a safe place, instead of typing it by hand. The clipboard is cleared again after a short time.", onclick: () => copyRecoveryKey(key) }, "Copy to clipboard"),
          h("button", { type: "button", class: "btn", title: "Save the recovery key into a new text file that only you can read", onclick: () => saveRecoveryKey(key) }, "Save to a file…")),
        h("p", { class: "sx-hint" }, "Anyone who has this key can open your vault, so treat it like the password itself. There is no “forgot password” button: without the password or this key, nobody can open the vault."),
        h("label", { class: "sx-check" }, check, " I have saved my recovery key"),
      ],
      buttons: [{ label: "Continue", primary: true, value: true, disabled: true }],
    });
    d.el.setAttribute("data-copy", "off");
    check.addEventListener("change", () => d.setDisabled(true, !check.checked));
    const choice = await d.result;
    code.textContent = "";
    if (choice === true && check.checked) return;
  }
}

/** Manage the recovery key: make a new one, check one you have, or remove it. */
export function recoveryDialog() {
  const status = sx.status;
  const confirm = confirmFields(status);
  const verifyBox = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", autocapitalize: "characters", "aria-label": "Recovery key to check", placeholder: "XXXX-XXXX-XXXX-…", title: "Type or paste a recovery key to see whether it opens this vault" });
  const result = h("p", { class: "sx-hint", role: "status" }, "");
  let dialog = null;
  const change = (action, label, extra = {}) => h("button", { type: "button", class: `btn${extra.primary ? " primary" : ""}${extra.danger ? " danger" : ""}`, title: extra.tip, onclick: async () => {
    try {
      const res = await call("secrets/recovery", { action, ...confirm.values() });
      confirm.clear();
      setStatus(res.status);
      dialog.close();
      if (res.recoveryKey) await showRecoveryKey(res.recoveryKey);
      toast(action === "create" ? "New recovery key made. The old one no longer works." : "Recovery key removed.", { kind: "success" });
    } catch (err) {
      confirm.clear();
      dialog.setError(errorText(err));
    }
  } }, label);
  dialog = openDialog({
    title: "Recovery key",
    wide: true,
    body: [
      h("p", {}, status.recovery ? "This vault has a recovery key. It is the only way in if you forget the master password." : "This vault has no recovery key. If you forget the master password, nobody can open it."),
      h("h3", {}, "Check a recovery key"),
      h("div", { class: "sx-row" }, verifyBox, h("button", { type: "button", class: "btn", title: "Check whether the key you typed opens this vault. Nothing is changed.", onclick: async () => {
        try {
          const res = await call("secrets/recovery", { action: "verify", recoveryKey: verifyBox.value });
          result.textContent = res.matches ? "✓ That recovery key works." : "✗ That is not this vault's recovery key.";
        } catch (err) {
          result.textContent = errorText(err);
        }
        verifyBox.value = "";
      } }, "Check")),
      result,
      h("h3", {}, status.recovery ? "Make a new one, or remove it" : "Make one"),
      h("p", { class: "sx-hint" }, "To change this, type your master password. A new key replaces the old one, and the old one stops working."),
      confirm.el,
      h("div", { class: "sx-row" },
        change("create", status.recovery ? "Make a new recovery key" : "Make a recovery key", { primary: true, tip: "Make a new recovery key and show it once" }),
        status.recovery ? change("remove", "Remove recovery key", { danger: true, tip: "Delete the recovery key. Without it, only the master password opens the vault." }) : null),
    ],
    buttons: [{ label: "Close", value: null }],
  });
  dialog.el.setAttribute("data-copy", "off");
  dialog.result.then(() => { verifyBox.value = ""; confirm.clear(); });
  return dialog;
}

/** Explains "Unlock with this computer" and turns it on or off. */
export async function deviceDialog() {
  let availability = { ok: false, reason: "" };
  try {
    availability = (await call("secrets/device", { action: "probe" })).availability;
  } catch (err) {
    availability = { ok: false, reason: errorText(err) };
  }
  const status = sx.status;
  const on = status.device === true;
  const confirm = confirmFields(status);
  const days = status.settings?.deviceMaxDays ?? 14;
  let dialog = null;
  const run = (action, label, extra = {}) => h("button", { type: "button", class: `btn${extra.primary ? " primary" : ""}${extra.danger ? " danger" : ""}`, disabled: extra.disabled, title: extra.tip, onclick: async () => {
    try {
      const res = await call("secrets/device", action === "on" ? { action: "enable", ...confirm.values() } : { action: "disable" });
      setStatus(res.status);
      dialog.close();
      toast(action === "on" ? "“Unlock with this computer” is on." : res.keychainRemoved === false ? "Turned off in the vault. The entry in your computer's storage couldn't be removed; delete “codecaine-file-manager” there by hand." : "Turned off. The key was removed from this computer.", { kind: action === "on" ? "success" : "info" });
    } catch (err) {
      dialog.setError(errorText(err));
    } finally {
      confirm.clear();
    }
  } }, label);
  dialog = openDialog({
    title: "Unlock with this computer",
    wide: true,
    body: [
      h("p", {}, "Instead of typing the master password every time, the vault can be opened with your computer's own secure storage (the macOS Keychain, Windows Credential Manager or Linux Secret Service). You still have the master password and the recovery key."),
      h("p", { class: "sx-hint" }, `When this is on, anyone who can use your logged-in computer account can open the vault, and so can a program running as you. Don't use it on a shared computer, or if you want the vault to stay shut even when your computer is unlocked and unattended. The master password is asked for again at least every ${days} days (you can change that in Settings).`),
      availability.ok ? null : h("p", { class: "sx-warning", role: "status" }, availability.reason || "This computer's secure storage isn't available."),
      on ? h("p", { role: "status" }, "It is ON for this vault on this computer.") : availability.ok ? h("div", {}, h("p", {}, "To turn it on, type your master password:"), confirm.el) : null,
      h("div", { class: "sx-row" }, on ? run("off", "Turn off", { danger: true, tip: "Remove the key from this computer and the extra wrapping from the vault" }) : run("on", "Turn on", { primary: true, disabled: !availability.ok, tip: "Allow this computer's secure storage to open the vault" })),
    ],
    buttons: [{ label: "Close", value: null }],
  });
  dialog.el.setAttribute("data-copy", "off");
  await dialog.result;
  confirm.clear();
}

/** Offered once after creating or unlocking: is the secure storage usable, and does the person want it? */
export async function offerDevice() {
  let ok = false;
  try {
    ok = (await call("secrets/device", { action: "probe" })).availability.ok;
  } catch {
    ok = false;
  }
  if (!ok || sx.status?.device) return;
  await deviceDialog();
}
