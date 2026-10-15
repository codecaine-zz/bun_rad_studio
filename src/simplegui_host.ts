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

export interface HostedPeer {
  send(text: string): void;
}

type BoundFn = (...args: any[]) => unknown;

/** The part of a Webview that SimpleWindow uses, backed by a web page. */
class HostedWebview {
  /** Tells SimpleWindow's native-window helpers to leave this alone. */
  readonly isHosted = true;
  private titleValue = "";
  size: { width: number; height: number; hint: number } = { width: 0, height: 0, hint: 0 };

  constructor(private readonly session: HostedSession) {}

  get title(): string {
    return this.titleValue;
  }
  set title(value: string) {
    this.titleValue = String(value);
    this.session.title = this.titleValue;
  }
  bind(name: string, fn: BoundFn): void {
    if (this.session.binds.has(name)) throw new Error(`"${name}" is already bound`);
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

export class HostedSession {
  /** The page's own secret: whoever fetches its page or opens its socket must know it. */
  readonly secret = randomBytes(24).toString("base64url");
  readonly binds = new Map<string, BoundFn>();
  readonly webview: HostedWebview;
  html = "";
  title = "";
  closed = false;
  private readonly peers = new Set<HostedPeer>();
  private backlog: string[] = [];

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

  attach(peer: HostedPeer): void {
    if (this.closed) return;
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
  }

  detach(peer: HostedPeer): void {
    this.peers.delete(peer);
  }

  /** Runs one call from the page and answers it (`{ t: "res", id, ok, v | e }`). Never throws. */
  async handleMessage(peer: HostedPeer, raw: string): Promise<void> {
    if (this.closed || typeof raw !== "string" || raw.length > MAX_HOST_MESSAGE) return;
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || m.t !== "call" || typeof m.name !== "string" || !Number.isSafeInteger(m.id)) return;
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

  close(): void {
    this.closed = true;
    this.peers.clear();
    this.backlog = [];
    this.binds.clear();
  }
}

export interface HostedHub {
  /** Starts a fresh window for `key` (an earlier one with the same key is closed first). */
  open(key: string, create: () => SimpleWindow): HostedSession;
  get(key: string): HostedSession | undefined;
  close(key: string): void;
  closeAll(): void;
}

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
      if (open.size >= maxOpen) throw new Error("Too many tools are open. Close one first.");
      const session = new HostedSession(key);
      const win = create();
      try {
        win.hostInBrowser(() => session.webview);
        win.show();
      } catch (err) {
        session.close();
        throw err;
      }
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
  function runEval(code) { try { (0, eval)(code); } catch (e) { console.error(e); } }
  function flushEvals() { domReady = true; evals.splice(0).forEach(runEval); }
  if (!domReady) document.addEventListener("DOMContentLoaded", flushEvals);
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
})();`;
}

/** The session's page with the bridge script as the first thing in <head>, so the functions exist before the page's own code runs. */
export function hostedPage(session: HostedSession, wsUrl: string): string {
  const script = `<script>${clientScript([...session.binds.keys()], wsUrl).replace(/<\/script/gi, "<\\/script")}</script>`;
  const html = session.html;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + script + html.slice(head.index + head[0].length);
  const doc = /<html[^>]*>/i.exec(html);
  if (doc) return html.slice(0, doc.index + doc[0].length) + `<head>${script}</head>` + html.slice(doc.index + doc[0].length);
  return `<!DOCTYPE html><html><head>${script}</head><body>${html}</body></html>`;
}
