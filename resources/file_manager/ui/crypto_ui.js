// Building blocks shared by the Crypto tool's cards: labelled fields, secret fields with a show/hide button,
// output boxes, the activity log and the copy helper. Nothing here stores or logs what the user types.
import { ApiError, call } from "./api.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";

let counter = 0;
const nextId = (prefix) => `crypto-${prefix}-${++counter}`;

/** Attributes that stop the browser from remembering, completing or "fixing" what is typed. */
const PRIVATE = { autocomplete: "off", spellcheck: "false", autocapitalize: "off", autocorrect: "off" };

export const formatMs = (ms) => (ms < 1000 ? `${Math.max(0, Math.round(ms * 10) / 10)} ms` : `${(ms / 1000).toFixed(1)} s`);

/** A card with a heading and a short plain-words explanation. */
export function card(title, intro, ...children) {
  const id = nextId("card");
  return h("section", { class: "pw-card crypto-card", "aria-labelledby": id },
    h("h3", { id }, title),
    intro ? h("p", { class: "pw-hint" }, intro) : null,
    ...children);
}

export function actionButton(label, tip, onclick, { primary = false, danger = false } = {}) {
  return h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}${danger ? " danger" : ""}`, title: tip, onclick }, label);
}

/** A multi-line text box with a visible label. Returns { el, input }. */
export function textBox({ label, tip, value = "", placeholder = "", rows = 4 }) {
  const id = nextId("text");
  const input = h("textarea", { id, class: "crypto-input crypto-text", rows, maxlength: 200000, title: tip, placeholder, ...PRIVATE });
  input.value = value;
  return { input, el: h("div", { class: "pw-field crypto-field" }, h("label", { for: id }, label), input) };
}

/** A one-line box with a visible label. Returns { el, input }. */
export function lineBox({ label, tip, value = "", placeholder = "", type = "text", min, max, width = "" }) {
  const id = nextId("line");
  const input = h("input", { id, type, class: `crypto-input ${width}`, title: tip, placeholder, min, max, step: type === "number" ? 1 : null, ...PRIVATE });
  input.value = value;
  return { input, el: h("div", { class: "pw-field crypto-field" }, h("label", { for: id }, label), input) };
}

/**
 * A hidden-by-default box for a passphrase, key or secret, with a Show/Hide button. `secrets` collects a function
 * that hides it again (the tool calls them when you leave the tab or press Clear all).
 */
export function secretBox({ label, tip, placeholder = "", secrets }) {
  const id = nextId("secret");
  const input = h("input", { id, type: "password", class: "crypto-input crypto-secret", title: tip, placeholder, maxlength: 10000, ...PRIVATE });
  const what = label.replace(/\s*\(.*\)\s*$/, "").replace(/^([A-Z])([a-z])/, (_m, a, b) => a.toLowerCase() + b);
  const toggle = h("button", { type: "button", class: "pw-btn crypto-toggle", title: `Show or hide the ${what} you typed. Only show it when nobody else can see your screen.`, "aria-label": `Show ${what}` }, "Show");
  const setShown = (shown) => {
    input.type = shown ? "text" : "password";
    toggle.textContent = shown ? "Hide" : "Show";
    toggle.setAttribute("aria-label", `${shown ? "Hide" : "Show"} ${what}`);
  };
  toggle.addEventListener("click", () => setShown(input.type === "password"));
  secrets.push(() => setShown(false));
  return { input, el: h("div", { class: "pw-field crypto-field" }, h("label", { for: id }, label), h("div", { class: "crypto-secret-row" }, input, toggle)) };
}

/** A checkbox with its label. Returns { el, input }. */
export function checkBox(label, tip, checked) {
  const input = h("input", { type: "checkbox", title: tip });
  input.checked = checked;
  return { input, el: h("label", { class: "crypto-check", title: tip }, input, ` ${label}`) };
}

/** A line that tells the person what just happened. `kind`: "ok", "bad" or "" for neutral. */
export function statusLine() {
  const el = h("p", { class: "pw-status crypto-status", role: "status" });
  return {
    el,
    set(text, kind = "") {
      el.textContent = text;
      el.className = `pw-status crypto-status${kind === "ok" ? " pw-ok" : kind === "bad" ? " pw-bad" : ""}`;
    },
  };
}

/** A read-only result area with a label. Returns { el, pre, set(text), text() }. */
export function outBox(label, tip) {
  const id = nextId("out");
  const pre = h("pre", { id, class: "pw-out crypto-out", tabindex: "0", title: tip, "aria-label": label });
  return {
    pre,
    el: h("div", { class: "pw-field crypto-field" }, h("span", { class: "crypto-label", "aria-hidden": "true" }, label), pre),
    set(text) { pre.textContent = text; },
    text: () => pre.textContent ?? "",
  };
}

/** Runs `fn` with `button` disabled; shows a plain-language message when it fails. Returns null on failure. */
export async function attempt(button, status, fn) {
  button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    status.set(message, "bad");
    toast(message, { kind: "error" });
    return null;
  } finally {
    button.disabled = false;
  }
}

export async function copyText(text, what = "That") {
  if (!text) {
    toast("There is nothing to copy yet.", { kind: "info" });
    return false;
  }
  try {
    if (text.length <= 100000) await call("copytext", { text });
    else await navigator.clipboard.writeText(text);
    toast(`${what} was copied. Other programs can read the clipboard, so paste it soon.`, { kind: "success" });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't copy that.", { kind: "error" });
    return false;
  }
}

/** A table of [algorithm, digest] rows. */
export function digestTable(rows, caption) {
  return h("div", { class: "pw-table-wrap" },
    h("table", { class: "pw-table crypto-digests" },
      h("caption", { class: "crypto-caption" }, caption),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Algorithm"), h("th", { scope: "col" }, "Digest (hex)"))),
      h("tbody", {}, rows.map(([algo, digest]) => h("tr", {}, h("th", { scope: "row" }, algo), h("td", { class: "pw-mono crypto-digest" }, digest))))));
}

const MAX_LOG = 200;

/**
 * The activity log. It lives in this page only and records what was done (the operation, a size, how long it
 * took), never what was typed: callers must only pass safe text.
 */
export function createLog() {
  const body = h("tbody", {});
  const empty = h("p", { class: "pw-hint" }, "Nothing yet. What you do here is listed in this box (names, sizes and times only, never your secrets).");
  const table = h("table", { class: "pw-table crypto-log-table", hidden: true },
    h("caption", { class: "crypto-caption" }, "Activity, newest first"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Time"), h("th", { scope: "col" }, "What"), h("th", { scope: "col" }, "Details"))),
    body);
  const el = h("div", { class: "pw-table-wrap crypto-log", tabindex: "0", role: "region", "aria-label": "Activity log", title: "A list of what you did in this tool. It never shows passphrases, keys, passwords or your text, and it is forgotten when you close the File Manager." }, table);
  return {
    el,
    empty,
    add(operation, details = "") {
      body.prepend(h("tr", {}, h("td", { class: "pw-mono" }, new Date().toLocaleTimeString()), h("td", {}, operation), h("td", {}, details)));
      while (body.rows.length > MAX_LOG) body.lastElementChild?.remove();
      table.hidden = false;
      empty.hidden = true;
    },
    clear() {
      clear(body);
      table.hidden = true;
      empty.hidden = false;
    },
  };
}
