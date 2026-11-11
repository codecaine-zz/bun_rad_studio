import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createCipheriv, createHash, pbkdf2Sync } from "crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import {
  exportProjectHelper,
  generatePreviewHtml,
  getIdeHtml,
} from "../index.ts";
import { guardLocalRequest } from "../src/localGuard";
import { DESKTOP_SHORTCUTS_SCRIPT } from "../src/shared/desktopShortcuts";
import { fxCss } from "../src/shared/fxCss";
import {
  GAME_MASTER_FX_SCRIPT,
  injectGameMasterFx,
} from "../src/shared/gameMasterFx";
import { type ElementInfo, matchTip } from "../src/shared/helpMatch";
import {
  buildColumnFilterWhere,
  buildSearchFilterWhere,
  computeSchemaDiffDdl,
} from "../src/shared/studioServerEnhancements";
import {
  ApiClient,
  NamespacedRedis,
  SimpleCLI,
  Stdlib,
  Sys,
} from "../src/simplecli";
import { createWindow, openUrl, saveStateToFile } from "../src/simplegui";
import { psq, SimpleDialogs } from "../src/simplegui_dialogs";
import { HostedSession, hostedPage } from "../src/simplegui_host";
import { startStaticStudioServer } from "../src/studio_server";

const REPO_ROOT = join(import.meta.dir, "..");
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

function createIdeDom(): JSDOM {
  return new JSDOM(getIdeHtml(), {
    runScripts: "dangerously",
    url: "http://127.0.0.1/",
    beforeParse(w: any) {
      (w as any).HTMLCanvasElement.prototype.getContext = () => ({
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fillText() {},
        save() {},
        restore() {},
        arc() {},
        fill() {},
      });
    },
  });
}

function makeElemInfo(partial: Partial<ElementInfo>): ElementInfo {
  return {
    tag: partial.tag ?? "button",
    id: partial.id ?? "",
    classes: partial.classes ?? [],
    text: partial.text ?? "",
    placeholder: partial.placeholder ?? "",
    aria: partial.aria ?? "",
    name: partial.name ?? "",
    title: partial.title ?? "",
    type: partial.type ?? "",
    role: partial.role ?? "",
  };
}

afterAll(() => {
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
});

