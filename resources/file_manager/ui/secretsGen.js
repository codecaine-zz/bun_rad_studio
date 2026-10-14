// "Generate a password": random characters, a passphrase of random words, or a pronounceable password, made by the
// server with the operating system's secure random numbers. The result is shown here until it is used or closed, and is
// forgotten when the panel closes, the vault locks or the window loses focus.
import { call } from "./api.js";
import { h } from "./dom.js";
import { registerWiper, errorText } from "./secretsState.js";

let counter = 0;

/**
 * @param {{ onUse: (value: string) => void, onClose?: () => void }} options
 */
export function generatorPanel({ onUse, onClose = () => {} }) {
  const n = ++counter;
  let current = "";
  let ticket = 0;
  const id = (name) => `sx-gen-${n}-${name}`;
  const out = h("code", { class: "sx-gen-out", "aria-live": "off", "aria-label": "The generated password" }, "");
  const readout = h("p", { class: "sx-hint", role: "status" }, "");
  const meter = h("span", { class: "sx-meter-bar", "data-level": "0" });
  const mode = h("select", { id: id("mode"), class: "text-input", title: "Random characters are the strongest per character. A passphrase of random words is easier to type and remember. Pronounceable passwords are easier to say aloud." },
    h("option", { value: "password" }, "Random characters"), h("option", { value: "passphrase" }, "Passphrase of words"), h("option", { value: "pronounceable" }, "Pronounceable"));
  const length = h("input", { id: id("len"), type: "range", min: "8", max: "64", class: "sx-range", title: "How many characters long the password is. Longer is stronger." });
  length.value = "20";
  const lengthText = h("span", {}, "20");
  const words = h("input", { id: id("words"), type: "range", min: "3", max: "12", class: "sx-range", title: "How many random words. Each word adds 11 bits of strength." });
  words.value = "5";
  const wordsText = h("span", {}, "5");
  const box = (label, tip, checked) => {
    const input = h("input", { type: "checkbox", title: tip });
    input.checked = checked;
    return { input, el: h("label", { class: "sx-check", title: tip }, input, ` ${label}`) };
  };
  const lower = box("a–z", "Include lower-case letters", true);
  const upper = box("A–Z", "Include capital letters", true);
  const digits = box("0–9", "Include digits", true);
  const symbols = box("Symbols", "Include symbols such as ! # $ %. A few sites don't accept some symbols.", true);
  const clear = box("No look-alikes", "Leave out characters that are easy to mix up, such as O and 0, or l and 1", false);
  const cap = box("Capitalise words", "Start every word with a capital letter", false);
  const num = box("Add a number", "End the passphrase with a number", false);
  const randomRows = h("div", { class: "sx-row" }, lower.el, upper.el, digits.el, symbols.el, clear.el);
  const wordRows = h("div", { class: "sx-row" }, cap.el, num.el);
  const lengthRow = h("label", { class: "sx-slider", for: id("len") }, "Length: ", lengthText, length);
  const wordsRow = h("label", { class: "sx-slider", for: id("words") }, "Words: ", wordsText, words);

  function layout() {
    const m = mode.value;
    lengthRow.hidden = m === "passphrase";
    randomRows.hidden = m !== "password";
    wordsRow.hidden = m !== "passphrase";
    wordRows.hidden = m !== "passphrase";
  }

  function forget() {
    ticket++;
    current = "";
    out.textContent = "";
    readout.textContent = "";
    meter.dataset.level = "0";
  }

  async function make() {
    const mine = ++ticket;
    lengthText.textContent = length.value;
    wordsText.textContent = words.value;
    const body = { mode: mode.value, length: Number(length.value), words: Number(words.value), lower: lower.input.checked, upper: upper.input.checked, digits: digits.input.checked, symbols: symbols.input.checked, noAmbiguous: clear.input.checked, capitalize: cap.input.checked, number: num.input.checked };
    try {
      const { generated } = await call("secrets/generate", body);
      if (mine !== ticket) return;
      current = generated.value;
      out.textContent = current;
      meter.dataset.level = String(generated.bits < 40 ? 1 : generated.bits < 60 ? 2 : generated.bits < 80 ? 3 : 4);
      readout.textContent = `${generated.strength}: about ${generated.bits} bits. Use it only for one account.`;
      use.disabled = false;
    } catch (err) {
      current = "";
      out.textContent = "";
      readout.textContent = errorText(err, "Couldn't make a password.");
      use.disabled = true;
    }
  }

  const use = h("button", { type: "button", class: "btn primary", title: "Put this password into the form", onclick: () => { const v = current; forget(); onUse(v); } }, "Use this password");
  const again = h("button", { type: "button", class: "btn", title: "Make a different one with the same settings", onclick: make }, "Generate another");
  const close = h("button", { type: "button", class: "btn", title: "Close this panel without using the password", onclick: () => { forget(); onClose(); } }, "Close");
  for (const el of [mode, length, words, lower.input, upper.input, digits.input, symbols.input, clear.input, cap.input, num.input]) el.addEventListener(el === mode ? "change" : "input", () => { layout(); make(); });

  const el = h("div", { class: "sx-gen", role: "group", "aria-label": "Password generator", "data-copy": "off" },
    h("label", { class: "sx-gen-mode", for: id("mode") }, "Kind: ", mode),
    lengthRow, randomRows, wordsRow, wordRows,
    h("div", { class: "sx-gen-result" }, out, h("span", { class: "sx-meter", role: "meter", "aria-label": "Strength", "aria-valuemin": "0", "aria-valuemax": "4" }, meter)),
    readout,
    h("div", { class: "sx-row" }, again, use, close));
  layout();
  const unregister = registerWiper(forget);
  make();
  return { el, forget, destroy() { forget(); unregister(); } };
}
