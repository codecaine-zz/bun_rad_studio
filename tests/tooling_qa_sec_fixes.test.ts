/**
 * Regression suite for Slice 5 (Tooling, Packaging, Release Scripts, Test Harness, CI & Docs):
 *   - [V-QA-01]: jsdom UI test harness (`ui_harness.mjs` + `run_ui_suite.ts`) executes real assertions under Bun shim
 *   - [V-QA-02]: Homebrew Formula (`libexec/bin` `write_exec_script`, GTK4, package.json version), wrapper up-to-date check, portable installer loop
 *   - [V-QA-03]: Windows `run.ps1` PE `0x8664` check, no hardcoded user path, synced `NON_APP_MODULES`
 *   - [V-QA-12]: `release_publish.ts` asset preflight, auth lookup, dry-run safety, `GIT_TERMINAL_PROMPT=0` timeout, isolated run dirs
 *   - [V-QA-13]: CI cache + `fmt:check` + `showcase:check` gates
 *   - [V-QA-18]: `SECURITY.md` & `docs/security.md` private disclosure reconciliation + dynamic app counts
 *   - [V-SEC-04] & [V-OPT-10]: Streaming SHA-256 verification, `mkdtempSync` (`0o700`), `--no-same-owner`, fail-closed `HOME`
 *   - [V-SEC-05]: Hardened AppArmor 4.0 `deny userns,` parent + `bwrap` child transition, no unconfined `.deb` `postinst`
 *   - [V-SEC-11] & [V-SEC-20]: `hostApp` WebSocket `guardLocalRequest`, `infoPlist` ATS, `downloadPage` `\u003c` escape, argv `Bun.which`
 *   - [V-OPT-07] & [V-OPT-14]: Incremental `tsconfig.json`, parallel `makeIcns`, `test:fast` sharding
 */
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SimpleWindow } from "../src/simplegui";
import { NON_APP_MODULES } from "../applications/launcher_studio";
import {
  areWrappersUpToDate,
  readSuiteVersion,
} from "../scripts/generate_brew_suite";
import {
  isPeX64,
  makePrivateStageDir,
  parseSha256SumsFile,
  sha256Hex,
  verifySha256Hex,
} from "../scripts/fix_windows_webview_runtime";
import {
  appArmorProfileFor,
  linuxOllamaInstallScript,
  linuxSandboxSetup,
} from "../scripts/release/linuxSandbox";
import { debPostinstScript } from "../scripts/release/linuxPackages";
import {
  infoPlist,
  launcherScript as macLauncherScript,
  type MacApp,
} from "../scripts/release/build_mac_apps";
import { TARGETS } from "../scripts/release/common";
import { downloadPage } from "../scripts/release/build_file_manager";
import { unixLauncher } from "../scripts/release/suite";
import {
  resolveGitHubToken,
  verifyLocalAssetReadable,
} from "../scripts/release_publish";
import { hostApp } from "../scripts/lib/host_app";
import { isToolInstalled } from "../scripts/install_dependencies";
import { parseFastArgs, planTestShards } from "../scripts/test_fast";
import { parseUiHarnessCounts, runUiSuiteAsync } from "./helpers/run_ui_suite";

const ROOT = resolve(import.meta.dir, "..");

