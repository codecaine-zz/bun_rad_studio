import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
      throw new Error("Button innerHTML must never be assigned by setValue/setText");
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
    expect(html1).toMatch(/id="chkAgree"[\s\S]*?<input[^>]*type="checkbox"[^>]*checked/);

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
    const dtsPaths = [
      join(ROOT, "dist", "index.d.ts"),
      join(ROOT, "dist", "npm", "index.d.ts"),
    ];

    const ctrlMethods = Object.getOwnPropertyNames(
      SimpleControlRef.prototype,
    ).filter((m) => m !== "constructor" && !m.startsWith("_"));
    const winMethods = Object.getOwnPropertyNames(
      SimpleWindow.prototype,
    ).filter((m) => m !== "constructor" && !m.startsWith("_"));

    for (const dtsPath of dtsPaths) {
      const dts = readFileSync(dtsPath, "utf8");
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
        expect(
          dts.includes(`${m}(`) || dts.includes(`private ${m};`),
        ).toBe(true);
      }
    }

    for (const sgDtsPath of [
      join(ROOT, "dist", "simplegui.d.ts"),
      join(ROOT, "dist", "npm", "simplegui.d.ts"),
    ]) {
      const sgDts = readFileSync(sgDtsPath, "utf8");
      expect(sgDts).toMatch(/export type \{[\s\S]*\bWindowOptions\b[\s\S]*\} from "\.\/index\.js";/);
      expect(sgDts).toMatch(/export \{[\s\S]*\bcreateWindow\b[\s\S]*\} from "\.\/index\.js";/);
    }
  });

  test("tsc --noEmit with strict: true, verbatimModuleSyntax: true, and skipLibCheck: false passes with zero errors", () => {
    const tmp = mkdtempSync(join(tmpdir(), "simplegui-tsc-"));
    try {
      const pkgDir = join(tmp, "node_modules", "bun-rad-studio");
      mkdirSync(pkgDir, { recursive: true });
      for (const file of ["package.json", "index.d.ts", "simplegui.d.ts"]) {
        writeFileSync(
          join(pkgDir, file),
          readFileSync(join(ROOT, "dist", "npm", file), "utf8"),
          "utf8",
        );
      }

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
    expect(newSimpleWindow({ title: "A", width: 400, height: 300 }).fullscreen).toBe(false);
    expect(new_simple_window("B", 400, 300).fullscreen).toBe(false);
    expect(typeof simplegui.SimpleDialogs.prototype.fire).toBe("function");
    expect(typeof w2.dialogs.fire).toBe("function");

    // addInput("Enter username").id("txtUser") promotes first arg to placeholder
    const userRef = w2.addInput("Enter username").id("txtUser");
    expect(userRef.getId()).toBe("txtUser");
    expect(userRef.spec.placeholder).toBe("Enter username");
    expect(w2.generateHtml()).toContain('placeholder="Enter username"');

    const chkRef = w2.addCheckbox("Remember me", false).id("chkRemember");
    const roleRef = w2.addSelect(["Viewer", "Editor", "Admin"], "Editor").id("selRole");

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
    const customBtn = w2.addButton("Custom").id("btnCustom").bg("#ef4444").color("#fef2f2");
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