describe("[V-SEC-02] Designer design-time XSS neutralization, import normalization & preview script safety", () => {
  let dom: JSDOM;
  let win: any;

  beforeAll(() => {
    dom = createIdeDom();
    win = dom.window as any;
  });

  afterAll(() => {
    dom?.window.close();
  });

  test("renderControlContent escapes hostile HTML/attributes across design-time controls", () => {
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
    const controlTypes = [
      "label",
      "button",
      "badge",
      "alert_banner",
      "card",
      "tabs",
      "breadcrumbs",
      "timeline",
      "tree_view",
      "table",
      "dropdown",
      "radio",
      "checkbox",
      "link",
      "toast_card",
      "kanban_board",
      "sparkline_table",
    ];

    for (const ct of controlTypes) {
      const div = win.document.createElement("div");
      win.renderControlContent(
        {
          id: `ctrl_${ct}`,
          control_type: ct,
          text: payload,
          caption: payload,
          placeholder: payload,
          value: payload,
          items: [payload],
          options: [payload],
          columns: [payload],
          rows: [[payload]],
        },
        div,
      );
      expect(div.innerHTML).not.toContain("<script>window.__xss");
      expect(div.innerHTML).not.toContain(
        `<img src=x onerror="window.__xss=1">`,
      );
      expect(div.querySelector("script")).toBeNull();
      expect(div.querySelector("img[onerror]")).toBeNull();
    }
    expect(win.__xss).toBeUndefined();
  });

  test("renderNonVisualTray escapes hostile non-visual id and control_type", () => {
    win.eval(`
      formSpec.non_visual_controls = [{
        id: 'nv"><img src=x onerror="window.__nvXss=1">',
        control_type: 'timer"><script>window.__nvXss=2<\\/script>',
        interval: 1000
      }];
      renderNonVisualTray();
    `);
    const tray = win.document.getElementById("nonVisualTray");
    expect(tray?.querySelector("script")).toBeNull();
    expect(tray?.querySelector("img")).toBeNull();
    expect(win.__nvXss).toBeUndefined();
  });

  test("countImportedScripts inspects spec.non_visual_controls handlers", () => {
    const count = win.countImportedScripts({
      controls: [],
      non_visual_controls: [
        {
          id: "timer_1",
          control_type: "timer",
          event_handlers: { onTimer: "alert('tick')" },
        },
        {
          id: "hk_1",
          control_type: "hotkey",
          onTrigger: "doShortcut()",
        },
      ],
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("normalizeImportedSpec uses Set for Object.prototype IDs and strips unknown/__proto__ keys", () => {
    const raw = JSON.parse(
      `{"title":"Safe","__proto__":{"polluted":true},"evilTopKey":123,"controls":[{"id":"toString","control_type":"button","text":"A","evilCtrlKey":"drop"},{"id":"constructor","control_type":"label","text":"B"},{"id":"toString","control_type":"label","text":"Dup"}]}`,
    );
    const res = win.normalizeImportedSpec(raw);
    expect(res.error).toBeUndefined();
    const norm = res.spec;
    expect(({} as any).polluted).toBeUndefined();
    expect(norm.evilTopKey).toBeUndefined();
    expect(norm.controls[0].id).toBe("toString");
    expect(norm.controls[0].evilCtrlKey).toBeUndefined();
    expect(norm.controls[1].id).toBe("constructor");
    expect(norm.controls[2].id).not.toBe("toString");
  });

  test("generatePreviewHtml coerces nv.interval and escapes </script> in nv.id, handler & global_context_menu_items while keeping D-024 raw Run HTML", () => {
    const html = generatePreviewHtml({
      title: "Preview",
      width: 600,
      height: 400,
      global_context_menu_items: [`Item </script><script>evil()</script>`],
      controls: [
        {
          id: "lbl_raw",
          control_type: "label",
          x: 10,
          y: 10,
          width: 120,
          height: 30,
          text: "<b>Bold Run Caption</b>",
        },
      ],
      non_visual_controls: [
        {
          id: `t1</script><script>pwn()`,
          control_type: "timer",
          enabled: true,
          interval: "1000); alert(1); //",
          event_handlers: { onTimer: `tick</script><script>pwn2()` },
        },
      ],
    });

    // D-024 / D-041: intentional raw HTML in Run/Export control captions stays intact
    expect(html).toContain("<b>Bold Run Caption</b>");
    // Hostile </script> inside inline script payloads must be escaped as \u003c/script
    expect(html).not.toContain("</script><script>evil()");
    expect(html).not.toContain("</script><script>pwn()");
    expect(html).not.toContain("1000); alert(1);");

    const scripts = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });
});

describe("[V-SEC-03] Code generation & export escaping across targets", () => {
  let dom: JSDOM;
  let win: any;

  beforeAll(() => {
    dom = createIdeDom();
    win = dom.window as any;
  });

  afterAll(() => {
    dom?.window.close();
  });

  test("IDE code generators safely escape hostile control IDs, event names, and captions", () => {
    const hostSpec = {
      title: `Form " ); process.exit(1); //`,
      width: 640,
      height: 480,
      controls: [
        {
          id: `btn"); globalThis.__pwn=1; //`,
          control_type: `button`,
          x: 10,
          y: 10,
          width: 120,
          height: 36,
          text: `Click " ' \n \\ </script>`,
          event_handlers: {
            [`onClick"); globalThis.__pwn=3; //`]: "my_handler",
          },
        },
      ],
      non_visual_controls: [],
    };
    win.eval(`formSpec = ${JSON.stringify(hostSpec)};`);

    const bunCode = String(win.generateBunTSCode());
    expect(bunCode).not.toContain(`onClick"); globalThis.__pwn=3; //`);
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.transformSync(bunCode)).not.toThrow();

    const reactCode = String(win.generateReactTailwindCode());
    expect(reactCode).not.toContain(`id="btn"); globalThis.__pwn=1; //"`);

    const vueCode = String(win.generateVueCode());
    expect(vueCode).not.toContain(`id="btn"); globalThis.__pwn=1; //"`);

    const pyCode = String(win.generatePythonTkinterCode());
    expect(pyCode).not.toContain(`\nClick`);
  });

  test("exportProjectHelper escapes controlId via JSON.stringify and HTML-escapes dynamic CSV helpers", () => {
    const outDir = makeTempDir("rad_export_sec03_");
    const res = exportProjectHelper(
      JSON.stringify({
        title: "ExportApp",
        width: 800,
        height: 600,
        controls: [
          {
            id: "btn1",
            control_type: "button",
            x: 10,
            y: 10,
            width: 100,
            height: 32,
            text: "Run",
            event_handlers: {
              onClick: "handleClick",
              onDoubleClick: "handleClick",
            },
          },
        ],
      }),
      outDir,
    );
    expect(res.success).toBe(true);
    const appTs = readFileSync(join(outDir, "index.ts"), "utf8");
    // Duplicate handler name bound only once
    expect(appTs.match(/wv\.bind\("handleClick"/g)?.length).toBe(1);
    // Hostile controlId cannot break out of getElementById(...)
    expect(appTs).toContain("JSON.stringify(controlId)");
    expect(appTs).not.toContain('getElementById("${controlId}")');
    // Dynamic helpers escape HTML entities
    expect(appTs).toContain("&lt;");
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    expect(() => transpiler.transformSync(appTs)).not.toThrow();
  });
});

describe("[V-SEC-06, V-SEC-09, V-SEC-11, V-OPT-11] URL allowlist, symlink containment & local-only servers", () => {
  test("Sys.openUrl and simplegui.openUrl reject dangerous schemes, option injection, and control chars", () => {
    for (const bad of [
      "",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "-aCalculator",
      "https://example.com/\ncalc",
      "https://example.com/\0calc",
    ]) {
      expect(Sys.openUrl(bad)).toBe(false);
      expect(openUrl(bad)).toBe(false);
    }
  });

  test("startStaticStudioServer blocks symlink escape (403), directory read (404), malformed URI (400), and refreshes cached HTML on mtime change", async () => {
    const root = makeTempDir("studio_srv_root_");
    const outside = makeTempDir("studio_srv_out_");
    const htmlPath = join(root, "index.html");
    writeFileSync(htmlPath, "<h1>v1</h1>");
    writeFileSync(join(root, "hello world.txt"), "hello ok");
    mkdirSync(join(root, "subdir"));
    writeFileSync(join(outside, "secret.txt"), "top-secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "leak.txt"));

    let genCalls = 0;
    const srv = startStaticStudioServer(
      {
        app: "test_studio",
        name: "TestStudio",
        version: "1.0.0",
        assetsDir: root,
        generateHtml: () => {
          genCalls++;
          return readFileSync(htmlPath, "utf8");
        },
      },
      { port: 0 },
    );
    try {
      const base = String(srv.url).replace(/\/$/, "");

      const r1 = await fetch(`${base}/`);
      expect(r1.status).toBe(200);
      expect(await r1.text()).toContain("<h1>v1</h1>");
      expect(genCalls).toBe(1);

      // Second request with unchanged index.html mtime serves memoized HTML
      const r1Cached = await fetch(`${base}/`);
      expect(await r1Cached.text()).toContain("<h1>v1</h1>");
      expect(genCalls).toBe(1);

      // Update file content + mtime -> memoized HTML cache invalidates cleanly
      writeFileSync(htmlPath, "<h1>v2</h1>");
      const future = new Date(Date.now() + 5000);
      utimesSync(htmlPath, future, future);
      const r2 = await fetch(`${base}/`);
      expect(await r2.text()).toContain("<h1>v2</h1>");
      expect(genCalls).toBe(2);

      // Percent-encoded valid filename
      const rSpace = await fetch(`${base}/hello%20world.txt`);
      expect(rSpace.status).toBe(200);
      expect(await rSpace.text()).toBe("hello ok");

      // Malformed percent-encoding -> 400 (never 500)
      const rBadUri = await fetch(`${base}/%E0%A4%A`);
      expect(rBadUri.status).toBe(400);

      // Directory -> 404 (not raw directory read error)
      const rDir = await fetch(`${base}/subdir`);
      expect(rDir.status).toBe(404);

      // Symlink pointing outside rootDir -> 403 Forbidden
      const rSym = await fetch(`${base}/leak.txt`);
      expect(rSym.status).toBe(403);
    } finally {
      srv.stop(true);
    }
  });

  test("Sys.serveStatic enforces realpathSync containment inside root directory", async () => {
    const root = makeTempDir("sys_static_root_");
    const outside = makeTempDir("sys_static_out_");
    writeFileSync(join(root, "ok.txt"), "public");
    writeFileSync(join(outside, "secret.txt"), "private");
    symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
    mkdirSync(join(root, "folder"));

    const srv = Sys.serveStatic(root, 0);
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      expect((await fetch(`${base}/ok.txt`)).status).toBe(200);
      expect((await fetch(`${base}/escape.txt`)).status).toBe(403);
      expect((await fetch(`${base}/folder`)).status).toBe(404);
      expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
    } finally {
      srv.stop(true);
    }
  });

  test("Sys.serveJson enforces guardLocalRequest by default and honors allowRemote opt-out", async () => {
    const srv = Sys.serveJson({ "/ping": { pong: true } }, 0);
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const okRes = await fetch(`${base}/ping`);
      expect(okRes.status).toBe(200);
      expect(await okRes.json()).toEqual({ pong: true });

      const crossOrigin = await fetch(`${base}/ping`, {
        headers: { Origin: "https://evil.example" },
      });
      expect(crossOrigin.status).toBe(403);
    } finally {
      srv.stop(true);
    }

    const remoteSrv = Sys.serveJson(
      { "/ping": { pong: true } },
      0,
      "127.0.0.1",
      {
        allowRemote: true,
      },
    );
    try {
      const base = `http://127.0.0.1:${remoteSrv.port}`;
      const allowed = await fetch(`${base}/ping`, {
        headers: { Origin: "https://allowed.example" },
      });
      expect(allowed.status).toBe(200);
    } finally {
      remoteSrv.stop(true);
    }
  });
});

describe("[V-SEC-12] Inline onclick / HTML entity decode & demo IPC script hardening", () => {
  test("generatePreviewHtml table rows & links use data-pid / getAttribute('href') without inline JS breakout", () => {
    const hostileId = `t1'); window.__pwned=1; //`;
    const html = generatePreviewHtml({
      title: "TableSec",
      width: 600,
      height: 400,
      controls: [
        {
          id: hostileId,
          control_type: "table",
          x: 10,
          y: 10,
          width: 300,
          height: 160,
          columns: ["Name", "Site"],
          rows: [["Alice", `https://example.com/' ); window.__pwned=3; //`]],
          event_handlers: { onClick: "rowClick" },
        },
        {
          id: `lnk'); window.__pwned=2; //`,
          control_type: "link",
          x: 10,
          y: 180,
          width: 200,
          height: 28,
          text: "Docs",
          url: `https://example.com/" onclick="window.__pwned=4`,
        },
      ],
    });

    expect(html).toContain("data-pid=");
    expect(html).toContain("this.getAttribute('href')");
    expect(html).not.toContain("try{on_lnk'); window.__pwned=2;");
    expect(html).not.toContain(`onclick="window.__pwned=4`);
  });

  test("SimpleWindow.setTableData uses data-ctrl-id & data-pid instead of inline JS string interpolation", () => {
    const evalCalls: string[] = [];
    const win = createWindow("Tbl", 400, 300);
    win.addTable(["Col"], [["A"]]).id(`tbl' ); evil(); //`);
    (win as any).isWindowRunning = true;
    (win as any).webview = {
      eval: (code: string) => evalCalls.push(code),
    };
    win.setTableData(`tbl' ); evil(); //`, ["Col"], [["Row1"]]);
    expect(evalCalls.length).toBe(1);
    expect(evalCalls[0]).toContain("data-ctrl-id=");
    expect(evalCalls[0]).toContain("data-pid=");
    expect(() => new Function(evalCalls[0]!)).not.toThrow();
  });

  test("demos 05..12 avoid unescaped insertAdjacentHTML and raw IPC template interpolation inside execJS", () => {
    const demo05 = readFileSync(
      join(REPO_ROOT, "demos/05_crud_todo_table.ts"),
      "utf8",
    );
    expect(demo05).not.toContain('insertAdjacentHTML("beforeend", trHtml)');
    expect(demo05).toContain("td.textContent = String(val)");

    const demo06 = readFileSync(
      join(REPO_ROOT, "demos/06_timer_control_studio.ts"),
      "utf8",
    );
    expect(demo06).toContain("enabled: false");

    for (const rel of [
      "demos/07_labeled_form_and_desktop_controls.ts",
      "demos/08_analytics_dashboard_template.ts",
      "demos/09_file_explorer_ide_template.ts",
      "demos/10_db_studio_query_editor_template.ts",
      "demos/11_app_settings_preferences_template.ts",
      "demos/12_advanced_desktop_app_controls.ts",
    ]) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src).toContain("JSON.stringify(");
    }
  });
});

describe("[V-SEC-13] desktopShortcuts excludes password & sensitive inputs", () => {
  test("Ctrl/Cmd+Z custom undo history ignores password, data-sensitive, and password/OTP autocomplete inputs", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <input id="normalInput" type="text" value="hello" />
        <input id="pwdInput" type="password" value="s3cr3t" />
        <input id="sensInput" type="text" data-sensitive="true" value="tok_123" />
        <input id="otpInput" type="text" autocomplete="one-time-code" value="999111" />
      </body></html>`,
      { runScripts: "dangerously", url: "http://127.0.0.1/" },
    );
    try {
      dom.window.eval(DESKTOP_SHORTCUTS_SCRIPT);
      const doc = dom.window.document;

      for (const id of ["pwdInput", "sensInput", "otpInput"]) {
        const el = doc.getElementById(id) as HTMLInputElement;
        el.focus();
        el.dispatchEvent(new dom.window.Event("focusin", { bubbles: true }));
        el.value = "updated_secret";
        el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        const ev = new dom.window.KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
        expect(el.value).toBe("updated_secret");
      }
    } finally {
      dom.window.close();
    }
  });
});

describe("[V-SEC-14] guardLocalRequest loopback Host, IPv6, /app/* method & Sec-Fetch-Site checks", () => {
  test("rejects missing or non-loopback Host headers", () => {
    const noHost = new Request("http://127.0.0.1:4000/api/ping");
    expect(guardLocalRequest(noHost)?.status).toBe(403);

    const foreignHost = new Request("http://127.0.0.1:4000/api/ping", {
      headers: { Host: "evil.example:4000" },
    });
    expect(guardLocalRequest(foreignHost)?.status).toBe(403);
  });

  test("accepts bracketed [::1], unbracketed ::1, and IPv4-mapped ::ffff:127.0.0.1", () => {
    for (const host of [
      "127.0.0.1:4000",
      "localhost:4000",
      "[::1]:4000",
      "::1",
      "[::ffff:127.0.0.1]:4000",
      "::ffff:127.0.0.1",
    ]) {
      const req = new Request("http://127.0.0.1:4000/api/ping", {
        headers: { Host: host },
      });
      expect(guardLocalRequest(req)).toBeNull();
    }
  });

  test("restricts /app/* cross-site exemption to GET/HEAD and blocks cross-port same-site on /api/* & POST", () => {
    const getApp = new Request("http://127.0.0.1:4000/app/sqlite", {
      method: "GET",
      headers: {
        Host: "127.0.0.1:4000",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(guardLocalRequest(getApp)).toBeNull();

    const postApp = new Request("http://127.0.0.1:4000/app/sqlite", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:4000",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(guardLocalRequest(postApp)?.status).toBe(403);

    const sameSiteApi = new Request("http://127.0.0.1:4000/api/tables", {
      method: "GET",
      headers: {
        Host: "127.0.0.1:4000",
        "Sec-Fetch-Site": "same-site",
      },
    });
    expect(guardLocalRequest(sameSiteApi)?.status).toBe(403);

    const sameOriginApi = new Request("http://127.0.0.1:4000/api/tables", {
      method: "GET",
      headers: {
        Host: "127.0.0.1:4000",
        Origin: "http://127.0.0.1:4000",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    expect(guardLocalRequest(sameOriginApi)).toBeNull();
  });
});

describe("[V-SEC-15] Sensitive state exclusion, 0o600 permissions, DDL backslash escaping, redirect auth stripping & SGC2 AES-GCM", () => {
  test("SimpleWindow state persistence excludes password/masked_input/secret/token/pin/api_key and writes 0o600 files", () => {
    const dir = makeTempDir("sg_state_sec15_");
    const stateFile = join(dir, "state.json");

    const win = createWindow("SecState", 500, 400);
    win.addTextInput("Username", "alice").id("user_name");
    win.addPassword("Password", "hunter2").id("login_field");
    win.addTextInput("API Token", "sk_live_secret").id("github_api_key");
    win.addTextInput("PIN", "1234").id("user_pin");
    win.saveValuesToFile(stateFile);

    const saved = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(saved.user_name).toBe("alice");
    expect(saved.login_field).toBeUndefined();
    expect(saved.github_api_key).toBeUndefined();
    expect(saved.user_pin).toBeUndefined();

    if (process.platform !== "win32") {
      const mode = statSync(stateFile).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    const directFile = join(dir, "direct.json");
    saveStateToFile(directFile, { ok: "1" });
    if (process.platform !== "win32") {
      expect(statSync(directFile).mode & 0o777).toBe(0o600);
    }
  });

  test("computeSchemaDiffDdl escapes backslashes in MySQL DEFAULT string literals", () => {
    const diff = computeSchemaDiffDdl(
      [{ name: "items", columns: [{ name: "id", type: "INT", pk: true }] }],
      [
        {
          name: "items",
          columns: [
            { name: "id", type: "INT", pk: true },
            {
              name: "note",
              type: "VARCHAR(64)",
              notnull: true,
              dflt_value: `trailing\\`,
            },
          ],
        },
      ],
      "mysql",
    );
    expect(diff.ddl).toContain(`'trailing\\\\'`);
  });

  test("ApiClient strips Authorization, Cookie, and X-API-Key on cross-origin redirects while keeping same-origin", async () => {
    let targetHeadersCross: Record<string, string> = {};
    let targetHeadersSame: Record<string, string> = {};

    const targetSrv = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const h: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          h[k.toLowerCase()] = v;
        });
        targetHeadersCross = h;
        return Response.json({ ok: true });
      },
    });

    const originSrv = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/cross") {
          return new Response(null, {
            status: 302,
            headers: { Location: `http://127.0.0.1:${targetSrv.port}/landed` },
          });
        }
        if (u.pathname === "/same") {
          return new Response(null, {
            status: 302,
            headers: { Location: "/same-dest" },
          });
        }
        const h: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          h[k.toLowerCase()] = v;
        });
        targetHeadersSame = h;
        return Response.json({ ok: true });
      },
    });

    try {
      const client = new ApiClient({
        baseUrl: `http://127.0.0.1:${originSrv.port}`,
        bearerToken: "secret-bearer",
        apiKey: "secret-api-key",
        headers: { Cookie: "sid=secret-cookie" },
      });

      await client.get("/same");
      expect(targetHeadersSame["authorization"]).toBe("Bearer secret-bearer");
      expect(targetHeadersSame["x-api-key"]).toBe("secret-api-key");
      expect(targetHeadersSame["cookie"]).toBe("sid=secret-cookie");

      await client.get("/cross");
      expect(targetHeadersCross["authorization"]).toBeUndefined();
      expect(targetHeadersCross["x-api-key"]).toBeUndefined();
      expect(targetHeadersCross["cookie"]).toBeUndefined();
    } finally {
      originSrv.stop(true);
      targetSrv.stop(true);
    }
  });

  test("Stdlib.aesEncrypt uses salted SGC2 AES-256-GCM, rejects tampering, and decrypts legacy v1 payloads", async () => {
    const secret = "correct-horse-battery-staple";
    const c1 = Stdlib.aesEncrypt("sensitive payload", secret);
    const c2 = Stdlib.aesEncrypt("sensitive payload", secret);
    expect(c1).not.toBe(c2);
    expect(Stdlib.aesDecrypt(c1, secret)).toBe("sensitive payload");
    expect(() => Stdlib.aesDecrypt(c1, "wrong-password")).toThrow();

    // Flip last byte of authTag -> GCM authentication must reject
    const [saltHex, b64Env] = c1.split(":");
    const raw = Buffer.from(b64Env!, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(() =>
      Stdlib.aesDecrypt(`${saltHex}:${raw.toString("base64")}`, secret),
    ).toThrow();

    // Legacy v1 (SHA-256 key + IV:base64 ciphertext) backward compatibility
    const legacyKey = createHash("sha256").update(secret).digest();
    const legacyIv = Buffer.alloc(16, 7);
    const cipher = createCipheriv("aes-256-cbc", legacyKey, legacyIv);
    const enc =
      cipher.update("legacy-secret", "utf8", "base64") + cipher.final("base64");
    const legacyToken = `${legacyIv.toString("hex")}:${enc}`;
    expect(Stdlib.aesDecrypt(legacyToken, secret)).toBe("legacy-secret");

    // PBKDF2 fallback verification supports 210,000 iterations and rejects < 1000 iteration downgrade
    const pbkdfSalt = "salt1234abcd5678";
    const pbkdfDigest = pbkdf2Sync(
      "pw",
      pbkdfSalt,
      210_000,
      32,
      "sha256",
    ).toString("hex");
    expect(
      await Stdlib.bcryptVerify(
        "pw",
        `$pbkdf2$210000$${pbkdfSalt}$${pbkdfDigest}`,
      ),
    ).toBe(true);
    expect(
      await Stdlib.bcryptVerify("pw", `$pbkdf2$10$${pbkdfSalt}$${pbkdfDigest}`),
    ).toBe(false);
  });
});

