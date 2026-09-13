import { describe, expect, it } from "bun:test";
import {
  cleanDomain,
  cleanSubdomain,
  deduplicateSubdomains,
  isWildcardMatch,
  resolveHostDns,
} from "./subfinderDoers.ts";
import { formatSubdomainResult } from "./subfinderCoordinator.ts";

describe("subfinder doers", () => {
  it("cleans domain input", () => {
    expect(cleanDomain("https://example.com/path")).toBe("example.com");
    expect(cleanDomain("HTTP://SUB.EXAMPLE.COM")).toBe("sub.example.com");
    expect(cleanDomain("  example.com  ")).toBe("example.com");
  });

  it("filters and cleans subdomains", () => {
    expect(cleanSubdomain("api.example.com", "example.com")).toBe("api.example.com");
    expect(cleanSubdomain("*.dev.example.com", "example.com")).toBe("dev.example.com");
    expect(cleanSubdomain("otherdomain.org", "example.com")).toBeNull();
    expect(cleanSubdomain("example.com", "example.com")).toBe("example.com");
  });

  it("deduplicates subdomain list", () => {
    const list = ["b.example.com", "a.example.com", "b.example.com"];
    expect(deduplicateSubdomains(list)).toEqual(["a.example.com", "b.example.com"]);
  });

  it("resolves DNS address for localhost", async () => {
    const ips = await resolveHostDns("localhost");
    expect(ips.length).toBeGreaterThan(0);
    expect(ips.includes("127.0.0.1") || ips.includes("::1")).toBe(true);
  });
});

describe("subfinder coordinator formatters", () => {
  const sample = {
    host: "api.example.com",
    sources: ["crtsh", "hackertarget"],
    ip: ["93.184.216.34"],
  };

  it("formats silent output", () => {
    const silent = formatSubdomainResult(sample, {
      domains: ["example.com"],
      active: false,
      silent: true,
      json: false,
      timeoutMs: 1000,
    });
    expect(silent).toBe("api.example.com");
  });

  it("formats json output", () => {
    const jsonStr = formatSubdomainResult(sample, {
      domains: ["example.com"],
      active: false,
      silent: false,
      json: true,
      timeoutMs: 1000,
    });
    const parsed = JSON.parse(jsonStr);
    expect(parsed.host).toBe("api.example.com");
    expect(parsed.sources).toEqual(["crtsh", "hackertarget"]);
  });

  it("formats probe results with status and title", () => {
    const probedSample = {
      host: "api.example.com",
      sources: ["crtsh"],
      ip: ["93.184.216.34"],
      httpStatus: 200,
      httpTitle: "API Documentation",
    };
    const output = formatSubdomainResult(probedSample, {
      domains: ["example.com"],
      active: true,
      probe: true,
      silent: false,
      json: false,
      timeoutMs: 1000,
    });
    expect(output).toContain("[200]");
    expect(output).toContain('"API Documentation"');
    expect(output).toContain("api.example.com");
  });

  it("checks wildcard matching correctly", () => {
    const wildcardIps = ["1.1.1.1", "2.2.2.2"];
    expect(isWildcardMatch(["1.1.1.1"], wildcardIps)).toBe(true);
    expect(isWildcardMatch(["3.3.3.3"], wildcardIps)).toBe(false);
    expect(isWildcardMatch([], wildcardIps)).toBe(false);
  });

  it("formats open ports and wildcard badges", () => {
    const enriched = {
      host: "api.example.com",
      sources: ["crtsh"],
      ip: ["93.184.216.34"],
      openPorts: [80, 443],
      isWildcard: true,
    };
    const output = formatSubdomainResult(enriched, {
      domains: ["example.com"],
      active: true,
      probe: false,
      silent: false,
      json: false,
      timeoutMs: 1000,
    });
    expect(output).toContain("[wildcard]");
    expect(output).toContain("[ports: 80,443]");
  });
});
