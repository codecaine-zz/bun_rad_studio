// The status-bar pill ("🔒 Locked" / "🔓 Unlocked · locks in 4:32"), the idle countdown, and what happens when you
// look away: values are hidden when the window loses focus or the tab changes, and the vault locks if that is turned on.
// The countdown is only a display; the real timer is on the server and a status check never restarts it.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { openPower } from "./power.js";
import { clock } from "./secretsClock.js";
import { lockNow, mmss, refreshStatus, sx, wipeAll } from "./secretsState.js";
import { on, state } from "./state.js";

const POLL_EVERY = 10;
const PING_EVERY_MS = 20_000;
let pill = null;
let tick = 0;
let left = null;
let ticks = 0;
let lastPing = 0;
let started = false;
let unsubscribe = [];
let watched = null;
let onBlur = null;
let onHidden = null;

function spoken(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m ? `${m} minute${m === 1 ? "" : "s"} ` : ""}${s} second${s === 1 ? "" : "s"}`.trim();
}

function paint() {
  const status = sx.status;
  if (typeof document === "undefined") return;
  if (!status?.exists) {
    pill?.remove();
    pill = null;
    return;
  }
  const where = document.getElementById("status-right");
  if (!where) return;
  if (!pill || !pill.isConnected) {
    pill = h("button", { type: "button", class: "secrets-pill", onclick: () => openPower("secrets") });
    where.prepend(pill);
  }
  const locked = status.locked !== false;
  const text = locked ? "🔒 Locked" : left === null ? "🔓 Unlocked" : `🔓 Unlocked · locks in ${mmss(left)}`;
  pill.textContent = text;
  pill.dataset.state = locked ? "locked" : "open";
  pill.title = locked ? "Your secret space is locked. Click to open the Secrets tool." : "Your secret space is unlocked. Click to open the Secrets tool.";
  pill.setAttribute("aria-label", locked ? "Secrets: locked. Open the Secrets tool." : `Secrets: unlocked${left === null ? "" : `, locks in ${spoken(left)}`}. Open the Secrets tool.`);
}

function stopTick() {
  if (tick) clock.clearInterval(tick);
  tick = 0;
}

function startTick() {
  stopTick();
  ticks = 0;
  tick = clock.setInterval(async () => {
    ticks++;
    if (left !== null && left > 0) left -= 1;
    paint();
    if (ticks % POLL_EVERY === 0 || left === 0) await refreshStatus();
  }, 1000);
}

function onStatus(status) {
  left = status.locked === false ? status.idleSeconds ?? null : null;
  paint();
  if (status.exists && status.locked === false) startTick();
  else stopTick();
}

/** The person is using the vault page: tell the server, at most every 20 seconds, so the idle timer restarts. */
export async function noteActivity() {
  if (sx.status?.locked !== false || clock.now() - lastPing < PING_EVERY_MS) return;
  lastPing = clock.now();
  try {
    const res = await call("secrets/ping");
    left = res.idleSeconds;
    paint();
  } catch {
    // the status poll will notice a lock
  }
}

async function lookedAway() {
  wipeAll();
  if (sx.status?.locked === false && sx.status.settings?.lockOnBlur) await lockNow("Locked because you switched away.");
}

/** Starts the pill and the look-away handling once. Safe to call again. */
export function startStatusWatch() {
  if (started || typeof document === "undefined") return;
  started = true;
  unsubscribe = [
    on("secrets-status", onStatus),
    on("secrets-locked", () => {
      if (sx.userLock) sx.userLock = false;
      else {
        toast("The vault locked itself after being idle.");
        announce("The vault locked itself.");
      }
    }),
    on("power-tab", (id) => {
      sx.activeTab = id === "secrets";
      if (id !== "secrets") wipeAll();
    }),
    on("power", () => {
      if (!state.powerOpen) wipeAll();
    }),
  ];
  watched = window;
  onBlur = lookedAway;
  onHidden = () => {
    if (document.visibilityState === "hidden") lookedAway();
  };
  watched.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onHidden);
  refreshStatus();
}

/** Undoes startStatusWatch (a page that is torn down, and tests that start the page more than once in one process). */
export function stopStatusWatch() {
  for (const off of unsubscribe.splice(0)) off();
  watched?.removeEventListener("blur", onBlur);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHidden);
  watched = null;
  stopTick();
  pill?.remove();
  pill = null;
  started = false;
}
