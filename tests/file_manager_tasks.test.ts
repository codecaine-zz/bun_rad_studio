import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  assessTaskAction,
  buildProcessActionCommand,
  buildProcessTree,
  executablePath,
  extractProcessName,
  findRogueDevServers,
  getTaskPlatformProfile,
  groupProcesses,
  isCriticalProcess,
  matchesTaskQuery,
  parseLsofListen,
  parsePsOutput,
  parseSsListen,
  parseWindowsNetstat,
  parseWindowsProcessJson,
  parseWindowsTasklistCsv,
  posixSignalNumber,
  processesToCsv,
  processesToJson,
  processesToMarkdown,
  processesToTsv,
  validPort,
} from "../src/features/filemanager/fmTaskManager";

describe("cross-platform Task Manager pure parsers & platform rules", () => {
  test("platform profiles distinguish Windows (win32) from macOS (darwin) and Linux (linux)", () => {
    const win = getTaskPlatformProfile("win32");
    expect(win.family).toBe("windows");
    expect(win.supportsPosixSignals).toBe(false);
    expect(win.supportsSuspendResume).toBe(false);
    expect(win.supportsReloadSignal).toBe(false);
    expect(win.supportsNativeTreeKill).toBe(true);
    expect(win.portMechanism).toContain("netstat");
    expect(win.killMechanism).toContain("taskkill");
    expect(win.actions.map((a) => a.id)).toEqual(["terminate", "kill", "tree", "group", "priority"]);

    const mac = getTaskPlatformProfile("darwin");
    expect(mac.family).toBe("unix");
    expect(mac.supportsPosixSignals).toBe(true);
    expect(mac.supportsSuspendResume).toBe(true);
    expect(mac.supportsReloadSignal).toBe(true);
    expect(mac.supportsNativeTreeKill).toBe(false);
    expect(mac.actions.map((a) => a.id)).toEqual(["terminate", "kill", "suspend", "resume", "reload", "tree", "group", "priority"]);

    const lin = getTaskPlatformProfile("linux");
    expect(lin.family).toBe("unix");
    expect(posixSignalNumber("SIGSTOP", "darwin")).toBe(17);
    expect(posixSignalNumber("SIGSTOP", "linux")).toBe(19);
    expect(posixSignalNumber("SIGCONT", "darwin")).toBe(19);
    expect(posixSignalNumber("SIGCONT", "linux")).toBe(18);
  });

  test("buildProcessActionCommand constructs taskkill/PowerShell on Windows and kill/renice on *nix", () => {
    expect(buildProcessActionCommand("win32", "terminate", "4200")).toEqual(["taskkill", "/PID", "4200"]);
    expect(buildProcessActionCommand("win32", "kill", "4200")).toEqual(["taskkill", "/F", "/PID", "4200"]);
    expect(buildProcessActionCommand("win32", "tree", "4200")).toEqual(["taskkill", "/T", "/F", "/PID", "4200"]);
    const winPrio = buildProcessActionCommand("win32", "priority", "4200");
    expect(winPrio[0]).toBe("powershell.exe");
    expect(winPrio.join(" ")).toContain("BelowNormal");

    expect(buildProcessActionCommand("darwin", "terminate", "4200")).toEqual(["kill", "-15", "4200"]);
    expect(buildProcessActionCommand("darwin", "kill", "4200")).toEqual(["kill", "-9", "4200"]);
    expect(buildProcessActionCommand("darwin", "suspend", "4200")).toEqual(["kill", "-17", "4200"]);
    expect(buildProcessActionCommand("linux", "suspend", "4200")).toEqual(["kill", "-19", "4200"]);
    expect(buildProcessActionCommand("darwin", "resume", "4200")).toEqual(["kill", "-19", "4200"]);
    expect(buildProcessActionCommand("linux", "resume", "4200")).toEqual(["kill", "-18", "4200"]);
    expect(buildProcessActionCommand("darwin", "reload", "4200")).toEqual(["kill", "-1", "4200"]);
    expect(buildProcessActionCommand("darwin", "priority", "4200")).toEqual(["renice", "10", "-p", "4200"]);
  });

  test("extractProcessName and executablePath handle both Windows paths and *nix / .app bundles", () => {
    expect(extractProcessName('"C:\\Program Files\\nodejs\\node.exe" server.js', "win32")).toBe("node.exe");
    expect(extractProcessName("C:\\Windows\\System32\\svchost.exe -k netsvcs", "win32")).toBe("svchost.exe");
    expect(executablePath('"C:\\Program Files\\nodejs\\node.exe" server.js', "win32")).toBe("C:\\Program Files\\nodejs\\node.exe");

    expect(extractProcessName("/Applications/Visual Studio Code.app/Contents/MacOS/Electron --type=gpu", "darwin")).toBe("Visual Studio Code");
    expect(executablePath("/Applications/Visual Studio Code.app/Contents/MacOS/Electron --type=gpu", "darwin")).toBe("/Applications/Visual Studio Code.app");
    expect(extractProcessName("/usr/local/bin/bun run dev", "linux")).toBe("bun");
    expect(executablePath("/usr/local/bin/bun run dev", "linux")).toBe("/usr/local/bin/bun");
  });

  test("parses Windows netstat -ano -p tcp, PowerShell CIM JSON, and tasklist /V /FO CSV", () => {
    const netstatOut = [
      "Active Connections",
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4120",
      "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       4120",
      "  TCP    [::1]:8080             [::]:0                 LISTENING       5200",
      "  TCP    192.168.1.10:54321     93.184.216.34:443      ESTABLISHED     4120",
    ].join("\r\n");
    const winPorts = parseWindowsNetstat(netstatOut);
    expect(winPorts.get("4120")).toEqual([":3000", ":5173"]);
    expect(winPorts.get("5200")).toEqual([":8080"]);

    const psJson = JSON.stringify([
      {
        ProcessId: 4,
        ParentProcessId: 0,
        Name: "System",
        ExecutablePath: null,
        CommandLine: "System",
        WorkingSetSize: 10485760,
        CPU: 0.5,
        UserName: "NT AUTHORITY\\SYSTEM",
        Responding: true,
        MainWindowTitle: "",
        ElapsedSeconds: 86400,
      },
      {
        ProcessId: 4120,
        ParentProcessId: 1200,
        Name: "bun.exe",
        ExecutablePath: "C:\\Users\\alice\\.bun\\bin\\bun.exe",
        CommandLine: '"C:\\Users\\alice\\.bun\\bin\\bun.exe" run dev',
        WorkingSetSize: 104857600,
        CPU: 14.2,
        UserName: "WORKSTATION\\alice",
        Responding: true,
        MainWindowTitle: "Vite Dev Server",
        ElapsedSeconds: 3665,
      },
    ]);
    const procs = parseWindowsProcessJson(psJson, winPorts, "alice", 8 * 1024 * 1024 * 1024);
    expect(procs.length).toBe(2);
    expect(procs[0]!.isCritical).toBe(true);
    expect(procs[1]!.pid).toBe("4120");
    expect(procs[1]!.isUserApp).toBe(true);
    expect(procs[1]!.isDevServer).toBe(true);
    expect(procs[1]!.ports).toEqual([":3000", ":5173"]);
    expect(procs[1]!.windowTitle).toBe("Vite Dev Server");
    expect(procs[1]!.uptime).toBe("1h 1m");

    const tasklistCsv = [
      '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"',
      '"csrss.exe","600","Services","0","6,144 K","Running","NT AUTHORITY\\SYSTEM","0:00:12","N/A"',
      '"node.exe","5200","Console","1","85,200 K","Not Responding","DESKTOP\\alice","0:05:30","Express API"',
    ].join("\r\n");
    const csvProcs = parseWindowsTasklistCsv(tasklistCsv, winPorts, "alice", 8 * 1024 * 1024 * 1024);
    expect(csvProcs.length).toBe(2);
    expect(csvProcs[0]!.isCritical).toBe(true);
    expect(csvProcs[1]!.pid).toBe("5200");
    expect(csvProcs[1]!.stateText).toBe("Not Responding");
    expect(csvProcs[1]!.ports).toEqual([":8080"]);
    expect(csvProcs[1]!.isUserApp).toBe(true);
  });

  test("parses *nix ps -axo, lsof, and Linux ss -tlnp outputs", () => {
    const lsofOut = [
      "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
      "bun      3100 alice  19u  IPv4 0x1234      0t0  TCP 127.0.0.1:4000 (LISTEN)",
    ].join("\n");
    const lsofMap = parseLsofListen(lsofOut);
    expect(lsofMap.get("3100")).toEqual([":4000"]);

    const ssOut = [
      "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:9090       0.0.0.0:*         users:(("python3",pid=7700,fd=3))',
    ].join("\n");
    const ssMap = parseSsListen(ssOut);
    expect(ssMap.get("7700")).toEqual([":9090"]);

    const psOut = [
      "  PID  PPID  %CPU %MEM    RSS STAT USER      ELAPSED COMMAND",
      "    1     0   0.1  0.2  20480 Ss   root     02-00:00:00 /sbin/launchd",
      " 3100     1  22.5  1.8 143360 S+   alice       15:42 /Users/alice/.bun/bin/bun run start",
      " 3105  3100   4.0  0.5  40960 S+   alice       15:40 /usr/local/bin/esbuild --service",
    ].join("\n");
    const nixProcs = parsePsOutput(psOut, lsofMap, "alice", "darwin");
    expect(nixProcs.length).toBe(3);
    expect(nixProcs[0]!.isCritical).toBe(true);
    expect(nixProcs[1]!.ports).toEqual([":4000"]);
    expect(nixProcs[1]!.isDevServer).toBe(true);

    const tree = buildProcessTree(nixProcs);
    const childNode = tree.find((t) => t.pid === "3105");
    expect(childNode?.depth).toBeGreaterThan(0);

    const groups = groupProcesses(nixProcs);
    expect(groups.length).toBe(3);

    expect(matchesTaskQuery(nixProcs[1]!, ":4000 cpu>20 user:alice")).toBe(true);
    expect(matchesTaskQuery(nixProcs[1]!, ":9999")).toBe(false);
    expect(validPort(":3000")).toBe(3000);
    expect(validPort("99999")).toBeNull();

    expect(processesToCsv(nixProcs)).toContain("3100,1,bun,alice");
    expect(processesToJson(nixProcs)).toContain('"pid": "3100"');
    expect(processesToTsv(nixProcs)).toContain("3100\t1\tbun");
    expect(processesToMarkdown(nixProcs, "darwin")).toContain("| 3100 |");
  });

  test("safety guard blocks critical OS processes on both Windows and *nix", () => {
    expect(isCriticalProcess("csrss.exe", "600", "win32")).toBe(true);
    expect(isCriticalProcess("System", "4", "win32")).toBe(true);
    expect(isCriticalProcess("launchd", "1", "darwin")).toBe(true);
    expect(isCriticalProcess("systemd", "1", "linux")).toBe(true);

    const winCtx = { platform: "win32" as const, selfPid: "999", parentPid: "888", currentUser: "alice" };
    expect(assessTaskAction(undefined, "4", "terminate", winCtx).allowed).toBe(false);
    expect(assessTaskAction(undefined, "999", "terminate", winCtx).allowed).toBe(false);
    expect(assessTaskAction(undefined, "4120", "suspend", winCtx).allowed).toBe(false);
  });
});

