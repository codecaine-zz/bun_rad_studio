import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const copied: string[] = [];
const executedCommands: string[][] = [];

const root = mkdtempSync(join(tmpdir(), "fm-tasks-sys-ui-"));
const home = join(root, "home");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let power: any;
let state: any;
let api: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tasksPane = () => doc.getElementById("power-pane-tasks")!;
const sysPane = () => doc.getElementById("power-pane-sysinfo")!;

beforeAll(async () => {
  mkdirSync(home, { recursive: true });
  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: {
      platform: "win32",
      home,
      dataDir: join(root, "data"),
      tasks: {
        currentUser: "alice",
        selfPid: "9000",
        parentPid: "8000",
        totalMemBytes: 16 * 1024 * 1024 * 1024,
        freeMemBytes: 8 * 1024 * 1024 * 1024,
        execCommand: async (cmd) => {
          executedCommands.push(cmd);
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
                { ProcessId: 4120, ParentProcessId: 1000, Name: "node.exe", ExecutablePath: "C:\\Program Files\\nodejs\\node.exe", CommandLine: '"C:\\Program Files\\nodejs\\node.exe" server.js', WorkingSetSize: 104857600, CPU: 15.6, UserName: "PC\\alice", Responding: true, MainWindowTitle: "Vite Dev", ElapsedSeconds: 1200 },
                { ProcessId: 4125, ParentProcessId: 4120, Name: "esbuild.exe", ExecutablePath: "C:\\app\\esbuild.exe", CommandLine: "esbuild.exe --service", WorkingSetSize: 20485760, CPU: 3.2, UserName: "PC\\alice", Responding: true, ElapsedSeconds: 1180 },
              ]),
              stderr: "",
            };
          }
          return { exitCode: 0, stdout: "OK", stderr: "" };
        },
      },
      sysinfo: {
        getOverview: async () => ({
          timestamp: Date.now(),
          platform: "win32",
          osLabel: "Windows",
          os: {
            distro: "Windows 11 Pro",
            release: "10.0.22631",
            codename: "23H2",
            kernel: "10.0.22631",
            arch: "x64",
            hostname: "CODECAINE-WIN",
            fqdn: "CODECAINE-WIN.local",
            serial: "SN-999",
            uefi: true,
            hypervisor: "Hyper-V",
            uptimeSec: 3600,
            uptimeFormatted: "1h 0m",
            shell: "powershell.exe",
            user: "alice",
            homeDir: home,
            bunVersion: "1.4.2",
            nodeVersion: "22.0.0",
          },
          cpu: {
            manufacturer: "AMD",
            brand: "Ryzen 9 7950X",
            speedGhz: 4.5,
            speedMaxGhz: 5.7,
            physicalCores: 16,
            logicalCores: 32,
            processors: 1,
            socket: "AM5",
            loadPercent: 22.0,
            loadUserPercent: 16.0,
            loadSystemPercent: 6.0,
            loadAvg1m: 1.5,
            loadAvg5m: 1.2,
            loadAvg15m: 1.0,
            tempMainC: 52.0,
            tempMaxC: 58.0,
            perCoreLoads: [20, 25, 18, 30],
          },
          memory: {
            totalBytes: 32 * 1024 * 1024 * 1024,
            usedBytes: 16 * 1024 * 1024 * 1024,
            freeBytes: 16 * 1024 * 1024 * 1024,
            availableBytes: 16 * 1024 * 1024 * 1024,
            activeBytes: 16 * 1024 * 1024 * 1024,
            usedPercent: 50.0,
            swapTotalBytes: 4 * 1024 * 1024 * 1024,
            swapUsedBytes: 0,
            swapPercent: 0,
          },
          battery: {
            hasBattery: true,
            percent: 95,
            isCharging: true,
            acConnected: true,
            timeRemainingMin: 180,
            cycleCount: 15,
            model: "Bat",
            manufacturer: "OEM",
          },
          disks: [
            { fs: "C:", type: "NTFS", mount: "C:", sizeBytes: 500 * 1024 * 1024 * 1024, usedBytes: 200 * 1024 * 1024 * 1024, availableBytes: 300 * 1024 * 1024 * 1024, usePercent: 40.0, rw: true },
          ],
          network: [
            { iface: "Ethernet0", ip4: "10.0.0.25", ip6: "", mac: "AA:BB:CC:DD:EE:FF", internal: false, default: true, type: "wired", speedMbps: 1000, operstate: "up" },
          ],
          graphics: {
            controllers: [{ vendor: "NVIDIA", model: "RTX 4090", vramMb: 24576, bus: "PCIe", driverVersion: "551.0" }],
            displays: [{ model: "4K Monitor", main: true, builtin: false, connection: "DP", resolutionX: 3840, resolutionY: 2160, refreshRate: 144 }],
          },
          platformDetails: {
            family: "windows",
            summary: "Windows NT / CIM / WMI hardware & system telemetry",
            highlights: [["OS Family", "Windows NT (win32)"]],
          },
        }),
        runProbe: async (method) => ({
          method,
          vendor: "Codecaine BIOS",
          version: "2.10",
        }),
      },
    },
  });

  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8")
    .replace(/__FM_TOKEN__/g, "ui-token")
    .replace(/__FM_PLATFORM__/g, "win32")
    .replace(/__FM_NONCE__/g, "n")
    .replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) {
    Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  }
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return new Response(JSON.stringify({ ok: true, copied: true }), { headers: { "Content-Type": "application/json" } });
      }
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true,
    writable: true,
  });

  doc = dom.window.document;
  win = dom.window;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  power = await import("../resources/file_manager/ui/power.js");
  await import("../resources/file_manager/ui/tasks.js");
  await import("../resources/file_manager/ui/sysinfo.js");
  state.home = home;
  state.sep = "\\";
  state.location = { kind: "folder", path: home };
  state.settings = (await api.call("settings")).settings;
  power.wirePower();
});

