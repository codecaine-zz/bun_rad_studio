/**
 * Network inspection and connectivity utilities for discovering local/public IPs,
 * checking internet reachability, measuring TCP latency, and resolving DNS hostnames.
 */
import os from "node:os";

// Doer: Get primary local IPv4 address
/**
 * Returns the primary non-internal IPv4 address of the host machine, falling back to `"127.0.0.1"`.
 */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

// Coordinator: Query public IPv4 via fast public endpoint
/**
 * Queries `api.ipify.org` to determine the machine's public IPv4 address, returning `""` on timeout or failure.
 * @param timeoutMs - Request timeout in milliseconds (default `4000`).
 */
export async function getPublicIp(timeoutMs = 4000): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.ipify.org", { signal: controller.signal });
    clearTimeout(id);
    return (await res.text()).trim();
  } catch {
    clearTimeout(id);
    return "";
  }
}

// Coordinator: Check internet connectivity via fast DNS probe
/**
 * Checks outbound internet connectivity by sending an HTTPS `HEAD` probe to `1.1.1.1`.
 * @param timeoutMs - Probe timeout in milliseconds (default `3000`).
 */
export async function isOnline(timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("https://1.1.1.1", { method: "HEAD", signal: controller.signal });
    clearTimeout(id);
    return res.status < 500;
  } catch {
    return false;
  }
}

// Coordinator: TCP ping to host and port measuring latency
/**
 * Attempts a TCP connection to `host:port` and measures round-trip handshake duration in milliseconds.
 * @param host - Target hostname or IP address.
 * @param port - Target TCP port.
 * @param timeoutMs - Connection timeout in milliseconds (default `2000`).
 */
export async function tcpPing(
  host: string,
  port: number,
  timeoutMs = 2000
): Promise<{ reachable: boolean; durationMs: number }> {
  const start = performance.now();
  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        open(s) {
          s.end();
        },
        data() {},
        close() {},
        error() {},
      },
      data: {},
    });
    const durationMs = Math.round(performance.now() - start);
    socket.end();
    return { reachable: true, durationMs };
  } catch {
    return { reachable: false, durationMs: Math.round(performance.now() - start) };
  }
}

// Doer: Resolve hostname to IPv4/IPv6 addresses using native Bun.dns.lookup
/**
 * Resolves a hostname to its IPv4 and IPv6 addresses via `Bun.dns.lookup`, returning `[]` on failure.
 */
export async function resolveHost(host: string): Promise<string[]> {
  try {
    const records = await Bun.dns.lookup(host);
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

/**
 * Namespace of network inspection and connectivity utilities.
 */
export const netutils = {
  getLocalIp,
  getPublicIp,
  isOnline,
  tcpPing,
  resolveHost,
};
