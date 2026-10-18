import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  SYSINFO_PROBE_CATALOG,
  buildPlatformHighlights,
  diffSysinfoSnapshots,
  formatBytes,
  formatDurationSec,
  formatSysinfoReport,
  type SysinfoOverview,
} from "../src/features/filemanager/fmSysinfo";

describe("System Information pure helpers & cross-platform highlights", () => {
  test("formatBytes and formatDurationSec format values cleanly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(16 * 1024 * 1024 * 1024)).toBe("16.0 GB");
    expect(formatDurationSec(45)).toBe("45s");
    expect(formatDurationSec(3665)).toBe("1h 1m");
    expect(formatDurationSec(90060)).toBe("1d 1h 1m");
  });

  test("buildPlatformHighlights adapts to Windows (win32), Linux (linux), and macOS (darwin)", () => {
    const win = buildPlatformHighlights(
      "win32",
      { distro: "Microsoft Windows 11 Pro", release: "10.0.22631", codename: "", kernel: "10.0.22631", arch: "x64", uefi: true, hypervisor: "Hyper-V", shell: "powershell.exe" },
      [{ mount: "C:", type: "NTFS", fs: "C:" }, { mount: "D:", type: "NTFS", fs: "D:" }],
    );
    expect(win.family).toBe("windows");
    expect(win.highlights.some(([k, v]) => k === "Drive Letters" && v.includes("C:"))).toBe(true);
    expect(win.highlights.some(([k, v]) => k === "Boot Firmware" && v === "UEFI")).toBe(true);

    const lin = buildPlatformHighlights(
      "linux",
      { distro: "Ubuntu", release: "24.04", codename: "noble", kernel: "6.8.0-generic", arch: "x64", uefi: true, hypervisor: "", shell: "/bin/bash" },
      [{ mount: "/", type: "ext4", fs: "/dev/nvme0n1p2" }],
    );
    expect(lin.family).toBe("unix");
    expect(lin.highlights.some(([k, v]) => k === "Root Filesystem" && v.includes("ext4"))).toBe(true);

    const mac = buildPlatformHighlights(
      "darwin",
      { distro: "macOS", release: "15.1", codename: "Sequoia", kernel: "24.1.0", arch: "arm64", uefi: true, hypervisor: "", shell: "/bin/zsh" },
      [{ mount: "/", type: "APFS", fs: "/dev/disk3s1s1" }],
    );
    expect(mac.family).toBe("unix");
    expect(mac.highlights.some(([k, v]) => k === "Silicon / Arch" && v.includes("Apple Silicon"))).toBe(true);
  });

  test("diffSysinfoSnapshots and formatSysinfoReport handle JSON, CSV, Markdown, and HTML", () => {
    const before = { cpu: { load: 12.5, temp: 48 }, usb: ["Keyboard"] };
    const after = { cpu: { load: 34.0, temp: 48 }, usb: ["Keyboard", "YubiKey"] };
    const diff = diffSysinfoSnapshots(before, after);
    expect(diff.changed).toEqual([{ path: "cpu.load", from: 12.5, to: 34.0 }]);
    expect(diff.added).toEqual([{ path: "usb[1]", value: "YubiKey" }]);
    expect(diff.unchanged).toBe(2);

    expect(formatSysinfoReport("CPU", after, "json", "darwin")).toContain('"load": 34');
    expect(formatSysinfoReport("CPU", after, "csv", "darwin")).toContain("cpu.load,34");
    expect(formatSysinfoReport("CPU", after, "md", "darwin")).toContain("# System report: `CPU`");
    expect(formatSysinfoReport("CPU", after, "html", "darwin")).toContain("<!DOCTYPE html>");
  });
});

