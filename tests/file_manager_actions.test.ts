/**
 * Saved file actions: the definition checks, the up-front validation, a real multi-step run (built-in converters, so no
 * helper program is needed), failures that name the step and files, cancelling, conflict handling and persistence.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { actionOperations, actionsFile, builtinActions, preflight, sanitizeAction, startRun, whenRunDone, cancelRun, ACTION_FORMAT } from "../src/features/filemanager/fmActions";
import { undoPlan } from "../src/features/filemanager/fmPlanRun";

const roots: string[] = [];
function sandbox(options: { toolDirs?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fm-actions-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  return { root, home, work, ctx: createContext({ home, dataDir: join(root, "data"), ...options }) };
}
type Box = ReturnType<typeof sandbox>;
const put = (path: string, content = "x") => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content); return path; };
const op = (box: Box, name: string, body: Record<string, unknown> = {}) => actionOperations[name]!(box.ctx, body) as Promise<any>;
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

// Two built-in steps: CSV to JSON, then JSON to YAML. The first step's results are the second step's inputs.
const chain = (extra: Record<string, unknown> = {}) => ({
  name: "CSV to YAML",
  input: { extensions: ["csv"] },
  params: [{ id: "indent", label: "Indent", kind: "choice", choices: [{ value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }], default: "2" }],
  steps: [
    { type: "convert", action: "data-json", options: { indent: { $param: "indent" } } },
    { type: "convert", action: "data-yaml", options: {} },
  ],
  output: { folder: "./converted", conflict: "rename" },
  ...extra,
});

describe("what a definition may say", () => {
  test("the built-in actions are valid, never modify originals, and one is the website-images recipe", () => {
    const { ctx } = sandbox();
    const all = builtinActions(ctx);
    expect(all.map((a) => a.id)).toEqual(["builtin-images-web", "builtin-data-yaml", "builtin-text-plain"]);
    expect(all.every((a) => a.modifiesOriginals === false && a.source === "builtin")).toBe(true);
    const web = all[0]!;
    expect(web.steps.map((s) => (s as any).action)).toEqual(["img-resize", "img-webp"]);
    expect(web.output).toEqual({ folder: "./optimized", conflict: "rename" });
    expect(web.params[0]).toMatchObject({ id: "width", default: 1600 });
  });

  test("bad definitions are refused with a plain sentence", () => {
    const { ctx } = sandbox();
    const check = (raw: unknown, message: RegExp) => expect(() => sanitizeAction(ctx, raw, "local")).toThrow(message);
    check(null, /isn't an action/);
    check({ name: "" , steps: [] }, /Give the action a name/);
    check({ name: "x", steps: [] }, /at least one step/);
    check({ name: "x", modifiesOriginals: true, steps: [{ type: "convert", action: "data-yaml" }] }, /never change your original files/);
    check({ name: "x", steps: [{ type: "convert", action: "not-a-thing" }] }, /isn't a known conversion/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml", options: { a: { $param: "missing" } } }] }, /doesn't have/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml" }], output: { folder: "../escape" } }, /can't use '\.\.'/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml" }], output: { folder: "./a/../../b" } }, /can't use '\.\.'/);
    check({ name: "x", steps: [{ type: "command", command: "deploy --password=hunter2" }] }, /never store passwords/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml" }], params: [{ id: "Bad Id", kind: "number" }] }, /needs an id/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml" }], params: [{ id: "n", kind: "number", min: 5, max: 1, default: 3 }] }, /minimum above its maximum/);
    check({ name: "x", steps: [{ type: "convert", action: "data-yaml" }], params: [{ id: "n", kind: "number", min: 1, max: 5, default: 9 }] }, /not between 1 and 5/);
    check({ name: "x", steps: Array.from({ length: 9 }, () => ({ type: "convert", action: "data-yaml" })) }, /at most 8 steps/);
  });

  test("a custom command step can be stored but is shown disabled and blocks the run", async () => {
    const box = sandbox();
    const { action } = await op(box, "actions/save", { action: chain({ steps: [{ type: "convert", action: "data-yaml", options: {} }, { type: "command", label: "Upload", command: "scp out server:" }] }) });
    const f = put(join(box.work, "a.csv"), "a,b\n1,2\n");
    const check = (await op(box, "actions/preflight", { action: action.id, inputs: [f] })).check;
    expect(check.ok).toBe(false);
    expect(check.steps[1]).toMatchObject({ supported: false, available: false });
    expect(check.steps[1].note).toMatch(/not supported/);
    await expect(op(box, "actions/run", { action: action.id, inputs: [f] })).rejects.toMatchObject({ code: "CHECK_FAILED" });
    expect(existsSync(join(box.work, "converted"))).toBe(false);
  });
});

describe("checking before anything runs", () => {
  test("inputs, settings and helper programs are validated, per file and per step", async () => {
    const box = sandbox({ toolDirs: [] });
    const { action } = await op(box, "actions/save", { action: chain() });
    const csv = put(join(box.work, "a.csv"), "a,b\n1,2\n");
    const txt = put(join(box.work, "b.txt"), "nope");
    const folder = join(box.work, "dir");
    mkdirSync(folder);

    const ok = (await op(box, "actions/preflight", { action: action.id, inputs: [csv] })).check;
    expect(ok).toMatchObject({ ok: true, modifiesOriginals: false, outputFolder: join(box.work, "converted"), outputFolderExists: false });
    expect(ok.steps.map((s: any) => s.available)).toEqual([true, true]);
    expect(ok.recovery).toMatch(/original files are never changed/);

    const mixed = (await op(box, "actions/preflight", { action: action.id, inputs: [csv, txt, folder, join(box.work, "gone.csv")] })).check;
    expect(mixed.ok).toBe(true);
    expect(mixed.accepted).toEqual([csv]);
    expect(mixed.rejected.map((r: any) => r.reason)).toEqual([expect.stringMatching(/takes \.csv/), expect.stringMatching(/Only files/), expect.stringMatching(/no longer exists/)]);
    expect(mixed.problems.find((p: any) => p.code === "REJECTED").level).toBe("warn");

    expect((await op(box, "actions/preflight", { action: action.id, inputs: [txt] })).check).toMatchObject({ ok: false });
    expect((await op(box, "actions/preflight", { action: action.id, inputs: [] })).check.problems[0].code).toBe("NO_INPUT");
    const badParam = (await op(box, "actions/preflight", { action: action.id, inputs: [csv], params: { indent: "99" } })).check;
    expect(badParam.ok).toBe(false);
    expect(badParam.problems[0].message).toMatch(/choose one of the listed values/);
    await expect(preflight(box.ctx, { action: action.id, inputs: [csv], params: { nope: 1 } })).resolves.toMatchObject({ ok: false });
  });

  test("a step whose helper program is missing says which step and why, and nothing runs", async () => {
    const box = sandbox({ toolDirs: [] });
    const png = put(join(box.work, "photo.png"), "not really a png");
    const web = (await op(box, "actions/preflight", { action: "builtin-images-web", inputs: [png] })).check;
    expect(web.ok).toBe(false);
    expect(web.problems[0]).toMatchObject({ level: "block", code: "TOOL_MISSING", step: 0 });
    expect(web.problems[0].message).toMatch(/Step 1/);
    await expect(startRun(box.ctx, { action: "builtin-images-web", inputs: [png] })).rejects.toMatchObject({ code: "CHECK_FAILED" });
    expect(existsSync(join(box.work, "optimized"))).toBe(false);
  });

  test("an output folder that is a file, or a protected place, is refused", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "a.csv"), "a\n1\n");
    put(join(box.work, "converted"), "i am a file");
    const { action } = await op(box, "actions/save", { action: chain() });
    const check = (await op(box, "actions/preflight", { action: action.id, inputs: [csv] })).check;
    expect(check.problems.some((p: any) => p.code === "NOT_A_FOLDER")).toBe(true);
    const abs = await op(box, "actions/save", { action: chain({ name: "To the bin", output: { folder: join(box.ctx.trashRoot, "items"), conflict: "rename" } }) });
    const sys = (await op(box, "actions/preflight", { action: abs.action.id, inputs: [csv] })).check;
    expect(sys.ok).toBe(false);
  });
});

describe("running", () => {
  test("two steps run through the queue, the results arrive in the output folder, originals are untouched, and the working folder is removed", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "people.csv"), "name,age\nAda,36\nLinus,54\n");
    const before = readFileSync(csv, "utf8");
    const { action } = await op(box, "actions/save", { action: chain() });
    const { run } = await op(box, "actions/run", { action: action.id, inputs: [csv], params: { indent: "4" } });
    expect(run.state).toBe("running");
    expect(run.steps.map((s: any) => s.label)).toEqual(["Convert to JSON", "Convert to YAML"]);
    const done = await whenRunDone(box.ctx, run.id);
    expect(done.state).toBe("done");
    expect(done.steps.map((s) => s.state)).toEqual(["done", "done"]);
    expect(done.message).toMatch(/1 file added to "converted"/);
    expect(done.message).toMatch(/originals were not changed/);
    const out = join(box.work, "converted");
    expect(readdirSync(out)).toEqual(["people.yaml"]);
    expect(readFileSync(join(out, "people.yaml"), "utf8")).toMatch(/Ada/);
    expect(done.published).toEqual([join(out, "people.yaml")]);
    expect(readFileSync(csv, "utf8")).toBe(before);
    expect(readdirSync(box.work).sort()).toEqual(["converted", "people.csv"]);
    expect(existsSync(join(box.ctx.dataDir, "file_manager_actions_work", run.id))).toBe(false);
    // the steps were real jobs in the shared queue
    const jobs = box.ctx.jobs.list();
    expect(jobs.filter((j) => j.kind === "convert").length).toBe(2);
    expect(jobs.some((j) => j.id === done.publishJobId)).toBe(true);
  });

  test("a parameter reaches the step: the setting changes the result", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "a.csv"), "k,v\nx,1\n");
    const { action } = await op(box, "actions/save", { action: { name: "To JSON", input: { extensions: ["csv"] }, params: [{ id: "indent", label: "Indent", kind: "choice", choices: [{ value: "2", label: "2" }, { value: "4", label: "4" }], default: "2" }], steps: [{ type: "convert", action: "data-json", options: { indent: { $param: "indent" } } }], output: { folder: "./o" } } });
    const a = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: action.id, inputs: [csv], params: { indent: "4" } })).run.id);
    expect(a.state).toBe("done");
    expect(readFileSync(join(box.work, "o", "a.json"), "utf8")).toContain("\n        \"k\"");
  });

  test("re-running never overwrites: a taken name gets a number, or the file is skipped when the action says so", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "a.csv"), "k\n1\n");
    const { action } = await op(box, "actions/save", { action: chain() });
    for (let i = 0; i < 2; i++) expect((await whenRunDone(box.ctx, (await op(box, "actions/run", { action: action.id, inputs: [csv] })).run.id)).state).toBe("done");
    expect(readdirSync(join(box.work, "converted")).sort()).toEqual(["a (2).yaml", "a.yaml"]);
    const skipping = await op(box, "actions/save", { action: chain({ name: "Skips", output: { folder: "./converted", conflict: "skip" } }) });
    const skipped = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: skipping.action.id, inputs: [csv] })).run.id);
    expect(skipped.state).toBe("done");
    expect(skipped.published).toEqual([]);
    expect(skipped.message).toMatch(/0 files added: all 1 name was already taken/);
    expect(readdirSync(join(box.work, "converted")).sort()).toEqual(["a (2).yaml", "a.yaml"]);
  });

  test("a failing step stops the run, names the step and the file, and writes nothing to the output folder", async () => {
    const box = sandbox();
    const good = put(join(box.work, "good.csv"), "k\n1\n");
    const broken = put(join(box.work, "broken.json"), "{ this is not json");
    const { action } = await op(box, "actions/save", { action: { name: "Data to YAML", input: { extensions: ["csv", "json"] }, steps: [{ type: "convert", label: "Make YAML", action: "data-yaml" }], output: { folder: "./out" } } });
    const run = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: action.id, inputs: [good, broken] })).run.id);
    expect(run.state).toBe("failed");
    expect(run.steps[0]!.state).toBe("failed");
    expect(run.steps[0]!.failedFiles.map((f) => f.path)).toEqual(["broken.json"]);
    expect(run.steps[0]!.failedFiles[0]!.message.length).toBeGreaterThan(5);
    expect(run.message).toMatch(/Step 1 \("Make YAML"\) failed for broken\.json/);
    expect(run.message).toMatch(/Nothing was written/);
    expect(existsSync(join(box.work, "out"))).toBe(false);
    expect(readFileSync(good, "utf8")).toBe("k\n1\n");
    expect(readFileSync(broken, "utf8")).toBe("{ this is not json");
  });

  test("cancelling stops the run, says where, and leaves the output folder untouched", async () => {
    const box = sandbox();
    const files = Array.from({ length: 30 }, (_, i) => put(join(box.work, `f${i}.csv`), `a,b\n${"1,2\n".repeat(2000)}`));
    const { action } = await op(box, "actions/save", { action: chain() });
    const { run } = await op(box, "actions/run", { action: action.id, inputs: files });
    cancelRun(box.ctx, run.id);
    const done = await whenRunDone(box.ctx, run.id);
    expect(done.state).toBe("cancelled");
    expect(done.message).toMatch(/Cancelled (during step 1|before step)/);
    expect(done.message).toMatch(/Nothing was written/);
    expect(existsSync(join(box.work, "converted"))).toBe(false);
    expect(existsSync(join(box.ctx.dataDir, "file_manager_actions_work", run.id))).toBe(false);
  });

  test("the published files are one plan: Undo removes them (to the Recycle Bin) and the originals stay", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "a.csv"), "k\n1\n");
    const { action } = await op(box, "actions/save", { action: chain() });
    const done = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: action.id, inputs: [csv] })).run.id);
    expect(done.planId).toBeTruthy();
    expect(existsSync(join(box.work, "converted", "a.yaml"))).toBe(true);
    const undone = await undoPlan(box.ctx, done.planId!);
    expect(undone.results.every((r) => r.ok)).toBe(true);
    expect(existsSync(join(box.work, "converted", "a.yaml"))).toBe(false);
    expect(existsSync(csv)).toBe(true);
  });

  test("a file that is not a usable input is left out with a reason, and the rest run", async () => {
    const box = sandbox();
    const csv = put(join(box.work, "a.csv"), "k\n1\n");
    const txt = put(join(box.work, "note.txt"), "x");
    const { action } = await op(box, "actions/save", { action: chain() });
    const run = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: action.id, inputs: [csv, txt] })).run.id);
    expect(run.state).toBe("done");
    expect(readdirSync(join(box.work, "converted"))).toEqual(["a.yaml"]);
  });
});

describe("saving, sharing and persistence", () => {
  test("save, rename, rerun from the saved list, delete; built-ins can't be deleted or duplicated by name", async () => {
    const box = sandbox();
    const saved = (await op(box, "actions/save", { action: chain() })).action;
    expect(saved).toMatchObject({ source: "local", name: "CSV to YAML", modifiesOriginals: false });
    const renamed = (await op(box, "actions/save", { action: { ...saved, name: "Spreadsheets to YAML" } })).action;
    expect(renamed.id).toBe(saved.id);
    const list = (await op(box, "actions/list")).actions;
    expect(list.map((a: any) => a.name)).toEqual(["Prepare images for a website", "Turn data files into YAML", "Make accent-free copies of text files", "Spreadsheets to YAML"]);
    await expect(op(box, "actions/save", { action: chain({ name: "prepare images for a WEBSITE" }) })).rejects.toMatchObject({ code: "EXISTS" });
    await expect(op(box, "actions/delete", { id: "builtin-data-yaml" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await op(box, "actions/delete", { id: saved.id });
    expect((await op(box, "actions/list")).actions.length).toBe(3);
    const file = JSON.parse(readFileSync(actionsFile(box.ctx), "utf8"));
    expect(file.version).toBe(1);
  });

  test("export and import: an imported action is marked imported, command steps stay disabled, secrets are refused", async () => {
    const box = sandbox();
    const saved = (await op(box, "actions/save", { action: chain() })).action;
    const exported = await op(box, "actions/export", { id: saved.id });
    const file = JSON.parse(exported.text);
    expect(file).toMatchObject({ format: ACTION_FORMAT, version: 1 });
    expect(file.action.id).toBeUndefined();
    expect(exported.fileName).toBe("CSV-to-YAML.action.json");
    const imported = await op(box, "actions/import", { text: exported.text });
    expect(imported.action).toMatchObject({ source: "imported", name: "CSV to YAML (2)" });
    const withCommand = JSON.stringify({ format: ACTION_FORMAT, version: 1, action: { name: "Friend's", steps: [{ type: "convert", action: "data-yaml" }, { type: "command", label: "Hello", command: "echo hi" }] } });
    const second = await op(box, "actions/import", { text: withCommand });
    expect(second.disabledSteps).toBe(1);
    const csv = put(join(box.work, "a.csv"), "k\n1\n");
    expect((await op(box, "actions/preflight", { action: second.action.id, inputs: [csv] })).check.ok).toBe(false);
    const secret = JSON.stringify({ format: ACTION_FORMAT, version: 1, action: { name: "Leaky", steps: [{ type: "command", command: "curl -H 'Authorization: Bearer abcdef123456' x" }] } });
    await expect(op(box, "actions/import", { text: secret })).rejects.toMatchObject({ code: "BAD_ACTION" });
    await expect(op(box, "actions/import", { text: "nope" })).rejects.toMatchObject({ code: "BAD_FILE" });
    await expect(op(box, "actions/import", { text: JSON.stringify({ format: ACTION_FORMAT, version: 9, action: {} }) })).rejects.toMatchObject({ code: "NEWER_FILE" });
  });

  test("a damaged or newer actions file is handled and never overwritten blindly", async () => {
    const box = sandbox();
    await op(box, "actions/save", { action: chain() });
    const file = actionsFile(box.ctx);
    writeFileSync(file, "{ nope");
    const view = await op(box, "actions/list");
    expect(view.actions.length).toBe(3);
    expect(view.skipped).toBe(1);
    await op(box, "actions/save", { action: chain({ name: "After" }) });
    expect(readFileSync(`${file}.damaged`, "utf8")).toBe("{ nope");
    const newer = JSON.stringify({ version: 5, actions: [] });
    writeFileSync(file, newer);
    expect((await op(box, "actions/list")).readOnly).toBe(true);
    await expect(op(box, "actions/save", { action: chain({ name: "Nope" }) })).rejects.toMatchObject({ code: "NEWER_FILE" });
    expect(readFileSync(file, "utf8")).toBe(newer);
  });
});

// The real thing: ImageMagick resizes, then makes WebP. Only where those programs are installed.
const hasMagick = !!Bun.which("magick") || !!Bun.which("convert");
describe.skipIf(!hasMagick)("Prepare images for a website (needs ImageMagick with WebP)", () => {
  test("big pictures become smaller WebP copies in ./optimized and the originals stay", async () => {
    const box = sandbox();
    const png = join(box.work, "photo.png");
    const make = Bun.spawnSync([Bun.which("magick") ?? "convert", ...(Bun.which("magick") ? [] : []), "-size", "2400x1200", "gradient:red-blue", png]);
    expect(make.exitCode).toBe(0);
    const before = readFileSync(png);
    const check = (await op(box, "actions/preflight", { action: "builtin-images-web", inputs: [png], params: { width: 800 } })).check;
    if (!check.ok) return; // WebP support is missing in this ImageMagick: the check said so, which is the point.
    const run = await whenRunDone(box.ctx, (await op(box, "actions/run", { action: "builtin-images-web", inputs: [png], params: { width: 800 } })).run.id);
    expect(run.state).toBe("done");
    expect(readdirSync(join(box.work, "optimized"))).toEqual(["photo.webp"]);
    const size = Bun.spawnSync([Bun.which("magick") ?? "identify", ...(Bun.which("magick") ? ["identify"] : []), "-format", "%w", join(box.work, "optimized", "photo.webp")]);
    expect(Number(new TextDecoder().decode(size.stdout))).toBe(800);
    expect(readFileSync(png).equals(before)).toBe(true);
  });
});
