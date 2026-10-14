import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type EditorHooks } from "../src/features/filemanager/fmCore";
import { editorChoices, openInEditor } from "../src/features/filemanager/fmEditor";
import { defaultEditorHooks, editorArguments } from "../src/features/filemanager/fmEditorHooks";
import { FmError, fileUrlToPath, parseTypedPath, pathToFileUrl } from "../src/features/filemanager/fmPaths";
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from "../src/features/filemanager/fmSettings";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-editor-"));
const file = join(root, "a b.txt");
beforeAll(() => {
  mkdirSync(join(root, "dir"), { recursive: true });
  writeFileSync(file, "hello");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A computer with only the given commands installed and the given environment; every start is recorded, never run. */
function fake(installed: string[], env: Record<string, string | undefined> = {}, throws = false) {
  const started: Array<{ path: string; options: Record<string, unknown> }> = [];
  const commands: Array<string | undefined> = [];
  const editor: EditorHooks = {
    which: (name) => (installed.includes(name) ? `/usr/local/bin/${name}` : null),
    env,
    open: (path, { command, ...options }) => {
      if (throws) throw new Error("spawn failed");
      started.push({ path, options });
      commands.push(command);
    },
  };
  return { started, commands, ctx: createContext({ home: root, dataDir: join(root, `data-${Math.random().toString(36).slice(2)}`), editor }) };
}
const failure = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err: any) {
    expect(err).toBeInstanceOf(FmError);
    return { code: err.code as string, message: err.message as string };
  }
  throw new Error("should have failed");
};

describe("Open in editor", () => {
  test("a chosen editor is started with the file, line and column; nothing real is launched", async () => {
    const { ctx, started, commands } = fake(["code", "subl"]);
    const r = await openInEditor(ctx, { path: file, editor: "vscode", line: 12, column: 5 });
    expect(commands).toEqual(["/usr/local/bin/code"]); // the full path where it was found, for editors that aren't on the app's own PATH
    expect(r).toMatchObject({ opened: file, editor: "vscode", via: "code" });
    expect(started).toEqual([{ path: file, options: { editor: "vscode", line: 12, column: 5 } }]);
    await openInEditor(ctx, { path: file, editor: "subl" });
    expect(started[1]!.options).toEqual({ editor: "subl" });
  });

  test("with no editor given, the setting decides", async () => {
    const { ctx, started } = fake(["code", "subl", "webstorm", "idea"]);
    expect((await loadSettings(ctx)).editor).toBe("default");
    await updateSettings(ctx, { editor: "webstorm" });
    await openInEditor(ctx, { path: file });
    expect(started[0]!.options.editor).toBe("webstorm");
    await updateSettings(ctx, { editor: "nonsense" });
    expect((await loadSettings(ctx)).editor).toBe("default"); // a bad value is never stored: it falls back to the default
  });

  test("a missing command is explained in plain words, with how to fix it", async () => {
    const { ctx, started } = fake(["subl"]);
    const e = await failure(() => openInEditor(ctx, { path: file, editor: "vscode" }));
    expect(e.code).toBe("NO_EDITOR");
    expect(e.message).toContain('the "code" command wasn\'t found');
    expect(e.message).toContain("Shell Command");
    expect((await failure(() => openInEditor(ctx, { path: file, editor: "idea" }))).message).toContain("Create Command-line Launcher");
    expect(started).toEqual([]);
  });

  test("Automatic: $EDITOR names a GUI editor that exists, Bun is left to use it", async () => {
    const { ctx, started } = fake(["zed"], { EDITOR: "/opt/zed/bin/zed --wait" });
    const r = await openInEditor(ctx, { path: file, line: 3 });
    expect(r.via).toBe("the editor named in $EDITOR (zed)");
    expect(started).toEqual([{ path: file, options: { line: 3 } }]);
    const v = fake(["code"], { VISUAL: "code", EDITOR: "nano" });
    expect((await openInEditor(v.ctx, { path: file })).via).toContain("(code)");
  });

  test("Automatic without $EDITOR: the first known editor on the PATH, in a fixed order", async () => {
    const both = fake(["idea", "subl"]);
    await openInEditor(both.ctx, { path: file });
    expect(both.started[0]!.options.editor).toBe("subl");
    const code = fake(["code", "subl"]);
    await openInEditor(code.ctx, { path: file });
    expect(code.started[0]!.options.editor).toBe("vscode");
  });

  test("Automatic with nothing installed says what to do; a terminal editor is refused", async () => {
    const none = fake([]);
    const e = await failure(() => openInEditor(none.ctx, { path: file }));
    expect(e.code).toBe("NO_EDITOR");
    expect(e.message).toMatch(/No code editor was found/);
    const vim = fake(["code", "vim"], { EDITOR: "/usr/bin/vim" });
    const t = await failure(() => openInEditor(vim.ctx, { path: file }));
    expect(t.code).toBe("TERMINAL_EDITOR");
    expect(t.message).toContain('"vim"');
    expect(vim.started).toEqual([]);
    // an explicit choice still works with such a $EDITOR
    expect((await openInEditor(vim.ctx, { path: file, editor: "vscode" })).editor).toBe("vscode");
  });

  test("bad input: relative path, folder, missing file, bad line and column, unknown editor", async () => {
    const { ctx, started } = fake(["code"]);
    expect((await failure(() => openInEditor(ctx, { path: "rel/a.txt", editor: "vscode" }))).code).toBe("BAD_PATH");
    expect((await failure(() => openInEditor(ctx, { path: `${file}\0x`, editor: "vscode" }))).code).toBe("BAD_PATH");
    expect((await failure(() => openInEditor(ctx, { path: undefined }))).code).toBe("BAD_PATH");
    expect((await failure(() => openInEditor(ctx, { path: join(root, "dir"), editor: "vscode" }))).code).toBe("IS_FOLDER");
    expect((await failure(() => openInEditor(ctx, { path: join(root, "missing.txt"), editor: "vscode" }))).code).toBe("NOT_FOUND");
    for (const line of [0, -1, 1.5, "x", 1e9]) expect((await failure(() => openInEditor(ctx, { path: file, editor: "vscode", line }))).message, String(line)).toMatch(/whole number from 1/);
    expect((await failure(() => openInEditor(ctx, { path: file, editor: "vscode", column: 4 }))).message).toMatch(/line number as well/);
    expect((await failure(() => openInEditor(ctx, { path: file, editor: "emacs" }))).code).toBe("BAD_REQUEST");
    expect((await failure(() => openInEditor(ctx, { path: file, editor: "vscode; rm -rf /" }))).code).toBe("BAD_REQUEST");
    expect(started).toEqual([]);
  });

  test("a failure to start is reported, not thrown raw", async () => {
    const { ctx } = fake(["code"], {}, true);
    const e = await failure(() => openInEditor(ctx, { path: file, editor: "vscode" }));
    expect(e).toMatchObject({ code: "OPEN_FAILED" });
    expect(e.message).toContain("spawn failed");
  });

  test("the Settings list says which editors can be started here", () => {
    const { ctx } = fake(["code"], { EDITOR: "zed" });
    const choices = editorChoices(ctx);
    expect(choices.map((c) => [c.id, c.available])).toEqual([["default", true], ["vscode", true], ["subl", false], ["webstorm", false], ["idea", false]]);
    expect(choices[0]!.hint).toContain("(now: zed)");
    for (const c of choices) expect(c.hint.length).toBeGreaterThan(20);
  });

  test("the default settings carry an editor choice", () => {
    expect(DEFAULT_SETTINGS.editor).toBe("default");
  });
});

