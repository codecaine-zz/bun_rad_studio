/**
 * Runs a SimpleGUI window inside a web page instead of a native window.
 *
 * SimpleGUI windows talk to their page through a handful of webview functions: `bind` (page -> program calls),
 * `eval` (program -> page code), `setHTML`, `title` and `size`. This file provides those over a WebSocket so the
 * same app, unchanged, can be shown in a frame of another program (the File Manager hosts the API Studio, the App
 * Bundler and the Environment Studio this way).
 *
 *   const hub = createHostedHub();
 *   const session = hub.open("api", () => createApiStudio({ fullscreen: false }));
 *   // serve hostedPage(session, wsUrl) at some address, and connect each WebSocket with session.attach(peer)
 *
 * It only carries messages. The caller decides who may fetch the page and open the socket (a secret per session,
 * the Origin check): see src/features/filemanager/fmHostedStudios.ts.
 */
import { randomBytes } from "crypto";
import type { SimpleWindow } from "./simplegui";

/** Biggest message accepted from a page (a few exported files fit). */
export const MAX_HOST_MESSAGE = 8 * 1024 * 1024;
const MAX_BACKLOG = 2000;

/** WebSocket peer capable of receiving serialized messages from a hosted `SimpleWindow` session. */
export interface HostedPeer {
  send(text: string): void;
}

type BoundFn = (...args: any[]) => unknown;

/** The part of a Webview that SimpleWindow uses, backed by a web page. */
class HostedWebview {
  /** Tells SimpleWindow's native-window helpers to leave this alone. */
  readonly isHosted = true;
  private titleValue = "";
  size: { width: number; height: number; hint: number } = {
    width: 0,
    height: 0,
    hint: 0,
  };

  constructor(private readonly session: HostedSession) {}

  get title(): string {
    return this.titleValue;
  }
  set title(value: string) {
    this.titleValue = String(value);
    this.session.title = this.titleValue;
  }
  bind(name: string, fn: BoundFn): void {
    if (this.session.binds.has(name))
      throw new Error(`"${name}" is already bound`);
    this.session.binds.set(name, fn);
    this.session.push({ t: "bind", name });
  }
  eval(code: string): void {
    this.session.push({ t: "eval", code: String(code) });
  }
  setHTML(html: string): void {
    this.session.html = String(html);
  }
  navigate(): void {}
  run(): void {}
  destroy(): void {}
}

/**
 * Active browser-hosted session for a `SimpleWindow` instance, managing RPC bindings, queued evaluations, and connected WebSocket peers.
 */
export class HostedSession {
  /** The page's own secret: whoever fetches its page or opens its socket must know it. */
  readonly secret = randomBytes(24).toString("base64url");
  readonly binds = new Map<string, BoundFn>();
  readonly webview: HostedWebview;
  html = "";
  title = "";
  closed = false;
  onReconnect?: (peer: HostedPeer) => void;
  private hasAttachedOnce = false;
  private readonly peers = new Set<HostedPeer>();
  private backlog: string[] = [];

  /** Creates a new `HostedSession` identified by `id` with an associated virtual webview. */
  constructor(readonly id: string) {
    this.webview = new HostedWebview(this);
  }

  /** Sends to every connected page; before the first page connects the messages wait (the window starts evaluating code at once). */
  push(message: object): void {
    if (this.closed) return;
    const text = JSON.stringify(message);
    if (this.peers.size === 0) {
      if (this.backlog.length < MAX_BACKLOG) this.backlog.push(text);
      return;
    }
    for (const peer of this.peers) {
      try {
        peer.send(text);
      } catch {
        this.peers.delete(peer);
      }
    }
  }

  /** Attaches a connected WebSocket peer to this session and flushes any queued backlog messages. */
  attach(peer: HostedPeer): void {
    if (this.closed) return;
    const isReconnect = this.hasAttachedOnce;
    this.hasAttachedOnce = true;
    this.peers.add(peer);
    const waiting = this.backlog;
    this.backlog = [];
    for (const text of waiting) {
      try {
        peer.send(text);
      } catch {
        this.peers.delete(peer);
        return;
      }
    }
    if (isReconnect && this.onReconnect) {
      try {
        this.onReconnect(peer);
      } catch {
        /* ignore reconnect sync errors */
      }
    }
  }

