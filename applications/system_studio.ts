/**
 * ⚡ Bun RAD Studio - System Information Studio Pro
 *
 * Enterprise-Grade Cross-Platform Hardware Intelligence & Telemetry Workstation
 * Powered by 100% of the entire `systeminformation` API surface across all 10 domain areas.
 *
 * Powered by local embedded zero-latency Bun server + WebKit / WebView native desktop GUI.
 * Guarantees 100% non-blocking async execution, zero FFI deadlocks, and instantaneous UI updates.
 */

import "../src/shared/siBunCompat.ts";
import type { Webview, SizeHint } from "webview-bun";
import * as si from "systeminformation";
import * as os from "os";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  setFullscreenNative,
  attachWindowShortcuts,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";
import { startSystemStudioServer } from "./system_studio_server.ts";
import {
  SYSTEM_STUDIO_EXTRA_CSS,
  SYSTEM_STUDIO_EXTRA_HEADER_HTML,
  SYSTEM_STUDIO_EXTRA_QUICKBAR_HTML,
  SYSTEM_STUDIO_EXTRA_BANNER_HTML,
  SYSTEM_STUDIO_EXTRA_JSONSEARCH_HTML,
  SYSTEM_STUDIO_EXTRA_OVERLAY_HTML,
  systemStudioExtraScript,
} from "./system_studio_extras";

// -------------------------------------------------------------------------------------------------
// API Registry & Domain Metadata (All 76 Methods Across 10 Domain Categories)
// -------------------------------------------------------------------------------------------------

/** Parse `diskSpeed` parameter (`"16"`, `"/tmp,64"`, or `"/tmp"`) into `[path, sizeMB]`. */
export function parseDiskSpeedParam(
  param?: string,
): [string | undefined, number | undefined] {
  const raw = String(param ?? "").trim();
  if (!raw) return [undefined, 16];
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return [undefined, Number(raw)];
  }
  const commaIdx = raw.lastIndexOf(",");
  if (commaIdx !== -1) {
    const left = raw.slice(0, commaIdx).trim();
    const right = raw.slice(commaIdx + 1).trim();
    if (/^\d+(\.\d+)?$/.test(right)) {
      return [left || undefined, Number(right) || 16];
    }
  }
  return [raw, 16];
}

export interface SiMethodMeta {
  name: string;
  category: string;
  description: string;
  acceptsParam?: boolean;
  paramPlaceholder?: string;
  defaultParam?: string;
  execute: (param?: string) => Promise<any>;
}

export const SI_CATEGORIES = [
  "Hardware & Baseboard",
  "OS & Software Environment",
  "CPU, Load & Thermals",
  "Memory & Power / Battery",
  "Graphics & Displays",
  "Disks & Filesystems",
  "Network, Sockets & Wi-Fi",
  "Processes & Services",
  "Peripherals & Audio",
  "Virtualization, Docker & Batch",
] as const;

export type SiCategory = (typeof SI_CATEGORIES)[number];

