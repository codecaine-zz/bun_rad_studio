// The "Power tools" panel: a tab per tool (Find, Watch, Crypto, IP info, Network, Replace, Calculator, Timer, Code ...).
// Each tool lives in its own module and registers itself with registerPowerTab(); this file only owns the frame:
// the tab strip, keyboard use, and handing each tab a container to draw into. WHERE the panel sits (filling the
// window in the Tools view, or beside the files in the Split view) is decided by workspace.js, which plugs in
// through setPowerHost(); without one (a page that only mounts this file) the panel simply shows and hides.
import { $, clear, h } from "./dom.js";
import { emit, state } from "./state.js";

/** The groups the tab strip is arranged in, in this order. A tab can name one with `group`. */
const GROUPS = [["files", "Files and text"], ["automate", "Automate"], ["security", "Security"], ["network", "Network"], ["handy", "Handy"], ["more", "More"]];
const DEFAULT_GROUP = { find: "files", sd: "files", code: "files", dev: "files", watch: "automate", serve: "automate", crypto: "security", vault: "security", ip: "network", net: "network", calc: "handy", timer: "handy" };

/** @type {Array<{ id: string, label: string, icon: string, tip: string, group?: string, mount: (root: HTMLElement) => ({ show?: (opts?: any) => void, hide?: () => void } | void) }>} */
const tabs = [];
const mounted = new Map();
let activeId = null;
/** @type {{ open: (tabId?: string, opts?: any) => void, leave: () => void } | null} */
let host = null;

const groupOf = (t) => (GROUPS.some(([g]) => g === t.group) ? t.group : DEFAULT_GROUP[t.id] ?? "more");

/** The tools in the order the tab strip shows them within a group; a tool not listed comes after these. */
const TOOL_ORDER = ["find", "sd", "code", "dev", "watch", "serve", "crypto", "vault", "ip", "net", "calc", "timer"];

/** The tabs in the order they are shown: grouped, then in a steady order within a group. */
function orderedTabs() {
  const rank = (t) => (TOOL_ORDER.includes(t.id) ? TOOL_ORDER.indexOf(t.id) : TOOL_ORDER.length);
  return GROUPS.flatMap(([g]) => tabs.filter((t) => groupOf(t) === g).sort((a, b) => rank(a) - rank(b)));
}

/**
 * Adds a tool to the panel. `mount(root)` runs once, the first time the tab is opened, and may return
 * `{ show(opts), hide() }` hooks that run each time the tab is shown or left.
 */
export function registerPowerTab(tab) {
  if (!tabs.some((t) => t.id === tab.id)) tabs.push(tab);
  renderTabs();
  emit("power-tabs");
}

/** A read-only list of the tools, as the tab strip shows them: { id, label, icon, tip, group, groupLabel }. */
export function listPowerTabs() {
  return orderedTabs().map((t) => ({ id: t.id, label: t.label, icon: t.icon, tip: t.tip, group: groupOf(t), groupLabel: GROUPS.find(([g]) => g === groupOf(t))?.[1] ?? "More" }));
}

export const powerIsOpen = () => !!$("#power-panel") && !$("#power-panel").hidden;
export const activePowerTab = () => activeId;

/** Forgets which tools were opened and where the panel lives (tools stay registered). For tests that start the page more than once in one process. */
export function resetPower() {
  mounted.clear();
  activeId = null;
  host = null;
}

/** Lets the workspace decide where the panel goes: `open(tabId, opts)` must end by calling revealPower(). */
export function setPowerHost(next) {
  host = next;
}

function updateScrollButtons() {
  const strip = $("#power-tabs");
  if (!strip) return;
  const more = strip.scrollWidth > strip.clientWidth + 1;
  const left = $("#power-scroll-left");
  const right = $("#power-scroll-right");
  if (left) left.hidden = !more || strip.scrollLeft <= 0;
  if (right) right.hidden = !more || strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

/** Scrolls the tab strip, if it needs it, so the chosen tab is fully showing. */
function keepTabInView(id) {
  const strip = $("#power-tabs");
  const tab = $(`#power-tab-${id}`);
  if (!strip || !tab) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - 8);
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth + 8;
  updateScrollButtons();
}

function renderTabs() {
  const strip = typeof document === "undefined" ? null : $("#power-tabs");
  if (!strip) return;
  clear(strip);
  let previous = null;
  for (const t of orderedTabs()) {
    const group = groupOf(t);
    if (previous !== null && previous !== group) strip.append(h("span", { class: "power-sep", "aria-hidden": "true" }));
    previous = group;
    strip.append(h("button", {
      type: "button", role: "tab", id: `power-tab-${t.id}`, class: `power-tab${t.id === activeId ? " active" : ""}`,
      "aria-selected": String(t.id === activeId), "aria-controls": `power-pane-${t.id}`, tabindex: t.id === activeId || (activeId === null && t === orderedTabs()[0]) ? "0" : "-1", title: `${t.label}: ${t.tip}`,
      onclick: () => selectTab(t.id),
    }, h("span", { class: "pt-icon", "aria-hidden": "true" }, t.icon), h("span", { class: "pt-label" }, t.label)));
  }
  updateScrollButtons();
}

