// The password part of the Lock dialogs: one or two password boxes, a show/hide button, a Caps Lock hint, a strength
// meter and "Suggest a passphrase". The password is only ever kept in these boxes; it is sent in the request that
// starts the job, and the boxes are emptied afterwards and when the dialog closes.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { MIN_LENGTH, strengthOf } from "./vaultStrength.js";

let counter = 0;

/**
 * @param {{ confirm: boolean, onChange?: () => void, autofocus?: boolean }} options
 */
export function passwordFields({ confirm, onChange = () => {}, autofocus = true }) {
  const id = `vault-pw-${++counter}`;
  let suggested = null;
  const mode = confirm ? "new-password" : "current-password";

  const first = h("input", {
    id, type: "password", class: "text-input vault-input", autocomplete: mode, spellcheck: "false", autocapitalize: "off", autocorrect: "off", autofocus: autofocus || null,
    title: confirm ? `Choose a password for the lock. At least ${MIN_LENGTH} characters; a few random words work best.` : "Type the password you used to lock these files.",
  });
  const second = confirm
    ? h("input", { id: `${id}-again`, type: "password", class: "text-input vault-input", autocomplete: "new-password", spellcheck: "false", title: "Type the same password again, to be sure there is no typing mistake." })
    : null;

  const toggle = h("button", { type: "button", class: "btn vault-toggle", "aria-pressed": "false", title: "Show what you typed, or hide it again. Make sure nobody is looking at your screen.", onclick: () => setShown(toggle.getAttribute("aria-pressed") !== "true") }, "Show");
  const caps = h("p", { class: "vault-hint vault-caps", role: "status", hidden: true }, "Caps Lock is on. Passwords are case-sensitive.");
  const mismatch = h("p", { class: "vault-hint vault-mismatch", role: "status", hidden: true }, "The two passwords don't match yet.");
  const meterBar = h("span", { class: "vault-meter-bar", "data-level": "0" });
  const meter = h("div", { class: "vault-meter", role: "meter", "aria-label": "Password strength", "aria-valuemin": "0", "aria-valuemax": "4", "aria-valuenow": "0", "aria-valuetext": "Nothing typed yet", title: "How hard this password would be to guess. It's an estimate: random words or characters score higher than names and patterns." }, meterBar);
  const meterText = h("span", { class: "vault-meter-text", "aria-live": "polite" }, "Nothing typed yet");
  const tip = h("p", { class: "vault-hint vault-tip" });
  const suggestion = h("div", { class: "vault-suggestion", role: "status", hidden: true });
  const suggestButton = h("button", {
    type: "button",
    class: "btn",
    title: "Make a random passphrase of 6 words from a built-in list, using your computer's secure random numbers. It is shown here so you can write it down.",
    onclick: suggest,
  }, "Suggest a passphrase");

  function setShown(shown) {
    toggle.setAttribute("aria-pressed", String(shown));
    toggle.textContent = shown ? "Hide" : "Show";
    first.type = shown ? "text" : "password";
    if (second) second.type = shown ? "text" : "password";
  }

  function refresh() {
    const s = strengthOf(first.value, suggested);
    meterBar.dataset.level = String(s.level);
    meter.setAttribute("aria-valuenow", String(s.level));
    meter.setAttribute("aria-valuetext", s.label);
    meterText.textContent = s.bits > 0 ? `${s.label} (about ${s.bits} bits)` : s.label;
    tip.textContent = s.tip;
    if (second) mismatch.hidden = !(second.value.length > 0 && second.value !== first.value);
    onChange();
  }

  function watchCaps(e) {
    if (typeof e.getModifierState === "function") caps.hidden = !e.getModifierState("CapsLock");
  }

  async function suggest() {
    suggestButton.disabled = true;
    try {
      const res = await call("vault/passphrase", { words: 6 });
      suggested = { phrase: res.passphrase, bits: res.bits };
      first.value = res.passphrase;
      if (second) second.value = res.passphrase;
      setShown(true);
      suggestion.replaceChildren(
        h("strong", {}, "Your new passphrase: "),
        h("code", { class: "vault-phrase" }, res.passphrase),
        h("p", { class: "vault-warning-line" }, "Write it down now and keep it somewhere safe. If you lose it, your files can't be opened by anyone."),
      );
      suggestion.hidden = false;
      refresh();
    } catch (err) {
      suggestion.replaceChildren(h("span", {}, err instanceof ApiError ? err.message : "Couldn't make a passphrase."));
      suggestion.hidden = false;
    } finally {
      suggestButton.disabled = false;
    }
  }

  for (const el of [first, second]) {
    if (!el) continue;
    el.addEventListener("input", () => {
      if (el === first && suggested && first.value !== suggested.phrase) suggestion.hidden = true;
      refresh();
    });
    el.addEventListener("keydown", watchCaps);
    el.addEventListener("keyup", watchCaps);
  }

  const el = h("div", { class: "vault-password" },
    h("label", { class: "field", for: id }, h("span", { class: "field-label" }, "Password")),
    h("div", { class: "vault-row" }, first, toggle),
    second ? h("label", { class: "field", for: `${id}-again` }, h("span", { class: "field-label" }, "Type the password again")) : null,
    second ? h("div", { class: "vault-row" }, second) : null,
    mismatch,
    caps,
    confirm ? h("div", { class: "vault-strength" }, meter, meterText) : null,
    confirm ? tip : null,
    confirm ? h("div", { class: "vault-row" }, suggestButton) : null,
    suggestion,
  );

  return {
    el,
    first,
    second,
    password: () => first.value,
    /** A plain sentence saying what is wrong with the password, or "" when it is acceptable. */
    problem() {
      const text = first.value;
      if (!text) return confirm ? "Type a password first." : "Type the password first.";
      if (!confirm) return "";
      if ([...text.normalize("NFKC")].length < MIN_LENGTH) return `The password is too short. Use at least ${MIN_LENGTH} characters.`;
      if (second && second.value !== text) return "The two passwords don't match. Type the same password in both boxes.";
      return "";
    },
    focus() {
      first.focus();
    },
    clear() {
      first.value = "";
      if (second) second.value = "";
      suggested = null;
      suggestion.replaceChildren();
      suggestion.hidden = true;
      setShown(false);
      refresh();
    },
  };
}