describe("starting the editor itself (no real editor is started here)", () => {
  test("the arguments each editor gets: VS Code --goto, Sublime path:line:col, JetBrains --line/--column", () => {
    expect(editorArguments("vscode", "/a/b.ts", 3, 7)).toEqual(["--goto", "/a/b.ts:3:7"]);
    expect(editorArguments("vscode", "/a/b.ts")).toEqual(["/a/b.ts"]);
    expect(editorArguments("subl", "/a/b.ts", 3)).toEqual(["/a/b.ts:3"]);
    expect(editorArguments("subl", "/a/b.ts", 3, 2)).toEqual(["/a/b.ts:3:2"]);
    expect(editorArguments("idea", "/a/b.ts", 3, 2)).toEqual(["--line", "3", "--column", "2", "/a/b.ts"]);
    expect(editorArguments("webstorm", "/a/b.ts")).toEqual(["/a/b.ts"]);
    expect(editorArguments(undefined, "/a/b c.ts", 1)).toEqual(["/a/b c.ts:1"]); // one argument, never split at spaces
  });

  test("the default lookup only searches the given folders when a tool folder is set, so tests see no real editor", () => {
    const hooks = defaultEditorHooks({ platform: "linux", home: root, toolDirs: [join(root, "empty-bin")] });
    expect(hooks.which("code")).toBeNull();
    expect(hooks.which("subl")).toBeNull();
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "code"), "#!/bin/sh\n", { mode: 0o755 });
    if (process.platform !== "win32") expect(defaultEditorHooks({ platform: "linux", home: root, toolDirs: [join(root, "bin")] }).which("code")).toBe(join(root, "bin", "code"));
  });
});

