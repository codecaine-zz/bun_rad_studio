import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectManagers, explainFailure, overview, resolveTool, startBatch, startInstall, toolStatus } from "../src/features/filemanager/fmBatch";
import { createContext } from "../src/features/filemanager/fmCore";
import { createJobHub } from "../src/features/filemanager/fmJobs";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  ACTIONS, ACTION_BY_ID, HOMEBREW_INSTALL_COMMAND, actionAccepts, buildArgs, childEnv, ffmpegCapabilities, findExecutable, imageMagickCapabilities,
  installPlan, kindsFor, missingCapability, outputName, searchDirs,
} from "../src/features/filemanager/fmTools";

const posix = process.platform !== "win32";
const suite = posix ? describe : describe.skip;
const action = (id: string) => ACTION_BY_ID.get(id)!;

describe("the action catalog", () => {
  test("ids are unique, every action has a tool, a group and an input list", () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const a of ACTIONS) {
      expect(a.label.length).toBeGreaterThan(3);
      expect(a.inputs.size).toBeGreaterThan(0);
      expect(["Pictures", "Video", "Sound", "Documents"]).toContain(a.group);
    }
  });

  test("kindsFor and actionAccepts read the extension, in any case, and skip same-format conversions", () => {
    expect(kindsFor("Holiday.JPG")).toEqual(["Pictures"]);
    expect(kindsFor("a.mp4")).toEqual(["Video"]);
    expect(kindsFor("a.mp3")).toEqual(["Sound"]);
    expect(kindsFor("notes.MD")).toEqual(["Documents"]);
    expect(kindsFor("archive.zip")).toEqual([]);
    expect(kindsFor("noext")).toEqual([]);
    expect(actionAccepts(action("doc-md"), "a.md")).toBe(false);
    expect(actionAccepts(action("doc-md"), "a.docx")).toBe(true);
    expect(actionAccepts(action("doc-html"), "a.htm")).toBe(false);
    expect(actionAccepts(action("aud-wav"), "a.wav")).toBe(false);
    expect(actionAccepts(action("img-jpg"), "a.jpg")).toBe(true); // a re-save is allowed for pictures
    expect(actionAccepts(action("img-jpg"), "a.mp4")).toBe(false);
  });

  test("output names never exist yet, and say what was done when the format stays the same", () => {
    const none = () => false;
    expect(outputName(action("img-jpg"), "photo.png", none)).toBe("photo.jpg");
    expect(outputName(action("img-half"), "photo.png", none)).toBe("photo (half size).png");
    expect(outputName(action("vid-small"), "clip.mp4", none)).toBe("clip (small).mp4");
    expect(outputName(action("vid-mp3"), "clip.mp4", none)).toBe("clip.mp3");
    expect(outputName(action("doc-docx"), "my.notes.md", none)).toBe("my.notes.docx");
    const taken = new Set(["photo.jpg", "photo (2).jpg"]);
    expect(outputName(action("img-jpg"), "photo.png", (n) => taken.has(n))).toBe("photo (3).jpg");
  });

  test("commands are lists of arguments; names stay in one argument each, whatever they contain", () => {
    const nasty = '/tmp/a b/$(touch pwned) "q" -rf; `x`.mp4';
    const ff = buildArgs(action("vid-mp4"), nasty, "/tmp/out.mp4");
    expect(ff).toContain(`file:${nasty}`);
    expect(ff.slice(0, 7)).toEqual(["-nostdin", "-hide_banner", "-loglevel", "error", "-n", "-i", `file:${nasty}`]);
    expect(ff.at(-1)).toBe("file:/tmp/out.mp4");
    const pd = buildArgs(action("doc-html"), "/tmp/-weird.md", "/tmp/out.html", { title: 'T "x"' });
    expect(pd).toContain("pagetitle=T \"x\"");
    expect(pd.at(-2)).toBe("-o");
    expect(buildArgs(action("doc-pdf"), "/a.md", "/a.pdf", { pdfEngine: "typst" })).toContain("--pdf-engine=typst");
    const im = buildArgs(action("img-fit-800"), "/in.png", "/out.png");
    expect(im[0]).toBe("/in.png");
    expect(im).toContain("800x800>");
  });
});

