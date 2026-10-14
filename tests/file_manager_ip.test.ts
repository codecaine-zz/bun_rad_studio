import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { classifyAny, compressV6, expandV6, groupDigits, parseV6 } from "../src/features/filemanager/fmIpMath";
import { OPEN_HOSTS, buildExternalUrl, cleanToken, ipHooks, netLimits, parseTarget, validHostname } from "../src/features/filemanager/fmIpNet";
import { BULK_CONCURRENCY, MAX_BULK_TARGETS, splitTargets } from "../src/features/filemanager/fmIpLookup";
import { ipOperations } from "../src/features/filemanager/fmIpOps";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-ip-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const launched: Array<{ command: string; args: string[] }> = [];
let launchFails: string | null = null;
let ctx: FmContext;

const op = async (name: string, body: Record<string, any> = {}, c: FmContext = ctx): Promise<any> => await ipOperations[name]!(c, body);
const failure = async (name: string, body: Record<string, any>, c: FmContext = ctx): Promise<{ code: string; message: string }> => {
  try {
    await op(name, body, c);
  } catch (err: any) {
    return { code: err.code, message: err.message };
  }
  throw new Error(`${name} was expected to fail`);
};

// ---------------------------------------------------------------------------------------------------------------
// A fake internet. Calls to this computer (the HTTP tests) still go to the real fetch.
// ---------------------------------------------------------------------------------------------------------------

const realFetch = globalThis.fetch;
interface Call { url: string; host: string; headers: Record<string, string>; redirect?: string }
let calls: Call[] = [];
type Responder = (url: URL, call: Call) => Response | Promise<Response>;

function fakeInternet(responder: Responder) {
  calls = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "127.0.0.1") return realFetch(input, init);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = { url: url.href, host: url.hostname, headers, redirect: init.redirect };
    calls.push(call);
    return await responder(url, call);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const GOOGLE = { ip: "8.8.8.8", hostname: "dns.google", city: "Mountain View", region: "California", country: "US", loc: "37.4056,-122.0775", org: "AS15169 Google LLC", postal: "94043", timezone: "America/Los_Angeles" };