describe("[V-SEC-16, V-SEC-18, V-SEC-20] Dialog PowerShell quoting, token gating, postMessage origin & CLI ANSI sanitization", () => {
  test("psq doubles ASCII single quotes and Unicode curly single quotes", () => {
    const input = "a'b\u2018c\u2019d\u201Ae\u201Bf";
    const quoted = psq(input);
    expect(quoted).toBe("a''b''c''d''e''f");
  });

  test("SimpleDialogs gates simpleguiBrowseDirIPC/simpleguiMkdirIPC on active dialog token and uses custom filePicker when hosted", async () => {
    const bindings = new Map<string, (...args: any[]) => any>();
    const evals: string[] = [];
    const resolvers = new Map<string, (val: any) => void>();
    const fakeHost = {
      isRunning: () => true,
      isHosted: () => true,
      eval: (js: string) => {
        evals.push(js);
      },
      resolvers,
    };

    const dialogs = new SimpleDialogs(fakeHost);
    dialogs.bindIpc({
      bind: (name: string, fn: (...args: any[]) => any) => {
        bindings.set(name, fn);
      },
    });

    const browseFn = bindings.get("simpleguiBrowseDirIPC")!;
    const mkdirFn = bindings.get("simpleguiMkdirIPC")!;
    expect(browseFn).toBeDefined();
    expect(mkdirFn).toBeDefined();

    // Without an active file dialog token, IPC directory enumeration/creation is denied
    const deniedBrowse = browseFn(tmpdir(), false, "forged-token");
    expect(deniedBrowse.error).toContain("No active file dialog session");

    const guardParent = makeTempDir("sgd_mkdir_guard_");
    const deniedMkdir = mkdirFn(
      guardParent,
      "should_not_exist",
      "forged-token",
    );
    expect(deniedMkdir.error).toContain("No active file dialog session");
    expect(existsSync(join(guardParent, "should_not_exist"))).toBe(false);

    // Hosted webview openFile uses in-window c.filePicker(...) with a live token
    const pending = dialogs.openFile({ title: "Pick Hosted File" });
    expect(evals.some((code) => code.includes("c.filePicker("))).toBe(true);
    const tokenMatch = evals[0]!.match(/"token":"(fp_[^"]+)"/);
    expect(tokenMatch).not.toBeNull();

    // Active token succeeds while dialog is open
    const allowedBrowse = browseFn(guardParent, false, tokenMatch![1]);
    expect(allowedBrowse.error).toBeUndefined();

    // Resolve/cancel dialog -> token is revoked afterward
    const [reqId, resolveFn] = [...resolvers.entries()][0]!;
    expect(reqId).toStartWith("file_");
    resolveFn(null);
    expect(await pending).toBeNull();

    const postCloseBrowse = browseFn(guardParent, false, tokenMatch![1]);
    expect(postCloseBrowse.error).toContain("No active file dialog session");
  });

  test("hostedPage and GAME_MASTER_FX_SCRIPT validate e.source === window.parent and same-origin", () => {
    const session = new HostedSession("sec18_sess");
    session.html = "<!doctype html><html><body>Hi</body></html>";
    const page = hostedPage(session, "ws://127.0.0.1:9999/ws");
    expect(page).toContain("e.source !== window.parent");
    expect(page).toContain("isTrustedParentMessage");

    expect(GAME_MASTER_FX_SCRIPT).toContain("e.source !== window.parent");
    expect(GAME_MASTER_FX_SCRIPT).toContain("isTrustedParentMessage");
  });

  test("SimpleCLI strips ANSI/OSC escape sequences from untrusted arguments in error output", async () => {
    const errors: string[] = [];
    const origError = console.error;
    const origExitCode = process.exitCode;
    console.error = (...args: any[]) => errors.push(args.join(" "));
    try {
      const cli = new SimpleCLI("sec-cli", "1.0.0");
      cli.command("deploy", "Deploy app", () => {});
      await cli.run(["\x1b[31m\x1b]52;c;evil\x07badcmd"]);
      const combined = errors.join("\n");
      expect(combined).toContain("badcmd");
      expect(combined).not.toContain("\x1b]52");
      expect(combined).not.toContain("\x07");
    } finally {
      console.error = origError;
      process.exitCode = origExitCode;
    }
  });
});

