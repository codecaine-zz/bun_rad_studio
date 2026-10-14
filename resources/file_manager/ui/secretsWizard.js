// First run: "Create your secret space". It says plainly what the vault is, that there is no password reset, and asks for
// a master password (with the strength meter and passphrase suggester from the Lock dialogs), an optional key file, an
// optional recovery key and how slow unlocking should be on purpose.
import { call } from "./api.js";
import { h } from "./dom.js";
import { pickFolder } from "./findPicker.js";
import { clock } from "./secretsClock.js";
import { offerDevice, showRecoveryKey } from "./secretsRecovery.js";
import { errorText, fullPath, setStatus } from "./secretsState.js";
import { state } from "./state.js";
import { joinPath } from "./util.js";
import { passwordFields } from "./vaultForm.js";

const LEVELS = [
  ["standard", "Standard", "Uses 256 MB of memory to open. Good for almost everyone."],
  ["strong", "Strong", "Uses 512 MB of memory. Slower for anyone guessing your password, a little slower for you."],
  ["maximum", "Maximum", "Uses 1 GB of memory. The slowest to guess, and the slowest to open."],
];

export function renderWizard(host) {
  const fields = passwordFields({ confirm: true, autofocus: false, onChange: () => check() });
  for (const el of [fields.first, fields.second]) el?.setAttribute("autocomplete", "off");
  const verdict = h("p", { class: "sx-hint", role: "status" }, "");
  let keyFile = "";
  let checkTimer = 0;
  let passOk = false;
  let lastTyped = "";

  const keyMsg = h("p", { class: "sx-hint", role: "status" }, "");
  const keyExisting = h("input", { type: "text", class: "text-input sx-input", autocomplete: "off", spellcheck: "false", placeholder: "Location of the key file, for example ~/Documents/vault.key", "aria-label": "Key file location", title: "Where your key file is saved", hidden: true });
  const keyNew = h("button", { type: "button", class: "btn", hidden: true, title: "Make a new random key file and save it in a folder you choose", onclick: async () => {
    const folder = await pickFolder({ title: "Save the key file in", start: state.home });
    if (!folder) return;
    try {
      const res = await call("secrets/keyfile", { path: joinPath(folder, "secrets.key", state.sep) });
      keyFile = res.path;
      keyMsg.textContent = `Key file saved: ${res.path}. Keep a copy somewhere safe and separate (a USB stick, for example).`;
    } catch (err) {
      keyMsg.textContent = errorText(err);
    }
  } }, "Make a key file…");
  const radio = (name, value, label, tip, checked = false) => {
    const input = h("input", { type: "radio", name, value, title: tip });
    input.checked = checked;
    return { input, el: h("label", { class: "sx-check", title: tip }, input, ` ${label}`) };
  };
  const kNone = radio("sx-kf", "none", "No key file", "Just the master password", true);
  const kNew = radio("sx-kf", "new", "Make a new key file", "A random file you keep somewhere safe; it is needed along with the password");
  const kOld = radio("sx-kf", "old", "Use a key file I already have", "Pick a file you already keep safe");
  const syncKeyUi = () => {
    keyNew.hidden = !kNew.input.checked;
    keyExisting.hidden = !kOld.input.checked;
    keyMsg.textContent = kNew.input.checked && keyFile ? `Key file saved: ${keyFile}` : "";
    if (kNone.input.checked) keyFile = "";
  };
  for (const r of [kNone, kNew, kOld]) r.input.addEventListener("change", syncKeyUi);

  const recovery = h("input", { type: "checkbox", id: "sx-wiz-rec", title: "Make a recovery key that can open the vault if you forget the master password" });
  recovery.checked = true;
  const levelRadios = LEVELS.map(([value, label, tip], i) => ({ value, ...radio("sx-level", value, label, tip, i === 0), tip, name: label }));
  const timing = h("p", { class: "sx-hint", role: "status" }, "");
  const measure = h("button", { type: "button", class: "btn", title: "Time how long opening the vault takes on this computer at each strength. Nothing is stored.", onclick: async () => {
    measure.disabled = true;
    const parts = [];
    for (const [value, label] of LEVELS) {
      timing.textContent = `Measuring ${label}… ${parts.join(" · ")}`;
      try {
        const r = await call("secrets/benchmark", { strength: value });
        parts.push(r.ms === null ? `${label}: not enough memory` : `${label}: about ${(r.ms / 1000).toFixed(1)} s`);
      } catch {
        parts.push(`${label}: couldn't measure`);
      }
    }
    timing.textContent = `Time to open the vault on this computer: ${parts.join(" · ")}`;
    measure.disabled = false;
  } }, "Measure on this computer");

  const error = h("p", { class: "dialog-error sx-error", role: "alert", hidden: true });
  const create = h("button", { type: "button", class: "btn primary", disabled: true, title: "Make the vault. This takes a few seconds, on purpose.", onclick: submit }, "Create my vault");

  function refresh() {
    const matches = fields.second.value === fields.first.value && fields.first.value !== "";
    create.disabled = !(passOk && matches);
  }
  function check() {
    // Typing in the second box only needs the "match" check again, not another answer from the server.
    if (fields.first.value === lastTyped) return refresh();
    lastTyped = fields.first.value;
    clock.clearTimeout(checkTimer);
    passOk = false;
    refresh();
    if (!fields.first.value) {
      verdict.textContent = "";
      return;
    }
    checkTimer = clock.setTimeout(async () => {
      const typed = fields.first.value;
      try {
        const r = await call("secrets/check-password", { password: typed });
        if (typed !== fields.first.value) return;
        passOk = r.acceptable;
        verdict.textContent = r.acceptable ? "✓ This master password is long and hard enough." : `✗ ${r.problem}`;
      } catch {
        verdict.textContent = "";
      }
      refresh();
    }, 250);
  }

  async function submit() {
    error.hidden = true;
    create.disabled = true;
    create.textContent = "Creating… this takes a few seconds on purpose";
    try {
      const chosen = levelRadios.find((l) => l.input.checked)?.value ?? "standard";
      const path = kOld.input.checked ? fullPath(keyExisting.value, state.home) : kNew.input.checked ? keyFile : "";
      if ((kOld.input.checked || kNew.input.checked) && !path) throw new Error("key");
      const res = await call("secrets/create", { password: fields.first.value, keyFile: path || undefined, strength: chosen, recovery: recovery.checked });
      fields.clear();
      if (res.recoveryKey) await showRecoveryKey(res.recoveryKey);
      setStatus(res.status);
      await offerDevice();
    } catch (err) {
      error.textContent = err instanceof Error && err.message === "key" ? "Choose or make a key file first, or pick “No key file”." : errorText(err);
      error.hidden = false;
      create.textContent = "Create my vault";
      refresh();
    }
  }

  host.replaceChildren(h("div", { class: "sx-card sx-wizard", "data-copy": "off" },
    h("h2", { class: "sx-title", tabindex: "-1" }, "Create your secret space"),
    h("p", {}, "A private place for passwords, secure notes, cards and small files. Everything in it is locked inside ONE encrypted file on this computer. Nothing is sent anywhere."),
    h("p", { class: "sx-warning" }, "There is no password reset. Only you can open it. If you forget the master password and have no recovery key, nobody can get your data back."),
    h("section", { class: "sx-step", "aria-label": "Master password" }, h("h3", {}, "1. Choose a master password"), h("p", { class: "sx-hint" }, "At least 12 characters of real variety, or a passphrase of 5 or more random words. “Suggest a passphrase” makes one for you. Use it for nothing else."), fields.el, verdict),
    h("section", { class: "sx-step", "aria-label": "Key file" }, h("h3", {}, "2. A key file (optional)"), h("p", { class: "sx-hint" }, "A key file adds a second thing an attacker would need. If you lose it, the vault can't be opened with the password alone: only the recovery key would help."), kNone.el, kNew.el, kOld.el, keyNew, keyExisting, keyMsg),
    h("section", { class: "sx-step", "aria-label": "Recovery key" }, h("h3", {}, "3. A recovery key (strongly recommended)"), h("p", { class: "sx-hint" }, "A long code shown once. It is the only way back in if you forget the password."), h("label", { class: "sx-check" }, recovery, " Make a recovery key")),
    h("section", { class: "sx-step", "aria-label": "Strength" }, h("h3", {}, "4. How slow should guessing be?"), h("p", { class: "sx-hint" }, "Opening the vault is slowed down on purpose, which makes guessing passwords very expensive for anyone who steals the file."), levelRadios.map((l) => l.el), h("div", { class: "sx-row" }, measure), timing),
    error,
    h("div", { class: "sx-row" }, create)));
  fields.focus();
}