  /** Removes a disconnected WebSocket peer from this session. */
  detach(peer: HostedPeer): void {
    this.peers.delete(peer);
  }

  /** Runs one call from the page and answers it (`{ t: "res", id, ok, v | e }`). Never throws. */
  async handleMessage(peer: HostedPeer, raw: string): Promise<void> {
    if (this.closed || typeof raw !== "string" || raw.length > MAX_HOST_MESSAGE)
      return;
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (
      !m ||
      m.t !== "call" ||
      typeof m.name !== "string" ||
      !Number.isSafeInteger(m.id)
    )
      return;
    const reply = (body: object) => {
      try {
        peer.send(JSON.stringify({ t: "res", id: m.id, ...body }));
      } catch {
        /* the page went away */
      }
    };
    const fn = this.binds.get(m.name);
    if (!fn) return reply({ ok: false, e: `No such function: ${m.name}` });
    try {
      const value = await fn(...(Array.isArray(m.args) ? m.args : []));
      reply({ ok: true, v: value === undefined ? null : value });
    } catch (err: any) {
      reply({ ok: false, e: String(err?.message ?? err) });
    }
  }

  /** Closes the session, clearing all connected peers, queued messages, and RPC bindings. */
  close(): void {
    this.closed = true;
    this.peers.clear();
    this.backlog = [];
    this.binds.clear();
  }
}

/** Manager for opening, looking up, and closing browser-hosted `SimpleWindow` sessions. */
export interface HostedHub {
  /** Starts a fresh window for `key` (an earlier one with the same key is closed first). */
  open(key: string, create: () => SimpleWindow): HostedSession;
  get(key: string): HostedSession | undefined;
  close(key: string): void;
  closeAll(): void;
}

/** Creates a `HostedHub` that allows up to `maxOpen` concurrent browser-hosted `SimpleWindow` sessions. */
export function createHostedHub(maxOpen = 6): HostedHub {
  const open = new Map<string, { session: HostedSession; win: SimpleWindow }>();

  const close = (key: string) => {
    const entry = open.get(key);
    if (!entry) return;
    open.delete(key);
    entry.session.close();
    try {
      if (entry.win.isRunning()) entry.win.close();
    } catch {
      /* it is going away anyway */
    }
  };

  return {
    open(key, create) {
      close(key);
      if (open.size >= maxOpen)
        throw new Error("Too many tools are open. Close one first.");
      const session = new HostedSession(key);
      const win = create();
      try {
        win.hostInBrowser(() => session.webview);
        win.show();
      } catch (err) {
        session.close();
        throw err;
      }
      session.onReconnect = (peer) => {
        const vals = win.getFormValues();
        const entries = Object.entries(vals);
        if (entries.length === 0 && !win.getTitle()) return;
        const syncCode = `(function(){
          document.title = ${JSON.stringify(win.getTitle())};
          var vals = ${JSON.stringify(vals)};
          Object.keys(vals).forEach(function(id) {
            var rawEl = document.getElementById(id);
            if (!rawEl) return;
            var val = vals[id];
            var el = (rawEl.tagName === "INPUT" || rawEl.tagName === "SELECT" || rawEl.tagName === "TEXTAREA")
              ? rawEl
              : (rawEl.querySelector("input, select, textarea") || rawEl);
            if (el.type === "checkbox" || el.type === "radio") el.checked = Boolean(val);
            else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") el.value = String(val == null ? "" : val);
            else if (!rawEl.querySelector("table, svg")) rawEl.textContent = String(val == null ? "" : val);
          });
        })();`;
        peer.send(JSON.stringify({ t: "eval", code: syncCode }));
      };
      open.set(key, { session, win });
      return session;
    },
    get: (key) => open.get(key)?.session,
    close,
    closeAll() {
      for (const key of [...open.keys()]) close(key);
    },
  };
}

