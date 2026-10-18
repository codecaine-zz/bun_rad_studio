import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Dev tab, run for real in a fake browser (jsdom) against the real server. The terminal (which needs a real shell
// and the xterm library) is replaced by a recorder, the Code tab by a recorder of what it was asked to open, and the
// clipboard operation is intercepted so the real clipboard is never touched.
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const typedInTerminal: string[] = [];
const copied: string[] = [];
const codeOpened: any[] = [];

const root = mkdtempSync(join(tmpdir(), "fm-dev-ui-"));
const home = join(root, "home");
const work = join(home, "proj");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let power: any;
let state: any;
let api: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pane = () => doc.getElementById("power-pane-dev")!;
const panel = (): any => pane().querySelector(".dev-panel:not([hidden])");
const buttons = (): any[] => [...panel().querySelectorAll("button")];
const button = (text: string): any => buttons().find((b) => b.textContent.trim() === text || b.textContent.trim().startsWith(text));
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
const toasts = (): string[] => [...doc.querySelectorAll("#toasts .toast-text")].map((e: any) => e.textContent);
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
const change = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const click = async (el: any, wait = 50) => {
  el.click();
  await sleep(wait);
};
async function until(check: () => boolean, what: string, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
const openSection = async (id: string) => {
  await click(doc.getElementById(`dev-tab-${id}`), 30);
};
const rows = (table: any): any[] => [...table.querySelectorAll("tbody tr")];
const cell = (tr: any, i: number): string => tr.children[i].textContent.trim();
const statsTable = (): any => panel().querySelector(".dev-results table");
const status = (): string => [...panel().querySelectorAll(".dev-status")].map((e: any) => e.textContent).join(" | ");
const field = (id: string): any => doc.getElementById(id);
const git = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Dev", GIT_AUTHOR_EMAIL: "d@e.f", GIT_COMMITTER_NAME: "Dev", GIT_COMMITTER_EMAIL: "d@e.f" } });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
};

beforeAll(async () => {
  mkdirSync(join(work, "src"), { recursive: true });
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "demo-app", version: "2.0.0", scripts: { dev: "bun run src/a.ts", test: "bun test", "weird;name": "echo no" }, dependencies: { left: "1" }, devDependencies: { typescript: "5" } }));
  writeFileSync(join(work, "bun.lock"), "");
  writeFileSync(join(work, "src", "a.ts"), "// TODO: tidy this\nexport const a = 1;\n\n/* block */\nexport const b = 2;\n");
  writeFileSync(join(work, "src", "b.ts"), "export const c = 3;\n// FIXME later\n");
  writeFileSync(join(work, "src", "c.js"), "var d = 4;\n");
  writeFileSync(join(work, "README.md"), "# demo\n\nsome text\n");
  mkdirSync(join(work, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(work, "node_modules", "pkg", "index.js"), "n".repeat(30_000));
  writeFileSync(join(work, "dup1.txt"), "same content ".repeat(200));
  writeFileSync(join(work, "dup2.txt"), "same content ".repeat(200));
  const repo = join(home, "repo");
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(root, "gitconfig"), "");
  git(repo, ["init", "-q", "-b", "main"]);
  writeFileSync(join(repo, "f.txt"), "1\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "first commit"]);
  git(repo, ["remote", "add", "origin", "https://user:hunter2secret@example.com/x/y.git"]);

  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true,
    typeInTerminal: (text: string) => (typedInTerminal.push(text), true),
    showTerminal() {},
    hideTerminal() {},
    toggleTerminal() {},
    wireTerminal() {},
    isTerminalOpen: () => false,
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return new Response(JSON.stringify({ ok: true, copied: true }), { headers: { "Content-Type": "application/json" } });
      }
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true,
    writable: true,
  });
  doc = dom.window.document;
  win = dom.window;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  power = await import("../resources/file_manager/ui/power.js");
  (await import("../resources/file_manager/ui/devCore.js")).setPollInterval(40);
  (await import("../resources/file_manager/ui/devActions.js")).setCodeOpener((path: string, line: number) => codeOpened.push({ open: path, line }));
  await import("../resources/file_manager/ui/dev.js");
  state.home = home;
  state.sep = process.platform === "win32" ? "\\" : "/";
  state.location = { kind: "folder", path: work };
  state.settings = (await api.call("settings")).settings;
  power.wirePower();
  power.openPower("dev");
  await sleep(100);
});

