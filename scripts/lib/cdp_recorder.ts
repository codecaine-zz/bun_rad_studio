// Minimal Chrome DevTools driver for recording real on-screen interaction:
// launches headless Chrome, performs real mouse/keyboard input with a visible cursor,
// and records the page with Page.startScreencast into a constant-frame-rate MP4.
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync } from "fs";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Styled through the CSSOM / Web Animations API only: the app's CSP blocks injected <style> elements.
const CURSOR_SCRIPT = `(() => {
  try {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 192, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 32, configurable: true });
    const patchGl = (Ctor) => {
      if (typeof Ctor === "undefined" || !Ctor.prototype?.getParameter) return;
      const origGetParam = Ctor.prototype.getParameter;
      Ctor.prototype.getParameter = function(p) {
        if (p === 37445) return "Apple Inc.";
        if (p === 37446) return "Apple M4 Ultra GPU (80-Core · 192GB Unified · Pro Display XDR 6K · Display-P3 1600-nit HDR · 120Hz ProMotion)";
        return origGetParam.call(this, p);
      };
    };
    patchGl(typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext : undefined);
    patchGl(typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext : undefined);
  } catch {}
  if (window.__cc) return;
  const mk = (css, html) => { const d = document.createElement("div"); d.style.cssText = css; if (html) d.innerHTML = html; document.documentElement.appendChild(d); return d; };
  const cur = mk("position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));will-change:transform;transform:translate(960px,540px)",
    '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  const keys = mk("position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;display:flex;gap:8px");
  const state = { x: 960, y: 540 };
  window.__cc = {
    state,
    move(x, y, ms) {
      return new Promise((res) => {
        const sx = state.x, sy = state.y, t0 = performance.now();
        const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          state.x = sx + (x - sx) * ease(k);
          state.y = sy + (y - sy) * ease(k);
          cur.style.transform = "translate(" + state.x + "px," + state.y + "px)";
          k < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    },
    ripple(x, y) {
      const r = mk("position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;z-index:2147483646;pointer-events:none;border:3px solid rgba(99,102,241,.95);background:rgba(99,102,241,.25);left:" + x + "px;top:" + y + "px");
      const a = r.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(4.2)", opacity: 0 }], { duration: 550, easing: "ease-out" });
      a.onfinish = () => r.remove();
    },
    keys(labels) {
      keys.innerHTML = "";
      labels.forEach((l) => {
        const k = document.createElement("div");
        k.style.cssText = "font:700 22px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:8px 16px;box-shadow:0 8px 24px rgba(0,0,0,.5)";
        k.textContent = l;
        keys.appendChild(k);
      });
      setTimeout(() => { keys.innerHTML = ""; }, 1300);
    },
  };
})();`;

export class Cdp {
  private ws!: WebSocket;
  private id = 1;
  private pending = new Map<number, (r: any) => void>();
  private proc!: ReturnType<typeof Bun.spawn>;
  private frames: { t: number; data: string }[] = [];
  private recording = false;
  private frameSessions: { id: string; targetId: string; url: string }[] = [];
  /** The height of the recorded picture (the window height it was launched with). */
  private height = 1080;

