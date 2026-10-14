// The locked screen: master password (and key file when the vault has one), "Unlock with this computer" when it is
// on, and "Forgot? Use the recovery key". A wrong password shows the same plain message as a damaged file, and after a
// few wrong tries a countdown says how long to wait.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { clock } from "./secretsClock.js";
import { destroyDialog } from "./secretsDialogs.js";
import { importDialog } from "./secretsTransfer.js";
import { errorText, fullPath, setStatus } from "./secretsState.js";
import { state } from "./state.js";

export function renderUnlock(host, status) {
  let waitTimer = 0;
  let waitUntil = clock.now() + (status.waitMs ?? 0);
  const message = h("p", { class: "dialog-error sx-error", role: "alert", hidden: true });
  const password = h("input", { type: "password", id: "sx-unlock-pw", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", autocapitalize: "off", autocorrect: "off", title: "Type your master password" });
  const recoveryBox = h("input", { type: "text", id: "sx-unlock-rk", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", autocapitalize: "characters", placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", title: "Type or paste the recovery key you saved when you made the vault" });
  const keyFile = status.keyFile ? h("input", { type: "text", id: "sx-unlock-kf", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", placeholder: "Location of your key file", title: "Where your key file is saved, for example ~/Documents/secrets.key" }) : null;
  const show = h("button", { type: "button", class: "btn sx-btn", "aria-pressed": "false", title: "Show what you typed, or hide it again. Make sure nobody is looking at your screen.", onclick: () => { const on = show.getAttribute("aria-pressed") !== "true"; show.setAttribute("aria-pressed", String(on)); show.textContent = on ? "Hide" : "Show"; password.type = on ? "text" : "password"; } }, "Show");
  const unlock = h("button", { type: "submit", class: "btn primary", title: "Open the vault" }, "Unlock");
  const device = status.device ? h("button", { type: "button", class: "btn", title: "Open the vault with this computer's secure storage (Keychain, Credential Manager or Secret Service) instead of typing the password", onclick: () => go({ device: true }) }, "Unlock with this computer") : null;
  const recoveryPanel = h("div", { class: "sx-recoverybox", hidden: true }, h("label", { for: "sx-unlock-rk", class: "sx-flabel" }, "Recovery key"), recoveryBox, h("button", { type: "button", class: "btn", title: "Open the vault with the recovery key", onclick: () => go({ recoveryKey: recoveryBox.value }) }, "Unlock with the recovery key"));
  const forgot = h("button", { type: "button", class: "btn sx-link", "aria-expanded": "false", title: "If you forgot the master password, the recovery key you saved can open the vault", onclick: () => { recoveryPanel.hidden = !recoveryPanel.hidden; forgot.setAttribute("aria-expanded", String(!recoveryPanel.hidden)); if (!recoveryPanel.hidden) recoveryBox.focus(); } }, "Forgot the password? Use the recovery key");

  function paintWait() {
    const left = Math.max(0, Math.ceil((waitUntil - clock.now()) / 1000));
    unlock.disabled = left > 0;
    if (left > 0) {
      message.hidden = false;
      message.textContent = `Too many wrong attempts. Try again in ${left} second${left === 1 ? "" : "s"}.`;
    } else {
      if (waitTimer) clock.clearInterval(waitTimer);
      waitTimer = 0;
      if (message.textContent.startsWith("Too many")) message.hidden = true;
    }
  }
  function startWait() {
    if (waitTimer) clock.clearInterval(waitTimer);
    waitTimer = 0;
    paintWait();
    if (waitUntil > clock.now()) waitTimer = clock.setInterval(paintWait, 1000);
  }

  async function go(creds) {
    message.hidden = true;
    unlock.disabled = true;
    try {
      const body = { ...creds, ...(keyFile && keyFile.value.trim() ? { keyFile: fullPath(keyFile.value, state.home) } : {}) };
      const res = await call("secrets/unlock", body);
      password.value = "";
      recoveryBox.value = "";
      if (waitTimer) clock.clearInterval(waitTimer);
      setStatus(res.status);
    } catch (err) {
      password.value = "";
      recoveryBox.value = "";
      message.textContent = errorText(err);
      message.hidden = false;
      announce(message.textContent);
      if (err.details?.retryAfterMs) {
        waitUntil = clock.now() + err.details.retryAfterMs;
        startWait();
      } else unlock.disabled = false;
      if (err.code === "NEEDS_KEY_FILE") keyFile?.focus();
      else password.focus();
    }
  }

  const invalid = status.valid === false;
  host.replaceChildren(h("div", { class: "sx-card sx-unlockcard", "data-copy": "off" },
    h("h2", { class: "sx-title", tabindex: "-1" }, "🔒 Your secret space is locked"),
    invalid
      ? h("p", { class: "sx-warning", role: "alert" }, "The vault file in this computer's data folder isn't a RADSEC vault file (or is badly damaged). You can restore a backup, or start over.")
      : h("form", { class: "sx-form", autocomplete: "off", onsubmit: (e) => { e.preventDefault(); go({ password: password.value }); }, "aria-label": "Unlock the vault" },
        h("label", { for: "sx-unlock-pw", class: "sx-flabel" }, "Master password"),
        h("div", { class: "sx-fctl" }, password, show),
        keyFile ? h("label", { for: "sx-unlock-kf", class: "sx-flabel" }, "Key file") : null, keyFile,
        h("div", { class: "sx-row" }, unlock, device),
        status.recovery ? forgot : h("p", { class: "sx-hint" }, "This vault has no recovery key, so the master password is the only way in."),
        recoveryPanel),
    message,
    h("div", { class: "sx-row sx-links" },
      h("button", { type: "button", class: "btn sx-link", title: "Replace the vault with a backup copy you saved earlier", onclick: () => importDialog({ backupOnly: true }) }, "Restore a backup…"),
      h("button", { type: "button", class: "btn sx-link", title: "Erase this vault and start again with a new, empty one", onclick: () => destroyDialog() }, "Start over…"))));
  startWait();
  if (!invalid) password.focus();
  return () => {
    if (waitTimer) clock.clearInterval(waitTimer);
    password.value = "";
    recoveryBox.value = "";
  };
}