describe("File Manager Task Manager API operations (Windows vs *nix)", () => {
  const HOME = fs.mkdtempSync(join(tmpdir(), "fm-tasks-home-"));
  const DATA = fs.mkdtempSync(join(tmpdir(), "fm-tasks-data-"));
  const winCommands: string[][] = [];
  const nixCommands: string[][] = [];
  let winServer: ReturnType<typeof startFileManagerServer>;
  let nixServer: ReturnType<typeof startFileManagerServer>;

  beforeAll(() => {
    winServer = startFileManagerServer({
      port: 0,
      context: {
        platform: "win32",
        home: HOME,
        dataDir: DATA,
        tasks: {
          currentUser: "alice",
          selfPid: "9000",
          parentPid: "8000",
          totalMemBytes: 16 * 1024 * 1024 * 1024,
          freeMemBytes: 8 * 1024 * 1024 * 1024,
          execCommand: async (cmd) => {
            winCommands.push(cmd);
            if (cmd[0] === "netstat") {
              return {
                exitCode: 0,
                stdout: "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4120\r\n",
                stderr: "",
              };
            }
            if (cmd[0] === "powershell.exe" && cmd.join(" ").includes("ConvertTo-Json")) {
              return {
                exitCode: 0,
                stdout: JSON.stringify([
                  { ProcessId: 4, ParentProcessId: 0, Name: "System", CommandLine: "System", WorkingSetSize: 4096000, CPU: 0.2, UserName: "SYSTEM", Responding: true },
                  { ProcessId: 4120, ParentProcessId: 1000, Name: "node.exe", ExecutablePath: "C:\\Program Files\\nodejs\\node.exe", CommandLine: '"C:\\Program Files\\nodejs\\node.exe" server.js', WorkingSetSize: 104857600, CPU: 12.4, UserName: "PC\\alice", Responding: true, MainWindowTitle: "Node Server", ElapsedSeconds: 600 },
                  { ProcessId: 4125, ParentProcessId: 4120, Name: "esbuild.exe", ExecutablePath: "C:\\project\\node_modules\\esbuild.exe", CommandLine: "esbuild.exe --service", WorkingSetSize: 30485760, CPU: 2.1, UserName: "PC\\alice", Responding: true, ElapsedSeconds: 590 },
                ]),
                stderr: "",
              };
            }
            return { exitCode: 0, stdout: "SUCCESS", stderr: "" };
          },
        },
      },
    });

    nixServer = startFileManagerServer({
      port: 0,
      context: {
        platform: "darwin",
        home: HOME,
        dataDir: DATA,
        tasks: {
          currentUser: "alice",
          selfPid: "9000",
          parentPid: "8000",
          execCommand: async (cmd) => {
            nixCommands.push(cmd);
            if (cmd[0] === "lsof" && cmd.includes("-iTCP")) {
              return {
                exitCode: 0,
                stdout: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nbun 5100 alice 19u IPv4 0x1 0t0 TCP *:5173 (LISTEN)\n",
                stderr: "",
              };
            }
            if (cmd[0] === "ps") {
              return {
                exitCode: 0,
                stdout: [
                  "PID PPID %CPU %MEM RSS STAT USER ELAPSED COMMAND",
                  "1 0 0.1 0.1 10240 Ss root 10:00:00 /sbin/launchd",
                  "5100 1 18.0 2.0 120000 S+ alice 05:00 /Users/alice/.bun/bin/bun run dev",
                  "5101 5100 3.0 0.5 32000 S+ alice 04:55 /usr/local/bin/vite",
                ].join("\n"),
                stderr: "",
              };
            }
            if (cmd[0] === "lsof" && cmd.includes("cwd")) {
              return { exitCode: 0, stdout: `p5100\nn${HOME}\n`, stderr: "" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        },
      },
    });
  });

  afterAll(() => {
    winServer.stop(true);
    nixServer.stop(true);
    fs.rmSync(HOME, { recursive: true, force: true });
    fs.rmSync(DATA, { recursive: true, force: true });
  });

  const post = async (srv: ReturnType<typeof startFileManagerServer>, op: string, body: object) => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fm-token": srv.token },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("Windows server lists processes via PowerShell CIM + netstat and executes taskkill for actions", async () => {
    const listRes = await post(winServer, "tasks/list", {});
    expect(listRes.status).toBe(200);
    expect(listRes.json.platform).toBe("win32");
    expect(listRes.json.profile.family).toBe("windows");
    expect(listRes.json.processes.length).toBe(3);

    // Refuses critical Windows PID 4
    const critRes = await post(winServer, "tasks/action", { pid: "4", action: "terminate", confirm: true });
    expect(critRes.status).toBe(400);
    expect(critRes.json.error.code).toBe("PROTECTED");

    // Refuses POSIX-only suspend on Windows
    const suspRes = await post(winServer, "tasks/action", { pid: "4120", action: "suspend", confirm: true });
    expect(suspRes.status).toBe(400);

    // Requires confirmation when port listener is terminated
    const unconfirmed = await post(winServer, "tasks/action", { pid: "4120", action: "terminate" });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.json.error.code).toBe("NEEDS_CONFIRM");

    // Confirmed tree kill uses native Windows `taskkill /T /F /PID 4120`
    winCommands.length = 0;
    const treeRes = await post(winServer, "tasks/action", { pid: "4120", action: "tree", confirm: true });
    expect(treeRes.status).toBe(200);
    expect(winCommands.some((c) => c.join(" ") === "taskkill /T /F /PID 4120")).toBe(true);

    // Port killer on Windows uses taskkill /F /PID
    const portRes = await post(winServer, "tasks/kill-port", { port: "3000", confirm: true });
    expect(portRes.status).toBe(200);
    expect(portRes.json.killed).toEqual(["4120"]);
  });

  test.skipIf(process.platform === "win32")("*nix server lists processes via ps + lsof, inspects cwd, and dispatches POSIX signals", async () => {
    const listRes = await post(nixServer, "tasks/list", {});
    expect(listRes.status).toBe(200);
    expect(listRes.json.platform).toBe("darwin");
    expect(listRes.json.processes.length).toBe(3);

    const inspRes = await post(nixServer, "tasks/inspect", { pid: "5100" });
    expect(inspRes.status).toBe(200);
    expect(inspRes.json.cwd).toBe(HOME);
    expect(inspRes.json.children.length).toBe(1);

    nixCommands.length = 0;
    const treeRes = await post(nixServer, "tasks/action", { pid: "5100", action: "tree", confirm: true });
    expect(treeRes.status).toBe(200);
    // Child 5101 is killed before parent 5100
    const killCmds = nixCommands.filter((c) => c[0] === "kill");
    expect(killCmds).toEqual([
      ["kill", "-15", "5101"],
      ["kill", "-15", "5100"],
    ]);

    const cleanRes = await post(nixServer, "tasks/clean-dev", { confirm: true });
    expect(cleanRes.status).toBe(200);
    expect(cleanRes.json.cleaned).toContain("5100");

    const saveRes = await post(nixServer, "tasks/save", { folder: HOME, format: "csv" });
    expect(saveRes.status).toBe(200);
    expect(fs.existsSync(saveRes.json.path)).toBe(true);
  });
});