export const SI_METHODS: Record<string, SiMethodMeta> = {
  // 1. Hardware & Baseboard
  version: {
    name: "version",
    category: "Hardware & Baseboard",
    description: "Version of systeminformation library",
    execute: async () => si.version(),
  },
  system: {
    name: "system",
    category: "Hardware & Baseboard",
    description: "Hardware manufacturer, model, version, serial number & UUID",
    execute: async () => si.system(),
  },
  bios: {
    name: "bios",
    category: "Hardware & Baseboard",
    description: "BIOS / UEFI vendor, version, release date & revision",
    execute: async () => si.bios(),
  },
  baseboard: {
    name: "baseboard",
    category: "Hardware & Baseboard",
    description: "Motherboard manufacturer, model, version & memory capacity",
    execute: async () => si.baseboard(),
  },
  chassis: {
    name: "chassis",
    category: "Hardware & Baseboard",
    description: "Computer chassis/enclosure manufacturer, model & type",
    execute: async () => si.chassis(),
  },
  uuid: {
    name: "uuid",
    category: "Hardware & Baseboard",
    description: "OS installation UUID, hardware UUID and MAC addresses",
    execute: async () => si.uuid(),
  },
  pci: {
    name: "pci",
    category: "Hardware & Baseboard",
    description:
      "PCI / PCIe devices, buses, slots, vendor/device IDs & kernel drivers",
    execute: async () => si.pci(),
  },
  thunderbolt: {
    name: "thunderbolt",
    category: "Hardware & Baseboard",
    description: "Thunderbolt / USB4 buses, ports, UUIDs & link speeds",
    execute: async () => si.thunderbolt(),
  },

  // 2. OS & Software Environment
  osInfo: {
    name: "osInfo",
    category: "OS & Software Environment",
    description:
      "Operating system platform, distribution, release, kernel & architecture",
    execute: async () => si.osInfo(),
  },
  versions: {
    name: "versions",
    category: "OS & Software Environment",
    description:
      "Installed software runtime versions (Node, V8, Git, Bun, etc.)",
    acceptsParam: true,
    paramPlaceholder: "Optional filter (e.g. node, git)",
    defaultParam: "",
    execute: async (param) => si.versions(param || undefined),
  },
  software: {
    name: "software",
    category: "OS & Software Environment",
    description:
      "Installed OS applications, versions, architectures, paths & code signatures",
    execute: async () => si.software(),
  },
  npm: {
    name: "npm",
    category: "OS & Software Environment",
    description: "Locally installed npm packages and versions",
    execute: async () => si.npm(),
  },
  shell: {
    name: "shell",
    category: "OS & Software Environment",
    description: "Default login system shell executable path",
    execute: async () => si.shell(),
  },
  time: {
    name: "time",
    category: "OS & Software Environment",
    description: "Current time, system uptime, and timezone information",
    execute: async () => si.time(),
  },
  powerShellStart: {
    name: "powerShellStart",
    category: "OS & Software Environment",
    description:
      "Start persistent PowerShell worker pool for faster Windows queries",
    execute: async () => {
      await si.powerShellStart();
      return {
        status:
          process.platform === "win32"
            ? "PowerShell persistent worker pool started"
            : "No-op on non-Windows platform",
        active: process.platform === "win32",
        platform: process.platform,
      };
    },
  },
  powerShellRelease: {
    name: "powerShellRelease",
    category: "OS & Software Environment",
    description:
      "Terminate and release the persistent Windows PowerShell worker pool",
    execute: async () => {
      await si.powerShellRelease();
      return {
        status:
          process.platform === "win32"
            ? "PowerShell persistent worker pool released"
            : "No-op on non-Windows platform",
        released: true,
        platform: process.platform,
      };
    },
  },

  // 3. CPU, Load & Thermals
  cpu: {
    name: "cpu",
    category: "CPU, Load & Thermals",
    description:
      "CPU manufacturer, brand, base speed, core count & socket type",
    execute: async () => si.cpu(),
  },
  npu: {
    name: "npu",
    category: "CPU, Load & Thermals",
    description:
      "Neural Processing Unit (NPU / AI Accelerator) vendor, model, cores & driver",
    execute: async () => si.npu(),
  },
  cpuFlags: {
    name: "cpuFlags",
    category: "CPU, Load & Thermals",
    description: "CPU feature and capability instruction set flags",
    execute: async () => si.cpuFlags(),
  },
  cpuCache: {
    name: "cpuCache",
    category: "CPU, Load & Thermals",
    description: "L1, L2, and L3 processor cache sizes",
    execute: async () => si.cpuCache(),
  },
  cpuCurrentSpeed: {
    name: "cpuCurrentSpeed",
    category: "CPU, Load & Thermals",
    description: "Real-time core frequencies (minimum, maximum, average)",
    execute: async () => si.cpuCurrentSpeed(),
  },
  cpuTemperature: {
    name: "cpuTemperature",
    category: "CPU, Load & Thermals",
    description: "CPU package, core, and chipset temperature telemetry",
    execute: async () => si.cpuTemperature(),
  },
  fans: {
    name: "fans",
    category: "CPU, Load & Thermals",
    description: "Cooling fan RPM speeds, PWM levels & sensor labels",
    execute: async () => si.fans(),
  },
  currentLoad: {
    name: "currentLoad",
    category: "CPU, Load & Thermals",
    description:
      "Current CPU utilization (User, System, Idle & per-core breakdown)",
    execute: async () => si.currentLoad(),
  },
  fullLoad: {
    name: "fullLoad",
    category: "CPU, Load & Thermals",
    description: "Full raw CPU load saturation percentage",
    execute: async () => si.fullLoad(),
  },

  // 4. Memory & Power / Battery
  mem: {
    name: "mem",
    category: "Memory & Power / Battery",
    description:
      "RAM metrics: total, used, free, active, available & swap space",
    execute: async () => si.mem(),
  },
  memLayout: {
    name: "memLayout",
    category: "Memory & Power / Battery",
    description:
      "Physical RAM module layout, DIMM banks, clock speeds & voltages",
    execute: async () => si.memLayout(),
  },
  battery: {
    name: "battery",
    category: "Memory & Power / Battery",
    description:
      "Battery charging state, percentage, health, cycles & AC connection",
    execute: async () => si.battery(),
  },

  // 5. Graphics & Displays
  gpu: {
    name: "gpu",
    category: "Graphics & Displays",
    description:
      "Graphics cards (GPUs), VRAM, bus, cores & Metal/DirectX capabilities",
    execute: async () => si.gpu(),
  },
  displays: {
    name: "displays",
    category: "Graphics & Displays",
    description:
      "Attached display monitors, native/current resolutions, refresh rates & connections",
    execute: async () => si.displays(),
  },

  // 6. Disks & Filesystems
  fsSize: {
    name: "fsSize",
    category: "Disks & Filesystems",
    description:
      "Mounted filesystem volumes, sizes, used capacity & mount points",
    acceptsParam: true,
    paramPlaceholder: "Optional drive filter (e.g. / or C:)",
    defaultParam: "",
    execute: async (param) => si.fsSize(param || undefined),
  },
  fsOpenFiles: {
    name: "fsOpenFiles",
    category: "Disks & Filesystems",
    description: "Allocated and available open file descriptors count",
    execute: async () => si.fsOpenFiles(),
  },
  blockDevices: {
    name: "blockDevices",
    category: "Disks & Filesystems",
    description: "Physical block devices, partitions, labels, and UUIDs",
    execute: async () => si.blockDevices(),
  },
  fsStats: {
    name: "fsStats",
    category: "Disks & Filesystems",
    description: "Filesystem read/write operations and transfer rates",
    execute: async () => si.fsStats(),
  },
  disksIO: {
    name: "disksIO",
    category: "Disks & Filesystems",
    description: "Storage disk I/O operations, throughput and queue wait times",
    execute: async () => si.disksIO(),
  },
  diskLayout: {
    name: "diskLayout",
    category: "Disks & Filesystems",
    description:
      "Hard drive / SSD hardware specifications, SMART status & geometry",
    execute: async () => si.diskLayout(),
  },
  diskSpeed: {
    name: "diskSpeed",
    category: "Disks & Filesystems",
    description:
      "Sequential uncached write / read disk throughput benchmark (MB/s)",
    acceptsParam: true,
    paramPlaceholder: "Optional path and/or size in MB (e.g. 16 or /tmp,64)",
    defaultParam: "16",
    execute: async (param) => si.diskSpeed(...parseDiskSpeedParam(param)),
  },

  // 7. Network, Sockets & Wi-Fi
  networkInterfaceDefault: {
    name: "networkInterfaceDefault",
    category: "Network, Sockets & Wi-Fi",
    description: "Default primary network interface name",
    execute: async () => si.networkInterfaceDefault(),
  },
  networkGatewayDefault: {
    name: "networkGatewayDefault",
    category: "Network, Sockets & Wi-Fi",
    description: "Default primary gateway IP address",
    execute: async () => si.networkGatewayDefault(),
  },
  networkInterfaces: {
    name: "networkInterfaces",
    category: "Network, Sockets & Wi-Fi",
    description:
      "All network interfaces, IPv4, IPv6, MAC, duplex & carrier states",
    acceptsParam: true,
    paramPlaceholder: "Optional parent interface",
    defaultParam: "",
    execute: async (param) =>
      param ? si.networkInterfaces(param) : si.networkInterfaces(),
  },
  networkStats: {
    name: "networkStats",
    category: "Network, Sockets & Wi-Fi",
    description:
      "Real-time network transfer metrics (RX/TX bytes, packets, errors)",
    acceptsParam: true,
    paramPlaceholder: "Interface name (e.g. en0, eth0)",
    defaultParam: "",
    execute: async (param) => si.networkStats(param || "*"),
  },
  networkRoutes: {
    name: "networkRoutes",
    category: "Network, Sockets & Wi-Fi",
    description:
      "System IPv4 and IPv6 routing table (destination CIDR, gateway, interface, metric & family)",
    execute: async () => si.networkRoutes(),
  },
  networkConnections: {
    name: "networkConnections",
    category: "Network, Sockets & Wi-Fi",
    description:
      "Active TCP/UDP sockets, peer IPs, ports, states and owning PIDs",
    execute: async () => si.networkConnections(),
  },
  inetChecksite: {
    name: "inetChecksite",
    category: "Network, Sockets & Wi-Fi",
    description: "HTTP latency and reachability check for a remote host or URL",
    acceptsParam: true,
    paramPlaceholder: "URL to probe (e.g. https://google.com)",
    defaultParam: "https://google.com",
    execute: async (param) => si.inetChecksite(param || "https://google.com"),
  },
  inetLatency: {
    name: "inetLatency",
    category: "Network, Sockets & Wi-Fi",
    description: "Ping round-trip latency to a target host",
    acceptsParam: true,
    paramPlaceholder: "Host (default: 8.8.8.8)",
    defaultParam: "8.8.8.8",
    execute: async (param) => si.inetLatency(param || "8.8.8.8"),
  },
  inetPublicIp: {
    name: "inetPublicIp",
    category: "Network, Sockets & Wi-Fi",
    description: "Public external IPv4 and IPv6 addresses with lookup latency",
    acceptsParam: true,
    paramPlaceholder: "Timeout in ms (default: 5000)",
    defaultParam: "5000",
    execute: async (param) =>
      si.inetPublicIp(param ? Number(param) || 5000 : undefined),
  },
  inetSpeed: {
    name: "inetSpeed",
    category: "Network, Sockets & Wi-Fi",
    description:
      "Internet download / upload throughput benchmark (Mbit/s over parallel streams)",
    acceptsParam: true,
    paramPlaceholder:
      "Optional downloadUrl[,uploadUrl] (default: speed.cloudflare.com)",
    defaultParam: "",
    execute: async (param) => {
      const raw = String(param ?? "").trim();
      if (!raw) return si.inetSpeed();
      const [downUrl, upUrl] = raw
        .split(",")
        .map((part) => part.trim() || undefined);
      return si.inetSpeed(downUrl, upUrl);
    },
  },
  wifiNetworks: {
    name: "wifiNetworks",
    category: "Network, Sockets & Wi-Fi",
    description:
      "Scans nearby Wi-Fi access points, SSIDs, channels & signal strengths",
    execute: async () => si.wifiNetworks(),
  },
  wifiInterfaces: {
    name: "wifiInterfaces",
    category: "Network, Sockets & Wi-Fi",
    description: "Installed wireless network adapter hardware and drivers",
    execute: async () => si.wifiInterfaces(),
  },
  wifiConnections: {
    name: "wifiConnections",
    category: "Network, Sockets & Wi-Fi",
    description:
      "Current active Wi-Fi connection parameters, SSID, BSSID & txRate",
    execute: async () => si.wifiConnections(),
  },

  // 8. Processes & Services
  processes: {
    name: "processes",
    category: "Processes & Services",
    description: "Running process table (PID, CPU %, Mem %, user, state, cmd)",
    execute: async () => si.processes(),
  },
  processLoad: {
    name: "processLoad",
    category: "Processes & Services",
    description: "Aggregate CPU and memory utilization for a process name",
    acceptsParam: true,
    paramPlaceholder: "Process name (e.g. bun, node, chrome)",
    defaultParam: "bun",
    execute: async (param) => si.processLoad(param || "bun"),
  },
  processFocused: {
    name: "processFocused",
    category: "Processes & Services",
    description:
      "Currently focused / frontmost foreground application window process",
    execute: async () => si.processFocused(),
  },
  services: {
    name: "services",
    category: "Processes & Services",
    description: "System background service and daemon running states",
    acceptsParam: true,
    paramPlaceholder: "Service filter pattern (e.g. * or ssh)",
    defaultParam: "*",
    execute: async (param) => si.services(param || "*"),
  },
  users: {
    name: "users",
    category: "Processes & Services",
    description:
      "Currently logged in user accounts, terminals, and login timestamps",
    execute: async () => si.users(),
  },

  // 9. Peripherals & Audio
  audio: {
    name: "audio",
    category: "Peripherals & Audio",
    description:
      "Audio controllers, soundcards, inputs, outputs & channel status",
    execute: async () => si.audio(),
  },
  bluetoothDevices: {
    name: "bluetoothDevices",
    category: "Peripherals & Audio",
    description:
      "Paired and connected Bluetooth devices, battery status & MACs",
    execute: async () => si.bluetoothDevices(),
  },
  printer: {
    name: "printer",
    category: "Peripherals & Audio",
    description: "Configured local and network print queues and statuses",
    execute: async () => si.printer(),
  },
  usb: {
    name: "usb",
    category: "Peripherals & Audio",
    description: "Connected USB hardware bus tree and peripheral devices",
    execute: async () => si.usb(),
  },
  serialPorts: {
    name: "serialPorts",
    category: "Peripherals & Audio",
    description:
      "RS-232 / USB-Serial UART ports, manufacturers & PnP device IDs",
    execute: async () => si.serialPorts(),
  },
  camera: {
    name: "camera",
    category: "Peripherals & Audio",
    description: "Built-in and external webcams / video capture hardware",
    execute: async () => si.camera(),
  },
  keyboard: {
    name: "keyboard",
    category: "Peripherals & Audio",
    description: "Connected physical and wireless keyboards",
    execute: async () => si.keyboard(),
  },
  mouse: {
    name: "mouse",
    category: "Peripherals & Audio",
    description: "Connected mice, trackpads & pointing devices",
    execute: async () => si.mouse(),
  },

  // 10. Virtualization, Docker & Batch
  dockerInfo: {
    name: "dockerInfo",
    category: "Virtualization, Docker & Batch",
    description:
      "Docker engine configuration, server version, and container tallies",
    execute: async () => si.dockerInfo(),
  },
  dockerImages: {
    name: "dockerImages",
    category: "Virtualization, Docker & Batch",
    description: "Local Docker image repository with repo tags, sizes & IDs",
    acceptsParam: true,
    paramPlaceholder: "All images (true/false)",
    defaultParam: "false",
    execute: async (param) => si.dockerImages(param === "true"),
  },
  dockerContainers: {
    name: "dockerContainers",
    category: "Virtualization, Docker & Batch",
    description: "Active and stopped Docker container instances",
    acceptsParam: true,
    paramPlaceholder: "All containers including stopped (true/false)",
    defaultParam: "true",
    execute: async (param) => si.dockerContainers(param !== "false"),
  },
  dockerContainerStats: {
    name: "dockerContainerStats",
    category: "Virtualization, Docker & Batch",
    description: "Live CPU, memory and network metrics for Docker containers",
    acceptsParam: true,
    paramPlaceholder: "Container ID or * for all",
    defaultParam: "*",
    execute: async (param) => si.dockerContainerStats(param || "*"),
  },
  dockerContainerProcesses: {
    name: "dockerContainerProcesses",
    category: "Virtualization, Docker & Batch",
    description: "Process hierarchy executing inside a specific container",
    acceptsParam: true,
    paramPlaceholder: "Container ID or * for all",
    defaultParam: "*",
    execute: async (param) => si.dockerContainerProcesses(param || "*"),
  },
  dockerVolumes: {
    name: "dockerVolumes",
    category: "Virtualization, Docker & Batch",
    description: "Docker storage volumes and mount points",
    execute: async () => si.dockerVolumes(),
  },
  dockerAll: {
    name: "dockerAll",
    category: "Virtualization, Docker & Batch",
    description: "Aggregated Docker suite (Info, Images, Containers, Volumes)",
    execute: async () => si.dockerAll(),
  },
  vboxInfo: {
    name: "vboxInfo",
    category: "Virtualization, Docker & Batch",
    description: "Oracle VirtualBox VM inventory, allocated memory & CPUs",
    execute: async () => si.vboxInfo(),
  },
  getStaticData: {
    name: "getStaticData",
    category: "Virtualization, Docker & Batch",
    description:
      "Aggregated static hardware snapshot (CPU, BIOS, System, Memory Layout, Disk Layout)",
    execute: async () => si.getStaticData(),
  },
  getDynamicData: {
    name: "getDynamicData",
    category: "Virtualization, Docker & Batch",
    description:
      "Aggregated dynamic runtime metrics (Load, Memory, Disks IO, Network, Temp)",
    execute: async () => si.getDynamicData(),
  },
  getAllData: {
    name: "getAllData",
    category: "Virtualization, Docker & Batch",
    description:
      "Exhaustive full system audit across all hardware, OS & software subsystems",
    execute: async () => si.getAllData(),
  },
  get: {
    name: "get",
    category: "Virtualization, Docker & Batch",
    description:
      "Dynamic query builder for selective retrieval of specific data subsets",
    acceptsParam: true,
    paramPlaceholder:
      'JSON query object (e.g. {"cpu": "brand, speed", "mem": "total, free"})',
    defaultParam: '{"cpu": "brand, speed", "mem": "total, free"}',
    execute: async (param) => {
      let query: any = { cpu: "brand, speed", mem: "total, free" };
      if (param) {
        try {
          query = JSON.parse(param);
        } catch {
          query = {};
          param.split(",").forEach((k) => {
            query[k.trim()] = "*";
          });
        }
      }
      return si.get(query);
    },
  },
  observe: {
    name: "observe",
    category: "Virtualization, Docker & Batch",
    description:
      "Real-time observer stream sample (triggers a single observation cycle)",
    acceptsParam: true,
    paramPlaceholder:
      'JSON observation object (default: {"currentLoad": "currentLoad", "mem": "used"})',
    defaultParam: '{"currentLoad": "currentLoad", "mem": "used"}',
    execute: async (param) => {
      let query: any = { currentLoad: "currentLoad", mem: "used" };
      if (param) {
        try {
          query = JSON.parse(param);
        } catch {}
      }
      return new Promise((resolve) => {
        let settled = false;
        let handle: any = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (value: any) => {
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
          handle = si.observe(query, 500, (data: any) => {
            finish(data);
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
    },
  },
};

// -------------------------------------------------------------------------------------------------
// Privacy Masking & Sanitization for SCREENSHOT_MODE=1
// -------------------------------------------------------------------------------------------------

function getScreenshotIdentityTokens() {
  let username = "";
  try {
    username = os.userInfo().username || "";
  } catch {}
  if (!username) {
    username = process.env.USER || process.env.USERNAME || "";
  }
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "";
  const host = os.hostname() || "";
  const shortHost = host.split(".")[0] || "";
  const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const userRegex =
    username.length >= 2
      ? new RegExp(`\\b${escaped(username)}\\b`, "gi")
      : null;
  const hostRegex = host.length >= 3 ? new RegExp(escaped(host), "gi") : null;
  const shortHostRegex =
    shortHost.length >= 3
      ? new RegExp(`\\b${escaped(shortHost)}\\b`, "gi")
      : null;
  return {
    username,
    home,
    host,
    shortHost,
    userRegex,
    hostRegex,
    shortHostRegex,
  };
}

function sanitizeStringForScreenshot(
  raw: string,
  tokens: ReturnType<typeof getScreenshotIdentityTokens>,
): string {
  let s = String(raw);
  if (!s) return s;
  if (tokens.home && tokens.home.length > 2) {
    const safeHome =
      process.platform === "win32"
        ? "C:\\Users\\developer"
        : "/Users/developer";
    s = s.split(tokens.home).join(safeHome);
  }
  s = s.replace(/\/Users\/[^/\s"']+/g, "/Users/developer");
  s = s.replace(/\/home\/[^/\s"']+/g, "/home/developer");
  s = s.replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, "C:\\Users\\developer");
  if (tokens.hostRegex)
    s = s.replace(tokens.hostRegex, "studio-workstation.local");
  if (tokens.shortHostRegex)
    s = s.replace(tokens.shortHostRegex, "studio-workstation");
  if (tokens.userRegex) s = s.replace(tokens.userRegex, "developer");
  // Mask RFC4122 UUIDs
  s = s.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "🔒 [Protected / Masked]",
  );
  // Mask MAC addresses (keep all-zero loopback MAC)
  s = s.replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, (m) =>
    /^0{2}([:-]0{2}){5}$/.test(m) ? m : "🔒 [Protected / Masked]",
  );
  // Mask possessive personal names in device labels (e.g. "Alice’s iPhone")
  s = s.replace(/^[^\s'’]{2,28}[’']s\s+/i, "Studio ");
  return s;
}

/**
 * Recursively masks personal usernames, home directories, hostnames, serials,
 * UUIDs, MAC addresses, and local/public IPs from `systeminformation` payloads
 * when `SCREENSHOT_MODE=1` is active.
 */
export function sanitizeTelemetryForScreenshot<T = any>(
  methodName: string,
  payload: T,
): T {
  const tokens = getScreenshotIdentityTokens();
  const seen = new WeakSet<object>();

  const walk = (val: any, keyPath: string, keyName: string): any => {
    if (val === null || val === undefined) return val;

    if (typeof val === "string") {
      if (
        /^(serial|serialnum|assettag|hardware)$/i.test(keyName) &&
        val.trim() !== "" &&
        !/^unknown$/i.test(val.trim())
      ) {
        return "🔒 [Protected / Masked]";
      }
      if (
        /^(uuid|systemuuid)$/i.test(keyName) ||
        (keyName === "os" && keyPath === "uuid.os") ||
        /^uuid\.(os|disks)$/i.test(keyPath)
      ) {
        return val.trim() ? "🔒 [Protected / Masked]" : val;
      }
      if (
        /^(mac|macdevice|machost|bssid)$/i.test(keyName) ||
        /^uuid\.macs/i.test(keyPath)
      ) {
        if (!val.trim() || /^0{2}([:-]0{2}){5}$/.test(val.trim())) return val;
        return "🔒 [Protected / Masked]";
      }
      if (/^(hostname|fqdn)$/i.test(keyName)) {
        return "studio-workstation.local";
      }
      if (keyName === "domain" && val.trim() !== "") {
        return "studio.local";
      }
      if (/^(ssid)$/i.test(keyName)) {
        return val.trim() ? "Studio-Mesh-5G" : val;
      }
      if (/^(user|username)$/i.test(keyName)) {
        const t = val.trim();
        if (
          !t ||
          /^(root|system|nobody|daemon)$/i.test(t) ||
          t.startsWith("_")
        ) {
          return val;
        }
        return "developer";
      }
      if (
        /^(ip4|ip|gateway|netgateway|localaddress|peeraddress|externalip)$/i.test(
          keyName,
        ) ||
        methodName === "networkGatewayDefault"
      ) {
        const t = val.trim();
        if (
          !t ||
          t === "127.0.0.1" ||
          t === ["0", "0", "0", "0"].join(".") ||
          t === "*"
        )
          return val;
        if (methodName === "inetPublicIp") return "203.0.113.*** (Masked)";
        return "192.168.1.*** (Masked)";
      }
      if (/^ip6$/i.test(keyName)) {
        const t = val.trim();
        if (!t || t === "::1" || t === "::") return val;
        if (methodName === "inetPublicIp") return "2001:db8::*** (Masked)";
        return "fe80::*** (Masked)";
      }
      if (keyName === "manufacturer" && /[’']s$/i.test(val.trim())) {
        return "Studio Peripheral";
      }
      let out = sanitizeStringForScreenshot(val, tokens);
      if (
        /^(command|params|path|mount)$/i.test(keyName) ||
        methodName === "networkConnections" ||
        methodName === "processes"
      ) {
        out = out.replace(
          /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?!255\.)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g,
          "192.168.1.***",
        );
      }
      return out;
    }

    if (typeof val !== "object") return val;
    if (seen.has(val)) return val;
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map((item, idx) => walk(item, `${keyPath}[${idx}]`, keyName));
    }

    const outObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const nextPath = keyPath ? `${keyPath}.${k}` : k;
      outObj[k] = walk(v, nextPath, k);
    }
    return outObj;
  };

  return walk(payload, "", methodName);
}

export function sanitizeKpisForScreenshot<T extends Record<string, any>>(
  kpis: T,
): T {
  const tokens = getScreenshotIdentityTokens();
  const cleanIface = kpis.netIface
    ? sanitizeStringForScreenshot(String(kpis.netIface), tokens)
    : "en0";
  return {
    ...kpis,
    netIface: cleanIface.includes("Protected")
      ? cleanIface
      : `${cleanIface} (Protected)`,
    netGateway: "192.168.1.*** (Masked)",
    osDistro: kpis.osDistro
      ? sanitizeStringForScreenshot(String(kpis.osDistro), tokens)
      : "Studio OS",
  };
}

/**
 * Execute any systeminformation method with timing and error isolation.
 */
export async function executeSiMethod(
  methodName: string,
  param?: string,
): Promise<{
  success: boolean;
  method: string;
  category: string;
  elapsedMs: number;
  data: any;
  error?: string;
}> {
  const meta = SI_METHODS[methodName];
  if (!meta) {
    return {
      success: false,
      method: methodName,
      category: "Unknown",
      elapsedMs: 0,
      data: null,
      error: `Unknown method '${methodName}'. Available methods: ${Object.keys(SI_METHODS).join(", ")}`,
    };
  }

  const isShot = process.env.SCREENSHOT_MODE === "1";
  const t0 = performance.now();
  try {
    let res: any;
    if (isShot && methodName === "inetPublicIp") {
      res = {
        ip4: "203.0.113.*** (Masked)",
        ip6: "2001:db8::*** (Masked)",
        ms: 12,
      };
    } else if (isShot && methodName === "wifiNetworks") {
      res = [
        {
          ssid: "Studio-Mesh-5G",
          bssid: "🔒 [Protected / Masked]",
          mode: "Infrastructure",
          channel: 36,
          frequency: 5180,
          signalLevel: -48,
          quality: 92,
          security: ["WPA3"],
          wpaFlags: [],
          rsnFlags: ["CCMP"],
        },
      ];
    } else if (isShot && methodName === "wifiConnections") {
      res = [
        {
          id: "en0",
          iface: "en0",
          model: "Studio Wi-Fi",
          ssid: "Studio-Mesh-5G",
          bssid: "🔒 [Protected / Masked]",
          mode: "station",
          channel: 36,
          frequency: 5180,
          type: "802.11ax",
          security: "WPA3",
          signalLevel: -48,
          quality: 92,
          txRate: 1200,
        },
      ];
    } else {
      res = await meta.execute(param);
      if (isShot) {
        res = sanitizeTelemetryForScreenshot(methodName, res);
      }
    }
    const elapsed = parseFloat((performance.now() - t0).toFixed(2));
    return {
      success: true,
      method: methodName,
      category: meta.category,
      elapsedMs: elapsed,
      data: res,
    };
  } catch (err: any) {
    const elapsed = parseFloat((performance.now() - t0).toFixed(2));
    return {
      success: false,
      method: methodName,
      category: meta.category,
      elapsedMs: elapsed,
      data: null,
      error: err?.message || String(err),
    };
  }
}

/**
 * Build human-readable formatted summary of system metrics
 */
export function formatDataSummary(method: string, data: any): string {
  if (data === null || data === undefined)
    return "(No data returned or subsystem unavailable)";

  if (
    typeof data === "string" ||
    typeof data === "number" ||
    typeof data === "boolean"
  ) {
    return `[${method}] Value: ${data}`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return `[${method}] (Empty list / 0 entries found)`;
    const preview = data
      .slice(0, 10)
      .map((item, idx) => {
        if (typeof item === "object") {
          const entries = Object.entries(item)
            .filter(([_, v]) => v !== null && v !== undefined && v !== "")
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          return `[#${idx + 1}] ${entries}`;
        }
        return `[#${idx + 1}] ${item}`;
      })
      .join("\n");
    return `[${method}] Total items: ${data.length}\n${preview}${data.length > 10 ? `\n... (${data.length - 10} more items)` : ""}`;
  }

  const lines: string[] = [`[${method} Details]`];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        lines.push(`  ${key}: [Array of ${value.length} items]`);
      } else {
        lines.push(
          `  ${key}: {Object: ${Object.keys(value).slice(0, 4).join(", ")}...}`,
        );
      }
    } else {
      lines.push(`  ${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

// -------------------------------------------------------------------------------------------------
// High-Performance Telemetry Snapshot
// -------------------------------------------------------------------------------------------------

export async function fetchTelemetryKpis() {
  const [cpu, load, mem, netIface, netGateway, battery] = await Promise.all([
    si.cpu().catch(() => ({
      manufacturer: "",
      brand: "Processor",
      speed: 0,
      cores: os.cpus().length,
    })),
    si.currentLoad().catch(() => ({ currentLoad: 0 })),
    si.mem().catch(() => ({
      total: os.totalmem(),
      used: os.totalmem() - os.freemem(),
      free: os.freemem(),
    })),
    si.networkInterfaceDefault().catch(() => "en0"),
    si.networkGatewayDefault().catch(() => "127.0.0.1"),
    si.battery().catch(() => [] as any[]),
  ]);

  const realUsedBytes = (mem as any).active
    ? Number((mem as any).active)
    : (mem as any).available
      ? Math.max(0, (mem.total || 0) - Number((mem as any).available))
      : mem.used || 0;
  const usedGb = (realUsedBytes / (1024 * 1024 * 1024)).toFixed(1);
  const totalGb = ((mem.total || 1) / (1024 * 1024 * 1024)).toFixed(1);
  const memPct = Math.round((realUsedBytes / (mem.total || 1)) * 100);

  const primaryBattery = Array.isArray(battery)
    ? battery[0] || null
    : battery && typeof battery === "object"
      ? (battery as any)
      : null;
  const hasBattery = Array.isArray(battery)
    ? battery.length > 0
    : Boolean((battery as any)?.hasBattery);

  const kpis = {
    cpuBrand: `${cpu.manufacturer || ""} ${cpu.brand || "CPU"}`.trim(),
    cpuCores: cpu.cores || os.cpus().length,
    cpuSpeed: cpu.speed ? `${cpu.speed} GHz` : "Active",
    cpuLoadPct: (Number(load.currentLoad) || 0).toFixed(1),
    memUsedGb: usedGb,
    memTotalGb: totalGb,
    memPct: memPct,
    netIface: netIface || "Default",
    netGateway: netGateway || "127.0.0.1",
    hasBattery,
    batteryPct: primaryBattery?.percent ?? 100,
    isCharging: Boolean(primaryBattery?.isCharging),
    osDistro: `${os.type()} ${os.release()} (${os.arch()})`,
    uptimeHours: (os.uptime() / 3600).toFixed(1),
  };

  if (process.env.SCREENSHOT_MODE === "1") {
    return sanitizeKpisForScreenshot(kpis);
  }
  return kpis;
}

// -------------------------------------------------------------------------------------------------
// Production-Grade Enterprise HTML/CSS/JS Application Shell
// -------------------------------------------------------------------------------------------------

export function generateEnterpriseAppHtml(): string {
  const methodsJson = JSON.stringify(
    Object.values(SI_METHODS).map((m) => ({
      name: m.name,
      category: m.category,
      description: m.description,
      acceptsParam: m.acceptsParam || false,
      paramPlaceholder: m.paramPlaceholder || "",
      defaultParam: m.defaultParam || "",
    })),
  );

  const categoriesJson = JSON.stringify(SI_CATEGORIES);
  const initialPlatformLabel =
    process.platform === "darwin"
      ? `macOS (${os.arch()})`
      : process.platform === "win32"
        ? `Windows (${os.arch()})`
        : process.platform === "linux"
          ? `Linux (${os.arch()})`
          : `${os.type()} (${os.arch()})`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E⚡%3C/text%3E%3C/svg%3E">
  <title>System Information Studio Pro</title>
  <style>
    :root {
      --bg-base: #070a12;
      --bg-surface: #0e1526;
      --bg-card: rgba(15, 23, 42, 0.85);
      --bg-glass: rgba(30, 41, 59, 0.6);
      --bg-header: rgba(8, 12, 20, 0.92);
      --bg-kpi-bar: rgba(11, 17, 32, 0.6);
      --bg-sidebar: rgba(10, 15, 28, 0.98);
      --bg-tabs: rgba(11, 17, 32, 0.8);
      --bg-param: rgba(0, 0, 0, 0.35);
      --bg-code: #090d16;
      --bg-console: #060912;
      --bg-footer: #060912;
      --bg-toast: rgba(15, 23, 42, 0.96);
      --bg-table-th: rgba(30, 41, 59, 0.85);
      --bg-input: rgba(255, 255, 255, 0.05);
      --surface-pill: rgba(255, 255, 255, 0.04);
      --surface-hover: rgba(255, 255, 255, 0.12);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-inner: rgba(255, 255, 255, 0.06);
      --border-focus: #38bdf8;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --cyan: #38bdf8;
      --cyan-glow: rgba(56, 189, 248, 0.25);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --purple: #c084fc;
      --amber: #fbbf24;
      --rose: #f43f5e;
      --json-key: #38bdf8;
      --json-str: #34d399;
      --json-num: #fbbf24;
      --json-bool: #c084fc;
      --json-null: #f43f5e;
      --audit-hero-bg: linear-gradient(135deg, rgba(14, 21, 38, 0.95), rgba(30, 41, 59, 0.75));
      --audit-hero-border: rgba(56, 189, 248, 0.35);
      --audit-metric-bg: rgba(8, 12, 20, 0.65);
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      background-image: 
        radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.07) 0%, transparent 40%),
        radial-gradient(circle at 88% 90%, rgba(192, 132, 252, 0.07) 0%, transparent 40%);
      color: var(--text-main);
      font-family: var(--font-sans);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* Header */
    header {
      height: 56px;
      background: var(--bg-header);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      flex-shrink: 0;
      z-index: 100;
      gap: 10px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #0284c7, #8b5cf6);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
      font-size: 16px;
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .brand-badge {
      font-size: 10px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--cyan);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .btn {
      background: var(--bg-glass);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
      outline: none;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--surface-hover);
      border-color: var(--cyan);
    }

    .btn:active {
      transform: translateY(1px);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      border-color: rgba(56, 189, 248, 0.5);
      box-shadow: 0 2px 10px var(--cyan-glow);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #0ea5e9, #3b82f6);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.45);
    }

    .btn:focus-visible,
    .cat-header:focus-visible,
    .method-btn:focus-visible,
    .tab-btn:focus-visible,
    .cat-pill-btn:focus-visible,
    .sidebar-mini-btn:focus-visible,
    .chip:focus-visible,
    .search-input:focus-visible,
    .param-input:focus-visible {
      outline: 2px solid var(--cyan);
      outline-offset: 2px;
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
      background: var(--surface-pill);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Top Progress Bar */
    .top-progress-bar {
      height: 3px;
      width: 100%;
      background: transparent;
      overflow: hidden;
      flex-shrink: 0;
    }

    .top-progress-bar.active {
      background: linear-gradient(90deg, #0284c7, #38bdf8, #8b5cf6, #0284c7);
      background-size: 200% 100%;
      animation: barSlide 1.2s linear infinite;
    }

    @keyframes barSlide {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    /* KPI Summary Row */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      padding: 12px 20px;
      flex-shrink: 0;
      background: var(--bg-kpi-bar);
      border-bottom: 1px solid var(--border-subtle);
    }

    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .kpi-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .kpi-value {
      font-size: 16px;
      font-weight: 800;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-sub {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-bar {
      width: 100%;
      height: 4px;
      background: var(--surface-pill);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 3px;
    }

    .kpi-bar-fill {
      height: 100%;
      background: var(--cyan);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    /* Workspace */
    .workspace {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }

    /* Left Sidebar: Adjustable Width with Smooth Scrolling & Zero Cutoff */
    aside {
      width: 380px;
      min-width: 280px;
      max-width: 650px;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
    }

    /* Draggable Splitter Handle */
    .sidebar-resizer {
      width: 6px;
      margin-left: -3px;
      cursor: col-resize;
      background: transparent;
      position: relative;
      flex-shrink: 0;
      z-index: 60;
      transition: background 0.15s ease;
    }

    .sidebar-resizer:hover,
    .sidebar-resizer.resizing {
      background: var(--cyan);
      box-shadow: 0 0 10px var(--cyan-glow);
    }

    .search-box {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 7px 10px 7px 30px;
      color: var(--text-main);
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: var(--cyan);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--text-dim);
      font-size: 12px;
      pointer-events: none;
    }

    /* Sidebar Sub-Toolbar */
    .sidebar-subbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 0 2px;
    }

    .sidebar-mini-btn {
      font-size: 10px;
      padding: 2px 7px;
      background: var(--surface-pill);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      color: var(--text-dim);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.12s ease;
      white-space: nowrap;
    }

    .sidebar-mini-btn:hover {
      background: rgba(56, 189, 248, 0.12);
      border-color: var(--cyan);
      color: var(--cyan);
    }

    /* Category Filter Pills */
    .cat-filter-scroll {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }

    .cat-pill-btn {
      font-size: 10px;
      padding: 3px 8px;
      background: var(--surface-pill);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.1s;
    }

    .cat-pill-btn:hover {
      background: var(--surface-hover);
      color: var(--text-main);
    }

    .cat-pill-btn.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--cyan);
      color: var(--cyan);
      font-weight: 700;
    }

    /* Category & Method List Pane with Scroll Feature */
    .cat-list {
      flex: 1 1 0;
      min-height: 0;
      height: 0;
      overflow-y: auto;
      overflow-x: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scrollbar-gutter: stable;
    }

    /* Modern sleek scrollbars across entire studio */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.35);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(56, 189, 248, 0.6);
    }

    .cat-group {
      border-radius: 6px;
      overflow: hidden;
      background: var(--surface-pill);
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
      min-width: 100%;
      box-sizing: border-box;
    }

    .cat-header {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.1s;
      min-width: 0;
      flex-shrink: 0;
      min-height: 32px;
      user-select: none;
    }

    .cat-header:hover {
      background: var(--surface-hover);
      color: var(--text-main);
    }

    .cat-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }

    .cat-arrow {
      font-size: 9px;
      color: var(--text-dim);
      transition: transform 0.15s ease;
      flex-shrink: 0;
      width: 14px;
      display: inline-block;
      text-align: center;
    }

    .cat-header-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .cat-count-badge {
      font-size: 9px;
      background: var(--bg-glass);
      padding: 1px 6px;
      border-radius: 10px;
      color: var(--text-dim);
      flex-shrink: 0;
      margin-left: 6px;
    }

    .method-items {
      display: flex;
      flex-direction: column;
      padding: 4px 6px;
      gap: 2px;
    }

    .method-btn {
      padding: 6px 10px;
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      border-radius: 4px;
      border-left: 3px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.1s ease, color 0.1s ease;
      min-width: 0;
      white-space: nowrap;
      flex-shrink: 0;
      min-height: 28px;
    }

    .method-btn:hover {
      background: rgba(56, 189, 248, 0.1);
      color: var(--cyan);
    }

    .method-btn.active {
      background: rgba(56, 189, 248, 0.15);
      border-left-color: var(--cyan);
      color: var(--cyan);
      font-weight: 700;
    }

    .method-name-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }

    /* Main Area */
    main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
    }

    .action-banner {
      padding: 14px 20px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
    }

    .banner-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .method-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .method-title {
      font-size: 18px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--cyan);
      word-break: break-word;
    }

    .method-cat-tag {
      font-size: 11px;
      background: rgba(192, 132, 252, 0.15);
      color: var(--purple);
      border: 1px solid rgba(192, 132, 252, 0.3);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .method-timing {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-dim);
    }

    .method-desc {
      font-size: 12px;
      color: var(--text-muted);
    }

    .param-row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-param);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      flex-wrap: wrap;
    }

    .param-label {
      font-size: 11px;
      color: var(--text-dim);
      font-weight: 600;
      white-space: nowrap;
    }

    .param-input {
      flex: 1;
      min-width: 140px;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-main);
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .banner-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Tabs */
    .view-tabs {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--bg-tabs);
      padding: 6px 20px 0 20px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
      overflow-x: auto;
    }

    .tab-btn {
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text-main);
    }

    .tab-btn.active {
      color: var(--cyan);
      border-bottom-color: var(--cyan);
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      position: relative;
      user-select: text;
    }

    /* Visual Grid */
    .visual-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
    }

    .data-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .data-card-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--cyan);
      border-bottom: 1px solid var(--border-inner);
      padding-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .kv-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .kv-item {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      gap: 10px;
      min-width: 0;
    }

    .kv-k {
      color: var(--text-dim);
      font-family: var(--font-mono);
      font-size: 11px;
      white-space: nowrap;
    }

    .kv-v {
      color: var(--text-main);
      font-weight: 500;
      text-align: right;
      word-break: break-word;
      min-width: 0;
    }

    /* Hardware Audit Hero Card */
    .audit-hero-card {
      grid-column: 1 / -1;
      background: var(--audit-hero-bg);
      border: 1px solid var(--audit-hero-border);
      padding: 18px 22px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }

    .audit-hero-title {
      font-size: 19px;
      font-weight: 800;
      color: var(--text-main);
      letter-spacing: -0.3px;
    }

    .audit-hero-tag {
      font-size: 11px;
      background: var(--surface-pill);
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
    }

    .audit-hero-tag strong {
      color: var(--text-main);
    }

    .audit-metric-box {
      background: var(--audit-metric-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 14px;
      min-width: 0;
    }

    /* Process Table */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      overflow-x: auto;
      overflow-y: hidden;
      width: 100%;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }

    table.data-table th {
      background: var(--bg-table-th);
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-subtle);
      white-space: nowrap;
    }

    table.data-table td {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border-inner);
      color: var(--text-main);
      font-family: var(--font-mono);
      font-size: 11px;
    }

    table.data-table tr:hover td {
      background: rgba(56, 189, 248, 0.06);
    }

    /* JSON Inspector */
    .json-inspector {
      background: var(--bg-code);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text-muted);
      max-height: 100%;
    }

    .json-key { color: var(--json-key); }
    .json-str { color: var(--json-str); }
    .json-num { color: var(--json-num); }
    .json-bool { color: var(--json-bool); }
    .json-null { color: var(--json-null); }

    /* Console */
    .console-box {
      background: var(--bg-console);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.6;
      height: 100%;
      min-height: 180px;
      overflow-y: auto;
      color: var(--text-main);
    }

    .log-line {
      display: flex;
      gap: 8px;
      word-break: break-word;
    }

    .log-time { color: var(--text-dim); flex-shrink: 0; }
    .log-ok { color: var(--emerald); }
    .log-info { color: var(--cyan); }
    .log-err { color: var(--rose); }

    /* Footer */
    footer {
      height: 28px;
      background: var(--bg-footer);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 11px;
      color: var(--text-dim);
      flex-shrink: 0;
    }

    .footer-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 38px;
      right: 20px;
      background: var(--bg-toast);
      border: 1px solid var(--cyan);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 999;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s ease;
      pointer-events: none;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
  ${SYSTEM_STUDIO_EXTRA_CSS}
  <style id="sysLightAndResponsiveCss">
    html.light {
      --bg-header: rgba(255, 255, 255, 0.94);
      --bg-kpi-bar: #f8fafc;
      --bg-sidebar: #f8fafc;
      --bg-tabs: #f8fafc;
      --bg-param: #f1f5f9;
      --bg-code: #f8fafc;
      --bg-console: #f8fafc;
      --bg-footer: #ffffff;
      --bg-toast: #ffffff;
      --bg-table-th: #e2e8f0;
      --bg-input: #ffffff;
      --surface-pill: rgba(15, 23, 42, 0.05);
      --surface-hover: rgba(15, 23, 42, 0.09);
      --border-inner: rgba(15, 23, 42, 0.08);
      --purple: #7e22ce;
      --amber: #b45309;
      --emerald: #047857;
      --rose: #be123c;
      --json-key: #0369a1;
      --json-str: #047857;
      --json-num: #b45309;
      --json-bool: #7e22ce;
      --json-null: #be123c;
      --audit-hero-bg: linear-gradient(135deg, #ffffff, #e0f2fe);
      --audit-hero-border: rgba(2, 132, 199, 0.35);
      --audit-metric-bg: rgba(255, 255, 255, 0.9);
    }

    html.light .brand-badge {
      background: rgba(2, 132, 199, 0.12);
      border-color: rgba(2, 132, 199, 0.3);
    }

    html.light .method-cat-tag {
      background: rgba(126, 34, 206, 0.1);
      border-color: rgba(126, 34, 206, 0.28);
    }

    @media (max-width: 960px) {
      body {
        height: auto;
        min-height: 100vh;
        overflow-y: auto;
        overflow-x: hidden;
      }

      header {
        height: auto;
        min-height: 52px;
        flex-wrap: wrap;
        padding: 10px 14px;
      }

      .header-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .kpi-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 10px 14px;
      }

      .workspace {
        flex-direction: column;
        overflow: visible;
      }

      aside {
        width: 100% !important;
        min-width: 0;
        max-width: none;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid var(--border-subtle);
      }

      .cat-list {
        flex: none;
        height: auto;
        min-height: 110px;
        max-height: 220px;
      }

      .sidebar-resizer,
      .sidebar-width-controls {
        display: none !important;
      }

      main {
        overflow: visible;
      }

      .tab-content {
        overflow-y: visible;
      }

      footer {
        height: auto;
        min-height: 28px;
        padding: 6px 14px;
        flex-wrap: wrap;
        gap: 6px;
      }
    }

    @media (max-width: 640px) {
      header {
        padding: 8px 12px;
      }

      .btn {
        padding: 5px 9px;
        font-size: 11px;
      }

      .kpi-row {
        gap: 8px;
        padding: 8px 12px;
      }

      .kpi-card {
        padding: 8px 10px;
      }

      .kpi-value {
        font-size: 14px;
      }

      .quick-bar {
        padding: 8px 12px;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .quick-chips {
        flex: none;
        width: 100%;
        min-width: 0;
      }

      .quick-settings {
        width: 100%;
        justify-content: flex-start;
        gap: 8px 12px;
      }

      .action-banner,
      .tab-content {
        padding: 12px;
      }

      .view-tabs {
        padding: 6px 12px 0 12px;
      }

      .visual-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .kv-item {
        flex-wrap: wrap;
      }

      .kv-v {
        text-align: left;
      }
    }
  </style>
</head>
<body spellcheck="false" autocapitalize="none" autocorrect="off" oncontextmenu="return false;">

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-logo" aria-hidden="true">⚡</div>
      <div class="brand-title">
        System Studio Pro
        <span class="brand-badge">All 76 APIs</span>
      </div>
      <div class="status-pill">
        <div class="status-dot" aria-hidden="true"></div>
        <span id="pillPlatform">${initialPlatformLabel}</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="btn" type="button" onclick="triggerPreset('getAllData')">⚡ Full System Audit</button>
      <button class="btn" type="button" onclick="triggerPreset('getStaticData')">🏛️ Static Hardware</button>
      <button class="btn" type="button" onclick="triggerPreset('getDynamicData')">📈 Dynamic Telemetry</button>
      <button class="btn" type="button" onclick="refreshKpiCards()">🔄 Refresh KPIs</button>
      <button class="btn" type="button" id="btnFullscreen" onclick="window.doToggleFullscreen ? window.doToggleFullscreen() : (window.toggleFullscreen && window.toggleFullscreen())" title="Toggle Fullscreen (Fn+F / F / F11 / Cmd+Ctrl+F)">⛶ Fullscreen</button>${SYSTEM_STUDIO_EXTRA_HEADER_HTML}
    </div>
  </header>

  <!-- Top Progress Bar -->
  <div class="top-progress-bar" id="loadingBar"></div>

  <!-- Top Real-Time KPI Cards -->
  <section class="kpi-row" aria-label="System telemetry summary">
    <div class="kpi-card">
      <div class="kpi-title">
        <span>CPU Processor</span>
        <span aria-hidden="true">⚡</span>
      </div>
      <div class="kpi-value" id="kpiCpuValue">Loading...</div>
      <div class="kpi-sub" id="kpiCpuSub">Core Count & Speed</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" id="kpiCpuBar" style="width: 20%;"></div></div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">
        <span>CPU Load</span>
        <span id="kpiLoadBadge">0%</span>
      </div>
      <div class="kpi-value" id="kpiLoadValue">0.0%</div>
      <div class="kpi-sub" id="kpiLoadSub">System Load</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" id="kpiLoadBar" style="width: 0%; background: #34d399;"></div></div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">
        <span>Memory (RAM)</span>
        <span id="kpiMemPct">0%</span>
      </div>
      <div class="kpi-value" id="kpiMemValue">-- / -- GB</div>
      <div class="kpi-sub" id="kpiMemSub">Physical Allocation</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" id="kpiMemBar" style="width: 50%; background: #c084fc;"></div></div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">
        <span>Primary Gateway</span>
        <span aria-hidden="true">🌐</span>
      </div>
      <div class="kpi-value" id="kpiNetValue">Detecting...</div>
      <div class="kpi-sub" id="kpiNetSub">Interface Route</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" id="kpiNetBar" style="width: 100%; background: #38bdf8;"></div></div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">
        <span>Battery / Power</span>
        <span aria-hidden="true">🔋</span>
      </div>
      <div class="kpi-value" id="kpiPowerValue">Checking...</div>
      <div class="kpi-sub" id="kpiPowerSub">Power State</div>
      <div class="kpi-bar"><div class="kpi-bar-fill" id="kpiPowerBar" style="width: 100%; background: #fbbf24;"></div></div>
    </div>
  </section>
${SYSTEM_STUDIO_EXTRA_QUICKBAR_HTML}

  <!-- Workspace -->
  <div class="workspace">
    <!-- Left Navigation Sidebar: Adjustable Width with Smooth Scrolling & Zero Cutoff -->
    <aside id="mainSidebar" aria-label="API Explorer">
      <div class="search-box">
        <div class="search-input-wrap">
          <span class="search-icon" aria-hidden="true">🔍</span>
          <input type="text" class="search-input" id="searchApis" aria-label="Filter 76 systeminformation APIs" placeholder="Filter 76 APIs (e.g. cpu, gpu, npu, docker, wifi)..." oninput="filterMethods(this.value)">
        </div>

        <!-- Sidebar Tools: Expand/Collapse & Width Controls -->
        <div class="sidebar-subbar">
          <button type="button" class="sidebar-mini-btn" id="btnToggleAllCats" onclick="toggleAllCategories()" title="Expand or Collapse All Categories">📁 Collapse All</button>
          <div class="sidebar-width-controls" style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="sidebar-mini-btn" onclick="adjustSidebarWidth(-30)" title="Shrink sidebar width" aria-label="Shrink sidebar width">◀</button>
            <button type="button" class="sidebar-mini-btn" onclick="toggleSidebarWidth()" title="Toggle standard / wide layout">↔ Width</button>
            <button type="button" class="sidebar-mini-btn" onclick="adjustSidebarWidth(30)" title="Expand sidebar width" aria-label="Expand sidebar width">▶</button>
          </div>
        </div>

        <!-- Category Filter Pills -->
        <div class="cat-filter-scroll" id="catFilterBar" role="group" aria-label="Filter APIs by category">
          <button type="button" class="cat-pill-btn active" data-cat="ALL" aria-pressed="true" onclick="filterByCategory('ALL')">All (76)</button>
          <button type="button" class="cat-pill-btn" data-cat="Hardware & Baseboard" aria-pressed="false" onclick="filterByCategory('Hardware & Baseboard')">Hardware (8)</button>
          <button type="button" class="cat-pill-btn" data-cat="OS & Software Environment" aria-pressed="false" onclick="filterByCategory('OS & Software Environment')">OS (8)</button>
          <button type="button" class="cat-pill-btn" data-cat="CPU, Load & Thermals" aria-pressed="false" onclick="filterByCategory('CPU, Load & Thermals')">CPU (9)</button>
          <button type="button" class="cat-pill-btn" data-cat="Memory & Power / Battery" aria-pressed="false" onclick="filterByCategory('Memory & Power / Battery')">Memory (3)</button>
          <button type="button" class="cat-pill-btn" data-cat="Graphics & Displays" aria-pressed="false" onclick="filterByCategory('Graphics & Displays')">GPU (2)</button>
          <button type="button" class="cat-pill-btn" data-cat="Disks & Filesystems" aria-pressed="false" onclick="filterByCategory('Disks & Filesystems')">Storage (7)</button>
          <button type="button" class="cat-pill-btn" data-cat="Network, Sockets & Wi-Fi" aria-pressed="false" onclick="filterByCategory('Network, Sockets & Wi-Fi')">Network (13)</button>
          <button type="button" class="cat-pill-btn" data-cat="Processes & Services" aria-pressed="false" onclick="filterByCategory('Processes & Services')">Processes (5)</button>
          <button type="button" class="cat-pill-btn" data-cat="Peripherals & Audio" aria-pressed="false" onclick="filterByCategory('Peripherals & Audio')">Peripherals (8)</button>
          <button type="button" class="cat-pill-btn" data-cat="Virtualization, Docker & Batch" aria-pressed="false" onclick="filterByCategory('Virtualization, Docker & Batch')">Virtualization (13)</button>
        </div>
      </div>

      <div class="cat-list" id="catListContainer" role="navigation" aria-label="Systeminformation API categories">
        <!-- Rendered dynamically -->
      </div>
    </aside>

    <!-- Draggable Sidebar Resizer Splitter -->
    <div class="sidebar-resizer" id="sidebarResizer" title="Drag to resize sidebar width | Double-click to toggle width"></div>

    <!-- Main Detail & Results Area -->
    <main>
      <!-- Action Banner -->
      <section class="action-banner">
        <div class="banner-top">
          <div class="method-title-group">
            <span class="method-title" id="activeMethodName">system</span>
            <span class="method-cat-tag" id="activeCategoryTag">Hardware & Baseboard</span>
          </div>
          <div class="method-timing" id="executionTimer">Ready to execute</div>
        </div>

        <div class="method-desc" id="activeMethodDesc">Hardware manufacturer, model, version, serial number & UUID</div>

        <div class="param-row" id="paramRow" style="display: none;">
          <label class="param-label" for="paramInput">Target Parameter:</label>
          <input type="text" class="param-input" id="paramInput" aria-label="Target parameter" placeholder="" onkeydown="if (event.key === 'Enter') runCurrentMethod()">
        </div>

        <div class="banner-controls">
          <button type="button" class="btn btn-primary" id="btnExecute" onclick="runCurrentMethod()">🚀 Run Method</button>
          <button type="button" class="btn" onclick="runCurrentCategory()">📋 Run Entire Category</button>
          <button type="button" class="btn" id="btnLiveObserve" onclick="toggleLiveObserve()">⏱️ Live Stream (1s)</button>
          <button type="button" class="btn" onclick="copyCurrentJson()">📋 Copy JSON</button>
          <button type="button" class="btn" onclick="exportCurrentReport()">💾 Save Report</button>
          <button type="button" class="btn" onclick="clearResults()">🧹 Clear</button>
        </div>${SYSTEM_STUDIO_EXTRA_BANNER_HTML}
      </section>

      <!-- View Selection Tabs -->
      <div class="view-tabs" role="tablist" aria-label="Output views">
        <div class="tab-btn active" id="tabVisual" role="tab" tabindex="0" aria-selected="true" aria-controls="viewVisual" onclick="switchTab('visual')" onkeydown="handleTabKey(event, 'visual')">📊 Visual Smart Cards</div>
        <div class="tab-btn" id="tabJson" role="tab" tabindex="-1" aria-selected="false" aria-controls="viewJson" onclick="switchTab('json')" onkeydown="handleTabKey(event, 'json')">💻 Raw JSON Inspector</div>
        <div class="tab-btn" id="tabConsole" role="tab" tabindex="-1" aria-selected="false" aria-controls="viewConsole" onclick="switchTab('console')" onkeydown="handleTabKey(event, 'console')">⚡ Telemetry Log</div>
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content">
        <!-- 1. Visual Smart View -->
        <div id="viewVisual" role="tabpanel" aria-labelledby="tabVisual">
          <div class="visual-grid" id="visualContainer">
            <!-- Dynamic visual cards -->
          </div>
        </div>

        <!-- 2. JSON View -->
        <div id="viewJson" role="tabpanel" aria-labelledby="tabJson" style="display: none; height: 100%;">
${SYSTEM_STUDIO_EXTRA_JSONSEARCH_HTML}
          <div class="json-inspector" id="jsonInspector">{\n  "status": "ready"\n}</div>
        </div>

        <!-- 3. Console View -->
        <div id="viewConsole" role="tabpanel" aria-labelledby="tabConsole" style="display: none; height: 100%;">
          <div class="console-box" id="consoleBox">
            <div class="log-line">
              <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
              <span class="log-info">System Information Studio Pro initialized. All 76 methods ready.</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Footer -->
  <footer>
    <div class="footer-left">
      <span>Platform: <b id="footerPlatform">${initialPlatformLabel}</b></span>
      <span>•</span>
      <span>Total APIs: <b>76</b></span>
      <span>•</span>
      <span>Bun Native Engine</span>
    </div>
    <div id="footerClock">00:00:00</div>
  </footer>

  <!-- Toast -->
  <div class="toast" id="toastBox" role="status" aria-live="polite">Notification message</div>
${SYSTEM_STUDIO_EXTRA_OVERLAY_HTML}

  <script>
    const ALL_METHODS = ${methodsJson};
    const ALL_CATEGORIES = ${categoriesJson};
    const IS_SCREENSHOT_MODE = ${process.env.SCREENSHOT_MODE === "1" ? "true" : "false"};
    const STUDIO_BUN_VERSION = ${JSON.stringify(Bun.version)};

    let activeMethod = "system";
    let activeResult = null;
    let liveObserverTimer = null;
    let currentTab = "visual";
    let selectedCategoryFilter = "ALL";
    let demoTick = 0;

    function maskClientString(str) {
      let s = String(str);
      s = s.replace(/\\/Users\\/[^/\\s"']+/g, "/Users/developer");
      s = s.replace(/\\/home\\/[^/\\s"']+/g, "/home/developer");
      s = s.replace(/[A-Za-z]:\\\\Users\\\\[^\\\\\\s"']+/gi, "C:\\\\Users\\\\developer");
      s = s.replace(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b/gi, "🔒 [Protected / Masked]");
      s = s.replace(/\\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\\b/gi, function(m) {
        return /^0{2}([:-]0{2}){5}$/.test(m) ? m : "🔒 [Protected / Masked]";
      });
      return s;
    }

    function maskTelemetryClient(val, keyName, methodName) {
      if (val === null || val === undefined) return val;
      if (typeof val === "string") {
        const k = String(keyName || "");
        if (/^(serial|serialnum|assettag|hardware)$/i.test(k) && val.trim() && !/^unknown$/i.test(val.trim())) {
          return "🔒 [Protected / Masked]";
        }
        if (/^(uuid|systemuuid)$/i.test(k)) return val.trim() ? "🔒 [Protected / Masked]" : val;
        if (/^(mac|macdevice|machost|bssid)$/i.test(k)) {
          return (!val.trim() || /^0{2}([:-]0{2}){5}$/.test(val.trim())) ? val : "🔒 [Protected / Masked]";
        }
        if (/^(hostname|fqdn)$/i.test(k)) return "studio-workstation.local";
        if (/^(user|username)$/i.test(k)) {
          const t = val.trim();
          return (!t || /^(root|system|nobody|daemon)$/i.test(t) || t.startsWith("_")) ? val : "developer";
        }
        if (/^(ip4|ip|gateway|netgateway|localaddress|peeraddress|externalip)$/i.test(k) || methodName === "networkGatewayDefault") {
          const t = val.trim();
          if (!t || t === "127.0.0.1" || t === ["0", "0", "0", "0"].join(".") || t === "*") return val;
          return methodName === "inetPublicIp" ? "203.0.113.*** (Masked)" : "192.168.1.*** (Masked)";
        }
        if (/^ip6$/i.test(k)) {
          const t = val.trim();
          if (!t || t === "::1" || t === "::") return val;
          return methodName === "inetPublicIp" ? "2001:db8::*** (Masked)" : "fe80::*** (Masked)";
        }
        return maskClientString(val);
      }
      if (Array.isArray(val)) return val.map(function(it) { return maskTelemetryClient(it, keyName, methodName); });
      if (typeof val === "object") {
        const out = {};
        for (const k of Object.keys(val)) {
          out[k] = maskTelemetryClient(val[k], k, methodName);
        }
        return out;
      }
      return val;
    }

    function buildDemoPayload(methodName, param) {
      demoTick += 1;
      const loadVal = Number((8.4 + (demoTick % 7) * 1.7).toFixed(1));
      const userLoad = Number((loadVal * 0.65).toFixed(1));
      const sysLoad = Number((loadVal - userLoad).toFixed(1));
      const memUsed = (8 + (demoTick % 4)) * 1024 * 1024 * 1024;
      const memTotal = 32 * 1024 * 1024 * 1024;
      const nowMs = 1795000000000 + demoTick * 1000;

      const staticSnap = {
        version: "6.0.0-beta.26",
        system: {
          manufacturer: "Studio Hardware",
          model: "Workstation Pro (Demo)",
          version: "1.0",
          serial: "🔒 [Protected / Masked]",
          uuid: "🔒 [Protected / Masked]",
          sku: "RAD-WORKSTATION",
          virtual: false,
          type: "Desktop"
        },
        bios: { vendor: "Studio Firmware", version: "2.4.0", releaseDate: "2026-01-15", revision: "2.4" },
        baseboard: { manufacturer: "Studio Hardware", model: "RAD-B650", version: "1.0", serial: "🔒 [Protected / Masked]", assetTag: "🔒 [Protected / Masked]", memMax: 137438953472, memSlots: 4 },
        chassis: { manufacturer: "Studio Hardware", model: "Workstation Pro", type: "Desktop", version: "1.0", serial: "🔒 [Protected / Masked]", assetTag: "🔒 [Protected / Masked]", sku: "RAD-WORKSTATION" },
        os: { platform: "darwin", distro: "Studio OS", release: "15.0", codename: "Demo", kernel: "25.0.0", arch: "arm64", hostname: "studio-workstation.local", fqdn: "studio-workstation.local", codepage: "UTF-8", logofile: "studio", serial: "🔒 [Protected / Masked]", build: "25A100", uefi: true, displayServer: "quartz" },
        uuid: { os: "🔒 [Protected / Masked]", hardware: "🔒 [Protected / Masked]", macs: ["🔒 [Protected / Masked]"], disks: ["🔒 [Protected / Masked]"] },
        versions: { kernel: "25.0.0", openssl: "3.3.0", bun: STUDIO_BUN_VERSION, node: "22.12.0", v8: "13.0", git: "2.47.0" },
        cpu: { manufacturer: "Studio Silicon", brand: "Workstation M-Series", vendor: "Studio", family: "ARMv9", model: "Pro", stepping: "1", speed: 3.5, speedMin: 0.6, speedMax: 4.1, governor: "schedutil", cores: 12, physicalCores: 12, performanceCores: 8, efficiencyCores: 4, processors: 1, socket: "SOC", virtualization: true, cache: { l1d: 65536, l1i: 131072, l2: 4194304, l3: 25165824 } },
        gpu: [{ vendor: "Studio Graphics", model: "Workstation Integrated GPU", bus: "Built-In", vramDynamic: true, vram: 16384, cores: 16 }],
        displays: [{ vendor: "Studio Display", model: "Pro Display 5K", main: true, builtin: true, connection: "Internal", resolutionX: 3024, resolutionY: 1964, currentResX: 1512, currentResY: 982, currentRefreshRate: 120, serial: "🔒 [Protected / Masked]" }],
        net: [
          { iface: "lo0", ifaceName: "lo0", default: false, ip4: "127.0.0.1", ip4subnet: "255.0.0.0", ip6: "::1", mac: "00:00:00:00:00:00", internal: true, virtual: false, operstate: "unknown", type: "wired", mtu: 16384 },
          { iface: "en0", ifaceName: "en0", default: true, ip4: "192.168.1.*** (Masked)", ip4subnet: "255.255.255.0", ip6: "fe80::*** (Masked)", mac: "🔒 [Protected / Masked]", internal: false, virtual: false, operstate: "up", type: "wireless", speed: 1200, mtu: 1500 }
        ],
        memLayout: [{ size: memTotal, bank: "Unified Bank 0", type: "LPDDR5", ecc: false, clockSpeed: 6400, formFactor: "SOC", manufacturer: "Studio Memory" }],
        diskLayout: [{ device: "disk0", type: "NVMe", name: "STUDIO NVME 1TB", vendor: "Studio Storage", size: 1000000000000, interfaceType: "PCIe", smartStatus: "Ok", serialNum: "🔒 [Protected / Masked]" }],
        audio: [{ id: "0", name: "Studio Reference Speakers", manufacturer: "Studio Audio", channel: "Stereo", default: true, in: false, out: true, type: "Built-in", status: "online" }],
        bluetooth: [{ device: "0x2001", name: "Studio Wireless Headphones", manufacturer: "Studio Audio", macDevice: "🔒 [Protected / Masked]", connected: true, type: "Headphones", batteryPercent: 88 }],
        usb: [{ id: 1, bus: 1, deviceId: 1, name: "Studio USB-C Hub", type: "Hub", removable: false, vendor: "Studio", serial: "🔒 [Protected / Masked]" }],
        serialPorts: [{ device: "/dev/cu.studio-uart", name: "Studio UART Port", manufacturer: "Studio", serialNumber: "🔒 [Protected / Masked]" }],
        printer: [{ id: 1, name: "Studio PDF Printer", model: "Virtual PDF", local: true, default: true, status: "idle" }],
        camera: [{ name: "Studio FaceTime HD Camera", vendor: "Studio", model: "1080p", serial: "", connection: "internal" }],
        keyboard: [{ name: "Studio Mechanical Keyboard", vendor: "Studio", model: "0x01", serial: "🔒 [Protected / Masked]", connection: "internal" }],
        mouse: [{ name: "Studio Precision Trackpad", type: "Trackpad", vendor: "Studio", model: "0x02", serial: "🔒 [Protected / Masked]", connection: "internal" }],
        pci: [{ slot: "PCIe-0", type: "NVMe Controller", vendor: "Studio", model: "PCIe Gen4 x4", driver: "nvme" }],
        thunderbolt: [{ name: "Thunderbolt USB4 Bus 0", uuid: "🔒 [Protected / Masked]", bus: 0, type: "hub", speed: 120 }],
        npu: [{ vendor: "Studio", name: "Neural Accelerator", model: "Studio NPU 16-Core", cores: 16, driver: "ane" }],
        wifiInterfaces: [{ id: "Wi-Fi", networkInterface: "en0", model: "AirPort AX", vendor: "Studio", mac: "🔒 [Protected / Masked]" }],
        software: [{ name: "Bun RAD Studio", version: "1.6.3", installDate: "2026-11-18", architecture: "arm64", path: "/Applications/BunRADStudio.app" }]
      };

      const dynamicSnap = {
        time: { current: nowMs, uptime: 86400 + demoTick, timezone: "UTC", timezoneName: "UTC" },
        cpuCurrentSpeed: { min: 2.4, max: 3.8, avg: Number((3.1 + (demoTick % 3) * 0.2).toFixed(1)), cores: [3.2, 3.2, 3.5, 3.5] },
        users: [{ user: "developer", tty: "console", date: "2026-11-18", time: "15:00", ip: "", command: "-zsh" }],
        processes: {
          all: 142,
          running: 3,
          blocked: 0,
          sleeping: 139,
          unknown: 0,
          list: [
            { pid: 1001, parentPid: 1, name: "bun", cpu: loadVal, mem: 2.4, user: "developer", state: "running", command: "bun applications/system_studio_server.ts" },
            { pid: 1002, parentPid: 1001, name: "studio-worker", cpu: 1.8, mem: 1.2, user: "developer", state: "sleeping", command: "/Users/developer/workspace/worker" },
            { pid: 1003, parentPid: 1, name: "system-telemetry", cpu: 0.9, mem: 0.6, user: "system", state: "running", command: "/usr/libexec/telemetryd" }
          ]
        },
        currentLoad: { avgLoad: 0.72, currentLoad: loadVal, currentLoadUser: userLoad, currentLoadSystem: sysLoad, currentLoadIdle: Number((100 - loadVal).toFixed(1)), cpus: [{ load: loadVal }, { load: userLoad }] },
        temp: { main: 44 + (demoTick % 4), cores: [43, 45, 44, 46], max: 46, socket: [44], chipset: 39 },
        fans: [{ name: "System Fan 1", rpm: 1450 + demoTick * 10, min: 1200, max: 4800 }],
        networkStats: [{ iface: "en0", operstate: "up", rx_bytes: 124500000 + demoTick * 4096, rx_packets: 98000, rx_dropped: 0, rx_errors: 0, tx_bytes: 64200000 + demoTick * 2048, tx_packets: 54000, tx_dropped: 0, tx_errors: 0, rx_sec: 12400, tx_sec: 5200 }],
        networkConnections: [{ protocol: "tcp4", localAddress: "127.0.0.1", localPort: "4567", peerAddress: "127.0.0.1", peerPort: "58012", state: "ESTABLISHED", pid: 1001, process: "bun" }],
        mem: { total: memTotal, free: memTotal - memUsed, used: memUsed, active: memUsed, available: memTotal - memUsed, buffers: 0, cached: 4294967296, slab: 0, swaptotal: 2147483648, swapused: 0, swapfree: 2147483648 },
        battery: [{ hasBattery: true, cycleCount: 42, isCharging: true, designedCapacity: 99600, maxCapacity: 98400, currentCapacity: 94500, voltage: 12.6, capacityUnit: "mWh", percent: 96, timeRemaining: null, acConnected: true, type: "Li-ion", model: "Studio Cell", manufacturer: "Studio Power", serial: "🔒 [Protected / Masked]" }],
        services: [{ name: "com.studio.telemetry", running: true, startmode: "auto", pids: [1001], cpu: 0.4, mem: 0.2 }],
        fsSize: [{ fs: "/dev/disk1s1", type: "APFS", size: 1000000000000, used: 420000000000, available: 580000000000, use: 42.0, mount: "/", rw: true }],
        fsStats: { rx: 500000000 + demoTick * 8192, wx: 320000000 + demoTick * 4096, tx: 820000000, rx_sec: 4096, wx_sec: 2048, tx_sec: 6144, ms: 10 },
        disksIO: { rIO: 12000 + demoTick * 3, wIO: 8400 + demoTick * 2, tIO: 20400 + demoTick * 5, rIO_sec: 12, wIO_sec: 8, tIO_sec: 20, rWaitTime: 0.2, wWaitTime: 0.1, tWaitTime: 0.3, rWaitPercent: 0.1, wWaitPercent: 0.1, tWaitPercent: 0.2, ms: 10 },
        wifiNetworks: [{ ssid: "Studio-Mesh-5G", bssid: "🔒 [Protected / Masked]", mode: "Infrastructure", channel: 36, frequency: 5180, signalLevel: -48, quality: 92, security: ["WPA3"], wpaFlags: [], rsnFlags: ["CCMP"] }],
        wifiConnections: [{ id: "en0", iface: "en0", model: "AirPort AX", ssid: "Studio-Mesh-5G", bssid: "🔒 [Protected / Masked]", mode: "station", channel: 36, frequency: 5180, type: "802.11ax", security: "WPA3", signalLevel: -48, quality: 92, txRate: 1200 }],
        fsOpenFiles: { max: 368640, allocated: 8420 + demoTick, available: 360220 - demoTick },
        blockDevices: [{ name: "/dev/disk0", identifier: "disk0", type: "disk", fsType: "APFS", mount: "/", size: 1000000000000, physical: "SSD", uuid: "🔒 [Protected / Masked]", label: "Studio HD", removable: false }],
        inetLatency: 14.2
      };

      const map = {
        version: staticSnap.version,
        system: staticSnap.system,
        bios: staticSnap.bios,
        baseboard: staticSnap.baseboard,
        chassis: staticSnap.chassis,
        uuid: staticSnap.uuid,
        pci: staticSnap.pci,
        thunderbolt: staticSnap.thunderbolt,
        osInfo: staticSnap.os,
        versions: staticSnap.versions,
        software: staticSnap.software,
        npm: [{ name: "systeminformation", version: "6.0.0-beta.26", path: "/Users/developer/workspace/node_modules/systeminformation" }],
        shell: "/bin/zsh",
        time: dynamicSnap.time,
        powerShellStart: { status: "No-op in demo environment", active: false, platform: "darwin" },
        powerShellRelease: { status: "No-op in demo environment", released: true, platform: "darwin" },
        cpu: staticSnap.cpu,
        npu: staticSnap.npu,
        cpuFlags: "aes sha1 sha256 neon fp16",
        cpuCache: staticSnap.cpu.cache,
        cpuCurrentSpeed: dynamicSnap.cpuCurrentSpeed,
        cpuTemperature: dynamicSnap.temp,
        fans: dynamicSnap.fans,
        currentLoad: dynamicSnap.currentLoad,
        fullLoad: loadVal,
        mem: dynamicSnap.mem,
        memLayout: staticSnap.memLayout,
        battery: dynamicSnap.battery,
        gpu: staticSnap.gpu,
        displays: staticSnap.displays,
        fsSize: dynamicSnap.fsSize,
        fsOpenFiles: dynamicSnap.fsOpenFiles,
        blockDevices: dynamicSnap.blockDevices,
        fsStats: dynamicSnap.fsStats,
        disksIO: dynamicSnap.disksIO,
        diskLayout: staticSnap.diskLayout,
        diskSpeed: { path: "/tmp/studio-bench", fs: "/dev/disk1s1", sizeMB: 16, writeSpeed: 4250.4, readSpeed: 5410.8, ms: 6 },
        networkInterfaceDefault: "en0",
        networkGatewayDefault: "192.168.1.*** (Masked)",
        networkInterfaces: staticSnap.net,
        networkStats: dynamicSnap.networkStats,
        networkRoutes: [{ destination: "0.0.0.0/0", gateway: "192.168.1.*** (Masked)", iface: "en0", metric: 100, family: "IPv4" }],
        networkConnections: dynamicSnap.networkConnections,
        inetChecksite: { url: param || "https://google.com", statusCode: 200, ok: true, message: "OK (Demo)", ms: 18 },
        inetLatency: dynamicSnap.inetLatency,
        inetPublicIp: { ip4: "203.0.113.*** (Masked)", ip6: "2001:db8::*** (Masked)", ms: 12 },
        inetSpeed: { server: "speed.cloudflare.com", downloadSpeed: 840.2, uploadSpeed: 185.4, downloadMB: 250.0, uploadMB: 50.0, ms: 1420 },
        wifiNetworks: dynamicSnap.wifiNetworks,
        wifiInterfaces: staticSnap.wifiInterfaces,
        wifiConnections: dynamicSnap.wifiConnections,
        processes: dynamicSnap.processes,
        processLoad: [{ proc: param || "bun", pid: 1001, pids: [1001], cpu: loadVal, mem: 2.4 }],
        processFocused: { pid: 1001, name: "System Studio Pro", path: "/Applications/BunRADStudio.app" },
        services: dynamicSnap.services,
        users: dynamicSnap.users,
        audio: staticSnap.audio,
        bluetoothDevices: staticSnap.bluetooth,
        printer: staticSnap.printer,
        usb: staticSnap.usb,
        serialPorts: staticSnap.serialPorts,
        camera: staticSnap.camera,
        keyboard: staticSnap.keyboard,
        mouse: staticSnap.mouse,
        dockerInfo: { containers: 2, containersRunning: 1, containersPaused: 0, containersStopped: 1, images: 3, serverVersion: "27.3.1", operatingSystem: "Docker Desktop" },
        dockerImages: [{ id: "sha256:demo001", repoTags: ["studio/worker:latest"], size: 145000000 }],
        dockerContainers: [{ id: "demo-c1", name: "studio-telemetry", image: "studio/worker:latest", state: "running", status: "Up 2 hours" }],
        dockerContainerStats: [{ id: "demo-c1", cpuPercent: 1.4, memUsage: 48000000, memLimit: 2147483648, memPercent: 2.2 }],
        dockerContainerProcesses: [{ pid: 1, user: "developer", command: "bun run server.ts" }],
        dockerVolumes: [{ name: "studio_cache", driver: "local", mountpoint: "/var/lib/docker/volumes/studio_cache/_data" }],
        dockerAll: [{ id: "demo-c1", name: "studio-telemetry", state: "running", cpuPercent: 1.4, memPercent: 2.2 }],
        vboxInfo: [],
        getStaticData: staticSnap,
        getDynamicData: dynamicSnap,
        getAllData: Object.assign({}, staticSnap, dynamicSnap),
        get: { cpu: { brand: staticSnap.cpu.brand, speed: staticSnap.cpu.speed }, mem: { total: memTotal, free: memTotal - memUsed } },
        observe: { currentLoad: { currentLoad: loadVal }, mem: { used: memUsed } }
      };

      return Object.prototype.hasOwnProperty.call(map, methodName) ? map[methodName] : staticSnap.system;
    }

    // ---------------------------------------------------------------------------------------------
    // Direct Native HTTP Client (Bypasses WebKit FFI Locks with 100% Reliability)
    // ---------------------------------------------------------------------------------------------
    async function apiRequest(endpoint, body) {
      const isDemo = window.location.protocol === "file:" || window.location.search.includes("demo=1");
      if (isDemo) {
        if (endpoint === "/api/kpis") {
          demoTick += 1;
          return {
            cpuCores: 12,
            cpuBrand: "Workstation Silicon",
            cpuSpeed: "3.5 GHz",
            cpuLoadPct: (8.4 + (demoTick % 5) * 1.1).toFixed(1),
            memUsedGb: "8.2",
            memTotalGb: "32.0",
            memPct: 26 + (demoTick % 3),
            netIface: "en0 (Protected)",
            netGateway: "192.168.1.*** (Masked)",
            hasBattery: true,
            batteryPct: 96,
            isCharging: true,
            osDistro: "Studio OS (arm64)"
          };
        }
        if (endpoint.startsWith("/api/execute")) {
          const qs = endpoint.split("?")[1] || "";
          const params = new URLSearchParams(qs);
          const mName = params.get("method") || "system";
          const mParam = params.get("param") || "";
          return {
            success: true,
            method: mName,
            elapsedMs: "1.4",
            data: buildDemoPayload(mName, mParam)
          };
        }
      }
      try {
        const opts = body 
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'GET' };
        const res = await fetch(endpoint, opts);
        if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
        const json = await res.json();
        if (IS_SCREENSHOT_MODE) {
          if (endpoint === "/api/kpis") {
            return Object.assign({}, json, {
              netIface: String(json.netIface || "en0").includes("Protected") ? json.netIface : (json.netIface + " (Protected)"),
              netGateway: "192.168.1.*** (Masked)"
            });
          }
          if (json && json.success && Object.prototype.hasOwnProperty.call(json, "data")) {
            const qs = endpoint.split("?")[1] || "";
            const mName = new URLSearchParams(qs).get("method") || json.method || "";
            json.data = maskTelemetryClient(json.data, mName, mName);
          }
        }
        return json;
      } catch (err) {
        console.error("API Request failed to " + endpoint + ":", err);
        return { success: false, error: err.message };
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Sidebar Rendering & Collapse/Expand Management
    // ---------------------------------------------------------------------------------------------
    const collapsedCategories = new Set();

    function toggleCategoryCollapse(cat, e) {
      if (e) e.stopPropagation();
      if (collapsedCategories.has(cat)) {
        collapsedCategories.delete(cat);
      } else {
        collapsedCategories.add(cat);
      }
      updateCollapseButtonLabel();
      renderSidebar();
    }

    function toggleAllCategories() {
      if (collapsedCategories.size > 0) {
        collapsedCategories.clear();
      } else {
        ALL_CATEGORIES.forEach(cat => collapsedCategories.add(cat));
      }
      updateCollapseButtonLabel();
      renderSidebar();
    }

    function updateCollapseButtonLabel() {
      const btn = document.getElementById("btnToggleAllCats");
      if (!btn) return;
      btn.textContent = collapsedCategories.size > 0 ? "📂 Expand All" : "📁 Collapse All";
    }

    function renderSidebar() {
      const container = document.getElementById("catListContainer");
      container.innerHTML = "";

      const query = (document.getElementById("searchApis").value || "").toLowerCase().trim();

      ALL_CATEGORIES.forEach(cat => {
        if (selectedCategoryFilter !== "ALL" && selectedCategoryFilter !== cat) {
          return;
        }

        let methodsInCat = ALL_METHODS.filter(m => m.category === cat);
        if (query) {
          methodsInCat = methodsInCat.filter(m => 
            m.name.toLowerCase().includes(query) || 
            m.description.toLowerCase().includes(query)
          );
          if (methodsInCat.length === 0) return;
        }

        const isCollapsed = query ? false : collapsedCategories.has(cat);
        const group = document.createElement("div");
        group.className = "cat-group";

        const header = document.createElement("div");
        header.className = "cat-header";
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        header.setAttribute("aria-expanded", String(!isCollapsed));
        header.title = (isCollapsed ? "Expand " : "Collapse ") + cat + " (Click arrow to toggle, or title to run first method)";
        header.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleCategoryCollapse(cat, e);
          }
        };
        
        const headerLeft = document.createElement("div");
        headerLeft.className = "cat-header-left";
        
        const arrow = document.createElement("span");
        arrow.className = "cat-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = isCollapsed ? "▶" : "▼";
        arrow.onclick = (e) => toggleCategoryCollapse(cat, e);
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "cat-header-title";
        titleSpan.textContent = cat;
        titleSpan.title = cat;
        titleSpan.onclick = () => {
          if (isCollapsed) {
            toggleCategoryCollapse(cat);
          } else if (methodsInCat.length > 0) {
            selectMethod(methodsInCat[0].name, true);
          }
        };

        headerLeft.appendChild(arrow);
        headerLeft.appendChild(titleSpan);

        const badge = document.createElement("span");
        badge.className = "cat-count-badge";
        badge.textContent = methodsInCat.length;
        badge.title = methodsInCat.length + " methods in " + cat;
        badge.onclick = (e) => toggleCategoryCollapse(cat, e);

        header.appendChild(headerLeft);
        header.appendChild(badge);
        group.appendChild(header);

        if (!isCollapsed) {
          const items = document.createElement("div");
          items.className = "method-items";

          methodsInCat.forEach(m => {
            const btn = document.createElement("div");
            const isAct = m.name === activeMethod;
            btn.className = "method-btn" + (isAct ? " active" : "");
            btn.id = "btn_m_" + m.name;
            btn.setAttribute("role", "button");
            btn.setAttribute("tabindex", "0");
            btn.setAttribute("aria-pressed", String(isAct));
            btn.title = m.name + "() - " + m.description;
            btn.innerHTML = \`<span class="method-name-text" title="\${escapeHtml(m.name)}()">\${escapeHtml(m.name)}</span><span style="font-size: 10px; color: var(--text-dim); flex-shrink: 0; margin-left: 6px;">\${m.acceptsParam ? '⚙️' : ''}</span>\`;
            btn.onclick = () => selectMethod(m.name, true);
            btn.onkeydown = (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectMethod(m.name, true);
              }
            };
            items.appendChild(btn);
          });

          group.appendChild(items);
        }

        container.appendChild(group);
      });
    }

    // ---------------------------------------------------------------------------------------------
    // Resizable Sidebar Controller
    // ---------------------------------------------------------------------------------------------
    function initSidebarResizer() {
      const aside = document.getElementById("mainSidebar");
      const resizer = document.getElementById("sidebarResizer");
      if (!aside || !resizer) return;

      const savedWidth = localStorage.getItem("system_studio_sidebar_width");
      if (savedWidth) {
        const w = parseInt(savedWidth, 10);
        if (w >= 280 && w <= 700) {
          aside.style.width = w + "px";
        }
      }

      let isResizing = false;
      let startX = 0;
      let startW = 0;

      resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        startX = e.clientX;
        startW = aside.getBoundingClientRect().width;
        resizer.classList.add("resizing");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
      });

      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        const newW = Math.max(280, Math.min(650, startW + delta));
        aside.style.width = newW + "px";
        localStorage.setItem("system_studio_sidebar_width", String(newW));
      });

      window.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove("resizing");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
      });

      resizer.addEventListener("dblclick", () => {
        toggleSidebarWidth();
      });

      // Mouse wheel horizontal scrolling on category filter bar
      const catBar = document.getElementById("catFilterBar");
      if (catBar) {
        catBar.addEventListener("wheel", (e) => {
          if (e.deltaY !== 0) {
            e.preventDefault();
            catBar.scrollLeft += e.deltaY;
          }
        }, { passive: false });
      }
    }

    function toggleSidebarWidth() {
      const aside = document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      const targetW = curW > 420 ? 380 : 520;
      aside.style.width = targetW + "px";
      localStorage.setItem("system_studio_sidebar_width", String(targetW));
    }

    function adjustSidebarWidth(delta) {
      const aside = document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      const targetW = Math.max(280, Math.min(650, curW + delta));
      aside.style.width = targetW + "px";
      localStorage.setItem("system_studio_sidebar_width", String(targetW));
    }

    function filterByCategory(cat) {
      selectedCategoryFilter = cat;
      document.querySelectorAll(".cat-pill-btn").forEach(btn => {
        const btnCat = btn.getAttribute("data-cat");
        const matches = btnCat ? btnCat === cat : (cat === "ALL" && btn.textContent.includes("All"));
        btn.classList.toggle("active", matches);
        btn.setAttribute("aria-pressed", String(matches));
      });
      renderSidebar();

      if (cat !== "ALL") {
        const first = ALL_METHODS.find(m => m.category === cat);
        if (first) {
          selectMethod(first.name, true);
        }
      }
    }

    function filterMethods(query) {
      renderSidebar();
    }

    let reqSequence = 0;

    async function selectMethod(methodName, autoRun = true) {
      activeMethod = methodName;
      const meta = ALL_METHODS.find(m => m.name === methodName);
      if (!meta) return;

      document.querySelectorAll(".method-btn").forEach(el => {
        el.classList.remove("active");
        el.setAttribute("aria-pressed", "false");
      });
      const targetBtn = document.getElementById("btn_m_" + methodName);
      if (targetBtn) {
        targetBtn.classList.add("active");
        targetBtn.setAttribute("aria-pressed", "true");
      }

      document.getElementById("activeMethodName").textContent = meta.name + "()";
      document.getElementById("activeCategoryTag").textContent = meta.category;
      document.getElementById("activeMethodDesc").textContent = meta.description;

      const paramRow = document.getElementById("paramRow");
      const paramInput = document.getElementById("paramInput");
      if (meta.acceptsParam) {
        paramRow.style.display = "flex";
        paramInput.placeholder = meta.paramPlaceholder || "Argument...";
        paramInput.value = meta.defaultParam || "";
      } else {
        paramRow.style.display = "none";
        paramInput.value = "";
      }

      if (autoRun) {
        await runCurrentMethod();
      }
    }

    function switchTab(tab) {
      currentTab = tab;
      const tabs = ["visual", "json", "console"];
      tabs.forEach(t => {
        const btn = document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1));
        const active = t === tab;
        if (btn) {
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-selected", String(active));
          btn.setAttribute("tabindex", active ? "0" : "-1");
        }
      });

      document.getElementById("viewVisual").style.display = tab === "visual" ? "block" : "none";
      document.getElementById("viewJson").style.display = tab === "json" ? "block" : "none";
      document.getElementById("viewConsole").style.display = tab === "console" ? "block" : "none";
    }

    function handleTabKey(e, tab) {
      const order = ["visual", "json", "console"];
      const idx = order.indexOf(tab);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = order[(idx + 1) % order.length];
        switchTab(next);
        document.getElementById("tab" + next.charAt(0).toUpperCase() + next.slice(1))?.focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = order[(idx - 1 + order.length) % order.length];
        switchTab(prev);
        document.getElementById("tab" + prev.charAt(0).toUpperCase() + prev.slice(1))?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchTab(tab);
      }
    }

    function setExecuting(isExecuting, label) {
      const bar = document.getElementById("loadingBar");
      const btn = document.getElementById("btnExecute");
      if (isExecuting) {
        bar.classList.add("active");
        btn.disabled = true;
        btn.textContent = "⏳ " + (label || "Querying...");
      } else {
        bar.classList.remove("active");
        btn.disabled = false;
        btn.textContent = "🚀 Run Method";
      }
    }

    function escapeHtml(value) {
      return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function logToConsole(msg, type = "info") {
      const box = document.getElementById("consoleBox");
      const line = document.createElement("div");
      line.className = "log-line";
      const time = new Date().toLocaleTimeString();
      const colorClass = type === "ok" ? "log-ok" : (type === "err" ? "log-err" : "log-info");
      line.innerHTML = \`<span class="log-time">[\${time}]</span> <span class="\${colorClass}">\${escapeHtml(msg)}</span>\`;
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }

    function showToast(msg) {
      const box = document.getElementById("toastBox");
      box.textContent = msg;
      box.classList.add("show");
      setTimeout(() => box.classList.remove("show"), 2500);
    }

    function syntaxHighlight(json) {
      if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
      }
      if (json === undefined || json === null) {
        json = "null";
      }
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'json-num';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-str';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-bool';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });
    }

    function formatSafeValue(v) {
      if (v === null || v === undefined) return "N/A";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
      if (typeof v === "boolean") return String(v);
      if (typeof v === "string") return v === "" ? "(empty)" : v;
      if (Array.isArray(v)) {
        if (v.length === 0) return "[]";
        if (v.every(x => typeof x !== "object" || x === null)) {
          return v.join(", ");
        }
        return v.length + " item" + (v.length === 1 ? "" : "s");
      }
      try {
        const s = JSON.stringify(v);
        return s.length > 90 ? s.slice(0, 87) + "..." : s;
      } catch (e) {
        return String(v);
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Comprehensive Human-Readable Hardware Audit Report Visualizer (getStaticData & getAllData)
    // ---------------------------------------------------------------------------------------------
    function renderHardwareAuditDashboard(methodName, data, container) {
      const isFullAudit = methodName === "getAllData";
      const sys = data.system || {};
      const cpu = data.cpu || {};
      const osData = data.os || {};
      const memLayout = Array.isArray(data.memLayout) ? data.memLayout : [];
      const totalMemBytes = memLayout.reduce((acc, m) => acc + (Number(m.size) || 0), 0) || (Number(data.mem?.total) || 0);
      const totalMemGb = totalMemBytes > 0 ? (totalMemBytes / (1024 ** 3)).toFixed(1) : "N/A";
      const memType = memLayout[0]?.type || "N/A";
      const memMfr = memLayout[0]?.manufacturer || "N/A";

      const gpus = Array.isArray(data.gpu)
        ? data.gpu
        : data.graphics?.controllers && Array.isArray(data.graphics.controllers)
          ? data.graphics.controllers
          : [];
      const mainGpu = gpus[0] || {};
      const displays = Array.isArray(data.displays)
        ? data.displays
        : data.graphics?.displays && Array.isArray(data.graphics.displays)
          ? data.graphics.displays
          : [];
      const mainDisp = displays.find(d => d.main) || displays[0] || {};
      const dispRes = mainDisp.resolutionX && mainDisp.resolutionY
        ? \` (\${mainDisp.resolutionX}×\${mainDisp.resolutionY}\${mainDisp.currentRefreshRate ? ' @' + mainDisp.currentRefreshRate + 'Hz' : ''})\`
        : "";
      const dispDesc = mainDisp.model ? \`\${mainDisp.model}\${dispRes}\` : (dispRes ? \`Display\${dispRes}\` : "N/A");

      const disks = Array.isArray(data.diskLayout) ? data.diskLayout : [];
      const mainDisk = disks[0] || {};
      const diskGb = Number(mainDisk.size) > 0 ? (Number(mainDisk.size) / (1024 ** 3)).toFixed(0) + " GB" : "N/A";

      const nets = Array.isArray(data.net) ? data.net : [];
      const activeNets = nets.filter(n => n.ip4 && n.ip4 !== "127.0.0.1" && !n.internal);

      const audios = Array.isArray(data.audio) ? data.audio : [];
      const bts = Array.isArray(data.bluetooth) ? data.bluetooth : [];
      const versions = data.versions || {};

      // 1. Hero Summary Banner Card
      const hero = document.createElement("div");
      hero.className = "data-card audit-hero-card";

      const badgeLabel = isFullAudit ? "⚡ Full Live System Audit" : "🏛️ Comprehensive Static Hardware Audit";
      const cpuBrand = ((cpu.manufacturer ? cpu.manufacturer + ' ' : '') + (cpu.brand || '')).trim() || 'Processor';
      const serialStr = sys.serial || 'N/A';
      const uuidStr = sys.uuid || data.uuid?.os || 'N/A';
      const sysTitle = ((sys.manufacturer || '') + ' ' + (sys.model || '')).trim() || 'System Workstation';

      hero.innerHTML = \`
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span style="font-size: 24px;" aria-hidden="true">💻</span>
              <span class="audit-hero-title">\${escapeHtml(sysTitle)}</span>
              <span style="font-size: 11px; background: rgba(56, 189, 248, 0.18); color: var(--cyan); border: 1px solid rgba(56, 189, 248, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 700;">
                \${escapeHtml(badgeLabel)}
              </span>
            </div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono); word-break: break-word;">
              Hardware Serial: <span style="color: var(--text-main); font-weight: 600;">\${escapeHtml(serialStr)}</span> • 
              Hardware UUID: <span style="color: var(--text-main); font-weight: 600;">\${escapeHtml(uuidStr)}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="audit-hero-tag">
              OS: <strong>\${escapeHtml(osData.distro || osData.platform || 'Unknown')} (\${escapeHtml(osData.arch || 'N/A')})</strong>
            </span>
            <span class="audit-hero-tag">
              Kernel: <strong>\${escapeHtml(osData.kernel || osData.release || 'N/A')}</strong>
            </span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 16px;">
          <div class="audit-metric-box">
            <div style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Processor</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--cyan); margin-top: 3px;">\${escapeHtml(cpuBrand)}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">\${escapeHtml(cpu.cores ?? 'N/A')} Cores\${cpu.speed ? ' @ ' + escapeHtml(cpu.speed) + ' GHz' : ''}</div>
          </div>

          <div class="audit-metric-box">
            <div style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Installed Memory</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--purple); margin-top: 3px;">\${totalMemGb === 'N/A' ? 'N/A' : escapeHtml(totalMemGb + ' GB' + (memType !== 'N/A' ? ' ' + memType : ''))}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">\${escapeHtml(memMfr)}</div>
          </div>

          <div class="audit-metric-box">
            <div style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Display & GPU</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--emerald); margin-top: 3px;">\${escapeHtml(dispDesc)}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">\${escapeHtml(mainGpu.model || 'N/A')}\${mainGpu.cores ? ' (' + escapeHtml(mainGpu.cores) + ' Cores)' : ''}</div>
          </div>

          <div class="audit-metric-box">
            <div style="font-size: 10px; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">Primary Storage</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--amber); margin-top: 3px;">\${escapeHtml(diskGb)}\${mainDisk.type ? ' ' + escapeHtml(mainDisk.type) : ''}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">\${escapeHtml(mainDisk.name || 'N/A')} • SMART: \${escapeHtml(mainDisk.smartStatus || 'N/A')}</div>
          </div>
        </div>
      \`;
      container.appendChild(hero);

      // Helper function to append structured domain cards
      function addCard(title, icon, rows) {
        const c = document.createElement("div");
        c.className = "data-card";
        let kvHtml = "";
        rows.forEach(([k, v, color]) => {
          if (v === null || v === undefined || v === "") return;
          const style = color ? \` style="color: \${color}; font-weight: 600;"\` : "";
          kvHtml += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(k)}:</span><span class="kv-v"\${style}>\${escapeHtml(v)}</span></div>\`;
        });
        c.innerHTML = \`<div class="data-card-header"><span style="display: flex; align-items: center; gap: 6px;"><span aria-hidden="true">\${icon}</span><span>\${escapeHtml(title)}</span></span></div><div class="kv-list">\${kvHtml}</div>\`;
        container.appendChild(c);
      }

      // Domain 1: System & Baseboard Architecture
      addCard("System & Chassis Architecture", "🖥️", [
        ["Hardware Manufacturer", sys.manufacturer || "N/A"],
        ["System Model", sys.model || "N/A"],
        ["SKU / Board Number", sys.sku || data.baseboard?.model || "N/A"],
        ["Chassis Form Factor", sys.type || data.chassis?.type || "N/A"],
        ["BIOS/EFI Vendor", data.bios?.vendor || "N/A"],
        ["BIOS/EFI Revision", data.bios?.version || data.bios?.revision || "N/A"],
        ["OS Distribution", ((osData.distro || osData.platform || 'N/A') + ' ' + (osData.release || '')).trim()],
        ["Architecture", osData.arch || "N/A"],
      ]);

      // Domain 2: CPU Processor Architecture
      addCard("CPU Processor Architecture", "⚡", [
        ["Processor Model", cpuBrand, "var(--cyan)"],
        ["Total Physical / Logical Cores", cpu.cores ? (cpu.cores + " Cores") : "N/A", "var(--text-main)"],
        ["Performance / Efficiency Cores", cpu.performanceCores ? (cpu.performanceCores + " P-Cores / " + (cpu.efficiencyCores || 0) + " E-Cores") : "Symmetric"],
        ["Base Clock Speed", cpu.speed ? (cpu.speed + " GHz") : "N/A"],
        ["Socket & Packaging", cpu.socket || "N/A"],
        ["Instruction Set", osData.arch === "arm64" ? "ARMv8/v9 (AArch64 64-bit)" : (osData.arch || "N/A")],
        ["Virtualization Support", sys.virtual ? "Virtual Guest" : "Hardware Supported (Native)"],
      ]);

      // Domain 3: Memory (RAM) Subsystem
      addCard("Unified Memory Hierarchy", "💾", [
        ["Installed RAM Capacity", totalMemGb === "N/A" ? "N/A" : totalMemGb + " GB", "var(--purple)"],
        ["Memory Technology", memType],
        ["Module Manufacturer", memMfr],
        ["RAM Modules Detected", memLayout.length + " Module(s)"],
        ["Form Factor", memLayout[0]?.formFactor || "N/A"],
        ["Error Correction (ECC)", memLayout[0]?.ecc ? "ECC Enabled" : "Non-ECC"],
      ]);

      // Domain 4: Graphics & Display Engines
      addCard("Graphics & Display Subsystem", "🎨", [
        ["Graphics Controller", mainGpu.model || "N/A", "var(--emerald)"],
        ["GPU Core Count", mainGpu.cores ? (mainGpu.cores + " Cores") : "Integrated / Shared"],
        ["VRAM Allocation", mainGpu.vram ? (mainGpu.vram + " MB") : "Unified System Memory"],
        ["Primary Display", mainDisp.model || "N/A"],
        ["Native Resolution", mainDisp.resolutionX ? (mainDisp.resolutionX + " × " + mainDisp.resolutionY + " px") : "N/A"],
        ["Refresh Rate", mainDisp.currentRefreshRate ? (mainDisp.currentRefreshRate + " Hz") : "N/A"],
        ["Connection Type", mainDisp.connection || "N/A"],
      ]);

      // Domain 5: Storage & Physical Disks
      addCard("Storage Disks & Partitions", "💽", [
        ["Primary Drive Name", mainDisk.name || "N/A", "var(--amber)"],
        ["Storage Capacity", diskGb, "var(--text-main)"],
        ["Drive Interface", mainDisk.type ? (mainDisk.type + (mainDisk.interfaceType ? " (" + mainDisk.interfaceType + ")" : "")) : "N/A"],
        ["Drive Vendor", mainDisk.vendor || "N/A"],
        ["SMART Health Status", mainDisk.smartStatus ? ("● " + mainDisk.smartStatus) : "N/A", "var(--emerald)"],
        ["Total Physical Drives", disks.length + " Drive(s)"],
      ]);

      // Domain 6: Network Connectivity
      const netNames = activeNets.map(n => n.iface + " (" + n.ip4 + ")").join(', ') || (nets[0] ? nets[0].iface : "No active adapters");
      addCard("Network Connectivity & Interfaces", "🌐", [
        ["Active Network Adapters", netNames, "var(--cyan)"],
        ["Total Interfaces Detected", nets.length + " interfaces"],
        ["Primary Interface MAC", activeNets[0]?.mac || nets[0]?.mac || "N/A"],
      ]);

      // Domain 7: Audio & Sound Hardware
      const audioListStr = audios.map(a => (a.out ? '🔊' : '🎤') + ' ' + (a.name || 'Audio Device')).slice(0, 3).join(' • ') || "No audio devices reported";
      addCard("Audio & Sound Hardware", "🔊", [
        ["Audio Devices", audioListStr],
        ["Total Controllers", audios.length + " sound devices detected"],
      ]);

      // Domain 8: Bluetooth Peripherals
      const btConnected = bts.filter(b => b.connected && b.name);
      const btListStr = btConnected.length > 0
        ? btConnected.map(b => '📶 ' + b.name + ' (Connected)').join(' • ')
        : (bts[0]?.name ? ('📶 ' + bts[0].name + ' (Paired)') : "No Bluetooth devices connected");
      addCard("Bluetooth & Peripheral Bus", "📶", [
        ["Connected Devices", btListStr, "var(--emerald)"],
        ["Total Paired Hardware", bts.length + " devices in registry"],
      ]);

      // Domain 9: Installed Software Runtime Environments
      addCard("Runtime Environments & SDKs", "📦", [
        ["Bun JavaScript Runtime", "v" + STUDIO_BUN_VERSION, "var(--cyan)"],
        ["Node.js Engine", versions.node ? ("v" + versions.node) : "N/A"],
        ["V8 JavaScript Engine", versions.v8 ? ("v" + versions.v8) : "N/A"],
        ["Git Version", versions.git ? ("v" + versions.git) : "N/A"],
        ["System Kernel", osData.kernel || "N/A"],
      ]);

      // Domain 10: Dynamic Live Telemetry (If Full System Audit - getAllData)
      if (isFullAudit) {
        const primaryBat = Array.isArray(data.battery) ? data.battery[0] : data.battery;
        const loadPct = typeof data.currentLoad?.currentLoad === "number" && Number.isFinite(data.currentLoad.currentLoad)
          ? data.currentLoad.currentLoad.toFixed(1) + "%"
          : "Active";
        const loadUser = typeof data.currentLoad?.currentLoadUser === "number" ? data.currentLoad.currentLoadUser.toFixed(1) : "0.0";
        const loadSys = typeof data.currentLoad?.currentLoadSystem === "number" ? data.currentLoad.currentLoadSystem.toFixed(1) : "0.0";
        addCard("Real-Time Telemetry & Performance", "📈", [
          ["Current CPU Load", loadPct, "var(--cyan)"],
          ["CPU User / System", data.currentLoad ? (loadUser + "% User • " + loadSys + "% Sys") : "Telemetry Active"],
          ["Memory Allocation", data.mem && data.mem.total ? (((data.mem.used || 0) / (1024**3)).toFixed(1) + " / " + ((data.mem.total / (1024**3)).toFixed(1)) + " GB") : "N/A", "var(--purple)"],
          ["Battery Health & Status", primaryBat ? ((primaryBat.percent ?? 100) + "% (" + (primaryBat.isCharging ? 'Charging' : 'AC Connected') + ")") : "AC Connected", "var(--amber)"],
          ["Active Processes", data.processes ? (data.processes.all + " Total (" + data.processes.running + " Running)") : "Monitor Active"],
        ]);
      }
    }

    function renderVisualData(methodName, data) {
      const container = document.getElementById("visualContainer");
      container.innerHTML = "";

      if (data === null || data === undefined) {
        container.innerHTML = '<div class="data-card"><div class="data-card-header">Status</div><div>No data returned or subsystem offline.</div></div>';
        return;
      }

      if (methodName === "processes" && data.list && Array.isArray(data.list)) {
        const card = document.createElement("div");
        card.style.gridColumn = "1 / -1";
        card.className = "data-card";
        const rowsHtml = data.list.length === 0
          ? '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">No processes reported</td></tr>'
          : data.list.slice(0, 60).map(p => {
              const cpuVal = Number(p.cpu);
              const memVal = Number(p.mem);
              const cpuStr = Number.isFinite(cpuVal) ? cpuVal.toFixed(1) : "0.0";
              const memStr = Number.isFinite(memVal) ? memVal.toFixed(1) : "0.0";
              return \`
                  <tr>
                    <td>\${escapeHtml(p.pid ?? '')}</td>
                    <td style="color: var(--cyan); font-weight: 600;">\${escapeHtml(p.name || 'process')}</td>
                    <td>\${escapeHtml(cpuStr)}%</td>
                    <td>\${escapeHtml(memStr)}%</td>
                    <td>\${escapeHtml(p.user || 'system')}</td>
                    <td>\${escapeHtml(p.state || 'running')}</td>
                  </tr>
                \`;
            }).join('');
        card.innerHTML = \`
          <div class="data-card-header">
            <span>Process Monitor (\${escapeHtml(data.all ?? data.list.length)} Total • \${escapeHtml(data.running ?? 0)} Running)</span>
            <span>CPU & Memory Breakdown</span>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>Process Name</th>
                  <th>CPU %</th>
                  <th>Mem %</th>
                  <th>User</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>\${rowsHtml}</tbody>
            </table>
          </div>
        \`;
        container.appendChild(card);
        return;
      }

      if (methodName === "audio" && Array.isArray(data)) {
        if (data.length === 0) {
          container.innerHTML = '<div class="data-card"><div class="data-card-header">Audio Controllers</div><div>No audio hardware or soundcards detected.</div></div>';
          return;
        }

        data.forEach((dev) => {
          const card = document.createElement("div");
          card.className = "data-card";
          const icon = dev.out ? "🔊" : (dev.in ? "🎤" : "🎧");
          const role = dev.in && dev.out ? "Input / Output" : (dev.in ? "Microphone (Input)" : "Speakers / Headphones (Output)");
          const isDef = dev.default ? '<span style="font-size: 10px; background: rgba(16, 185, 129, 0.2); color: var(--emerald); border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 6px; border-radius: 4px; font-weight: 600;">★ Default Device</span>' : '';
          const stColor = dev.status === "online" ? "var(--emerald)" : "var(--text-dim)";

          card.innerHTML = \`
            <div class="data-card-header">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;" aria-hidden="true">\${icon}</span>
                <span style="color: var(--text-main); font-weight: 700;">\${escapeHtml(dev.name || 'Audio Controller')}</span>
              </span>
              \${isDef}
            </div>
            <div class="kv-list">
              <div class="kv-item"><span class="kv-k">Role:</span><span class="kv-v" style="color: var(--cyan); font-weight: 600;">\${escapeHtml(role)}</span></div>
              <div class="kv-item"><span class="kv-k">Manufacturer:</span><span class="kv-v">\${escapeHtml(dev.manufacturer || 'System')}</span></div>
              <div class="kv-item"><span class="kv-k">Channel:</span><span class="kv-v">\${escapeHtml(dev.channel || 'Standard')}</span></div>
              <div class="kv-item"><span class="kv-k">Type:</span><span class="kv-v">\${escapeHtml(dev.type || 'Sound Controller')}</span></div>
              <div class="kv-item"><span class="kv-k">Status:</span><span class="kv-v" style="color: \${stColor}; font-weight: 700;">● \${escapeHtml(dev.status || 'Active')}</span></div>
            </div>
          \`;
          container.appendChild(card);
        });
        return;
      }

      if (methodName === "bluetoothDevices" && Array.isArray(data)) {
        if (data.length === 0) {
          container.innerHTML = '<div class="data-card"><div class="data-card-header">Bluetooth Subsystem</div><div>No paired or active Bluetooth devices found.</div></div>';
          return;
        }

        data.forEach((dev) => {
          const card = document.createElement("div");
          card.className = "data-card";
          const icon = (dev.type && dev.type.toLowerCase().includes("head")) ? "🎧" : (dev.type && dev.type.toLowerCase().includes("mouse") ? "🖱️" : "📶");
          const isConn = dev.connected ? '<span style="font-size: 10px; background: rgba(16, 185, 129, 0.2); color: var(--emerald); border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 6px; border-radius: 4px; font-weight: 600;">● Connected</span>' : '<span style="font-size: 10px; color: var(--text-dim);">Paired</span>';

          card.innerHTML = \`
            <div class="data-card-header">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;" aria-hidden="true">\${icon}</span>
                <span style="color: var(--text-main); font-weight: 700;">\${escapeHtml(dev.name || 'Bluetooth Peripheral')}</span>
              </span>
              \${isConn}
            </div>
            <div class="kv-list">
              <div class="kv-item"><span class="kv-k">Device Type:</span><span class="kv-v" style="color: var(--cyan); font-weight: 600;">\${escapeHtml(dev.type || 'Peripheral')}</span></div>
              <div class="kv-item"><span class="kv-k">Manufacturer:</span><span class="kv-v">\${escapeHtml(dev.manufacturer || 'Unknown')}</span></div>
              <div class="kv-item"><span class="kv-k">Device MAC:</span><span class="kv-v" style="font-family: var(--font-mono); font-size: 10px;">\${escapeHtml(dev.macDevice || 'N/A')}</span></div>
              \${typeof dev.batteryPercent === "number" && dev.batteryPercent >= 0 ? \`<div class="kv-item"><span class="kv-k">Battery:</span><span class="kv-v" style="color: var(--emerald); font-weight: 700;">\${escapeHtml(dev.batteryPercent)}%</span></div>\` : ''}
            </div>
          \`;
          container.appendChild(card);
        });
        return;
      }

      // -------------------------------------------------------------------------------------------
      // Dedicated Human-Readable Hardware Audit Dashboard (getStaticData, getAllData, full audit)
      // -------------------------------------------------------------------------------------------
      if (methodName === "getStaticData" || methodName === "getAllData" || (data && typeof data === "object" && data.system && data.cpu && (data.gpu || data.graphics))) {
        renderHardwareAuditDashboard(methodName, data, container);
        return;
      }

      if (Array.isArray(data)) {
        if (data.length === 0) {
          container.innerHTML = '<div class="data-card"><div class="data-card-header">Results</div><div>Empty list / 0 entries found.</div></div>';
          return;
        }

        const MAX_ARRAY_CARDS = 100;
        const slice = data.slice(0, MAX_ARRAY_CARDS);
        slice.forEach((item, idx) => {
          const card = document.createElement("div");
          card.className = "data-card";
          const title = (item && typeof item === "object")
            ? (item.name || item.model || item.ssid || (Array.isArray(item.repoTags) ? item.repoTags[0] : "") || item.fs || item.device || item.iface || item.destination || item.bank || item.displayId || item.vendor || item.type || (\`Entry #\${idx + 1}\`))
            : (\`Entry #\${idx + 1}\`);
          
          let kvHtml = "";
          if (item && typeof item === "object") {
            Object.entries(item).forEach(([k, v]) => {
              if (v === null || v === undefined) return;
              const valStr = formatSafeValue(v);
              kvHtml += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(k)}:</span><span class="kv-v">\${escapeHtml(valStr)}</span></div>\`;
            });
            if (!kvHtml) {
              kvHtml = '<div class="kv-item"><span class="kv-v" style="color: var(--text-dim);">(No populated fields)</span></div>';
            }
          } else {
            kvHtml = \`<div class="kv-item"><span class="kv-v">\${escapeHtml(formatSafeValue(item))}</span></div>\`;
          }

          card.innerHTML = \`<div class="data-card-header"><span>\${escapeHtml(title)}</span><span>#\${idx + 1}</span></div><div class="kv-list">\${kvHtml}</div>\`;
          container.appendChild(card);
        });

        if (data.length > MAX_ARRAY_CARDS) {
          const notice = document.createElement("div");
          notice.className = "data-card";
          notice.style.gridColumn = "1 / -1";
          notice.innerHTML = \`<div class="data-card-header"><span>Summary</span><span>\${escapeHtml(data.length)} total entries</span></div><div>Showing first \${MAX_ARRAY_CARDS} of \${escapeHtml(data.length)} entries. Open the Raw JSON Inspector tab to inspect all items.</div>\`;
          container.appendChild(notice);
        }
        return;
      }

      if (typeof data === "object") {
        const entries = Object.entries(data);
        if (entries.length === 0) {
          container.innerHTML = \`<div class="data-card"><div class="data-card-header">\${escapeHtml(methodName)}</div><div>Empty object / subsystem inactive.</div></div>\`;
          return;
        }

        const mainCard = document.createElement("div");
        mainCard.className = "data-card";
        let kvHtml = "";

        const friendlyTitle = methodName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        entries.forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          
          if (Array.isArray(v)) {
            const countStr = \`<span style="color: var(--cyan); font-weight: 600;">\${v.length} item\${v.length === 1 ? '' : 's'}</span>\`;
            kvHtml += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(k)}:</span><span class="kv-v">\${countStr}</span></div>\`;

            if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
              v.slice(0, 8).forEach((item, idx) => {
                const subCard = document.createElement("div");
                subCard.className = "data-card";
                const subTitle = item.name || item.model || item.ssid || item.device || item.iface || item.vendor || (\`\${k} #\${idx + 1}\`);
                let subKv = "";
                Object.entries(item).forEach(([ik, iv]) => {
                  if (iv === null || iv === undefined) return;
                  const ivStr = formatSafeValue(iv);
                  subKv += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(ik)}:</span><span class="kv-v">\${escapeHtml(ivStr)}</span></div>\`;
                });
                subCard.innerHTML = \`<div class="data-card-header"><span>\${escapeHtml(subTitle)}</span><span>\${escapeHtml(k)} #\${idx + 1}</span></div><div class="kv-list">\${subKv}</div>\`;
                container.appendChild(subCard);
              });
            }
          } else if (typeof v === "object") {
            const nestedCard = document.createElement("div");
            nestedCard.className = "data-card";
            let nestedKv = "";
            Object.entries(v).forEach(([nk, nv]) => {
              if (nv === null || nv === undefined) return;
              const nvStr = formatSafeValue(nv);
              nestedKv += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(nk)}:</span><span class="kv-v">\${escapeHtml(nvStr)}</span></div>\`;
            });
            if (!nestedKv) {
              nestedKv = '<div class="kv-item"><span class="kv-v" style="color: var(--text-dim);">(Empty)</span></div>';
            }
            nestedCard.innerHTML = \`<div class="data-card-header"><span>\${escapeHtml(k)}</span></div><div class="kv-list">\${nestedKv}</div>\`;
            container.appendChild(nestedCard);
          } else {
            kvHtml += \`<div class="kv-item"><span class="kv-k">\${escapeHtml(k)}:</span><span class="kv-v">\${escapeHtml(formatSafeValue(v))}</span></div>\`;
          }
        });

        if (kvHtml) {
          mainCard.innerHTML = \`<div class="data-card-header"><span>\${escapeHtml(friendlyTitle)} Overview</span></div><div class="kv-list">\${kvHtml}</div>\`;
          container.prepend(mainCard);
        }
        return;
      }

      const displayScalar = data === "" ? "(Empty / none reported)" : String(data);
      container.innerHTML = \`<div class="data-card"><div class="data-card-header">Value</div><div style="font-size: 16px; font-weight: 700; color: var(--cyan); word-break: break-word;">\${escapeHtml(displayScalar)}</div></div>\`;
    }

    async function runCurrentMethod() {
      const meta = ALL_METHODS.find(m => m.name === activeMethod);
      if (!meta) return;

      const reqId = ++reqSequence;
      const param = meta.acceptsParam ? document.getElementById("paramInput").value : "";
      setExecuting(true, meta.name);
      logToConsole("Executing " + meta.name + (param ? " ('" + param + "')" : "") + "...", "info");

      try {
        const url = '/api/execute?method=' + encodeURIComponent(meta.name) + (param ? '&param=' + encodeURIComponent(param) : '');
        const res = await apiRequest(url);

        if (reqId !== reqSequence) return;

        if (res && res.success) {
          activeResult = res;
          document.getElementById("executionTimer").textContent = "Executed in " + res.elapsedMs + " ms";
          logToConsole("✓ " + meta.name + " completed in " + res.elapsedMs + "ms", "ok");

          renderVisualData(meta.name, res.data);
          document.getElementById("jsonInspector").innerHTML = syntaxHighlight(res.data);
          showToast(meta.name + " (" + res.elapsedMs + "ms)");
        } else {
          const errMsg = res ? res.error : "Unknown error";
          document.getElementById("executionTimer").textContent = "Failed";
          logToConsole("✗ " + meta.name + " error: " + errMsg, "err");
          document.getElementById("jsonInspector").innerHTML = syntaxHighlight({ error: errMsg, method: meta.name });
          showToast("Error: " + errMsg);
        }
      } catch (err) {
        if (reqId === reqSequence) {
          logToConsole("Error executing " + meta.name + ": " + err.message, "err");
        }
      } finally {
        if (reqId === reqSequence) {
          setExecuting(false);
        }
      }
    }

    async function runCurrentCategory() {
      const meta = ALL_METHODS.find(m => m.name === activeMethod);
      const cat = meta ? meta.category : "Hardware & Baseboard";
      const methodsInCat = ALL_METHODS.filter(m => m.category === cat);
      const reqId = ++reqSequence;

      setExecuting(true, "Batch: " + cat);
      logToConsole("Starting batch execution for category: " + cat, "info");

      const aggregated = {};
      const t0 = performance.now();

      try {
        for (const m of methodsInCat) {
          if (reqId !== reqSequence) return;
          try {
            const url = '/api/execute?method=' + encodeURIComponent(m.name) + (m.defaultParam ? '&param=' + encodeURIComponent(m.defaultParam) : '');
            const res = await apiRequest(url);
            if (reqId !== reqSequence) return;
            aggregated[m.name] = res.success ? res.data : { error: res.error };
            logToConsole("  ✓ " + m.name + " (" + (res.elapsedMs || 0) + "ms)", res.success ? "ok" : "err");
          } catch (e) {
            aggregated[m.name] = { error: e.message };
          }
        }

        if (reqId !== reqSequence) return;
        const elapsed = (performance.now() - t0).toFixed(1);
        activeResult = { method: cat + "_batch", data: aggregated, elapsedMs: elapsed };
        document.getElementById("executionTimer").textContent = "Batch completed in " + elapsed + " ms";
        renderVisualData(cat, aggregated);
        document.getElementById("jsonInspector").innerHTML = syntaxHighlight(aggregated);
        showToast("Category " + cat + " completed (" + elapsed + "ms)");
      } catch (err) {
        if (reqId === reqSequence) {
          logToConsole("Error executing batch " + cat + ": " + err.message, "err");
        }
      } finally {
        if (reqId === reqSequence) {
          setExecuting(false);
        }
      }
    }

    async function triggerPreset(presetName) {
      await selectMethod(presetName, true);
    }

    function toggleLiveObserve() {
      const btn = document.getElementById("btnLiveObserve");
      if (!liveObserverTimer) {
        btn.textContent = "⏹️ Stop Stream";
        btn.classList.add("btn-primary");
        showToast("Live 1s observer streaming started");
        logToConsole("Live telemetry stream started (1s interval)", "ok");

        liveObserverTimer = setInterval(async () => {
          await refreshKpiCards();
        }, 1000);
      } else {
        clearInterval(liveObserverTimer);
        liveObserverTimer = null;
        btn.textContent = "⏱️ Live Stream (1s)";
        btn.classList.remove("btn-primary");
        showToast("Live streaming stopped");
        logToConsole("Live telemetry stream stopped", "info");
      }
    }

    async function copyCurrentJson() {
      if (!activeResult || activeResult.data === undefined) {
        showToast("No query results to copy yet!");
        return;
      }
      const jsonStr = JSON.stringify(activeResult.data, null, 2);
      await apiRequest('/api/clipboard', { text: jsonStr });
      showToast("JSON payload copied to clipboard!");
      logToConsole("JSON payload copied to clipboard", "ok");
    }

    async function exportCurrentReport() {
      if (!activeResult || activeResult.data === undefined) {
        showToast("Run an API query first before exporting!");
        return;
      }
      const jsonStr = JSON.stringify(activeResult.data, null, 2);
      const res = await apiRequest('/api/export', { method: activeMethod, jsonStr });
      if (res && res.success) {
        showToast("Report saved: " + res.filename);
        logToConsole("Report exported successfully to: " + res.path, "ok");
      } else {
        showToast("Export failed: " + (res?.error || "Unknown"));
      }
    }

    function clearResults() {
      activeResult = null;
      document.getElementById("visualContainer").innerHTML = "";
      document.getElementById("jsonInspector").innerHTML = '{\\n  "status": "cleared"\\n}';
      const cnt = document.getElementById("jsonSearchCount");
      if (cnt) cnt.textContent = "";
      document.getElementById("executionTimer").textContent = "Cleared";
      showToast("Output cleared");
    }

    async function refreshKpiCards() {
      try {
        const kpis = await apiRequest('/api/kpis');
        if (!kpis || !kpis.cpuCores) return;

        const loadNum = Number(kpis.cpuLoadPct);
        const safeLoad = Number.isFinite(loadNum) ? Math.min(Math.max(loadNum, 0), 100) : 0;
        const memNum = Number(kpis.memPct);
        const safeMem = Number.isFinite(memNum) ? Math.min(Math.max(memNum, 0), 100) : 0;
        const batNum = Number(kpis.batteryPct);
        const safeBat = Number.isFinite(batNum) ? Math.min(Math.max(batNum, 0), 100) : 100;

        document.getElementById("kpiCpuValue").textContent = kpis.cpuCores + " Cores";
        document.getElementById("kpiCpuSub").textContent = kpis.cpuBrand + " @ " + kpis.cpuSpeed;

        document.getElementById("kpiLoadValue").textContent = safeLoad.toFixed(1) + "%";
        document.getElementById("kpiLoadBadge").textContent = safeLoad.toFixed(1) + "%";
        document.getElementById("kpiLoadBar").style.width = safeLoad + "%";

        document.getElementById("kpiMemValue").textContent = kpis.memUsedGb + " / " + kpis.memTotalGb + " GB";
        document.getElementById("kpiMemPct").textContent = safeMem + "%";
        document.getElementById("kpiMemBar").style.width = safeMem + "%";

        document.getElementById("kpiNetValue").textContent = kpis.netIface;
        document.getElementById("kpiNetSub").textContent = "GW: " + kpis.netGateway;

        const pText = kpis.hasBattery
          ? safeBat + "% (" + (kpis.isCharging ? "Charging" : "Discharging") + ")"
          : "AC Powered (Desktop)";
        document.getElementById("kpiPowerValue").textContent = pText;
        document.getElementById("kpiPowerBar").style.width = safeBat + "%";

        document.getElementById("pillPlatform").textContent = kpis.osDistro;
        document.getElementById("footerPlatform").textContent = kpis.osDistro;
      } catch (e) {
        console.error("Error refreshing KPIs:", e);
      }
    }

    setInterval(() => {
      document.getElementById("footerClock").textContent = new Date().toLocaleTimeString();
    }, 1000);

    window.doToggleFullscreen = function() {
      if (window.toggleFullscreen) {
        window.toggleFullscreen();
      } else if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

    // If accessed via external browser tab, automatically enter fullscreen on first user interaction
    let autoFullscreenAttempted = false;
    function attemptBrowserFullscreen() {
      if (autoFullscreenAttempted) return;
      autoFullscreenAttempted = true;
      if (!window.toggleFullscreen && !document.fullscreenElement && document.fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    window.addEventListener("click", attemptBrowserFullscreen, { once: true });
    window.addEventListener("keydown", attemptBrowserFullscreen, { once: true });

    window.addEventListener("DOMContentLoaded", async () => {
      try {
        const overlay = document.getElementById("overlay");
        if (overlay) {
          overlay.setAttribute("role", "dialog");
          overlay.setAttribute("aria-modal", "true");
          overlay.setAttribute("aria-labelledby", "overlayTitle");
        }
        const jsonSearch = document.getElementById("jsonSearch");
        if (jsonSearch) jsonSearch.setAttribute("aria-label", "Search keys and values in JSON");
        const selAutoRefresh = document.getElementById("selAutoRefresh");
        if (selAutoRefresh) selAutoRefresh.setAttribute("aria-label", "Auto-refresh interval");
        const selExportFormat = document.getElementById("selExportFormat");
        if (selExportFormat) selExportFormat.setAttribute("aria-label", "Export report format");

        initSidebarResizer();
        renderSidebar();
        await refreshKpiCards();
        await selectMethod("system", true);
      } catch (err) {
        console.error("Studio initialization error:", err);
        setExecuting(false);
      }
    });
  </script>
  <script>
${systemStudioExtraScript()}
  </script>
  <!-- System & Package Workstation (Compatibility Tags) -->
  <div style="display:none">
    <button id="btn_telemetry"></button>
    <button id="btn_cache_info"></button>
  </div>
  <script>
${getWindowShortcutsScript()}
  </script>
</body>
</html>`;
}

// -------------------------------------------------------------------------------------------------
// Application Instance & Window Factory
// -------------------------------------------------------------------------------------------------

export interface SystemStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
}

export interface SystemStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  webview?: Webview;
  server?: any;
  worker?: Worker;
  port?: number;
  url?: string;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

/**
 * Creates the Complete Enterprise-Grade System Information Studio Application
 */
export function createSystemInformationStudio(
  options: SystemStudioOptions = {},
): SystemStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1260);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const title =
    "System Information Studio Pro -- Complete Cross-Platform Hardware Intelligence Suite";

  const app: SystemStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateEnterpriseAppHtml(),
    run: async () => {
      console.log(
        "⚡ Launching System Information Studio Pro (All 76 APIs)...",
      );

      // 1. Launch Isolated Background Telemetry Worker Engine
      // This runs on a dedicated OS thread with its own independent Bun event loop,
      // guaranteeing zero deadlock and instant sub-millisecond responses while Webview runs on the main thread.
      let info: { ready: boolean; port: number; url: string; type?: string };

      let serverProc: any = null;

      process.env.STUDIO_WORKER = "system_studio";
      try {
        const workerUrl = new URL("./system_studio_server.ts", import.meta.url);
        const worker = new Worker(workerUrl);
        app.worker = worker;

        info = await new Promise((res, rej) => {
          const timer = setTimeout(
            () =>
              rej(
                new Error("Timeout initializing background telemetry engine"),
              ),
            1500,
          );
          worker.onmessage = (e) => {
            if (!e.data?.type || e.data.type === "system_studio") {
              clearTimeout(timer);
              res(e.data);
            }
          };
          worker.onerror = (err) => {
            clearTimeout(timer);
            rej(err);
          };
        });
      } catch {
        // Subprocess fallback: Spawns the server as an isolated OS process with an active Bun event loop
        const serverArgs = process.execPath.endsWith("bun")
          ? [
              process.execPath,
              process.argv[1] || resolve(import.meta.dir, "system_studio.ts"),
              "--server",
            ]
          : [process.execPath, "--server"];

        const proc = Bun.spawn(serverArgs, {
          stdout: "pipe",
          stderr: "ignore",
          env: process.env,
        });
        serverProc = proc;

        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let detectedPort = 0;

        const timeout = setTimeout(() => {
          try {
            reader.cancel();
          } catch {}
        }, 5000);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value);
          const m = buffer.match(/READY:(\d+)/);
          if (m && m[1]) {
            detectedPort = parseInt(m[1], 10);
            break;
          }
        }
        clearTimeout(timeout);

        if (detectedPort > 0) {
          info = {
            ready: true,
            port: detectedPort,
            url: `http://127.0.0.1:${detectedPort}`,
            type: "system_studio",
          };
        } else {
          const srv = startSystemStudioServer({
            port: 0,
            host: "127.0.0.1",
          });
          app.server = srv;
          const serverPort = srv.port ?? 0;
          info = {
            ready: true,
            port: serverPort,
            url: `http://127.0.0.1:${serverPort}`,
            type: "system_studio",
          };
        }
      }

      app.port = info.port;
      app.url = info.url;
      console.log(`⚡ Background Telemetry Server active at: ${info.url}`);

      // 2. Native Webview Window
      try {
        const { Webview, SizeHint } = await import("webview-bun");
        const webview = new Webview(true, {
          width,
          height,
          hint: SizeHint.NONE,
        });

        app.webview = webview;
        webview.title = title;

        try {
          if (fullscreen) {
            setWindowPositionNative(webview, { x: 0, y: 0 }, width, height);
          } else {
            setWindowPositionNative(webview, "center", width, height);
          }
          setAlwaysOnTopNative(webview, options.alwaysOnTop ?? false);
        } catch {}

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try {
              app.worker?.terminate();
            } catch {}
            try {
              serverProc?.kill();
            } catch {}
            process.exit(0);
          },
          onClose: () => {
            try {
              app.worker?.terminate();
            } catch {}
            try {
              serverProc?.kill();
            } catch {}
            process.exit(0);
          },
          onFullscreen: () => {
            toggleFullscreenNative(webview);
          },
          fullscreen,
        });

        webview.navigate(info.url);
        console.log(
          `⚡ Native desktop workstation window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}). (Also accessible in any browser at: ${info.url})`,
        );

        // Start native desktop message loop on main thread
        webview.run();
        try {
          app.worker?.terminate();
        } catch {}
        try {
          serverProc?.kill();
        } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(
          `Desktop Webview unavailable (${err?.message || err}). Application running as web workstation at: ${info.url}`,
        );
      } finally {
        try {
          app.worker?.terminate();
        } catch {}
        try {
          serverProc?.kill();
        } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

// -------------------------------------------------------------------------------------------------
// Backward Compatibility & Aliases
// -------------------------------------------------------------------------------------------------

export const createBunSystemStudio = createSystemInformationStudio;
export const createSystemStudio = createSystemInformationStudio;
export { createBrewStudio } from "./brew_studio";
export { startSystemStudioServer } from "./system_studio_server.ts";

// -------------------------------------------------------------------------------------------------
// Standalone Direct Invocation
// -------------------------------------------------------------------------------------------------

if (process.argv.includes("--server")) {
  const srv = startSystemStudioServer({
    port: 0,
    host: "127.0.0.1",
  });
  console.log(`READY:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const app = createSystemInformationStudio({ fullscreen: true });
  await app.run();
  process.exit(0);
}