const ipinfoOk: Responder = (url) => {
  const asked = url.pathname.split("/")[1];
  return json(url.hostname === "ipinfo.io" ? { ...GOOGLE, ip: asked && asked !== "json" ? decodeURIComponent(asked) : GOOGLE.ip } : { success: false });
};
const offline = () => { throw new TypeError("fetch failed"); };

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
});
beforeEach(() => {
  launched.length = 0;
  launchFails = null;
  ctx = createContext({ home, dataDir, launch: async (command, args) => { if (launchFails) throw Object.assign(new Error("x"), { code: launchFails }); launched.push({ command, args }); } });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(netLimits, { fetchTimeoutMs: 8000, dnsTimeoutMs: 5000, lookupTotalMs: 15000, bulkTotalMs: 60000, maxAnswerBytes: 64 * 1024 });
  ipHooks.resolveHost = originalResolve;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const originalResolve = ipHooks.resolveHost;

// ---------------------------------------------------------------------------------------------------------------
describe("what may be typed", () => {
  test("accepts addresses, blocks and names, in one canonical spelling", () => {
    expect(parseTarget("8.8.8.8")).toEqual({ kind: "ip", ip: "8.8.8.8" });
    expect(parseTarget("  2606:4700:4700:0:0:0:0:1111 ")).toEqual({ kind: "ip", ip: "2606:4700:4700::1111" });
    expect(parseTarget("::FFFF:8.8.8.8")).toEqual({ kind: "ip", ip: "8.8.8.8", mappedFrom: "::ffff:808:808" });
    expect(parseTarget("10.1.2.3/8")).toMatchObject({ kind: "cidr", cidr: "10.1.2.3/8", family: "v4", prefix: 8 });
    expect(parseTarget("2001:0DB8::/32")).toMatchObject({ kind: "cidr", cidr: "2001:db8::/32", family: "v6" });
    expect(parseTarget("Example.COM.")).toEqual({ kind: "host", host: "example.com" });
    expect(parseTarget("münchen.de")).toEqual({ kind: "host", host: "xn--mnchen-3ya.de" });
    expect(parseTarget("")).toEqual({ kind: "myip" });
    expect(parseTarget("MyIP")).toEqual({ kind: "myip" });
  });

  test.each([
    "https://example.com", "http://1.2.3.4/", "example.com/path", "//example.com", "example.com?x=1", "example.com#top", "user@example.com", "1.2.3.4@evil.com",
    "1.2.3.4 evil.com", "a b", "1.2.3.4\n5.6.7.8", "example.com\r\nHost: evil", "ex\u0000ample.com", "a\u202eb.com", "1.2.3", "1.2.3.256", "01.2.3.4", "0x7f.1", "0x7f", "2130706433", "127.1",
    "localhost:8080", "1.2.3.4:80", "[::1]", "fe80::1%en0", "1.2.3.4/33", "::/129", "1.2.3.4/1/2", "1.2.3.4/", "/24", "example.com/24", "-bad.com", "bad-.com", "a..b", "a_b.com", "exa mple.com", "a\\b.com", "x".repeat(254),
    `${"a".repeat(64)}.com`, "::g", "1:2:3:4:5:6:7:8:9", "javascript:alert(1)", "file:///etc/passwd", "$(whoami)", "`id`", "a;b", "a|b", "ex<script>.com",
  ])("refuses %j", (bad) => {
    expect(() => parseTarget(bad)).toThrow();
    try {
      parseTarget(bad);
    } catch (err: any) {
      expect(err.code).toBe("BAD_TARGET");
      expect(err.message.length).toBeGreaterThan(20);
    }
  });

  test("refuses things that are not text", () => {
    for (const bad of [undefined, null, 5, {}, ["8.8.8.8"], true]) expect(() => parseTarget(bad)).toThrow();
  });

  test("a name that the system could read as a number is refused", () => {
    for (const n of ["127.1", "0x7f.0.0.1", "123", "1.2.3", "example.123", "example.0x1"]) expect(() => validHostname(n)).toThrow();
    expect(validHostname("a-b.example.org")).toBe("a-b.example.org");
  });

  test("tokens", () => {
    expect(cleanToken(undefined)).toBeUndefined();
    expect(cleanToken("   ")).toBeUndefined();
    expect(cleanToken(" abcd1234 ")).toBe("abcd1234");
    for (const bad of ["abc", "has space", "line\r\nbreak", "tok\u0000en", "a".repeat(101), "ünïcode1", "a;b=c", 12345 as any]) expect(() => cleanToken(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("address maths", () => {
  test("IPv6 parsing and writing", () => {
    expect(compressV6(parseV6("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe("2001:db8::1");
    expect(compressV6(parseV6("::"))).toBe("::");
    expect(compressV6(parseV6("::1"))).toBe("::1");
    expect(compressV6(parseV6("1:0:0:2:0:0:0:3"))).toBe("1:0:0:2::3");
    expect(compressV6(parseV6("1:0:2:3:4:5:6:7"))).toBe("1:0:2:3:4:5:6:7");
    expect(expandV6(parseV6("::ffff:1.2.3.4"))).toBe("0000:0000:0000:0000:0000:ffff:0102:0304");
    expect(() => parseV6("1.2.3.4")).toThrow();
    expect(groupDigits("1234567")).toBe("1,234,567");
  });

  test("classification is right for IPv6 (not just by text prefix) and the reserved ranges", () => {
    const priv = ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "127.0.0.1", "127.5.5.5", "169.254.1.1", "100.64.0.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "0.0.0.0", "0.1.2.3", "198.18.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "::1", "::", "fe80::1", "febf::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"];
    for (const ip of priv) expect(classifyAny(ip).isPrivateOrBogon, ip).toBe(true);
    const pub = ["8.8.8.8", "172.32.0.1", "172.15.255.255", "100.128.0.1", "1.1.1.1", "2606:4700:4700::1111", "fcc::1", "fe::1", "ffff::1".replace("ffff", "2ff"), "::ffff:8.8.8.8", "2a00:1450::1"];
    for (const ip of pub) expect(classifyAny(ip).isPrivateOrBogon, ip).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("ip/lookup", () => {
  test("a public address: asks ipinfo.io once, no redirects, no token, and builds the table, files and deep links", async () => {
    fakeInternet(ipinfoOk);
    const a = await op("ip/lookup", { target: "8.8.8.8" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://ipinfo.io/8.8.8.8/json", redirect: "manual" });
    expect(calls[0]!.headers.authorization).toBeUndefined();
    expect(a).toMatchObject({ kind: "ip", ip: "8.8.8.8", isPrivate: false, source: "ipinfo.io", loc: "37.4056,-122.0775", label: "8.8.8.8 · Mountain View, US" });
    expect(a.data).toEqual(GOOGLE);
    const rows = Object.fromEntries(a.table.rows.map((r: string[]) => [r[0], r[1]]));
    expect(rows).toMatchObject({ "IP Address": "8.8.8.8", Hostname: "dns.google", City: "Mountain View", Country: "US", Coordinates: "37.4056,-122.0775", "Organization / ASN": "AS15169 Google LLC", "Address Type": "Public IP" });
    expect(a.table.acts[a.table.rows.findIndex((r: string[]) => r[0] === "Map Link")]).toEqual({ kind: "map", target: "37.4056,-122.0775" });
    expect(a.table.acts[a.table.rows.findIndex((r: string[]) => r[0] === "Hostname")]).toEqual({ kind: "lookup", target: "dns.google" });
    expect(JSON.parse(a.json)).toEqual(GOOGLE);
    expect(a.csv.split("\n")[0]).toBe('"ip","hostname","city","region","country","loc","org","postal","timezone"');
    expect(a.csv.split("\n")[1]).toContain('"AS15169 Google LLC"');
    expect(a.links.map((l: any) => l.url)).toEqual([
      "https://www.google.com/maps?q=37.4056,-122.0775", "https://www.openstreetmap.org/?mlat=37.4056&mlon=-122.0775#map=10/37.4056/-122.0775",
      "https://ipinfo.io/8.8.8.8", "https://bgp.he.net/ip/8.8.8.8", "https://bgp.he.net/AS15169", "https://ipinfo.io/AS15169",
    ]);
    for (const l of a.links) expect(OPEN_HOSTS.has(new URL(l.url).hostname)).toBe(true);
    expect(a.summary).toContain("Mountain View");
  });

  test("my public address uses the 'who am I' address of ipinfo.io", async () => {
    fakeInternet(ipinfoOk);
    const a = await op("ip/myip", {});
    expect(calls[0]!.url).toBe("https://ipinfo.io/json");
    expect(a.ip).toBe("8.8.8.8");
    await op("ip/lookup", { target: "" });
    expect(calls[1]!.url).toBe("https://ipinfo.io/json");
  });

  test("IPv6, canonical spelling in the request, IPv4-mapped goes out as IPv4", async () => {
    fakeInternet(ipinfoOk);
    await op("ip/lookup", { target: "2606:4700:4700:0000:0000:0000:0000:1111" });
    expect(calls[0]!.url).toBe("https://ipinfo.io/2606:4700:4700::1111/json");
    const mapped = await op("ip/lookup", { target: "::ffff:8.8.8.8" });
    expect(calls[1]!.url).toBe("https://ipinfo.io/8.8.8.8/json");
    expect(mapped.warnings.join(" ")).toContain("IPv4 address written the IPv6 way");
    const fcc = await op("ip/lookup", { target: "0fcc::1" });
    expect(fcc.isPrivate).toBe(false);
    expect(calls[2]!.url).toBe("https://ipinfo.io/fcc::1/json");
  });

  test.each(["10.1.2.3", "172.16.0.9", "192.168.1.1", "127.0.0.1", "169.254.9.9", "100.64.1.1", "224.0.0.251", "240.1.1.1", "0.0.0.0", "0.9.9.9", "::1", "::", "fe80::abcd", "fd00::1", "ff02::1", "2001:db8::5", "::ffff:192.168.0.1", "198.51.100.7"])("%s is answered locally and explained, nothing is sent", async (ip) => {
    fakeInternet(() => { throw new Error("must not be called"); });
    const a = await op("ip/lookup", { target: ip, token: "secret12345" });
    expect(calls).toHaveLength(0);
    expect(a.isPrivate).toBe(true);
    expect(a.source).toBe("this computer");
    expect(a.links).toEqual([]);
    expect(a.loc).toBeUndefined();
    expect(a.explanation).toContain("private or reserved address");
    expect(a.explanation).toContain("no public location");
    expect(a.table.rows.at(-1)![0]).toBe("Note");
    expect(a.table.acts.every((x: any) => x === null || x.kind === "lookup")).toBe(true);
  });

  test("a private address in the interface list is described as that adapter", async () => {
    const a = await op("ip/interfaces");
    const mine = a.interfaces.find((i: any) => i.address === "127.0.0.1");
    if (!mine) return;
    const found = await op("ip/lookup", { target: "127.0.0.1" });
    expect(found.data.hostname).toBe("localhost");
  });

  test("localhost never touches the network or DNS", async () => {
    fakeInternet(() => { throw new Error("must not be called"); });
    ipHooks.resolveHost = async () => { throw new Error("must not be called"); };
    const a = await op("ip/lookup", { target: "LocalHost" });
    expect(a).toMatchObject({ ip: "127.0.0.1", domain: "localhost", isPrivate: true });
  });

  test("a name is resolved by the computer; only the address is sent", async () => {
    fakeInternet(ipinfoOk);
    const asked: string[] = [];
    ipHooks.resolveHost = async (host) => (asked.push(host), ["2606:2800:220:1::1", "93.184.216.34", "93.184.216.34"]);
    const a = await op("ip/lookup", { target: "Example.COM" });
    expect(asked).toEqual(["example.com"]);
    expect(calls.map((c) => c.url)).toEqual(["https://ipinfo.io/93.184.216.34/json"]);
    expect(JSON.stringify(calls)).not.toContain("example.com");
    expect(a).toMatchObject({ ip: "93.184.216.34", domain: "example.com", resolved: ["93.184.216.34", "2606:2800:220:1::1"] });
    expect(a.table.rows[0]).toEqual(["Typed Name", "example.com", "DNS", expect.any(String)]);
    expect(a.warnings.join(" ")).toContain("2 addresses");
  });

  test("a name that points at a private address is answered locally", async () => {
    fakeInternet(() => { throw new Error("must not be called"); });
    ipHooks.resolveHost = async () => ["10.0.0.5"];
    const a = await op("ip/lookup", { target: "intranet.example.org" });
    expect(a).toMatchObject({ ip: "10.0.0.5", isPrivate: true, domain: "intranet.example.org" });
    expect(calls).toHaveLength(0);
  });

  test("name lookup problems are explained", async () => {
    ipHooks.resolveHost = async () => { throw Object.assign(new Error("nx"), { code: "ENOTFOUND" }); };
    expect((await failure("ip/lookup", { target: "nope.example.org" })).code).toBe("NO_SUCH_HOST");
    ipHooks.resolveHost = async () => { throw Object.assign(new Error("again"), { code: "EAI_AGAIN" }); };
    const down = await failure("ip/lookup", { target: "nope.example.org" });
    expect(down.code).toBe("NO_DNS");
    expect(down.message).toContain("offline");
    ipHooks.resolveHost = async () => [];
    expect((await failure("ip/lookup", { target: "empty.example.org" })).code).toBe("NO_SUCH_HOST");
    ipHooks.resolveHost = async () => ["not an address", "<b>x</b>"];
    expect((await failure("ip/lookup", { target: "junk.example.org" })).code).toBe("NO_SUCH_HOST");
    netLimits.dnsTimeoutMs = 40;
    ipHooks.resolveHost = () => new Promise<string[]>(() => {});
    const started = Date.now();
    expect((await failure("ip/lookup", { target: "slow.example.org" })).code).toBe("DNS_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(1500);
  });

  test("a CIDR block typed here is answered by the subnet calculator, without the network", async () => {
    fakeInternet(() => { throw new Error("must not be called"); });
    const a = await op("ip/lookup", { target: "192.168.1.77/24" });
    expect(a).toMatchObject({ kind: "cidr", family: "v4" });
    expect(a.subnet).toMatchObject({ network: "192.168.1.0", broadcast: "192.168.1.255", usableHosts: "254" });
    expect(calls).toHaveLength(0);
  });

  test("the token goes to ipinfo.io only, in a header, and is never echoed", async () => {
    const token = "tok_SECRET123456";
    const logs = [spyOn(console, "log"), spyOn(console, "error"), spyOn(console, "warn"), spyOn(console, "info")];
    try {
      fakeInternet(ipinfoOk);
      const a = await op("ip/lookup", { target: "8.8.8.8", token });
      expect(calls[0]!.headers.authorization).toBe(`Bearer ${token}`);
      expect(calls[0]!.url).not.toContain("tok_");
      expect(JSON.stringify(a)).not.toContain(token);

      // ipinfo.io refuses the token: the fallback service must not see it
      fakeInternet((url) => (url.hostname === "ipinfo.io" ? json({ error: "Unknown token" }, 403) : json({ success: true, ip: "8.8.8.8", city: "Mountain View", region: "California", country_code: "US", latitude: 37.4, longitude: -122.08, connection: { asn: 15169, org: "Google LLC" }, timezone: { id: "America/Los_Angeles" } })));
      const b = await op("ip/lookup", { target: "8.8.8.8", token });
      expect(calls.map((c) => c.host)).toEqual(["ipinfo.io", "ipwho.is"]);
      expect(calls[1]!.headers.authorization).toBeUndefined();
      expect(calls[1]!.url).not.toContain("tok_");
      expect(b).toMatchObject({ source: "ipwho.is", data: { org: "AS15169 Google LLC", country: "US", loc: "37.4,-122.08" } });
      expect(b.warnings.join(" ")).toContain("didn't accept the token");
      expect(JSON.stringify(b)).not.toContain(token);

      // failures never contain it either
      fakeInternet(offline);
      const err = await failure("ip/lookup", { target: "8.8.8.8", token });
      expect(JSON.stringify(err)).not.toContain(token);
      expect((await failure("ip/lookup", { target: "8.8.8.8", token: "bad token\r\nX: y" })).code).toBe("BAD_TOKEN");
      for (const spy of logs) for (const c of spy.mock.calls) expect(JSON.stringify(c)).not.toContain(token);
    } finally {
      for (const spy of logs) spy.mockRestore();
    }
    expect(existsSync(dataDir) ? readdirSync(dataDir) : []).toEqual([]);
  });

  test("falls back to ipwho.is when ipinfo.io is down, and says so", async () => {
    fakeInternet((url) => (url.hostname === "ipinfo.io" ? new Response("oops", { status: 503 }) : json({ success: true, ip: "1.1.1.1", city: "Sydney", region: "NSW", country_code: "AU", latitude: -33.86, longitude: 151.2, connection: { asn: 13335, org: "Cloudflare", domain: "one.one" }, postal: "2000", timezone: { id: "Australia/Sydney" } })));
    const a = await op("ip/lookup", { target: "1.1.1.1" });
    expect(a).toMatchObject({ source: "ipwho.is", data: { ip: "1.1.1.1", hostname: "one.one", city: "Sydney", loc: "-33.86,151.2", org: "AS13335 Cloudflare", postal: "2000" } });
    expect(a.warnings.join(" ")).toContain("having trouble");
  });

  test("a service that says 'bogon' or 'reserved' makes it a private answer", async () => {
    fakeInternet(() => json({ ip: "192.88.99.1", bogon: true }));
    expect((await op("ip/lookup", { target: "192.88.99.1" })).isPrivate).toBe(true);
    fakeInternet((url) => (url.hostname === "ipinfo.io" ? json({}, 500) : json({ success: false, message: "Reserved range" })));
    expect((await op("ip/lookup", { target: "192.88.99.2" })).isPrivate).toBe(true);
  });

  test("what a service sends is cleaned: unknown fields dropped, control characters and bad places removed, long text cut", async () => {
    fakeInternet(() => json({ ip: "8.8.8.8", city: "Mount\u0000ain\nView", region: "x".repeat(900), loc: "javascript:alert(1)", org: "<img src=x onerror=1>", evil: "x", country: { a: 1 }, readme: "https://evil.example" }));
    const a = await op("ip/lookup", { target: "8.8.8.8" });
    expect(a.data.city).toBe("Mount ain View");
    expect(a.data.region).toHaveLength(200);
    expect(a.data.loc).toBeUndefined();
    expect(a.data.country).toBeUndefined();
    expect((a.data as any).evil).toBeUndefined();
    expect(a.links.map((l: any) => l.kind)).toEqual(["ipinfo", "bgp"]);
    fakeInternet(() => json({ ip: "not an ip" }));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("LOOKUP_FAILED");
  });

  test("failures: rate limit, nothing usable, offline, redirect, oversize, timeout", async () => {
    fakeInternet((url) => (url.hostname === "ipinfo.io" ? json({ status: 429 }, 429) : json({ success: false, message: "nope" })));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("RATE_LIMITED");
    fakeInternet(() => json({ nothing: true }));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("LOOKUP_FAILED");
    fakeInternet(() => new Response("<html>", { status: 200 }));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("LOOKUP_FAILED");

    fakeInternet(offline);
    const off = await failure("ip/lookup", { target: "8.8.8.8" });
    expect(off.code).toBe("OFFLINE");
    expect(off.message).toContain("Can't reach the internet");
    expect((await failure("ip/myip", {})).code).toBe("OFFLINE");

    fakeInternet(() => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));
    expect((await failure("ip/lookup", { target: "8.8.8.8", token: "tok_SECRET123456" })).code).toBe("REDIRECT");
    expect(calls.every((c) => c.host === "ipinfo.io" || c.host === "ipwho.is")).toBe(true);

    fakeInternet(() => json({ ip: "8.8.8.8", city: "x".repeat(200_000) }));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("TOO_BIG");
    fakeInternet(() => new Response(JSON.stringify({ ip: "8.8.8.8" }), { headers: { "content-length": "9999999" } }));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("TOO_BIG");
    // no content-length: a stream that never stops is cut off at the cap
    let sent = 0;
    fakeInternet(() => new Response(new ReadableStream({ pull(c) { sent += 4096; c.enqueue(new Uint8Array(4096).fill(120)); } })));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("TOO_BIG");
    expect(sent).toBeLessThan(2 * 1024 * 1024);

    netLimits.fetchTimeoutMs = 60;
    fakeInternet(() => new Promise<Response>(() => {}));
    const started = Date.now();
    const slow = await failure("ip/lookup", { target: "8.8.8.8" });
    expect(slow.code).toBe("TIMEOUT");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(calls).toHaveLength(2);
    // a body that stalls after the headers also times out
    fakeInternet(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{")); } })));
    expect((await failure("ip/lookup", { target: "8.8.8.8" })).code).toBe("TIMEOUT");
  });

  test("bad input is refused before anything is sent", async () => {
    fakeInternet(() => { throw new Error("must not be called"); });
    for (const target of ["https://x.com", "a b", "1.2.3.4\n9.9.9.9", "x@y", "../../etc/passwd"]) expect((await failure("ip/lookup", { target })).code).toBe("BAD_TARGET");
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("subnet maths", () => {
  test("IPv4 edge cases", async () => {
    const all = (await op("ip/subnet", { cidr: "0.0.0.0/0" })).subnet;
    expect(all).toMatchObject({ network: "0.0.0.0", broadcast: "255.255.255.255", netmask: "0.0.0.0", wildcard: "255.255.255.255", totalHosts: "4294967296", usableHosts: "4294967294" });
    const p2p = (await op("ip/subnet", { cidr: "10.0.0.5/31" })).subnet;
    expect(p2p).toMatchObject({ network: "10.0.0.4", broadcast: "10.0.0.5", firstHost: "10.0.0.4", lastHost: "10.0.0.5", totalHosts: "2", usableHosts: "2", netmask: "255.255.255.254" });
    const one = (await op("ip/subnet", { cidr: "203.0.113.9/32" })).subnet;
    expect(one).toMatchObject({ network: "203.0.113.9", broadcast: "203.0.113.9", firstHost: "203.0.113.9", lastHost: "203.0.113.9", totalHosts: "1", usableHosts: "1" });
    const lan = await op("ip/subnet", { cidr: "192.168.1.77/24" });
    expect(lan.subnet).toMatchObject({ cidr: "192.168.1.77/24", network: "192.168.1.0", broadcast: "192.168.1.255", netmask: "255.255.255.0", wildcard: "0.0.0.255", firstHost: "192.168.1.1", lastHost: "192.168.1.254", usableHosts: "254" });
    expect(lan.table.rows.map((r: string[]) => r[0])).toContain("Total Usable Hosts");
    expect(lan.label).toBe("254 usable hosts");
    expect(JSON.parse(lan.json).network).toBe("192.168.1.0");
    expect(lan.csv.split("\n")[0]).toContain('"network"');
    expect((await op("ip/subnet", { cidr: "10.0.0.0/30" })).subnet).toMatchObject({ firstHost: "10.0.0.1", lastHost: "10.0.0.2", usableHosts: "2" });
  });

  test("IPv6", async () => {
    const s = (await op("ip/subnet", { cidr: "2001:DB8:0:0:1::5/64" })).subnet;
    expect(s).toMatchObject({ family: "v6", prefix: 64, network: "2001:db8::", lastAddress: "2001:db8::ffff:ffff:ffff:ffff", netmask: "ffff:ffff:ffff:ffff::", totalHosts: "18446744073709551616" });
    const whole = (await op("ip/subnet", { cidr: "::/0" })).subnet;
    expect(whole).toMatchObject({ network: "::", lastAddress: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", netmask: "::", totalHosts: "340282366920938463463374607431768211456" });
    expect((await op("ip/subnet", { cidr: "2001:db8::1/128" })).subnet).toMatchObject({ network: "2001:db8::1", lastAddress: "2001:db8::1", totalHosts: "1", netmask: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff" });
    expect((await op("ip/subnet", { cidr: "2001:db8::/127" })).subnet).toMatchObject({ totalHosts: "2", lastAddress: "2001:db8::1" });
    const row = (await op("ip/subnet", { cidr: "2001:db8::/32" })).table.rows.find((r: string[]) => r[0] === "Total Addresses");
    expect(row[1]).toBe("79,228,162,514,264,337,593,543,950,336 (2^96)");
  });

  test("things that are not blocks are refused", async () => {
    for (const cidr of ["8.8.8.8", "10.0.0.0/33", "::/129", "example.com/24", "10.0.0.0/-1", "10.0.0.0/ 8", "", undefined, "10.0.0.0/8; ls"]) expect((await failure("ip/subnet", { cidr })).code).toMatch(/BAD_/);
  });

  test("is an address in a block", async () => {
    expect((await op("ip/incidr", { cidr: "192.168.1.0/24", ip: "192.168.1.77" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "192.168.1.0/24", ip: "192.168.2.1" })).inside).toBe(false);
    expect((await op("ip/incidr", { cidr: "192.168.1.0/24", ip: "3232235786" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "192.168.1.0/24", ip: "0xC0A80101" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "0.0.0.0/0", ip: "255.255.255.255" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "10.0.0.1/32", ip: "10.0.0.2" })).inside).toBe(false);
    expect((await op("ip/incidr", { cidr: "10.0.0.0/31", ip: "10.0.0.1" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "2001:db8::/32", ip: "2001:db8:ffff::1" })).inside).toBe(true);
    expect((await op("ip/incidr", { cidr: "2001:db8::/32", ip: "2001:db9::1" })).inside).toBe(false);
    expect((await op("ip/incidr", { cidr: "2001:db8::/32", ip: "2001:DB8::" })).message).toBe("2001:db8:: is inside 2001:db8::/32.");
    expect((await op("ip/incidr", { cidr: "10.0.0.0/8", ip: "::ffff:10.1.1.1" })).inside).toBe(true);
    expect((await failure("ip/incidr", { cidr: "10.0.0.0/8", ip: "2001:db8::1" })).code).toBe("MIXED_FAMILIES");
    expect((await failure("ip/incidr", { cidr: "10.0.0.0", ip: "10.0.0.1" })).code).toBe("BAD_CIDR");
    for (const ip of ["", "abc", "1.2.3.4; x", "1.2.3.4/8", "::g", undefined]) expect((await failure("ip/incidr", { cidr: "10.0.0.0/8", ip })).code).toBe("BAD_IP");
  });

  test("splitting a block", async () => {
    const four = await op("ip/split", { cidr: "192.168.1.0/24", prefix: 26 });
    expect(four).toMatchObject({ blocks: ["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"], total: "4", truncated: false });
    expect(four.table.acts[1]).toEqual({ kind: "lookup", target: "192.168.1.64/26" });
    expect((await op("ip/split", { cidr: "192.168.1.0/24", prefix: "/26" })).total).toBe("4");
    const wide = await op("ip/split", { cidr: "10.0.0.0/8", prefix: 32 });
    expect(wide).toMatchObject({ total: "16777216", truncated: true });
    expect(wide.blocks).toHaveLength(256);
    expect((await op("ip/split", { cidr: "10.0.0.0/8", prefix: 32, limit: 5 })).blocks).toHaveLength(5);
    expect((await op("ip/split", { cidr: "10.0.0.0/8", prefix: 32, limit: 99999 })).blocks).toHaveLength(1024);
    expect((await op("ip/split", { cidr: "10.0.0.0/8", prefix: 32, limit: -4 })).blocks.length).toBeGreaterThanOrEqual(1);
    expect((await op("ip/split", { cidr: "10.0.0.0/31", prefix: 32 })).blocks).toEqual(["10.0.0.0/32", "10.0.0.1/32"]);
    const v6 = await op("ip/split", { cidr: "2001:db8::/32", prefix: 48 });
    expect(v6).toMatchObject({ total: "65536", truncated: true });
    expect(v6.blocks.slice(0, 2)).toEqual(["2001:db8::/48", "2001:db8:1::/48"]);
    expect((await op("ip/split", { cidr: "::/126", prefix: 128 })).blocks).toEqual(["::/128", "::1/128", "::2/128", "::3/128"]);
    expect((await op("ip/split", { cidr: "::/0", prefix: 128, limit: 3 })).total).toBe("340282366920938463463374607431768211456");
    for (const prefix of [24, 8, 33, -1, 1.5, "x", null, undefined, "26; ls"]) expect((await failure("ip/split", { cidr: "10.0.0.0/24", prefix })).code).toBe("BAD_PREFIX");
    expect((await failure("ip/split", { cidr: "2001:db8::/32", prefix: 129 })).code).toBe("BAD_PREFIX");
    expect((await failure("ip/split", { cidr: "10.0.0.1", prefix: 26 })).code).toBe("BAD_CIDR");
  });

  test("notations", async () => {
    const dotted = await op("ip/formats", { ip: "192.168.1.10" });
    const rows = Object.fromEntries(dotted.table.rows.map((r: string[]) => [r[0], r[1]]));
    expect(rows).toMatchObject({
      Integer: "3232235786", Hexadecimal: "0xC0A8010A", Binary: "11000000.10101000.00000001.00001010", "Reverse DNS Zone": "10.1.168.192.in-addr.arpa",
      "IPv4-mapped IPv6": "::ffff:192.168.1.10", "IPv4-mapped (hex)": "::ffff:c0a8:10a", "6to4 network": "2002:c0a8:010a::/48", Type: "Private Network (Class C)",
    });
    for (const same of ["3232235786", "0xC0A8010A", "0xc0a8010a"]) expect((await op("ip/formats", { ip: same })).ip).toBe("192.168.1.10");
    const v6 = await op("ip/formats", { ip: "2001:DB8::1" });
    const r6 = Object.fromEntries(v6.table.rows.map((r: string[]) => [r[0], r[1]]));
    expect(r6).toMatchObject({ "Short form": "2001:db8::1", "Full form": "2001:0db8:0000:0000:0000:0000:0000:0001", Integer: "42540766411282592856903984951653826561", Hexadecimal: "0x20010db8000000000000000000000001", Type: "IPv6 Documentation" });
    expect(r6["Reverse DNS name"]).toBe("1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
    expect(Object.fromEntries((await op("ip/formats", { ip: "::ffff:1.2.3.4" })).table.rows.map((r: string[]) => [r[0], r[1]]))["IPv4 inside"]).toBe("1.2.3.4");
    for (const bad of ["", "256.1.1.1", "1.2.3.4; rm -rf /", "a b", "::g", "4294967296", "0x1FFFFFFFF", "1.2.3.4/8", "x".repeat(200), undefined]) expect((await failure("ip/formats", { ip: bad })).code).toBe("BAD_IP");
  });

  test("mask and prefix converter", async () => {
    for (const v of ["/24", "24", "255.255.255.0"]) expect((await op("ip/mask", { value: v })).prefix).toBe(24);
    const m24 = Object.fromEntries((await op("ip/mask", { value: "/24" })).table.rows.map((r: string[]) => [r[0], r[1]]));
    expect(m24).toMatchObject({ "Prefix Length": "/24", Netmask: "255.255.255.0", "Wildcard Mask": "0.0.0.255", "Hosts per block": "254", "Addresses per block": "256" });
    expect(Object.fromEntries((await op("ip/mask", { value: "0" })).table.rows.map((r: string[]) => [r[0], r[1]]))).toMatchObject({ Netmask: "0.0.0.0", "Hosts per block": "4,294,967,294" });
    expect(Object.fromEntries((await op("ip/mask", { value: "/31" })).table.rows.map((r: string[]) => [r[0], r[1]]))["Hosts per block"]).toBe("2");
    expect(Object.fromEntries((await op("ip/mask", { value: "/32" })).table.rows.map((r: string[]) => [r[0], r[1]]))["Hosts per block"]).toBe("1");
    expect((await op("ip/mask", { value: "255.255.255.255" })).prefix).toBe(32);
    const wild = await op("ip/mask", { value: "0.0.0.255" });
    expect(wild.prefix).toBe(24);
    expect(wild.table.rows.at(-1)[1]).toContain("wildcard");
    const v6 = Object.fromEntries((await op("ip/mask", { value: "/64" })).table.rows.map((r: string[]) => [r[0], r[1]]));
    expect(v6).toMatchObject({ Netmask: "ffff:ffff:ffff:ffff::", "Addresses per block": "18,446,744,073,709,551,616 (2^64)" });
    for (const bad of ["", "129", "/200", "255.0.255.0", "255.255.255", "abc", "24; ls", "-1", "1.2.3.4.5", undefined, "255.255.255.256"]) expect((await failure("ip/mask", { value: bad })).code).toBe("BAD_MASK");
  });

  test("network adapters", async () => {
    const a = await op("ip/interfaces");
    expect(a.kind).toBe("interfaces");
    expect(a.count).toBe(a.interfaces.length);
    expect(a.table.rows).toHaveLength(a.count);
    for (const i of a.interfaces) expect(typeof i.type).toBe("string");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("ip/bulk", () => {
  test("splits pasted lists: comments, separators, duplicates, the 100 limit", () => {
    expect(splitTargets("8.8.8.8, 1.1.1.1;github.com # note\n# whole line\r\n\n8.8.8.8 GitHub.com  ")).toEqual({ targets: ["8.8.8.8", "1.1.1.1", "github.com"], skipped: 0 });
    const many = splitTargets(Array.from({ length: 130 }, (_, i) => `10.0.${i}.1`).join("\n"));
    expect(many.targets).toHaveLength(MAX_BULK_TARGETS);
    expect(many.skipped).toBe(30);
    expect(splitTargets(["1.1.1.1", 5 as any, "2.2.2.2"]).targets).toEqual(["1.1.1.1", "2.2.2.2"]);
    expect(() => splitTargets("x".repeat(400_000))).toThrow();
  });

  test("partial failures: each row has its own status, the rest still run", async () => {
    fakeInternet((url) => (url.pathname.startsWith("/9.9.9.9") ? json({}, 500) : ipinfoOk(url, null as any)));
    ipHooks.resolveHost = async (host) => { if (host === "gone.example.org") throw Object.assign(new Error("nx"), { code: "ENOTFOUND" }); return ["1.1.1.1"]; };
    const a = await op("ip/bulk", { text: "8.8.8.8\n10.0.0.1\ngone.example.org\nhttps://evil.example\n10.0.0.0/8\n9.9.9.9\nok.example.org\n8.8.8.8\nBAD!HOST" });
    const by = Object.fromEntries(a.rows.map((r: any) => [r.target, r]));
    expect(by["8.8.8.8"]).toMatchObject({ status: "ok", ip: "8.8.8.8", city: "Mountain View", country: "US", org: "AS15169 Google LLC" });
    expect(by["10.0.0.1"]).toMatchObject({ status: "ok", ip: "10.0.0.1" });
    expect(by["gone.example.org"]).toMatchObject({ status: "error" });
    expect(by["gone.example.org"].error).toContain("Couldn't find");
    expect(by["https://evil.example"].error).toContain("Web addresses aren't needed");
    expect(by["10.0.0.0/8"].error).toContain("subnet calculator");
    expect(by["9.9.9.9"].status).toBe("error");
    expect(by["ok.example.org"]).toMatchObject({ status: "ok", ip: "1.1.1.1" });
    expect(by["BAD!HOST"].status).toBe("error");
    expect(a.rows.map((r: any) => r.target)).toEqual(["8.8.8.8", "10.0.0.1", "gone.example.org", "https://evil.example", "10.0.0.0/8", "9.9.9.9", "ok.example.org", "BAD!HOST"]);
    expect(a.ok + a.failed).toBe(a.rows.length);
    expect(a.ok).toBe(3);
    expect(a.table.headers).toEqual(["Target", "IP", "City", "Region", "Country", "Organization / ASN", "Status"]);
    expect(a.table.rows[0]).toEqual(["8.8.8.8", "8.8.8.8", "Mountain View", "California", "US", "AS15169 Google LLC", "OK"]);
    expect(a.csv.split("\n")[0]).toBe('"target","ip","city","region","country","org","status","error"');
    expect(JSON.parse(a.json)).toHaveLength(8);
    expect(a.table.acts[0]).toEqual({ kind: "lookup", target: "8.8.8.8" });
    expect(a.table.acts[2]).toBeNull();
  });

  test("never more than 100 targets, never more than 10 at once", async () => {
    let inFlight = 0;
    let peak = 0;
    fakeInternet(async (url) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ipinfoOk(url, null as any);
    });
    const list = Array.from({ length: 150 }, (_, i) => `8.8.${Math.floor(i / 100)}.${i % 100 + 1}`).join("\n");
    const a = await op("ip/bulk", { text: list });
    expect(a.rows).toHaveLength(100);
    expect(a.skipped).toBe(50);
    expect(a.ok).toBe(100);
    expect(calls).toHaveLength(100);
    expect(peak).toBeLessThanOrEqual(BULK_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    const privateOnly = await op("ip/bulk", { targets: Array.from({ length: 150 }, (_, i) => `10.0.0.${i % 250}`).concat(Array.from({ length: 60 }, (_, i) => `10.1.0.${i}`)) });
    expect(privateOnly.rows).toHaveLength(100);
  });

  test("an offline computer fails fast instead of trying every address", async () => {
    fakeInternet(offline);
    const list = Array.from({ length: 60 }, (_, i) => `8.8.8.${i + 1}`).join("\n");
    const a = await op("ip/bulk", { text: `10.0.0.1\n${list}` });
    expect(a.rows[0].status).toBe("ok");
    expect(a.rows.slice(1).every((r: any) => r.status === "error")).toBe(true);
    expect(calls.length).toBeLessThan(40);
    expect(a.rows.at(-1).error).toBeTruthy();
  });

  test("a list that takes too long is cut off", async () => {
    fakeInternet(ipinfoOk);
    netLimits.bulkTotalMs = -1;
    const a = await op("ip/bulk", { text: "8.8.8.8\n1.1.1.1" });
    expect(a.rows.every((r: any) => r.status === "error" && r.error.includes("Not tried"))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("empty lists and bad tokens", async () => {
    expect((await failure("ip/bulk", { text: "  \n# only a comment\n" })).code).toBe("NO_TARGETS");
    expect((await failure("ip/bulk", {})).code).toBe("NO_TARGETS");
    expect((await failure("ip/bulk", { text: "8.8.8.8", token: "no good" })).code).toBe("BAD_TOKEN");
  });

  test("csv cells can't be read as spreadsheet formulas", async () => {
    fakeInternet(() => json({ ip: "8.8.8.8", city: "=HYPERLINK(\"http://evil\",\"x\")", org: "+cmd|' /C calc'!A0", region: "@SUM(1)", country: "-1+1", postal: "-12" }));
    const a = await op("ip/lookup", { target: "8.8.8.8" });
    const line = a.csv.split("\n")[1];
    expect(line).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(line).toContain(`"'+cmd`);
    expect(line).toContain(`"'@SUM(1)"`);
    expect(line).toContain(`"'-1+1"`);
    expect(line).toContain(`"-12"`);
    expect(a.csv).not.toMatch(/"[=+@]/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("ip/openurl", () => {
  test("builds the page address itself, from validated data", async () => {
    const cases: Array<[Record<string, any>, string]> = [
      [{ kind: "map", target: "37.4056,-122.0775" }, "https://www.google.com/maps?q=37.4056,-122.0775"],
      [{ kind: "map", target: "-33.86,151.2", provider: "google" }, "https://www.google.com/maps?q=-33.86,151.2"],
      [{ kind: "map", target: "37.4056,-122.0775", provider: "osm" }, "https://www.openstreetmap.org/?mlat=37.4056&mlon=-122.0775#map=10/37.4056/-122.0775"],
      [{ kind: "map", target: "37.4,-122.0", provider: "evil.com" }, "https://www.google.com/maps?q=37.4,-122"],
      [{ kind: "ipinfo", target: "8.8.8.8" }, "https://ipinfo.io/8.8.8.8"],
      [{ kind: "ipinfo", target: "2606:4700:4700:0:0:0:0:1111" }, "https://ipinfo.io/2606:4700:4700::1111"],
      [{ kind: "ipinfo", target: "as15169" }, "https://ipinfo.io/AS15169"],
      [{ kind: "bgp", target: "1.1.1.1" }, "https://bgp.he.net/ip/1.1.1.1"],
      [{ kind: "bgp", target: "AS13335" }, "https://bgp.he.net/AS13335"],
      [{ kind: "bgp", target: "8.8.8.8", url: "https://evil.example/", href: "javascript:alert(1)" }, "https://bgp.he.net/ip/8.8.8.8"],
    ];
    const mac = createContext({ platform: "darwin", home, dataDir, launch: async (command, args) => void launched.push({ command, args }) });
    for (const [body, url] of cases) {
      launched.length = 0;
      expect(await op("ip/openurl", body, mac)).toEqual({ opened: url });
      expect(launched).toEqual([{ command: "open", args: [url] }]);
      expect(OPEN_HOSTS.has(new URL(url).hostname)).toBe(true);
    }
  });

  test("uses the platform's own opener, with the address as one argument", async () => {
    const url = "https://ipinfo.io/8.8.8.8";
    for (const [platform, command, args] of [["darwin", "open", [url]], ["linux", "xdg-open", [url]], ["win32", "rundll32.exe", ["url.dll,FileProtocolHandler", url]]] as const) {
      launched.length = 0;
      const c = createContext({ platform, home, dataDir, launch: async (cmd, a) => void launched.push({ command: cmd, args: a }) });
      await op("ip/openurl", { kind: "ipinfo", target: "8.8.8.8" }, c);
      expect(launched).toEqual([{ command, args: [...args] }]);
    }
  });

  test("refuses everything that is not a known page for known data", async () => {
    const bad: Array<Record<string, any>> = [
      { kind: "url", target: "https://evil.example" }, { url: "https://evil.example" }, { kind: "ipinfo" }, { kind: "ipinfo", target: "evil.example" }, { kind: "ipinfo", target: "https://ipinfo.io/8.8.8.8" },
      { kind: "ipinfo", target: "8.8.8.8/../../x" }, { kind: "ipinfo", target: "8.8.8.8@evil.example" }, { kind: "bgp", target: "AS1;ls" }, { kind: "bgp", target: "AS" }, { kind: "bgp", target: "AS12345678901" },
      { kind: "map", target: "abc" }, { kind: "map", target: "91,0" }, { kind: "map", target: "0,181" }, { kind: "map", target: "0,0" }, { kind: "map", target: "1,2,3" }, { kind: "map", target: "1,2&x=y" }, { kind: "map", target: "https://www.google.com/maps?q=1,2" },
      { kind: "MAP", target: "1,2" }, { kind: ["map"], target: "1,2" }, { kind: "map", target: { a: 1 } }, { kind: "ipinfo", target: "fe80::1%en0" },
    ];
    for (const body of bad) expect((await failure("ip/openurl", body)).code, JSON.stringify(body)).toMatch(/BAD_(TARGET|REQUEST)/);
    expect(launched).toEqual([]);
    expect(() => buildExternalUrl("map", "1,2", "osm")).not.toThrow();
  });

  test("a computer that can't open pages gets an explanation", async () => {
    launchFails = "ENOENT";
    const c = createContext({ platform: "linux", home, dataDir, launch: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); } });
    const err = await failure("ip/openurl", { kind: "ipinfo", target: "8.8.8.8" }, c);
    expect(err.code).toBe("NO_OPENER");
    expect(err.message).toContain("xdg-utils");
    expect((await failure("ip/openurl", { kind: "ipinfo", target: "8.8.8.8" })).code).toBe("NO_OPENER");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("ip/save and ip/loadlist", () => {
  const out = join(root, "out");
  beforeAll(() => mkdirSync(out, { recursive: true }));
  const JSON_TEXT = JSON.stringify({ ip: "8.8.8.8" }, null, 2);

  test("saves a new file, and never overwrites one", async () => {
    const first = await op("ip/save", { folder: out, name: "results", format: "json", text: JSON_TEXT });
    expect(first).toMatchObject({ name: "results.json", path: join(out, "results.json"), folder: out });
    expect(readFileSync(first.path, "utf8")).toBe(`${JSON_TEXT}\n`);
    writeFileSync(join(out, "mine.csv"), "precious", "utf8");
    const second = await op("ip/save", { folder: out, name: "results", format: "json", text: JSON.stringify({ ip: "1.1.1.1" }) });
    expect(second.name).toBe("results (2).json");
    const third = await op("ip/save", { folder: out, name: "results.json", format: "json", text: JSON_TEXT });
    expect(third.name).toBe("results (3).json");
    expect(readFileSync(first.path, "utf8")).toBe(`${JSON_TEXT}\n`);
    const csv = await op("ip/save", { folder: out, name: "mine.csv", format: "csv", text: '"a","b"\n"1","2"' });
    expect(csv.name).toBe("mine (2).csv");
    expect(readFileSync(join(out, "mine.csv"), "utf8")).toBe("precious");
    expect((await op("ip/save", { folder: out, format: "csv", text: "a" })).name).toBe("ipinfo_results.csv");
    expect((await op("ip/save", { folder: out, name: "  ", format: "csv", text: "a" })).name).toBe("ipinfo_results (2).csv");
  });

  test("doesn't follow a link that sits where the new file would go", async () => {
    const target = join(out, "linked-target.txt");
    writeFileSync(target, "keep", "utf8");
    try {
      symlinkSync(target, join(out, "linked.json"));
    } catch {
      return; // links need extra rights on some systems
    }
    const saved = await op("ip/save", { folder: out, name: "linked", format: "json", text: JSON_TEXT });
    expect(saved.name).toBe("linked (2).json");
    expect(readFileSync(target, "utf8")).toBe("keep");
  });

  test("refuses unsafe names, places and content", async () => {
    const cases: Array<[Record<string, any>, string]> = [
      [{ folder: out, name: "../evil", format: "json", text: JSON_TEXT }, "BAD_NAME"],
      [{ folder: out, name: "a/b", format: "json", text: JSON_TEXT }, "BAD_NAME"],
      [{ folder: out, name: "x".repeat(300), format: "json", text: JSON_TEXT }, "BAD_NAME"],
      [{ folder: out, name: "x\u0000y", format: "json", text: JSON_TEXT }, "BAD_NAME"],
      [{ folder: out, name: "ok", format: "exe", text: JSON_TEXT }, "BAD_FORMAT"],
      [{ folder: out, name: "ok", format: "json", text: "{not json" }, "BAD_REQUEST"],
      [{ folder: out, name: "ok", format: "json", text: "   " }, "NOTHING_TO_SAVE"],
      [{ folder: out, name: "ok", format: "json", text: 5 }, "NOTHING_TO_SAVE"],
      [{ folder: out, name: "ok", format: "csv", text: "x".repeat(1024 * 1024 + 1) }, "TOO_LARGE"],
      [{ folder: "out", name: "ok", format: "json", text: JSON_TEXT }, "BAD_PATH"],
      [{ folder: "", name: "ok", format: "json", text: JSON_TEXT }, "BAD_PATH"],
      [{ folder: join(out, "missing"), name: "ok", format: "json", text: JSON_TEXT }, "NOT_FOUND"],
      [{ folder: join(out, "mine.csv"), name: "ok", format: "json", text: JSON_TEXT }, "NOT_A_FOLDER"],
      [{ folder: ctx.trashRoot, name: "ok", format: "json", text: JSON_TEXT }, "PROTECTED"],
    ];
    mkdirSync(ctx.trashRoot, { recursive: true });
    for (const [body, code] of cases) expect((await failure("ip/save", body)).code, JSON.stringify(body).slice(0, 80)).toBe(code);
    expect(readdirSync(ctx.trashRoot)).toEqual([]);
  });

  test("loads a list from a text file", async () => {
    const file = join(out, "list.txt");
    writeFileSync(file, "8.8.8.8\n# skip\n1.1.1.1, github.com\n8.8.8.8\n", "utf8");
    const r = await op("ip/loadlist", { path: file });
    expect(r).toMatchObject({ name: "list.txt", count: 3, skipped: 0, truncated: false });
    expect(r.text).toContain("github.com");
    const big = join(out, "big.txt");
    writeFileSync(big, `${"10.0.0.1\n".repeat(60_000)}`, "utf8");
    const bigRead = await op("ip/loadlist", { path: big });
    expect(bigRead.truncated).toBe(true);
    expect(bigRead.text.length).toBeLessThanOrEqual(256 * 1024);
    expect(bigRead.text.endsWith("10.0.0.1")).toBe(true);
    writeFileSync(join(out, "bin.dat"), Buffer.from([1, 2, 0, 3]));
    expect((await failure("ip/loadlist", { path: join(out, "bin.dat") })).code).toBe("NOT_TEXT");
    expect((await failure("ip/loadlist", { path: out })).code).toBe("NOT_A_FILE");
    expect((await failure("ip/loadlist", { path: join(out, "nope.txt") })).code).toBe("NOT_FOUND");
    expect((await failure("ip/loadlist", { path: "list.txt" })).code).toBe("BAD_PATH");
    expect((await failure("ip/loadlist", { path: "a\u0000b" })).code).toBe("BAD_PATH");
    expect((await failure("ip/loadlist", {})).code).toBe("BAD_PATH");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("over HTTP", () => {
  const TOKEN = "http-test-token";
  const httpLaunched: Array<{ command: string; args: string[] }> = [];
  let server: ReturnType<typeof startFileManagerServer>;
  let base: string;
  const folder = join(root, "http-out");

  beforeAll(() => {
    mkdirSync(folder, { recursive: true });
    server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "http-data"), launch: async (command, args) => void httpLaunched.push({ command, args }) } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  async function api(name: string, body: unknown = {}, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: JSON.parse(text) as any, text };
  }

  test("every operation is registered", () => {
    for (const name of ["lookup", "myip", "subnet", "interfaces", "bulk", "incidr", "split", "formats", "mask", "openurl", "save", "loadlist"]) expect(API_OPERATIONS).toContain(`ip/${name}`);
  });

  test("needs the session token and a JSON body like every other operation", async () => {
    expect((await api("ip/subnet", { cidr: "10.0.0.0/8" }, { "x-fm-token": "wrong" })).status).toBe(401);
    const noJson = await fetch(`${base}/api/ip/subnet`, { method: "POST", headers: { "x-fm-token": TOKEN, "Content-Type": "text/plain" }, body: "{}" });
    expect(noJson.status).toBe(415);
    expect((await api("ip/nothing")).status).toBe(404);
  });

  test("subnet, formats, mask and friends answer with ok:true and a table", async () => {
    const s = await api("ip/subnet", { cidr: "192.168.1.0/24" });
    expect(s.status).toBe(200);
    expect(s.json).toMatchObject({ ok: true, kind: "cidr", subnet: { usableHosts: "254" } });
    expect(s.json.table.headers).toEqual(["Property", "Value", "Category", "Description"]);
    expect((await api("ip/mask", { value: "/16" })).json.prefix).toBe(16);
    expect((await api("ip/formats", { ip: "10.0.0.1" })).json.ip).toBe("10.0.0.1");
    expect((await api("ip/split", { cidr: "10.0.0.0/24", prefix: 25 })).json.blocks).toEqual(["10.0.0.0/25", "10.0.0.128/25"]);
    expect((await api("ip/incidr", { cidr: "10.0.0.0/24", ip: "10.0.0.9" })).json.inside).toBe(true);
    expect((await api("ip/interfaces")).json.kind).toBe("interfaces");
  });

  test("a lookup goes out through the server, the token stays out of every answer", async () => {
    const token = "tok_HTTPSECRET99";
    fakeInternet(ipinfoOk);
    const r = await api("ip/lookup", { target: "8.8.8.8", token });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, ip: "8.8.8.8", source: "ipinfo.io" });
    expect(r.text).not.toContain(token);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${token}`);
    fakeInternet(offline);
    const off = await api("ip/lookup", { target: "8.8.8.8", token });
    expect(off.status).toBe(400);
    expect(off.json).toMatchObject({ ok: false, error: { code: "OFFLINE" } });
    expect(off.text).not.toContain(token);
    const bad = await api("ip/lookup", { target: "8.8.8.8", token: "bad token" });
    expect(bad.json.error.code).toBe("BAD_TOKEN");
    expect(bad.text).not.toContain("bad token");
  });

  test("injection attempts are refused with a plain message", async () => {
    fakeInternet(() => { throw new Error("must not be called"); });
    for (const target of ["https://evil.example", "8.8.8.8\r\nHost: evil", "a@b", "$(id)", "x".repeat(5000), { a: 1 }, ["8.8.8.8"]]) {
      const r = await api("ip/lookup", { target });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe("BAD_TARGET");
    }
    expect(calls).toHaveLength(0);
    expect((await api("ip/bulk", { targets: "not an array but text is fine\n$(id)" })).status).toBe(200);
    expect((await api("ip/openurl", { kind: "map", target: "1,2", url: "https://evil.example" })).json.opened).toBe("https://www.google.com/maps?q=1,2");
    expect(httpLaunched.at(-1)!.args.at(-1)).toBe("https://www.google.com/maps?q=1,2");
    expect((await api("ip/openurl", { kind: "url", target: "https://evil.example" })).status).toBe(400);
  });

  test("save and load a list", async () => {
    const saved = await api("ip/save", { folder, name: "http", format: "csv", text: '"ip"\n"8.8.8.8"' });
    expect(saved.json).toMatchObject({ ok: true, name: "http.csv" });
    expect((await api("ip/save", { folder, name: "http", format: "csv", text: '"ip"' })).json.name).toBe("http (2).csv");
    expect(readFileSync(join(folder, "http.csv"), "utf8")).toBe('"ip"\n"8.8.8.8"\n');
    writeFileSync(join(folder, "targets.txt"), "10.0.0.1\n10.0.0.2\n");
    expect((await api("ip/loadlist", { path: join(folder, "targets.txt") })).json).toMatchObject({ ok: true, count: 2 });
    expect((await api("ip/save", { folder: "relative", format: "json", text: "{}" })).json.error.code).toBe("BAD_PATH");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("the page", () => {
  const UI = join(import.meta.dir, "..", "resources", "file_manager", "ui");
  const files = readdirSync(UI).filter((f) => /^ip.*\.js$/.test(f));

  test("never talks to the internet itself, and stays small", () => {
    expect(files).toEqual(expect.arrayContaining(["ip.js", "ipview.js", "iptools.js"]));
    for (const f of files) {
      const text = readFileSync(join(UI, f), "utf8");
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|https?:\/\/|localStorage|sessionStorage|document\.cookie/);
      expect(text.split("\n").length, f).toBeLessThan(400);
    }
  });

  test("every button and field explains itself", () => {
    for (const f of files) {
      const text = readFileSync(join(UI, f), "utf8");
      for (const m of text.matchAll(/h\("(button|input|textarea|select)",/g)) {
        const around = text.slice(m.index, m.index! + 600);
        expect(/\btitle\b/.test(around), `${f}: ${around.slice(0, 80)}`).toBe(true);
      }
    }
    const ip = readFileSync(join(UI, "ip.js"), "utf8");
    expect(ip).toContain("Privacy: looking up a public address sends that address");
    expect(ip).toContain("ipinfo.io");
  });

  test("the styles only use the app's colour variables and ip- classes", () => {
    const css = readFileSync(join(UI, "ip.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    for (const m of css.matchAll(/^\s*([.#][\w-]+)/gm)) expect(m[1]!.startsWith(".ip-"), m[1]).toBe(true);
    for (const m of css.matchAll(/var\(--([\w-]+)\)/g)) expect(["bg", "panel", "text", "muted", "border", "accent", "hover", "warn-bg", "warn-text"]).toContain(m[1]!);
  });
});
