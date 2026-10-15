// Friendlier chrome: the toolbar keeps to one tidy row (buttons that don't fit move into a "More" menu), and the status
// bar has quick buttons for how the file list looks (Details, List, Icons).
import { $, debounce } from "./dom.js";
import { showMenu } from "./menus.js";
import { saveSettings } from "./nav.js";
import { hintOf } from "./keymap.js";
import { on, state } from "./state.js";

const VIEWS = [
  ["details", "☰", "Details", "Show a table with size and date, which you can sort by clicking a heading"],
  ["list", "▤", "List", "Show a compact list of names"],
  ["icons", "▦", "Icons", "Show big icons"],
];

/**
 * Hides items from the end, one at a time, until `fits()` says the rest fit. At least `keep` items stay.
 * Returns how many were hidden.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => void} hide
 * @param {() => boolean} fits
 * @param {number} [keep]
 */
export function hideUntilFits(items, hide, fits, keep = 1) {
  let hidden = 0;
  while (!fits() && items.length - hidden > keep) {
    hide(items[items.length - 1 - hidden]);
    hidden++;
  }
  return hidden;
}

/** Shows as many toolbar buttons as fit in one row, and puts the rest in the More menu. */
export function fitToolbar() {
  if (typeof document === "undefined") return; // a timer left over from a page that was torn down
  const bar = $("#toolbar");
  const more = $("#tool-more");
  if (!bar || !more) return;
  const buttons = [...bar.querySelectorAll(".tool")];
  for (const b of buttons) b.classList.remove("overflowed");
  more.hidden = true;
  const fits = () => bar.scrollWidth <= bar.clientWidth + 1;
  if (!bar.clientWidth || fits()) return;
  more.hidden = false;
  hideUntilFits(buttons.filter((b) => !b.hidden), (b) => b.classList.add("overflowed"), fits);
}

/** Clicks a toolbar button that is hidden in More. A button that opens a menu anchors it to itself, so it is parked, unseen, where More is. */
function clickHidden(btn) {
  const more = $("#tool-more");
  if (!btn.querySelector(".caret") || !more) return btn.click();
  const box = more.getBoundingClientRect();
  const park = { position: "fixed", display: "flex", visibility: "hidden", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` };
  // Its toolbar group may be hidden altogether, so the button steps out of it for a moment.
  const parent = btn.parentElement;
  const next = btn.nextSibling;
  document.body.append(btn);
  for (const [name, value] of Object.entries(park)) btn.style.setProperty(name, value);
  try {
    btn.click();
  } finally {
    for (const name of Object.keys(park)) btn.style.removeProperty(name);
    parent.insertBefore(btn, next);
  }
}

/** The buttons that moved into More, as menu items, with a divider between the toolbar's groups. */
function overflowItems() {
  const items = [];
  let group = null;
  for (const btn of document.querySelectorAll("#toolbar .tool.overflowed")) {
    if (btn.hidden) continue;
    if (group && btn.parentElement !== group) items.push({ separator: true });
    group = btn.parentElement;
    const label = btn.querySelector(".tl")?.textContent ?? btn.getAttribute("aria-label") ?? "";
    const pressed = btn.getAttribute("aria-pressed");
    items.push({
      label, icon: btn.querySelector(".ti")?.textContent ?? "", disabled: btn.disabled, checked: pressed === null ? undefined : pressed === "true",
      action: () => clickHidden(btn),
    });
  }
  return items;
}

function updateStatusViews() {
  const box = $("#status-views");
  if (!box) return;
  box.hidden = state.workspace === "home" || state.workspace === "tools";
  for (const btn of box.querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.view === state.settings.view));
}

function buildStatusViews() {
  const box = $("#status-views");
  if (!box) return;
  on("settings", () => {
    for (const [id, , , tip] of VIEWS) {
      const b = box.querySelector(`[data-view="${id}"]`);
      if (b) b.title = `${tip}${hintOf(`view.${id}`)}`;
    }
  });
  for (const [id, icon, label, tip] of VIEWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "status-view";
    btn.dataset.view = id;
    btn.title = `${tip}${hintOf(`view.${id}`)}`;
    btn.setAttribute("aria-pressed", "false");
    const i = document.createElement("span");
    i.setAttribute("aria-hidden", "true");
    i.textContent = icon;
    const l = document.createElement("span");
    l.className = "sv-label";
    l.textContent = label;
    btn.append(i, l);
    btn.addEventListener("click", () => saveSettings({ view: id }));
    box.append(btn);
  }
  updateStatusViews();
}

export function wireChrome() {
  buildStatusViews();
  for (const ev of ["settings", "workspace"]) on(ev, updateStatusViews);
  const more = $("#tool-more");
  more.addEventListener("click", () => {
    const items = overflowItems();
    if (items.length) showMenu(items, { anchor: more, label: "More actions" });
  });
  // A short timer rather than an animation frame, so it also runs when the window is hidden or in the background.
  const queue = debounce(fitToolbar, 30);
  if (typeof ResizeObserver === "function") new ResizeObserver(queue).observe($("#toolbar-row"));
  if (typeof MutationObserver === "function") new MutationObserver(queue).observe($("#toolbar"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  for (const ev of ["workspace", "settings", "power"]) on(ev, queue);
  window.addEventListener("resize", queue);
  queue();
}
