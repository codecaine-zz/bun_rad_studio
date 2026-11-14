/**
 * Cross-platform System Information & Hardware Telemetry engine for Codecaine File Manager.
 *
 * Combines fast Node/Bun `os` primitives with `systeminformation` probes and platform-aware
 * normalization across Windows (`win32`), macOS (`darwin`), and Linux (`linux`).
 */
import "../../shared/siBunCompat";
import * as os from "os";
import * as si from "systeminformation";
import {
  diffData,
  flattenData,
  toCsv,
  toHtmlReport,
  toMarkdown,
  type DataDiff,
} from "../../system_report";
import type { Platform } from "./fmPaths";

/** Identifier for a top-level System Information telemetry section. */
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

/** Metadata describing an individual `systeminformation` probe exposed in the probe catalog. */
export interface SysinfoProbeCatalogItem {
  method: string;
  category: string;
  label: string;
  description: string;
  hasParam?: boolean;
  defaultParam?: string;
}

/** Catalog of all 71 supported `systeminformation` v6 probes available in the System Info tool. */
export const SYSINFO_PROBE_CATALOG: SysinfoProbeCatalogItem[] = [
  // 1. System & Hardware (8)
  {
    method: "version",
    category: "Hardware",
    label: "Systeminformation Library Version",
    description: "Installed version of the systeminformation telemetry engine.",
  },
  {
    method: "system",
    category: "Hardware",
    label: "System Model & UUID",
    description: "Hardware manufacturer, model, serial, UUID, and SKU.",
  },
  {
    method: "bios",
    category: "Hardware",
    label: "BIOS / UEFI Firmware",
    description: "BIOS vendor, version, release date, and revision.",
  },
  {
    method: "baseboard",
    category: "Hardware",
    label: "Motherboard / Logic Board",
    description:
      "Baseboard manufacturer, model, version, serial, and memory slots.",
  },
  {
    method: "chassis",
    category: "Hardware",
    label: "Chassis / Enclosure",
    description: "Physical enclosure type, manufacturer, model, and serial.",
  },
  {
    method: "uuid",
    category: "Hardware",
    label: "System & Hardware UUIDs",
    description: "OS installation UUID, hardware UUID, and MAC identifiers.",
  },
  {
    method: "pci",
    category: "Hardware",
    label: "PCI / PCIe Bus Devices",
    description:
      "PCI and PCIe slots, buses, device classes, vendor/device IDs, and kernel drivers.",
  },
  {
    method: "thunderbolt",
    category: "Hardware",
    label: "Thunderbolt / USB4 Buses",
    description:
      "Thunderbolt and USB4 controllers, port UUIDs, buses, and link speeds.",
  },
  // 2. CPU, NPU & Thermal (9)
  {
    method: "cpu",
    category: "CPU",
    label: "Processor Architecture",
    description:
      "CPU brand, vendor, family, model, cores, speeds, and cache sizes.",
  },
  {
    method: "npu",
    category: "CPU",
    label: "Neural Processing Unit (NPU)",
    description:
      "AI / Neural Engine accelerator vendor, model, core count, and driver.",
  },
  {
    method: "cpuFlags",
    category: "CPU",
    label: "CPU Instruction Set Flags",
    description: "Supported processor instruction set extensions and flags.",
  },
  {
    method: "cpuCache",
    category: "CPU",
    label: "CPU Cache Hierarchy",
    description: "L1d, L1i, L2, and L3 cache sizes.",
  },
  {
    method: "cpuCurrentSpeed",
    category: "CPU",
    label: "CPU Clock Speeds",
    description: "Current average, min, max, and per-core GHz clock speeds.",
  },
  {
    method: "cpuTemperature",
    category: "CPU",
    label: "CPU Temperatures",
    description: "Main package, per-core, chipset, and socket thermal sensors.",
  },
  {
    method: "fans",
    category: "CPU",
    label: "Cooling Fans & RPM",
    description:
      "System cooling fan RPM speeds, PWM levels, and sensor labels.",
  },
  {
    method: "currentLoad",
    category: "CPU",
    label: "CPU Load Breakdown",
    description:
      "Overall and per-core user, system, idle, and IRQ CPU load percentages.",
  },
  {
    method: "fullLoad",
    category: "CPU",
    label: "Cumulative Full CPU Load",
    description: "Cumulative CPU load percentage since boot.",
  },
  // 3. Memory & Power (3)
  {
    method: "mem",
    category: "Memory",
    label: "Memory & Swap Usage",
    description:
      "Total, free, used, active, available, buffered/cached, and swap RAM.",
  },
  {
    method: "memLayout",
    category: "Memory",
    label: "Physical RAM Modules (DIMMs)",
    description:
      "Physical memory banks, stick sizes, DDR type, clock speed, and part numbers.",
  },
  {
    method: "battery",
    category: "Memory",
    label: "Battery & Power Status",
    description:
      "Charge percentage, AC status, cycle count, health, and capacity in mWh.",
  },
  // 4. Storage & Disks (6)
  {
    method: "fsSize",
    category: "Storage",
    label: "Mounted Filesystems",
    description:
      "Mounted volumes/drives, filesystem types, capacity, used bytes, and mount points.",
    hasParam: true,
    defaultParam: "",
  },
  {
    method: "fsOpenFiles",
    category: "Storage",
    label: "Open File Descriptors",
    description:
      "System-wide max, allocated, and available open file descriptors.",
  },
  {
    method: "blockDevices",
    category: "Storage",
    label: "Block Devices & Partitions",
    description:
      "Disks, partitions, UUIDs, labels, mount points, and removable media.",
  },
  {
    method: "fsStats",
    category: "Storage",
    label: "Filesystem Read/Write Stats",
    description: "Filesystem read/write byte counters and transfer rates.",
  },
  {
    method: "disksIO",
    category: "Storage",
    label: "Disk I/O Throughput",
    description: "Read/write IOPS, byte transfer counts, and I/O wait metrics.",
  },
  {
    method: "diskLayout",
    category: "Storage",
    label: "Physical Storage Drives",
    description:
      "Physical SSD/NVMe/HDD drives, vendor, firmware, serial, interface, and SMART status.",
  },
  // 5. Graphics & Displays (2)
  {
    method: "gpu",
    category: "Graphics",
    label: "Graphics Controllers (GPUs)",
    description:
      "GPU vendor, model, VRAM, bus, core count, and Metal/DirectX capabilities.",
  },
  {
    method: "displays",
    category: "Graphics",
    label: "Displays & Monitors",
    description:
      "Attached display monitors, native/current resolutions, refresh rates, and connections.",
  },
  // 6. Network, Sockets & Wi-Fi (11)
  {
    method: "networkInterfaceDefault",
    category: "Network",
    label: "Default Network Interface",
    description: "Name of the active primary network interface.",
  },
  {
    method: "networkGatewayDefault",
    category: "Network",
    label: "Default Network Gateway",
    description: "Active default router IP address.",
  },
  {
    method: "networkInterfaces",
    category: "Network",
    label: "Network Interfaces (NICs)",
    description:
      "IPv4/IPv6 addresses, MAC addresses, MTU, link speed, and carrier state.",
    hasParam: true,
    defaultParam: "",
  },
  {
    method: "networkStats",
    category: "Network",
    label: "Network Interface Traffic",
    description:
      "Received/transmitted bytes, throughput per second, packet drops, and errors.",
    hasParam: true,
    defaultParam: "",
  },
  {
    method: "networkConnections",
    category: "Network",
    label: "Active TCP/UDP Connections",
    description:
      "Open network sockets, local/peer addresses, ports, states, and owning PIDs.",
  },
  {
    method: "inetChecksite",
    category: "Network",
    label: "HTTP Site Reachability Check",
    description: "HTTP status code and response time to a target URL.",
    hasParam: true,
    defaultParam: "https://google.com",
  },
  {
    method: "inetLatency",
    category: "Network",
    label: "Internet Ping Latency",
    description: "Round-trip latency in milliseconds to a target host.",
    hasParam: true,
    defaultParam: "1.1.1.1",
  },
  {
    method: "inetPublicIp",
    category: "Network",
    label: "Public External IPv4 & IPv6",
    description:
      "External public IPv4 and IPv6 addresses with lookup latency in ms.",
    hasParam: true,
    defaultParam: "5000",
  },
  {
    method: "wifiNetworks",
    category: "Network",
    label: "Visible Wi-Fi Networks",
    description:
      "Nearby SSIDs, BSSIDs, channels, signal quality, and security modes.",
  },
  {
    method: "wifiInterfaces",
    category: "Network",
    label: "Wi-Fi Adapters",
    description: "Wireless network interface cards, MACs, and vendors.",
  },
  {
    method: "wifiConnections",
    category: "Network",
    label: "Active Wi-Fi Connections",
    description:
      "Currently associated Wi-Fi access points, SSID, BSSID, channel, and TX rate.",
  },
  // 7. Peripherals & Audio (8)
  {
    method: "audio",
    category: "Peripherals",
    label: "Audio Devices",
    description:
      "Sound cards, codecs, input/output channels, and manufacturers.",
  },
  {
    method: "bluetoothDevices",
    category: "Peripherals",
    label: "Bluetooth Devices",
    description:
      "Paired and nearby Bluetooth peripherals, MACs, and battery levels.",
  },
  {
    method: "printer",
    category: "Peripherals",
    label: "Printers & Queues",
    description: "Configured local and network printers and their status.",
  },
  {
    method: "usb",
    category: "Peripherals",
    label: "USB Bus & Devices",
    description:
      "Connected USB controllers, hubs, keyboards, mice, and storage devices.",
  },
  {
    method: "serialPorts",
    category: "Peripherals",
    label: "Serial & UART Ports",
    description:
      "RS-232 and USB-Serial ports, device paths, manufacturers, and PnP IDs.",
  },
  {
    method: "camera",
    category: "Peripherals",
    label: "Cameras & Webcams",
    description:
      "Built-in and external video capture cameras, vendors, and connections.",
  },
  {
    method: "keyboard",
    category: "Peripherals",
    label: "Keyboards",
    description:
      "Connected physical and wireless keyboards, vendors, and connection buses.",
  },
  {
    method: "mouse",
    category: "Peripherals",
    label: "Mice & Pointing Devices",
    description:
      "Connected mice, trackpads, pointing devices, vendors, and connections.",
  },
  // 8. Processes & Services (5)
  {
    method: "processes",
    category: "Processes",
    label: "Running Process Table",
    description:
      "Active processes with PID, parent PID, CPU %, memory %, user, and state.",
  },
  {
    method: "processLoad",
    category: "Processes",
    label: "Process Resource Load",
    description: "CPU and memory utilization for a specific process name.",
    hasParam: true,
    defaultParam: "bun",
  },
  {
    method: "processFocused",
    category: "Processes",
    label: "Focused Foreground Process",
    description:
      "Currently focused frontmost application window PID, name, and executable path.",
  },
  {
    method: "services",
    category: "Processes",
    label: "System Services & Daemons",
    description: "Running state and resource usage of background services.",
    hasParam: true,
    defaultParam: "*",
  },
  {
    method: "users",
    category: "Processes",
    label: "Logged-in User Sessions",
    description: "Active user logins, TTYs, login times, and last commands.",
  },
  // 9. OS & Software (6)
  {
    method: "osInfo",
    category: "Software",
    label: "Operating System Info",
    description:
      "OS distro, release, codename, kernel, architecture, hostname, and UEFI status.",
  },
  {
    method: "versions",
    category: "Software",
    label: "Installed Toolchain Versions",
    description:
      "Detected versions of kernel, OpenSSL, Node, Bun, Git, Python, Docker, etc.",
    hasParam: true,
    defaultParam: "",
  },
  {
    method: "software",
    category: "Software",
    label: "Installed OS Applications",
    description:
      "Installed system and user applications, versions, architectures, paths, and signers.",
  },
  {
    method: "npm",
    category: "Software",
    label: "Local npm Packages",
    description: "Installed npm packages and resolved versions.",
  },
  {
    method: "shell",
    category: "Software",
    label: "Default Login Shell",
    description: "Configured default command shell path.",
  },
  {
    method: "time",
    category: "Software",
    label: "System Clock & Timezone",
    description:
      "Current epoch time, uptime, timezone identifier, and UTC offset.",
  },
  // 10. Virtualization, Docker & Batch (13)
  {
    method: "dockerInfo",
    category: "Virtualization",
    label: "Docker Engine Info",
    description:
      "Docker daemon configuration, server version, storage driver, and container counts.",
  },
  {
    method: "dockerImages",
    category: "Virtualization",
    label: "Docker Images",
    description:
      "Local Docker images with tags, IDs, sizes, and creation dates.",
    hasParam: true,
    defaultParam: "false",
  },
  {
    method: "dockerContainers",
    category: "Virtualization",
    label: "Docker Containers",
    description:
      "Running and stopped Docker container instances, ports, and mounts.",
    hasParam: true,
    defaultParam: "true",
  },
  {
    method: "dockerContainerStats",
    category: "Virtualization",
    label: "Docker Container Stats",
    description:
      "CPU, memory, network, and block I/O telemetry for containers.",
    hasParam: true,
    defaultParam: "*",
  },
  {
    method: "dockerContainerProcesses",
    category: "Virtualization",
    label: "Docker Container Processes",
    description: "Processes executing inside a target Docker container.",
    hasParam: true,
    defaultParam: "*",
  },
  {
    method: "dockerVolumes",
    category: "Virtualization",
    label: "Docker Volumes",
    description: "Docker storage volumes, drivers, and host mountpoints.",
  },
  {
    method: "dockerAll",
    category: "Virtualization",
    label: "Complete Docker Snapshot",
    description:
      "Combined Docker engine info, containers, stats, processes, images, and volumes.",
  },
  {
    method: "vboxInfo",
    category: "Virtualization",
    label: "VirtualBox VMs",
    description:
      "Oracle VirtualBox virtual machines, states,ゲスト OS types, and resource allocations.",
  },
  {
    method: "getStaticData",
    category: "Virtualization",
    label: "Static Hardware Snapshot",
    description:
      "Combined static hardware inventory (system, BIOS, baseboard, CPU, GPU, displays, disks).",
  },
  {
    method: "getDynamicData",
    category: "Virtualization",
    label: "Dynamic Telemetry Snapshot",
    description:
      "Combined live dynamic telemetry (load, memory, disk I/O, network stats, temps, processes).",
  },
  {
    method: "getAllData",
    category: "Virtualization",
    label: "Full System Audit (All Data)",
    description:
      "Complete static and dynamic hardware, OS, storage, network, and process audit.",
  },
  {
    method: "get",
    category: "Virtualization",
    label: "Custom Query Builder (get)",
    description:
      "Selective query across multiple systeminformation domains via JSON or comma list.",
    hasParam: true,
    defaultParam: "cpu,mem",
  },
  {
    method: "observe",
    category: "Virtualization",
    label: "Observer Telemetry Sample",
    description:
      "Captures a single timed observation sample for the specified telemetry keys.",
    hasParam: true,
    defaultParam: "currentLoad,mem",
  },
];

