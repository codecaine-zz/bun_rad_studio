// Small building blocks for the Find tool's screen. Every control made here has a visible label (or an aria-label)
// and a plain-language tooltip, so nothing is a mystery to a beginner.
import { ApiError } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { busy } from "./nav.js";

/** A labeled text box, drop-down or other control: the label sits above it and the tooltip covers both. */
export function field(label, control, tip) {
  return h("label", { class: "pw-field", title: tip }, label, control);
}

export function textInput({ value = "", placeholder = "", tip, label, type = "text", width = "", onenter, oninput } = {}) {
  const input = h("input", {
    type, class: `find-input${width ? ` find-w-${width}` : ""}`, value, placeholder, title: tip, "aria-label": label,
    spellcheck: "false", autocomplete: "off", autocapitalize: "off",
    onkeydown: onenter ? (e) => { if (e.key === "Enter") { e.preventDefault(); onenter(e); } } : null,
    oninput,
  });
  return input;
}

/** A drop-down. `options`: strings or { value, label }. */
export function dropdown(options, { value, tip, label, onchange } = {}) {
  const el = h("select", { class: "find-input", title: tip, "aria-label": label, onchange },
    options.map((o) => {
      const opt = typeof o === "string" ? { value: o, label: o } : o;
      return h("option", { value: opt.value }, opt.label);
    }));
  if (value !== undefined) el.value = value;
  return el;
}

export function checkbox(label, { checked = false, tip, onchange } = {}) {
  const input = h("input", { type: "checkbox", checked, onchange });
  return { input, el: h("label", { class: "find-check", title: tip }, input, h("span", {}, label)) };
}

export function button(label, onclick, { tip, primary = false, danger = false, disabled = false } = {}) {
  return h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}${danger ? " danger" : ""}`, title: tip, disabled, onclick }, label);
}

/** A titled card (uses the shared pw-card look). */
export function card(title, hint, ...children) {
  return h("section", { class: "pw-card", "aria-label": title },
    h("h3", {}, title),
    hint ? h("p", { class: "pw-hint" }, hint) : null,
    ...children);
}

export const row = (...children) => h("div", { class: "pw-row" }, ...children);

/** Text for people: what went wrong, in the server's own plain words when it sent them. */
export const explain = (err) => (err instanceof ApiError ? err.message : "That didn't work. Try again.");

/**
 * Runs an action with the page's "Working…" indicator, and reports a failure as a message instead of an error.
 * Resolves with the action's answer, or undefined when it failed.
 */
export async function attempt(fn) {
  try {
    return await busy(fn);
  } catch (err) {
    toast(explain(err), { kind: "error" });
    return undefined;
  }
}

/** Disables a button while an async action runs, so a double click can't start it twice. */
export function guarded(btn, fn) {
  return async (...args) => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await fn(...args);
    } finally {
      btn.disabled = false;
    }
  };
}

/** A block of fixed-width text (command output, hex dumps). Always plain text, never markup. */
export function outputBox(label) {
  return h("pre", { class: "pw-out find-out", tabindex: "0", role: "region", "aria-label": label, hidden: true });
}

export function showOutput(box, text) {
  box.textContent = text;
  box.hidden = !text;
}