describe("what the installed programs can do", () => {
  test("ffmpeg encoders and ImageMagick formats are read from their listings", () => {
    expect(ffmpegCapabilities(" V....D libx264  H.264\n A....D libmp3lame MP3\n V....D libvpx-vp9 VP9")).toEqual(["x264", "vp9", "mp3"]);
    expect(ffmpegCapabilities(" V....D mpeg4 MPEG-4")).toEqual([]);
    const list = "      PNG* PNG       rw-   Portable\n     WEBP* WEBP      r--   WebP read only\n      PDF  PDF       rw+   PDF\n     JPEG* JPEG      rw-   JFIF";
    expect(imageMagickCapabilities(list)).toEqual(["jpeg", "png", "pdf"]);
  });

  test("a missing capability gives a plain explanation that names the full build", () => {
    expect(missingCapability(action("vid-mp4"), [], "ffmpeg")).toContain("ffmpeg-full");
    expect(missingCapability(action("img-webp"), [], "imagemagick")).toContain("imagemagick-full");
    expect(missingCapability(action("vid-mp4"), ["x264"], "ffmpeg")).toBeNull();
    expect(missingCapability(action("doc-pdf"), [], "pandoc")).toContain("PDF engine");
    expect(missingCapability(action("doc-docx"), [], "pandoc")).toBeNull();
  });

  test("failures are explained in words", () => {
    expect(explainFailure("ffmpeg", "Unknown encoder 'libx264'", 1)).toContain("ffmpeg-full");
    expect(explainFailure("ffmpeg", "x.mp4: Invalid data found when processing input", 1)).toContain("damaged");
    expect(explainFailure("imagemagick", "magick: no decode delegate for this image format `HEIC'", 1)).toContain("imagemagick-full");
    expect(explainFailure("pandoc", "Unknown reader: foo", 1)).toContain("doesn't know");
    expect(explainFailure("pandoc", "pdflatex not found. Please select a different --pdf-engine or install pdflatex", 47)).toContain("PDF engine");
    expect(explainFailure("ffmpeg", "write error: No space left on device", 1)).toBe("The disk is full.");
    expect(explainFailure("ffmpeg", "\u001b[31mSomething odd\u001b[0m\nsecond line", 1)).toContain("Something odd");
  });
});

