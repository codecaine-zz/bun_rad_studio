import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { createContext } from "../src/features/filemanager/fmCore";
import { type OpenWithProgram, buildLaunch, detectPrograms, extensionKey, loadOpenWith, openViaAssociation, runWith, sanitizeOpenWith, saveOpenWith } from "../src/features/filemanager/fmOpenWith";

const root = mkdtempSync(join(tmpdir(), "fm-openwith-"));
const home = join(root, "home");
const data = join(root, "data");
const docs = join(home, "docs");
const launched: Array<{ command: string; args: string[] }> = [];
const TOKEN = "ow-token";
let server: ReturnType<typeof startFileManagerServer>;
let base: string;

const ctxFor = (platform: "darwin" | "linux" | "win32" = "linux") =>
  createContext({ home, dataDir: data, platform, launch: async (command, args) => void launched.push({ command, args }) });

beforeAll(() => {
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, "a.ts"), "x");
  writeFileSync(join(docs, "b.ts"), "y");
  writeFileSync(join(docs, "notes.txt"), "z");
  writeFileSync(join(docs, "noext"), "z");
  server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: data, platform: "linux", launch: async (command, args) => void launched.push({ command, args }) } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

async function api(op: string, body: unknown = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}
const ed: OpenWithProgram = { id: "my-editor", name: "My Editor", kind: "command", target: "myeditor", args: ["--goto"] };

describe("sanitizing what is saved", () => {
  test("keeps good programs and drops broken ones", () => {
    const s = sanitizeOpenWith({
      programs: [ed, { ...ed }, { id: "BAD ID", name: "x", kind: "command", target: "x" }, { id: "no-target", name: "x", kind: "command", target: "" }, { id: "dash", name: "x", kind: "app", target: "-a" }, { id: "builtin-x", name: "x", kind: "command", target: "x" }, { id: "nul", name: "x", kind: "command", target: "a\0b" }, "junk", null],
      associations: { TS: "my-editor", ".md": "builtin:code", txt: "default", gone: "missing", "bad ext!": "default" },
    });
    expect(s.programs.map((p) => p.id)).toEqual(["my-editor"]);
    expect(s.associations).toEqual({ ts: "my-editor", md: "builtin:code", txt: "default" });
  });
  test("caps the number of programs, arguments and their length", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: "command", target: "x", args: Array.from({ length: 40 }, () => "a".repeat(600)).concat(["ok"]) }));
    const s = sanitizeOpenWith({ programs: many });
    expect(s.programs.length).toBe(40);
    expect(s.programs[0]!.args.length).toBeLessThanOrEqual(16);
    expect(sanitizeOpenWith({ programs: [{ ...ed, args: ["a".repeat(600), "fine"] }] }).programs[0]!.args).toEqual(["fine"]);
  });
  test("garbage in, empty state out", () => {
    for (const bad of [null, 5, "x", [], { programs: "x", associations: [] }]) expect(sanitizeOpenWith(bad)).toEqual({ programs: [], associations: {} });
  });
});