/** Comprehensive snapshot of OS, CPU, memory, battery, storage, network, and graphics telemetry for the System Info overview. */
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

/** Structured tabular view returned as part of a System Info section or probe result. */
export interface SysinfoTable {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

/** Detailed facts, tables, and raw telemetry payload for a single System Info section. */
export interface SysinfoSectionResult {
  section: SysinfoSectionId;
  platform: Platform;
  osLabel: string;
  timestamp: number;
  facts: Array<[string, string]>;
  tables: SysinfoTable[];
  raw: Record<string, unknown>;
}

/** Optional test hooks for overriding system telemetry collection and individual probe execution. */
export interface SysinfoHooks {
  /** Override overview collection for fast deterministic tests. */
  getOverview?: (platform: Platform) => Promise<SysinfoOverview>;
  /** Override section collection for tests. */
  getSection?: (
    section: SysinfoSectionId,
    platform: Platform,
  ) => Promise<SysinfoSectionResult>;
  /** Override individual `systeminformation` probe calls for tests. */
  runProbe?: (
    method: string,
    param: string,
    platform: Platform,
  ) => Promise<unknown>;
}

/** Formats a byte count into a human-readable string (`B`, `KB`, `MB`, `GB`, `TB`, or `PB`). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/** Formats a duration in seconds into a compact human-readable uptime string (e.g. `3d 4h 12m`). */
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

/** Returns the human-readable operating system family label (`Windows`, `Linux`, or `macOS`) for `platform`. */
export function platformLabel(platform: Platform): string {
  return platform === "win32"
    ? "Windows"
    : platform === "linux"
      ? "Linux"
      : "macOS";
}

/** Builds platform-specific OS and hardware summary highlights for Windows, Linux, or macOS. */
export function buildPlatformHighlights(
  platform: Platform,
  osData: {
    distro: string;
    release: string;
    codename: string;
    kernel: string;
    arch: string;
    uefi: boolean | null;
    hypervisor: string;
    shell: string;
  },
  disks: Array<{ mount: string; type: string; fs: string }>,
): {
  family: "windows" | "unix";
  summary: string;
  highlights: Array<[string, string]>;
} {
  if (platform === "win32") {
    const drives =
      disks
        .map((d) => d.mount || d.fs)
        .filter(Boolean)
        .join(", ") || "C:\\";
    return {
      family: "windows",
      summary: "Windows NT / CIM / WMI hardware & system telemetry",
      highlights: [
        ["OS Family", "Windows NT (win32)"],
        [
          "Edition / Build",
          `${osData.distro || "Windows"} (${osData.release || os.release()})`,
        ],
        [
          "Boot Firmware",
          osData.uefi === true
            ? "UEFI"
            : osData.uefi === false
              ? "Legacy BIOS"
              : "Standard",
        ],
        ["Hypervisor / VBS", osData.hypervisor || "None detected"],
        ["Drive Letters", drives],
        [
          "Command Shell",
          osData.shell || process.env.ComSpec || "PowerShell / cmd.exe",
        ],
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
        [
          "Distribution",
          `${osData.distro || "Linux"} ${osData.release || ""}`.trim(),
        ],
        ["Kernel Version", osData.kernel || os.release()],
        ["Architecture", osData.arch || os.arch()],
        [
          "Root Filesystem",
          rootFs ? `${rootFs.mount} (${rootFs.type || rootFs.fs})` : "/",
        ],
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
      [
        "macOS Release",
        `${osData.distro || "macOS"} ${osData.release || ""}${osData.codename ? ` (${osData.codename})` : ""}`.trim(),
      ],
      ["Darwin Kernel", osData.kernel || os.release()],
      [
        "Silicon / Arch",
        osData.arch === "arm64"
          ? "Apple Silicon (arm64)"
          : osData.arch || os.arch(),
      ],
      [
        "System Volume",
        rootFs ? `${rootFs.mount} (${rootFs.type || rootFs.fs})` : "/ (APFS)",
      ],
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
  const [osInfo, cpu, gpu, displays] = await Promise.all([
    si.osInfo().catch(() => ({})),
    si.cpu().catch(() => ({})),
    si.gpu().catch(() => []),
    si.displays().catch(() => []),
  ]);
  const graphics = {
    controllers: Array.isArray(gpu) ? gpu : [],
    displays: Array.isArray(displays) ? displays : [],
  };
  cachedStaticInfo = { at: now, osInfo, cpu, graphics };
  return cachedStaticInfo;
}

/** Collects a full cross-platform `SysinfoOverview` snapshot using `os` primitives and `systeminformation`. */
export async function collectSysinfoOverview(
  platform: Platform,
  hooks: SysinfoHooks = {},
): Promise<SysinfoOverview> {
  if (hooks.getOverview) {
    return await hooks.getOverview(platform);
  }

  const [staticInfo, load, mem, temp, battery, fsSize, netIfaces] =
    await Promise.all([
      getStaticInfo(),
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.cpuTemperature().catch(() => null),
      si.battery().catch(() => null),
      si.fsSize().catch(() => []),
      si.networkInterfaces().catch(() => []),
    ]);

  const showcaseMacUltra = process.env.FM_SHOWCASE_MAC_ULTRA === "1";
  const osCpus = os.cpus();
  const cpuInfo = showcaseMacUltra
    ? {
        ...(staticInfo.cpu || {}),
        manufacturer: "Apple",
        brand:
          "Apple M4 Ultra (32-Core CPU · 80-Core GPU · 32-Core Neural Engine)",
        speed: 4.51,
        speedMax: 4.51,
        physicalCores: 32,
        cores: 32,
        processors: 1,
        socket: "Apple Silicon UltraFusion SoC (Mac16,14)",
      }
    : ((staticInfo.cpu || {}) as Record<string, any>);
  const osInfo = showcaseMacUltra
    ? {
        ...(staticInfo.osInfo || {}),
        distro: "macOS Tahoe",
        release: "26.4",
        codename: "Mac Studio M4 Ultra Workstation",
        arch: "arm64",
        hostname: "Mac-Studio-M4-Ultra.local",
        fqdn: "Mac-Studio-M4-Ultra.local",
      }
    : ((staticInfo.osInfo || {}) as Record<string, any>);
  const gfxInfo = showcaseMacUltra
    ? {
        controllers: [
          {
            vendor: "Apple",
            model:
              "Apple M4 Ultra 80-Core GPU (Hardware Ray Tracing · Metal 4)",
            vram: 196608,
            bus: "Apple UltraFusion Unified Fabric (819 GB/s)",
            driverVersion: "Metal 4.0 (Display-P3 1600-nit XDR)",
          },
        ],
        displays: [
          {
            model: "Apple Pro Display XDR (6K Retina · Nano-texture)",
            main: true,
            builtin: false,
            connection: "Thunderbolt 5 (DisplayPort 2.1)",
            resolutionX: 6016,
            resolutionY: 3384,
            currentRefreshRate: 120,
          },
          {
            model: "Apple Studio Display (5K Retina)",
            main: false,
            builtin: false,
            connection: "Thunderbolt 5",
            resolutionX: 5120,
            resolutionY: 2880,
            currentRefreshRate: 120,
          },
        ],
      }
    : ((staticInfo.graphics || { controllers: [], displays: [] }) as Record<
        string,
        any
      >);

  const totalMem = showcaseMacUltra
    ? 192 * 1024 * 1024 * 1024
    : (mem?.total ?? os.totalmem());
  const freeMem = showcaseMacUltra
    ? 148 * 1024 * 1024 * 1024
    : (mem?.free ?? os.freemem());
  const availMem = showcaseMacUltra
    ? 156 * 1024 * 1024 * 1024
    : (mem?.available ?? freeMem);
  const activeMem = mem?.active ?? Math.max(0, totalMem - availMem);
  const usedMem = Math.max(0, totalMem - availMem);
  const usedPercent =
    totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0;
  const swapTotal = mem?.swaptotal ?? 0;
  const swapUsed = mem?.swapused ?? 0;
  const swapPercent =
    swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0;

  const [avg1 = 0, avg5 = 0, avg15 = 0] = os.loadavg();
  const logicalCores = Number(cpuInfo.cores) || osCpus.length || 1;
  const physicalCores = Number(cpuInfo.physicalCores) || logicalCores;
  const loadPercent =
    load && Number.isFinite(load.currentLoad)
      ? Math.round(load.currentLoad * 10) / 10
      : Math.min(100, Math.round((avg1 / logicalCores) * 100 * 10) / 10);
  const loadUserPercent =
    load && Number.isFinite(load.currentLoadUser)
      ? Math.round(load.currentLoadUser * 10) / 10
      : 0;
  const loadSystemPercent =
    load && Number.isFinite(load.currentLoadSystem)
      ? Math.round(load.currentLoadSystem * 10) / 10
      : 0;
  const perCoreLoads = Array.isArray(load?.cpus)
    ? load.cpus.map((c: any) => Math.round((Number(c.load) || 0) * 10) / 10)
    : osCpus.map(() => loadPercent);

  const isShot = process.env.SCREENSHOT_MODE === "1";
  const uptimeSec = Math.floor(os.uptime());
  let currentUser = "user";
  if (isShot) {
    currentUser = "developer";
  } else {
    try {
      currentUser = os.userInfo().username;
    } catch {
      currentUser = process.env.USER || process.env.USERNAME || "user";
    }
  }
  const defaultShell =
    platform === "win32"
      ? process.env.ComSpec || "powershell.exe"
      : process.env.SHELL || "/bin/zsh";

  const disks = (Array.isArray(fsSize) ? fsSize : [])
    .slice(0, 16)
    .map((d: any) => ({
      fs: String(d.fs || ""),
      type: String(d.type || ""),
      mount: String(d.mount || d.fs || ""),
      sizeBytes: Number(d.size) || 0,
      usedBytes: Number(d.used) || 0,
      availableBytes: Number(d.available) || 0,
      usePercent: Math.round((Number(d.use) || 0) * 10) / 10,
      rw: d.rw !== false,
    }));

  const ifaceList = Array.isArray(netIfaces)
    ? netIfaces
    : netIfaces
      ? [netIfaces]
      : [];
  const network = ifaceList.slice(0, 16).map((n: any) => ({
    iface: String(n.iface || n.ifaceName || ""),
    ip4: isShot
      ? n.internal
        ? "127.0.0.1"
        : "192.168.1.*** (Masked)"
      : String(n.ip4 || ""),
    ip6: isShot ? (n.internal ? "::1" : "fe80::***") : String(n.ip6 || ""),
    mac: isShot
      ? n.internal
        ? "00:00:00:00:00:00"
        : "🔒 [Protected]"
      : String(n.mac || ""),
    internal: Boolean(n.internal),
    default: Boolean(n.default),
    type: String(n.type || ""),
    speedMbps:
      Number.isFinite(Number(n.speed)) && Number(n.speed) > 0
        ? Number(n.speed)
        : null,
    operstate: String(n.operstate || "up"),
  }));

  const osBlock = {
    distro: String(osInfo.distro || platformLabel(platform)),
    release: String(osInfo.release || os.release()),
    codename: String(osInfo.codename || ""),
    kernel: String(osInfo.kernel || os.release()),
    arch: String(osInfo.arch || os.arch()),
    hostname: isShot
      ? "studio-workstation"
      : String(osInfo.hostname || os.hostname()),
    fqdn: isShot
      ? "studio-workstation.local"
      : String(osInfo.fqdn || os.hostname()),
    serial: isShot ? "🔒 [Protected / Masked]" : String(osInfo.serial || ""),
    uefi: typeof osInfo.uefi === "boolean" ? osInfo.uefi : null,
    hypervisor: String(osInfo.hypervisor || ""),
    uptimeSec,
    uptimeFormatted: formatDurationSec(uptimeSec),
    shell: defaultShell,
    user: currentUser,
    homeDir: isShot ? "/Users/developer" : os.homedir(),
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
      speedGhz:
        Number(cpuInfo.speed) ||
        Math.round(((osCpus[0]?.speed || 0) / 1000) * 100) / 100,
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
      tempMainC:
        temp && Number.isFinite(Number(temp.main)) && Number(temp.main) > 0
          ? Math.round(Number(temp.main) * 10) / 10
          : null,
      tempMaxC:
        temp && Number.isFinite(Number(temp.max)) && Number(temp.max) > 0
          ? Math.round(Number(temp.max) * 10) / 10
          : null,
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
    battery: (() => {
      const bat = Array.isArray(battery)
        ? battery[0] || null
        : battery && typeof battery === "object"
          ? (battery as any)
          : null;
      const hasBat = Array.isArray(battery)
        ? battery.length > 0
        : Boolean((battery as any)?.hasBattery);
      return {
        hasBattery: hasBat,
        percent: Number(bat?.percent) || 0,
        isCharging: Boolean(bat?.isCharging),
        acConnected: Boolean(bat?.acConnected),
        timeRemainingMin:
          Number.isFinite(Number(bat?.timeRemaining)) &&
          Number(bat?.timeRemaining) >= 0 &&
          Number(bat?.timeRemaining) < 60000
            ? Number(bat?.timeRemaining)
            : null,
        cycleCount:
          Number.isFinite(Number(bat?.cycleCount)) &&
          Number(bat?.cycleCount) > 0
            ? Number(bat?.cycleCount)
            : null,
        model: String(bat?.model || ""),
        manufacturer: String(bat?.manufacturer || ""),
      };
    })(),
    disks,
    network,
    graphics: {
      controllers: (Array.isArray(gfxInfo.controllers)
        ? gfxInfo.controllers
        : []
      ).map((c: any) => ({
        vendor: String(c.vendor || ""),
        model: String(c.model || ""),
        vramMb: Number.isFinite(Number(c.vram)) ? Number(c.vram) : null,
        bus: String(c.bus || ""),
        driverVersion: String(c.driverVersion || ""),
      })),
      displays: (Array.isArray(gfxInfo.displays) ? gfxInfo.displays : []).map(
        (d: any) => ({
          model: String(d.model || "Display"),
          main: Boolean(d.main),
          builtin: Boolean(d.builtin),
          connection: String(d.connection || ""),
          resolutionX: Number.isFinite(Number(d.resolutionX))
            ? Number(d.resolutionX)
            : null,
          resolutionY: Number.isFinite(Number(d.resolutionY))
            ? Number(d.resolutionY)
            : null,
          refreshRate: Number.isFinite(Number(d.currentRefreshRate))
            ? Number(d.currentRefreshRate)
            : null,
        }),
      ),
    },
    platformDetails: buildPlatformHighlights(platform, osBlock, disks),
  };
}

/** Collects key-value facts, formatted tables, and raw telemetry for a specific `SysinfoSectionId`. */
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
        [
          "Operating System",
          `${ov.os.distro} ${ov.os.release} (${ov.os.arch})`,
        ],
        ["Hostname", ov.os.hostname],
        ["Kernel", ov.os.kernel],
        ["System Uptime", ov.os.uptimeFormatted],
        [
          "Processor",
          `${ov.cpu.brand} (${ov.cpu.physicalCores}P / ${ov.cpu.logicalCores}L cores)`,
        ],
        [
          "CPU Load",
          `${ov.cpu.loadPercent}% (User ${ov.cpu.loadUserPercent}%, System ${ov.cpu.loadSystemPercent}%)`,
        ],
        [
          "Memory Used",
          `${formatBytes(ov.memory.usedBytes)} / ${formatBytes(ov.memory.totalBytes)} (${ov.memory.usedPercent}%)`,
        ],
        [
          "Swap Used",
          ov.memory.swapTotalBytes > 0
            ? `${formatBytes(ov.memory.swapUsedBytes)} / ${formatBytes(ov.memory.swapTotalBytes)} (${ov.memory.swapPercent}%)`
            : "None",
        ],
        [
          "Battery",
          ov.battery.hasBattery
            ? `${ov.battery.percent}% (${ov.battery.isCharging ? "Charging" : ov.battery.acConnected ? "AC Power" : "On Battery"})`
            : "Desktop / AC Power",
        ],
        ...ov.platformDetails.highlights,
      ],
      tables: [
        {
          title: "Mounted Storage Volumes",
          columns: [
            "Mount",
            "Filesystem",
            "Type",
            "Size",
            "Used",
            "Available",
            "Use %",
          ],
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
          columns: [
            "Interface",
            "IPv4",
            "IPv6",
            "MAC",
            "Type",
            "Speed",
            "State",
          ],
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
    const isShot = process.env.SCREENSHOT_MODE === "1";
    const [system, bios, baseboard, chassis, uuid, pci, thunderbolt] =
      await Promise.all([
        si.system().catch(() => ({}) as any),
        si.bios().catch(() => ({}) as any),
        si.baseboard().catch(() => ({}) as any),
        si.chassis().catch(() => ({}) as any),
        si.uuid().catch(() => ({}) as any),
        si.pci().catch(() => [] as any[]),
        si.thunderbolt().catch(() => [] as any[]),
      ]);
    const pciList = Array.isArray(pci) ? pci : [];
    const tbList = Array.isArray(thunderbolt) ? thunderbolt : [];
    const tables: SysinfoTable[] = [];
    if (pciList.length > 0) {
      tables.push({
        title: "PCI / PCIe Devices",
        columns: ["Slot", "Type", "Vendor", "Model", "Driver"],
        rows: pciList
          .slice(0, 30)
          .map((p: any) => [
            String(p.slot || p.bus || "—"),
            String(p.type || "—"),
            String(p.vendor || p.vendorId || "—"),
            String(p.model || p.deviceId || "—"),
            String(p.driver || "—"),
          ]),
      });
    }
    if (tbList.length > 0) {
      tables.push({
        title: "Thunderbolt / USB4 Buses",
        columns: ["Name", "Bus", "Type", "Speed", "UUID"],
        rows: tbList
          .slice(0, 20)
          .map((t: any) => [
            String(t.name || "Thunderbolt"),
            String(t.bus || "—"),
            String(t.type || "—"),
            String(t.speed || "—"),
            isShot ? "🔒 [Protected / Masked]" : String(t.uuid || "—"),
          ]),
      });
    }
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["System Manufacturer", String(system.manufacturer || "—")],
        [
          "System Model",
          isShot ? "Workstation Pro (Demo)" : String(system.model || "—"),
        ],
        ["System Version", String(system.version || "—")],
        [
          "Serial Number",
          isShot ? "🔒 [Protected / Masked]" : String(system.serial || "—"),
        ],
        [
          "Hardware UUID",
          isShot
            ? "🔒 [Protected / Masked]"
            : String(system.uuid || uuid?.hardware || "—"),
        ],
        [
          "OS UUID",
          isShot ? "🔒 [Protected / Masked]" : String(uuid?.os || "—"),
        ],
        [
          "Virtual Machine",
          system.virtual
            ? `Yes (${system.virtualHost || "VM"})`
            : "Physical Machine",
        ],
        ["BIOS / Firmware Vendor", String(bios.vendor || "—")],
        ["BIOS Version", String(bios.version || "—")],
        ["BIOS Release Date", String(bios.releaseDate || "—")],
        ["Baseboard Manufacturer", String(baseboard.manufacturer || "—")],
        ["Baseboard Model", String(baseboard.model || "—")],
        ["RAM Slots", baseboard.memSlots ? String(baseboard.memSlots) : "—"],
        ["Chassis Type", String(chassis.type || "—")],
        ["PCI / PCIe Devices", String(pciList.length)],
        ["Thunderbolt / USB4 Buses", String(tbList.length)],
      ],
      tables,
      raw: {
        system,
        bios,
        baseboard,
        chassis,
        uuid,
        pci: pciList,
        thunderbolt: tbList,
      },
    };
  }

  const showcaseMacUltra = process.env.FM_SHOWCASE_MAC_ULTRA === "1";

  if (section === "cpu") {
    const [rawCpu, speed, load, temp, npu, fans] = await Promise.all([
      si.cpu().catch(() => ({}) as any),
      si.cpuCurrentSpeed().catch(() => ({}) as any),
      si.currentLoad().catch(() => ({}) as any),
      si.cpuTemperature().catch(() => ({}) as any),
      si.npu().catch(() => [] as any[]),
      si.fans().catch(() => [] as any[]),
    ]);
    const npuList = Array.isArray(npu) ? npu : [];
    const fanList = Array.isArray(fans) ? fans : [];
    const cpu = showcaseMacUltra
      ? {
          ...rawCpu,
          manufacturer: "Apple",
          brand: "M4 Ultra (32-Core CPU · 80-Core GPU · 32-Core Neural Engine)",
          vendor: "Apple",
          family: "Apple Silicon M4 Ultra",
          model: "Mac16,14 (UltraFusion)",
          physicalCores: 32,
          cores: 32,
          speed: 4.51,
          speedMax: 4.51,
          socket: "Apple UltraFusion SoC",
          cache: {
            l1d: 192 * 1024,
            l1i: 192 * 1024,
            l2: 64 * 1024 * 1024,
            l3: 128 * 1024 * 1024,
          },
        }
      : rawCpu;
    const coresRows: Array<Array<string | number>> = (
      Array.isArray(load.cpus) ? load.cpus : []
    ).map((c: any, idx: number) => [
      `Core #${idx + 1}`,
      `${(Number(c.load) || 0).toFixed(1)}%`,
      `${(Number(c.loadUser) || 0).toFixed(1)}%`,
      `${(Number(c.loadSystem) || 0).toFixed(1)}%`,
      showcaseMacUltra
        ? "4.51 GHz"
        : speed.cores?.[idx]
          ? `${speed.cores[idx]} GHz`
          : `${speed.avg || cpu.speed || "—"} GHz`,
      temp.cores?.[idx]
        ? `${temp.cores[idx]} °C`
        : showcaseMacUltra
          ? "39 °C"
          : "—",
    ]);
    const cpuTables: SysinfoTable[] = [
      {
        title: "Per-Core Utilization & Clocks",
        columns: [
          "Core",
          "Total Load",
          "User %",
          "System %",
          "Clock Speed",
          "Temp",
        ],
        rows: coresRows,
      },
    ];
    if (npuList.length > 0) {
      cpuTables.push({
        title: "Neural Processing Units (NPUs)",
        columns: ["Vendor", "Name", "Model", "Cores", "Driver"],
        rows: npuList.map((n: any) => [
          String(n.vendor || "—"),
          String(n.name || "NPU"),
          String(n.model || "—"),
          n.cores ? String(n.cores) : "—",
          String(n.driver || "—"),
        ]),
      });
    }
    if (fanList.length > 0) {
      cpuTables.push({
        title: "Cooling Fans & RPM",
        columns: ["Fan ID", "Label", "RPM", "PWM", "Source"],
        rows: fanList.map((f: any, i: number) => [
          String(f.id ?? i + 1),
          String(f.label || `Fan #${i + 1}`),
          f.rpm !== null && f.rpm !== undefined ? `${f.rpm} RPM` : "—",
          f.pwm !== null && f.pwm !== undefined ? `${f.pwm}%` : "—",
          String(f.source || "—"),
        ]),
      });
    }
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        [
          "Processor",
          `${cpu.manufacturer || ""} ${cpu.brand || ""}`.trim() ||
            os.cpus()[0]?.model ||
            "—",
        ],
        [
          "Vendor / Family / Model",
          `${cpu.vendor || "—"} / ${cpu.family || "—"} / ${cpu.model || "—"}`,
        ],
        [
          "Physical / Logical Cores",
          `${cpu.physicalCores || "—"} physical, ${cpu.cores || os.cpus().length} logical`,
        ],
        [
          "Base / Max Clock",
          `${cpu.speed || "—"} GHz (Max ${cpu.speedMax || cpu.speed || "—"} GHz)`,
        ],
        [
          "Current Avg Clock",
          `${showcaseMacUltra ? 4.51 : speed.avg || cpu.speed || "—"} GHz`,
        ],
        [
          "Socket / Governor",
          `${cpu.socket || "SoC"} / ${cpu.governor || "auto"}`,
        ],
        [
          "L1d / L1i Cache",
          `${formatBytes(Number(cpu.cache?.l1d) || 0)} / ${formatBytes(Number(cpu.cache?.l1i) || 0)}`,
        ],
        [
          "L2 / L3 Cache",
          `${formatBytes(Number(cpu.cache?.l2) || 0)} / ${formatBytes(Number(cpu.cache?.l3) || 0)}`,
        ],
        [
          "Package Temperature",
          temp.main
            ? `${temp.main} °C (Max ${temp.max || temp.main} °C)`
            : showcaseMacUltra
              ? "39 °C (Max 44 °C)"
              : "Not reported by OS",
        ],
        [
          "Neural Processing Unit (NPU)",
          npuList[0]
            ? `${npuList[0].name || npuList[0].model || "NPU"}${npuList[0].cores ? ` (${npuList[0].cores} Cores)` : ""}`
            : "None detected",
        ],
        ["Cooling Fans", String(fanList.length)],
      ],
      tables: cpuTables,
      raw: { cpu, speed, load, temp, npu: npuList, fans: fanList },
    };
  }

  if (section === "memory") {
    const [mem, rawLayout] = await Promise.all([
      si.mem().catch(() => ({}) as any),
      si.memLayout().catch(() => [] as any[]),
    ]);
    const total = showcaseMacUltra
      ? 192 * 1024 * 1024 * 1024
      : Number(mem.total) || os.totalmem();
    const avail = showcaseMacUltra
      ? 156 * 1024 * 1024 * 1024
      : Number(mem.available) || Number(mem.free) || os.freemem();
    const used = Math.max(0, total - avail);
    const layout = showcaseMacUltra
      ? [
          {
            bank: "Unified Bank 0 (Die A)",
            size: 96 * 1024 * 1024 * 1024,
            type: "LPDDR5X-8533 (819 GB/s)",
            clockSpeed: 8533,
            formFactor: "Apple UltraFusion Package",
            manufacturer: "Apple / SK Hynix",
            partNum: "M4U-192GB-LP5X-A",
          },
          {
            bank: "Unified Bank 1 (Die B)",
            size: 96 * 1024 * 1024 * 1024,
            type: "LPDDR5X-8533 (819 GB/s)",
            clockSpeed: 8533,
            formFactor: "Apple UltraFusion Package",
            manufacturer: "Apple / SK Hynix",
            partNum: "M4U-192GB-LP5X-B",
          },
        ]
      : rawLayout;
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Total Physical RAM", formatBytes(total)],
        [
          "Used Memory",
          `${formatBytes(used)} (${total > 0 ? ((used / total) * 100).toFixed(1) : 0}%)`,
        ],
        ["Available Memory", formatBytes(avail)],
        [
          "Free (Unallocated)",
          formatBytes(
            showcaseMacUltra ? 148 * 1024 * 1024 * 1024 : Number(mem.free) || 0,
          ),
        ],
        [
          "Active Memory",
          formatBytes(
            showcaseMacUltra
              ? 36 * 1024 * 1024 * 1024
              : Number(mem.active) || 0,
          ),
        ],
        ["Buffers / Cache", formatBytes(Number(mem.buffcache) || 0)],
        ["Swap Total", formatBytes(Number(mem.swaptotal) || 0)],
        ["Swap Used", formatBytes(Number(mem.swapused) || 0)],
        ["Swap Free", formatBytes(Number(mem.swapfree) || 0)],
      ],
      tables: [
        {
          title: "Physical Memory Modules (DIMMs / Banks)",
          columns: [
            "Bank",
            "Size",
            "Type",
            "Clock Speed",
            "Form Factor",
            "Manufacturer",
            "Part Number",
          ],
          rows: (Array.isArray(layout) ? layout : []).map(
            (m: any, i: number) => [
              String(m.bank || `Slot ${i + 1}`),
              formatBytes(Number(m.size) || 0),
              String(m.type || "—"),
              m.clockSpeed ? `${m.clockSpeed} MHz` : "—",
              String(m.formFactor || "—"),
              String(m.manufacturer || "—"),
              String(m.partNum || "—"),
            ],
          ),
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
      si.disksIO().catch(() => ({}) as any),
    ]);
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        [
          "Mounted Filesystems",
          String(Array.isArray(fsSize) ? fsSize.length : 0),
        ],
        [
          "Physical Drives",
          String(Array.isArray(diskLayout) ? diskLayout.length : 0),
        ],
        [
          "Read / Write IOPS",
          `${disksIO?.rIO_sec ?? 0} / ${disksIO?.wIO_sec ?? 0} ops/s`,
        ],
        [
          "Total Read / Write Ops",
          `${disksIO?.rIO ?? 0} / ${disksIO?.wIO ?? 0}`,
        ],
      ],
      tables: [
        {
          title: "Mounted Filesystems",
          columns: [
            "Mount",
            "Filesystem",
            "Type",
            "Capacity",
            "Used",
            "Available",
            "Use %",
            "Access",
          ],
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
          columns: [
            "Device",
            "Name",
            "Vendor",
            "Type",
            "Interface",
            "Size",
            "SMART Status",
          ],
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
          columns: [
            "Name",
            "Type",
            "FSType",
            "Mount",
            "Size",
            "Label",
            "Removable",
          ],
          rows: (Array.isArray(blockDevices) ? blockDevices : [])
            .slice(0, 30)
            .map((b: any) => [
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
    const isShot = process.env.SCREENSHOT_MODE === "1";
    const [ifaces, stats, gateway] = await Promise.all([
      si.networkInterfaces().catch(() => [] as any[]),
      si.networkStats("*").catch(() => [] as any[]),
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
        ["Hostname", isShot ? "studio-workstation" : os.hostname()],
        [
          "Default Gateway",
          isShot ? "192.168.1.*** (Masked)" : String(gateway || "—"),
        ],
        ["Network Interfaces", String(ifaceList.length)],
      ],
      tables: [
        {
          title: "Network Interfaces (NICs)",
          columns: [
            "Interface",
            "IPv4",
            "IPv6",
            "MAC",
            "Type",
            "Speed",
            "MTU",
            "State",
          ],
          rows: ifaceList.map((n: any) => [
            String(n.iface || "") + (n.default ? " ★" : ""),
            isShot
              ? n.internal
                ? "127.0.0.1"
                : "192.168.1.*** (Masked)"
              : String(n.ip4 || "—"),
            isShot ? (n.internal ? "::1" : "fe80::***") : String(n.ip6 || "—"),
            isShot
              ? n.internal
                ? "00:00:00:00:00:00"
                : "🔒 [Protected]"
              : String(n.mac || "—"),
            String(n.type || (n.internal ? "loopback" : "net")),
            n.speed ? `${n.speed} Mbps` : "—",
            n.mtu ? String(n.mtu) : "—",
            String(n.operstate || "up"),
          ]),
        },
        {
          title: "Live Interface Traffic",
          columns: [
            "Interface",
            "State",
            "RX Total",
            "TX Total",
            "RX / sec",
            "TX / sec",
            "Errors",
          ],
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
    const [rawGpu, rawDisplays, audio] = await Promise.all([
      si.gpu().catch(() => [] as any[]),
      si.displays().catch(() => [] as any[]),
      si.audio().catch(() => [] as any[]),
    ]);
    const rawGfx = {
      controllers: Array.isArray(rawGpu) ? rawGpu : [],
      displays: Array.isArray(rawDisplays) ? rawDisplays : [],
    };
    const gfx = showcaseMacUltra
      ? {
          controllers: [
            {
              vendor: "Apple",
              model:
                "Apple M4 Ultra 80-Core GPU (Hardware Ray Tracing · Metal 4)",
              vram: 196608,
              bus: "Apple UltraFusion Unified Fabric (819 GB/s)",
              driverVersion: "Metal 4.0 (Display-P3 1600-nit XDR)",
            },
          ],
          displays: [
            {
              model: "Apple Pro Display XDR (6K Retina · Nano-texture)",
              main: true,
              builtin: false,
              connection: "Thunderbolt 5 (DisplayPort 2.1)",
              resolutionX: 6016,
              resolutionY: 3384,
              currentRefreshRate: 120,
            },
            {
              model: "Apple Studio Display (5K Retina)",
              main: false,
              builtin: false,
              connection: "Thunderbolt 5",
              resolutionX: 5120,
              resolutionY: 2880,
              currentRefreshRate: 120,
            },
          ],
        }
      : rawGfx;
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
            String(
              c.driverVersion ||
                (c.metalVersion ? `Metal ${c.metalVersion}` : "—"),
            ),
          ]),
        },
        {
          title: "Displays & Monitors",
          columns: [
            "Display",
            "Main",
            "Built-in",
            "Connection",
            "Resolution",
            "Refresh Rate",
          ],
          rows: (gfx.displays || []).map((d: any) => [
            String(d.model || "Display"),
            d.main ? "Yes" : "No",
            d.builtin ? "Yes" : "No",
            String(d.connection || "—"),
            d.resolutionX && d.resolutionY
              ? `${d.resolutionX} × ${d.resolutionY}`
              : "—",
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
      raw: {
        graphics: gfx,
        gpu: gfx.controllers,
        displays: gfx.displays,
        audio,
      },
    };
  }

  if (section === "peripherals") {
    const [
      rawBattery,
      usb,
      bt,
      printers,
      cameras,
      keyboards,
      mice,
      serialPorts,
    ] = await Promise.all([
      si.battery().catch(() => [] as any[]),
      si.usb().catch(() => [] as any[]),
      si.bluetoothDevices().catch(() => [] as any[]),
      si.printer().catch(() => [] as any[]),
      si.camera().catch(() => [] as any[]),
      si.keyboard().catch(() => [] as any[]),
      si.mouse().catch(() => [] as any[]),
      si.serialPorts().catch(() => [] as any[]),
    ]);
    const battery = Array.isArray(rawBattery)
      ? rawBattery[0] || {}
      : rawBattery && typeof rawBattery === "object"
        ? (rawBattery as any)
        : {};
    const hasBattery = Array.isArray(rawBattery)
      ? rawBattery.length > 0
      : Boolean((rawBattery as any)?.hasBattery);
    const camList = Array.isArray(cameras) ? cameras : [];
    const kbList = Array.isArray(keyboards) ? keyboards : [];
    const mouseList = Array.isArray(mice) ? mice : [];
    const serialList = Array.isArray(serialPorts) ? serialPorts : [];
    const tables: SysinfoTable[] = [
      {
        title: "USB Devices",
        columns: ["Name", "Type", "Vendor / Manufacturer", "Bus", "Removable"],
        rows: (Array.isArray(usb) ? usb : [])
          .slice(0, 30)
          .map((u: any) => [
            String(u.name || "USB Device"),
            String(u.type || "—"),
            String(u.manufacturer || u.vendor || "—"),
            String(u.bus ?? "—"),
            u.removable ? "Yes" : "No",
          ]),
      },
      {
        title: "Bluetooth Peripherals",
        columns: [
          "Name",
          "Type",
          "Manufacturer",
          "MAC",
          "Connected",
          "Battery",
        ],
        rows: (Array.isArray(bt) ? bt : [])
          .slice(0, 25)
          .map((b: any) => [
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
    ];
    if (camList.length > 0 || kbList.length > 0 || mouseList.length > 0) {
      const hidRows: Array<Array<string | number>> = [
        ...camList.map((c: any) => [
          "Camera",
          String(c.name || c.model || "Camera"),
          String(c.vendor || "—"),
          String(c.connection || "—"),
          String(c.serial || "—"),
        ]),
        ...kbList.map((k: any) => [
          "Keyboard",
          String(k.name || k.model || "Keyboard"),
          String(k.vendor || "—"),
          String(k.connection || "—"),
          String(k.serial || "—"),
        ]),
        ...mouseList.map((m: any) => [
          "Mouse / Trackpad",
          String(m.name || m.model || "Pointing Device"),
          String(m.vendor || "—"),
          String(m.connection || "—"),
          String(m.serial || "—"),
        ]),
      ];
      tables.push({
        title: "Cameras, Keyboards & Pointing Devices",
        columns: ["Class", "Name / Model", "Vendor", "Connection", "Serial"],
        rows: hidRows,
      });
    }
    if (serialList.length > 0) {
      tables.push({
        title: "Serial & UART Ports",
        columns: ["Device", "Name", "Manufacturer", "Type", "Serial"],
        rows: serialList.map((s: any) => [
          String(s.device || "—"),
          String(s.name || "Serial Port"),
          String(s.manufacturer || "—"),
          String(s.type || "—"),
          String(s.serialNumber || "—"),
        ]),
      });
    }
    return {
      section,
      platform,
      osLabel,
      timestamp,
      facts: [
        ["Battery Installed", hasBattery ? "Yes" : "No (AC Desktop)"],
        [
          "Battery Charge",
          hasBattery
            ? `${battery.percent ?? 100}% (${battery.isCharging ? "Charging" : "Discharging"})`
            : "—",
        ],
        [
          "Battery Cycles",
          battery.cycleCount ? String(battery.cycleCount) : "—",
        ],
        ["USB Devices", String(Array.isArray(usb) ? usb.length : 0)],
        ["Bluetooth Devices", String(Array.isArray(bt) ? bt.length : 0)],
        ["Printers", String(Array.isArray(printers) ? printers.length : 0)],
        ["Cameras / Webcams", String(camList.length)],
        ["Keyboards / Mice", `${kbList.length} / ${mouseList.length}`],
        ["Serial / UART Ports", String(serialList.length)],
      ],
      tables,
      raw: {
        battery: rawBattery,
        usb,
        bluetooth: bt,
        printers,
        camera: camList,
        keyboard: kbList,
        mouse: mouseList,
        serialPorts: serialList,
      },
    };
  }

  // software
  const [osInfo, versions, users, focusedProc, npmPackages] = await Promise.all(
    [
      si.osInfo().catch(() => ({}) as any),
      si.versions().catch(() => ({}) as any),
      si.users().catch(() => [] as any[]),
      si.processFocused().catch(() => null),
      si.npm().catch(() => [] as any[]),
    ],
  );
  const versionRows: Array<Array<string | number>> = Object.entries(
    versions || {},
  )
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
      [
        "OS Distribution",
        `${osInfo.distro || osLabel} ${osInfo.release || os.release()}`,
      ],
      ["Kernel / Build", String(osInfo.kernel || os.release())],
      ["Architecture", String(osInfo.arch || os.arch())],
      ["Hostname", String(osInfo.hostname || os.hostname())],
      ["Bun Runtime", typeof Bun !== "undefined" ? Bun.version : "—"],
      ["Node Compatibility", process.versions.node || "—"],
      [
        "Focused Foreground Process",
        focusedProc && focusedProc.name
          ? `${focusedProc.name} (PID ${focusedProc.pid})`
          : "—",
      ],
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
        columns: [
          "User",
          "Terminal / TTY",
          "Login Date",
          "Login Time",
          "IP / Host",
          "Last Command",
        ],
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
    raw: {
      osInfo,
      versions,
      users,
      processFocused: focusedProc,
      npm: npmPackages,
    },
  };
}

/** Validates and executes a single cataloged `systeminformation` probe, returning raw data, flattened key-values, and an optional table. */
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

  const cleanParam = String(param ?? "")
    .slice(0, 200)
    .trim();
  if (entry.hasParam && cleanParam) {
    if (method === "inetLatency") {
      if (cleanParam.startsWith("-") || !/^[a-zA-Z0-9.:-]+$/.test(cleanParam)) {
        throw new Error("Invalid target host for inetLatency probe.");
      }
    } else if (method === "inetChecksite") {
      if (
        !/^https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(cleanParam)
      ) {
        throw new Error("Invalid target URL for inetChecksite probe.");
      }
    } else if (method === "get" || method === "observe") {
      if (!/^[a-zA-Z0-9_.,\s*:"{}-]+$/.test(cleanParam)) {
        throw new Error(`Invalid query parameter for "${method}" probe.`);
      }
    } else if (!/^[a-zA-Z0-9_.,\s*/:-]+$/.test(cleanParam)) {
      throw new Error(`Invalid parameter for "${method}" probe.`);
    }
  }

  const started = performance.now();
  let data: unknown;
  if (hooks.runProbe) {
    data = await hooks.runProbe(method, cleanParam, platform);
  } else if (method === "get") {
    let query: Record<string, string> = {
      cpu: "brand, speed",
      mem: "total, free",
    };
    const rawQuery = cleanParam || entry.defaultParam || "";
    if (rawQuery) {
      try {
        query = JSON.parse(rawQuery);
      } catch {
        query = {};
        rawQuery.split(",").forEach((k) => {
          const key = k.trim();
          if (key) query[key] = "*";
        });
      }
    }
    data = await si.get(query);
  } else if (method === "observe") {
    let query: Record<string, string> = {
      currentLoad: "currentLoad",
      mem: "used",
    };
    const rawQuery = cleanParam || entry.defaultParam || "";
    if (rawQuery) {
      try {
        query = JSON.parse(rawQuery);
      } catch {
        query = {};
        rawQuery.split(",").forEach((k) => {
          const key = k.trim();
          if (key) query[key] = "*";
        });
      }
    }
    data = await new Promise((resolve) => {
      let settled = false;
      let handle: any = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        if (handle) {
          try {
            clearInterval(handle);
          } catch {}
          handle = null;
        }
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(value);
      };
      try {
        handle = si.observe(query, 500, (sample: unknown) => {
          finish(sample);
        });
        if (settled && handle) {
          try {
            clearInterval(handle);
          } catch {}
          handle = null;
        }
      } catch (err: any) {
        finish({
          observation: "Observer error",
          query,
          error: err?.message || String(err),
        });
        return;
      }
      if (!settled) {
        timer = setTimeout(
          () => finish({ observation: "Observer sample initiated", query }),
          1000,
        );
      }
    });
  } else if (method === "dockerImages") {
    data = await si.dockerImages((cleanParam || entry.defaultParam) === "true");
  } else if (method === "dockerContainers") {
    data = await si.dockerContainers(
      (cleanParam || entry.defaultParam) !== "false",
    );
  } else if (method === "inetPublicIp") {
    const timeout = Number(cleanParam || entry.defaultParam) || 5000;
    data = await si.inetPublicIp(timeout);
  } else {
    const fn = (si as Record<string, any>)[method];
    if (typeof fn !== "function") {
      throw new Error(`Probe "${method}" is not available on this platform.`);
    }
    const arg = cleanParam || entry.defaultParam || "";
    data = entry.hasParam ? await fn(arg || undefined) : await fn();
  }
  const elapsedMs = Math.max(1, Math.round(performance.now() - started));

  const flat = flattenData(data, "", {}, 600);
  const flatRows: Array<[string, string]> = Object.entries(flat).map(
    ([k, v]) => [
      k,
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
    ],
  );

  let table: SysinfoTable | null = null;
  const tableSource = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).list)
      ? ((data as Record<string, unknown>).list as unknown[])
      : null;
  if (
    Array.isArray(tableSource) &&
    tableSource.length > 0 &&
    tableSource.every((r) => r && typeof r === "object" && !Array.isArray(r))
  ) {
    const cols: string[] = [];
    for (const r of tableSource.slice(0, 50)) {
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
        rows: tableSource
          .slice(0, 100)
          .map((r: any) =>
            cappedCols.map((c) =>
              r[c] === null || r[c] === undefined ? "" : String(r[c]),
            ),
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

/** Computes a structured diff between two system information snapshots (`before` and `after`). */
export function diffSysinfoSnapshots(
  before: unknown,
  after: unknown,
): DataDiff {
  return diffData(before, after);
}

/** Formats a system information payload as a downloadable report in `json`, `csv`, `md`, or `html` format. */
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
      return (
        JSON.stringify({ title, platform, generated, data }, null, 2) + "\n"
      );
  }
}
