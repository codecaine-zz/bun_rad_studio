import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as nodePath from "path";
import type { FmContext } from "../src/features/filemanager/fmCore";
import {
  executeDbMacro,
  macroOperations,
} from "../src/features/filemanager/fmDbMacros";
import { DownloadManager } from "../src/features/filemanager/fmDownloads";
import { interfacesAnswer } from "../src/features/filemanager/fmIpCalc";
import { lookupAnswer } from "../src/features/filemanager/fmIpLookup";
import { updateSettings } from "../src/features/filemanager/fmSettings";
import {
  collectSysinfoOverview,
  collectSysinfoSection,
  runSysinfoProbe,
} from "../src/features/filemanager/fmSysinfo";
import { collectTaskSnapshot } from "../src/features/filemanager/fmTaskManager";
import { moveToTrash } from "../src/features/filemanager/fmTrash";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(nodePath.join(os.tmpdir(), prefix));
}

function makeTestCtx(root: string): FmContext {
  const home = nodePath.join(root, "home");
  const dataDir = nodePath.join(root, "data");
  const trashRoot = nodePath.join(dataDir, "trash");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  return {
    home,
    dataDir,
    trashRoot,
    disposers: [],
    platform:
      process.platform === "win32"
        ? "win32"
        : process.platform === "linux"
          ? "linux"
          : "darwin",
  } as unknown as FmContext;
}

const origScreenshotMode = process.env.SCREENSHOT_MODE;

afterEach(() => {
  if (origScreenshotMode === undefined) {
    delete process.env.SCREENSHOT_MODE;
  } else {
    process.env.SCREENSHOT_MODE = origScreenshotMode;
  }
});