describe("remembering", () => {
  test("is saved to disk, survives a new context, and a damaged file is ignored", async () => {
    const ctx = ctxFor();
    await saveOpenWith(ctx, { programs: [ed], associations: { ts: "my-editor" } });
    expect(await loadOpenWith(ctxFor())).toEqual({ programs: [ed], associations: { ts: "my-editor" } });
    writeFileSync(join(data, "file_manager_openwith.json"), "{not json");
    expect(await loadOpenWith(ctxFor())).toEqual({ programs: [], associations: {} });
    await saveOpenWith(ctx, { programs: [ed], associations: {} });
    expect(existsSync(join(data, "file_manager_openwith.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(data, "file_manager_openwith.json"), "utf8")).programs[0].id).toBe("my-editor");
  });
  test("saving at the same moment never corrupts the file", async () => {
    const ctx = ctxFor();
    await Promise.all(Array.from({ length: 12 }, (_, i) => saveOpenWith(ctx, { programs: [{ ...ed, id: `p${i}` }], associations: {} })));
    const s = await loadOpenWith(ctx);
    expect(s.programs.length).toBe(1);
  });
});

describe("launching", () => {
  test("a command gets the files where {} is, or at the end", () => {
    const c = { platform: "linux" as const };
    expect(buildLaunch(c, { ...ed, args: ["--goto", "{}", "--new"] }, ["/a", "/b"])).toEqual({ command: "myeditor", args: ["--goto", "/a", "/b", "--new"] });
    expect(buildLaunch(c, { ...ed, args: ["-w"] }, ["/a"])).toEqual({ command: "myeditor", args: ["-w", "/a"] });
    expect(buildLaunch(c, { ...ed, args: [] }, ["/a"])).toEqual({ command: "myeditor", args: ["/a"] });
  });
  test("file names are single arguments, never a shell line", () => {
    const evil = "/tmp/a; rm -rf ~ $(touch x) `id`.ts";
    expect(buildLaunch({ platform: "linux" }, ed, [evil]).args).toEqual(["--goto", evil]);
  });
  test("a Mac application runs through open -a, and only on a Mac", () => {
    const app = { id: "te", name: "TextEdit", kind: "app" as const, target: "TextEdit", args: [] };
    expect(buildLaunch({ platform: "darwin" }, app, ["/a"])).toEqual({ command: "open", args: ["-a", "TextEdit", "/a"] });
    expect(() => buildLaunch({ platform: "linux" }, app, ["/a"])).toThrow(/Mac application/);
  });
  test("runWith starts the program, checks the files, and explains problems", async () => {
    launched.length = 0;
    const ctx = ctxFor();
    await saveOpenWith(ctx, { programs: [ed], associations: {} });
    const r = await runWith(ctx, [join(docs, "a.ts"), join(docs, "b.ts")], "my-editor");
    expect(r.with).toBe("My Editor");
    expect(launched).toEqual([{ command: "myeditor", args: ["--goto", join(docs, "a.ts"), join(docs, "b.ts")] }]);
    await expect(runWith(ctx, [join(docs, "nope.ts")], "my-editor")).rejects.toThrow(/doesn't exist/);
    await expect(runWith(ctx, [join(docs, "a.ts")], "ghost")).rejects.toThrow(/isn't in your Open with list/);
    await expect(runWith(ctx, [], "my-editor")).rejects.toThrow();
    await expect(runWith(ctx, ["relative/file.ts"], "my-editor")).rejects.toThrow(/full path/);
    await expect(runWith(ctx, Array(21).fill(join(docs, "a.ts")), "my-editor")).rejects.toThrow(/at most 20/);
  });
  test("a program that doesn't exist gives a friendly message", async () => {
    const ctx = createContext({ home, dataDir: data, platform: "linux", launch: async () => { throw Object.assign(new Error("spawn"), { code: "ENOENT" }); } });
    await saveOpenWith(ctx, { programs: [ed], associations: {} });
    await expect(runWith(ctx, [join(docs, "a.ts")], "my-editor")).rejects.toThrow(/Couldn't find "myeditor"/);
  });
  test("a built-in program is handed back to the page", async () => {
    const r = await runWith(ctxFor(), [join(docs, "a.ts")], "builtin:code");
    expect(r.builtin).toBe("code");
    expect(r.with).toContain("built in");
  });
});

describe("the association", () => {
  test("extensionKey", () => {
    expect(extensionKey("a.TS")).toBe("ts");
    expect(extensionKey("archive.tar.gz")).toBe("gz");
    expect(extensionKey(".bashrc")).toBe("");
    expect(extensionKey("noext")).toBe("");
    expect(extensionKey("trailing.")).toBe("");
  });
  test("opening a file uses its chosen program, others use the default", async () => {
    launched.length = 0;
    const ctx = ctxFor();
    await saveOpenWith(ctx, { programs: [ed], associations: { ts: "my-editor", txt: "default" } });
    expect((await openViaAssociation(ctx, join(docs, "a.ts")))?.with).toBe("My Editor");
    expect(await openViaAssociation(ctx, join(docs, "notes.txt"))).toBeNull();
    expect(await openViaAssociation(ctx, join(docs, "noext"))).toBeNull();
    expect(await openViaAssociation(ctx, docs)).toBeNull();
    expect(launched.length).toBe(1);
  });
});

describe("suggestions", () => {
  test("a Mac scan lists .app folders by name", () => {
    const apps = join(root, "Applications");
    mkdirSync(join(apps, "Zed.app"), { recursive: true });
    mkdirSync(join(apps, "Alpha.app"), { recursive: true });
    mkdirSync(join(apps, "not-an-app"), { recursive: true });
    expect(detectPrograms("darwin", home, [apps, join(root, "missing")]).map((s) => s.name)).toEqual(["Alpha", "Zed"]);
  });
  test("other systems only offer programs that are really there", () => {
    for (const s of detectPrograms("linux", home)) expect(Bun.which(s.target)).toBeTruthy();
  });
});

describe("over HTTP", () => {
  test("changing programs needs confirmation, then is remembered and used by Open", async () => {
    launched.length = 0;
    rmSync(join(data, "file_manager_openwith.json"), { force: true });
    const body = { programs: [ed], associations: { ts: "my-editor" } };
    const no = await api("openwith/save", body);
    expect(no.status).toBe(409);
    expect(no.json.error.code).toBe("NEEDS_CONFIRM");
    expect((await api("openwith/list")).json.programs).toEqual([]);

    const yes = await api("openwith/save", { ...body, confirm: true });
    expect(yes.status).toBe(200);
    const list = (await api("openwith/list", { path: join(docs, "a.ts") })).json;
    expect(list.programs[0].id).toBe("my-editor");
    expect(list.ext).toBe("ts");
    expect(list.builtin[0].id).toBe("builtin:code");

    const opened = await api("open", { path: join(docs, "a.ts") });
    expect(opened.json.with).toBe("My Editor");
    expect(launched[0]).toEqual({ command: "myeditor", args: ["--goto", join(docs, "a.ts")] });

    launched.length = 0;
    const bypass = await api("open", { path: join(docs, "a.ts"), ignoreAssociation: true });
    expect(bypass.json.with).toBeUndefined();
    expect(launched[0]!.command).toBe("xdg-open");
  });

  test("the ordinary settings call cannot define programs", async () => {
    await api("settings", { set: { programs: [{ ...ed, id: "sneaky" }], openWith: { programs: [{ ...ed, id: "sneaky" }] } } });
    expect((await api("openwith/list")).json.programs.map((p: any) => p.id)).not.toContain("sneaky");
  });

  test("'always' remembers the choice, and bad requests are refused", async () => {
    launched.length = 0;
    await api("openwith/save", { programs: [ed], associations: {}, confirm: true });
    const r = await api("openwith/run", { paths: [join(docs, "notes.txt")], programId: "my-editor", always: true });
    expect(r.status).toBe(200);
    expect((await api("openwith/list")).json.associations).toEqual({ txt: "my-editor" });
    expect((await api("openwith/run", { paths: [join(docs, "notes.txt")], programId: "ghost" })).status).toBe(400);
    expect((await api("openwith/run", { paths: "x", programId: "my-editor" })).status).toBe(400);
    expect((await api("openwith/run", { paths: ["/etc/\0x"], programId: "my-editor" })).status).toBe(400);
  });
});