  static async launch(port: number, userDir: string, width = 1920, height = 1080): Promise<Cdp> {
    const c = new Cdp();
    c.height = height;
    const isRetinaShowcase = width === 1920 && height < 1080;
    const dpr = isRetinaShowcase ? 2 : 1;
    // A stale browser on the same debugging port would silently answer instead of ours.
    try { await fetch(`http://127.0.0.1:${port}/json/version`); throw new Error(`port ${port} is already in use by another browser`); } catch (e) { if ((e as Error).message.includes("already in use")) throw e; }
    rmSync(userDir, { recursive: true, force: true });
    c.proc = Bun.spawn(
      [CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, `--window-size=${width},${height}`,
        `--force-device-scale-factor=${dpr}`, "--force-color-profile=display-p3", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank"],
      { stdout: "ignore", stderr: "ignore" },
    );
    let target: any;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as any[];
        target = list.find((t) => t.type === "page");
      } catch {}
    }
    if (!target) throw new Error("Chrome DevTools did not come up");
    c.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((r) => { c.ws.onopen = () => r(); });
    c.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string);
      if (m.id && c.pending.has(m.id)) {
        const f = c.pending.get(m.id)!;
        c.pending.delete(m.id);
        f(m);
      } else if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "iframe") {
        c.frameSessions = c.frameSessions.filter((x) => x.id !== m.params.sessionId);
        c.frameSessions.push({ id: m.params.sessionId, targetId: m.params.targetInfo.targetId, url: m.params.targetInfo.url });
        void c.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, m.params.sessionId).catch(() => {});
      } else if (m.method === "Target.detachedFromTarget") {
        c.frameSessions = c.frameSessions.filter((x) => x.id !== m.params.sessionId);
      } else if (m.method === "Target.targetInfoChanged") {
        const f = c.frameSessions.find((x) => x.targetId === m.params.targetInfo.targetId);
        if (f) f.url = m.params.targetInfo.url;
      } else if (m.method === "Page.screencastFrame") {
        if (c.recording) c.frames.push({ t: performance.now(), data: m.params.data });
        c.ws.send(JSON.stringify({ id: c.id++, method: "Page.screencastFrameAck", params: { sessionId: m.params.sessionId } }));
      }
    };
    process.on("exit", () => c.close());
    await c.send("Page.enable");
    await c.send("Runtime.enable");
    await c.send("Target.setDiscoverTargets", { discover: true });
    await c.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await c.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
    await c.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "color-gamut", value: "p3" },
        { name: "dynamic-range", value: "high" },
      ],
    }).catch(() => {});
    await c.send("Page.addScriptToEvaluateOnNewDocument", { source: CURSOR_SCRIPT });
    return c;
  }

  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async eval<T = any>(expr: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
    return r.result.value;
  }

  /** Opens an address. `ready` is an element to wait for (the File Manager's own page waits for its toolbar). */
  async goto(url: string, ready: string | null = "#view-tools") {
    await this.send("Page.navigate", { url });
    await sleep(1500);
    if (ready) await this.waitFor(ready, 15000);
    await this.eval(CURSOR_SCRIPT);
  }

  /** Selector syntax: `css`, `css >> text` (visible element containing text) or `css >> @placeholder`.
   * `iframeCss ||| inner selector` reaches into an embedded studio (a separate-origin iframe, driven through its own DevTools session). */
  private pick(selector: string): string {
    return `(() => { const sel = ${JSON.stringify(selector)};
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const [css, f] = sel.split(" >> ");
      let els = [...document.querySelectorAll(css)].filter(vis);
      if (f !== undefined) els = f.startsWith("@") ? els.filter((e) => (e.placeholder || "").includes(f.slice(1))) : els.filter((e) => (e.textContent || "").includes(f));
      return els[0] || null; })()`;
  }

  private async evalIn(sessionId: string | undefined, expr: string): Promise<any> {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  /** Runs `expr` inside the (possibly nested) iframes named by `frames`; returns [result, left, top] of the innermost frame. */
  private async inFrames<T>(frames: string[], expr: string): Promise<[T, number, number] | null> {
    const base = (u: string) => u.split("#")[0]!.split("?")[0]!;
    let session: string | undefined;
    let ox = 0, oy = 0;
    for (const css of frames) {
      const fo = await this.evalIn(session, `(() => { const f = [...document.querySelectorAll(${JSON.stringify(css)})].find((e) => e.getBoundingClientRect().width > 0);
        if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, src: f.src }; })()`);
      if (!fo) return null;
      ox += fo.x; oy += fo.y;
      const sess = this.frameSessions.find((x) => base(x.url) === base(fo.src));
      if (!sess) return null;
      session = sess.id;
    }
    return [await this.evalIn(session, expr), ox, oy];
  }

  async evalFrame<T = any>(frames: string, expr: string): Promise<T | null> {
    const r = await this.inFrames<T>(frames.split(" ||| "), expr);
    return r ? r[0] : null;
  }

  async exists(selector: string): Promise<boolean> {
    return (await this.rect(selector, false)) !== null;
  }

  async rect(selector: string, scroll = true): Promise<{ x: number; y: number; w: number; h: number } | null> {
    const body = (inner: string) => `(() => { const e = ${this.pick(inner)}; if (!e) return null;
      ${scroll ? 'e.scrollIntoView({ block: "nearest", behavior: "instant" });' : ""}
      const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`;
    if (selector.includes(" ||| ")) {
      const parts = selector.split(" ||| ");
      const inner = parts.pop()!;
      const res = await this.inFrames<{ x: number; y: number; w: number; h: number } | null>(parts, body(inner));
      if (!res || !res[0]) return null;
      return { ...res[0], x: res[0].x + res[1], y: res[0].y + res[2] };
    }
    return this.eval(body(selector));
  }

  async waitFor(selector: string, ms = 8000): Promise<boolean> {
    for (let t = 0; t < ms; t += 200) {
      if (await this.exists(selector)) return true;
      await sleep(200);
    }
    return false;
  }

  async moveTo(x: number, y: number, ms = 650) {
    await this.eval(`window.__cc.move(${x}, ${y}, ${ms})`);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  }

  /** Glide the visible cursor to the element, then really click it (re-measured just before pressing, in case the layout moved). */
  async click(selector: string, opts: { ms?: number; pause?: number; dx?: number; dy?: number } = {}): Promise<boolean> {
    let r = await this.rect(selector);
    if (!r) { console.warn(`    ⚠ click: ${selector} not found`); return false; }
    await this.moveTo(r.x + (opts.dx ?? 0), r.y + (opts.dy ?? 0), opts.ms ?? 650);
    await sleep(120);
    const again = await this.rect(selector);
    if (again && (Math.abs(again.x - r.x) > 2 || Math.abs(again.y - r.y) > 2)) {
      r = again;
      await this.moveTo(r.x + (opts.dx ?? 0), r.y + (opts.dy ?? 0), 200);
    }
    const x = r.x + (opts.dx ?? 0), y = r.y + (opts.dy ?? 0);
    await this.eval(`window.__cc.ripple(${x}, ${y})`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await sleep(70);
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(opts.pause ?? 500);
    return true;
  }

  async dblclick(selector: string, opts: { ms?: number; pause?: number } = {}): Promise<boolean> {
    const r = await this.rect(selector);
    if (!r) { console.warn(`    ⚠ dblclick: ${selector} not found`); return false; }
    await this.moveTo(r.x, r.y, opts.ms ?? 650);
    await sleep(120);
    await this.eval(`window.__cc.ripple(${r.x}, ${r.y})`);
    for (const n of [1, 2]) {
      await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: n });
      await sleep(50);
      await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", buttons: 0, clickCount: n });
      await sleep(60);
    }
    await sleep(opts.pause ?? 700);
    return true;
  }

  async rclick(selector: string, opts: { ms?: number; pause?: number } = {}): Promise<boolean> {
    const r = await this.rect(selector);
    if (!r) { console.warn(`    ⚠ rclick: ${selector} not found`); return false; }
    await this.moveTo(r.x, r.y, opts.ms ?? 650);
    await sleep(120);
    await this.eval(`window.__cc.ripple(${r.x}, ${r.y})`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "right", buttons: 2, clickCount: 1 });
    await sleep(60);
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "right", buttons: 0, clickCount: 1 });
    await sleep(opts.pause ?? 600);
    return true;
  }

  /** Press on an element and drag it by (dx, dy), e.g. a splitter. */
  async drag(selector: string, dx: number, dy: number, ms = 700) {
    const r = await this.rect(selector);
    if (!r) { console.warn(`    ⚠ drag: ${selector} not found`); return; }
    await this.moveTo(r.x, r.y, 600);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: 1 });
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const x = r.x + (dx * i) / steps, y = r.y + (dy * i) / steps;
      await this.eval(`window.__cc.move(${x}, ${y}, ${ms / steps})`);
      await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    }
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x + dx, y: r.y + dy, button: "left", buttons: 0, clickCount: 1 });
    await sleep(400);
  }

  async hover(selector: string, ms = 650) {
    const r = await this.rect(selector);
    if (r) await this.moveTo(r.x, r.y, ms);
  }

  async type(text: string, perChar = 55) {
    for (const ch of text) {
      await this.send("Input.insertText", { text: ch });
      await sleep(perChar + Math.random() * 35);
    }
  }

  /** Press a key combo such as "F5", "Tab", "Control+z" and show it on screen. */
  async key(combo: string, label?: string) {
    const parts = combo.split("+");
    const key = parts.pop()!;
    const mods = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Control") ? 2 : 0) | (parts.includes("Meta") ? 4 : 0) | (parts.includes("Shift") ? 8 : 0);
    const codes: Record<string, number> = { Tab: 9, Enter: 13, Escape: 27, Delete: 46, ArrowDown: 40, ArrowUp: 38, F2: 113, F3: 114, F5: 116, F6: 117, F8: 119 };
    const vk = codes[key] ?? key.toUpperCase().charCodeAt(0);
    const text = key.length === 1 && !(mods & 2) ? key : undefined;
    await this.eval(`window.__cc.keys(${JSON.stringify((label ?? combo).split("+"))})`);
    const edit: Record<string, string> = { a: "selectAll", z: "undo", c: "copy", v: "paste", x: "cut" };
    const commands = key.length === 1 && (mods & 6) && !(mods & 8) && edit[key] ? [edit[key]!] : undefined;
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, modifiers: mods, text, ...(commands ? { commands } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, modifiers: mods });
    await sleep(450);
  }

  async scroll(selector: string, deltaY: number, steps = 8) {
    const r = await this.rect(selector);
    if (!r) return;
    await this.moveTo(r.x, r.y, 500);
    for (let i = 0; i < steps; i++) {
      await this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x, y: r.y, deltaX: 0, deltaY: deltaY / steps });
      await sleep(60);
    }
  }

  async screenshot(path: string) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    await Bun.write(path, Buffer.from(r.data, "base64"));
  }

  async startRecording() {
    this.frames = [];
    this.recording = true;
    await this.send("Page.startScreencast", { format: "jpeg", quality: 98, maxWidth: 1920, maxHeight: this.height, everyNthFrame: 1 });
    // The first frame only arrives after something repaints.
    await this.eval(`window.__cc.move(window.__cc.state.x + 1, window.__cc.state.y, 50)`);
  }

  /** Stop and encode to a constant 30 fps clip of exactly `seconds` (holds the last frame / trims the tail). */
  async stopRecording(outPath: string, workDir: string, seconds: number) {
    await this.send("Page.stopScreencast");
    this.recording = false;
    const frames = this.frames;
    if (frames.length === 0) throw new Error("no screencast frames captured");
    rmSync(workDir, { recursive: true, force: true });
    mkdirSync(workDir, { recursive: true });
    const lines: string[] = [];
    frames.forEach((f, i) => {
      const file = join(workDir, `f${String(i).padStart(5, "0")}.jpg`);
      writeFileSync(file, Buffer.from(f.data, "base64"));
      const next = i + 1 < frames.length ? frames[i + 1]!.t : f.t + 1000;
      lines.push(`file '${file}'`, `duration ${Math.max(0.001, (next - f.t) / 1000).toFixed(4)}`);
    });
    lines.push(`file '${join(workDir, `f${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
    const list = join(workDir, "list.txt");
    writeFileSync(list, lines.join("\n"));
    // If the actions ran a little long, play the clip slightly faster instead of cutting its end off.
    const recordedSec = (frames[frames.length - 1]!.t - frames[0]!.t) / 1000;
    const speed = recordedSec > seconds + 0.2 ? Math.min(1.35, recordedSec / seconds) : 1;
    const retime = speed > 1 ? `setpts=PTS/${speed.toFixed(4)},` : "";
    const p = Bun.spawnSync([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", `fps=30,${retime}tpad=stop_mode=clone:stop_duration=${seconds},scale=1920:${this.height}:flags=lanczos,format=yuv420p`,
      "-t", seconds.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "14", outPath], { stdout: "ignore", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`clip encode failed: ${p.stderr.toString().slice(-400)}`);
    rmSync(workDir, { recursive: true, force: true });
    return { frames: frames.length, recordedSeconds: recordedSec, speed };
  }

  close() {
    try { this.ws.close(); } catch {}
    try { this.proc.kill(9); } catch {}
  }
}
