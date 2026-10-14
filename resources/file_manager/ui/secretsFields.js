// The little widgets that show one field of an item: plain fields (with Copy), secret fields (hidden until Reveal, then
// hidden again after 15 seconds, on lock, on blur, on a tab change and when another item is chosen) and one-time codes
// with a countdown ring. Secrets are only ever in text nodes while shown, never in attributes, titles or storage, and
// Copy is done by the server, so a copied secret doesn't pass through this page at all.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { clock } from "./secretsClock.js";
import { errorText, registerWiper } from "./secretsState.js";

export const REVEAL_MS = 15_000;
export const NOTES_MS = 60_000;
const CODE_MS = 60_000;
const MASK = "••••••••";

/** Collects what a rendered view must undo when it is replaced (timers, wipers). */
export function newScope() {
  const fns = [];
  return {
    add(fn) {
      fns.push(fn);
      return fn;
    },
    dispose() {
      for (const fn of fns.splice(0)) fn();
    },
  };
}

function flash(button, text, label) {
  button.textContent = text;
  return clock.setTimeout(() => (button.textContent = label), 1500);
}

/** Copies a field through the server. Resolves true when it worked. */
export async function copyFromServer(id, field, label, button, text = "Copy") {
  try {
    const res = await call("secrets/copy", { id, field });
    if (button) flash(button, "Copied ✓", text);
    announce(res.clearsInSeconds ? `${label} copied. The clipboard is cleared in ${res.clearsInSeconds} seconds.` : `${label} copied. It stays on the clipboard until you copy something else.`);
    return true;
  } catch (err) {
    toast(errorText(err, "Couldn't copy."), { kind: "error" });
    return false;
  }
}

const copyButton = (id, field, label) => {
  const button = h("button", { type: "button", class: "btn sx-btn", "aria-label": `Copy ${label}`, title: `Copy the ${label.toLowerCase()} to the clipboard. It is cleared again after a while.`, onclick: () => copyFromServer(id, field, label, button) }, "Copy");
  return button;
};

/** A row: the label, the value, and the buttons. */
export function fieldRow(label, value, ...buttons) {
  return h("div", { class: "sx-field", "data-copy": "off" }, h("span", { class: "sx-label" }, label), value, h("span", { class: "sx-btns" }, buttons));
}

/** A field that is not secret: shown as text, with Copy (and whatever else is given). */
export function plainField({ id, field, label, value, extra = [] }) {
  return fieldRow(label, h("span", { class: "sx-value" }, value), copyButton(id, field, label), ...extra);
}

/** A secret field: bullets until Reveal; then the value for REVEAL_MS; Copy works without revealing. */
export function secretField({ id, field, label, scope, multiline = false, ms = REVEAL_MS, copy = true }) {
  const value = h(multiline ? "pre" : "span", { class: "sx-value sx-secret" }, MASK);
  const lower = label.toLowerCase();
  const toggle = h("button", {
    type: "button", class: "btn sx-btn", "aria-pressed": "false", "aria-label": `Show ${label}`,
    title: `Show the ${lower} for ${ms / 1000} seconds, then hide it again. Make sure nobody is looking at your screen.`,
    onclick: () => (shown ? hide() : show()),
  }, "Reveal");
  let shown = false;
  let timer = 0;
  let ticket = 0;

  function hide() {
    ticket++;
    clock.clearTimeout(timer);
    shown = false;
    value.textContent = MASK;
    value.classList.remove("sx-revealed");
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", `Show ${label}`);
    toggle.textContent = "Reveal";
  }

  async function show() {
    const mine = ++ticket;
    try {
      const res = await call("secrets/reveal", { id, field });
      if (mine !== ticket) return;
      value.textContent = res.value === "" ? "(empty)" : res.value;
      value.classList.add("sx-revealed");
      shown = true;
      toggle.setAttribute("aria-pressed", "true");
      toggle.setAttribute("aria-label", `Hide ${label}`);
      toggle.textContent = "Hide";
      clock.clearTimeout(timer);
      timer = clock.setTimeout(hide, ms);
    } catch (err) {
      toast(errorText(err, `Couldn't show the ${lower}.`), { kind: "error" });
    }
  }

  scope?.add(registerWiper(hide));
  scope?.add(hide);
  return fieldRow(label, value, toggle, copy ? copyButton(id, field, label) : null);
}

// ---- one-time codes ------------------------------------------------------------------------------------------

const ringStep = (left, period) => String(Math.max(0, Math.min(20, Math.round((left / period) * 20))));

/** A one-time code with a ring that counts down to the next code. */
export function totpField({ id, field = "totp", label = "One-time code", scope }) {
  const code = h("span", { class: "sx-value sx-secret sx-code" }, "••• •••");
  const ring = h("span", { class: "sx-ring", role: "img", "aria-label": "Time left for this code", "data-step": "20" }, h("span", { class: "sx-ring-n" }, ""));
  const toggle = h("button", { type: "button", class: "btn sx-btn", "aria-pressed": "false", "aria-label": `Show ${label}`, title: "Show the current one-time code. It changes every 30 seconds or so, and is hidden again after a minute.", onclick: () => (shown ? hide() : show()) }, "Show code");
  let shown = false;
  let tick = 0;
  let hideTimer = 0;
  let left = 0;
  let period = 30;
  let ticket = 0;

  function hide() {
    ticket++;
    shown = false;
    clock.clearInterval(tick);
    clock.clearTimeout(hideTimer);
    code.textContent = "••• •••";
    ring.hidden = true;
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "Show code";
  }

  function paint() {
    ring.hidden = false;
    ring.dataset.step = ringStep(left, period);
    ring.setAttribute("aria-label", `${left} seconds left for this code`);
    ring.firstChild.textContent = String(left);
  }

  async function fetchCode() {
    const mine = ticket;
    try {
      const res = await call("secrets/totp", { id, field });
      if (mine !== ticket) return false;
      code.textContent = res.digits === 6 ? `${res.code.slice(0, 3)} ${res.code.slice(3)}` : res.code;
      left = res.secondsLeft;
      period = res.period;
      paint();
      return true;
    } catch (err) {
      hide();
      toast(errorText(err, "Couldn't make the code."), { kind: "error" });
      return false;
    }
  }

  async function show() {
    ticket++;
    if (!(await fetchCode())) return;
    shown = true;
    toggle.setAttribute("aria-pressed", "true");
    toggle.textContent = "Hide code";
    clock.clearInterval(tick);
    tick = clock.setInterval(async () => {
      left -= 1;
      if (left <= 0) await fetchCode();
      else paint();
    }, 1000);
    clock.clearTimeout(hideTimer);
    hideTimer = clock.setTimeout(hide, CODE_MS);
  }

  ring.hidden = true;
  scope?.add(registerWiper(hide));
  scope?.add(hide);
  return fieldRow(label, h("span", { class: "sx-codebox" }, code, ring), toggle, copyButton(id, field, label));
}