describe("[V-QA-01] jsdom UI test harness & Bun shim resilience", () => {
  test("parseUiHarnessCounts extracts TAP-style summary counters accurately", () => {
    const out = [
      "ok 1 - suite > renders widget",
      "ok 2 - suite > skips optional # SKIP",
      "# tests 2",
      "# pass 1",
      "# skip 1",
      "# fail 0",
    ].join("\n");
    expect(parseUiHarnessCounts(out)).toEqual({
      tests: 2,
      pass: 1,
      skip: 1,
      fail: 0,
    });
  });

  test("runUiSuiteAsync fails closed when a .node.mjs suite exits 0 with 0 tests or throws uncaught errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ui-harness-check-"));
    try {
      const zeroScript = join(dir, "empty.node.mjs");
      writeFileSync(zeroScript, 'console.log("nothing ran");\n', "utf8");
      const zeroRes = await runUiSuiteAsync(zeroScript, {}, ROOT);
      expect(zeroRes.code).not.toBe(0);
      expect(zeroRes.pass).toBe(0);

      const passScript = join(dir, "real.node.mjs");
      const harnessUrl = JSON.stringify(
        join(ROOT, "tests", "helpers", "ui_harness.mjs"),
      );
      writeFileSync(
        passScript,
        `import assert from "node:assert/strict";\nimport { describe, it } from ${harnessUrl};\ndescribe("mini", () => { it("executes", () => { assert.equal(2 + 2, 4); }); });\n`,
        "utf8",
      );
      const okRes = await runUiSuiteAsync(passScript, {}, ROOT);
      expect(okRes.code).toBe(0);
      expect(okRes.pass).toBe(1);
      expect(okRes.fail).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("[V-QA-02] Homebrew Formula, dynamic version & POSIX installer", () => {
  test("Formula preserves libexec/bin layout via write_exec_script, uses GTK4 on Linux, and matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const formula = readFileSync(
      join(ROOT, "Formula", "codecaine-utility-suite.rb"),
      "utf8",
    );
    expect(readSuiteVersion()).toBe(pkg.version);
    expect(formula).toContain(`version "${pkg.version}"`);
    expect(formula).toContain("bin.write_exec_script");
    expect(formula).not.toContain('bin.install Dir["#{libexec}/bin/*"]');
    expect(formula).toContain('depends_on "gtk4"');
    expect(formula).not.toContain('depends_on "gtk+3"');
    expect(areWrappersUpToDate()).toBe(true);
  });

  test("install_homebrew_suite.sh avoids macOS-only `find -perm +111`", () => {
    const sh = readFileSync(join(ROOT, "install_homebrew_suite.sh"), "utf8");
    expect(sh).not.toContain("-perm +111");
    expect(sh).toContain('[ -f "$f" ] && [ -x "$f" ]');
  });
});