function selectTab(id, opts) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const body = $("#power-body");
  if (activeId && activeId !== id) mounted.get(activeId)?.hooks?.hide?.();
  const changed = activeId !== id;
  activeId = id;
  for (const entry of mounted.values()) entry.root.hidden = entry.id !== id;
  let entry = mounted.get(id);
  if (!entry) {
    const root = h("div", { class: "power-pane", id: `power-pane-${id}`, role: "tabpanel", "aria-labelledby": `power-tab-${id}` });
    body.append(root);
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
  keepTabInView(id);
  try {
    entry.hooks?.show?.(opts);
  } catch (err) {
    console.error(`The ${tab.label} tool failed to show`, err);
  }
  if (changed) emit("power-tab", id);
}

/** Shows the panel (the workspace has already put it in place), on `tabId` or the one used last. */
export function revealPower(tabId, opts, { focus = true } = {}) {
  const panel = $("#power-panel");
  if (!panel) return;
  panel.hidden = false;
  document.getElementById("app").classList.add("power-open");
  state.powerOpen = true;
  const wanted = tabs.some((t) => t.id === tabId) ? tabId : activeId ?? orderedTabs()[0]?.id;
  selectTab(wanted, opts);
  emit("power");
  if (focus) $(`#power-tab-${activeId}`)?.focus();
}

/** Hides the panel without going anywhere else; the workspace uses this when you leave the Tools or Split view. */
export function concealPower() {
  const panel = $("#power-panel");
  if (!panel || panel.hidden) return;
  if (activeId) mounted.get(activeId)?.hooks?.hide?.();
  panel.hidden = true;
  document.getElementById("app").classList.remove("power-open");
  state.powerOpen = false;
  emit("power");
}

/** Opens the tools (on `tabId`, or the one used last). `opts` is passed to that tab's show() hook. */
export function openPower(tabId, opts) {
  if (!$("#power-panel")) return;
  if (powerIsOpen()) {
    // Already visible (the Tools or Split view): just change tab.
    selectTab(tabs.some((t) => t.id === tabId) ? tabId : activeId, opts);
    emit("power");
    $(`#power-tab-${activeId}`)?.focus();
  } else if (host) host.open(tabId, opts);
  else revealPower(tabId, opts);
}

/** Leaves the tools: back to the files. */
export function closePower() {
  if (!powerIsOpen()) return;
  if (host) host.leave();
  else concealPower();
  $("#list")?.focus();
}

export function togglePower(tabId) {
  if (powerIsOpen() && (!tabId || tabId === activeId)) closePower();
  else openPower(tabId);
}

/** Wires the close and scroll buttons and arrow-key movement along the tab strip. */
export function wirePower() {
  $("#power-close")?.addEventListener("click", closePower);
  const strip = $("#power-tabs");
  const scrollBy = (dir) => strip?.scrollBy?.({ left: dir * Math.max(120, strip.clientWidth * 0.6), behavior: "smooth" });
  $("#power-scroll-left")?.addEventListener("click", () => scrollBy(-1));
  $("#power-scroll-right")?.addEventListener("click", () => scrollBy(1));
  strip?.addEventListener("scroll", updateScrollButtons, { passive: true });
  if (strip && typeof ResizeObserver === "function") new ResizeObserver(updateScrollButtons).observe(strip);
  strip?.addEventListener("keydown", (e) => {
    const all = orderedTabs();
    const i = all.findIndex((t) => t.id === activeId);
    let next = null;
    if (e.key === "ArrowRight") next = all[(i + 1) % all.length];
    else if (e.key === "ArrowLeft") next = all[(i + all.length - 1) % all.length];
    else if (e.key === "Home") next = all[0];
    else if (e.key === "End") next = all.at(-1);
    if (next) {
      e.preventDefault();
      selectTab(next.id);
      $(`#power-tab-${next.id}`)?.focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    // Esc leaves the Tools view. In the Split view the tools sit beside the files, so Esc is left to whatever has focus.
    if (e.key === "Escape" && !e.defaultPrevented && state.workspace !== "split" && powerIsOpen() && !document.querySelector(".modal-backdrop") && !(e.target instanceof HTMLInputElement && e.target.type === "search")) {
      e.preventDefault();
      closePower();
    }
  });
  renderTabs();
}
