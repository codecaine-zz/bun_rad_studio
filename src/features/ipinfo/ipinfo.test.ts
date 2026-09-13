import { describe, expect, it } from "bun:test";
import {
  calculateSubnet,
  cleanTarget,
  extractField,
  formatBulkTable,
  formatCsv,
  formatJson,
  formatSubnetInfo,
  formatSummary,
  getLocalInterfaces,
  isCidr,
  isIpAddress,
  resolveTargetToIp,
} from "./ipinfoDoers.ts";
import type { IpInfoResult } from "./ipinfoTypes.ts";

const sampleData: IpInfoResult = {
  ip: "8.8.8.8",
  hostname: "dns.google",
  city: "Mountain View",
  region: "California",
  country: "US",
  loc: "37.4056,-122.0775",
  org: "AS15169 Google LLC",
  postal: "94043",
  timezone: "America/Los_Angeles",
};

describe("ipinfo doers", () => {
  it("validates IPv4 and IPv6 addresses", () => {
    expect(isIpAddress("8.8.8.8")).toBe(true);
    expect(isIpAddress("127.0.0.1")).toBe(true);
    expect(isIpAddress("2001:4860:4860::8888")).toBe(true);
    expect(isIpAddress("google.com")).toBe(false);
    expect(isIpAddress("myip")).toBe(false);
  });

  it("cleans target domain/url string", () => {
    expect(cleanTarget("https://codefreelance.net/about")).toBe("codefreelance.net");
    expect(cleanTarget("  example.com  ")).toBe("example.com");
  });

  it("resolves domain target to IP", async () => {
    const directIp = await resolveTargetToIp("8.8.8.8");
    expect(directIp.ip).toBe("8.8.8.8");

    const resolved = await resolveTargetToIp("localhost");
    expect(resolved.ip).toBeDefined();
    expect(resolved.domain).toBe("localhost");
  });

  it("extracts specific field value", () => {
    expect(extractField(sampleData, "country")).toBe("US");
    expect(extractField(sampleData, "org")).toBe("AS15169 Google LLC");
    expect(() => extractField(sampleData, "nonexistent")).toThrow();
  });

  it("formats json output", () => {
    const jsonStr = formatJson(sampleData);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.ip).toBe("8.8.8.8");
    expect(parsed.country).toBe("US");
  });

  it("formats csv output", () => {
    const csvStr = formatCsv(sampleData);
    expect(csvStr).toContain("ip,hostname,city");
    expect(csvStr).toContain('"8.8.8.8"');
  });

  it("formats pretty summary output with maps link", () => {
    const summary = formatSummary(sampleData);
    expect(summary).toContain("8.8.8.8");
    expect(summary).toContain("Mountain View");
    expect(summary).toContain("https://maps.google.com/?q=37.4056,-122.0775");
  });

  it("formats bulk ip lookup table", () => {
    const bulk = formatBulkTable([sampleData]);
    expect(bulk).toContain("8.8.8.8");
    expect(bulk).toContain("Mountain View");
    expect(bulk).toContain("Google LLC");
  });

  it("calculates IPv4 CIDR subnet accurately", () => {
    expect(isCidr("192.168.1.0/24")).toBe(true);
    expect(isCidr("10.0.0.0/8")).toBe(true);
    expect(isCidr("invalid/24")).toBe(false);

    const sub = calculateSubnet("192.168.1.100/24");
    expect(sub.network).toBe("192.168.1.0");
    expect(sub.broadcast).toBe("192.168.1.255");
    expect(sub.netmask).toBe("255.255.255.0");
    expect(sub.wildcard).toBe("0.0.0.255");
    expect(sub.firstHost).toBe("192.168.1.1");
    expect(sub.lastHost).toBe("192.168.1.254");
    expect(sub.usableHosts).toBe(254);
    expect(sub.totalHosts).toBe(256);

    const formatted = formatSubnetInfo(sub);
    expect(formatted).toContain("192.168.1.0");
    expect(formatted).toContain("255.255.255.0");
  });

  it("inspects local network interfaces", () => {
    const ifaces = getLocalInterfaces();
    expect(Array.isArray(ifaces)).toBe(true);
    expect(ifaces.length).toBeGreaterThan(0);
    expect(ifaces[0].name).toBeDefined();
    expect(ifaces[0].address).toBeDefined();
  });
});
