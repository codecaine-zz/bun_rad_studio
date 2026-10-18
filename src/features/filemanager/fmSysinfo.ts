/**
 * Cross-platform System Information & Hardware Telemetry engine for Codecaine File Manager.
 *
 * Combines fast Node/Bun `os` primitives with `systeminformation` probes and platform-aware
 * normalization across Windows (`win32`), macOS (`darwin`), and Linux (`linux`).
 */
import * as os from "os";
import si from "systeminformation";
import { diffData, flattenData, toCsv, toHtmlReport, toMarkdown, type DataDiff } from "../../system_report";
import type { Platform } from "./fmPaths";

export type SysinfoSectionId =
  | "overview"
  | "hardware"
  | "cpu"
  | "memory"
  | "disks"
  | "network"
  | "graphics"
  | "peripherals"
  | "software";

export interface SysinfoProbeCatalogItem {
  method: string;
  category: string;
  label: string;
  description: string;
  hasParam?: boolean;
  defaultParam?: string;
}

export const SYSINFO_PROBE_CATALOG: SysinfoProbeCatalogItem[] = [
  // System & Hardware
  { method: "system", category: "Hardware", label: "System Model & UUID", description: "Hardware manufacturer, model, serial, UUID, and SKU." },
  { method: "bios", category: "Hardware", label: "BIOS / UEFI Firmware", description: "BIOS vendor, version, release date, and revision." },
  { method: "baseboard", category: "Hardware", label: "Motherboard / Logic Board", description: "Baseboard manufacturer, model, version, serial, and memory slots." },
  { method: "chassis", category: "Hardware", label: "Chassis / Enclosure", description: "Physical enclosure type, manufacturer, model, and serial." },
  // CPU & Thermal
  { method: "cpu", category: "CPU", label: "Processor Architecture", description: "CPU brand, vendor, family, model, cores, speeds, and cache sizes." },
  { method: "cpuCurrentSpeed", category: "CPU", label: "CPU Clock Speeds", description: "Current average, min, max, and per-core GHz clock speeds." },
  { method: "cpuTemperature", category: "CPU", label: "CPU Temperatures", description: "Main package, per-core, chipset, and socket thermal sensors." },
  { method: "cpuCache", category: "CPU", label: "CPU Cache Hierarchy", description: "L1d, L1i, L2, and L3 cache sizes." },
  { method: "currentLoad", category: "CPU", label: "CPU Load Breakdown", description: "Overall and per-core user, system, idle, and IRQ CPU load percentages." },
  // Memory
  { method: "mem", category: "Memory", label: "Memory & Swap Usage", description: "Total, free, used, active, available, buffered/cached, and swap RAM." },
  { method: "memLayout", category: "Memory", label: "Physical RAM Modules (DIMMs)", description: "Physical memory banks, stick sizes, DDR type, clock speed, and part numbers." },
  // Storage & Disks
  { method: "fsSize", category: "Storage", label: "Mounted Filesystems", description: "Mounted volumes/drives, filesystem types, capacity, used bytes, and mount points." },
  { method: "blockDevices", category: "Storage", label: "Block Devices & Partitions", description: "Disks, partitions, UUIDs, labels, mount points, and removable media." },
  { method: "diskLayout", category: "Storage", label: "Physical Storage Drives", description: "Physical SSD/NVMe/HDD drives, vendor, firmware, serial, interface, and SMART status." },
  { method: "disksIO", category: "Storage", label: "Disk I/O Throughput", description: "Read/write IOPS, byte transfer counts, and I/O wait metrics." },
  // Graphics & Audio
  { method: "graphics", category: "Graphics", label: "GPUs & Displays", description: "Graphics controllers, VRAM, driver versions, and connected display resolutions." },
  { method: "audio", category: "Graphics", label: "Audio Devices", description: "Sound cards, codecs, input/output channels, and manufacturers." },
  // Network & Wi-Fi
  { method: "networkInterfaces", category: "Network", label: "Network Interfaces (NICs)", description: "IPv4/IPv6 addresses, MAC addresses, MTU, link speed, and carrier state." },
  { method: "networkStats", category: "Network", label: "Network Interface Traffic", description: "Received/transmitted bytes, throughput per second, packet drops, and errors." },
  { method: "networkGatewayDefault", category: "Network", label: "Default Network Gateway", description: "Active default router IP address." },
  { method: "wifiNetworks", category: "Network", label: "Visible Wi-Fi Networks", description: "Nearby SSIDs, BSSIDs, channels, signal quality, and security modes." },
  { method: "wifiInterfaces", category: "Network", label: "Wi-Fi Adapters", description: "Wireless network interface cards, MACs, and vendors." },
  { method: "inetLatency", category: "Network", label: "Internet Ping Latency", description: "Round-trip latency in milliseconds to a target host.", hasParam: true, defaultParam: "1.1.1.1" },
  // Peripherals & Power
  { method: "battery", category: "Peripherals", label: "Battery & Power Status", description: "Charge percentage, AC status, cycle count, health, and capacity in mWh." },
  { method: "usb", category: "Peripherals", label: "USB Bus & Devices", description: "Connected USB controllers, hubs, keyboards, mice, and storage devices." },
  { method: "bluetoothDevices", category: "Peripherals", label: "Bluetooth Devices", description: "Paired and nearby Bluetooth peripherals, MACs, and battery levels." },
  { method: "printer", category: "Peripherals", label: "Printers & Queues", description: "Configured local and network printers and their status." },
  // OS & Software
  { method: "osInfo", category: "Software", label: "Operating System Info", description: "OS distro, release, codename, kernel, architecture, hostname, and UEFI status." },
  { method: "versions", category: "Software", label: "Installed Toolchain Versions", description: "Detected versions of kernel, OpenSSL, Node, Bun, Git, Python, Docker, etc.", hasParam: true, defaultParam: "" },
  { method: "users", category: "Software", label: "Logged-in User Sessions", description: "Active user logins, TTYs, login times, and last commands." },
  { method: "time", category: "Software", label: "System Clock & Timezone", description: "Current epoch time, uptime, timezone identifier, and UTC offset." },
];