afterAll(() => {
  power.resetPower();
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("Tasks and System Info power tools in JSDOM", () => {
  test("Tasks tab mounts, displays Windows engine profile, filters processes, selects rows, and has zero inline styles", async () => {
    power.openPower("tasks");
    await sleep(120);

    const pane = tasksPane();
    expect(pane).toBeTruthy();
    expect(pane.textContent).toContain("Windows Engine (win32)");
    expect(pane.textContent).toContain("node.exe");
    expect(pane.textContent).toContain(":3000");

    // Every control has a title/aria-label and zero inline style attributes
    const controls = [...pane.querySelectorAll("button, input, select, textarea")];
    expect(controls.length).toBeGreaterThan(8);
    for (const c of controls) {
      expect(c.getAttribute("title") || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName !== "BUTTON") {
        expect((c as any).labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      }
    }
    expect(pane.querySelectorAll("[style]").length).toBe(0);

    // Click row for node.exe (PID 4120) to populate inspector with Windows actions
    const row = pane.querySelector('tr[data-key="4120"]');
    expect(row).toBeTruthy();
    row.click();
    await sleep(50);
    expect(pane.querySelector(".tasks-inspector").textContent).toContain("End Task");
    expect(pane.querySelector(".tasks-inspector").textContent).toContain("Kill Process Tree (/T /F)");

    // Filter by :3000
    const search = pane.querySelector(".tasks-search");
    search.value = ":3000";
    search.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(pane.querySelectorAll("tbody tr").length).toBe(1);
    search.value = "";
    search.dispatchEvent(new win.Event("input", { bubbles: true }));
  });

  test("System tab mounts, displays KPI cards and per-core SVG bars, runs probes, diffs baselines, and has zero inline styles", async () => {
    power.openPower("sysinfo");
    await sleep(150);

    const pane = sysPane();
    expect(pane).toBeTruthy();
    expect(pane.textContent).toContain("CODECAINE-WIN");
    expect(pane.textContent).toContain("Ryzen 9 7950X");
    expect(pane.textContent).toContain("Per-Core CPU Activity");

    const controls = [...pane.querySelectorAll("button, input, select, textarea")];
    expect(controls.length).toBeGreaterThan(10);
    for (const c of controls) {
      expect(c.getAttribute("title") || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName !== "BUTTON") {
        expect((c as any).labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      }
    }
    expect(pane.querySelectorAll("[style]").length).toBe(0);

    // Pin baseline and compare
    const btns = [...pane.querySelectorAll("button")];
    const pinBtn = btns.find((b: any) => b.textContent.trim() === "Pin Baseline");
    const cmpBtn = btns.find((b: any) => b.textContent.trim() === "Compare to Baseline");
    expect(pinBtn).toBeTruthy();
    pinBtn.click();
    await sleep(40);
    expect(cmpBtn.disabled).toBe(false);
    cmpBtn.click();
    await sleep(80);
    expect(pane.querySelector(".sys-diff-card").hidden).toBe(false);

    // Run deep probe
    const probeSelect = pane.querySelector(".sys-probe-row select");
    probeSelect.value = "bios";
    const runProbeBtn = btns.find((b: any) => b.textContent.trim() === "Run Probe");
    runProbeBtn.click();
    await sleep(80);
    expect(pane.querySelector(".sys-probe-card").textContent).toContain("Codecaine BIOS");
    expect(pane.querySelectorAll("[style]").length).toBe(0);
  });
});
