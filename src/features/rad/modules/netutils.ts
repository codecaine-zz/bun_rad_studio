import os from "node:os";

// Doer: Get primary local IPv4 address
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
export async function resolveHost(host: string): Promise<string[]> {
  try {
    const records = await Bun.dns.lookup(host);
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

export const netutils = {
  getLocalIp,
  getPublicIp,
  isOnline,
  tcpPing,
  resolveHost,
};