describe("File Manager System Information API operations", () => {
  const HOME = fs.mkdtempSync(join(tmpdir(), "fm-sysinfo-home-"));
  const DATA = fs.mkdtempSync(join(tmpdir(), "fm-sysinfo-data-"));
  let srv: ReturnType<typeof startFileManagerServer>;

  const mockOverview: SysinfoOverview = {
    timestamp: 1700000000000,
    platform: "win32",
    osLabel: "Windows",
    os: {
      distro: "Windows 11 Pro",
      release: "10.0.22631",
      codename: "23H2",
      kernel: "10.0.22631",
      arch: "x64",
      hostname: "RAD-WORKSTATION",
      fqdn: "RAD-WORKSTATION.local",
      serial: "SN-12345",
      uefi: true,
      hypervisor: "Hyper-V",
      uptimeSec: 7200,
      uptimeFormatted: "2h 0m",
      shell: "powershell.exe",
      user: "alice",
      homeDir: HOME,
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
      loadPercent: 24.5,
      loadUserPercent: 18.0,
      loadSystemPercent: 6.5,
      loadAvg1m: 2.1,
      loadAvg5m: 1.8,
      loadAvg15m: 1.5,
      tempMainC: 54.2,
      tempMaxC: 61.0,
      perCoreLoads: [20, 30, 15, 40],
    },
    memory: {
      totalBytes: 32 * 1024 * 1024 * 1024,
      usedBytes: 12 * 1024 * 1024 * 1024,
      freeBytes: 20 * 1024 * 1024 * 1024,
      availableBytes: 20 * 1024 * 1024 * 1024,
      activeBytes: 12 * 1024 * 1024 * 1024,
      usedPercent: 37.5,
      swapTotalBytes: 8 * 1024 * 1024 * 1024,
      swapUsedBytes: 1 * 1024 * 1024 * 1024,
      swapPercent: 12.5,
    },
    battery: {
      hasBattery: true,
      percent: 88,
      isCharging: true,
      acConnected: true,
      timeRemainingMin: 120,
      cycleCount: 42,
      model: "RAD-Bat",
      manufacturer: "Codecaine",
    },
    disks: [
      {
        fs: "C:",
        type: "NTFS",
        mount: "C:",
        sizeBytes: 1000 * 1024 * 1024 * 1024,
        usedBytes: 400 * 1024 * 1024 * 1024,
        availableBytes: 600 * 1024 * 1024 * 1024,
        usePercent: 40.0,
        rw: true,
      },
    ],
    network: [
      {
        iface: "Ethernet0",
        ip4: "192.168.1.50",
        ip6: "fe80::1",
        mac: "00:11:22:33:44:55",
        internal: false,
        default: true,
        type: "wired",
        speedMbps: 2500,
        operstate: "up",
      },
    ],
    graphics: {
      controllers: [{ vendor: "NVIDIA", model: "RTX 4090", vramMb: 24576, bus: "PCIe", driverVersion: "551.23" }],
      displays: [{ model: "Studio Display", main: true, builtin: false, connection: "DP", resolutionX: 3840, resolutionY: 2160, refreshRate: 144 }],
    },
    platformDetails: {
      family: "windows",
      summary: "Windows NT / CIM / WMI hardware & system telemetry",
      highlights: [["OS Family", "Windows NT (win32)"]],
    },
  };

  beforeAll(() => {
    srv = startFileManagerServer({
      port: 0,
      context: {
        platform: process.platform === "win32" ? "win32" : "darwin",
        home: HOME,
        dataDir: DATA,
        sysinfo: {
          getOverview: async () => mockOverview,
          runProbe: async (method, param) => ({
            method,
            param,
            manufacturer: "Codecaine Hardware Labs",
            status: "ok",
          }),
        },
      },
    });
  });

  afterAll(() => {
    srv.stop(true);
    fs.rmSync(HOME, { recursive: true, force: true });
    fs.rmSync(DATA, { recursive: true, force: true });
  });

  const post = async (op: string, body: object) => {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fm-token": srv.token },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("sysinfo/overview returns KPI summary, sections, and probe catalog", async () => {
    const res = await post("sysinfo/overview", {});
    expect(res.status).toBe(200);
    expect(res.json.overview.os.hostname).toBe("RAD-WORKSTATION");
    expect(res.json.overview.cpu.brand).toBe("Ryzen 9 7950X");
    expect(res.json.catalog.length).toBe(SYSINFO_PROBE_CATALOG.length);
  });

  test("sysinfo/section returns structured facts and tables", async () => {
    const ovSec = await post("sysinfo/section", { section: "overview" });
    expect(ovSec.status).toBe(200);
    expect(ovSec.json.tables.length).toBe(2);

    const badSec = await post("sysinfo/section", { section: "invalid-sec" });
    expect(badSec.status).toBe(400);
  });

  test("sysinfo/probe runs allowed catalog probes and rejects unknown methods", async () => {
    const probeRes = await post("sysinfo/probe", { method: "system" });
    expect(probeRes.status).toBe(200);
    expect(probeRes.json.method).toBe("system");
    expect(probeRes.json.flatRows.some(([k, v]: [string, string]) => k === "manufacturer" && v === "Codecaine Hardware Labs")).toBe(true);

    const badProbe = await post("sysinfo/probe", { method: "rm_rf" });
    expect(badProbe.status).toBe(400);
  });

  test("sysinfo/diff, sysinfo/export, and sysinfo/save work across formats without overwriting", async () => {
    const diffRes = await post("sysinfo/diff", {
      before: { ramUsed: 100 },
      after: { ramUsed: 150 },
    });
    expect(diffRes.status).toBe(200);
    expect(diffRes.json.diff.changed.length).toBe(1);

    for (const fmt of ["json", "csv", "md", "html"]) {
      const expRes = await post("sysinfo/export", { format: fmt, section: "overview" });
      expect(expRes.status).toBe(200);
      expect(expRes.json.text.length).toBeGreaterThan(20);
    }

    const save1 = await post("sysinfo/save", { folder: HOME, format: "md", name: "my-sys-report" });
    const save2 = await post("sysinfo/save", { folder: HOME, format: "md", name: "my-sys-report" });
    expect(save1.status).toBe(200);
    expect(save2.status).toBe(200);
    expect(save1.json.name).toBe("my-sys-report.md");
    expect(save2.json.name).toBe("my-sys-report (2).md");
  });
});
