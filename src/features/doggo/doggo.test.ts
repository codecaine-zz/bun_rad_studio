import { describe, expect, it } from "bun:test";
import {
  formatRecordData,
  formatShortOutput,
  parseTargetArgs,
} from "./doggoDoers.ts";
import { lookupDomain } from "./doggoCoordinator.ts";
import type { DoggoResponse } from "./doggoTypes.ts";

describe("doggo doers", () => {
  it("parses positional arguments with domain, type, and @nameserver", () => {
    const res1 = parseTargetArgs(["example.com", "MX", "@1.1.1.1"]);
    expect(res1.domain).toBe("example.com");
    expect(res1.type).toBe("MX");
    expect(res1.nameserver).toBe("1.1.1.1");

    const res2 = parseTargetArgs(["@8.8.8.8", "google.com", "TXT"]);
    expect(res2.domain).toBe("google.com");
    expect(res2.type).toBe("TXT");
    expect(res2.nameserver).toBe("8.8.8.8");
  });

  it("formats record data across types", () => {
    const aRecord = formatRecordData("A", { address: "93.184.216.34", ttl: 300 });
    expect(aRecord.data).toBe("93.184.216.34");
    expect(aRecord.ttl).toBe(300);

    const mxRecord = formatRecordData("MX", { priority: 10, exchange: "mail.example.com" });
    expect(mxRecord.data).toBe("10 mail.example.com");

    const nullMx = formatRecordData("MX", { priority: 0, exchange: "" });
    expect(nullMx.data).toBe("0 .");

    const txtRecord = formatRecordData("TXT", ["v=spf1 ~all"]);
    expect(txtRecord.data).toBe('"v=spf1 ~all"');
  });

  it("formats short output format", () => {
    const sample: DoggoResponse = {
      domain: "example.com",
      queryType: "A",
      server: "1.1.1.1",
      queryTimeMs: 10,
      answers: [
        { name: "example.com.", type: "A", class: "IN", data: "93.184.216.34" },
        { name: "example.com.", type: "A", class: "IN", data: "93.184.216.35" },
      ],
    };
    const short = formatShortOutput(sample);
    expect(short).toBe("93.184.216.34\n93.184.216.35");
  });
});

describe("doggo lookup integration", () => {
  it("resolves DNS records for example.com", async () => {
    const res = await lookupDomain("example.com", "A");
    expect(res.domain).toBe("example.com");
    expect(res.answers.length).toBeGreaterThan(0);
    expect(res.answers[0]?.type).toBe("A");
    expect(res.answers[0]?.data).toBeDefined();
  });

  it("performs reverse PTR lookup for 8.8.8.8", async () => {
    const res = await lookupDomain("8.8.8.8", "PTR");
    expect(res.answers.length).toBeGreaterThan(0);
    expect(res.answers[0]?.data).toContain("dns.google");
  });

  it("resolves DNS-over-HTTPS (DoH) records", async () => {
    const { performDohLookup } = await import("./doggoDoers.ts");
    const res = await performDohLookup("example.com", "A");
    expect(res.answers.length).toBeGreaterThan(0);
    expect(res.protocol).toBe("DoH");
    expect(res.server).toContain("cloudflare-dns.com");
  });

  it("resolves multiple record types in parallel with ALL", async () => {
    const res = await lookupDomain("example.com", "ALL");
    expect(res.queryType).toBe("ALL");
    expect(res.answers.some((a) => a.type === "A")).toBe(true);
    expect(res.answers.some((a) => a.type === "MX" || a.type === "NS")).toBe(true);
  });
});
