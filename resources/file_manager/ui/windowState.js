// The window's size and position, from the page's side. In the desktop app the window process offers a few functions
// (window.fmWindowPoll, fmWindowChanged, fmWindowSave, fmWindowReset, fmWindowApply); this file watches the window and
// reports real changes so the app can remember them, and wraps those functions for the Settings dialog. In an ordinary
// browser (the File Manager started with --server) there is no such window and none of this does anything.
import { toast } from "./menus.js";

/** How long to wait after the last change before reporting it, and how often to look. Tests change these. */
export const timing = { debounceMs: 500, pollMs: 500, retryMs: 600, retries: 5 };

export const REMEMBERED_TOAST = "Your window size is remembered. Settings → Window → Reset to default to go back to full screen.";

/** True in the desktop app, where the window can be managed. */
export const hasDesktopWindow = () => typeof window !== "undefined" && typeof window.fmWindowChanged === "function";

const call = (name, ...args) => {
  try {
    return typeof window[name] === "function" ? Promise.resolve(window[name](...args)).catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
};

/** The window process's functions, each answering `null` when it isn't there. */
export const bridge = {
  poll: () => call("fmWindowPoll"),
  changed: (report) => call("fmWindowChanged", report),
  save: (report) => call("fmWindowSave", report),
  reset: () => call("fmWindowReset"),
  apply: (mode) => call("fmWindowApply", mode),
};

const whole = (n) => (Number.isFinite(n) ? Math.round(n) : 0);

/** What the page itself can tell about the window. Not reliable everywhere (a Mac web view says 0 for the window's size), so it is only a fallback. */
export function pageMetrics(win = window) {
  const screen = win.screen ?? {};
  return {
    x: win.screenX ?? 0,
    y: win.screenY ?? 0,
    outerWidth: win.outerWidth ?? 0,
    outerHeight: win.outerHeight ?? 0,
    innerWidth: win.innerWidth ?? 0,
    innerHeight: win.innerHeight ?? 0,
    screenWidth: screen.width ?? 0,
    screenHeight: screen.height ?? 0,
    availWidth: screen.availWidth ?? 0,
    availHeight: screen.availHeight ?? 0,
    dpr: win.devicePixelRatio ?? 1,
    fullscreen: !!win.document?.fullscreenElement,
  };
}

/**
 * The report for the window process: its real frame when the window process could read it (`native`), else the
 * page's own numbers, else nothing.
 * @returns {null | { x: number, y: number, width: number, height: number, maximized: boolean, fullscreen: boolean, screenWidth: number, screenHeight: number, dpr: number }}
 */
export function buildReport(native, page) {
  const screen = { screenWidth: whole(page.screenWidth), screenHeight: whole(page.screenHeight), dpr: Math.round((page.dpr || 1) * 100) / 100 };
  if (native && [native.x, native.y, native.width, native.height].every(Number.isFinite)) {
    return { x: whole(native.x), y: whole(native.y), width: whole(native.width), height: whole(native.height), maximized: native.maximized === true, fullscreen: native.fullscreen === true, ...screen };
  }
  if (page.outerWidth > 0 && page.outerHeight > 0) {
    const fillsWork = page.innerWidth >= page.availWidth - 8 && page.innerHeight >= page.availHeight - 80;
    const fullscreen = page.fullscreen || (page.screenWidth > 0 && page.innerWidth >= page.screenWidth && page.innerHeight >= page.screenHeight);
    return { x: whole(page.x), y: whole(page.y), width: whole(page.outerWidth), height: whole(page.outerHeight), maximized: fillsWork && !fullscreen, fullscreen, ...screen };
  }
  return null;
}

const keyOf = (r) => `${r.x},${r.y},${r.width},${r.height},${r.maximized ? 1 : 0},${r.fullscreen ? 1 : 0},${r.screenWidth},${r.screenHeight},${r.dpr}`;

/**
 * Watches the window and reports a change once it has really changed: the first steady look is the starting point (so
 * opening the window never counts), then any different look is sent after it has held still for `debounceMs`.
 * @param {{ bridge?: typeof bridge, measure?: () => any, timers?: any, onSwitched?: () => void, isVisible?: () => boolean, win?: Window }} [options]
 */
export function createWindowReporter(options = {}) {
  const b = options.bridge ?? bridge;
  const win = options.win ?? (typeof window === "undefined" ? undefined : window);
  const measure = options.measure ?? (() => pageMetrics(win));
  const timers = options.timers ?? { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t), setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t) };
  const visible = options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
  let interval = null;
  let debounce = null;
  let candidate = "";
  let baseline = "";
  let sentKey = "";
  let pending = null;
  let busy = false;
  let sending = false;
  let stopped = false;
  let failures = 0;
  const stopWatching = () => api.stop();

  async function send() {
    debounce = null;
    if (!pending || sending || stopped) return;
    const report = pending;
    const key = keyOf(report);
    sending = true;
    let answer = null;
    try {
      answer = await b.changed(report);
    } finally {
      sending = false;
    }
    // "ignored" means the app had just moved the window itself: look again at the next tick. No answer at all (the
    // window process isn't there) is given up on after a few tries.
    if (!answer || answer.ignored) {
      pending = null;
      if (!answer && ++failures >= 5) stopWatching();
      return;
    }
    failures = 0;
    sentKey = key;
    if (pending && keyOf(pending) === key) pending = null;
    if (answer.modeSwitched) options.onSwitched?.();
  }

  async function tick() {
    if (busy || stopped || !visible()) return;
    busy = true;
    try {
      const native = await b.poll();
      const report = buildReport(native, measure());
      if (!report) return;
      const key = keyOf(report);
      if (!baseline) {
        if (key === candidate) baseline = sentKey = key;
        else candidate = key;
        return;
      }
      if (key === sentKey) {
        pending = null;
        if (debounce) timers.clearTimeout(debounce);
        debounce = null;
        return;
      }
      if (pending && keyOf(pending) === key) return;
      pending = report;
      if (debounce) timers.clearTimeout(debounce);
      debounce = timers.setTimeout(send, timing.debounceMs);
    } finally {
      busy = false;
    }
  }

  /** The page is going away: send what is waiting at once. */
  function flushNow() {
    if (debounce) timers.clearTimeout(debounce);
    debounce = null;
    if (pending && !sending && baseline) void send();
  }

  const api = {
    start() {
      if (interval !== null || stopped) return;
      interval = timers.setInterval(tick, timing.pollMs);
      win?.addEventListener("resize", tick);
      win?.addEventListener("pagehide", flushNow);
      win?.addEventListener("beforeunload", flushNow);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", tick);
    },
    stop() {
      stopped = true;
      if (interval !== null) timers.clearInterval(interval);
      if (debounce) timers.clearTimeout(debounce);
      interval = debounce = null;
      win?.removeEventListener("resize", tick);
      win?.removeEventListener("pagehide", flushNow);
      win?.removeEventListener("beforeunload", flushNow);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", tick);
    },
    tick,
    flushNow,
  };
  return api;
}

let reporter = null;
let toldOnce = false;

/** Starts watching the window (desktop app only). Safe to call again. */
export function wireWindowState() {
  if (reporter || !hasDesktopWindow()) return null;
  reporter = createWindowReporter({
    onSwitched: () => {
      if (toldOnce) return;
      toldOnce = true;
      toast(REMEMBERED_TOAST);
    },
  });
  reporter.start();
  return reporter;
}

/** For tests: forget the running reporter. */
export function stopWindowState() {
  reporter?.stop();
  reporter = null;
  toldOnce = false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the window process to do something about the window, again after a moment while it says "not yet" (leaving
 * full screen takes a moment).
 * @param {() => Promise<any>} first @param {() => Promise<any>} again
 */
export async function untilSettled(first, again) {
  let answer = await first();
  for (let i = 0; i < timing.retries && answer && answer.ok && answer.settled === false; i++) {
    await sleep(timing.retryMs);
    answer = await again();
  }
  return answer;
}
