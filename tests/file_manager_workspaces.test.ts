/**
 * Saved project workspaces, through the real server: what is stored, what is refused (secrets), how commands are
 * trusted, missing folders and connections, versioning, and import and export. Temporary folders and a fake keychain.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { dbComputer, type DbComputer } from "./helpers/db_fm";
import { secretIn, workspaceFile, WORKSPACE_FORMAT } from "../src/features/filemanager/fmWorkspaces";

const posix = process.platform !== "win32";
const computers: DbComputer[] = [];
const computer = () => {
  const c = dbComputer();
  computers.push(c);
  return c;
};
afterAll(() => computers.forEach((c) => c.remove()));

const base = (c: DbComputer, extra: Record<string, unknown> = {}) => ({
  name: "Shop site",
  roots: [join(c.dir, "shop")],
  openFolders: [join(c.dir, "shop", "src")],
  view: "split",
  tool: "find",
  search: { pattern: "TODO", mode: "regex", extensions: ["ts", "js"], exclude: ["node_modules"], hidden: false },
  ignore: ["node_modules/", "*.log"],
  commands: [{ label: "Tests", command: "bun test", cwd: join(c.dir, "shop") }],
  tools: ["find", "code"],
  databases: [],
  ...extra,
});

describe("saving and loading", () => {
  test("a workspace is saved in a versioned, owner-only file and listed back", async () => {
    const c = computer();
    mkdirSync(join(c.dir, "shop", "src"), { recursive: true });
    const { workspace } = await c.ok("workspace/save", { workspace: base(c) });
    expect(workspace).toMatchObject({ name: "Shop site", source: "local", view: "split", tool: "find" });
    expect(workspace.commands[0]).toMatchObject({ label: "Tests", command: "bun test", trusted: true });
    const file = JSON.parse(readFileSync(workspaceFile({ dataDir: c.dataDir } as any), "utf8"));
    expect(file.version).toBe(1);
    expect(file.workspaces).toHaveLength(1);
    if (posix) expect(statSync(workspaceFile({ dataDir: c.dataDir } as any)).mode & 0o777).toBe(0o600);
    const list = await c.ok("workspace/list");
    expect(list.workspaces.map((w: any) => w.name)).toEqual(["Shop site"]);
    expect(list.readOnly).toBe(false);
  });

  test("saving again with the same id updates it; names must be unique; deleting works", async () => {
    const c = computer();
    const { workspace } = await c.ok("workspace/save", { workspace: base(c) });
    const again = await c.ok("workspace/save", { workspace: { ...base(c), id: workspace.id, name: "Shop site v2" } });
    expect(again.workspace.id).toBe(workspace.id);
    expect(again.workspace.createdAt).toBe(workspace.createdAt);
    const clash = await c.api("workspace/save", { workspace: base(c, { name: "shop SITE V2" }) });
    expect(clash.status).toBe(400);
    expect(clash.json.error.code).toBe("EXISTS");
    await c.ok("workspace/delete", { id: workspace.id });
    expect((await c.ok("workspace/list")).workspaces).toEqual([]);
    expect((await c.api("workspace/delete", { id: workspace.id })).status).toBe(400);
  });

  test("a workspace with no name, or a relative folder, is refused with a plain message", async () => {
    const c = computer();
    expect((await c.api("workspace/save", { workspace: base(c, { name: " " }) })).json.error.code).toBe("BAD_NAME");
    const relative = await c.api("workspace/save", { workspace: base(c, { roots: ["relative/path"] }) });
    expect(relative.json.error.code).toBe("BAD_PATH");
  });
});

describe("secrets never get in", () => {
  test("the detector knows tokens, URL passwords and secret-looking assignments, and lets variables through", () => {
    expect(secretIn("https://user:hunter2@example.com/repo")).toBeTruthy();
    expect(secretIn("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBeTruthy();
    expect(secretIn("-----BEGIN RSA PRIVATE KEY-----")).toBeTruthy();
    expect(secretIn("deploy --password=hunter2", true)).toMatch(/password/);
    expect(secretIn("API_TOKEN=abc123 run", true)).toMatch(/API_TOKEN/);
    expect(secretIn("deploy --token $MY_TOKEN", true)).toBeNull();
    expect(secretIn("API_TOKEN=$API_TOKEN bun run build", true)).toBeNull();
    expect(secretIn("bun test --coverage", true)).toBeNull();
    expect(secretIn("password", false)).toBeNull();
  });

  test("a command, a name or an ignore rule that holds a secret is refused and nothing is written", async () => {
    const c = computer();
    const bad = [
      base(c, { commands: [{ label: "Deploy", command: "deploy --password=hunter2" }] }),
      base(c, { commands: [{ label: "Clone", command: "git clone https://me:pw123@github.com/x/y.git" }] }),
      base(c, { name: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }),
      base(c, { ignore: ["sk-abcdefghijklmnopqrstuvwxyz"] }),
    ];
    for (const workspace of bad) {
      const r = await c.api("workspace/save", { workspace });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe("SECRET_IN_WORKSPACE");
      expect(r.json.error.message).toMatch(/never store passwords/);
    }
    expect((await c.ok("workspace/list")).workspaces).toEqual([]);
  });

  test("a database is saved as a reference only; the password stays in the keychain", async () => {
    const c = computer();
    const saved = await c.ok("db/profile/save", { profile: { engine: "mysql", name: "shop db", host: "db.example.com", user: "app", database: "shop" }, password: "MARKER-pw-12345" });
    const id = saved.profile.id;
    const { workspace } = await c.ok("workspace/save", {
      workspace: base(c, { databases: [{ id, name: "shop db", engine: "mysql", password: "MARKER-pw-12345", host: "db.example.com", user: "app" }] }),
    });
    expect(workspace.databases).toEqual([{ id, name: "shop db", engine: "mysql" }]);
    expect(readFileSync(workspaceFile({ dataDir: c.dataDir } as any), "utf8")).not.toContain("MARKER-pw-12345");
    expect([...c.keychain.map.values()]).toContain("MARKER-pw-12345");
    const opened = await c.ok("workspace/resolve", { id: workspace.id });
    expect(opened.databases[0]).toMatchObject({ id, status: "ok", currentName: "shop db" });
    await c.ok("db/profile/delete", { id, confirm: true });
    expect((await c.ok("workspace/resolve", { id: workspace.id })).databases[0]).toMatchObject({ status: "missing" });
  });
});

describe("commands and trust", () => {
  test("the server has no way to run a command; an imported command is untrusted until it is trusted after reading it", async () => {
    const c = computer();
    const { workspace } = await c.ok("workspace/save", { workspace: base(c) });
    const exported = await c.ok("workspace/export", { id: workspace.id });
    const file = JSON.parse(exported.text);
    expect(file.format).toBe(WORKSPACE_FORMAT);
    expect(file.workspace.commands).toEqual([{ label: "Tests", command: "bun test", cwd: join(c.dir, "shop") }]);
    expect(file.workspace.id).toBeUndefined();
    expect(exported.fileName).toBe("Shop-site.workspace.json");

    const imported = await c.ok("workspace/import", { text: exported.text });
    expect(imported.workspace).toMatchObject({ name: "Shop site (2)", source: "imported" });
    expect(imported.untrustedCommands).toBe(1);
    expect(imported.workspace.commands[0].trusted).toBe(false);

    const wrong = await c.api("workspace/trust", { id: imported.workspace.id, commandId: imported.workspace.commands[0].id, command: "something else", trusted: true });
    expect(wrong.json.error.code).toBe("CHANGED");
    const trusted = await c.ok("workspace/trust", { id: imported.workspace.id, commandId: imported.workspace.commands[0].id, command: "bun test", trusted: true });
    expect(trusted.workspace.commands[0].trusted).toBe(true);
    const after = (await c.ok("workspace/list")).workspaces.find((w: any) => w.id === imported.workspace.id);
    expect(after.commands[0].trusted).toBe(true);
  });

  test("a file that claims its commands are trusted gets them untrusted anyway", async () => {
    const c = computer();
    const text = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, workspace: { name: "Evil", roots: [], commands: [{ label: "Go", command: "echo hi", trusted: true }] } });
    const r = await c.ok("workspace/import", { text });
    expect(r.workspace.commands[0].trusted).toBe(false);
    expect((await c.ok("workspace/list")).workspaces[0].commands[0].trusted).toBe(false);
  });

  test("editing a trusted command takes its trust away; unchanged commands keep it", async () => {
    const c = computer();
    const { workspace } = await c.ok("workspace/save", { workspace: base(c) });
    const keep = await c.ok("workspace/save", { workspace: { ...base(c), id: workspace.id, commands: workspace.commands } });
    expect(keep.workspace.commands[0].trusted).toBe(true);
    const edited = await c.ok("workspace/save", { workspace: { ...base(c), id: workspace.id, commands: [{ ...workspace.commands[0], command: "rm -rf build", trusted: true }] } });
    expect(edited.workspace.commands[0].trusted).toBe(false);
  });

  test("a multi-line command is refused, so pasting it can never run several steps", async () => {
    const c = computer();
    const r = await c.api("workspace/save", { workspace: base(c, { commands: [{ label: "Two", command: "echo a\necho b" }] }) });
    expect(r.json.error.code).toBe("BAD_COMMAND");
  });

  test("bad imports are explained", async () => {
    const c = computer();
    expect((await c.api("workspace/import", { text: "not json" })).json.error.code).toBe("BAD_FILE");
    expect((await c.api("workspace/import", { text: JSON.stringify({ hello: 1 }) })).json.error.code).toBe("BAD_FILE");
    expect((await c.api("workspace/import", { text: JSON.stringify({ format: WORKSPACE_FORMAT, version: 99, workspace: { name: "x" } }) })).json.error.code).toBe("NEWER_FILE");
    const withSecret = JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, workspace: { name: "x", commands: [{ label: "c", command: "run --token=abc123" }] } });
    expect((await c.api("workspace/import", { text: withSecret })).json.error.code).toBe("SECRET_IN_WORKSPACE");
  });
});

describe("missing things and a damaged or newer file", () => {
  test("missing folders are reported one by one and the rest still resolves", async () => {
    const c = computer();
    mkdirSync(join(c.dir, "here"));
    writeFileSync(join(c.dir, "afile"), "x");
    const { workspace } = await c.ok("workspace/save", { workspace: base(c, { roots: [join(c.dir, "here"), join(c.dir, "gone"), join(c.dir, "afile")], openFolders: [] }) });
    const r = await c.ok("workspace/resolve", { id: workspace.id });
    expect(r.roots.map((x: any) => x.status)).toEqual(["ok", "missing", "not-folder"]);
  });

  test.skipIf(!posix || process.getuid?.() === 0)("a folder you can't read is reported as no access", async () => {
    const c = computer();
    const locked = join(c.dir, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      const { workspace } = await c.ok("workspace/save", { workspace: base(c, { roots: [locked], openFolders: [] }) });
      expect((await c.ok("workspace/resolve", { id: workspace.id })).roots[0].status).toBe("no-access");
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  test("the history of a workspace is looked up by its folders", async () => {
    const c = computer();
    const shop = join(c.dir, "shop");
    mkdirSync(shop);
    writeFileSync(join(shop, "a.txt"), "x");
    mkdirSync(join(c.dir, "elsewhere"));
    writeFileSync(join(c.dir, "elsewhere", "b.txt"), "x");
    const { workspace } = await c.ok("workspace/save", { workspace: base(c, { roots: [shop], openFolders: [] }) });
    for (const [from, name] of [[join(shop, "a.txt"), "a2.txt"], [join(c.dir, "elsewhere", "b.txt"), "b2.txt"]] as const) {
      const { job } = await c.ok("fileops/start", { mode: "rename", items: [{ path: from, name }] });
      for (let i = 0; i < 200; i++) { const jobs = (await c.ok("jobs/list")).jobs; if (jobs.find((j: any) => j.id === job.id)?.state === "done") break; await new Promise((r) => setTimeout(r, 10)); }
    }
    const r = await c.ok("workspace/resolve", { id: workspace.id });
    expect(r.history).toHaveLength(1);
    expect(r.history[0].items[0].source).toBe(join(shop, "a.txt"));
  });

  test("an unreadable file is treated as empty and kept aside; a newer file is never overwritten", async () => {
    const c = computer();
    await c.ok("workspace/save", { workspace: base(c) });
    const file = workspaceFile({ dataDir: c.dataDir } as any);
    writeFileSync(file, "{ this is not json");
    const list = await c.ok("workspace/list");
    expect(list.workspaces).toEqual([]);
    expect(list.skipped).toBe(1);
    await c.ok("workspace/save", { workspace: base(c, { name: "After damage" }) });
    expect(readFileSync(`${file}.damaged`, "utf8")).toBe("{ this is not json");

    const newer = JSON.stringify({ version: 7, workspaces: [{ name: "from the future" }] });
    writeFileSync(file, newer);
    const view = await c.ok("workspace/list");
    expect(view.readOnly).toBe(true);
    const refused = await c.api("workspace/save", { workspace: base(c, { name: "Nope" }) });
    expect(refused.json.error.code).toBe("NEWER_FILE");
    expect(readFileSync(file, "utf8")).toBe(newer);
  });

  test("a hand-edited entry with a secret in it is skipped on load instead of being shown", async () => {
    const c = computer();
    await c.ok("workspace/save", { workspace: base(c) });
    const file = workspaceFile({ dataDir: c.dataDir } as any);
    const data = JSON.parse(readFileSync(file, "utf8"));
    data.workspaces.push({ id: "abc", name: "Edited", commands: [{ label: "x", command: "curl https://u:p@host/" }] });
    writeFileSync(file, JSON.stringify(data));
    const list = await c.ok("workspace/list");
    expect(list.workspaces.map((w: any) => w.name)).toEqual(["Shop site"]);
    expect(list.skipped).toBe(1);
  });
});
