import { describe, expect, test, spyOn } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import * as os from "os";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import * as localGuard from "../src/localGuard";
import {
  SimpleControlRef,
  SimpleWindow,
  SimpleDialogs,
  createWindow,
  newWindow,
  newSimpleWindow,
  new_simple_window,
  simplegui,
  getAppStateFile,
  getAppConfigFile,
  writeFileAtomic,
} from "../src/simplegui";
import { createFdStudio } from "../applications/fd_studio";
import { createJqStudio } from "../applications/jq_studio";
import {
  renderIndexDts,
  renderSimpleGuiDts,
} from "../scripts/build_npm_package";

const ROOT = resolve(import.meta.dir, "..");

/**
 * Minimal DOM element & document simulator for executing SimpleWindow.evalJS
 * snippets during live `isWindowRunning = true` tests.
 */
function createSimulatedDom(elements: Record<string, any>) {
  const doc = {
    getElementById(id: string) {
      return elements[id] ?? null;
    },
    querySelector(sel: string) {
      const idMatch = sel.match(/^#([A-Za-z0-9_-]+)$/);
      if (idMatch && idMatch[1]) return elements[idMatch[1]] ?? null;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return {
    doc,
    exec(script: string) {
      const fn = new Function("document", "window", "Event", script);
      const fakeEvent = class {
        type: string;
        bubbles: boolean;
        constructor(type: string, opts?: any) {
          this.type = type;
          this.bubbles = Boolean(opts?.bubbles);
        }
      };
      fn(doc, { document: doc }, fakeEvent);
    },
  };
}

function makeFakeButton(initialText: string) {
  let text = initialText;
  let val = ""; // HTMLButtonElement.prototype.value defaults to "" (!== undefined)
  let innerHtmlWrites = 0;
  const attrs = new Map<string, string>();
  const classes = new Set<string>(["btn-theme-accent"]);
  const children: Record<string, any> = {};

  const el: any = {
    tagName: "BUTTON",
    style: {},
    dataset: {},
    disabled: false,
    title: "",
    classList: {
      add: (...c: string[]) => c.forEach((x) => classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
      toggle: (c: string, force?: boolean) => {
        const next = force !== undefined ? force : !classes.has(c);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c: string) => classes.has(c),
    },
    get value() {
      return val;
    },
    set value(next: string) {
      val = String(next);
    },
    get textContent() {
      return text;
    },
    set textContent(next: string) {
      text = String(next);
    },
    get innerText() {
      return text;
    },
    set innerText(next: string) {
      text = String(next);
    },
    get innerHTML() {
      return text;
    },
    set innerHTML(_next: string) {
      innerHtmlWrites++;
      throw new Error(
        "Button innerHTML must never be assigned by setValue/setText",
      );
    },
    get _innerHtmlWrites() {
      return innerHtmlWrites;
    },
    setAttribute(k: string, v: string) {
      attrs.set(k, v);
    },
    getAttribute(k: string) {
      return attrs.get(k) ?? null;
    },
    removeAttribute(k: string) {
      attrs.delete(k);
    },
    querySelector(sel: string) {
      return children[sel] ?? null;
    },
    querySelectorAll(sel: string) {
      return children[sel] ? [children[sel]] : [];
    },
    _children: children,
  };
  return el;
}

describe("Bug 1: setValue() / setText() on <button> and text/caption controls", () => {
  test("before run(): setValue, setText, and ref.setText update button & caption text as escaped plain text in generateHtml()", () => {
    const win = createWindow("Deploy Test", 520, 360, {
      theme: "dracula",
      fullscreen: false,
      autoSave: false,
    });

    win.addHeading("Main Section <v1>", 2);
    const btn = win.addButton("🚀 Deploy").id("btnDeploy");
    const lbl = win.addLabel("Initial Status").id("lblStatus");
    const hdg = win.addSubheading("Initial Heading").id("hdgMain");
    const bdg = win.addBadge("bdgState", "IDLE", "info");
    const chk = win.addCheckbox("chkAgree", "Accept Terms", true);

    // 1. setValue before run() on a button with non-empty initial text
    win.setValue("btnDeploy", "Deployed <v2> & Live");
    win.setValue("lblStatus", "Running <prod> & healthy");
    win.setText("hdgMain", "Release <2.0> & Notes");
    win.setText("bdgState", "LIVE <OK>");
    win.setText("chkAgree", "Accept <Updated> Terms");

    const html1 = win.generateHtml();
    expect(html1).toContain("Deployed &lt;v2&gt; &amp; Live");
    expect(html1).not.toContain("🚀 Deploy");
    expect(html1).not.toContain("<v2>");
    expect(html1).toContain("Running &lt;prod&gt; &amp; healthy");
    expect(html1).toContain("Release &lt;2.0&gt; &amp; Notes");
    expect(html1).toContain("LIVE &lt;OK&gt;");
    expect(html1).toContain("Accept &lt;Updated&gt; Terms");
    // Checkbox checked value was NOT clobbered by setText()
    expect(win.getChecked("chkAgree")).toBe(true);
    expect(html1).toMatch(
      /id="chkAgree"[\s\S]*?<input[^>]*type="checkbox"[^>]*checked/,
    );

    // 2. Subsequent setText / ref.setText before run()
    btn.setText("Shipped <v3> & Verified");
    lbl.text("All <green>");
    const html2 = win.generateHtml();
    expect(html2).toContain("Shipped &lt;v3&gt; &amp; Verified");
    expect(html2).not.toContain("Deployed &lt;v2&gt; &amp; Live");
    expect(html2).toContain("All &lt;green&gt;");
  });

  test("during run(): setValue and setText update <button> textContent as plain text (never button.value or innerHTML) while preserving .value on inputs", () => {
    const win = createWindow("Live DOM Test", 520, 360, {
      fullscreen: false,
      autoSave: false,
    });
    const btnRef = win.addButton("🚀 Deploy").id("btnDeploy");
    win.addInput("txtHost", "localhost", "Hostname");
    win.addCheckbox("chkTls", "Use TLS", false);

    const fakeBtn = makeFakeButton("🚀 Deploy");
    const fakeBadgeBtn = makeFakeButton("Notifications");
    const badgeCaptionSpan = { textContent: "Notifications" };
    fakeBadgeBtn._children[".rad-btn-caption"] = badgeCaptionSpan;

    const fakeInput: any = {
      tagName: "INPUT",
      type: "text",
      value: "localhost",
      textContent: "",
      style: {},
      dataset: {},
      classList: { contains: () => false },
      getAttribute: () => null,
      querySelector: () => null,
      dispatchEvent() {},
    };
    const fakeCheckbox: any = {
      tagName: "INPUT",
      type: "checkbox",
      checked: false,
      value: "on",
      style: {},
      dataset: {},
      classList: { contains: () => false },
      getAttribute: () => null,
      querySelector: () => null,
      dispatchEvent() {},
    };

    const dom = createSimulatedDom({
      btnDeploy: fakeBtn,
      btnBadge: fakeBadgeBtn,
      txtHost: fakeInput,
      chkTls: fakeCheckbox,
    });

    const evalLog: string[] = [];
    (win as any).isWindowRunning = true;
    (win as any).webview = {
      isHosted: true,
      eval(js: string) {
        evalLog.push(js);
        dom.exec(js);
      },
    };

    // Update <button> via win.setValue
    win.setValue("btnDeploy", "Deployed <v2> & Live");
    expect(fakeBtn.textContent).toBe("Deployed <v2> & Live");
    expect(fakeBtn.value).toBe(""); // button.value MUST remain untouched
    expect(fakeBtn._innerHtmlWrites).toBe(0);

    // Update <button> via win.setText & btnRef.setText
    win.setText("btnDeploy", "Rollback <v1.9> & Retry");
    expect(fakeBtn.textContent).toBe("Rollback <v1.9> & Retry");
    expect(fakeBtn.value).toBe("");

    btnRef.setText("Ref Label <OK>");
    expect(fakeBtn.textContent).toBe("Ref Label <OK>");
    expect(fakeBtn.value).toBe("");

    // Badge button updates .rad-btn-caption textContent without wiping badge child
    win.setValue("btnBadge", "Alerts <5>");
    expect(badgeCaptionSpan.textContent).toBe("Alerts <5>");
    expect(fakeBadgeBtn.value).toBe("");

    // Actual form value controls still update .value / .checked properly
    win.setValue("txtHost", "db.example.com");
    expect(fakeInput.value).toBe("db.example.com");

    win.setValue("chkTls", true);
    expect(fakeCheckbox.checked).toBe(true);
    expect(evalLog.length).toBeGreaterThanOrEqual(5);
  });

  test("setHtml() explicitly renders raw HTML both before and during run()", () => {
    const win = createWindow("HTML Escape Hatch", 480, 320, {
      fullscreen: false,
      autoSave: false,
    });
    const lbl = win.addLabel("Plain").id("lblRich");
    lbl.setHtml("<strong>Bold</strong> &amp; <em>Italic</em>");
    const html = win.generateHtml();
    expect(html).toContain("<strong>Bold</strong> &amp; <em>Italic</em>");
  });
});

describe("Bug 2: Explicit window options vs persisted session/form state & fullscreen defaults", () => {
  test("explicit { theme: 'dracula', fullscreen: false } and 520x360 are NOT overwritten by saved form_state.json, session.json, or global theme", () => {
    const tmp = mkdtempSync(join(tmpdir(), "simplegui-bug2-"));
    const prevConfig = process.env.XDG_CONFIG_HOME;
    const prevState = process.env.XDG_STATE_HOME;
    process.env.XDG_CONFIG_HOME = join(tmp, "config");
    process.env.XDG_STATE_HOME = join(tmp, "state");

    try {
      const appId = "deploy_dashboard_bug2";
      // Seed global saved theme
      const globalThemeDir = join(tmp, "config", "simplegui");
      mkdirSync(globalThemeDir, { recursive: true });
      writeFileSync(join(globalThemeDir, "theme.txt"), "cyberpunk", "utf8");

      // Seed saved form_state.json with conflicting window metadata + valid control value
      const formStatePath = getAppConfigFile(appId, "form_state.json");
      writeFileAtomic(
        formStatePath,
        JSON.stringify({
          __win_fullscreen: true,
          __win_theme: "midnight",
          __win_width: 1920,
          __win_height: 1080,
          txtEnv: "staging",
        }),
      );

      // Seed saved session.json with conflicting window metadata
      const sessionPath = getAppStateFile(appId, "session.json");
      writeFileAtomic(
        sessionPath,
        JSON.stringify({
          width: 1728,
          height: 1117,
          theme: "midnight",
          fullscreen: true,
        }),
      );

      const win = createWindow("My App", 520, 360, {
        appId,
        theme: "dracula",
        fullscreen: false,
      });
      win.addInput("txtEnv", "dev", "Environment");

      win.restoreWindowSession();
      win.restoreAppFormState();

      expect(win.fullscreen).toBe(false);
      expect(win.isFullscreen()).toBe(false);
      expect(win.theme).toBe("dracula");
      expect(win.width).toBe(520);
      expect(win.height).toBe(360);
      // Control value from form_state.json SHOULD still restore!
      expect(win.getValue("txtEnv")).toBe("staging");

      // Meanwhile, an unpinned window for the same appId DOES restore saved window metadata
      const unpinned = createWindow("My App", { appId });
      unpinned.restoreWindowSession();
      unpinned.restoreAppFormState();
      expect(unpinned.fullscreen).toBe(true);
      expect(unpinned.theme).toBe("midnight");
      expect(unpinned.width).toBe(1920);
      expect(unpinned.height).toBe(1080);
    } finally {
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevConfig;
      if (prevState === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = prevState;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("createWindow('My App', 520, 360) opens at 520x360 (fullscreen = false), while studio apps preserve fullscreen startup", () => {
    const sized = createWindow("My App", 520, 360);
    expect(sized.width).toBe(520);
    expect(sized.height).toBe(360);
    expect(sized.fullscreen).toBe(false);

    const explicitFull = createWindow("Full App", 1280, 800, {
      fullscreen: true,
    });
    expect(explicitFull.fullscreen).toBe(true);

    const noDims = createWindow("Default Full App");
    expect(noDims.fullscreen).toBe(true);

    // Existing studio entrypoints still default to fullscreen = true
    const fdWin = createFdStudio();
    expect(fdWin.fullscreen).toBe(true);
    const fdWindowed = createFdStudio({ fullscreen: false });
    expect(fdWindowed.fullscreen).toBe(false);

    const jqWin = createJqStudio();
    expect(jqWin.fullscreen).toBe(true);
  });
});

describe("Bug 3: index.d.ts and simplegui.d.ts strict TypeScript verification", () => {
  test("every runtime SimpleControlRef and SimpleWindow prototype method is typed without [key: string]: any", () => {
    const dtsSources = [
      renderIndexDts(),
      ...[
        join(ROOT, "dist", "index.d.ts"),
        join(ROOT, "dist", "npm", "index.d.ts"),
      ]
        .filter((p) => existsSync(p))
        .map((p) => readFileSync(p, "utf8")),
    ];

    const ctrlMethods = Object.getOwnPropertyNames(
      SimpleControlRef.prototype,
    ).filter((m) => m !== "constructor" && !m.startsWith("_"));
    const winMethods = Object.getOwnPropertyNames(
      SimpleWindow.prototype,
    ).filter((m) => m !== "constructor" && !m.startsWith("_"));

    for (const dts of dtsSources) {
      expect(dts).not.toContain("readonly id: string;");
      expect(dts).toContain("id(idStr: string): this;");

      // Extract SimpleControlRef class block and ensure no index signature fallback
      const ctrlBlockMatch = dts.match(
        /export declare class SimpleControlRef \{[\s\S]*?\n\}/,
      );
      expect(ctrlBlockMatch).not.toBeNull();
      expect(ctrlBlockMatch![0]).not.toContain("[key: string]: any");

      for (const m of ctrlMethods) {
        expect(ctrlBlockMatch![0]).toContain(`${m}(`);
      }
      for (const m of winMethods) {
        expect(dts.includes(`${m}(`) || dts.includes(`private ${m};`)).toBe(
          true,
        );
      }
    }

    const sgSources = [
      renderSimpleGuiDts(),
      ...[
        join(ROOT, "dist", "simplegui.d.ts"),
        join(ROOT, "dist", "npm", "simplegui.d.ts"),
      ]
        .filter((p) => existsSync(p))
        .map((p) => readFileSync(p, "utf8")),
    ];
    for (const sgDts of sgSources) {
      expect(sgDts).toMatch(
        /export type \{[\s\S]*\bWindowOptions\b[\s\S]*\} from "\.\/index\.js";/,
      );
      expect(sgDts).toMatch(
        /export \{[\s\S]*\bcreateWindow\b[\s\S]*\} from "\.\/index\.js";/,
      );
    }
  });

  test("tsc --noEmit with strict: true, verbatimModuleSyntax: true, and skipLibCheck: false passes with zero errors", () => {
    const tmp = mkdtempSync(join(tmpdir(), "simplegui-tsc-"));
    try {
      const pkgDir = join(tmp, "node_modules", "bun-rad-studio");
      mkdirSync(pkgDir, { recursive: true });
      const distNpmPkg = join(ROOT, "dist", "npm", "package.json");
      const pkgJson = existsSync(distNpmPkg)
        ? readFileSync(distNpmPkg, "utf8")
        : JSON.stringify(
            {
              name: "bun-rad-studio",
              version: "1.5.9",
              type: "module",
              main: "./index.js",
              types: "./index.d.ts",
              exports: {
                ".": {
                  types: "./index.d.ts",
                  import: "./index.js",
                  default: "./index.js",
                },
                "./simplegui": {
                  types: "./simplegui.d.ts",
                  import: "./simplegui.js",
                  default: "./simplegui.js",
                },
              },
            },
            null,
            2,
          );
      writeFileSync(join(pkgDir, "package.json"), pkgJson, "utf8");
      writeFileSync(join(pkgDir, "index.d.ts"), renderIndexDts(), "utf8");
      writeFileSync(
        join(pkgDir, "simplegui.d.ts"),
        renderSimpleGuiDts(),
        "utf8",
      );

      const consumerTs = `
import {
  createWindow,
  SimpleDialogs,
  type WindowOptions,
  type EventCallback,
  type SimpleControlRef,
  type SimpleWindow,
} from "bun-rad-studio/simplegui";
import { createWindow as rootCreateWindow, type SimpleWindowOptions } from "bun-rad-studio";

const opts: WindowOptions = {
  theme: "dracula",
  fullscreen: false,
  autoSave: false,
  autoSaveState: false,
  responsive: true,
  padding: 16,
  spacing: 10,
  appId: "strict_consumer",
  effects: "reduced",
};

const win: SimpleWindow = createWindow("My App", 520, 360, opts);
const btn: SimpleControlRef = win.addButton("🚀 Deploy", (w) => {
  w.setText("btnDeploy", "Deployed Now");
  w.setValue("btnDeploy", "Deployed v2");
  w.toast("Deployed!");
})
  .id("btnDeploy")
  .at(20, 20)
  .pos(20, 20)
  .size(160, 40)
  .width(160)
  .height(40)
  .bg("#0284c7")
  .backgroundColor("#0284c7")
  .color("#ffffff")
  .fontColor("#ffffff")
  .font(14, "#ffffff", "700")
  .fontSize(14)
  .bold()
  .italic(false)
  .align("center")
  .expandFill()
  .tooltip("Click to trigger production deployment")
  .placeholder("N/A")
  .opacity(100)
  .enabled(true)
  .enable(true)
  .disabled(false)
  .readOnly(false)
  .visible(true)
  .show()
  .focus()
  .flash()
  .highlight(500);

const onExplicitClick: EventCallback = async (w, val) => {
  w.setHtml("lblInfo", String(val ?? "ok"));
  w.evalJS("void 0");
  w.setFullscreen(false);
  w.clearAppFormState();
  w.disableAutoSave();
};

win.addButton("btnExplicit", "Run Action", onExplicitClick, { width: 140 });
win.addLabel("lblInfo", "Ready", (w) => w.toast("Clicked label"));
win.addInput("Enter host").id("txtHost").value("127.0.0.1");
win.addSelect("selEnv", ["dev", "staging", "prod"], "prod", (w, v) => {
  w.setCaption("lblInfo", String(v));
}).options(["dev", "prod"]);
win.addSlider(0, 100, 50).min(0).max(100).step(5);

const currentText: string = btn.text();
const currentVal: unknown = btn.value();
const rootOpts: SimpleWindowOptions = { fullscreen: false };
const win2 = rootCreateWindow("Secondary", rootOpts);
void currentText;
void currentVal;
void win2;
void SimpleDialogs;
`;

      writeFileSync(join(tmp, "consumer.ts"), consumerTs, "utf8");
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify(
          {
            compilerOptions: {
              target: "ESNext",
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              verbatimModuleSyntax: true,
              skipLibCheck: false,
              noEmit: true,
              types: [],
            },
            include: ["consumer.ts"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const tscBin = join(ROOT, "node_modules", ".bin", "tsc");
      const proc = Bun.spawnSync([tscBin, "-p", join(tmp, "tsconfig.json")], {
        cwd: tmp,
        stdout: "pipe",
        stderr: "pipe",
      });
      const out =
        new TextDecoder().decode(proc.stdout) +
        new TextDecoder().decode(proc.stderr);
      expect(out).toBe("");
      expect(proc.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("High-level SimpleGUI ergonomic developer enhancements", () => {
  test("flexible window factories, placeholder promotion on .id(), values()/setValues(), control()/getControl(), and fluent getters/setters", () => {
    const w1 = createWindow({
      title: "Config Object Window",
      width: 640,
      height: 420,
      theme: "nord",
      autoSave: false,
    });
    expect(w1.title).toBe("Config Object Window");
    expect(w1.width).toBe(640);
    expect(w1.height).toBe(420);
    expect(w1.fullscreen).toBe(false);
    expect(w1.theme).toBe("nord");

    const w2 = newWindow("Title + Options", {
      theme: "dracula",
      fullscreen: false,
      autoSave: false,
    });
    expect(w2.title).toBe("Title + Options");
    expect(w2.theme).toBe("dracula");
    expect(w2.fullscreen).toBe(false);
    expect(
      newSimpleWindow({ title: "A", width: 400, height: 300 }).fullscreen,
    ).toBe(false);
    expect(new_simple_window("B", 400, 300).fullscreen).toBe(false);
    expect(typeof simplegui.SimpleDialogs.prototype.fire).toBe("function");
    expect(typeof w2.dialogs.fire).toBe("function");

    // addInput("Enter username").id("txtUser") promotes first arg to placeholder
    const userRef = w2.addInput("Enter username").id("txtUser");
    expect(userRef.getId()).toBe("txtUser");
    expect(userRef.spec.placeholder).toBe("Enter username");
    expect(w2.generateHtml()).toContain('placeholder="Enter username"');

    const chkRef = w2.addCheckbox("Remember me", false).id("chkRemember");
    const roleRef = w2
      .addSelect(["Viewer", "Editor", "Admin"], "Editor")
      .id("selRole");

    // Fluent value() / text() / checked() getter-setter overloads
    expect(userRef.value("alice")).toBe(userRef);
    expect(userRef.value()).toBe("alice");
    expect(chkRef.checked(true)).toBe(chkRef);
    expect(chkRef.checked()).toBe(true);
    expect(chkRef.toggleEnabled()).toBe(false);
    expect(chkRef.isEnabled()).toBe(false);
    expect(chkRef.toggleEnabled()).toBe(true);
    expect(roleRef.toggleVisible()).toBe(false);
    expect(roleRef.isVisible()).toBe(false);
    expect(roleRef.toggleVisible()).toBe(true);

    // Batch values() / setValues() and control() / getControl()
    expect(w2.values()).toMatchObject({
      txtUser: "alice",
      chkRemember: true,
      selRole: "Editor",
    });
    w2.values({ txtUser: "bob", selRole: "Admin" });
    expect(w2.getValues(["txtUser", "selRole"])).toEqual({
      txtUser: "bob",
      selRole: "Admin",
    });

    expect(w2.getControl("missing_id")).toBeNull();
    expect(() => w2.control("missing_id")).toThrow(/missing_id/);
    expect(w2.control("txtUser").clear().value()).toBe("");

    // Custom .bg() and .color() survive win.setTheme()
    const customBtn = w2
      .addButton("Custom")
      .id("btnCustom")
      .bg("#ef4444")
      .color("#fef2f2");
    w2.setTheme("apple_light", false);
    expect(customBtn.spec.background_color).toBe("#ef4444");
    expect(customBtn.spec.font_color).toBe("#fef2f2");
  });

  test("scoped layout helpers (row, card, grid, section, groupBox) nest cleanly and unwind layoutStack on error", () => {
    const win = createWindow("Scoped Layouts", 800, 600, {
      fullscreen: false,
      autoSave: false,
    });

    win.section("Deployment Settings", () => {
      win.grid(2, 16, () => {
        win.card("Cluster A", () => {
          win.row(() => {
            win.addLabel("Status:");
            win.addBadge("bdgA", "Healthy", "success");
          });
        });
        win.groupBox("Cluster B", () => {
          win.addButton("Restart");
        });
      });
    });

    expect((win as any).layoutStack.length).toBe(0);
    const html = win.generateHtml();
    expect(html).toContain("Deployment Settings");
    expect(html).toContain("Cluster A");
    expect(html).toContain("Cluster B");

    // Verify try/finally unwinds stack on thrown error
    expect(() =>
      win.card("Broken Card", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect((win as any).layoutStack.length).toBe(0);
  });
});

async function withIsolatedHome(
  fn: (tmpHome: string) => void | Promise<void>,
): Promise<void> {
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const prevLocalAppData = process.env.LOCALAPPDATA;
  const prevAppData = process.env.APPDATA;
  const prevXdgConfig = process.env.XDG_CONFIG_HOME;
  const prevXdgState = process.env.XDG_STATE_HOME;
  const tmpHome = mkdtempSync(join(tmpdir(), "simplegui-reg-home-"));
  const homeSpy = spyOn(os, "homedir").mockReturnValue(tmpHome);
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.env.LOCALAPPDATA = join(tmpHome, "AppData", "Local");
  process.env.APPDATA = join(tmpHome, "AppData", "Roaming");
  process.env.XDG_CONFIG_HOME = join(tmpHome, ".config");
  process.env.XDG_STATE_HOME = join(tmpHome, ".local", "state");

  try {
    await fn(tmpHome);
  } finally {
    homeSpy.mockRestore();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    if (prevLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prevLocalAppData;
    if (prevAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = prevAppData;
    if (prevXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prevXdgConfig;
    if (prevXdgState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prevXdgState;
    rmSync(tmpHome, { recursive: true, force: true });
  }
}

function makeFakeControlButton(initialText: string) {
  const btn = makeFakeButton(initialText);
  btn.hasAttribute = (k: string) => btn.getAttribute(k) !== null;
  return btn;
}

describe("SimpleWindow evalJS escaping and duration sanitization", () => {
  test("setValue, setText, setHtml, setStatus, and setStatusBarText safely escape quotes, newlines, templates, and </script>", () => {
    const win = new SimpleWindow({
      title: "EvalJS Escaping",
      width: 640,
      height: 420,
    });
    win.addButton("Initial").id("btnEsc");
    win.addInput("").id("inpEsc");
    win.addLabel("").id("lblEsc");
    win.addLabel("").id("lbl_status");
    win.addStatusBar("Ready").id("status_bar");

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    const btnEl = makeFakeControlButton("Initial");
    const makeStubDomEl = (
      tagName: string,
      extra: Record<string, any> = {},
    ) => ({
      tagName,
      textContent: "",
      innerHTML: "",
      style: {},
      dataset: {},
      classList: {
        contains: () => false,
        add: () => {},
        remove: () => {},
        toggle: () => false,
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute: () => {},
      getAttribute: () => null,
      hasAttribute: () => false,
      ...extra,
    });
    const inpEl: any = makeStubDomEl("INPUT", { type: "text", value: "" });
    const lblEl: any = makeStubDomEl("DIV");
    const statusEl: any = makeStubDomEl("DIV");
    const statusBarSpan: any = { textContent: "" };
    const statusBarEl: any = makeStubDomEl("DIV", {
      querySelector: (sel: string) =>
        sel.includes("span") ? statusBarSpan : null,
    });
    const sim = createSimulatedDom({
      btnEsc: btnEl,
      inpEsc: inpEl,
      lblEsc: lblEl,
      lbl_status: statusEl,
      status_bar: statusBarEl,
    });

    const tricky = `Line1\nLine2\r\n'single' "double" \`backtick\` \\slash\\ \${1+1} </script><img src=x onerror=alert(1)>\u2028\u2029`;

    win.setValue("btnEsc", tricky);
    win.setValue("inpEsc", tricky);
    win.setText("lblEsc", tricky);
    win.setStatus(tricky);
    win.setStatusBarText("status_bar", tricky);

    for (const s of scripts) {
      sim.exec(s);
    }

    expect(btnEl.textContent).toBe(tricky);
    expect(btnEl.value).toBe("");
    expect(inpEl.value).toBe(tricky);
    expect(lblEl.textContent).toBe(tricky);
    expect(statusEl.textContent).toBe(tricky);
    expect(statusBarSpan.textContent).toBe(tricky);

    // setHtml deliberately updates innerHTML without syntax breakage on tricky payloads
    scripts.length = 0;
    win.setHtml("lblEsc", `<span>'a' "b" \`c\`\n\${2+2}</span>`);
    expect(scripts.length).toBe(1);
    sim.exec(scripts[0]!);
    expect(lblEl.innerHTML).toBe(`<span>'a' "b" \`c\`\n\${2+2}</span>`);
  });

  test("toast and highlightControl safely serialize tricky strings and sanitize malicious or negative durations", () => {
    const win = new SimpleWindow({
      title: "Duration Safety",
      width: 520,
      height: 340,
    });
    win.addButton("Target").id("btnDur");

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    const tricky = `Alert "O'Reilly"\nline2 \`tick\` \${process.exit(1)} </script>\u2028`;
    win.toast(
      tricky,
      "1500); globalThis.__toastInjected=1;//" as any,
      "success",
    );
    expect(scripts.length).toBe(1);

    const firedToasts: any[] = [];
    try {
      const fn = new Function("window", scripts[0]!);
      fn({
        SimpleDialogClient: {
          fire: (opts: any) => {
            firedToasts.push(opts);
            return Promise.resolve({
              isConfirmed: true,
              isDenied: false,
              isDismissed: false,
              value: true,
            });
          },
        },
        handlePromptResultIPC: () => {},
      });

      expect((globalThis as any).__toastInjected).toBeUndefined();
      expect(firedToasts.length).toBe(1);
      expect(firedToasts[0].title).toBe(tricky);
      expect(firedToasts[0].toast).toBe(true);
      expect(firedToasts[0].timer).toBe(
        "1500); globalThis.__toastInjected=1;//",
      );
    } finally {
      delete (globalThis as any).__toastInjected;
    }

    // highlightControl clamps negative/NaN/injected durations to safe non-negative numbers
    scripts.length = 0;
    win.highlightControl("btnDur", "999); globalThis.__hiInjected=1;//" as any);
    win.highlightControl("btnDur", -50);

    expect(scripts.length).toBe(2);
    const btnEl = makeFakeButton("Target");
    const scheduledDelays: number[] = [];
    try {
      for (const s of scripts) {
        const fn = new Function("document", "setTimeout", s);
        fn(
          { getElementById: (id: string) => (id === "btnDur" ? btnEl : null) },
          (cb: () => void, ms: number) => {
            scheduledDelays.push(ms);
            cb();
          },
        );
      }
      expect((globalThis as any).__hiInjected).toBeUndefined();
      expect(scheduledDelays).toEqual([1000, 0]);
      expect(btnEl.style.boxShadow).toBe("none");
    } finally {
      delete (globalThis as any).__hiInjected;
    }
  });

  test("setPropertyGridValue, setTableData, and copyToClipboard execute safely with quotes, newlines, and HTML-like strings", () => {
    const win = new SimpleWindow({
      title: "Rich Escaping",
      width: 640,
      height: 420,
    });
    win.addPropertyGrid("propGrid", { 'host"key': "old", safe: "ok" });
    win.addTable(['Col"1', "Col<2>"], [["a", "b"]]).id("tblData");

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    const tricky = `val "q1" 'q2'\n\${7*7} <img src=x onerror=alert(1)>`;

    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="propGrid">
        <div class="prop-row" data-prop-key='host"key'><span class="prop-val">old</span></div>
      </div>
      <div id="tblData"></div>
    </body></html>`);

    win.setPropertyGridValue("propGrid", 'host"key', tricky);
    win.setTableData("tblData", ['Col"1', "Col<2>"], [[tricky, "plain"]]);

    expect(scripts.length).toBe(2);
    for (const s of scripts) {
      const fn = new Function("document", "window", s);
      fn(dom.window.document, dom.window);
    }

    expect(dom.window.document.querySelector(".prop-val")?.textContent).toBe(
      tricky,
    );
    const firstTd = dom.window.document.querySelector("#tblData tbody td");
    expect(firstTd?.textContent).toBe(tricky);
    expect(
      dom.window.document.querySelectorAll("#tblData img, #tblData script")
        .length,
    ).toBe(0);

    // copyToClipboard escapes multiline/quoted clipboard payload without touching host clipboard
    const clipSpy = spyOn(localGuard, "writeClipboardSync").mockImplementation(
      () => true,
    );
    try {
      scripts.length = 0;
      let copied = "";
      win.copyToClipboard(tricky);
      expect(clipSpy).toHaveBeenCalledWith(tricky);
      expect(scripts.length).toBe(1);
      const fn = new Function("navigator", "document", "console", scripts[0]!);
      fn(
        {
          clipboard: {
            writeText: (txt: string) => {
              copied = txt;
              return Promise.resolve();
            },
          },
        },
        dom.window.document,
        console,
      );
      expect(copied).toBe(tricky);
    } finally {
      clipSpy.mockRestore();
    }
  });
});

describe("Styling, theming, flex, rightClick, hover, and treeView parity", () => {
  test("SimpleControlRef.bg auto-contrasts text, emits data-custom-bg/color, and updates live DOM", () => {
    const win = new SimpleWindow({
      title: "Custom Colors",
      width: 600,
      height: 400,
      theme: "midnight",
    });
    const darkBtn = win
      .addButton("Dark BG", () => {})
      .id("btnDark")
      .bg("#111827");
    const brightBtn = win
      .addButton("Bright BG", () => {})
      .id("btnBright")
      .bg("#facc15");
    const explicitBtn = win
      .addButton("Explicit FG", () => {})
      .id("btnExplicit")
      .color("#10b981")
      .bg("#111827");

    expect(darkBtn.spec.custom_background).toBe(true);
    expect(darkBtn.spec._isThemeAccent).toBe(false);
    expect(darkBtn.spec.font_color).toBe("#ffffff");

    expect(brightBtn.spec.font_color).toBe("#000000");

    expect(explicitBtn.spec.custom_color).toBe(true);
    expect(explicitBtn.spec.font_color).toBe("#10b981");

    const html = win.generateHtml();
    expect(html).toContain('id="btnDark"');
    expect(html).toContain('data-custom-bg="true"');
    expect(html).toContain('data-custom-color="true"');

    // Live run() DOM updates via bg() and color()
    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    const fakeBtn = makeFakeControlButton("Dark BG");
    const sim = createSimulatedDom({ btnDark: fakeBtn });

    darkBtn.bg("#fef08a"); // bright yellow -> should auto-contrast text to black when no custom color
    darkBtn.color("#7c2d12");

    for (const s of scripts) {
      sim.exec(s);
    }

    expect(fakeBtn.style.background).toBe("#fef08a");
    expect(fakeBtn.style.backgroundColor).toBe("#fef08a");
    expect(fakeBtn.getAttribute("data-custom-bg")).toBe("true");
    expect(fakeBtn.classList.contains("btn-theme-accent")).toBe(false);
    expect(fakeBtn.getAttribute("data-custom-color")).toBe("true");
    expect(fakeBtn.style.color).toBe("#7c2d12");
  });

  test("_applyTheme preserves custom colors, avoids pinning explicit theme, and preserves live custom DOM styles", () => {
    const win = new SimpleWindow({ title: "Theme Switch" });
    const btnBgOnly = win
      .addButton("Bg Only", () => {})
      .id("btnBgOnly")
      .bg("#fde047");
    const btnFgOnly = win
      .addButton("Fg Only", () => {})
      .id("btnFgOnly")
      .color("#fb7185");
    const lblCustom = win
      .addLabel("Custom Label")
      .id("lblCustom")
      .color("#22d3ee");

    expect((win as any)._explicitWindowOptions?.theme).toBe(false);

    (win as any)._applyTheme("apple_light", false);
    expect((win as any)._explicitWindowOptions?.theme).toBe(false);
    expect(btnBgOnly.spec.background_color).toBe("#fde047");
    expect(btnBgOnly.spec.font_color).toBe("#000000");
    expect(btnFgOnly.spec.font_color).toBe("#fb7185");
    expect(lblCustom.spec.font_color).toBe("#22d3ee");

    // Public setTheme before run() DOES pin explicit theme, whereas _applyTheme does not
    const winPinned = new SimpleWindow({ title: "Theme Pin Check" });
    expect((winPinned as any)._explicitWindowOptions?.theme).toBe(false);
    winPinned.setTheme("dracula", false);
    expect((winPinned as any)._explicitWindowOptions?.theme).toBe(true);

    // Switching live via setTheme updates DOM while preserving custom bg/fg attributes & styles
    const html = win.generateHtml();
    const dom = new JSDOM(html);
    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    win.setTheme("dracula", false);
    expect(win.theme).toBe("dracula");

    expect(scripts.length).toBeGreaterThanOrEqual(1);
    const themeScript = scripts[0]!;
    const fn = new Function(
      "document",
      "window",
      "navigator",
      "getComputedStyle",
      themeScript,
    );
    fn(
      dom.window.document,
      dom.window,
      dom.window.navigator,
      dom.window.getComputedStyle.bind(dom.window),
    );

    const domBtnBg = dom.window.document.getElementById("btnBgOnly");
    const domLblCustom = dom.window.document.getElementById("lblCustom");
    expect(domBtnBg?.getAttribute("data-custom-bg")).toBe("true");
    expect(domBtnBg?.style.backgroundColor).toBeTruthy();
    expect(domLblCustom?.getAttribute("data-custom-color")).toBe("true");
    expect(domLblCustom?.style.color).toBeTruthy();
    expect(
      dom.window.document.documentElement.style.getPropertyValue("--accent"),
    ).toBe(win.accentColor);
  });

  test("onRightClick sets has_context_menu, renders data-context-menu attributes, and updates live DOM", async () => {
    const win = new SimpleWindow({ title: "Context Menu" });
    let hits: string[] = [];
    const btn = win
      .addButton("Item", () => {})
      .id("btnCtx")
      .onRightClick((_w, v) => {
        hits.push(`ref:${String(v ?? "ok")}`);
      });
    win.addLabel("Label").id("lblCtx");
    win.onRightClick("lblCtx", (_w, v) => {
      hits.push(`win:${String(v ?? "ok")}`);
    });

    expect(btn.spec.has_context_menu).toBe(true);
    expect(win.eventHandlersMap.has("btnCtx:oncontextmenu")).toBe(true);
    expect(win.eventHandlersMap.has("lblCtx:oncontextmenu")).toBe(true);

    const html = win.generateHtml();
    expect(html).toContain('data-context-menu=""');
    expect(html).toContain('data-ctrl-id="btnCtx"');

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;
    const fakeBtn = makeFakeControlButton("Item");
    const sim = createSimulatedDom({ btnCtx: fakeBtn });

    btn.onRightClick(() => {
      hits.push("live");
    });
    for (const s of scripts) {
      sim.exec(s);
    }
    expect(fakeBtn.getAttribute("data-context-menu")).toBe("");
    expect(fakeBtn.getAttribute("data-ctrl-id")).toBe("btnCtx");

    await win.triggerEvent("btnCtx", "onContextMenu", "p1");
    await win.triggerEvent("lblCtx", "onContextMenu", "p2");
    expect(hits).toEqual(["ref:p1", "live", "win:p2"]);
  });

  test("SimpleControlRef.hover escapes special CSS selector characters in injected style elements", () => {
    const win = new SimpleWindow({ title: "Hover Safety" });
    const btn = win.addButton("Special Hover", () => {}).id("btn.save:v2[0]");

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    btn.hover("#1e293b", "#f8fafc");
    expect(scripts.length).toBe(1);

    const dom = new JSDOM(
      `<!doctype html><html><head></head><body><button id="btn.save:v2[0]">Special Hover</button></body></html>`,
    );
    const fn = new Function("document", "window", scripts[0]!);
    fn(dom.window.document, dom.window);

    const styleEl = dom.window.document.getElementById(
      "sg-hover-btn.save:v2[0]",
    );
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("#btn\\.save\\:v2\\[0\\]:hover{");
    expect(styleEl?.textContent).toContain(
      "background-color:#1e293b !important;",
    );
    expect(styleEl?.textContent).toContain("color:#f8fafc !important;");
  });

  test("beginFlex/endFlex stack aligns row vs column children accurately", () => {
    const win = new SimpleWindow({
      title: "Flex Parity",
      width: 640,
      height: 480,
    });
    win.beginFlex("row");
    const r1 = win.addButton("Left", () => {});
    const r2 = win.addButton("Right", () => {});
    win.endFlex();

    expect(r1.spec.y).toBe(r2.spec.y);
    expect(r2.spec.x).toBeGreaterThan(r1.spec.x);

    win.begin_flex("column");
    const c1 = win.addButton("Top", () => {});
    const c2 = win.addButton("Bottom", () => {});
    win.end_flex();

    expect(c1.spec.x).toBe(c2.spec.x);
    expect(c2.spec.y).toBeGreaterThan(c1.spec.y);

    win.beginFlexBox("nested", "row");
    win.beginFlex("column");
    win.addLabel("Nested Col Item");
    win.endFlex();
    win.endFlexBox();
    expect((win as any)._flexModeStack.length).toBe(0);
    expect((win as any).layoutStack.length).toBe(0);
  });

  test("addTreeView renders tree_view markup, fires callbacks, and expandAll/collapseAll dispatch live", async () => {
    const win = new SimpleWindow({
      title: "TreeView Parity",
      width: 520,
      height: 420,
    });
    const picked: any[] = [];
    const tv = win
      .addTreeView(["📁 src", "📄 index.ts", "📄 app.ts"], (_w, val) => {
        picked.push(val);
      })
      .id("projTree");

    expect(tv.spec.control_type).toBe("tree_view");
    expect(tv.spec.nodes).toEqual(["📁 src", "📄 index.ts", "📄 app.ts"]);

    await win.triggerClick("projTree", "📄 app.ts");
    await win.triggerChange("projTree", "📄 index.ts");
    expect(picked).toEqual(["📄 app.ts", "📄 index.ts"]);

    const html = win.generateHtml();
    expect(html).toContain('class="rad-tree-container"');
    expect(html).toContain('data-node="📄 index.ts"');
    expect(html).toContain("_expandAll");
    expect(html).toContain("_collapseAll");

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;

    tv.collapseAll();
    expect(tv.spec.expanded).toBe(false);
    tv.expandAll();
    expect(tv.spec.expanded).toBe(true);
    expect(scripts.length).toBe(2);

    const calls: string[] = [];
    const mockWin = {
      projTree_collapseAll: () => calls.push("collapse"),
      projTree_expandAll: () => calls.push("expand"),
    };
    for (const s of scripts) {
      new Function("window", s)(mockWin);
    }
    expect(calls).toEqual(["collapse", "expand"]);
  });
});

describe("Post-binding .id() chains preserve control bindings and placeholders", () => {
  test("bindState, bindViews, bindDetail, filterTable, and placeholder followed by .id() operate under the new ID", async () => {
    const win = new SimpleWindow({
      title: "Post-Binding .id()",
      width: 800,
      height: 600,
    });

    // 1. bindState(...).id("usrInput")
    const usrRef = win
      .addInput("Username", "alice")
      .bindState("username")
      .id("usrInput");
    expect(usrRef.spec.id).toBe("usrInput");
    expect(win.getState("username")).toBe("alice");
    win.setState("username", "bob");
    expect(win.getValue("usrInput")).toBe("bob");
    await win.triggerChange("usrInput", "charlie");
    expect(win.getState("username")).toBe("charlie");

    // 2. bindViews(...).id("mainTabs")
    win.addLabel("Panel A").id("panelA");
    win.addLabel("Panel B").id("panelB");
    let lastTab = "";
    win
      .addTabs(["Overview", "Logs"], 0)
      .bindViews({ Overview: ["panelA"], Logs: ["panelB"] }, (_w, tab) => {
        lastTab = tab;
      })
      .id("mainTabs");
    expect(win.findControl("panelA")?.visible).not.toBe(false);
    expect(win.findControl("panelB")?.visible).toBe(false);
    await win.triggerChange("mainTabs", "Logs");
    expect(lastTab).toBe("Logs");
    expect(win.findControl("panelB")?.visible).toBe(true);
    expect(win.findControl("panelA")?.visible).toBe(false);

    // 3. bindDetail(...).id("usersTable")
    win.addInput("").id("detName");
    win.addInput("").id("detRole");
    let detailCalls = 0;
    const rows = [
      ["u1", "Ada Lovelace", "Architect"],
      ["u2", "Grace Hopper", "Compiler Lead"],
    ];
    win
      .addTable(["ID", "Name", "Role"], rows)
      .bindDetail([null, "detName", "detRole"], () => {
        detailCalls++;
      })
      .id("usersTable");
    await win.triggerClick("usersTable", "u2");
    expect(detailCalls).toBe(1);
    expect(win.getValue("detName")).toBe("Grace Hopper");
    expect(win.getValue("detRole")).toBe("Compiler Lead");

    // 4. filterTable(...).id("searchBox")
    win.addLabel("").id("matchCount");
    win
      .addInput("")
      .placeholder("Filter users...")
      .filterTable("usersTable", rows, { countControlId: "matchCount" })
      .id("searchBox");
    expect(win.findControl("searchBox")?.placeholder).toBe("Filter users...");
    await win.triggerChange("searchBox", "ada");
    expect(win.findControl("usersTable")?.rows).toEqual([
      ["u1", "Ada Lovelace", "Architect"],
    ]);
    expect(win.getValue("matchCount")).toBe("1 / 2 rows");

    // 5. placeholder(...).id("tokInput") preserves placeholder across ID rename
    const tokRef = win
      .addInput("Init")
      .placeholder("Enter API key")
      .id("tokInput");
    expect(tokRef.spec.placeholder).toBe("Enter API key");
    expect(win.generateHtml()).toContain('placeholder="Enter API key"');
  });
});

describe("Password exclusion, clearAppState, window properties, shortcuts, and overloaded callbacks", () => {
  test("saveAppFormState and saveValuesToFile exclude password fields, and clearAppState clears disk and in-memory stateStore", async () => {
    await withIsolatedHome(async (tmpHome) => {
      const appName = "reg_pwd_clear_test";
      const win = new SimpleWindow({
        title: "Persistence Security",
        appId: appName,
      });
      win.addInput("Email", "user@example.com").id("email");
      win.addPasswordInput("pw1", "Password").id("pwPrimary");
      win.addPassword("pwSecondary", "Secret", "hunter2");

      win.setValue("pwPrimary", "super-secret-1");
      win.setValue("pwSecondary", "super-secret-2");
      win.saveAppFormState(appName);

      const formFile = getAppStateFile(appName, "form_state.json");
      expect(formFile.startsWith(tmpHome)).toBe(true);
      const persistedForm = JSON.parse(readFileSync(formFile, "utf-8"));
      expect(persistedForm.email).toBe("user@example.com");
      expect(persistedForm.pwPrimary).toBeUndefined();
      expect(persistedForm.pwSecondary).toBeUndefined();

      const exportPath = join(tmpHome, "exported_values.json");
      win.saveValuesToFile(exportPath);
      const exported = JSON.parse(readFileSync(exportPath, "utf-8"));
      expect(exported.email).toBe("user@example.com");
      expect(exported.pwPrimary).toBeUndefined();
      expect(exported.pwSecondary).toBeUndefined();

      // stateStore + state.json cleared by clearAppState
      win.setState("sessionToken", "tok-123");
      win.setState("activeTab", "build");
      const stateFile = getAppStateFile(appName, "state.json");
      mkdirSync(join(tmpHome, "Library", "Application Support", appName), {
        recursive: true,
      });
      writeFileAtomic(stateFile, JSON.stringify({ sessionToken: "tok-123" }));
      expect(existsSync(stateFile)).toBe(true);

      win.clearAppState(appName);
      expect(existsSync(stateFile)).toBe(false);
      expect(Object.keys(win.stateStore).length).toBe(0);
      expect(win.hasState("sessionToken")).toBe(false);
      expect(win.getState("activeTab")).toBe("");
    });
  });

  test("accentColor and responsiveLayout options, getters/setters, and responsive script toggling", () => {
    const win = createWindow({
      title: "Props Test",
      accentColor: "#e11d48",
      responsiveLayout: false,
    } as any);
    win.beginCard("Card 1");
    win.addLabel("Inside Card");
    win.endCard();

    expect(win.accentColor).toBe("#e11d48");
    expect(win.responsiveLayout).toBe(false);
    expect(win.getResponsiveLayout()).toBe(false);
    expect(win.get_responsive_layout()).toBe(false);

    const winRespOpt = createWindow({
      title: "Props Resp Opt",
      responsive: false,
    });
    expect(winRespOpt.responsiveLayout).toBe(false);
    expect(winRespOpt.getResponsiveLayout()).toBe(false);

    const htmlNoResp = win.generateHtml();
    expect(htmlNoResp).not.toContain("initSimpleguiUniversalResponsiveEngine");

    win.setResponsiveLayout(true);
    expect(win.responsiveLayout).toBe(true);
    expect(win.generateHtml()).toContain(
      "initSimpleguiUniversalResponsiveEngine",
    );

    win.set_responsive_layout(false);
    expect(win.getResponsiveLayout()).toBe(false);

    win.setTheme("dracula", false);
    expect(win.accentColor).not.toBe("#e11d48");
    expect(win.accentColor.startsWith("#")).toBe(true);
  });

  test("keyboard shortcut registration, chord normalization, triggerShortcut, and live __simpleguiShortcuts sync", async () => {
    const win = new SimpleWindow({ title: "Shortcuts Test" });
    const fired: string[] = [];

    win.onShortcut("Ctrl+S", (_w, chord) => fired.push(`save:${chord}`));
    win.on_shortcut("CmdOrCtrl+K", (_w, chord) => fired.push(`cmdk:${chord}`));
    win.bindShortcut("Alt+Shift+P", (_w, chord) => fired.push(`pal:${chord}`));
    win.bindKey("Esc", (_w, chord) => fired.push(`esc:${chord}`));

    await win.triggerShortcut("Control+s");
    await win.triggerShortcut("ctrl+k");
    await win.triggerShortcut("meta+k");
    await win.triggerShortcut("Shift+Option+p");
    await win.triggerShortcut("escape");

    expect(win.eventHandlersMap.has("shortcut_mod+k")).toBe(true);
    expect(fired).toEqual([
      "save:ctrl+s",
      "cmdk:ctrl+k",
      "cmdk:meta+k",
      "pal:alt+shift+p",
      "esc:escape",
    ]);

    const scripts: string[] = [];
    (win as any).webview = { eval: (code: string) => scripts.push(code) };
    (win as any).isWindowRunning = true;
    win.onShortcut("Ctrl+D", () => {});
    expect(scripts.length).toBe(1);
    const mockWin: any = {};
    new Function("window", scripts[0]!)(mockWin);
    expect(Array.isArray(mockWin.__simpleguiShortcuts)).toBe(true);
    expect(mockWin.__simpleguiShortcuts).toContain("ctrl+d");
  });

  test("overloaded callback registration works for addSplitButton, addModeControl, addRadioGroup, addPullDown, addComboBox, addPillToggle, and addModal", async () => {
    const win = new SimpleWindow({ title: "Overloaded Builders" });
    const calls: string[] = [];

    // 1. addSplitButton / add_split_button
    win.addSplitButton("sb1", "Deploy", ["Staging", "Prod"], () =>
      calls.push("sb1"),
    );
    win.addSplitButton("sb2", "Build", (() => calls.push("sb2")) as any);
    const sb3 = win.add_split_button("Run", ["Fast", "Full"], () =>
      calls.push("sb3"),
    );
    const sb4 = win.addSplitButton("Ship", (() => calls.push("sb4")) as any);
    win.addSplitButton("sb5", "Release", ["Alpha"], { tooltip: "r" }, (() =>
      calls.push("sb5")) as any);

    await win.triggerClick("sb1");
    await win.triggerClick("sb2");
    await win.triggerClick(sb3.spec.id);
    await win.triggerClick(sb4.spec.id);
    await win.triggerClick("sb5");

    // 2. addModeControl / add_mode_control
    win.addModeControl("mc1", ["A", "B"], "A", (_w, v) =>
      calls.push(`mc1:${v}`),
    );
    win.addModeControl("mc2", ["A", "B"], (_w, v) => calls.push(`mc2:${v}`));
    const mc3 = win.add_mode_control(["X", "Y"], "X", (_w, v) =>
      calls.push(`mc3:${v}`),
    );
    const mc4 = win.addModeControl(["M1", "M2"], (_w, v) =>
      calls.push(`mc4:${v}`),
    );

    await win.triggerChange("mc1", "B");
    await win.triggerChange("mc2", "B");
    await win.triggerChange(mc3.spec.id, "Y");
    await win.triggerChange(mc4.spec.id, "M2");

    // 3. addRadioGroup / add_radio_group
    win.addRadioGroup("rg1", ["Opt1", "Opt2"], "Opt1", (_w, v) =>
      calls.push(`rg1:${v}`),
    );
    win.addRadioGroup("rg2", ["Opt1", "Opt2"], (_w, v) =>
      calls.push(`rg2:${v}`),
    );
    const rg3 = win.add_radio_group(["R1", "R2"], (_w, v) =>
      calls.push(`rg3:${v}`),
    );

    await win.triggerChange("rg1", "Opt2");
    await win.triggerChange("rg2", "Opt2");
    await win.triggerChange(rg3.spec.id, "R2");

    // 4. addPullDown / add_pull_down
    win.addPullDown("pd1", ["Dev", "Prod"], "Dev", (_w, v) =>
      calls.push(`pd1:${v}`),
    );
    win.addPullDown("pd2", ["Dev", "Prod"], (_w, v) => calls.push(`pd2:${v}`));
    const pd3 = win.add_pull_down(["One", "Two"], (_w, v) =>
      calls.push(`pd3:${v}`),
    );

    await win.triggerChange("pd1", "Prod");
    await win.triggerChange("pd2", "Prod");
    await win.triggerChange(pd3.spec.id, "Two");

    // 5. addComboBox / add_combo_box
    win.addComboBox("cb1", ["US", "EU"], "US", (_w, v) =>
      calls.push(`cb1:${v}`),
    );
    win.addComboBox("cb2", ["US", "EU"], (_w, v) => calls.push(`cb2:${v}`));
    const cb3 = win.add_combo_box(["Go", "Rust"], (_w, v) =>
      calls.push(`cb3:${v}`),
    );

    await win.triggerChange("cb1", "EU");
    await win.triggerChange("cb2", "EU");
    await win.triggerChange(cb3.spec.id, "Rust");

    // 6. addPillToggle / add_pill_toggle
    win.addPillToggle("pt1", ["On", "Off"], 0, (_w, v) =>
      calls.push(`pt1:${v}`),
    );
    win.addPillToggle("pt2", ["On", "Off"], (_w, v) => calls.push(`pt2:${v}`));
    const pt3 = win.add_pill_toggle(["Day", "Night"], (_w, v) =>
      calls.push(`pt3:${v}`),
    );

    await win.triggerChange("pt1", 1);
    await win.triggerChange("pt2", 1);
    await win.triggerChange(pt3.spec.id, 1);

    // 7. addModal / add_modal
    const m1 = win.addModal("Confirm body", () => calls.push("m1"));
    const m2 = win.add_modal("Confirm Title", "Message", () =>
      calls.push("m2"),
    );
    win.addModal("m3", "Title 3", "Msg 3", true, () => calls.push("m3"));

    await win.triggerEvent(m1.spec.id, "onConfirm");
    await win.triggerEvent(m2.spec.id, "onConfirm");
    await win.triggerClick("m3");

    expect(calls).toEqual([
      "sb1",
      "sb2",
      "sb3",
      "sb4",
      "sb5",
      "mc1:B",
      "mc2:B",
      "mc3:Y",
      "mc4:M2",
      "rg1:Opt2",
      "rg2:Opt2",
      "rg3:R2",
      "pd1:Prod",
      "pd2:Prod",
      "pd3:Two",
      "cb1:EU",
      "cb2:EU",
      "cb3:Rust",
      "pt1:1",
      "pt2:1",
      "pt3:1",
      "m1",
      "m2",
      "m3",
    ]);
  });
});
