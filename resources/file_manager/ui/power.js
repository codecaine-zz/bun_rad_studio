// The "Power tools" panel: a full-window workspace with one tab per tool (Find, Watch, Crypto, IP info, Network).
// Each tool lives in its own module and registers itself with registerPowerTab(); this file only owns the frame:
// opening and closing, the tab strip, keyboard use, and handing each tab a container to draw into.
import { $, clear, h } from "./dom.js";
import { emit, state } from "./state.js";

/** @type {Array<{ id: string, label: string, icon: string, tip: string, mount: (root: HTMLElement) => ({ show?: (opts?: any) => void, hide?: () => void } | void) }>} */
const tabs = [];
const mounted = new Map();
let activeId = null;

/**
 * Adds a tool to the panel. `mount(root)` runs once, the first time the tab is opened, and may return
 * `{ show(opts), hide() }` hooks that run each time the tab is shown or left.
 */
export function registerPowerTab(tab) {
  if (!tabs.some((t) => t.id === tab.id)) tabs.push(tab);
  if (activeId === null && !$("#power-panel")?.hidden) renderTabs();
}

export const powerIsOpen = () => !!$("#power-panel") && !$("#power-panel").hidden;
export const activePowerTab = () => activeId;

function renderTabs() {
  const strip = $("#power-tabs");
  if (!strip) return;
  clear(strip);
  for (const t of tabs) {
    strip.append(h("button", {
      type: "button", role: "tab", id: `power-tab-${t.id}`, class: `power-tab${t.id === activeId ? " active" : ""}`,
      "aria-selected": String(t.id === activeId), "aria-controls": `power-pane-${t.id}`, tabindex: t.id === activeId ? "0" : "-1", title: t.tip,
      onclick: () => selectTab(t.id),
    }, h("span", { "aria-hidden": "true" }, t.icon), ` ${t.label}`));
  }
}

function selectTab(id, opts) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const host = $("#power-body");
  if (activeId && activeId !== id) mounted.get(activeId)?.hooks?.hide?.();
  activeId = id;
  for (const entry of mounted.values()) entry.root.hidden = entry.id !== id;
  let entry = mounted.get(id);
  if (!entry) {
    const root = h("div", { class: "power-pane", id: `power-pane-${id}`, role: "tabpanel", "aria-labelledby": `power-tab-${id}` });
    host.append(root);
    let hooks;
    try {
      hooks = tab.mount(root) ?? {};
    } catch (err) {
      console.error(`The ${tab.label} tool failed to start`, err);
      root.replaceChildren(h("p", { class: "power-error", role: "alert" }, `The ${tab.label} tool couldn't start.`));
      hooks = {};
    }
    entry = { id, root, hooks };
    mounted.set(id, entry);
  }
  entry.root.hidden = false;
  renderTabs();
  try {
    entry.hooks?.show?.(opts);
  } catch (err) {
    console.error(`The ${tab.label} tool failed to show`, err);
  }
}

/** Opens the panel (on `tabId`, or the one used last). `opts` is passed to that tab's show() hook. */
export function openPower(tabId, opts) {
  const panel = $("#power-panel");
  if (!panel) return;
  panel.hidden = false;
  document.getElementById("app").classList.add("power-open");
  state.powerOpen = true;
  selectTab(tabId ?? activeId ?? tabs[0]?.id, opts);
  emit("power");
  $(`#power-tab-${activeId}`)?.focus();
}

export function closePower() {
  const panel = $("#power-panel");
  if (!panel || panel.hidden) return;
  if (activeId) mounted.get(activeId)?.hooks?.hide?.();
  panel.hidden = true;
  document.getElementById("app").classList.remove("power-open");
  state.powerOpen = false;
  emit("power");
  $("#list")?.focus();
}

export function togglePower(tabId) {
  if (powerIsOpen() && (!tabId || tabId === activeId)) closePower();
  else openPower(tabId);
}

/** Wires the close button and arrow-key movement along the tab strip. */
export function wirePower() {
  $("#power-close")?.addEventListener("click", closePower);
  $("#power-tabs")?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === activeId);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      e.preventDefault();
      selectTab(next.id);
      $(`#power-tab-${next.id}`)?.focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && powerIsOpen() && !document.querySelector(".modal-backdrop") && !(e.target instanceof HTMLInputElement && e.target.type === "search")) {
      e.preventDefault();
      closePower();
    }
  });
  renderTabs();
}