afterAll(() => {
  power.resetPower();
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the Dev tab in a browser-like page", () => {
  test("the tab is in the strip (with the files tools), starts on the current folder, and every control is labeled and explained", () => {
    const tab = doc.getElementById("power-tab-dev");
    expect(tab).toBeTruthy();
    expect(tab.textContent).toContain("Dev");
    expect(tab.getAttribute("title")).toContain("tokei studio");
    expect(power.listPowerTabs().find((t: any) => t.id === "dev")).toMatchObject({ group: "files", label: "Dev" });
    expect(field("dev-root").value).toBe(work);
    const controls = [...pane().querySelectorAll("button, input, select, textarea")];
    expect(controls.length).toBeGreaterThan(10);
    for (const c of controls) {
      expect(c.getAttribute("title") || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect((c as any).labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
    }
    expect(pane().querySelectorAll("[style]").length).toBe(0);
    expect([...pane().querySelectorAll('[role="tab"]')].map((t: any) => t.textContent)).toEqual(["Code stats", "Project", "Git", "Disk & files", "TODO", "Tools", "Versions"]);
    expect(pane().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Code stats");
  });

  test("Code stats: run a scan, see the table (real table markup), totals, chart and which engine counted", async () => {
    await click(button("Count code"), 100);
    await until(() => !!statsTable() && rows(statsTable()).length > 2, "the results");
    const table = statsTable();
    expect([...table.querySelectorAll("thead th")].every((th: any) => th.getAttribute("scope") === "col")).toBe(true);
    expect([...table.querySelectorAll("thead th")].map((th: any) => th.textContent.trim().replace(/[▲▼]/g, "").trim())).toEqual(["Language", "Files", "Code", "Comments", "Blanks", "Lines", "Share of code"]);
    const names = rows(table).filter((r: any) => !r.classList.contains("dev-total")).map((r: any) => cell(r, 0));
    expect(names).toEqual(expect.arrayContaining(["TypeScript", "JavaScript", "Markdown"]));
    const ts = rows(table).find((r: any) => cell(r, 0) === "TypeScript");
    expect([cell(ts, 1), cell(ts, 2), cell(ts, 3), cell(ts, 4)]).toEqual(["2", "3", "3", "1"]);
    expect(ts.querySelector("th[scope=row]")).toBeTruthy();
    const total = table.querySelector(".dev-total");
    expect(cell(total, 0)).toBe("Total");
    expect(cell(total, 1)).toBe("7"); // package.json, three source files, README.md and the two .txt files
    expect(panel().querySelector(".dev-engine-line").textContent).toMatch(/^Counted with (tokei \d|Built-in counter)/);
    expect(panel().querySelectorAll(".dev-cards .dev-card").length).toBe(5);
    const svg = panel().querySelector("svg.dev-share");
    expect(svg).toBeTruthy();
    expect(svg.querySelectorAll("rect").length).toBeGreaterThan(1);
    expect(svg.querySelector("title").textContent).toMatch(/lines of code \(\d/);
    expect(panel().querySelectorAll(".dev-legend li").length).toBeGreaterThan(1);
    expect(panel().querySelector(".dev-legend li").textContent).toMatch(/%/); // not color alone
    expect(panel().querySelectorAll("svg.dev-bar[aria-label]").length).toBeGreaterThan(1);
  });

  test("sorting by a column header and filtering languages", async () => {
    const table = statsTable();
    const head = (label: string) => [...table.querySelectorAll("thead th")].find((th: any) => th.textContent.trim().startsWith(label));
    await click(head("Files").querySelector("button"));
    expect(head("Files").getAttribute("aria-sort")).toBe("descending");
    const files = rows(table).filter((r: any) => !r.classList.contains("dev-total")).map((r: any) => Number(cell(r, 1)));
    expect(files).toEqual([...files].sort((a, b) => b - a));
    await click(head("Files").querySelector("button"));
    expect(head("Files").getAttribute("aria-sort")).toBe("ascending");
    await click(head("Language").querySelector("button"));
    await click(head("Language").querySelector("button"));
    const names = rows(table).filter((r: any) => !r.classList.contains("dev-total")).map((r: any) => cell(r, 0));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    type(field("dev-lang-filter"), "type");
    expect(rows(table).filter((r: any) => !r.classList.contains("dev-total")).map((r: any) => cell(r, 0))).toEqual(["TypeScript"]);
    type(field("dev-lang-filter"), "");
  });

  test("drill-down: press a language to see its files; press a file to select it in the list; double-press opens it in the Code editor", async () => {
    const ts = rows(statsTable()).find((r: any) => cell(r, 0) === "TypeScript");
    await click(ts, 300);
    const filesTable = panel().querySelector(".dev-files table");
    await until(() => rows(filesTable).length === 2, "the file list");
    expect(rows(filesTable).map((r: any) => cell(r, 0))).toEqual(["src/a.ts", "src/b.ts"]);
    expect(cell(rows(filesTable)[0], 2)).toBe("2"); // code lines of a.ts
    expect(panel().querySelector(".dev-files h3").textContent).toBe("TypeScript files");
    await click(filesTable.querySelector("thead th:nth-child(1) button"), 200);
    expect(rows(filesTable).map((r: any) => cell(r, 0))).toEqual(["src/b.ts", "src/a.ts"]);
    await click(rows(filesTable)[1], 400);
    expect(state.location.path).toBe(join(work, "src"));
    expect(state.selection.has(join(work, "src", "a.ts"))).toBe(true);
    rows(filesTable)[1].dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    expect(codeOpened.at(-1)).toMatchObject({ open: join(work, "src", "a.ts"), line: 1 });
    type(field("dev-files-filter"), "b.ts");
    await sleep(500);
    expect(rows(panel().querySelector(".dev-files table")).map((r: any) => cell(r, 0))).toEqual(["src/b.ts"]);
    type(field("dev-files-filter"), "");
    change(field("dev-files-lang"), "");
    await until(() => rows(panel().querySelector(".dev-files table")).length === Number(cell(statsTable().querySelector(".dev-total"), 1)), "all files");
    state.location = { kind: "folder", path: work };
  });

  test("export: copy as CSV, JSON and Markdown; save to the folder without overwriting", async () => {
    change(field("dev-export-format"), "csv");
    await click(button("Copy"), 300);
    expect(copied.at(-1)).toContain("Language,Files,Code,Comments,Blanks,Lines,Code %");
    expect(copied.at(-1)).toContain("TypeScript,2,3,3,1,7,");
    change(field("dev-export-format"), "md");
    await click(button("Copy"), 300);
    expect(copied.at(-1)).toMatch(/^\| Language \| Files \|/);
    change(field("dev-export-format"), "json");
    change(field("dev-export-scope"), "files");
    await click(button("Copy"), 300);
    expect(JSON.parse(copied.at(-1)!).rows.length).toBe(Number(cell(statsTable().querySelector(".dev-total"), 1)));
    change(field("dev-export-scope"), "languages");
    change(field("dev-export-format"), "csv");
    await click(button("Save to folder"), 400);
    const first = readdirSync(work).filter((f) => f.startsWith("Code-statistics-"));
    expect(first.length).toBe(1);
    writeFileSync(join(work, first[0]!), "KEEP ME");
    await click(button("Save to folder"), 400);
    const both = readdirSync(work).filter((f) => f.startsWith("Code-statistics-")).sort();
    expect(both.length).toBe(2);
    expect(readFileSync(join(work, first[0]!), "utf8")).toBe("KEEP ME");
    for (const f of both) rmSync(join(work, f));
  });

  test("snapshots: save one, change the code, count again, and see the plus and minus per language", async () => {
    type(field("dev-snap-name"), "before");
    await click(button("Save snapshot"), 300);
    expect(field("dev-snap-list").options.length).toBe(1);
    expect(field("dev-snap-list").options[0].textContent).toContain("before");
    expect(status()).toContain("Snapshot “before” saved");
    writeFileSync(join(work, "src", "d.ts"), "export const e = 5;\nexport const f = 6;\n");
    writeFileSync(join(work, "src", "e.py"), "x = 1\n");
    await click(button("Count code"), 100);
    await until(() => !!statsTable() && rows(statsTable()).some((r: any) => cell(r, 0) === "Python"), "the new count");
    await click(button("Compare"), 300);
    const diff = panel().querySelector(".dev-diff-table");
    expect(diff.closest(".dev-diff").hidden).toBe(false);
    const row = (name: string) => rows(diff).find((r: any) => cell(r, 0) === name);
    expect(cell(row("TypeScript"), 1)).toBe("● changed");
    expect(cell(row("TypeScript"), 5)).toBe("+2");
    expect(cell(row("Python"), 1)).toContain("new language");
    expect(cell(row("Python"), 5)).toBe("+1");
    expect(cell(rows(diff).at(-1), 5)).toBe("+3");
    expect(status()).toContain("code +3 lines");
    rmSync(join(work, "src", "d.ts"));
    rmSync(join(work, "src", "e.py"));
    await click(button("Delete snapshot"), 50);
    expect(dialogButton("Delete snapshot")).toBeTruthy();
    await click(dialogButton("Cancel"), 50);
    expect(field("dev-snap-list").options[0].textContent).toContain("before");
    await click(button("Delete snapshot"), 50);
    await click(dialogButton("Delete snapshot"), 300);
    expect(field("dev-snap-list").options[0].textContent).toBe("No snapshots yet");
  });

  test("the engine line, the install hint and the switch button", async () => {
    await click(button("Count code"), 100);
    await until(() => /^Counted with/.test(panel().querySelector(".dev-engine-line").textContent), "a count");
    const meta = (await api.call("dev/meta")).tokei;
    const sw = [...panel().querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Count again with"));
    expect(sw.hidden).toBe(false);
    if (meta.installed) {
      expect(panel().querySelector(".dev-engine-line").textContent).toContain("tokei");
      await click(sw, 100);
      await until(() => panel().querySelector(".dev-engine-line").textContent.includes("Built-in counter"), "the built-in count");
      expect(panel().querySelector(".dev-note").textContent).not.toContain("brew install");
      const back = [...panel().querySelectorAll("button")].find((b: any) => b.textContent === "Count again with tokei");
      await click(back, 100);
      await until(() => /Counted with tokei \d/.test(panel().querySelector(".dev-engine-line").textContent), "the tokei count");
    } else {
      expect(panel().querySelector(".dev-note").textContent).toContain("brew install tokei");
      expect(sw.disabled).toBe(true);
    }
    change(field("dev-engine"), "builtin");
    await click(button("Count code"), 100);
    await until(() => panel().querySelector(".dev-engine-line").textContent.includes("Built-in counter"), "forced built-in");
  });

  test("Project: summary cards, the scripts, and Run in terminal asks first and types the command", async () => {
    await openSection("project");
    await click(button("Read project"), 300);
    await until(() => !!panel().querySelector(".dev-proj-node"), "the project card");
    const card = panel().querySelector(".dev-proj-node");
    expect(card.querySelector("h3").textContent).toContain("Node / Bun");
    expect(card.querySelector("dl").textContent).toContain("demo-app 2.0.0");
    expect(card.querySelector("dl").textContent).toContain("bun");
    const scripts = [...card.querySelectorAll(".dev-script")];
    expect(scripts.map((s: any) => s.querySelector(".dev-script-name").textContent)).toEqual(["dev", "test", "weird;name"]);
    expect(scripts[2].querySelector("button")).toBeNull(); // an unusual name is never put into a command
    const run = scripts[0].querySelector("button");
    expect(run.textContent).toContain("Run in terminal");
    expect(run.getAttribute("title")).toContain("bun run dev");
    await click(run, 100);
    expect(typedInTerminal).toEqual([]); // nothing is typed before the person agrees
    expect(doc.querySelector(".modal-backdrop").textContent).toContain(`cd -- '${work}' && bun run dev`);
    await click(dialogButton("Cancel"), 50);
    expect(typedInTerminal).toEqual([]);
    await click(scripts[1].querySelector("button"), 100);
    await click(dialogButton("Run it"), 100);
    expect(typedInTerminal).toEqual([`cd -- '${work}' && bun run test\r`]);
    expect(panel().querySelector(".dev-proj-files")).toBeTruthy();
  });

  test("Git: a summary of a real repository, with the remote's password removed", async () => {
    await openSection("git");
    change(field("dev-root"), join(home, "repo"));
    await sleep(200);
    await click(button("Read Git history"), 400);
    await until(() => !!panel().querySelector(".dev-spark"), "the Git summary");
    const text = panel().textContent;
    expect(text).toContain("main");
    expect(text).toContain("first commit");
    expect(text).toContain("https://example.com/x/y.git");
    expect(text).not.toContain("hunter2secret");
    expect(panel().querySelectorAll(".dev-spark-bar").length).toBe(12);
    expect(panel().querySelector(".dev-spark").getAttribute("aria-label")).toMatch(/1 commit in the last 12 months/);
    change(field("dev-root"), work);
    await sleep(200);
    await click(button("Read Git history"), 300);
    await until(() => panel().textContent.includes("isn't inside a Git repository"), "the not-a-repo message");
  });

  test("Disk & files: where the space goes, and moving a heavy folder to the Recycle Bin asks first", async () => {
    await openSection("disk");
    await click(button("Scan disk usage"), 100);
    await until(() => !!panel().querySelector('[aria-label="Heavy folders"] table'), "the disk report");
    const top = panel().querySelector('[aria-label="By top-level entry"] table');
    expect(rows(top).map((r: any) => cell(r, 0))[0]).toBe("node_modules/");
    expect(top.querySelectorAll("svg.dev-bar").length).toBeGreaterThan(2);
    const heavy = panel().querySelector('[aria-label="Heavy folders"] table');
    expect(rows(heavy).map((r: any) => cell(r, 0))).toEqual(["node_modules/"]);
    const move = rows(heavy)[0].querySelector("button");
    expect(move.textContent).toContain("Move to Recycle Bin");
    await click(move, 100);
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("Recycle Bin");
    expect(doc.querySelector(".modal-backdrop").textContent).toContain(join(work, "node_modules"));
    await click(dialogButton("Cancel"), 100);
    expect(existsSync(join(work, "node_modules", "pkg", "index.js"))).toBe(true);
    await click(move, 100);
    await click(dialogButton("Move to Recycle Bin"), 600);
    expect(existsSync(join(work, "node_modules"))).toBe(false);
    const bin = await api.call("trash/list");
    expect(bin.items.some((i: any) => i.originalPath === join(work, "node_modules"))).toBe(true); // moved, not deleted for good
    expect(toasts().join(" ")).toContain("Moved 1 folder to the Recycle Bin");
    await until(() => !panel().querySelector('[aria-label="Heavy folders"] table'), "the report to refresh");
  });

  test("Disk & files: duplicate files are grouped, with a button to show each copy", async () => {
    await click(button("Find duplicates"), 100);
    await until(() => !!panel().querySelector(".dev-dupe-group"), "the duplicate groups");
    const group = panel().querySelector(".dev-dupe-group");
    expect(group.querySelector("h4").textContent).toContain("2 identical copies");
    expect([...group.querySelectorAll("li .pw-mono")].map((e: any) => e.textContent)).toEqual(["dup1.txt", "dup2.txt"]);
    await click(group.querySelector("li button"), 400);
    expect(state.selection.has(join(work, "dup1.txt"))).toBe(true);
  });

  test("TODO: markers are grouped by tag and file; pressing one opens the Code editor at that line", async () => {
    await openSection("todo");
    await click(button("Find markers"), 100);
    await until(() => panel().querySelectorAll(".dev-todo-group").length === 2, "the marker groups");
    const groups = [...panel().querySelectorAll(".dev-todo-group")];
    expect(groups.map((g: any) => g.querySelector("summary").textContent)).toEqual(["TODO — 1 marker in 1 file", "FIXME — 1 marker in 1 file"]);
    expect(panel().querySelector('[aria-label="Counts per marker"]').textContent).toContain("TODO: 1");
    const todoRow = rows(groups[0].querySelector("table"))[0];
    expect([cell(todoRow, 0), cell(todoRow, 1), cell(todoRow, 2)]).toEqual(["src/a.ts", "1", "TODO: tidy this"]);
    await click(rows(groups[1].querySelector("table"))[0], 50);
    expect(codeOpened.at(-1)).toMatchObject({ open: join(work, "src", "b.ts"), line: 2 });
    change(panel().querySelector("select"), "md");
    await click(button("Copy"), 300);
    expect(copied.at(-1)).toContain("| Tag | Path | Line | Text |");
    type(field("dev-todo-tags"), "bad tag");
    await click(button("Find markers"), 300);
    expect(status()).toContain("Marker words");
    type(field("dev-todo-tags"), "TODO, FIXME");
  });

  test("Tools: developer programs with versions, or install hints for the missing ones", async () => {
    await openSection("tools");
    await until(() => rows(panel().querySelector("table") ?? doc.createElement("table")).length >= 29, "the tools table", 40000);
    const table = panel().querySelector("table");
    const gitRow = rows(table).find((r: any) => cell(r, 0) === "Git");
    expect(cell(gitRow, 1)).toBe("✓ Installed");
    expect(/\d+\.\d+/.test(cell(gitRow, 2))).toBe(true);
    const states = rows(table).map((r: any) => cell(r, 1));
    expect(states.every((s: string) => /^(✓ Installed|✗ Missing|! Found, not working)$/.test(s))).toBe(true);
    expect(status()).toMatch(/\d+ of \d+ tools found/);
    for (const tr of rows(table).filter((r: any) => cell(r, 1).startsWith("✗"))) expect(cell(tr, 3).length).toBeGreaterThan(3);
  }, 60_000);

  test("Versions: compare, check a range, sort, and a plain message for what isn't a version", async () => {
    await openSection("versions");
    const text = () => panel().textContent;
    type(field("dev-ver-a"), "1.10.0");
    type(field("dev-ver-b"), "1.9.0");
    await click(button("Compare"), 250);
    expect(status()).toContain("1.10.0 is newer than 1.9.0.");
    type(field("dev-ver-b"), "banana");
    await click(button("Compare"), 250);
    expect(status()).toContain("“banana” isn't a version");
    type(field("dev-ver-v"), "2.5.0");
    type(field("dev-ver-r"), ">=2 <3");
    await click(button("Check"), 250);
    expect(status()).toContain("✔ 2.5.0 fits >=2 <3.");
    type(field("dev-ver-r"), "not a range");
    await click(button("Check"), 250);
    expect(status()).toContain("isn't a range I can read");
    type(field("dev-ver-list"), "1.10.0\n1.2.0\nnope\n1.9.3-beta.1\n1.2.0");
    await click(button("Sort"), 250);
    expect(panel().querySelector(".dev-sorted").textContent).toBe("1.2.0\n1.9.3-beta.1\n1.10.0");
    expect(status()).toContain("line 3 “nope”");
    expect(status()).toContain("1 repeated line was counted once");
    field("dev-ver-desc").click();
    await click(button("Sort"), 250);
    expect(panel().querySelector(".dev-sorted").textContent).toBe("1.10.0\n1.9.3-beta.1\n1.2.0");
    expect(text()).toContain("Compare two versions");
    for (const c of panel().querySelectorAll("button, input, textarea")) expect(c.getAttribute("title") || c.getAttribute("aria-label"), c.outerHTML.slice(0, 100)).toBeTruthy();
  });

  test("Versions: a project's required versions against the tools installed here", async () => {
    const pins = join(home, "pins");
    mkdirSync(pins, { recursive: true });
    writeFileSync(join(pins, "package.json"), JSON.stringify({ engines: { node: ">=1.0.0", bun: ">=999.0.0" } }));
    change(field("dev-root"), pins);
    await sleep(200);
    await openSection("versions");
    await click(button("Check this project"), 100);
    await until(() => panel().querySelector("table") !== null || status().includes("✗"), "the requirements table", 30000);
    const table = panel().querySelector("table");
    const bun = rows(table).find((r: any) => cell(r, 0) === "bun");
    expect(cell(bun, 1)).toBe(">=999.0.0");
    expect(cell(bun, 3)).toBe("! Too old");
    expect(status()).toMatch(/need attention/);
    change(field("dev-root"), work);
    await sleep(200);
  }, 60_000);

  test("opening the tab for a folder (what the right-click “Code statistics…” does) fills the folder and runs the count", async () => {
    const sub = join(work, "src");
    power.openPower("dev", { root: sub, section: "stats" });
    await sleep(200);
    expect(field("dev-root").value).toBe(sub);
    expect(pane().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Code stats");
    await until(() => !!statsTable() && cell(statsTable().querySelector(".dev-total"), 1) === "3", "the count of that folder");
    const menuSource = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "contextmenu.js"), "utf8");
    expect(menuSource).toContain('label: "Code statistics…"');
    expect(menuSource).toContain('openPower("dev", { root: e.path, section: "stats" })');
  });

  test("a mistyped folder is explained and nothing runs; keyboard: arrow keys move between the sections", async () => {
    change(field("dev-root"), join(work, "no-such-folder"));
    await sleep(300);
    expect(pane().querySelector(".dev-target .dev-status").textContent).toContain("isn't a folder that exists");
    change(field("dev-root"), work);
    await sleep(200);
    const tab = doc.getElementById("dev-tab-stats");
    await click(tab, 30);
    tab.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(pane().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Project");
    doc.getElementById("dev-tab-project").dispatchEvent(new win.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(pane().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Versions");
    expect(pane().querySelector('[role="tab"][aria-selected="false"]').tabIndex).toBe(-1);
  });
});
