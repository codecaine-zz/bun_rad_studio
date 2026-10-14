import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { FmError } from "../src/features/filemanager/fmPaths";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { planSetup, setupChoices, setupOptions, setupScript, shellQuote } from "../src/features/filemanager/fmSetup";
import { TOOLS, TOOL_IDS } from "../src/features/filemanager/fmTools";

const posix = process.platform !== "win32";
const suite = posix ? describe : describe.skip;

const root = mkdtempSync(join(tmpdir(), "fm-setup-"));
let n = 0;

/** A fake computer: a folder of stand-in programs (each named, executable, doing nothing), a home and a data folder. */
function computer(platform: "darwin" | "linux" | "win32", programs: string[] = []) {
  const dir = join(root, `c${++n}`);
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, "home"), { recursive: true });
  for (const p of programs) {
    writeFileSync(join(bin, p), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, p), 0o755);
  }
  return { dir, bin, home: join(dir, "home"), ctx: createContext({ platform, home: join(dir, "home"), dataDir: join(dir, "data"), toolDirs: [bin] }) };
}

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("which package managers are offered", () => {
  test("a Mac offers Homebrew only, and says when it will be installed first", () => {
    const withBrew = computer("darwin", ["brew"]);
    expect(setupChoices(withBrew.ctx)).toEqual([{ id: "brew", name: "Homebrew", needsPassword: false, installsItself: false }]);
    const without = computer("darwin");
    expect(setupChoices(without.ctx)).toEqual([{ id: "brew", name: "Homebrew", needsPassword: true, installsItself: true }]);
  });

  test("Linux offers the system's installer first, and Homebrew too", () => {
    const apt = computer("linux", ["apt-get"]);
    expect(setupChoices(apt.ctx).map((c) => c.id)).toEqual(["apt", "brew"]);
    expect(setupChoices(apt.ctx)[0]).toMatchObject({ needsPassword: true, installsItself: false });
    expect(setupChoices(computer("linux", ["dnf"]).ctx).map((c) => c.id)).toEqual(["dnf", "brew"]);
    expect(setupChoices(computer("linux", ["pacman", "apt-get"]).ctx).map((c) => c.id)).toEqual(["apt", "pacman", "brew"]);
    expect(setupChoices(computer("linux").ctx).map((c) => c.id)).toEqual(["brew"]);
  });

  test("Windows has no one-click setup here (winget and Scoop use the background installs)", async () => {
    const win = computer("win32");
    expect(setupChoices(win.ctx)).toEqual([]);
    expect((await setupOptions(win.ctx)).defaultManager).toBeNull();
    await expect(planSetup(win.ctx, { tools: "all" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });

  test("the options list every program with what each manager can install", async () => {
    const o = await setupOptions(computer("linux", ["apt-get"]).ctx);
    expect(o.tools.map((t) => t.id).sort()).toEqual([...TOOL_IDS].sort());
    const libre = o.tools.find((t) => t.id === "libreoffice")!;
    expect(libre.packages.apt).toBe(true);
    expect(libre.packages.brew).toBe(false); // a Mac application: no Homebrew package on Linux
    const mac = await setupOptions(computer("darwin", ["brew"]).ctx);
    expect(mac.tools.find((t) => t.id === "libreoffice")!.packages.brew).toBe(true);
    for (const t of o.tools) expect(typeof t.what).toBe("string");
  });
});

suite("the setup script", () => {
  test("every manager's script is valid shell, quotes names, and lists each program once", async () => {
    for (const [platform, program, manager] of [["linux", "apt-get", "apt"], ["linux", "dnf", "dnf"], ["linux", "pacman", "pacman"], ["darwin", "brew", "brew"]] as const) {
      const pc = computer(platform, [program]);
      const plan = await planSetup(pc.ctx, { tools: "all", manager });
      expect(plan.manager).toBe(manager);
      expect(existsSync(plan.path)).toBe(true);
      expect(statSync(plan.path).mode & 0o777).toBe(0o700);
      expect(plan.path.startsWith(join(pc.dir, "data"))).toBe(true);
      expect(plan.command).toBe(`bash ${shellQuote(plan.path)}`);
      expect(readFileSync(plan.path, "utf8")).toBe(plan.script);
      const check = Bun.spawnSync(["bash", "-n", plan.path]);
      expect(check.exitCode, `${manager}: ${check.stderr.toString()}`).toBe(0);
      expect(plan.script.startsWith("#!/bin/bash\n# Made by Codecaine File Manager")).toBe(true);
      const tryLines = plan.script.split("\n").filter((l) => /^try(_cask)? '/.test(l));
      expect(tryLines.length).toBe(plan.tools.length);
      expect(plan.script.match(/^try(_cask)? 'ffmpeg'/gm)?.length).toBe(1);
    }
  });

  test("apt, dnf and pacman scripts ask for the password once and use their own install commands", async () => {
    const apt = (await planSetup(computer("linux", ["apt-get"]).ctx, { tools: ["ffmpeg"], manager: "apt" })).script;
    expect(apt).toContain("sudo -v");
    expect(apt).toContain("sudo apt-get update");
    expect(apt).toContain('sudo apt-get install -y "$@"');
    expect(apt).toContain("try 'ffmpeg' 'ffmpeg'");
    expect(apt).not.toContain("curl");
    expect((await planSetup(computer("linux", ["dnf"]).ctx, { tools: ["ffmpeg"], manager: "dnf" })).script).toContain('sudo dnf install -y "$@"');
    expect((await planSetup(computer("linux", ["pacman"]).ctx, { tools: ["ffmpeg"], manager: "pacman" })).script).toContain('sudo pacman -S --needed --noconfirm "$@"');
  });

  test("the Homebrew script installs Homebrew first when it is missing, from the official address only, and sets up the shell", async () => {
    const plan = await planSetup(computer("darwin").ctx, { tools: ["ffmpeg", "libreoffice"] });
    expect(plan.installsHomebrew).toBe(true);
    expect(plan.needsPassword).toBe(true);
    expect(plan.script).toContain("https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh");
    expect((plan.script.match(/https?:\/\/[^\s"')]+/g) ?? []).filter((u) => !/^https:\/\/(github\.com\/Homebrew\/install|brew\.sh|raw\.githubusercontent\.com\/Homebrew\/install\/)/.test(u))).toEqual([]);
    expect(plan.script).toContain('eval "$("$BREW" shellenv)"');
    expect(plan.script).toContain("grep -qs 'brew shellenv'");
    expect(plan.script).toContain("try 'ffmpeg' 'ffmpeg-full'");
    expect(plan.script).toContain("try_cask 'LibreOffice' 'libreoffice'");
    const present = await planSetup(computer("darwin", ["brew"]).ctx, { tools: ["ffmpeg"] });
    expect(present.installsHomebrew).toBe(false);
    expect(present.needsPassword).toBe(false);
  });

  test("what is already installed or has no package is left out, with the reason", async () => {
    const pc = computer("linux", ["apt-get", "ffmpeg"]);
    const apt = await planSetup(pc.ctx, { tools: ["ffmpeg", "pandoc"], manager: "apt" });
    expect(apt.tools.map((t) => t.id)).toEqual(["pandoc"]);
    const brew = await planSetup(computer("linux").ctx, { tools: ["pandoc", "libreoffice"], manager: "brew" });
    expect(brew.tools.map((t) => t.id)).toEqual(["pandoc"]);
    expect(brew.skipped).toEqual([{ id: "libreoffice", name: "LibreOffice", why: expect.stringContaining("Homebrew has no package for it") }]);
    await expect(planSetup(pc.ctx, { tools: ["ffmpeg"], manager: "apt" })).rejects.toMatchObject({ code: "ALREADY_INSTALLED" });
  });

  test("bad requests are explained", async () => {
    const pc = computer("linux", ["apt-get"]);
    await expect(planSetup(pc.ctx, { tools: "all", manager: "dnf" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(planSetup(pc.ctx, { tools: "all", manager: "rm -rf /" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(planSetup(pc.ctx, { tools: [], manager: "apt" })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
    await expect(planSetup(pc.ctx, { tools: ["not-a-tool", 5, null], manager: "apt" })).rejects.toBeInstanceOf(FmError);
    const ok = await planSetup(pc.ctx, { tools: ["pandoc", "evil; rm -rf /"], manager: "apt" });
    expect(ok.tools.map((t) => t.id)).toEqual(["pandoc"]);
    expect(ok.script).not.toContain("evil");
  });

  test("shellQuote survives hostile text", () => {
    for (const text of ["plain", "it's", "a b", "$(touch x)", "`x`", "a'; echo hacked; '", "new\nline"]) {
      expect(Bun.spawnSync(["sh", "-c", `printf %s ${shellQuote(text)}`]).stdout.toString()).toBe(text);
    }
  });

  test("every catalog package name passes the name check (so no real program is refused)", async () => {
    for (const manager of ["apt", "dnf", "pacman"] as const) {
      const pc = computer("linux", [manager === "apt" ? "apt-get" : manager]);
      await planSetup(pc.ctx, { tools: "all", manager });
    }
    await planSetup(computer("darwin", ["brew"]).ctx, { tools: "all" });
    for (const id of TOOL_IDS) expect(TOOLS[id].name.length).toBeGreaterThan(0);
  });
});

suite("running the script against stand-in installers", () => {
  /** Runs a plan's script with a fake `sudo`, `apt-get` and `brew` that only write what they were asked to a log. */
  function run(plan: { path: string }, pc: ReturnType<typeof computer>, env: Record<string, string> = {}) {
    const log = join(pc.dir, "calls.log");
    const fake = (name: string, body: string) => {
      writeFileSync(join(pc.bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(pc.bin, name), 0o755);
    };
    fake("sudo", 'if [ "$1" = "-v" ]; then exit 0; fi\nexec "$@"');
    fake("apt-get", `echo "apt-get $*" >> "${log}"\ncase "$*" in *imagemagick*) exit 100;; esac\nexit 0`);
    // On the PATH, so the script finds this one and never a real Homebrew.
    writeFileSync(join(pc.bin, "brew"), `#!/bin/sh\nif [ "$1" = "shellenv" ]; then echo "export PATH=/fake/brew/bin:\\$PATH"; exit 0; fi\necho "brew $*" >> "${log}"\ncase "$*" in *pandoc*) exit 1;; esac\nexit 0\n`);
    chmodSync(join(pc.bin, "brew"), 0o755);
    const res = Bun.spawnSync(["bash", plan.path], { env: { PATH: `${pc.bin}:/usr/bin:/bin`, HOME: pc.home, SHELL: "/bin/bash", ...env }, stdin: "ignore" });
    return { code: res.exitCode, out: res.stdout.toString(), calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
  }

  test("apt: updates once, installs each program, and reports the one that failed without stopping", async () => {
    const pc = computer("linux", ["apt-get"]);
    const plan = await planSetup(pc.ctx, { tools: ["ffmpeg", "imagemagick", "pandoc"], manager: "apt" });
    const r = run(plan, pc);
    expect(r.calls).toEqual(["apt-get update", "apt-get install -y ffmpeg", "apt-get install -y imagemagick", "apt-get install -y pandoc"]);
    expect(r.out).toContain("Some programs did not install: ImageMagick");
    expect(r.out).toContain("Check again");
  });

  test("Homebrew already there: installs each program (casks with --cask), adds the shell line once, never downloads Homebrew", async () => {
    const pc = computer("darwin", []);
    const plan = await planSetup(pc.ctx, { tools: ["ffmpeg", "libreoffice", "pandoc"], manager: "brew" });
    const r = run(plan, pc);
    expect(r.calls).toEqual(["brew install ffmpeg-full", "brew install --cask libreoffice", "brew install pandoc"]);
    expect(r.out).toContain("Some programs did not install: pandoc");
    expect(r.out).not.toContain("Homebrew is not installed yet");
    const profile = ["/.profile", "/.bash_profile", "/.zprofile"].map((f) => pc.home + f).find((f) => existsSync(f))!;
    const text = readFileSync(profile, "utf8");
    expect(text.match(/brew shellenv/g)!.length).toBe(1);
    expect(text).toContain(`${pc.bin}/brew shellenv`);
    run(plan, pc);
    expect(readFileSync(profile, "utf8").match(/brew shellenv/g)!.length).toBe(1);
    expect(readFileSync(profile, "utf8")).toContain("Added by Codecaine File Manager");
  });
});

describe("the operations", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  const TOKEN = "setup-token";
  const pc = computer("linux", ["apt-get"]);
  beforeAll(() => {
    server = startFileManagerServer({ port: 0, token: TOKEN, context: { platform: "linux", home: pc.home, dataDir: join(pc.dir, "data"), toolDirs: [pc.bin] } });
  });
  afterAll(() => server.stop(true));
  const post = async (op: string, body: unknown = {}, token: string | null = TOKEN) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("the options need the token and describe the choices", async () => {
    expect((await post("tools/setup/options", {}, null)).status).toBe(401);
    const r = await post("tools/setup/options");
    expect(r.status).toBe(200);
    expect(r.json.choices.map((c: any) => c.id)).toEqual(["apt", "brew"]);
  });

  test("setup needs confirmation and the token, then returns the command and the script", async () => {
    expect((await post("tools/setup", { tools: "all" }, null)).status).toBe(401);
    const unconfirmed = await post("tools/setup", { tools: "all", manager: "apt" });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.json.error.code).toBe("NEEDS_CONFIRM");
    const ok = await post("tools/setup", { tools: ["pandoc"], manager: "apt", confirm: true });
    expect(ok.status).toBe(200);
    expect(ok.json.command).toMatch(/^bash '.*install_helper_programs\.sh'$/);
    expect(ok.json.script).toContain("try 'pandoc' 'pandoc'");
    const bad = await post("tools/setup", { tools: ["pandoc"], manager: "zypper", confirm: true });
    expect(bad.status).toBe(400);
  });
});