describe("P1 DB Macro NEEDS_CONFIRM hardening", () => {
  test("blocks unconfirmed custom code macro and nested RunMacro -> code macro, but allows action-only RunMacro and confirmed code", async () => {
    const dir = makeTempDir("fm-hardening-macro-");
    try {
      const ctx = makeTestCtx(dir);

      // 1. Direct non-builtin mode === "code" macro must require confirmation
      await expect(
        executeDbMacro(ctx, {
          target: { kind: "memory" },
          macro: {
            name: "Custom Code Unconfirmed",
            mode: "code",
            code: "return 42;",
          },
        }),
      ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });

      // 2. Confirmed non-builtin mode === "code" macro succeeds
      const confirmedRes = await executeDbMacro(ctx, {
        target: { kind: "memory" },
        confirmCode: true,
        macro: {
          name: "Custom Code Confirmed",
          mode: "code",
          code: "return 42;",
        },
      });
      expect(confirmedRes.ok).toBe(true);
      expect(confirmedRes.returnValue).toBe(42);

      // 3. Action macro calling RunMacro -> non-builtin code sub-macro must require confirmation
      await macroOperations["db/macros/save"]!(ctx, {
        macro: {
          name: "Hidden Code Sub",
          mode: "code",
          code: "return 'secret-code';",
        },
      });
      await expect(
        executeDbMacro(ctx, {
          target: { kind: "memory" },
          macro: {
            name: "Wrapper Action Macro",
            mode: "actions",
            actions: [
              {
                id: "s1",
                action: "RunMacro",
                enabled: true,
                params: { macroName: "Hidden Code Sub" },
              },
            ],
          },
        }),
      ).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });

      // 4. Wrapper with confirmCode: true succeeds
      const wrappedConfirmed = await executeDbMacro(ctx, {
        target: { kind: "memory" },
        confirmCode: true,
        macro: {
          name: "Wrapper Action Macro",
          mode: "actions",
          actions: [
            {
              id: "s1",
              action: "RunMacro",
              enabled: true,
              params: { macroName: "Hidden Code Sub" },
            },
          ],
        },
      });
      expect(wrappedConfirmed.ok).toBe(true);
      expect(wrappedConfirmed.returnValue).toBe("secret-code");

      // 5. Action-only RunMacro -> action-only sub-macro (no RunCode) works without confirmCode
      await macroOperations["db/macros/save"]!(ctx, {
        macro: {
          name: "Safe Action Sub",
          mode: "actions",
          actions: [
            {
              id: "a1",
              action: "SetTempVar",
              enabled: true,
              params: { name: "greeting", expression: "'hello'" },
            },
          ],
        },
      });
      const safeWrapped = await executeDbMacro(ctx, {
        target: { kind: "memory" },
        macro: {
          name: "Safe Wrapper",
          mode: "actions",
          actions: [
            {
              id: "s1",
              action: "RunMacro",
              enabled: true,
              params: { macroName: "Safe Action Sub" },
            },
          ],
        },
      });
      expect(safeWrapped.ok).toBe(true);
      expect(safeWrapped.tempVars.greeting).toBe("hello");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("P1 Atomic State Writes & P2 Download Loopback Guard", () => {
  test("fmDownloads blocks loopback even when start === false when allowLoopback is false", () => {
    const dir = makeTempDir("fm-hardening-dl-");
    try {
      const manager = new DownloadManager({
        file: nodePath.join(dir, "list.json"),
        defaultFolder: nodePath.join(dir, "out"),
        allowLoopback: false,
      });
      expect(() =>
        manager.add([
          { url: "http://127.0.0.1:9999/secret.bin", start: false },
        ]),
      ).toThrow(/loopback/i);
      expect(() =>
        manager.add([
          { url: "http://localhost:9999/secret.bin", start: false },
        ]),
      ).toThrow(/loopback/i);
      expect(manager.list().length).toBe(0);
      manager.closeAll();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fmSettings retries transient EBUSY on atomic rename without truncating in-place", async () => {
    const dir = makeTempDir("fm-hardening-settings-");
    const realRename = fs.promises.rename.bind(fs.promises);
    let calls = 0;
    const spy = spyOn(fs.promises, "rename").mockImplementation(
      async (from, to) => {
        calls++;
        if (calls === 1) {
          const err = new Error("busy") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return realRename(from, to);
      },
    );
    try {
      const ctx = makeTestCtx(dir);
      const updated = await updateSettings(ctx, { showHidden: true });
      expect(updated.showHidden).toBe(true);
      expect(calls).toBe(2);
      const leftovers = fs
        .readdirSync(ctx.dataDir)
        .filter((f) => f.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    } finally {
      spy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fmTrash retries transient EACCES on atomic rename and cleans up tmp on persistent error", async () => {
    const dir = makeTempDir("fm-hardening-trash-");
    const realRename = fs.promises.rename.bind(fs.promises);
    let calls = 0;
    const spy = spyOn(fs.promises, "rename").mockImplementation(
      async (from, to) => {
        if (String(to).endsWith("index.json")) {
          calls++;
          if (calls === 1) {
            const err = new Error("locked") as NodeJS.ErrnoException;
            err.code = "EACCES";
            throw err;
          }
        }
        return realRename(from, to);
      },
    );
    try {
      const ctx = makeTestCtx(dir);
      const sampleFile = nodePath.join(ctx.home, "sample.txt");
      fs.writeFileSync(sampleFile, "hello");
      const res = await moveToTrash(ctx, [sampleFile]);
      expect(res[0]?.ok).toBe(true);
      expect(calls).toBe(2);
      const leftovers = fs
        .readdirSync(ctx.trashRoot)
        .filter((f) => f.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    } finally {
      spy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fmDownloads .dlstate write uses temp sibling + renameSync and fmKindle uses 0o700 per-UID cache dir", () => {
    const dlSrc = fs.readFileSync(
      nodePath.join(process.cwd(), "src/features/filemanager/fmDownloads.ts"),
      "utf8",
    );
    expect(dlSrc).toContain("fs.renameSync(tmpStateFile, stateFile)");
    expect(dlSrc).not.toContain("allowLoopback: true");

    const kindleSrc = fs.readFileSync(
      nodePath.join(process.cwd(), "src/features/filemanager/fmKindle.ts"),
      "utf8",
    );
    expect(kindleSrc).toContain('bun-rad-kindle-swift-${uid ?? "user"}');
    expect(kindleSrc).toContain("mode: 0o700");
    expect(kindleSrc).toContain("dirStat.isSymbolicLink()");
  });
});

describe("P1 SCREENSHOT_MODE=1 privacy masking", () => {
  test("fmIpLookup returns synthetic demo data for myip without network call", async () => {
    process.env.SCREENSHOT_MODE = "1";
    const ans = await lookupAnswer("myip", undefined);
    expect(ans.kind).toBe("ip");
    if (ans.kind === "ip") {
      expect(ans.ip).toBe("203.0.113.42");
      expect(ans.source).toContain("demo");
      expect(ans.data.hostname).toBe("demo-workstation.example.net");
    }
  });

  test("fmIpCalc interfacesAnswer masks non-internal local IPs and MACs", () => {
    process.env.SCREENSHOT_MODE = "1";
    const ans = interfacesAnswer();
    for (const iface of ans.interfaces) {
      if (iface.internal) {
        expect(["127.0.0.1", "::1"]).toContain(iface.address);
      } else {
        if (iface.family === "IPv4") {
          expect(iface.address.startsWith("192.0.2.")).toBe(true);
        } else {
          expect(iface.address.startsWith("2001:db8::")).toBe(true);
        }
        expect(iface.mac.startsWith("02:00:00:00:00:")).toBe(true);
      }
    }
  });

  test("fmTaskManager collectTaskSnapshot masks currentUser, windowTitle, and home paths", async () => {
    process.env.SCREENSHOT_MODE = "1";
    const fakeUser = "alice_real";
    const snap = await collectTaskSnapshot("darwin", {
      currentUser: fakeUser,
      execCommand: async (cmd) => {
        if (cmd[0] === "lsof") {
          return {
            exitCode: 0,
            stdout: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n",
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: [
            "  PID  PPID  %CPU %MEM    RSS STAT USER       ELAPSED COMMAND",
            ` 4200     1   2.5  1.0  40960 S    ${fakeUser}   01:00 /Users/${fakeUser}/projects/secret-app/bin/server --cfg /Users/${fakeUser}/.env`,
          ].join("\n"),
          stderr: "",
        };
      },
    });
    expect(snap.currentUser).toBe("developer");
    const proc = snap.processes.find((p) => p.pid === "4200");
    expect(proc).toBeTruthy();
    expect(proc!.user).toBe("developer");
    expect(proc!.command).not.toContain(fakeUser);
    expect(proc!.command).toContain("/Users/developer/");
    expect(proc!.exePath).not.toContain(fakeUser);
    expect(proc!.exePath).toContain("/Users/developer/");

    // Windows snapshot with windowTitle
    const winSnap = await collectTaskSnapshot("win32", {
      currentUser: "CORP\\alice_real",
      execCommand: async (cmd) => {
        if (cmd[0] === "netstat") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              ProcessId: 5100,
              ParentProcessId: 100,
              Name: "code.exe",
              ExecutablePath: "C:\\Users\\alice_real\\AppData\\Local\\code.exe",
              CommandLine:
                "C:\\Users\\alice_real\\AppData\\Local\\code.exe C:\\Users\\alice_real\\secret.txt",
              WorkingSetSize: 104857600,
              CpuPercent: 1.5,
              Responding: true,
              UserName: "CORP\\alice_real",
              MainWindowTitle: "Confidential Tax Return 2026 - Editor",
              ElapsedSeconds: 60,
            },
          ]),
          stderr: "",
        };
      },
    });
    expect(winSnap.currentUser).toBe("developer");
    const winProc = winSnap.processes[0]!;
    expect(winProc.user).toBe("developer");
    expect(winProc.windowTitle).toBe("[Masked Window]");
    expect(winProc.command).not.toContain("alice_real");
    expect(winProc.exePath).not.toContain("alice_real");
  });

  test("fmSysinfo masks runSysinfoProbe, overview, network.raw, and software hostname", async () => {
    process.env.SCREENSHOT_MODE = "1";
    const probeRes = await runSysinfoProbe("bluetoothDevices", "", "darwin", {
      runProbe: async () => [
        {
          name: "Alice's Personal AirPods Pro",
          macDevice: "AA:BB:CC:DD:EE:FF",
          serialNumber: "SN-99887766",
          uri: "ipp://10.0.0.55/ipp/print",
          path: "/Users/alice_real/Documents/private",
        },
      ],
    });
    const probeJson = JSON.stringify(probeRes);
    expect(probeJson).not.toContain("Alice's Personal AirPods Pro");
    expect(probeJson).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(probeJson).not.toContain("SN-99887766");
    expect(probeJson).not.toContain("10.0.0.55");
    expect(probeJson).not.toContain("alice_real");

    const pubIpRes = await runSysinfoProbe("inetPublicIp", "", "darwin");
    expect((pubIpRes.data as any).v4).toBe("203.0.113.42");

    const ov = await collectSysinfoOverview("darwin");
    expect(ov.os.hostname).toBe("studio-workstation");
    expect(ov.os.user).toBe("developer");
    expect(ov.os.homeDir).toBe("/Users/developer");

    const soft = await collectSysinfoSection("software", "darwin");
    const hostFact = soft.facts.find(([k]) => k === "Hostname");
    expect(hostFact?.[1]).toBe("studio-workstation");
    const softRawJson = JSON.stringify(soft.raw);
    const realHost = os.hostname();
    if (realHost && realHost.length > 2) {
      expect(softRawJson.toLowerCase()).not.toContain(realHost.toLowerCase());
    }

    const net = await collectSysinfoSection("network", "darwin");
    const rawIfaces = ((net.raw as any).interfaces ?? []) as any[];
    for (const iface of rawIfaces) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        expect(iface.mac).toBe("🔒 [Protected]");
      }
    }
  });
});