export interface SysinfoOverview {
  timestamp: number;
  platform: Platform;
  osLabel: string;
  os: {
    distro: string;
    release: string;
    codename: string;
    kernel: string;
    arch: string;
    hostname: string;
    fqdn: string;
    serial: string;
    uefi: boolean | null;
    hypervisor: string;
    uptimeSec: number;
    uptimeFormatted: string;
    shell: string;
    user: string;
    homeDir: string;
    bunVersion: string;
    nodeVersion: string;
  };
  cpu: {
    manufacturer: string;
    brand: string;
    speedGhz: number;
    speedMaxGhz: number;
    physicalCores: number;
    logicalCores: number;
    processors: number;
    socket: string;
    loadPercent: number;
    loadUserPercent: number;
    loadSystemPercent: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    tempMainC: number | null;
    tempMaxC: number | null;
    perCoreLoads: number[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    activeBytes: number;
    usedPercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapPercent: number;
  };
  battery: {
    hasBattery: boolean;
    percent: number;
    isCharging: boolean;
    acConnected: boolean;
    timeRemainingMin: number | null;
    cycleCount: number | null;
    model: string;
    manufacturer: string;
  };
  disks: Array<{
    fs: string;
    type: string;
    mount: string;
    sizeBytes: number;
    usedBytes: number;
    availableBytes: number;
    usePercent: number;
    rw: boolean;
  }>;
  network: Array<{
    iface: string;
    ip4: string;
    ip6: string;
    mac: string;
    internal: boolean;
    default: boolean;
    type: string;
    speedMbps: number | null;
    operstate: string;
  }>;
  graphics: {
    controllers: Array<{
      vendor: string;
      model: string;
      vramMb: number | null;
      bus: string;
      driverVersion: string;
    }>;
    displays: Array<{
      model: string;
      main: boolean;
      builtin: boolean;
      connection: string;
      resolutionX: number | null;
      resolutionY: number | null;
      refreshRate: number | null;
    }>;
  };
  platformDetails: {
    family: "windows" | "unix";
    summary: string;
    highlights: Array<[string, string]>;
  };
}

export interface SysinfoTable {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface SysinfoSectionResult {
  section: SysinfoSectionId;
  platform: Platform;
  osLabel: string;
  timestamp: number;
  facts: Array<[string, string]>;
  tables: SysinfoTable[];
  raw: Record<string, unknown>;
}

export interface SysinfoHooks {
  /** Override overview collection for fast deterministic tests. */
  getOverview?: (platform: Platform) => Promise<SysinfoOverview>;
  /** Override section collection for tests. */
  getSection?: (section: SysinfoSectionId, platform: Platform) => Promise<SysinfoSectionResult>;
  /** Override individual `systeminformation` probe calls for tests. */
  runProbe?: (method: string, param: string, platform: Platform) => Promise<unknown>;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec)}s`;
}

export function platformLabel(platform: Platform): string {
  return platform === "win32" ? "Windows" : platform === "linux" ? "Linux" : "macOS";
}

export function buildPlatformHighlights(
  platform: Platform,
  osData: { distro: string; release: string; codename: string; kernel: string; arch: string; uefi: boolean | null; hypervisor: string; shell: string },
  disks: Array<{ mount: string; type: string; fs: string }>,
): { family: "windows" | "unix"; summary: string; highlights: Array<[string, string]> } {
  if (platform === "win32") {
    const drives = disks.map((d) => d.mount || d.fs).filter(Boolean).join(", ") || "C:\\";
    return {
      family: "windows",
      summary: "Windows NT / CIM / WMI hardware & system telemetry",
      highlights: [
        ["OS Family", "Windows NT (win32)"],
        ["Edition / Build", `${osData.distro || "Windows"} (${osData.release || os.release()})`],
        ["Boot Firmware", osData.uefi === true ? "UEFI" : osData.uefi === false ? "Legacy BIOS" : "Standard"],
        ["Hypervisor / VBS", osData.hypervisor || "None detected"],
        ["Drive Letters", drives],
        ["Command Shell", osData.shell || process.env.ComSpec || "PowerShell / cmd.exe"],
      ],
    };
  }
  if (platform === "linux") {
    const rootFs = disks.find((d) => d.mount === "/") ?? disks[0];
    return {
      family: "unix",
      summary: "Linux /proc, sysfs, and udev kernel & hardware telemetry",
      highlights: [
        ["OS Family", "POSIX / Linux"],
        ["Distribution", `${osData.distro || "Linux"} ${osData.release || ""}`.trim()],
        ["Kernel Version", osData.kernel || os.release()],
        ["Architecture", osData.arch || os.arch()],
        ["Root Filesystem", rootFs ? `${rootFs.mount} (${rootFs.type || rootFs.fs})` : "/"],
        ["Default Shell", osData.shell || process.env.SHELL || "/bin/bash"],
      ],
    };
  }
  const rootFs = disks.find((d) => d.mount === "/") ?? disks[0];
  return {
    family: "unix",
    summary: "macOS Darwin IOKit, sysctl, and diskutil hardware telemetry",
    highlights: [
      ["OS Family", "POSIX / Darwin (macOS)"],
      ["macOS Release", `${osData.distro || "macOS"} ${osData.release || ""}${osData.codename ? ` (${osData.codename})` : ""}`.trim()],
      ["Darwin Kernel", osData.kernel || os.release()],
      ["Silicon / Arch", osData.arch === "arm64" ? "Apple Silicon (arm64)" : osData.arch || os.arch()],
      ["System Volume", rootFs ? `${rootFs.mount} (${rootFs.type || rootFs.fs})` : "/ (APFS)"],
      ["Login Shell", osData.shell || process.env.SHELL || "/bin/zsh"],
    ],
  };
}

let cachedStaticInfo: {
  at: number;
  osInfo: any;
  cpu: any;
  graphics: any;
} | null = null;

async function getStaticInfo() {
  const now = Date.now();
  if (cachedStaticInfo && now - cachedStaticInfo.at < 60_000) {
    return cachedStaticInfo;
  }
  const [osInfo, cpu, graphics] = await Promise.all([
    si.osInfo().catch(() => ({})),
    si.cpu().catch(() => ({})),
    si.graphics().catch(() => ({ controllers: [], displays: [] })),
  ]);
  cachedStaticInfo = { at: now, osInfo, cpu, graphics };
  return cachedStaticInfo;
}

export async function collectSysinfoOverview(
  platform: Platform,
  hooks: SysinfoHooks = {},
): Promise<SysinfoOverview> {
  if (hooks.getOverview) {
    return await hooks.getOverview(platform);
  }

  const [staticInfo, load, mem, temp, battery, fsSize, netIfaces] = await Promise.all([
    getStaticInfo(),
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.battery().catch(() => null),
    si.fsSize().catch(() => []),
    si.networkInterfaces().catch(() => []),
  ]);

  const osCpus = os.cpus();
  const cpuInfo = (staticInfo.cpu || {}) as Record<string, any>;
  const osInfo = (staticInfo.osInfo || {}) as Record<string, any>;
  const gfxInfo = (staticInfo.graphics || { controllers: [], displays: [] }) as Record<string, any>;

  const totalMem = mem?.total ?? os.totalmem();
  const freeMem = mem?.free ?? os.freemem();
  const availMem = mem?.available ?? freeMem;
  const activeMem = mem?.active ?? Math.max(0, totalMem - availMem);
  const usedMem = Math.max(0, totalMem - availMem);
  const usedPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0;
  const swapTotal = mem?.swaptotal ?? 0;
  const swapUsed = mem?.swapused ?? 0;
  const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0;

  const [avg1 = 0, avg5 = 0, avg15 = 0] = os.loadavg();
  const logicalCores = Number(cpuInfo.cores) || osCpus.length || 1;
  const physicalCores = Number(cpuInfo.physicalCores) || logicalCores;
  const loadPercent =
    load && Number.isFinite(load.currentLoad)
      ? Math.round(load.currentLoad * 10) / 10
      : Math.min(100, Math.round(((avg1 / logicalCores) * 100) * 10) / 10);
  const loadUserPercent = load && Number.isFinite(load.currentLoadUser) ? Math.round(load.currentLoadUser * 10) / 10 : 0;
  const loadSystemPercent = load && Number.isFinite(load.currentLoadSystem) ? Math.round(load.currentLoadSystem * 10) / 10 : 0;
  const perCoreLoads = Array.isArray(load?.cpus)
    ? load.cpus.map((c: any) => Math.round((Number(c.load) || 0) * 10) / 10)
    : osCpus.map(() => loadPercent);

  const uptimeSec = Math.floor(os.uptime());
  let currentUser = "user";
  try {
    currentUser = os.userInfo().username;
  } catch {
    currentUser = process.env.USER || process.env.USERNAME || "user";
  }
  const defaultShell =
    platform === "win32"
      ? process.env.ComSpec || "powershell.exe"
      : process.env.SHELL || "/bin/zsh";

  const disks = (Array.isArray(fsSize) ? fsSize : []).slice(0, 16).map((d: any) => ({
    fs: String(d.fs || ""),
    type: String(d.type || ""),
    mount: String(d.mount || d.fs || ""),
    sizeBytes: Number(d.size) || 0,
    usedBytes: Number(d.used) || 0,
    availableBytes: Number(d.available) || 0,
    usePercent: Math.round((Number(d.use) || 0) * 10) / 10,
    rw: d.rw !== false,
  }));

  const ifaceList = Array.isArray(netIfaces) ? netIfaces : netIfaces ? [netIfaces] : [];
  const network = ifaceList.slice(0, 16).map((n: any) => ({
    iface: String(n.iface || n.ifaceName || ""),
    ip4: String(n.ip4 || ""),
    ip6: String(n.ip6 || ""),
    mac: String(n.mac || ""),
    internal: Boolean(n.internal),
    default: Boolean(n.default),
    type: String(n.type || ""),
    speedMbps: Number.isFinite(Number(n.speed)) && Number(n.speed) > 0 ? Number(n.speed) : null,
    operstate: String(n.operstate || "up"),
  }));

  const osBlock = {
    distro: String(osInfo.distro || platformLabel(platform)),
    release: String(osInfo.release || os.release()),
    codename: String(osInfo.codename || ""),
    kernel: String(osInfo.kernel || os.release()),
    arch: String(osInfo.arch || os.arch()),
    hostname: String(osInfo.hostname || os.hostname()),
    fqdn: String(osInfo.fqdn || os.hostname()),
    serial: String(osInfo.serial || ""),
    uefi: typeof osInfo.uefi === "boolean" ? osInfo.uefi : null,
    hypervisor: String(osInfo.hypervisor || ""),
    uptimeSec,
    uptimeFormatted: formatDurationSec(uptimeSec),
    shell: defaultShell,
    user: currentUser,
    homeDir: os.homedir(),
    bunVersion: typeof Bun !== "undefined" ? Bun.version : "",
    nodeVersion: process.versions.node || "",
  };

  return {
    timestamp: Date.now(),
    platform,
    osLabel: platformLabel(platform),
    os: osBlock,
    cpu: {
      manufacturer: String(cpuInfo.manufacturer || ""),
      brand: String(cpuInfo.brand || osCpus[0]?.model || "Processor").trim(),
      speedGhz: Number(cpuInfo.speed) || Math.round(((osCpus[0]?.speed || 0) / 1000) * 100) / 100,
      speedMaxGhz: Number(cpuInfo.speedMax) || Number(cpuInfo.speed) || 0,
      physicalCores,
      logicalCores,
      processors: Number(cpuInfo.processors) || 1,
      socket: String(cpuInfo.socket || ""),
      loadPercent,
      loadUserPercent,
      loadSystemPercent,
      loadAvg1m: Math.round(avg1 * 100) / 100,
      loadAvg5m: Math.round(avg5 * 100) / 100,
      loadAvg15m: Math.round(avg15 * 100) / 100,
      tempMainC: temp && Number.isFinite(Number(temp.main)) && Number(temp.main) > 0 ? Math.round(Number(temp.main) * 10) / 10 : null,
      tempMaxC: temp && Number.isFinite(Number(temp.max)) && Number(temp.max) > 0 ? Math.round(Number(temp.max) * 10) / 10 : null,
      perCoreLoads,
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      availableBytes: availMem,
      activeBytes: activeMem,
      usedPercent,
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapPercent,
    },
    battery: {
      hasBattery: Boolean(battery?.hasBattery),
      percent: Number(battery?.percent) || 0,
      isCharging: Boolean(battery?.isCharging),
      acConnected: Boolean(battery?.acConnected),
      timeRemainingMin: Number.isFinite(Number(battery?.timeRemaining)) && Number(battery?.timeRemaining) >= 0 ? Number(battery?.timeRemaining) : null,
      cycleCount: Number.isFinite(Number(battery?.cycleCount)) && Number(battery?.cycleCount) > 0 ? Number(battery?.cycleCount) : null,
      model: String(battery?.model || ""),
      manufacturer: String(battery?.manufacturer || ""),
    },
    disks,
    network,
    graphics: {
      controllers: (Array.isArray(gfxInfo.controllers) ? gfxInfo.controllers : []).map((c: any) => ({
        vendor: String(c.vendor || ""),
        model: String(c.model || ""),
        vramMb: Number.isFinite(Number(c.vram)) ? Number(c.vram) : null,
        bus: String(c.bus || ""),
        driverVersion: String(c.driverVersion || ""),
      })),
      displays: (Array.isArray(gfxInfo.displays) ? gfxInfo.displays : []).map((d: any) => ({
        model: String(d.model || "Display"),
        main: Boolean(d.main),
        builtin: Boolean(d.builtin),
        connection: String(d.connection || ""),
        resolutionX: Number.isFinite(Number(d.resolutionX)) ? Number(d.resolutionX) : null,
        resolutionY: Number.isFinite(Number(d.resolutionY)) ? Number(d.resolutionY) : null,
        refreshRate: Number.isFinite(Number(d.currentRefreshRate)) ? Number(d.currentRefreshRate) : null,
      })),
    },
    platformDetails: buildPlatformHighlights(platform, osBlock, disks),
  };
}

export async function collectSysinfoSection(
  section: SysinfoSectionId,
  platform: Platform,
  hooks: SysinfoHooks = {},
): Promise<SysinfoSectionResult> {
  if (hooks.getSection) {
    return await hooks.getSection(section, platform);
  }

  const osLabel = platformLabel(platform);
  const timestamp = Date.now();

  if (section === "overview") {
    const ov = await collectSysinfoOverview(platform, hooks);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Operating System", `${ov.os.distro} ${ov.os.release} (${ov.os.arch})`],
        ["Hostname", ov.os.hostname],
        ["Kernel", ov.os.kernel],
        ["System Uptime", ov.os.uptimeFormatted],
        ["Processor", `${ov.cpu.brand} (${ov.cpu.physicalCores}P / ${ov.cpu.logicalCores}L cores)`],
        ["CPU Load", `${ov.cpu.loadPercent}% (User ${ov.cpu.loadUserPercent}%, System ${ov.cpu.loadSystemPercent}%)`],
        ["Memory Used", `${formatBytes(ov.memory.usedBytes)} / ${formatBytes(ov.memory.totalBytes)} (${ov.memory.usedPercent}%)`],
        ["Swap Used", ov.memory.swapTotalBytes > 0 ? `${formatBytes(ov.memory.swapUsedBytes)} / ${formatBytes(ov.memory.swapTotalBytes)} (${ov.memory.swapPercent}%)` : "None"],
        ["Battery", ov.battery.hasBattery ? `${ov.battery.percent}% (${ov.battery.isCharging ? "Charging" : ov.battery.acConnected ? "AC Power" : "On Battery"})` : "Desktop / AC Power"],
        ...ov.platformDetails.highlights,
      ],
      tables: [
        {
          title: "Mounted Storage Volumes",
          columns: ["Mount", "Filesystem", "Type", "Size", "Used", "Available", "Use %"],
          rows: ov.disks.map((d) => [
            d.mount,
            d.fs,
            d.type,
            formatBytes(d.sizeBytes),
            formatBytes(d.usedBytes),
            formatBytes(d.availableBytes),
            `${d.usePercent}%`,
          ]),
        },
        {
          title: "Network Interfaces",
          columns: ["Interface", "IPv4", "IPv6", "MAC", "Type", "Speed", "State"],
          rows: ov.network.map((n) => [
            n.iface + (n.default ? " (default)" : ""),
            n.ip4 || "—",
            n.ip6 || "—",
            n.mac || "—",
            n.type || (n.internal ? "loopback" : "net"),
            n.speedMbps ? `${n.speedMbps} Mbps` : "—",
            n.operstate,
          ]),
        },
      ],
      raw: ov as unknown as Record<string, unknown>,
    };
  }

  if (section === "hardware") {
    const [system, bios, baseboard, chassis] = await Promise.all([
      si.system().catch(() => ({} as any)),
      si.bios().catch(() => ({} as any)),
      si.baseboard().catch(() => ({} as any)),
      si.chassis().catch(() => ({} as any)),
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["System Manufacturer", String(system.manufacturer || "—")],
        ["System Model", String(system.model || "—")],
        ["System Version", String(system.version || "—")],
        ["Serial Number", String(system.serial || "—")],
        ["Hardware UUID", String(system.uuid || "—")],
        ["Virtual Machine", system.virtual ? `Yes (${system.virtualHost || "VM"})` : "Physical Machine"],
        ["BIOS / Firmware Vendor", String(bios.vendor || "—")],
        ["BIOS Version", String(bios.version || "—")],
        ["BIOS Release Date", String(bios.releaseDate || "—")],
        ["Baseboard Manufacturer", String(baseboard.manufacturer || "—")],
        ["Baseboard Model", String(baseboard.model || "—")],
        ["RAM Slots", baseboard.memSlots ? String(baseboard.memSlots) : "—"],
        ["Chassis Type", String(chassis.type || "—")],
      ],
      tables: [],
      raw: { system, bios, baseboard, chassis },
    };
  }

  if (section === "cpu") {
    const [cpu, speed, load, temp] = await Promise.all([
      si.cpu().catch(() => ({} as any)),
      si.cpuCurrentSpeed().catch(() => ({} as any)),
      si.currentLoad().catch(() => ({} as any)),
      si.cpuTemperature().catch(() => ({} as any)),
    ]);
    const coresRows: Array<Array<string | number>> = (Array.isArray(load.cpus) ? load.cpus : []).map((c: any, idx: number) => [
      `Core #${idx + 1}`,
      `${(Number(c.load) || 0).toFixed(1)}%`,
      `${(Number(c.loadUser) || 0).toFixed(1)}%`,
      `${(Number(c.loadSystem) || 0).toFixed(1)}%`,
      speed.cores?.[idx] ? `${speed.cores[idx]} GHz` : `${speed.avg || cpu.speed || "—"} GHz`,
      temp.cores?.[idx] ? `${temp.cores[idx]} °C` : "—",
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Processor", `${cpu.manufacturer || ""} ${cpu.brand || ""}`.trim() || os.cpus()[0]?.model || "—"],
        ["Vendor / Family / Model", `${cpu.vendor || "—"} / ${cpu.family || "—"} / ${cpu.model || "—"}`],
        ["Physical / Logical Cores", `${cpu.physicalCores || "—"} physical, ${cpu.cores || os.cpus().length} logical`],
        ["Base / Max Clock", `${cpu.speed || "—"} GHz (Max ${cpu.speedMax || cpu.speed || "—"} GHz)`],
        ["Current Avg Clock", `${speed.avg || cpu.speed || "—"} GHz`],
        ["Socket / Governor", `${cpu.socket || "SoC"} / ${cpu.governor || "auto"}`],
        ["L1d / L1i Cache", `${formatBytes(Number(cpu.cache?.l1d) || 0)} / ${formatBytes(Number(cpu.cache?.l1i) || 0)}`],
        ["L2 / L3 Cache", `${formatBytes(Number(cpu.cache?.l2) || 0)} / ${formatBytes(Number(cpu.cache?.l3) || 0)}`],
        ["Package Temperature", temp.main ? `${temp.main} °C (Max ${temp.max || temp.main} °C)` : "Not reported by OS"],
      ],
      tables: [
        {
          title: "Per-Core Utilization & Clocks",
          columns: ["Core", "Total Load", "User %", "System %", "Clock Speed", "Temp"],
          rows: coresRows,
        },
      ],
      raw: { cpu, speed, load, temp },
    };
  }

  if (section === "memory") {
    const [mem, layout] = await Promise.all([
      si.mem().catch(() => ({} as any)),
      si.memLayout().catch(() => [] as any[]),
    ]);
    const total = Number(mem.total) || os.totalmem();
    const avail = Number(mem.available) || Number(mem.free) || os.freemem();
    const used = Math.max(0, total - avail);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Total Physical RAM", formatBytes(total)],
        ["Used Memory", `${formatBytes(used)} (${total > 0 ? ((used / total) * 100).toFixed(1) : 0}%)`],
        ["Available Memory", formatBytes(avail)],
        ["Free (Unallocated)", formatBytes(Number(mem.free) || 0)],
        ["Active Memory", formatBytes(Number(mem.active) || 0)],
        ["Buffers / Cache", formatBytes(Number(mem.buffcache) || 0)],
        ["Swap Total", formatBytes(Number(mem.swaptotal) || 0)],
        ["Swap Used", formatBytes(Number(mem.swapused) || 0)],
        ["Swap Free", formatBytes(Number(mem.swapfree) || 0)],
      ],
      tables: [
        {
          title: "Physical Memory Modules (DIMMs / Banks)",
          columns: ["Bank", "Size", "Type", "Clock Speed", "Form Factor", "Manufacturer", "Part Number"],
          rows: (Array.isArray(layout) ? layout : []).map((m: any, i: number) => [
            String(m.bank || `Slot ${i + 1}`),
            formatBytes(Number(m.size) || 0),
            String(m.type || "—"),
            m.clockSpeed ? `${m.clockSpeed} MHz` : "—",
            String(m.formFactor || "—"),
            String(m.manufacturer || "—"),
            String(m.partNum || "—"),
          ]),
        },
      ],
      raw: { mem, layout },
    };
  }

  if (section === "disks") {
    const [fsSize, blockDevices, diskLayout, disksIO] = await Promise.all([
      si.fsSize().catch(() => [] as any[]),
      si.blockDevices().catch(() => [] as any[]),
      si.diskLayout().catch(() => [] as any[]),
      si.disksIO().catch(() => ({} as any)),
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Mounted Filesystems", String(Array.isArray(fsSize) ? fsSize.length : 0)],
        ["Physical Drives", String(Array.isArray(diskLayout) ? diskLayout.length : 0)],
        ["Read / Write IOPS", `${disksIO?.rIO_sec ?? 0} / ${disksIO?.wIO_sec ?? 0} ops/s`],
        ["Total Read / Write Ops", `${disksIO?.rIO ?? 0} / ${disksIO?.wIO ?? 0}`],
      ],
      tables: [
        {
          title: "Mounted Filesystems",
          columns: ["Mount", "Filesystem", "Type", "Capacity", "Used", "Available", "Use %", "Access"],
          rows: (Array.isArray(fsSize) ? fsSize : []).map((d: any) => [
            String(d.mount || d.fs || ""),
            String(d.fs || ""),
            String(d.type || ""),
            formatBytes(Number(d.size) || 0),
            formatBytes(Number(d.used) || 0),
            formatBytes(Number(d.available) || 0),
            `${(Number(d.use) || 0).toFixed(1)}%`,
            d.rw === false ? "Read-only" : "Read/Write",
          ]),
        },
        {
          title: "Physical Drives",
          columns: ["Device", "Name", "Vendor", "Type", "Interface", "Size", "SMART Status"],
          rows: (Array.isArray(diskLayout) ? diskLayout : []).map((d: any) => [
            String(d.device || ""),
            String(d.name || "Drive"),
            String(d.vendor || "—"),
            String(d.type || "—"),
            String(d.interfaceType || "—"),
            formatBytes(Number(d.size) || 0),
            String(d.smartStatus || "Ok"),
          ]),
        },
        {
          title: "Block Devices & Partitions",
          columns: ["Name", "Type", "FSType", "Mount", "Size", "Label", "Removable"],
          rows: (Array.isArray(blockDevices) ? blockDevices : []).slice(0, 30).map((b: any) => [
            String(b.name || ""),
            String(b.type || ""),
            String(b.fsType || "—"),
            String(b.mount || "—"),
            formatBytes(Number(b.size) || 0),
            String(b.label || "—"),
            b.removable ? "Yes" : "No",
          ]),
        },
      ],
      raw: { fsSize, blockDevices, diskLayout, disksIO },
    };
  }

  if (section === "network") {
    const [ifaces, stats, gateway] = await Promise.all([
      si.networkInterfaces().catch(() => [] as any[]),
      si.networkStats().catch(() => [] as any[]),
      si.networkGatewayDefault().catch(() => ""),
    ]);
    const ifaceList = Array.isArray(ifaces) ? ifaces : ifaces ? [ifaces] : [];
    const statList = Array.isArray(stats) ? stats : stats ? [stats] : [];
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Hostname", os.hostname()],
        ["Default Gateway", String(gateway || "—")],
        ["Network Interfaces", String(ifaceList.length)],
      ],
      tables: [
        {
          title: "Network Interfaces (NICs)",
          columns: ["Interface", "IPv4", "IPv6", "MAC", "Type", "Speed", "MTU", "State"],
          rows: ifaceList.map((n: any) => [
            String(n.iface || "") + (n.default ? " ★" : ""),
            String(n.ip4 || "—"),
            String(n.ip6 || "—"),
            String(n.mac || "—"),
            String(n.type || (n.internal ? "loopback" : "net")),
            n.speed ? `${n.speed} Mbps` : "—",
            n.mtu ? String(n.mtu) : "—",
            String(n.operstate || "up"),
          ]),
        },
        {
          title: "Live Interface Traffic",
          columns: ["Interface", "State", "RX Total", "TX Total", "RX / sec", "TX / sec", "Errors"],
          rows: statList.map((s: any) => [
            String(s.iface || ""),
            String(s.operstate || "up"),
            formatBytes(Number(s.rx_bytes) || 0),
            formatBytes(Number(s.tx_bytes) || 0),
            `${formatBytes(Math.max(0, Number(s.rx_sec) || 0))}/s`,
            `${formatBytes(Math.max(0, Number(s.tx_sec) || 0))}/s`,
            String((Number(s.rx_errors) || 0) + (Number(s.tx_errors) || 0)),
          ]),
        },
      ],
      raw: { interfaces: ifaceList, stats: statList, gateway },
    };
  }

  if (section === "graphics") {
    const [gfx, audio] = await Promise.all([
      si.graphics().catch(() => ({ controllers: [], displays: [] })),
      si.audio().catch(() => [] as any[]),
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["GPU Controllers", String((gfx.controllers || []).length)],
        ["Connected Displays", String((gfx.displays || []).length)],
        ["Audio Endpoints", String(Array.isArray(audio) ? audio.length : 0)],
      ],
      tables: [
        {
          title: "Graphics Controllers (GPUs)",
          columns: ["Vendor", "Model", "Bus", "VRAM", "Driver"],
          rows: (gfx.controllers || []).map((c: any) => [
            String(c.vendor || "—"),
            String(c.model || "—"),
            String(c.bus || "—"),
            c.vram ? `${c.vram} MB` : "Shared / Unified",
            String(c.driverVersion || "—"),
          ]),
        },
        {
          title: "Displays & Monitors",
          columns: ["Display", "Main", "Built-in", "Connection", "Resolution", "Refresh Rate"],
          rows: (gfx.displays || []).map((d: any) => [
            String(d.model || "Display"),
            d.main ? "Yes" : "No",
            d.builtin ? "Yes" : "No",
            String(d.connection || "—"),
            d.resolutionX && d.resolutionY ? `${d.resolutionX} × ${d.resolutionY}` : "—",
            d.currentRefreshRate ? `${d.currentRefreshRate} Hz` : "—",
          ]),
        },
        {
          title: "Audio Devices",
          columns: ["Name", "Manufacturer", "Type", "Channel", "Status"],
          rows: (Array.isArray(audio) ? audio : []).map((a: any) => [
            String(a.name || "Audio Device"),
            String(a.manufacturer || "—"),
            String(a.type || "—"),
            String(a.channel || "—"),
            String(a.status || "Active"),
          ]),
        },
      ],
      raw: { graphics: gfx, audio },
    };
  }

  if (section === "peripherals") {
    const [battery, usb, bt, printers] = await Promise.all([
      si.battery().catch(() => ({} as any)),
      si.usb().catch(() => [] as any[]),
      si.bluetoothDevices().catch(() => [] as any[]),
      si.printer().catch(() => [] as any[]),
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Battery Installed", battery.hasBattery ? "Yes" : "No (AC Desktop)"],
        ["Battery Charge", battery.hasBattery ? `${battery.percent}% (${battery.isCharging ? "Charging" : "Discharging"})` : "—"],
        ["Battery Cycles", battery.cycleCount ? String(battery.cycleCount) : "—"],
        ["USB Devices", String(Array.isArray(usb) ? usb.length : 0)],
        ["Bluetooth Devices", String(Array.isArray(bt) ? bt.length : 0)],
        ["Printers", String(Array.isArray(printers) ? printers.length : 0)],
      ],
      tables: [
        {
          title: "USB Devices",
          columns: ["Name", "Type", "Vendor / Manufacturer", "Bus", "Removable"],
          rows: (Array.isArray(usb) ? usb : []).slice(0, 30).map((u: any) => [
            String(u.name || "USB Device"),
            String(u.type || "—"),
            String(u.manufacturer || u.vendor || "—"),
            String(u.bus ?? "—"),
            u.removable ? "Yes" : "No",
          ]),
        },
        {
          title: "Bluetooth Peripherals",
          columns: ["Name", "Type", "Manufacturer", "MAC", "Connected", "Battery"],
          rows: (Array.isArray(bt) ? bt : []).slice(0, 25).map((b: any) => [
            String(b.name || "Bluetooth Device"),
            String(b.type || "—"),
            String(b.manufacturer || "—"),
            String(b.macDevice || "—"),
            b.connected ? "Connected" : "Paired",
            b.batteryPercent ? `${b.batteryPercent}%` : "—",
          ]),
        },
        {
          title: "Configured Printers",
          columns: ["Name", "Model", "URI", "Default", "Local", "Status"],
          rows: (Array.isArray(printers) ? printers : []).map((p: any) => [
            String(p.name || "Printer"),
            String(p.model || "—"),
            String(p.uri || "—"),
            p.default ? "Yes" : "No",
            p.local ? "Yes" : "No",
            String(p.status || "Idle"),
          ]),
        },
      ],
      raw: { battery, usb, bluetooth: bt, printers },
    };
  }

  // software
  const [osInfo, versions, users] = await Promise.all([
    si.osInfo().catch(() => ({} as any)),
    si.versions().catch(() => ({} as any)),
    si.users().catch(() => [] as any[]),
  ]);
  const versionRows: Array<Array<string | number>> = Object.entries(versions || {})
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => [k, String(v)]);
  if (typeof Bun !== "undefined" && !versionRows.some(([k]) => k === "bun")) {
    versionRows.unshift(["bun", Bun.version]);
  }
  return {
    section: "software",
    platform,
    osLabel,
    timestamp,
    facts: [
      ["OS Distribution", `${osInfo.distro || osLabel} ${osInfo.release || os.release()}`],
      ["Kernel / Build", String(osInfo.kernel || os.release())],
      ["Architecture", String(osInfo.arch || os.arch())],
      ["Hostname", String(osInfo.hostname || os.hostname())],
      ["Bun Runtime", typeof Bun !== "undefined" ? Bun.version : "—"],
      ["Node Compatibility", process.versions.node || "—"],
      ["Timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"],
    ],
    tables: [
      {
        title: "Detected Software & Runtime Versions",
        columns: ["Component", "Version"],
        rows: versionRows,
      },
      {
        title: "Active User Sessions",
        columns: ["User", "Terminal / TTY", "Login Date", "Login Time", "IP / Host", "Last Command"],
        rows: (Array.isArray(users) ? users : []).map((u: any) => [
          String(u.user || ""),
          String(u.tty || "—"),
          String(u.date || "—"),
          String(u.time || "—"),
          String(u.ip || "local"),
          String(u.command || "—"),
        ]),
      },
    ],
    raw: { osInfo, versions, users },
  };
}