describe("finding programs and planning installs", () => {
  test("keg-only Homebrew folders and Windows install places are searched, and tests can restrict the search", () => {
    const mac = searchDirs({ platform: "darwin", home: "/Users/x", toolDirs: undefined }, { PATH: "/usr/bin:/bin" });
    expect(mac).toContain("/opt/homebrew/opt/ffmpeg-full/bin");
    expect(mac).toContain("/opt/homebrew/opt/imagemagick-full/bin");
    expect(mac).toContain("/usr/bin");
    const win = searchDirs({ platform: "win32", home: "C:\\Users\\x", toolDirs: undefined }, { Path: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" });
    expect(win.some((d) => d.includes("WinGet\\Links"))).toBe(true);
    expect(win.some((d) => d.includes("scoop\\shims"))).toBe(true);
    expect(searchDirs({ platform: "linux", home: "/h", toolDirs: ["/only/here"] })).toEqual(["/only/here"]);
    const env = childEnv({ platform: "linux", home: "/h", toolDirs: ["/a", "/b"] }, { PATH: "/ignored", HOME: "/h" });
    expect(env.PATH).toBe("/a:/b");
    expect(env.HOME).toBe("/h");
  });

  test("install plans per system", () => {
    const brew = installPlan("darwin", "ffmpeg", { brew: "/opt/homebrew/bin/brew" });
    expect(brew).toMatchObject({ method: "brew", auto: true, display: "brew install ffmpeg-full" });
    expect(brew.argv).toEqual(["/opt/homebrew/bin/brew", "install", "ffmpeg-full"]);
    expect(installPlan("darwin", "imagemagick", { brew: "/b" }).display).toBe("brew install imagemagick-full");
    expect(installPlan("darwin", "pandoc", { brew: "/b" }).display).toBe("brew install pandoc");

    const none = installPlan("darwin", "pandoc", {});
    expect(none).toMatchObject({ method: null, auto: false, argv: null });
    expect(none.missingManager).toMatchObject({ id: "brew", url: "https://brew.sh", command: HOMEBREW_INSTALL_COMMAND });
    expect(HOMEBREW_INSTALL_COMMAND).toContain("raw.githubusercontent.com/Homebrew/install/HEAD/install.sh");

    expect(installPlan("win32", "ffmpeg", { winget: "C:\\w.exe" })).toMatchObject({ method: "winget", auto: true });
    expect(installPlan("win32", "ffmpeg", { winget: "C:\\w.exe" }).argv).toContain("Gyan.FFmpeg");
    expect(installPlan("win32", "pandoc", { scoop: "C:\\s.cmd" })).toMatchObject({ method: "scoop", auto: true });
    expect(installPlan("win32", "pandoc", { choco: "C:\\c.exe" })).toMatchObject({ method: "choco", auto: false });
    expect(installPlan("win32", "pandoc", {}).missingManager?.id).toBe("winget");

    const apt = installPlan("linux", "imagemagick", { apt: "/usr/bin/apt" });
    expect(apt).toMatchObject({ method: "apt", auto: false, display: "sudo apt install -y imagemagick" });
    expect(installPlan("linux", "pandoc", { pacman: "/usr/bin/pacman" }).display).toContain("pandoc-cli");
    expect(installPlan("linux", "ffmpeg", { dnf: "/usr/bin/dnf" }).display).toContain("ffmpeg-free");
    expect(installPlan("linux", "ffmpeg", { brew: "/home/linuxbrew/.linuxbrew/bin/brew", apt: "/usr/bin/apt" }).method).toBe("brew");
    expect(installPlan("linux", "ffmpeg", {}).missingManager?.id).toBe("brew");
  });
});

suite("the job runner", () => {
  const root = mkdtempSync(join(tmpdir(), "fm-jobs-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const script = (name: string, body: string) => {
    const p = join(root, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
    return p;
  };

  test("runs steps in order and lists the files it made", async () => {
    const hub = createJobHub();
    const ok = script("ok.sh", 'echo hello > "$1"');
    const job = hub.start({ kind: "convert", title: "t", steps: [1, 2, 3].map((i) => ({ label: `s${i}`, argv: [ok, join(root, `o${i}.txt`)], output: join(root, `o${i}.txt`) })) });
    const done = await hub.whenDone(job.id);
    expect(done).toMatchObject({ state: "done", total: 3, done: 3, failed: 0 });
    expect(done.outputs.length).toBe(3);
    expect(done.steps.every((s) => s.state === "done")).toBe(true);
  });

  test("a failing step removes its half-written file, keeps the others going, and explains itself", async () => {
    const hub = createJobHub();
    const bad = script("bad.sh", 'echo partial > "$1"; echo "boom: bad input" >&2; exit 3');
    const ok = script("ok2.sh", 'echo fine > "$1"');
    const job = hub.start({
      kind: "convert", title: "t",
      steps: [
        { label: "bad", argv: [bad, join(root, "p1.txt")], output: join(root, "p1.txt") },
        { label: "good", argv: [ok, join(root, "p2.txt")], output: join(root, "p2.txt") },
      ],
    });
    const done = await hub.whenDone(job.id);
    expect(done.state).toBe("failed");
    expect(done).toMatchObject({ done: 1, failed: 1 });
    expect(existsSync(join(root, "p1.txt"))).toBe(false);
    expect(existsSync(join(root, "p2.txt"))).toBe(true);
    expect(done.steps[0]!.message).toContain("boom: bad input");
  });

  test("exiting with 0 without making a file, or making an empty one, counts as a failure", async () => {
    const hub = createJobHub();
    const nothing = script("nothing.sh", "exit 0");
    const empty = script("empty.sh", ': > "$1"');
    const job = hub.start({ kind: "convert", title: "t", steps: [{ label: "n", argv: [nothing], output: join(root, "n.txt") }, { label: "e", argv: [empty, join(root, "e.txt")], output: join(root, "e.txt") }] });
    const done = await hub.whenDone(job.id);
    expect(done.steps.map((s) => s.state)).toEqual(["failed", "failed"]);
    expect(existsSync(join(root, "e.txt"))).toBe(false);
  });

  test("never overwrites: an output that exists already is a failure and the file is left alone", async () => {
    const hub = createJobHub();
    writeFileSync(join(root, "keep.txt"), "mine");
    const ok = script("ok3.sh", 'echo new > "$1"');
    const done = await hub.whenDone(hub.start({ kind: "convert", title: "t", steps: [{ label: "x", argv: [ok, join(root, "keep.txt")], output: join(root, "keep.txt") }] }).id);
    expect(done.steps[0]!.state).toBe("failed");
    expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("mine");
  });

  test("a program that can't be started is explained", async () => {
    const hub = createJobHub();
    const done = await hub.whenDone(hub.start({ kind: "convert", title: "t", steps: [{ label: "x", argv: [join(root, "no-such-program")] }] }).id);
    expect(done.steps[0]!.state).toBe("failed");
    expect(done.steps[0]!.message.length).toBeGreaterThan(5);
  });

  test("cancelling stops the running program, removes its output and skips the rest", async () => {
    const hub = createJobHub();
    const slow = script("slow.sh", 'echo partial > "$1"; sleep 30');
    const job = hub.start({ kind: "convert", title: "t", steps: [{ label: "slow", argv: [slow, join(root, "c1.txt")], output: join(root, "c1.txt") }, { label: "never", argv: [slow, join(root, "c2.txt")], output: join(root, "c2.txt") }] });
    for (let i = 0; i < 100 && !existsSync(join(root, "c1.txt")); i++) await Bun.sleep(30);
    expect(hub.cancel(job.id)).toBe(true);
    const done = await hub.whenDone(job.id);
    expect(done.state).toBe("cancelled");
    expect(existsSync(join(root, "c1.txt"))).toBe(false);
    expect(existsSync(join(root, "c2.txt"))).toBe(false);
    expect(done.steps.every((s) => s.state === "skipped")).toBe(true);
    expect(hub.cancel(job.id)).toBe(false);
  });

  test("a step that takes too long is stopped", async () => {
    const hub = createJobHub();
    const slow = script("slow2.sh", "sleep 30");
    const done = await hub.whenDone(hub.start({ kind: "convert", title: "t", steps: [{ label: "x", argv: [slow], timeoutMs: 300 }] }).id);
    expect(done.steps[0]).toMatchObject({ state: "failed" });
    expect(done.steps[0]!.message).toContain("too long");
  });

  test("only two jobs run at once; a waiting job can be cancelled before it starts", async () => {
    const hub = createJobHub(2);
    const slow = script("slow3.sh", "sleep 1");
    const mk = (n: string) => hub.start({ kind: "convert", title: n, steps: [{ label: n, argv: [slow] }] });
    const a = mk("a"), b = mk("b"), c = mk("c");
    expect([a.state, b.state, c.state]).toEqual(["running", "running", "waiting"]);
    expect(hub.cancel(c.id)).toBe(true);
    expect(c.state).toBe("cancelled");
    await hub.whenDone(a.id);
    await hub.whenDone(b.id);
    expect(hub.clearFinished()).toBe(3);
    expect(hub.list()).toEqual([]);
  });

  test("the last lines the program wrote are available while it runs", async () => {
    const hub = createJobHub();
    const talk = script("talk.sh", 'echo line-one; echo line-two >&2; sleep 1');
    const job = hub.start({ kind: "install", title: "t", steps: [{ label: "talk", argv: [talk] }] });
    for (let i = 0; i < 60 && !job.log.includes("line-two"); i++) await Bun.sleep(30);
    expect(job.log).toContain("line-one");
    expect(job.log).toContain("line-two");
    await hub.whenDone(job.id);
  });
});

suite("batches with stand-in programs", () => {
  const root = mkdtempSync(join(tmpdir(), "fm-batch-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  const work = join(home, "Pictures");
  const log = join(root, "args.log");
  const ctx = createContext({ platform: "darwin", home, dataDir: join(root, "data"), toolDirs: [bin] });

  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    mkdirSync(work, { recursive: true });
    const tool = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    const record = `{ printf '%s\\n' "$0"; for a in "$@"; do printf 'ARG:%s\\n' "$a"; done; echo '--'; } >> "${log}"`;
    // ffmpeg: writes its last argument (after "file:"); magick: copies its first input to its last argument; pandoc: writes after -o.
    tool("ffmpeg", `${record}\nif [ "$1" = "-version" ]; then echo "ffmpeg version 7.1 test"; exit 0; fi\nif [ "$2" = "-encoders" ] || [ "$3" = "-encoders" ]; then echo " V....D libx264 H.264"; exit 0; fi\nfor a; do last="$a"; done\nprintf 'media' > "\${last#file:}"`);
    tool("magick", `${record}\nif [ "$1" = "-version" ]; then echo "Version: ImageMagick 7.1.2-0 test"; exit 0; fi\nif [ "$1" = "-list" ]; then printf '      PNG* PNG       rw-   p\\n     JPEG* JPEG      rw-   j\\n      PDF  PDF       rw+   d\\n'; exit 0; fi\nfor a; do last="$a"; done\n/bin/cp "$1" "$last"`);
    tool("pandoc", `${record}\nif [ "$1" = "--version" ]; then echo "pandoc 3.1 test"; exit 0; fi\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then printf 'doc' > "$2"; fi; shift; done`);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");

  test("tools are found, versions and capabilities read, and unavailable actions say why", async () => {
    writeFileSync(join(work, "pic.png"), "png");
    writeFileSync(join(work, "clip.mp4"), "mp4");
    writeFileSync(join(work, "note.md"), "# hi");
    const o = await overview(ctx, [join(work, "pic.png"), join(work, "clip.mp4"), join(work, "note.md"), work, join(work, "missing.png")]);
    expect(o.selected).toBe(3); // the folder and the missing file are not counted
    const byId = (id: string) => o.tools.find((t) => t.id === id)!;
    expect(byId("ffmpeg")).toMatchObject({ installed: true, version: "7.1", capabilities: ["x264"] });
    expect(byId("imagemagick")).toMatchObject({ installed: true, version: "7.1.2-0" });
    const act = (id: string) => o.actions.find((a) => a.id === id)!;
    expect(act("vid-mp4")).toMatchObject({ available: true, count: 1 });
    expect(act("vid-webm")!.available).toBe(false); // this stand-in ffmpeg has no vp9
    expect(act("vid-webm")!.why).toContain("ffmpeg-full");
    expect(act("img-webp")!.available).toBe(false);
    expect(act("doc-docx")).toMatchObject({ available: true, count: 1 });
    expect(o.actions.find((a) => a.id === "img-combine-pdf")).toBeUndefined(); // needs two pictures
  });

  test("files are made next to the originals, never over anything, with distinct names for the same base", async () => {
    writeFileSync(join(work, "a.png"), "A");
    writeFileSync(join(work, "a.jpg"), "J");
    writeFileSync(join(work, "dup.png"), "D");
    writeFileSync(join(work, "dup.jpg"), "existing-jpg");
    const job = await startBatch(ctx, "img-png", [join(work, "a.png"), join(work, "dup.png")]);
    const done = await ctx.jobs.whenDone(job.id);
    expect(done.state).toBe("done");
    expect(readFileSync(join(work, "dup.jpg"), "utf8")).toBe("existing-jpg");
    const job2 = await startBatch(ctx, "img-jpg", [join(work, "a.png"), join(work, "dup.png")]);
    const done2 = await ctx.jobs.whenDone(job2.id);
    expect(done2.state).toBe("done");
    expect(readFileSync(join(work, "dup.jpg"), "utf8")).toBe("existing-jpg");
    expect(done2.outputs.map((o) => o.replace(work + "/", "")).sort()).toEqual(["a (2).jpg", "dup (2).jpg"]);
    expect(readFileSync(join(work, "dup (2).jpg"), "utf8")).toBe("D");
  });

  test("hostile file names reach the program as plain arguments and run nothing", async () => {
    const names = ["it's [1] 100%.png", "$(touch pwned).png", "a;touch pwned2.png", "-rf.png", "tab\tname.png", "sp ace  .png"];
    for (const n of names) writeFileSync(join(work, n), "x");
    const job = await startBatch(ctx, "img-half", names.map((n) => join(work, n)));
    const done = await ctx.jobs.whenDone(job.id);
    expect(done.state).toBe("done");
    expect(done.done).toBe(names.length);
    expect(existsSync(join(work, "pwned"))).toBe(false);
    expect(existsSync(join(work, "pwned2.png"))).toBe(false);
    expect(readdirSync(work).filter((f) => f.includes("(half size)")).length).toBe(names.length);
    // ImageMagick only ever saw safe staged names, never the user's (it reads [ ] * % : as instructions).
    const seen = calls().split("\n").filter((l) => l.startsWith("ARG:") && /in\d{4}\.png$|out\.png$/.test(l));
    expect(seen.length).toBeGreaterThan(names.length);
    expect(calls()).not.toContain("ARG:/tmp/");
  });

  test("ffmpeg gets the real path with a file: prefix, as one argument", async () => {
    const n = "my clip $(x) [2].mp4";
    writeFileSync(join(work, n), "v");
    const done = await ctx.jobs.whenDone((await startBatch(ctx, "vid-mp4", [join(work, n)])).id);
    expect(done.state).toBe("done");
    expect(calls()).toContain(`ARG:file:${join(work, n)}`);
    expect(existsSync(join(work, "my clip $(x) [2].mp4"))).toBe(true);
    expect(existsSync(join(work, "my clip $(x) [2] (converted).mp4"))).toBe(true);
  });

  test("combining needs two pictures, sorts them naturally and makes one PDF", async () => {
    const dir = join(work, "scan");
    mkdirSync(dir);
    for (const n of ["p10.png", "p2.png", "p1.png"]) writeFileSync(join(dir, n), n);
    await expect(startBatch(ctx, "img-combine-pdf", [join(dir, "p1.png")])).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
    const done = await ctx.jobs.whenDone((await startBatch(ctx, "img-combine-pdf", [join(dir, "p10.png"), join(dir, "p1.png"), join(dir, "p2.png")])).id);
    expect(done.state).toBe("done");
    expect(done.outputs).toEqual([join(dir, "Combined pictures.pdf")]);
    // The stand-in ImageMagick copies its first input to the output, so the first page must be p1 (natural order: p1, p2, p10).
    expect(readFileSync(join(dir, "Combined pictures.pdf"), "utf8")).toBe("p1.png");
  });

  test("clear errors: unknown action, nothing usable, a missing program, a protected folder", async () => {
    await expect(startBatch(ctx, "format-disk", [join(work, "a.png")])).rejects.toMatchObject({ code: "UNKNOWN_ACTION" });
    await expect(startBatch(ctx, "img-png", [join(work, "note.md")])).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
    await expect(startBatch(ctx, "img-png", "nope")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(startBatch(ctx, "img-png", Array.from({ length: 501 }, (_, i) => join(work, `${i}.png`)))).rejects.toMatchObject({ code: "TOO_MANY" });
    const without = createContext({ platform: "darwin", home, dataDir: join(root, "d2"), toolDirs: [join(root, "empty")] });
    await expect(startBatch(without, "img-png", [join(work, "a.png")])).rejects.toMatchObject({ code: "TOOL_MISSING" });
  });

  test("installing runs the package manager, then the program is found; manual installs are refused with the command", async () => {
    const dirs = join(root, "inst");
    mkdirSync(dirs, { recursive: true });
    const brew = join(dirs, "brew");
    writeFileSync(brew, `#!/bin/sh\necho "brew $@" >> "${log}"\nprintf '#!/bin/sh\\necho pandoc 9\\n' > "${dirs}/pandoc"\n/bin/chmod +x "${dirs}/pandoc"\n`);
    chmodSync(brew, 0o755);
    const c = createContext({ platform: "darwin", home, dataDir: join(root, "d4"), toolDirs: [dirs] });
    expect(detectManagers(c).brew).toBe(brew);
    expect(resolveTool(c, "pandoc")).toBeNull();
    const job = startInstall(c, ["pandoc"]);
    const done = await c.jobs.whenDone(job.id);
    expect(done.state).toBe("done");
    expect(calls()).toContain("brew install pandoc");
    expect(resolveTool(c, "pandoc")).toBe(join(dirs, "pandoc"));
    expect(() => startInstall(c, ["pandoc"])).toThrow(/already installed/);
    expect(() => startInstall(c, ["nothing"])).toThrow(/Choose a program/);

    const noManager = createContext({ platform: "darwin", home, dataDir: join(root, "d5"), toolDirs: [join(root, "empty")] });
    expect(() => startInstall(noManager, ["ffmpeg"])).toThrow(/Homebrew/);
    const aptDir = join(root, "aptdir");
    mkdirSync(aptDir);
    writeFileSync(join(aptDir, "apt-get"), "#!/bin/sh\n");
    chmodSync(join(aptDir, "apt-get"), 0o755);
    const linux = createContext({ platform: "linux", home, dataDir: join(root, "d6"), toolDirs: [aptDir] });
    expect(() => startInstall(linux, ["ffmpeg"])).toThrow(/sudo apt install -y ffmpeg/);
  });

  test("toolStatus reports each tool with its install plan", async () => {
    const empty = createContext({ platform: "darwin", home, dataDir: join(root, "d7"), toolDirs: [join(root, "nothing")] });
    const s = await toolStatus(empty);
    expect(s.tools.map((t) => t.id)).toEqual(["ffmpeg", "imagemagick", "pandoc"]);
    expect(s.tools.every((t) => !t.installed && t.plan.missingManager?.id === "brew")).toBe(true);
  });
});

suite("over HTTP", () => {
  const root = mkdtempSync(join(tmpdir(), "fm-toolhttp-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  let server: ReturnType<typeof startFileManagerServer>;
  const TOKEN = "tools-token";
  const post = async (op: string, body: unknown = {}, token: string | null = TOKEN) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };
  beforeAll(() => {
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(home, "Pictures"), { recursive: true });
    writeFileSync(join(bin, "pandoc"), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pandoc 3.0"; exit 0; fi\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then printf 'x' > "$2"; fi; shift; done\n`);
    chmodSync(join(bin, "pandoc"), 0o755);
    writeFileSync(join(home, "Pictures", "n.md"), "# n");
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { platform: "darwin", home, dataDir: join(root, "data"), toolDirs: [bin], launch: async () => {} } });
  });
  afterAll(() => {
    server.stop(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("every tool operation needs the token", async () => {
    for (const op of ["tools/overview", "tools/run", "tools/install", "jobs/list", "jobs/cancel", "jobs/clear"]) {
      expect((await post(op, {}, null)).status).toBe(401);
      expect((await post(op, {}, "wrong")).status).toBe(401);
    }
  });

  test("overview, run, list, cancel and clear", async () => {
    const o = await post("tools/overview", { paths: [join(home, "Pictures", "n.md")] });
    expect(o.status).toBe(200);
    expect(o.json.tools.find((t: any) => t.id === "pandoc")).toMatchObject({ installed: true });
    expect(o.json.tools.find((t: any) => t.id === "ffmpeg")).toMatchObject({ installed: false });
    expect(o.json.actions.find((a: any) => a.id === "doc-docx")).toMatchObject({ available: true, count: 1 });

    const bad = await post("tools/run", { action: "doc-docx", paths: [join(home, "Pictures", "nothing.md")] });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("NOTHING_TO_DO");

    const run = await post("tools/run", { action: "doc-docx", paths: [join(home, "Pictures", "n.md")] });
    expect(run.status).toBe(200);
    for (let i = 0; i < 100; i++) {
      const list = await post("jobs/list");
      if (list.json.jobs.every((j: any) => j.state !== "running" && j.state !== "waiting")) break;
      await Bun.sleep(30);
    }
    const list = await post("jobs/list");
    expect(list.json.jobs[0]).toMatchObject({ state: "done", kind: "convert" });
    expect(existsSync(join(home, "Pictures", "n.docx"))).toBe(true);
    expect((await post("jobs/cancel", { id: "nope" })).json.cancelled).toBe(false);
    expect((await post("jobs/clear")).json.removed).toBe(1);
  });

  test("installing needs an explicit confirmation", async () => {
    const r = await post("tools/install", { tools: ["ffmpeg"] });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("NEEDS_CONFIRM");
    const manual = await post("tools/install", { tools: ["ffmpeg"], confirm: true });
    expect(manual.json.error.code).toBe("MANUAL_INSTALL");
  });
});

// The real programs, when they are installed here. Skipped (not failed) elsewhere.
const real = createContext({});
const haveMagick = posix && resolveTool(real, "imagemagick") !== null;
const haveFfmpeg = posix && resolveTool(real, "ffmpeg") !== null;
const havePandoc = posix && resolveTool(real, "pandoc") !== null;

describe("with the real programs", () => {
  const root = mkdtempSync(join(tmpdir(), "fm-real-"));
  const ctx = createContext({ home: root, dataDir: join(root, "data") });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const run = async (id: string, files: string[]) => ctx.jobs.whenDone((await startBatch(ctx, id, files.map((f) => join(root, f)))).id);

  test.skipIf(!haveMagick)("ImageMagick converts, resizes and handles awkward names", async () => {
    const make = Bun.spawnSync([resolveTool(ctx, "imagemagick")!, "-size", "200x100", "gradient:blue-red", join(root, "weird [1] 100%.png")]);
    expect(make.exitCode).toBe(0);
    const jpg = await run("img-jpg", ["weird [1] 100%.png"]);
    expect(jpg).toMatchObject({ state: "done", done: 1 });
    expect(existsSync(join(root, "weird [1] 100%.jpg"))).toBe(true);
    const half = await run("img-half", ["weird [1] 100%.png"]);
    expect(half.state).toBe("done");
    const info = Bun.spawnSync([resolveTool(ctx, "imagemagick")!, "identify", "-format", "%wx%h", join(root, "weird [1] 100% (half size).png")]);
    const dims = info.stdout.toString() || Bun.spawnSync([resolveTool(ctx, "imagemagick")!, join(root, "weird [1] 100% (half size).png"), "-format", "%wx%h", "info:"]).stdout.toString();
    expect(dims).toBe("100x50");
    const pdf = await run("img-pdf", ["weird [1] 100%.png"]);
    expect(pdf.state).toBe("done");
    expect(readFileSync(join(root, "weird [1] 100%.pdf")).subarray(0, 4).toString()).toBe("%PDF");
  });

  test.skipIf(!haveFfmpeg)("ffmpeg converts sound and makes a cover picture from a video", async () => {
    const ff = resolveTool(ctx, "ffmpeg")!;
    expect(Bun.spawnSync([ff, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", join(root, "tone.wav")]).exitCode).toBe(0);
    expect(Bun.spawnSync([ff, "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=160x120:rate=10", "-pix_fmt", "yuv420p", join(root, "mini.mp4")]).exitCode).toBe(0);
    const flac = await run("aud-flac", ["tone.wav"]);
    expect(flac).toMatchObject({ state: "done", done: 1 });
    expect(readFileSync(join(root, "tone.flac")).subarray(0, 4).toString()).toBe("fLaC");
    const cover = await run("vid-cover", ["mini.mp4"]);
    expect(cover.state).toBe("done");
    expect(readFileSync(join(root, "mini.png")).subarray(1, 4).toString()).toBe("PNG");
    const bad = join(root, "broken.mp4");
    writeFileSync(bad, "this is not a video");
    const failed = await run("vid-cover", ["broken.mp4"]);
    expect(failed.state).toBe("failed");
    expect(failed.steps[0]!.message).toContain("damaged");
    expect(existsSync(join(root, "broken.png"))).toBe(false);
  });

  test.skipIf(!havePandoc)("pandoc converts a Markdown file to HTML and Word", async () => {
    writeFileSync(join(root, "read me.md"), "# Title\n\nHello *world*.\n");
    const html = await run("doc-html", ["read me.md"]);
    expect(html.state).toBe("done");
    expect(readFileSync(join(root, "read me.html"), "utf8")).toContain("<em>world</em>");
    const docx = await run("doc-docx", ["read me.md"]);
    expect(docx.state).toBe("done");
    expect(readFileSync(join(root, "read me.docx")).subarray(0, 2).toString()).toBe("PK");
  });
});
