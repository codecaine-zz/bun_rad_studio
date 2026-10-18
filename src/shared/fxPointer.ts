// The one script the fx layer needs: a delegated, rAF-throttled pointer handler (about 60 lines of plain JavaScript).
// It only writes CSS custom properties; every visual change is a CSS transform or opacity that runs on the compositor.
//   --fx-pointer-x / --fx-pointer-y   position inside the hovered button, card or panel (cursor glow)
//   --fx-tilt-x / --fx-tilt-y         card tilt in degrees, at most 4
//   --fx-mag-x / --fx-mag-y           toolbar item drift in px, at most 6
//   --fx-pill-x / --fx-pill-w         sliding tab indicator (translateX in px, scaleX factor)
// It does nothing unless <html data-fx="on">, ignores touch, listens passively, and `dispose()` removes everything.
import { FX_MAGNET_TARGETS, FX_PILL_BARS, FX_POINTER_TARGETS, FX_TILT_TARGETS } from "./fxSelectors";

export const FX_TILT_MAX_DEG = 4;
export const FX_MAGNET_MAX_PX = 6;

/** A function expression: `(function (win) { ... })`. Call it with a window to install; it returns `{ dispose, refresh }`. */
export const FX_POINTER_FUNCTION = `(function (win) {
  var doc = win.document;
  if (doc.__fxPointer) return doc.__fxPointer;
  var TARGETS = ${JSON.stringify(FX_POINTER_TARGETS)};
  var TILT = ${JSON.stringify(FX_TILT_TARGETS)};
  var MAGNET = ${JSON.stringify(FX_MAGNET_TARGETS)};
  var BARS = ${JSON.stringify(FX_PILL_BARS)};
  var root = doc.documentElement, nav = win.navigator || {};
  var pending = null, raf = 0, current = null, cur = {}, lastTs = 0, lag = 0;
  var mm = function (q) { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch (_) { return false; } };
  var forced = mm("(forced-colors: active)");
  var low = forced || mm("(prefers-reduced-transparency: reduce)") || !!(nav.connection && nav.connection.saveData) || (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2) || (nav.deviceMemory > 0 && nav.deviceMemory <= 2) || root.getAttribute("data-fx-tier") === "low";
  function downgrade(off) {
    low = true; root.setAttribute("data-fx-tier", "low");
    if (root.getAttribute("data-fx") === "on") root.setAttribute("data-fx", off ? "off" : "reduced");
  }
  if (low && root.hasAttribute("data-fx")) downgrade(forced);
  // The page switch is <html data-fx="on">; the Designer turns it on for single regions instead.
  function on(t) { return !low && (root.getAttribute("data-fx") === "on" || !!(t && t.closest && t.closest('[data-fx="on"]'))); }
  function clear(el) {
    if (!el) return;
    var s = el.style;
    s.removeProperty("--fx-pointer-x"); s.removeProperty("--fx-pointer-y");
    s.removeProperty("--fx-tilt-x"); s.removeProperty("--fx-tilt-y");
    s.removeProperty("--fx-mag-x"); s.removeProperty("--fx-mag-y");
  }
  function put(el, name, value) {
    if (cur[name] === value) return;
    cur[name] = value;
    el.style.setProperty(name, value);
  }
  function frame(ts) {
    raf = 0;
    if (typeof ts === "number" && lastTs > 0) {
      var dt = ts - lastTs;
      if (dt > 55 && dt < 500) { if (++lag >= 8) { downgrade(false); clear(current); current = null; cur = {}; return; } }
      else if (dt < 32) lag = 0;
    }
    if (typeof ts === "number") lastTs = ts;
    var e = pending; pending = null;
    if (!e || !on(e.target)) return;
    var t = e.target;
    var el = t && t.closest ? (t.closest(MAGNET) || t.closest(TARGETS)) : null;
    if (el !== current) { clear(current); current = el; cur = {}; }
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var x = e.clientX - r.left, y = e.clientY - r.top;
    put(el, "--fx-pointer-x", (Math.round(x * 10) / 10) + "px");
    put(el, "--fx-pointer-y", (Math.round(y * 10) / 10) + "px");
    if (el.matches(TILT)) {
      put(el, "--fx-tilt-x", (Math.round((0.5 - y / r.height) * ${FX_TILT_MAX_DEG * 2} * 10) / 10) + "deg");
      put(el, "--fx-tilt-y", (Math.round((x / r.width - 0.5) * ${FX_TILT_MAX_DEG * 2} * 10) / 10) + "deg");
    }
    if (el.matches(MAGNET)) {
      var mx = Math.max(-1, Math.min(1, (x - r.width / 2) / (r.width / 2)));
      var my = Math.max(-1, Math.min(1, (y - r.height / 2) / (r.height / 2)));
      put(el, "--fx-mag-x", (Math.round(mx * ${FX_MAGNET_MAX_PX} * 2) / 2) + "px");
      put(el, "--fx-mag-y", (Math.round(my * ${FX_MAGNET_MAX_PX} * 2) / 2) + "px");
    }
  }
  function move(e) {
    if (e.pointerType === "touch" || !on(e.target)) return;
    pending = e;
    if (!raf) raf = win.requestAnimationFrame(frame);
  }
  function leave(e) {
    if (e.target === current || e.target === doc || e.target === root) { clear(current); current = null; cur = {}; }
  }
  function pill(bar) {
    var active = bar.querySelector('[aria-selected="true"],[data-active="true"],.is-active,.active');
    if (!active && bar.getAttribute("data-value") != null) {
      var kids = bar.children;
      for (var i = 0; i < kids.length; i++) if (kids[i].getAttribute("data-tab") === bar.getAttribute("data-value")) { active = kids[i]; break; }
    }
    if (!active) active = bar.firstElementChild;
    if (!active) return;
    bar.style.setProperty("--fx-pill-x", active.offsetLeft + "px");
    bar.style.setProperty("--fx-pill-w", String(active.offsetWidth));
    bar.setAttribute("data-fx-pill", "");
  }
  function pills() {
    var bars = doc.querySelectorAll(BARS);
    for (var i = 0; i < bars.length; i++) if (on(bars[i])) pill(bars[i]);
  }
  function click(e) {
    var bar = e.target && e.target.closest ? e.target.closest(BARS) : null;
    if (bar && on(bar)) win.requestAnimationFrame(function () { pill(bar); });
  }
  var opts = { passive: true };
  doc.addEventListener("pointermove", move, opts);
  doc.addEventListener("pointerleave", leave, { passive: true, capture: true });
  doc.addEventListener("click", click, opts);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", pills, { once: true }); else pills();
  var api = {
    refresh: pills,
    dispose: function () {
      doc.removeEventListener("pointermove", move, opts);
      doc.removeEventListener("pointerleave", leave, { passive: true, capture: true });
      doc.removeEventListener("click", click, opts);
      doc.removeEventListener("DOMContentLoaded", pills);
      if (raf) win.cancelAnimationFrame(raf);
      clear(current); current = null; pending = null; raf = 0;
      delete doc.__fxPointer;
    }
  };
  doc.__fxPointer = api;
  return api;
})`;

/** Statement that installs the helper in a page: embed inside a <script> tag. */
export const FX_POINTER_SOURCE = `${FX_POINTER_FUNCTION}(window);`;

export interface FxPointerHandle {
    dispose(): void;
    refresh(): void;
}

/** Installs the helper on a window (a jsdom window in tests). Returns a handle that removes the listeners. */
export function installFxPointer(win: unknown): FxPointerHandle {
    return (0, eval)(FX_POINTER_FUNCTION)(win) as FxPointerHandle;
}