describe("[V-QA-04, V-QA-05, V-QA-17] QA bug fixes across IDE, SimpleGUI, SQL filters, Redis, SimpleCLI & GameMasterFX", () => {
  test("[V-QA-04] generatePreviewHtml closable tabs emit valid browser JS (no TypeScript `as any`) and multi-select bringToFront/sendToBack preserves all controls", () => {
    const html = generatePreviewHtml({
      title: "TabsClosable",
      width: 500,
      height: 300,
      controls: [
        {
          id: "tabs_1",
          control_type: "tabs",
          x: 10,
          y: 10,
          width: 400,
          height: 200,
          closable: true,
          items: ["One", "Two", "Three"],
        },
      ],
    });
    expect(html).not.toContain("as any");
    const scripts = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]!);
    for (const code of scripts) {
      expect(() => new Function(code)).not.toThrow();
    }

    const dom = createIdeDom();
    try {
      const win = dom.window as any;
      const frontOrder = win.eval(`
        formSpec.controls = [
          { id: "a", control_type: "button", x: 0, y: 0, width: 50, height: 30 },
          { id: "b", control_type: "button", x: 60, y: 0, width: 50, height: 30 },
          { id: "c", control_type: "button", x: 120, y: 0, width: 50, height: 30 },
          { id: "d", control_type: "button", x: 180, y: 0, width: 50, height: 30 }
        ];
        selectedIndices = [0, 2];
        bringToFront();
        formSpec.controls.map(c => c.id);
      `);
      expect(Array.from(frontOrder)).toEqual(["b", "d", "a", "c"]);

      const backOrder = win.eval(`
        selectedIndices = [1, 3];
        sendToBack();
        formSpec.controls.map(c => c.id);
      `);
      expect(Array.from(backOrder)).toEqual(["d", "c", "b", "a"]);
    } finally {
      dom.window.close();
    }
  });

  test("[V-QA-05] SimpleWindow setTitle, onclick/onchange/onenter dispatch, and 3-arg addCalloutPanel", async () => {
    const evals: string[] = [];
    const win = createWindow("Initial", 400, 300);
    (win as any).isWindowRunning = true;
    (win as any).webview = {
      title: "Initial",
      eval: (js: string) => evals.push(js),
    };

    win.setTitle("Updated Title");
    expect(win.title).toBe("Updated Title");
    expect(evals.some((s) => s.includes("Updated Title"))).toBe(true);

    const clicks: string[] = [];
    const changes: string[] = [];
    const enters: string[] = [];

    const btn = win.addButton("Go").id("btn_go");
    win.onclick(() => {
      clicks.push("btn_go");
    });

    const inp = win.addTextInput("Name", "").id("inp_name");
    win.onchange((_w, val) => {
      changes.push(String(val));
    });
    win.onenter((_w, val) => {
      enters.push(String(val));
    });

    expect(btn.spec.id).toBe("btn_go");
    expect(inp.spec.id).toBe("inp_name");

    await win.triggerClick("btn_go");
    await win.triggerChange("inp_name", "Ada");
    await win.triggerEvent("inp_name", "onEnter", "Ada");

    expect(clicks).toEqual(["btn_go"]);
    expect(changes).toEqual(["Ada"]);
    expect(enters).toEqual(["Ada"]);

    // 3-arg addCalloutPanel(title, body, tone)
    const callout = win.addCalloutPanel("Heads Up", "Body copy", "warning");
    expect(callout.spec.title).toBe("Heads Up");
    expect(callout.spec.message).toBe("Body copy");
    expect(callout.spec.alert_type).toBe("warning");
  });

  test("[V-QA-05] buildColumnFilterWhere and buildSearchFilterWhere escape %, _, and \\ with ESCAPE clause", () => {
    const sqliteFilter = buildColumnFilterWhere(
      { name: "CONTAINS 100%_raw\\val" },
      ["name"],
      "sqlite",
    );
    expect(sqliteFilter.clauses[0]).toContain("ESCAPE '\\'");
    expect(sqliteFilter.params[0]).toBe("%100\\%\\_raw\\\\val%");

    const mysqlSearch = buildSearchFilterWhere("50%_off", ["title"], "mysql");
    expect(mysqlSearch.clause).toContain("ESCAPE '\\\\'");
    expect(mysqlSearch.params[0]).toBe("%50\\%\\_off%");
  });

  test("[V-QA-05, V-OPT-13] NamespacedRedis live subscribe, atomic owner-checked releaseLock, connection-only fallback & memory cleanup", async () => {
    const ns = new NamespacedRedis({
      namespace: "qa_unit_ns",
      url: "redis://memory-qa-test:6379",
      inMemory: true,
    });
    const peer = new NamespacedRedis({
      namespace: "qa_unit_ns",
      url: "redis://memory-qa-test:6379",
      inMemory: true,
    });

    const received: string[] = [];
    const unsub = ns.subscribe("events", (msg) => received.push(msg));
    await peer.publish("events", "hello-pubsub");
    expect(received).toEqual(["hello-pubsub"]);
    await unsub.unsubscribe();
    await peer.publish("events", "after-unsub");
    expect(received).toEqual(["hello-pubsub"]);

    // Atomic lock ownership check
    const tokenA = await ns.acquireLock("job1", 5000);
    expect(typeof tokenA).toBe("string");
    expect(await ns.releaseLock("job1", "forged-owner")).toBe(false);
    expect(await ns.releaseLock("job1", tokenA!)).toBe(true);

    // Binary Uint8Array round-trip + xx
    const bin = new Uint8Array([0, 255, 128, 64]);
    await ns.set("bin_key", bin, { ex: 60 });
    expect(await ns.getBuffer("bin_key")).toEqual(bin);
    expect(await ns.set("missing_xx", "v", { xx: true })).toBeNull();

    // Non-connection logical Redis error (WRONGTYPE) does NOT silently wipe live backend client
    let getCalls = 0;
    const mockBackend = {
      get: async () => {
        getCalls++;
        throw new Error(
          "WRONGTYPE Operation against a key holding the wrong kind of value",
        );
      },
      ping: async () => "PONG",
      close: () => {},
    };
    const strictNs = new NamespacedRedis({
      namespace: "strict_ns",
      client: mockBackend as any,
      fallbackToMemory: true,
    });
    await expect(strictNs.get("list_key")).rejects.toThrow("WRONGTYPE");
    expect(getCalls).toBe(1);
    expect(await strictNs.ping()).toBe("PONG");

    await ns.close();
    await peer.close();
    await strictNs.close();
  });

  test("[V-QA-05] SimpleCLI parses --flag=a=b, -- end-of-flags, and -abc combined boolean flags", async () => {
    let capturedArgs: string[] = [];
    let capturedFlags: Record<string, any> = {};

    const cli = new SimpleCLI("flag-test", "1.0.0");
    cli.command("run", "Run items", (sub) => {
      sub
        .addFlagBool("all", "a", false, "All")
        .addFlagBool("build", "b", false, "Build")
        .addFlagBool("clean", "c", false, "Clean")
        .addFlagString("env", "e", "", "Env key=val")
        .action((flags, args) => {
          capturedFlags = flags;
          capturedArgs = args;
        });
    });

    await cli.run([
      "run",
      "-abc",
      "--env=FOO=bar=baz",
      "--",
      "--literal-arg",
      "-x",
    ]);

    expect(capturedFlags.all).toBe(true);
    expect(capturedFlags.build).toBe(true);
    expect(capturedFlags.clean).toBe(true);
    expect(capturedFlags.env).toBe("FOO=bar=baz");
    expect(capturedArgs).toEqual(["--literal-arg", "-x"]);
  });

  test("[V-QA-17] injectGameMasterFx wraps cancelAnimationFrame for queued/synthetic IDs and pauses when document.hidden", () => {
    const full = injectGameMasterFx("<html><head></head><body></body></html>");
    expect(full).toContain("window.cancelAnimationFrame =");
    expect(full).toContain("queuedRafs");
    expect(full).toContain("document.hidden");
  });
});