/** The script that gives the page the `window.<name>()` functions a webview would, and runs the code sent to it. */
function clientScript(names: string[], wsUrl: string): string {
  return `(function () {
  var NAMES = ${JSON.stringify(names)};
  var WS_URL = ${JSON.stringify(wsUrl)};
  var ws = null, ready = false, outbox = [], pending = {}, counter = 0, evals = [], domReady = document.readyState !== "loading";
  function runEval(code) { try { (0, eval)(code); if (_lastFmTheme) applyFmTheme(_lastFmTheme); } catch (e) { console.error(e); } }
  function flushEvals() { domReady = true; evals.splice(0).forEach(runEval); if (_lastFmTheme) applyFmTheme(_lastFmTheme); }
  if (!domReady) document.addEventListener("DOMContentLoaded", flushEvals);
  var _lastFmTheme = null;
  var _verifiedParentOrigin = "";
  var _loopbackHosts = { "127.0.0.1": 1, "localhost": 1, "::1": 1, "[::1]": 1 };
  function cleanCssVal(val, fallback) {
    var s = typeof val === "string" ? val.trim() : "";
    if (!s || s.length > 160 || /[{}<>\\\\;]|\\burl\\s*\\(|@import/i.test(s)) return fallback;
    return s;
  }
  function getParentWin() {
    var p = (typeof parent !== "undefined" && parent) ? parent : window.parent;
    return (p && p !== window) ? p : null;
  }
  function getTrustedParentOrigin(p) {
    if (_verifiedParentOrigin) return _verifiedParentOrigin;
    try {
      if (p && p.location && p.location.origin && p.location.origin !== "null") {
        return p.location.origin;
      }
    } catch (_) {}
    try {
      var loc = window.location;
      if (!loc) return "";
      if (document.referrer) {
        var ref = new URL(document.referrer);
        var lh = (loc.hostname || "").toLowerCase();
        var rh = (ref.hostname || "").toLowerCase();
        if (ref.origin === loc.origin || (ref.protocol === loc.protocol && ref.port === loc.port && _loopbackHosts[lh] && _loopbackHosts[rh])) {
          return ref.origin;
        }
      }
      var h = (loc.hostname || "").toLowerCase();
      if (h === "localhost") return loc.protocol + "//127.0.0.1" + (loc.port ? ":" + loc.port : "");
      if (h === "127.0.0.1") return loc.protocol + "//localhost" + (loc.port ? ":" + loc.port : "");
      return loc.origin && loc.origin !== "null" ? loc.origin : "";
    } catch (_) {
      return "";
    }
  }
  function postToParent(payload, includeTop) {
    var p = getParentWin();
    if (!p) return;
    var targetOrigin = getTrustedParentOrigin(p);
    if (!targetOrigin) return;
    try {
      if (includeTop && window.top && window.top !== window && window.top !== p) {
        window.top.postMessage(payload, targetOrigin);
      }
      p.postMessage(payload, targetOrigin);
    } catch (_) {}
  }
  function isTrustedParentMessage(e) {
    if (!e || !window.parent || window.parent === window || e.source !== window.parent) return false;
    var orig = String(e.origin || "");
    if (!orig || orig === "null") return false;
    var loc = window.location;
    if (loc && orig === loc.origin) {
      _verifiedParentOrigin = orig;
      return true;
    }
    try {
      var u = new URL(orig);
      if (loc && u.protocol === loc.protocol && u.port === loc.port && _loopbackHosts[(u.hostname || "").toLowerCase()] && _loopbackHosts[(loc.hostname || "").toLowerCase()]) {
        _verifiedParentOrigin = orig;
        return true;
      }
    } catch (_) {}
    return false;
  }
  function applyFmTheme(t) {
    if (!t || typeof t !== "object") return;
    _lastFmTheme = t;
    var v = t.vars || {};
    var scheme = t.scheme === "light" ? "light" : "dark";
    var bg = cleanCssVal(v.bg, scheme === "light" ? "#ffffff" : "#141820");
    var panel = cleanCssVal(v.panel, scheme === "light" ? "#f3f5f8" : "#1c222d");
    var sunken = cleanCssVal(v["surface-sunken"], bg);
    var text = cleanCssVal(v.text, scheme === "light" ? "#0f172a" : "#f8fafc");
    var muted = cleanCssVal(v.muted, scheme === "light" ? "#334155" : "#bcc6d4");
    var border = cleanCssVal(v.border, scheme === "light" ? "#cbd5e1" : "#384252");
    var accent = cleanCssVal(v.accent, "#38bdf8");
    var hover = cleanCssVal(v.hover, panel);
    var r = document.documentElement;
    r.dataset.theme = scheme;
    r.dataset.palette = typeof t.palette === "string" ? t.palette.slice(0, 64) : "";
    r.style.colorScheme = scheme;
    for (var k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k) && /^[a-zA-Z0-9_-]{1,64}$/.test(k)) {
        var cv = cleanCssVal(v[k], "");
        if (cv) r.style.setProperty("--" + k, cv);
      }
    }
    r.style.setProperty("--accent", accent);
    r.style.setProperty("--accent-secondary", cleanCssVal(v.selected, accent));
    r.style.setProperty("--btn-bg", panel);
    r.style.setProperty("--btn-fg", text);
    r.style.setProperty("--card-bg", panel);
    r.style.setProperty("--card-border", border);
    r.style.setProperty("--theme-fg", text);
    r.style.setProperty("--theme-muted", muted);
    r.style.setProperty("--input-bg", sunken);
    r.style.setProperty("--input-border", border);
    var st = document.getElementById("fm-hosted-studio-theme");
    if (!st && document.head) {
      st = document.createElement("style");
      st.id = "fm-hosted-studio-theme";
      document.head.appendChild(st);
    }
    if (st) {
      st.textContent =
        "html, body { background: " + bg + " !important; color: " + text + " !important; }\\n" +
        "fieldset, .simplegui-card, .sg-card { background: " + panel + " !important; border-color: " + border + " !important; color: " + text + " !important; }\\n" +
        "legend { color: " + accent + " !important; }\\n" +
        "label, .rad-label, span, p, td, th { color: " + text + "; }\\n" +
        "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='color']), select, textarea { background: " + sunken + " !important; color: " + text + " !important; border-color: " + border + " !important; }\\n" +
        "button { background: " + panel + " !important; color: " + text + " !important; border-color: " + border + " !important; }\\n" +
        "button:hover:not(:disabled) { background: " + hover + " !important; border-color: " + accent + " !important; }\\n" +
        "table, th, td { border-color: " + border + " !important; }\\n" +
        "th { background: " + panel + " !important; color: " + text + " !important; }";
    }
  }
  window.addEventListener("message", function (e) {
    if (!isTrustedParentMessage(e)) return;
    if (e.data && typeof e.data === "object" && e.data.fmTheme) {
      applyFmTheme(e.data.fmTheme);
    }
  });
  window.addEventListener("load", function () {
    postToParent({ fmRequestTheme: true }, false);
  });
  function define(name) {
    if (window[name] && window[name].__hosted) return;
    var f = function () {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function (resolve, reject) {
        var id = ++counter;
        pending[id] = { resolve: resolve, reject: reject };
        var text = JSON.stringify({ t: "call", id: id, name: name, args: args });
        if (ready) ws.send(text); else outbox.push(text);
      });
    };
    f.__hosted = true;
    window[name] = f;
  }
  function banner(text) {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:14px system-ui,sans-serif;padding:10px 16px;text-align:center";
    d.textContent = text;
    (document.body || document.documentElement).appendChild(d);
  }
  NAMES.forEach(define);
  ws = new WebSocket(WS_URL);
  ws.onopen = function () { ready = true; outbox.splice(0).forEach(function (t) { ws.send(t); }); };
  ws.onmessage = function (event) {
    var m; try { m = JSON.parse(event.data); } catch (e) { return; }
    if (m.t === "bind") define(m.name);
    else if (m.t === "eval") { if (domReady) runEval(m.code); else evals.push(m.code); }
    else if (m.t === "res") {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.ok) p.resolve(m.v); else p.reject(new Error(m.e));
    }
  };
  ws.onclose = function () {
    ready = false;
    Object.keys(pending).forEach(function (id) { pending[id].reject(new Error("The tool stopped.")); delete pending[id]; });
    banner("This tool has stopped. Switch to another tool and back to start it again.");
  };
  var _f11Down = false;
  window.addEventListener("blur", function () { _f11Down = false; });
  window.addEventListener("keydown", function (e) {
    if (!getParentWin()) return;
    var mod = e.ctrlKey || e.metaKey;
    var k = (e.key || "").toLowerCase();
    if ((mod && !e.altKey && !e.shiftKey && (k === "q" || k === "w" || e.code === "KeyQ" || e.code === "KeyW")) || (e.altKey && !mod && !e.shiftKey && (e.key === "F4" || e.code === "F4" || k === "q" || k === "w" || e.code === "KeyQ" || e.code === "KeyW"))) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !e.isComposing) {
        postToParent({ fmCloseApp: true }, true);
      }
      return;
    }
    var isF11 = e.key === "F11" || e.code === "F11" || e.key === "\\uF70E" || e.key === "SunF36" || e.keyCode === 122 || e.which === 122;
    if (isF11 || (mod && e.shiftKey && !e.altKey && (k === "u" || e.code === "KeyU")) || (e.ctrlKey && e.metaKey && !e.altKey && (k === "f" || e.code === "KeyF")) || (e.altKey && !mod && !e.shiftKey && (e.code === "Digit8" || e.key === "8"))) {
      if (isF11) _f11Down = true;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) {
        postToParent({ fmToggleExpand: true }, false);
      }
      return;
    }
    _f11Down = false;
    if (mod && !e.altKey && !e.shiftKey && (k === "k" || e.code === "KeyK")) {
      e.preventDefault();
      e.stopPropagation();
      postToParent({ fmFilterTools: true }, false);
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (k === "c" || e.code === "KeyC")) {
      var t = "";
      var el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.type !== "password" && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number" && el.selectionEnd > el.selectionStart) {
        t = String(el.value || "").slice(el.selectionStart, el.selectionEnd);
      } else if (typeof window.getSelection === "function") {
        var s = window.getSelection();
        if (s && !s.isCollapsed) t = s.toString();
      }
      if (t) {
        e.preventDefault();
        postToParent({ fmCopyText: t }, false);
        return;
      }
    }
  }, true);
  window.addEventListener("keydown", function (e) {
    if (!getParentWin()) return;
    if (e.key === "Escape" && (!e.defaultPrevented || e.__radEscBeepPrevented) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (document.querySelector && document.querySelector(".sgd-container, .modal-backdrop.active, .modal-overlay.open, .modal-overlay.active, dialog[open]")) return;
      e.preventDefault();
      postToParent({ fmEscapeExpand: true }, false);
    }
  }, false);
  window.addEventListener("keyup", function (e) {
    if (!getParentWin()) return;
    var isF11 = e.key === "F11" || e.code === "F11" || e.key === "\\uF70E" || e.key === "SunF36" || e.keyCode === 122 || e.which === 122;
    if (!isF11) return;
    if (_f11Down) {
      _f11Down = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    postToParent({ fmToggleExpand: true }, false);
  }, true);
})();`;
}

/** The session's page with the bridge script as the first thing in <head>, so the functions exist before the page's own code runs. */
export function hostedPage(session: HostedSession, wsUrl: string): string {
  const script = `<script>${clientScript([...session.binds.keys()], wsUrl).replace(/<\/script/gi, "<\\/script")}</script>`;
  const html = session.html;
  const head = /<head[^>]*>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) +
      script +
      html.slice(head.index + head[0].length)
    );
  const doc = /<html[^>]*>/i.exec(html);
  if (doc)
    return (
      html.slice(0, doc.index + doc[0].length) +
      `<head>${script}</head>` +
      html.slice(doc.index + doc[0].length)
    );
  return `<!DOCTYPE html><html><head>${script}</head><body>${html}</body></html>`;
}
