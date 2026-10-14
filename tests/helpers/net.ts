import { networkInterfaces } from "os";

/** Name of this machine's IPv4 loopback interface: `lo0` on macOS, `lo` on Linux, a longer name on Windows. */
export function loopbackInterfaceName(): string {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (addrs?.some((a) => a.internal && a.family === "IPv4")) return name;
  }
  throw new Error("This machine has no IPv4 loopback interface.");
}