describe("[V-OPT-04, V-OPT-06, V-OPT-13, V-OPT-17] Performance, bundle size & algorithmic optimizations", () => {
  test("[V-OPT-04] matchTip returns identical results across repeated lookups via WeakMap precompiled index", () => {
    const tips = {
      "text:Save Workspace": "Saves current workspace layout.",
      "text^:Export Project": "Exports standalone project files.",
      "#btnRunPreview": "Launches live preview window.",
    };
    expect(
      matchTip(makeElemInfo({ id: "btnRunPreview", text: "Run" }), tips),
    ).toBe("Launches live preview window.");
    expect(matchTip(makeElemInfo({ text: "💾 Save Workspace" }), tips)).toBe(
      "Saves current workspace layout.",
    );
    expect(
      matchTip(makeElemInfo({ text: "Export Project... now" }), tips),
    ).toBe("Exports standalone project files.");
  });

  test("[V-OPT-06, V-OPT-13] ide.html compact FX bundle stays under 800 KB, getIdeHtml memoizes, fxCss deduplicates selectors, and index.ts has zero direct dlopen calls", () => {
    const ideSize = statSync(join(REPO_ROOT, "src/ide.html")).size;
    expect(ideSize).toBeLessThan(800 * 1024);

    const h1 = getIdeHtml();
    const h2 = getIdeHtml();
    expect(h1).toBe(h2);

    const css = fxCss();
    const grainRule = css.match(/([^\n{]+)\{\s*position:\s*relative;\s*\}/);
    expect(grainRule).not.toBeNull();
    const selectors = grainRule![1]!.split(",").map((s) => s.trim());
    expect(new Set(selectors).size).toBe(selectors.length);

    const indexSrc = readFileSync(join(REPO_ROOT, "index.ts"), "utf8");
    expect(indexSrc).not.toContain("dlopen(");
  });

  test("[V-OPT-17] collectLayoutIssues sweep-line overlap detection, selected-only resize handles, and lazy renderCode/flushCodeTab", () => {
    const dom = createIdeDom();
    try {
      const win = dom.window as any;
      const {
        handleCount,
        overlapCount,
        tsHasBtn1,
        jsonLazyBeforeFlush,
        jsonHasC3,
      } = win.eval(`
        formSpec.controls = [
          { id: "c1", control_type: "button", x: 20, y: 20, width: 100, height: 40, text: "Btn 1" },
          { id: "c2", control_type: "button", x: 60, y: 30, width: 100, height: 40, text: "Btn 2" },
          { id: "c3", control_type: "button", x: 300, y: 20, width: 100, height: 40, text: "Btn 3" }
        ];
        selectedIndices = [0];
        renderCanvas();
        const handleCount = document.querySelectorAll(".resize-handle").length;
        const issues = collectLayoutIssues(formSpec);
        const overlapCount = issues.filter(i => String(i).toLowerCase().includes("overlap")).length;
        document.getElementById("jsonPreviewText").value = "";
        renderCode();
        const jsonLazyBeforeFlush = (document.getElementById("jsonPreviewText")?.value || "").includes('"c3"');
        flushCodeTab("tabBunTS");
        flushCodeTab("tabHTML");
        const tsHasBtn1 =
          (document.getElementById("bunTsPreviewText")?.value || "").includes('from "webview-bun"') &&
          (document.getElementById("htmlPreviewText")?.value || "").includes("Btn 1");
        flushCodeTab("tabJSON");
        const jsonHasC3 = (document.getElementById("jsonPreviewText")?.value || "").includes('"c3"');
        ({ handleCount, overlapCount, tsHasBtn1, jsonLazyBeforeFlush, jsonHasC3 });
      `);

      expect(handleCount).toBe(8);
      expect(overlapCount).toBe(1);
      expect(jsonLazyBeforeFlush).toBe(false);
      expect(tsHasBtn1).toBe(true);
      expect(jsonHasC3).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