export async function runSysinfoProbe(
  method: string,
  param: string,
  platform: Platform,
  hooks: SysinfoHooks = {},
): Promise<{
  method: string;
  category: string;
  label: string;
  description: string;
  platform: Platform;
  elapsedMs: number;
  timestamp: number;
  data: unknown;
  flatRows: Array<[string, string]>;
  table: SysinfoTable | null;
}> {
  const entry = SYSINFO_PROBE_CATALOG.find((c) => c.method === method);
  if (!entry) {
    throw new Error(`Unsupported system probe: "${method}".`);
  }

  const cleanParam = String(param ?? "").slice(0, 200).trim();
  if (entry.hasParam && cleanParam) {
    if (method === "inetLatency") {
      if (cleanParam.startsWith("-") || !/^[a-zA-Z0-9.:-]+$/.test(cleanParam)) {
        throw new Error("Invalid target host for inetLatency probe.");
      }
    } else if (!/^[a-zA-Z0-9_.,\s*-]+$/.test(cleanParam)) {
      throw new Error(`Invalid parameter for "${method}" probe.`);
    }
  }

  const started = performance.now();
  let data: unknown;
  if (hooks.runProbe) {
    data = await hooks.runProbe(method, cleanParam, platform);
  } else {
    const fn = (si as Record<string, any>)[method];
    if (typeof fn !== "function") {
      throw new Error(`Probe "${method}" is not available on this platform.`);
    }
    data = entry.hasParam ? await fn(cleanParam || entry.defaultParam || "") : await fn();
  }
  const elapsedMs = Math.max(1, Math.round(performance.now() - started));

  const flat = flattenData(data, "", {}, 600);
  const flatRows: Array<[string, string]> = Object.entries(flat).map(([k, v]) => [
    k,
    v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v),
  ]);

  let table: SysinfoTable | null = null;
  if (Array.isArray(data) && data.length > 0 && data.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const cols: string[] = [];
    for (const r of data.slice(0, 50)) {
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        if (typeof v !== "object" || v === null) {
          if (!cols.includes(k)) cols.push(k);
        }
      }
    }
    const cappedCols = cols.slice(0, 10);
    if (cappedCols.length > 0) {
      table = {
        title: entry.label,
        columns: cappedCols,
        rows: data.slice(0, 100).map((r: any) =>
          cappedCols.map((c) => (r[c] === null || r[c] === undefined ? "" : String(r[c]))),
        ),
      };
    }
  }

  return {
    method: entry.method,
    category: entry.category,
    label: entry.label,
    description: entry.description,
    platform,
    elapsedMs,
    timestamp: Date.now(),
    data,
    flatRows,
    table,
  };
}

export function diffSysinfoSnapshots(before: unknown, after: unknown): DataDiff {
  return diffData(before, after);
}

export function formatSysinfoReport(
  title: string,
  data: unknown,
  format: "json" | "csv" | "md" | "html",
  platform: Platform,
): string {
  const generated = new Date().toISOString();
  switch (format) {
    case "csv":
      return toCsv(data) + "\n";
    case "md":
      return toMarkdown(title, data, { platform, generated });
    case "html":
      return toHtmlReport(title, data, { platform, generated });
    case "json":
    default:
      return JSON.stringify({ title, platform, generated, data }, null, 2) + "\n";
  }
}
