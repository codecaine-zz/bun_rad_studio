import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  DOWNLOADS,
  downloadPage,
  linuxInstallScript,
  readmeFor,
} from "../scripts/release/build_file_manager";
import { TARGETS, listSourceApps } from "../scripts/release/common";
import { installScript, readme, unixLauncher } from "../scripts/release/suite";

const dirs: string[] = [];
afterAll(() =>
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

function fixture(
  name = "release folder",
  scriptText = linuxInstallScript(),
  executable = "codecaine-file-manager",
) {
  const dir = mkdtempSync(join(tmpdir(), "fm-linux-install-"));
  dirs.push(dir);
  const root = join(dir, name);
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(root);
  mkdirSync(home);
  mkdirSync(bin);
  const script = join(root, "install.sh");
  writeFileSync(script, scriptText);
  mkdirSync(join(root, "runtime"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, executable), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(root, "bin", "calculator-studio"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  const commands = join(dir, "commands");
  const profile = join(dir, "profile");
  writeFileSync(
    join(bin, "sudo"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$COMMANDS"
case "$1" in
  install) cp "$4" "$PROFILE_COPY" ;;
  *) "$@" ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "apparmor_parser"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$COMMANDS"
case "$1" in
  --skip-kernel-load) cp "$3" "$PROFILE_COPY"; exit "\${VALIDATE_EXIT:-0}" ;;
  -r) exit "\${LOAD_EXIT:-0}" ;;
esac
`,
    { mode: 0o755 },
  );
  const run = (args: string[], env: Record<string, string> = {}) =>
    Bun.spawnSync(["sh", script, ...args], {
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}:${process.env.PATH}`,
        COMMANDS: commands,
        PROFILE_COPY: profile,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

  return { dir, root, home, script, commands, profile, run };
}

describe.skipIf(process.platform === "win32")("all Linux suite desktop apps", () => {
  const apps = listSourceApps().filter((app) => app.kind === "gui");
  const cliNames = listSourceApps()
    .filter((app) => app.kind === "cli")
    .map((app) => app.name);
  const guiNames = apps.map((app) => app.name);

  for (const target of TARGETS.filter((t) => t.os === "linux" && t.gui)) {
    test(`${target.id}: every app uses the exact shared runtime covered by the profile`, () => {
      expect(apps.length).toBeGreaterThan(60);
      for (const app of apps) {
        const launcher = unixLauncher(app, target);
        expect(launcher).toContain(
          `exec "$ROOT/runtime/bun" "$ROOT/apps/${app.name}.js" "$@"`,
        );
        expect(launcher).toContain("export BUN_BE_BUN=1");
      }
      const f = fixture(
        "suite folder",
        installScript(guiNames, target),
        "runtime/bun",
      );
      expect(Bun.spawnSync(["sh", "-n", f.script]).exitCode).toBe(0);
      const result = f.run(["--apparmor"]);
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      const profile = readFileSync(f.profile, "utf8");
      expect(profile).toContain(
        `profile bun-rad-studio "${realpathSync(f.root)}/runtime/bun" flags=(unconfined)`,
      );
      expect(profile).toContain("  userns,");
      expect(profile).not.toContain("*");
      expect(profile).not.toContain("/usr/bin/bun");
      expect(readFileSync(f.commands, "utf8")).toContain(
        "-r /etc/apparmor.d/bun-rad-studio",
      );
      const instructions = readme(target, guiNames, cliNames);
      expect(instructions).toContain("sh install.sh --apparmor");
      expect(instructions).toContain("all desktop apps");
      if (existsSync("/usr/sbin/apparmor_parser")) {
        const checked = Bun.spawnSync([
          "/usr/sbin/apparmor_parser",
          "--skip-kernel-load",
          "--skip-cache",
          f.profile,
        ]);
        expect(checked.exitCode, checked.stderr.toString()).toBe(0);
      }
    });

    test(`${target.id}: ordinary install/uninstall stays unprivileged`, () => {
      const f = fixture(
        "suite",
        installScript(guiNames, target),
        "runtime/bun",
      );
      expect(f.run([]).exitCode).toBe(0);
      expect(
        readFileSync(join(f.home, ".local/share/applications/bun-rad-studio-calculator-studio.desktop"), "utf8"),
      ).toContain(`Exec="${realpathSync(f.root)}/bin/calculator-studio"\n`);
      expect(f.run(["--uninstall"]).exitCode).toBe(0);
      expect(existsSync(f.commands)).toBe(false);
    });
  }

  test("CLI-only musl and macOS installers do not request AppArmor permissions", () => {
    for (const target of TARGETS.filter(
      (t) => t.os === "macos" || (t.os === "linux" && !t.gui),
    )) {
      const names = target.gui ? guiNames : [];
      const script = installScript(names, target);
      expect(script).not.toContain("sudo");
      expect(script).not.toContain("userns,");
      expect(
        Bun.spawnSync(["sh", "-n"], { stdin: Buffer.from(script) }).exitCode,
      ).toBe(0);
      const f = fixture("suite", script, "runtime/bun");
      expect(f.run(["--apparmor"]).exitCode).not.toBe(0);
      expect(existsSync(f.commands)).toBe(false);
    }
  });
});

describe.skipIf(process.platform === "win32")("File Manager Linux release installer", () => {
  test("valid POSIX shell; plain install and uninstall do not invoke sudo", () => {
    const f = fixture();
    expect(Bun.spawnSync(["sh", "-n", f.script]).exitCode).toBe(0);
    expect(f.run([]).exitCode).toBe(0);
    const link = join(f.home, ".local/bin/codecaine-file-manager");
    expect(readlinkSync(link)).toBe(realpathSync(join(f.root, "codecaine-file-manager")));
    expect(
      readFileSync(
        join(
          f.home,
          ".local/share/applications/codecaine-file-manager.desktop",
        ),
        "utf8",
      ),
    ).toContain("Terminal=false");
    expect(
      readFileSync(join(f.home, ".local/share/applications/codecaine-file-manager.desktop"), "utf8"),
    ).toContain(`Exec="${realpathSync(f.root)}/codecaine-file-manager"\n`);
    expect(f.run(["--uninstall"]).exitCode).toBe(0);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(f.commands)).toBe(false);
  });

  test("opt-in validates then installs and loads an exact-path profile, preserving the sandbox", () => {
    const f = fixture();
    const result = f.run(["--apparmor"]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const profile = readFileSync(f.profile, "utf8");
    expect(profile).toBe(`abi <abi/4.0>,
include <tunables/global>

profile codecaine-file-manager "${realpathSync(f.root)}/codecaine-file-manager" flags=(unconfined) {
  userns,
}
`);
    const commands = readFileSync(f.commands, "utf8");
    expect(commands.indexOf("--skip-kernel-load --skip-cache")).toBeLessThan(
      commands.indexOf("install -m 644"),
    );
    expect(commands).toContain("-r /etc/apparmor.d/codecaine-file-manager");
    expect(linuxInstallScript()).not.toContain("DISABLE_SANDBOX");
    expect(linuxInstallScript()).not.toContain("sysctl -w");
    const validation = commands.split("\n")[0]!.split(" ").at(-1)!;
    expect(existsSync(validation)).toBe(false);
    if (existsSync("/usr/sbin/apparmor_parser")) {
      const checked = Bun.spawnSync([
        "/usr/sbin/apparmor_parser",
        "--skip-kernel-load",
        "--skip-cache",
        f.profile,
      ]);
      expect(checked.exitCode, checked.stderr.toString()).toBe(0);
    }
  });

  test.each([
    "glob*path",
    "question?path",
    "bracket[path",
    "brace{path",
    'quote"path',
    "slash\\path",
    "line\npath",
  ])("rejects unsafe attachment path %j before sudo", (name) => {
    const f = fixture(name);
    const result = f.run(["--apparmor"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("move the download");
    expect(existsSync(f.commands)).toBe(false);
  });

  test("validation failures stop before privileged installation and clean temporary files", () => {
    const f = fixture();
    expect(f.run(["--apparmor"], { VALIDATE_EXIT: "1" }).exitCode).not.toBe(0);
    const commands = readFileSync(f.commands, "utf8");
    expect(commands).not.toContain("install -m");
    expect(existsSync(commands.trim().split(" ").at(-1)!)).toBe(false);
    expect(existsSync(join(f.home, ".local/bin/codecaine-file-manager"))).toBe(
      false,
    );
  });

  test("profile load errors are not reported as successful installation", () => {
    const f = fixture();
    const result = f.run(["--apparmor"], { LOAD_EXIT: "1" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString()).not.toContain("AppArmor profile loaded");
    expect(result.stdout.toString()).not.toContain("Installed.");
  });

  test("explicit uninstall unloads the profile before deleting it; plain uninstall preserves it", () => {
    const target = TARGETS.find((t) => t.id === "linux-arm64")!;
    for (const [script, profileName, executable] of [
      [
        linuxInstallScript(),
        "codecaine-file-manager",
        "codecaine-file-manager",
      ],
      [
        installScript(["calculator-studio"], target),
        "bun-rad-studio",
        "runtime/bun",
      ],
    ] as const) {
      const f = fixture("uninstall", script, executable);
      writeFileSync(
        f.script,
        script.replaceAll(`/etc/apparmor.d/${profileName}`, f.profile),
      );
      writeFileSync(f.profile, "existing profile");
      expect(f.run(["--uninstall"]).exitCode).toBe(0);
      expect(existsSync(f.profile)).toBe(true);
      expect(existsSync(f.commands)).toBe(false);
      expect(f.run(["--uninstall", "--apparmor"]).exitCode).toBe(0);
      expect(existsSync(f.profile)).toBe(false);
      const commands = readFileSync(f.commands, "utf8");
      expect(commands.indexOf(`-R ${f.profile}`)).toBeLessThan(
        commands.indexOf(`rm -f ${f.profile}`),
      );
    }
  });

  test("missing executable and unknown flags fail explicitly", () => {
    const f = fixture();
    chmodSync(join(f.root, "codecaine-file-manager"), 0o644);
    expect(f.run(["--apparmor"]).stderr.toString()).toContain(
      "Missing executable",
    );
    expect(existsSync(f.commands)).toBe(false);
    const result = f.run(["--unknown"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Usage:");
  });

  test("all Linux downloads document the opt-in, relocation and uninstall", () => {
    for (const d of DOWNLOADS.filter((d) => d.os === "linux")) {
      const readme = readmeFor(d);
      expect(readme).toContain("sh install.sh --apparmor");
      expect(readme).toContain("after moving");
      expect(readme).toContain("--uninstall --apparmor");
    }
    expect(downloadPage([])).toContain("sh install.sh --apparmor");
    expect(readmeFor(DOWNLOADS.find((d) => d.os === "windows")!)).not.toContain(
      "--apparmor",
    );
  });
});