describe("[V-QA-03] & [V-SEC-04] Windows runtime & launcher hardening", () => {
  test("run.ps1 checks PE 0x8664, removes hardcoded user path, verifies SHA-256, and matches NON_APP_MODULES", () => {
    const ps1 = readFileSync(join(ROOT, "run.ps1"), "utf8");
    expect(ps1).not.toContain("C:\\Users\\codecaine");
    expect(ps1).not.toContain("SysWOW64");
    expect(ps1).toContain("0x8664");
    expect(ps1).toContain("Test-PeMachineX64");
    expect(ps1).toContain("Get-ExpectedSha256FromSums");
    expect(ps1).toContain("SHASUMS256.txt");

    expect(NON_APP_MODULES.size).toBeGreaterThanOrEqual(5);
    for (const modName of NON_APP_MODULES) {
      expect(ps1.includes(`'${modName}'`) || ps1.includes(`"${modName}"`)).toBe(
        true,
      );
    }
  });

  test("fix_windows_webview_runtime helpers validate PE x64, private 0700 stage dirs, and SHA-256 manifests", () => {
    const stage = makePrivateStageDir("win-sec-test-");
    try {
      if (process.platform !== "win32") {
        expect(statSync(stage).mode & 0o777).toBe(0o700);
      }
      // Synthetic minimal PE header with Machine = 0x8664 vs 0xaa64 (ARM64)
      const makePe = (machine: number) => {
        const buf = Buffer.alloc(128);
        buf.write("MZ", 0, "ascii");
        buf.writeUInt32LE(64, 0x3c);
        buf.write("PE\0\0", 64, "ascii");
        buf.writeUInt16LE(machine, 68);
        return buf;
      };
      const x64Dll = join(stage, "x64.dll");
      const armDll = join(stage, "arm64.dll");
      writeFileSync(x64Dll, makePe(0x8664));
      writeFileSync(armDll, makePe(0xaa64));
      expect(isPeX64(x64Dll)).toBe(true);
      expect(isPeX64(armDll)).toBe(false);

      const sample = new TextEncoder().encode("verified-archive-payload");
      const digest = sha256Hex(sample);
      const sums = `${digest}  *bun-windows-x64-baseline.zip\n`;
      expect(parseSha256SumsFile(sums, "bun-windows-x64-baseline.zip")).toBe(
        digest,
      );
      expect(() =>
        verifySha256Hex(sample, digest, "bun-windows-x64-baseline.zip"),
      ).not.toThrow();
      expect(() =>
        verifySha256Hex(sample, "0".repeat(64), "bun-windows-x64-baseline.zip"),
      ).toThrow(/SHA-256 verification failed/);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});

describe("[V-SEC-04], [V-SEC-05] & [V-OPT-10] Linux AppArmor, .deb postinst & streaming Ollama installer", () => {
  test("appArmorProfileFor denies userns on BUN_BE_BUN parent and transitions only bwrap / xdg-dbus-proxy", () => {
    const profile = appArmorProfileFor(
      "codecaine-file-manager",
      "/opt/codecaine-file-manager/codecaine-file-manager",
    );
    expect(profile).toContain("abi <abi/4.0>,");
    expect(profile).toContain("flags=(default_allow)");
    expect(profile).toContain("deny userns,");
    expect(profile).toContain("/usr/bin/bwrap Cx -> bwrap,");
    expect(profile).toContain("/usr/bin/xdg-dbus-proxy Cx -> bwrap,");
    expect(profile).not.toContain("flags=(unconfined)");
    expect(profile).not.toContain("*");
  });

  test("linuxSandboxSetup fails closed if mktemp fails and debPostinstScript never installs unconfined profiles", () => {
    const setup = linuxSandboxSetup(
      "codecaine-file-manager",
      "codecaine-file-manager",
    );
    expect(setup).toContain('TMP_PROFILE="$(mktemp)"');
    expect(setup).toContain('chmod 600 "$TMP_PROFILE"');
    expect(setup).not.toContain("/tmp/codecaine-fm-apparmor.$$");

    const postinst = debPostinstScript();
    expect(postinst).not.toContain("cat >");
    expect(postinst).not.toContain("/tmp/codecaine-fm-apparmor.$$");
    // Cleans up legacy unconfined profile if present from older releases
    expect(postinst).toContain('grep -q "flags=(unconfined)"');
  });

  test("linuxOllamaInstallScript fails closed without HOME, streams with CryptoHasher, and extracts with --no-same-owner", () => {
    const script = linuxOllamaInstallScript("runtime/bun");
    expect(script).toContain(
      'if [ -z "${HOME:-}" ] || [ "${HOME}" = "/tmp" ] || [ "${HOME}" = "/var/tmp" ]',
    );
    expect(script).toContain('mkdtempSync(join(tmpdir(), "ollama-install-"))');
    expect(script).toContain("chmodSync(stageDir, 0o700)");
    expect(script).toContain('new Bun.CryptoHasher("sha256")');
    expect(script).toContain("writer.write(value)");
    expect(script).toContain('"--no-same-owner"');
    expect(script).not.toContain("zstdDecompressSync");
    expect(script).not.toContain("arrayBuffer()");

    if (process.platform !== "win32") {
      const tmp = mkdtempSync(join(tmpdir(), "ollama-home-guard-"));
      try {
        const shPath = join(tmp, "install-ollama.sh");
        writeFileSync(shPath, script, { mode: 0o755 });
        const noHome = Bun.spawnSync(["sh", shPath], {
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "" },
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(noHome.exitCode).not.toBe(0);
        expect(noHome.stderr.toString("utf8")).toContain(
          "Refusing to install Ollama without a valid HOME",
        );

        const tmpHome = Bun.spawnSync(["sh", shPath], {
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp" },
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(tmpHome.exitCode).not.toBe(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  });
});

describe("[V-QA-12], [V-SEC-11] & [V-SEC-20] Release publisher, isolated run dirs & local host guard", () => {
  test("verifyLocalAssetReadable rejects missing or empty archives and accepts valid files", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-asset-check-"));
    try {
      expect(() => verifyLocalAssetReadable(join(dir, "missing.zip"))).toThrow(
        /missing on disk/,
      );
      const empty = join(dir, "empty.zip");
      writeFileSync(empty, "");
      expect(() => verifyLocalAssetReadable(empty)).toThrow(/non-empty/);
      const valid = join(dir, "valid.zip");
      writeFileSync(valid, "PK\x03\x04payload");
      expect(verifyLocalAssetReadable(valid)).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolveGitHubToken honors explicit env tokens and never hangs interactively", async () => {
    const prevGh = process.env.GH_TOKEN;
    const prevGithub = process.env.GITHUB_TOKEN;
    try {
      process.env.GH_TOKEN = "example-test-token-value";
      expect(await resolveGitHubToken({ timeoutMs: 250 })).toBe(
        "example-test-token-value",
      );
    } finally {
      if (prevGh === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = prevGh;
      if (prevGithub === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prevGithub;
    }
  });

  test("packaged launchers isolate ~/.bun_rad_studio/run/<appId>-<version> and macOS Info.plist omits NSAllowsArbitraryLoadsInWebContent", () => {
    const sampleMacApp: MacApp = {
      id: "pong-studio",
      title: "Pong Studio",
      emoji: "🏓",
      category: "Games",
      source: {
        name: "pong-studio",
        entry: "applications/pong_studio.ts",
        kind: "gui",
      },
    };
    const plist = infoPlist(sampleMacApp, "AppIcon");
    expect(plist).toContain("<key>NSAllowsLocalNetworking</key><true/>");
    expect(plist).not.toContain("NSAllowsArbitraryLoadsInWebContent");

    const macLauncher = macLauncherScript(sampleMacApp);
    expect(macLauncher).toContain(
      `WORK="$HOME/.bun_rad_studio/run/pong-studio-${readSuiteVersion()}"`,
    );

    const linuxTarget = TARGETS.find((t) => t.id === "linux-x64")!;
    const linuxLauncher = unixLauncher(sampleMacApp.source, linuxTarget);
    expect(linuxLauncher).toContain(
      `WORK="\${HOME}/.bun_rad_studio/run/pong-studio-${readSuiteVersion()}"`,
    );
  });

  test("downloadPage escapes `<` as \\u003c inside inline FILES script JSON", () => {
    const html = downloadPage([
      {
        d: {
          id: "linux-x64",
          os: "linux",
          arch: "x64",
          from: "linux-x64",
          label: "Linux </script><script>alert(1)</script>",
          hint: "hint",
        },
        file: "Codecaine-File-Manager-v1.5.3-linux-x64.zip",
        bytes: 1024 * 1024,
      },
    ]);
    const scriptMatch = /const FILES = ([^\n]+);/.exec(html);
    expect(scriptMatch).not.toBeNull();
    expect(scriptMatch![1]).not.toContain("</script>");
    expect(scriptMatch![1]).toContain("\\u003c/script>");
  });

  test("hostApp enforces guardLocalRequest on both HTTP `/` and `/ws` upgrade requests", async () => {
    const hosted = await hostApp(() => {
      const w = new SimpleWindow("Guard Check", 320, 200);
      w.addLabel("lbl", "hello");
      return w;
    });
    try {
      const okRes = await fetch(hosted.url);
      expect(okRes.status).toBe(200);

      const evilPage = await fetch(hosted.url, {
        headers: { Origin: "https://attacker.example" },
      });
      expect(evilPage.status).toBe(403);

      const evilWs = await fetch(new URL("/ws", hosted.url), {
        headers: {
          Origin: "https://attacker.example",
          Connection: "Upgrade",
          Upgrade: "websocket",
        },
      });
      expect(evilWs.status).toBe(403);
    } finally {
      hosted.stop();
    }
  });

  test("isToolInstalled resolves binaries via Bun.which without shell evaluation", () => {
    const bogus = isToolInstalled({
      category: "Test",
      formula: "nonexistent",
      binNames: ["definitely_missing_bin_xyz; echo INJECTED"],
      name: "Bogus",
      description: "Test",
      studioApp: "Test",
    });
    expect(bogus.installed).toBe(false);
  });
});

describe("[V-OPT-07], [V-OPT-14] & [V-QA-18] Incremental tsconfig, CI gates, test:fast & security policy alignment", () => {
  test("tsconfig.json enables incremental tsbuildinfo and excludes pre-bundled static JS assets", () => {
    const tsconfig = Bun.JSONC.parse(
      readFileSync(join(ROOT, "tsconfig.json"), "utf8"),
    ) as {
      compilerOptions: { incremental?: boolean; tsBuildInfoFile?: string };
      exclude: string[];
    };
    expect(tsconfig.compilerOptions.incremental).toBe(true);
    expect(tsconfig.compilerOptions.tsBuildInfoFile).toBe(
      ".cache/tsconfig.tsbuildinfo",
    );
    expect(tsconfig.exclude).toContain("resources/paint/coloring_library.js");
    expect(tsconfig.exclude).toContain("resources/file_manager/ui/themes.js");
    expect(tsconfig.exclude).toContain("resources/universal_calculator/**");
  });

  test("planTestShards isolates GUI/port-sensitive suites into serial bucket and balances parallel shards", () => {
    const sampleFiles = [
      "tests/alpha.test.ts",
      "tests/beta.test.ts",
      "tests/gamma.test.ts",
      "tests/launcher.test.ts",
      "tests/enterprise_gui_interactive.test.ts",
    ];
    const plan = planTestShards(sampleFiles, 2, (f) => f.length * 1000);
    expect(plan.serial).toEqual([
      "tests/launcher.test.ts",
      "tests/enterprise_gui_interactive.test.ts",
    ]);
    expect(plan.shards).toHaveLength(2);
    expect(plan.shards.flat().sort()).toEqual([
      "tests/alpha.test.ts",
      "tests/beta.test.ts",
      "tests/gamma.test.ts",
    ]);
    expect(parseFastArgs(["--jobs", "3", "--timeout", "15000"])).toEqual({
      jobs: 3,
      timeoutMs: 15000,
      filter: null,
    });
  });

  test("CI workflow runs fmt:check, showcase:check, and actions/cache while keeping informational bun audit", () => {
    const ci = readFileSync(
      join(ROOT, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    expect(ci).toContain("actions/cache@v4");
    expect(ci).toContain("bun run fmt:check");
    expect(ci).toContain("bun run showcase:check");
    expect(ci).toContain("bun audit || true");
  });

  test("SECURITY.md and docs/security.md align on current release support and private vulnerability reporting", () => {
    const secPolicy = readFileSync(join(ROOT, "SECURITY.md"), "utf8");
    const secDoc = readFileSync(join(ROOT, "docs", "security.md"), "utf8");
    expect(secPolicy).toContain(`v${readSuiteVersion()}`);
    expect(secPolicy).toContain("/security/advisories/new");
    expect(secPolicy).not.toContain("The project has no versioned releases.");
    expect(secDoc).toContain("[SECURITY.md](../SECURITY.md)");
    expect(secDoc).not.toContain("The repository has no security policy file");
    expect(existsSync(join(ROOT, "SECURITY.md"))).toBe(true);
  });
});
