// Friendlier chrome: the toolbar keeps to one tidy row (buttons that don't fit move into a "More" menu), and the status
// bar has quick buttons for how the file list looks (Details, List, Icons).
import { dateMetrics, showCalendarDialog, showClockMenu } from "./clockTools.js";
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

const CLOCK_24H_KEY = "fm_clock_24h";
const CLOCK_SEC_KEY = "fm_clock_sec";
const CLOCK_UTC_KEY = "fm_clock_utc";
let clockTimer = null;
let clock24hMem = false;
let clockSecMem = true;
let clockUtcMem = false;

function readStorageBool(key, fallback) {
  try {
    const ls = typeof window !== "undefined" && window.localStorage ? window.localStorage : typeof localStorage !== "undefined" ? localStorage : null;
    const v = ls?.getItem(key);
    if (v === "1" || v === "0") return v === "1";
  } catch {}
  return fallback;
}

function writeStorageBool(key, val) {
  try {
    const ls = typeof window !== "undefined" && window.localStorage ? window.localStorage : typeof localStorage !== "undefined" ? localStorage : null;
    ls?.setItem(key, val ? "1" : "0");
  } catch {}
}

export const isClock24h = () => readStorageBool(CLOCK_24H_KEY, clock24hMem);
export function setClock24h(val) {
  clock24hMem = Boolean(val);
  writeStorageBool(CLOCK_24H_KEY, clock24hMem);
  updateClock();
}

export const isClockSeconds = () => readStorageBool(CLOCK_SEC_KEY, clockSecMem);
export function setClockSeconds(val) {
  clockSecMem = Boolean(val);
  writeStorageBool(CLOCK_SEC_KEY, clockSecMem);
  updateClock();
}

export const isClockUtc = () => readStorageBool(CLOCK_UTC_KEY, clockUtcMem);
export function setClockUtc(val) {
  clockUtcMem = Boolean(val);
  writeStorageBool(CLOCK_UTC_KEY, clockUtcMem);
  updateClock();
}

export const clockPrefs = {
  is24h: isClock24h,
  set24h: setClock24h,
  showSeconds: isClockSeconds,
  setShowSeconds: setClockSeconds,
  showUtc: isClockUtc,
  setShowUtc: setClockUtc,
};

const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const LONG_DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const TIME_FMT_CACHE = new Map();

function getTimeFormatter(use24h, showSec) {
  const key = `${use24h ? "24" : "12"}:${showSec ? "sec" : "min"}`;
  let fmt = TIME_FMT_CACHE.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(undefined, {
      hour: use24h ? "2-digit" : "numeric",
      minute: "2-digit",
      ...(showSec ? { second: "2-digit" } : {}),
      hour12: !use24h,
    });
    TIME_FMT_CACHE.set(key, fmt);
  }
  return fmt;
}

/** Formats a Date into short/long date strings and a 12-hour or 24-hour time string with optional seconds and UTC badge. */
export function formatClock(now = new Date(), use24h = isClock24h(), showSec = isClockSeconds(), showUtc = isClockUtc()) {
  const shortDate = SHORT_DATE_FMT.format(now);
  const longDate = LONG_DATE_FMT.format(now);
  const baseTime = getTimeFormatter(use24h, showSec).format(now);
  const m = dateMetrics(now);
  const time = showUtc ? `${baseTime} · ${m.utcShortTime}` : baseTime;
  return {
    shortDate,
    longDate,
    time,
    full: `${longDate} · ${time}`,
    compact: `${shortDate} · ${time}`,
    meta: `Week ${m.isoWeek} · Day ${m.dayOfYear} · ${m.utcOffset}`,
    iso: now.toISOString(),
    use24h,
    metrics: m,
  };
}

/** Refreshes the date and time pills in the top view bar, status bar, and Home page hero. */
export function updateClock(now = new Date()) {
  if (typeof document === "undefined") return;
  const c = formatClock(now);
  const vbClock = $("#fm-clock");
  if (vbClock) {
    vbClock.setAttribute("datetime", c.iso);
    const nextTitle = `${c.full} (${c.meta}) — click to switch to ${c.use24h ? "12-hour" : "24-hour"} time, or right-click for calendar & timestamps`;
    if (vbClock.title !== nextTitle) vbClock.title = nextTitle;
    const d = $("#fm-clock-date");
    const t = $("#fm-clock-time");
    if (d && d.textContent !== c.shortDate) d.textContent = c.shortDate;
    if (t && t.textContent !== c.time) t.textContent = c.time;
  }
  const statusClock = $("#status-clock");
  if (statusClock) {
    statusClock.setAttribute("datetime", c.iso);
    if (statusClock.textContent !== c.compact) statusClock.textContent = c.compact;
    const nextStatusTitle = `${c.full} (${c.meta}) — click for calendar, world clocks & timestamps`;
    if (statusClock.title !== nextStatusTitle) statusClock.title = nextStatusTitle;
  }
  const homeClock = document.getElementById("home-datetime");
  if (homeClock) {
    const nextHomeText = `${c.full} · Week ${c.metrics.isoWeek}`;
    if (homeClock.textContent !== nextHomeText) homeClock.textContent = nextHomeText;
    const nextHomeTitle = `${c.meta} — click to open Calendar, World Clocks & Timestamps`;
    if (homeClock.title !== nextHomeTitle) homeClock.title = nextHomeTitle;
  }
}

export const openClockMenu = (anchor = $("#fm-clock")) => showClockMenu(anchor, clockPrefs);
export const openCalendarDialog = (date = new Date()) => showCalendarDialog(date, clockPrefs);

function wireClock() {
  const vbClock = $("#fm-clock");
  if (vbClock) {
    const toggle = () => setClock24h(!isClock24h());
    vbClock.addEventListener("click", toggle);
    vbClock.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openClockMenu(vbClock);
    });
    vbClock.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        openClockMenu(vbClock);
      }
    });
  }
  const statusClock = $("#status-clock");
  if (statusClock) {
    statusClock.addEventListener("click", () => openClockMenu(statusClock));
    statusClock.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openClockMenu(statusClock);
    });
  }
  updateClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    updateClock();
  }, 1000);
  clockTimer?.unref?.();
}

export function wireChrome() {
  buildStatusViews();
  wireClock();
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