describe("over HTTP with a stub editor, and file:// addresses", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  const opened: string[] = [];
  let base = "";
  beforeAll(() => {
    server = startFileManagerServer({
      port: 0, token: "ed-token",
      context: { home: root, dataDir: join(root, "http-data"), editor: { which: () => "/bin/stub", env: {}, open: (p, { command: _c, ...o }) => void opened.push(`${p}|${JSON.stringify(o)}`) } },
    });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  const api = async (op: string, body: unknown = {}) => {
    const r = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": "ed-token" }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as any };
  };

  test("the operations are registered and need the token", async () => {
    for (const op of ["editor/info", "editor/open", "fileurl/make"]) expect(API_OPERATIONS).toContain(op);
    const noToken = await fetch(`${base}/api/editor/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: file }) });
    expect(noToken.status).toBe(401);
  });

  test("open and info", async () => {
    const r = await api("editor/open", { path: file, editor: "vscode", line: 7 });
    expect(r.status).toBe(200);
    expect(r.json.editor).toBe("vscode");
    expect(opened).toEqual([`${file}|{"editor":"vscode","line":7}`]);
    expect((await api("editor/info")).json.choices.length).toBe(5);
    expect((await api("editor/open", { path: file, editor: "nope" })).json.error.code).toBe("BAD_REQUEST");
    const set = await api("settings", { set: { editor: "subl" } });
    expect(set.json.settings.editor).toBe("subl");
  });

  test("file:// addresses are made with Bun.pathToFileURL: spaces, # and ? are escaped, paths are written out in full", async () => {
    const r = await api("fileurl/make", { paths: [file, "/a/b#c?d e/", "/é ü/日本.txt"] });
    expect(r.json.urls).toEqual([`file://${encodeURI(file).replace(/#/g, "%23")}`, "file:///a/b%23c%3Fd%20e", "file:///%C3%A9%20%C3%BC/%E6%97%A5%E6%9C%AC.txt"].map((u, i) => (i === 0 ? pathToFileUrl(file) : u)));
    expect(r.json.urls[0]).toContain("a%20b.txt");
    expect((await api("fileurl/make", { paths: [] })).json.error.code).toBe("BAD_REQUEST");
    expect((await api("fileurl/make", { paths: ["relative"] })).json.error.code).toBe("BAD_PATH");
    expect((await api("fileurl/make", { paths: Array.from({ length: 501 }, () => file) })).json.error.code).toBe("BAD_REQUEST");
  });

  test("Go to folder accepts a pasted file:// address, and says what's wrong when it can't", async () => {
    const dir = join(root, "dir");
    const ok = await api("typedpath", { text: pathToFileUrl(dir) });
    expect(ok.json).toMatchObject({ path: dir, exists: true, isDir: true });
    expect((await api("typedpath", { text: `  "${pathToFileUrl(dir)}"  ` })).json.path).toBe(dir);
    const bad = await api("typedpath", { text: "file://some-other-computer/share/x" });
    expect(bad.json.error.message).toMatch(/doesn't point to a place on this computer/);
    expect((await api("typedpath", { text: "file:///a%2Fb" })).json.error.code).toBe("BAD_PATH");
  });
});

describe("file:// addresses in typed paths (all platforms' rules)", () => {
  test("on this computer it is Bun.fileURLToPath", () => {
    const text = "file:///Users/me/My%20Docs/a%23b.txt";
    expect(fileUrlToPath(text, "linux")).toBe("/Users/me/My Docs/a#b.txt");
    expect(fileUrlToPath(text, "darwin")).toBe("/Users/me/My Docs/a#b.txt");
    expect(parseTypedPath("file:///Users/me/My%20Docs", "/x", "/home/sam", "linux")).toBe("/Users/me/My Docs");
    expect(parseTypedPath("FILE:///tmp/x/", "/x", "/home/sam", "darwin")).toBe("/tmp/x");
    expect(parseTypedPath("file://localhost/tmp/x", "/x", "/home/sam", "linux")).toBe("/tmp/x");
  });

  test("not a place on this computer: another host, an encoded slash, a NUL, nonsense", () => {
    for (const bad of ["file://server/share/a", "file:///a%2Fb", "file:///a%00b", "file://"]) expect(parseTypedPath(bad, "/x", "/h", "linux"), bad).toBeNull();
  });

  test("Windows rules: drive letters, UNC shares and backslashes", () => {
    expect(parseTypedPath("file:///C:/Users/me/My%20Docs", "C:\\", "C:\\Users\\me", "win32")).toBe("C:\\Users\\me\\My Docs");
    expect(parseTypedPath("file://server/share/folder", "C:\\", "C:\\Users\\me", "win32")).toBe("\\\\server\\share\\folder");
    expect(parseTypedPath("file://localhost/C:/x", "C:\\", "C:\\Users\\me", "win32")).toBe("C:\\x");
    expect(parseTypedPath("file:///C:/a%5Cb", "C:\\", "C:\\", "win32")).toBeNull();
  });

  test("round trip: any absolute path becomes an address and comes back the same", () => {
    const paths = process.platform === "win32" ? ["C:\\Users\\me\\a b#c.txt"] : ["/a/b c/d#e?f.txt", "/é ü/日本 語.txt", "/with%percent/x", "/plain"];
    for (const p of paths) expect(fileUrlToPath(pathToFileUrl(p))).toBe(p);
  });
});
