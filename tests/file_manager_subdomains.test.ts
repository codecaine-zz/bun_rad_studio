import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { startFileManagerServer, API_OPERATIONS } from "../src/features/filemanager/fmServer";
import { detectProgram, SUB_LIMITS } from "../src/features/filemanager/fmSubdomains";
import { csvCell, cleanTitle, extractTitle, isPublicSuffix, normaliseHost, parsePortList, validateTargetDomain } from "../src/features/subfinder/subfinderNames";
import { HTTP_LIMITS, USER_AGENT, createLimiter, createPacer, nonPublicReason, readCappedText, realHttp, realTcp, type HttpAnswer, type HttpRequest } from "../src/features/subfinder/subfinderNet";
import { askSource, parseAnubis, parseCrtSh, parseHackerTarget, parseOtx, PASSIVE_SOURCES, SourceError, type FetchLike } from "../src/features/subfinder/subfinderSources";
import { buildProgramArgs, parseProgramOutput, runSubfinderProgram, type ProgramProcess, type SpawnLike } from "../src/features/subfinder/subfinderProgram";
import { DEFAULT_OPTIONS, runDiscovery, type DiscoveryOptions, type EngineDeps, type SourceStatus } from "../src/features/subfinder/subfinderEngine";
import type { SubdomainResult } from "../src/features/subfinder/subfinderTypes";
import { mdEscape, toCsv, toReport, toTxt, type RunMeta } from "../src/features/filemanager/fmSubdomainsExport";
import { loadHistory, addHistory, clearHistory, MAX_HISTORY, validateEntry } from "../src/features/filemanager/fmSubdomainsStore";

// Nothing here uses the network: fetch, DNS, HTTP and TCP are all replaced, and time runs on a fake clock.

const root = mkdtempSync(join(tmpdir(), "fm-subdomains-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------------------------
// Recorded answers (small, hand-made fixtures in the shape of the real services)
// ---------------------------------------------------------------------------------------------------------------

const CRT_FIXTURE = JSON.stringify([
  { issuer_ca_id: 1, name_value: "www.example.com\nmail.example.com", common_name: "www.example.com", id: 11 },
  { name_value: "*.dev.example.com", common_name: "*.dev.example.com" },
  { name_value: "example.com\nEXAMPLE.com.", common_name: "example.com" },
  { name_value: "evil.org\nnotexample.com\nexample.com.evil.org" },
  { name_value: "user@example.com" },
  { name_value: 42 },
  null,
]);
const HT_FIXTURE = "www.example.com,93.184.216.34\napi.example.com,93.184.216.35\nbad host.example.com,1.1.1.1\n";
const OTX_FIXTURE = JSON.stringify({ passive_dns: [{ hostname: "cdn.example.com", address: "1.2.3.4" }, { hostname: "x.example.com" }, { nothing: true }, null] });
const ANUBIS_FIXTURE = JSON.stringify(["blog.example.com", "www.example.com", 7, null]);

const json = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "application/json" } });

/** A fetch that answers by host name and never reaches the network. Unknown hosts get a 404. */
function routeFetch(routes: Record<string, (url: URL, init: Parameters<FetchLike>[1]) => Response | Promise<Response>>, calls: string[] = []): FetchLike {
  return async (url, init) => {
    const u = new URL(url);
    calls.push(url);
    const route = routes[u.hostname];
    return route ? route(u, init) : new Response("not found", { status: 404 });
  };
}

const goodRoutes = () => ({
  "crt.sh": () => json(CRT_FIXTURE),
  "api.hackertarget.com": () => new Response(HT_FIXTURE),
  "otx.alienvault.com": () => json(OTX_FIXTURE),
  "jonlu.ca": () => json(ANUBIS_FIXTURE),
});

function fakeClock() {
  let t = 1_700_000_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleeps,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
  };
}

function engineDeps(over: Partial<EngineDeps> = {}): EngineDeps & { clock: ReturnType<typeof fakeClock> } {
  const clock = fakeClock();
  let n = 0;
  return {
    clock,
    fetch: routeFetch(goodRoutes()),
    resolve: async () => [],
    http: async () => { throw Object.assign(new Error("no web server"), { code: "ECONNREFUSED" }); },
    tcp: async () => false,
    now: clock.now, sleep: clock.sleep, random: () => (++n % 97) / 97, limiter: createLimiter(16),
    ...over,
  };
}

const opts = (over: Partial<DiscoveryOptions> = {}): DiscoveryOptions => ({ ...DEFAULT_OPTIONS, timeoutMs: 2000, ...over });

async function discover(domain: string, o: Partial<DiscoveryOptions>, d: Partial<EngineDeps> = {}, signal = new AbortController().signal) {
  const deps = engineDeps(d);
  const rows = new Map<string, SubdomainResult>();
  const sources = new Map<string, SourceStatus>();
  const log: string[] = [];
  const summary = await runDiscovery(domain, opts(o), deps, {
    onRow: (r) => rows.set(r.host, r),
    onSource: (s) => sources.set(s.id, s),
    log: (_l, t) => log.push(t),
  }, signal);
  return { summary, rows, sources, log, deps };
}

// ---------------------------------------------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------------------------------------------

describe("the domain box", () => {
  const ok = (input: string) => {
    const r = validateTargetDomain(input);
    if (!r.ok) throw new Error(`expected ${JSON.stringify(input)} to be accepted: ${r.reason}`);
    return r;
  };
  const refused = (input: unknown, words?: RegExp) => {
    const r = validateTargetDomain(input);
    expect(r.ok, JSON.stringify(input)).toBe(false);
    if (!r.ok) {
      expect(r.reason.length).toBeGreaterThan(10);
      if (words) expect(r.reason).toMatch(words);
    }
  };

  test("accepts ordinary names, lower-cases them and removes one trailing dot", () => {
    expect(ok("example.com").ascii).toBe("example.com");
    expect(ok("  Example.COM  ").ascii).toBe("example.com");
    expect(ok("example.com.").ascii).toBe("example.com");
    expect(ok("dev.example.co.uk").ascii).toBe("dev.example.co.uk");
    expect(ok("example.co.uk").ascii).toBe("example.co.uk");
    expect(ok("my-site.example.org").ascii).toBe("my-site.example.org");
    expect(ok("a1.io").ascii).toBe("a1.io");
  });

  test("international names give both the punycode and the readable form", () => {
    const r = ok("Bücher.Example");
    expect(r.ascii).toBe("xn--bcher-kva.example");
    expect(r.unicode).toBe("bücher.example");
    const again = ok("xn--bcher-kva.example");
    expect(again.unicode).toBe("bücher.example");
    expect(ok("münchen.de").ascii).toBe("xn--mnchen-3ya.de");
    refused("xn--.example.com");
  });

  test("refuses schemes, paths, ports, user names, spaces and wildcards with a plain message", () => {
    refused("http://example.com", /web address/);
    refused("https://example.com/", /web address/);
    refused("example.com/path", /web address/);
    refused("example.com?x=1", /web address/);
    refused("example.com#frag", /web address/);
    refused("user@example.com", /web address/);
    refused("ftp://example.com", /web address/);
    refused("javascript:alert(1)", /colon/);
    refused("example.com:8080", /port/);
    refused("example.com:", /port/);
    refused("exa mple.com", /spaces/);
    refused("*.example.com", /wildcard/);
    refused("example.com\nevil.com", /spaces|hidden/);
  });

  test("refuses IP addresses in every spelling", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "8.8.8.8", "::1", "[::1]", "2001:db8::1", "::ffff:127.0.0.1", "fe80::1"]) refused(ip, /IP address/);
    for (const odd of ["127.1", "0x7f.0.0.1", "2130706433", "1.2.3", "1.2.3.4.5"]) refused(odd);
  });

  test("refuses single names, shared suffixes and reserved endings", () => {
    refused("com", /top-level/);
    refused("localhost", /this computer/);
    refused("co.uk", /shared suffix/);
    refused("com.au", /shared suffix/);
    refused("github.io", /shared suffix/);
    refused("blogspot.com", /shared suffix/);
    refused("foo.localhost", /\.localhost/);
    refused("x.invalid", /\.invalid/);
    refused("1.0.0.127.in-addr.arpa", /\.arpa/);
    expect(isPublicSuffix("co.uk")).toBe(true);
    expect(isPublicSuffix("example.co.uk")).toBe(false);
    expect(isPublicSuffix("com")).toBe(true);
  });

  test("refuses bad shapes: underscores, long parts, a long total, empty parts, hyphens, bad endings", () => {
    refused("my_site.example.com", /underscore/);
    refused(`${"a".repeat(64)}.example.com`, /too long/);
    expect(ok(`${"a".repeat(63)}.example.com`).ascii.length).toBeGreaterThan(70);
    refused(`${Array.from({ length: 6 }, () => "a".repeat(50)).join(".")}.com`, /too long/);
    refused("example..com", /empty part/);
    refused(".example.com", /start with a dot/);
    refused("-example.com", /isn't allowed/);
    refused("example-.com", /isn't allowed/);
    refused("ab--cd.example.com", /isn't allowed/);
    refused("example.c0m1", /top-level/);
    refused("example.123", /number/);
    refused("exa$mple.com", /isn't allowed/);
    refused("exam%70le.com", /isn't allowed/);
  });

  test("refuses hidden, bidirectional and zero-width characters, empty and non-text input", () => {
    for (const hidden of ["exa\u200bmple.com", "example.com\u202e", "\u202eexample.com", "exa\u0000mple.com", "exa\u00admple.com", "exa\u2066mple.com", "ex\ufeffample.com"]) refused(hidden, /hidden|invisible/);
    refused("", /No domain/);
    refused("   ", /No domain/);
    refused(undefined);
    refused(null);
    refused(42);
    refused({ toString: () => "example.com" });
    refused(["example.com"]);
    refused("a".repeat(401), /too long/);
  });

  test("random garbage never throws and never gets through unless it is a plain name", () => {
    const alphabet = "ab9-._:/\\@*%é😀\u202e \t\n";
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 2000; i++) {
      const text = Array.from({ length: 1 + Math.floor(rand() * 20) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
      const r = validateTargetDomain(text);
      if (r.ok) {
        expect(r.ascii).toMatch(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]+$/);
        expect(r.ascii.length).toBeLessThanOrEqual(253);
      }
    }
  });
});

describe("host names from sources (hostile data)", () => {
  const scope = "example.com";
  test("normalizes: lower case, strips a leading wildcard and a trailing dot, keeps the apex", () => {
    expect(normaliseHost("WWW.Example.COM", scope)).toBe("www.example.com");
    expect(normaliseHost("*.dev.example.com", scope)).toBe("dev.example.com");
    expect(normaliseHost("api.example.com.", scope)).toBe("api.example.com");
    expect(normaliseHost("example.com", scope)).toBe("example.com");
    expect(normaliseHost("  mail.example.com  ", scope)).toBe("mail.example.com");
    expect(normaliseHost("bücher.example.com", scope)).toBe("xn--bcher-kva.example.com");
  });
  test("refuses other domains, look-alikes, junk, injection strings and hidden characters (never 'cleans' them)", () => {
    const bad = [
      "evil.org", "notexample.com", "example.com.evil.org", "evilexample.com", "ex.ample.com.evil.com", "*.*.example.com", "*example.com",
      "user@example.com", "a b.example.com", "a<b>.example.com", "javascript:alert(1).example.com", "x.example.com/path", "x.example.com:8080", "-a.example.com", "a-.example.com",
      "a_b.example.com", "..example.com", "a..example.com", ".example.com", "a\u202e.example.com", "a\u200b.example.com", "a\0.example.com", "<script>.example.com", "'; DROP TABLE.example.com",
      `${"a".repeat(64)}.example.com`, `${"a.".repeat(130)}example.com`, "", " ", "*", "*.", "xn--.example.com",
    ];
    for (const raw of bad) expect(normaliseHost(raw, scope), JSON.stringify(raw)).toBeNull();
    for (const notText of [undefined, null, 5, {}, [], true]) expect(normaliseHost(notText, scope)).toBeNull();
    expect(normaliseHost("a".repeat(500), scope)).toBeNull();
  });
});

describe("titles, ports and spreadsheet cells", () => {
  test("titles: entities decoded, control and bidi characters removed, long ones cut, never HTML", () => {
    expect(extractTitle("<html><head><TITLE>  Hello &amp; welcome\n  home </TITLE>")).toBe("Hello & welcome home");
    expect(extractTitle("<title>&lt;b&gt;bold&lt;/b&gt; &#65;&#x42;&nbsp;C &copy;</title>")).toBe("<b>bold</b> AB C ©");
    expect(extractTitle("<title>a\u202eb\u0007c\u200bd\u0000e</title>")).toBe("a b c d e");
    expect(extractTitle("<title>" + "x".repeat(100000) + "</title>").length).toBeLessThanOrEqual(120);
    expect(extractTitle("<title>" + "😀".repeat(500) + "</title>")).toBe("😀".repeat(119) + "…");
    expect(extractTitle("<title>never closed " + "y".repeat(10000))).toHaveLength(120);
    expect(extractTitle("<p>no title here</p>")).toBe("");
    expect(extractTitle("<title></title>")).toBe("");
    expect(extractTitle("")).toBe("");
    expect(extractTitle("\u0000\u0000\u0000\ufffd\ufffd\ufffd<title>binary</title>")).toBe("");
    expect(extractTitle("x".repeat(70000) + "<title>too late</title>")).toBe("");
    expect(extractTitle("<title class=\"a\">x</title>")).toBe("x");
    expect(cleanTitle("&#0;&#xD800;&#1114112;&unknown;")).toBe("&unknown;");
  });

  test("ports: lists, ranges, duplicates, limits and bad input", () => {
    const ok = (v: unknown) => { const r = parsePortList(v); if (!r.ok) throw new Error(r.reason); return r.ports; };
    expect(ok("80,443")).toEqual([80, 443]);
    expect(ok(" 443 ,80, 80 ")).toEqual([80, 443]);
    expect(ok("8000-8003")).toEqual([8000, 8001, 8002, 8003]);
    expect(ok([22, "80"])).toEqual([22, 80]);
    expect(ok("")).toEqual([]);
    expect(ok(undefined)).toEqual([]);
    expect(ok(Array.from({ length: 20 }, (_, i) => i + 1).join(","))).toHaveLength(20);
    for (const bad of ["0", "65536", "-1", "80;443", "http", "80,abc", "1.5", "9999999", "8000-7000", "1-21", Array.from({ length: 21 }, (_, i) => i + 1).join(","), "1-5,100-116", "x".repeat(400), {}, true, [80, {}], Array(300).fill(80)]) {
      const r = parsePortList(bad);
      expect(r.ok, JSON.stringify(bad)?.slice(0, 40)).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
    }
  });

  test("a cell that a spreadsheet would run as a formula is made plain text", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=x", "\r=x"]) expect(csvCell(evil).replace(/^"/, "")).toStartWith("'");
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(404)).toBe("404");
    expect(csvCell(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Source parsers (recorded fixtures) and asking a source
// ---------------------------------------------------------------------------------------------------------------

describe("source parsers", () => {
  test("crt.sh: names from name_value and common_name, junk entries skipped", () => {
    const names = parseCrtSh(CRT_FIXTURE);
    expect(names).toContain("www.example.com");
    expect(names).toContain("mail.example.com");
    expect(names).toContain("*.dev.example.com");
    expect(names).toContain("user@example.com");
    expect(names).not.toContain(undefined);
    expect(() => parseCrtSh("not json")).toThrow(SourceError);
    expect(() => parseCrtSh("{\"a\":1}")).toThrow(/unexpected shape/);
    expect(() => parseCrtSh("<html>Gateway Timeout</html>")).toThrow(/valid JSON/);
  });
  test("HackerTarget: first column of each line; its error texts are explained", () => {
    expect(parseHackerTarget(HT_FIXTURE)).toEqual(["www.example.com", "api.example.com", "bad host.example.com"]);
    expect(() => parseHackerTarget("API count exceeded - Increase Quota with Membership")).toThrow(/daily limit/);
    expect(() => parseHackerTarget("error check your search parameter")).toThrow(SourceError);
    expect(parseHackerTarget("No records found for example.com")).toEqual([]);
  });
  test("AlienVault OTX: hostnames from passive_dns, anything else ignored", () => {
    expect(parseOtx(OTX_FIXTURE)).toEqual(["cdn.example.com", "x.example.com"]);
    expect(parseOtx("{}")).toEqual([]);
    expect(() => parseOtx("[]")).toThrow(/unexpected shape/);
    expect(() => parseOtx(JSON.stringify({ passive_dns: "no" }))).toThrow(/unexpected shape/);
  });
  test("Anubis: only strings", () => {
    expect(parseAnubis(ANUBIS_FIXTURE)).toEqual(["blog.example.com", "www.example.com"]);
    expect(() => parseAnubis("{}")).toThrow(/unexpected shape/);
  });
  test("each source's address is built from the validated domain only", () => {
    expect(PASSIVE_SOURCES.map((s) => s.id)).toEqual(["crtsh", "hackertarget", "alienvault", "anubis"]);
    for (const s of PASSIVE_SOURCES) expect(new URL(s.url("example.com")).protocol).toBe("https:");
    expect(PASSIVE_SOURCES[0]!.url("example.com")).toBe("https://crt.sh/?q=%25.example.com&output=json");
  });
});

describe("asking one source", () => {
  const def = PASSIVE_SOURCES[0]!;
  test("sends an identifying User-Agent, no cookies or credentials, and refuses redirects", async () => {
    let seen: Parameters<FetchLike>[1] | null = null;
    await askSource(def, "example.com", { timeoutMs: 1000, fetch: async (_u, init) => { seen = init; return json("[]"); } });
    expect(seen!.headers["User-Agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toContain("Codecaine");
    expect(seen!.redirect).toBe("manual");
    expect(seen!.credentials).toBe("omit");
    expect(Object.keys(seen!.headers).map((k) => k.toLowerCase())).not.toContain("cookie");
  });
  test("explains each failure in plain words", async () => {
    const ask = (fetchImpl: FetchLike, timeoutMs = 1000) => askSource(def, "example.com", { timeoutMs, fetch: fetchImpl }).then(() => "ok", (e) => e as SourceError);
    expect(((await ask(async () => json("x", 429))) as SourceError).code).toBe("rate-limit");
    expect(((await ask(async () => json("x", 503))) as SourceError).message).toContain("HTTP 503");
    const moved = (await ask(async () => new Response("", { status: 301, headers: { location: "https://elsewhere.example/" } }))) as SourceError;
    expect(moved.code).toBe("http");
    expect(moved.message).toContain("probably moved");
    expect(((await ask(async () => { throw new TypeError("fetch failed"); })) as SourceError).code).toBe("network");
    const big = await ask(async () => new Response("x".repeat(100), { headers: { "content-length": String(50 * 1024 * 1024) } }));
    expect((big as SourceError).code).toBe("too-large");
    const slow = (await ask(() => new Promise<Response>(() => {}), 40)) as SourceError;
    expect(slow.code).toBe("timeout");
    expect(slow.message).toContain("didn't answer");
  });
  test("a body without a content-length is cut off at the size limit while reading", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { sent++; if (sent > 200) c.close(); else c.enqueue(chunk); } });
    await expect(readCappedText(new Response(body), 3 * 1024 * 1024)).rejects.toThrow(/larger than/);
    expect(sent).toBeLessThan(10);
  });
  test("a caller's abort stops the question at once", async () => {
    const abort = new AbortController();
    const asking = askSource(def, "example.com", { timeoutMs: 10_000, signal: abort.signal, fetch: () => new Promise<Response>(() => {}) }).catch((e) => e as SourceError);
    setTimeout(() => abort.abort(), 20);
    expect(((await asking) as SourceError).code).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The engine: passive discovery
// ---------------------------------------------------------------------------------------------------------------

describe("passive discovery", () => {
  test("merges all sources, tags each host with who found it, drops other domains and junk, and counts per source", async () => {
    const { rows, sources, summary } = await discover("example.com", {});
    expect([...rows.keys()].sort()).toEqual(["api.example.com", "blog.example.com", "cdn.example.com", "dev.example.com", "example.com", "mail.example.com", "www.example.com", "x.example.com"]);
    expect(rows.get("www.example.com")!.sources.sort()).toEqual(["anubis", "crtsh", "hackertarget"]);
    expect(rows.get("cdn.example.com")!.sources).toEqual(["alienvault"]);
    expect(sources.get("crtsh")).toMatchObject({ state: "done", count: 4, dropped: 4 });
    expect(sources.get("crtsh")!.dropped).toBe(4);
    expect(sources.get("hackertarget")).toMatchObject({ state: "done", count: 2, dropped: 1 });
    expect(sources.get("alienvault")).toMatchObject({ state: "done", count: 2 });
    expect(sources.get("anubis")).toMatchObject({ state: "done", count: 2 });
    expect(summary).toMatchObject({ state: "done", hosts: 8, truncated: false });
    for (const r of rows.values()) {
      expect(r.ip).toBeUndefined();
      expect(r.httpStatus).toBeUndefined();
    }
  });

  test("passive runs never resolve, probe or connect", async () => {
    let touched = 0;
    await discover("example.com", {}, { resolve: async () => { touched++; return []; }, http: async () => { touched++; throw new Error("x"); }, tcp: async () => { touched++; return false; } });
    expect(touched).toBe(0);
  });

  test("only the asked sources are asked", async () => {
    const calls: string[] = [];
    const { sources } = await discover("example.com", { sources: ["anubis"] }, { fetch: routeFetch(goodRoutes(), calls) });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!).hostname).toBe("jonlu.ca");
    expect([...sources.keys()]).toEqual(["anubis"]);
  });

  test("one source failing, timing out or sending garbage does not fail the run; each shows its own error", async () => {
    const { rows, sources, summary } = await discover("example.com", { timeoutMs: 60 }, {
      fetch: routeFetch({
        ...goodRoutes(),
        "crt.sh": () => new Promise<Response>(() => {}),
        "api.hackertarget.com": () => { throw new TypeError("connection refused"); },
        "otx.alienvault.com": () => json("<html>oops</html>"),
      }),
    });
    expect(sources.get("crtsh")).toMatchObject({ state: "timeout" });
    expect(sources.get("crtsh")!.error).toContain("didn't answer");
    expect(sources.get("hackertarget")).toMatchObject({ state: "failed" });
    expect(sources.get("hackertarget")!.error).toContain("couldn't be reached");
    expect(sources.get("alienvault")).toMatchObject({ state: "failed" });
    expect(sources.get("alienvault")!.error).toContain("valid JSON");
    expect(sources.get("anubis")).toMatchObject({ state: "done", count: 2 });
    expect([...rows.keys()].sort()).toEqual(["blog.example.com", "www.example.com"]);
    expect(summary.state).toBe("done");
  });

  test("every source failing still ends the run normally, with an error for each", async () => {
    const { sources, summary, rows } = await discover("example.com", {}, { fetch: async () => { throw new TypeError("offline"); } });
    expect([...sources.values()].every((s) => s.state === "failed" && !!s.error)).toBe(true);
    expect(rows.size).toBe(0);
    expect(summary.state).toBe("done");
  });

  test("cancelling mid-run stops the questions, keeps what arrived, and reports cancelled", async () => {
    const abort = new AbortController();
    const { sources, rows, summary } = await discover("example.com", { timeoutMs: 10_000 }, {
      fetch: routeFetch({ ...goodRoutes(), "crt.sh": () => new Promise<Response>(() => {}), "jonlu.ca": () => new Promise<Response>(() => {}) }),
    }, (() => { setTimeout(() => abort.abort(), 60); return abort.signal; })());
    expect(summary.state).toBe("cancelled");
    expect(sources.get("crtsh")!.state).toBe("cancelled");
    expect(sources.get("anubis")!.state).toBe("cancelled");
    expect(sources.get("hackertarget")!.state).toBe("done");
    expect(rows.has("api.example.com")).toBe(true);
  });

  test("already-cancelled runs do nothing", async () => {
    const abort = new AbortController();
    abort.abort();
    const calls: string[] = [];
    const { summary, sources } = await discover("example.com", { resolve: true }, { fetch: routeFetch(goodRoutes(), calls) }, abort.signal);
    expect(calls).toEqual([]);
    expect(summary.state).toBe("cancelled");
    expect([...sources.values()].every((s) => s.state === "cancelled")).toBe(true);
  });

  test("hostile data: wildcards, other domains, control and bidi characters, javascript: strings, markup", async () => {
    const hostile = [
      "*.api.example.com", "*.*.example.com", "evil.org", "example.com.evil.org", "a\u202e.example.com", "x\u200b.example.com", "a\0.example.com", "javascript:alert(1)//.example.com",
      "<img src=x onerror=alert(1)>.example.com", "'\"><script>.example.com", "ok.example.com\nnext.example.com", "UPPER.EXAMPLE.COM", "dup.example.com", "dup.example.com.", "*.dup.example.com",
      "-bad.example.com", "good-1.example.com", "xn--bcher-kva.example.com", "bücher.example.com", "a".repeat(64) + ".example.com", "http://x.example.com", "x.example.com:443", "x.example.com/",
    ];
    const { rows } = await discover("example.com", { sources: ["anubis"] }, { fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(hostile)) }) });
    expect([...rows.keys()].sort()).toEqual(["api.example.com", "dup.example.com", "good-1.example.com", "upper.example.com", "xn--bcher-kva.example.com"].sort());
    for (const host of rows.keys()) expect(host).toMatch(/^[a-z0-9.-]+$/);
  });

  test("10,000+ entries are read quickly, de-duplicated and capped by the result limit", async () => {
    const many = Array.from({ length: 30_000 }, (_, i) => `h${i % 12_000}.example.com`);
    const t0 = performance.now();
    const all = await discover("example.com", { sources: ["anubis"], maxResults: 10_000 }, { fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(many)) }) });
    expect(all.rows.size).toBe(10_000);
    expect(all.summary.truncated).toBe(true);
    expect(all.sources.get("anubis")!.note).toContain("limit of 10000");
    expect(performance.now() - t0).toBeLessThan(5000);
    const small = await discover("example.com", { sources: ["anubis"], maxResults: 50 }, { fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(many)) }) });
    expect(small.rows.size).toBe(50);
    const exact = await discover("example.com", { sources: ["anubis"], maxResults: 20_000 }, { fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(many)) }) });
    expect(exact.rows.size).toBe(12_000);
    expect(exact.summary.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Limits and pacing on a fake clock
// ---------------------------------------------------------------------------------------------------------------

describe("rate limits and caps", () => {
  test("the pacer spaces requests to one host and leaves other hosts alone", async () => {
    const clock = fakeClock();
    const pacer = createPacer(250, clock.now, clock.sleep);
    await pacer.wait("a.example.com");
    await pacer.wait("a.example.com");
    await pacer.wait("a.example.com");
    await pacer.wait("b.example.com");
    expect(clock.sleeps).toEqual([250, 250]);
    clock.sleeps.length = 0;
    await clock.sleep(1000);
    clock.sleeps.length = 0;
    await pacer.wait("a.example.com");
    expect(clock.sleeps).toEqual([]);
  });

  test("the limiter never runs more than its cap, hands slots on in order, and lets waiters leave when cancelled", async () => {
    const limiter = createLimiter(3);
    let inFlight = 0;
    let most = 0;
    const order: number[] = [];
    const work = (i: number) => limiter.run(async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      order.push(i);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => work(i)));
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(most).toBe(3);
    expect(limiter.peak).toBe(3);
    expect(limiter.inFlight).toBe(0);
    expect(order).toEqual(Array.from({ length: 20 }, (_, i) => i));
    const abort = new AbortController();
    const blockers = [1, 2, 3].map(() => limiter.run(() => new Promise((r) => setTimeout(r, 30))));
    const waiting = limiter.run(async () => "ran", abort.signal);
    abort.abort();
    expect(await waiting).toBeUndefined();
    await Promise.all(blockers);
    expect(limiter.inFlight).toBe(0);
    expect(await limiter.run(async () => "after", abort.signal)).toBeUndefined();
  });

  test("DNS lookups never exceed the chosen concurrency (and 10 at most), even with many hosts", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `h${i}.example.com`);
    let inFlight = 0;
    let most = 0;
    const resolve = async () => { inFlight++; most = Math.max(most, inFlight); await new Promise((r) => setTimeout(r, 2)); inFlight--; return ["93.184.216.34"]; };
    const fetchMany = routeFetch({ "jonlu.ca": () => json(JSON.stringify(many)) });
    const a = await discover("example.com", { sources: ["anubis"], resolve: true, dnsConcurrency: 4 }, { resolve, fetch: fetchMany });
    expect(most).toBe(4);
    expect(a.rows.size).toBe(60);
    most = 0;
    await discover("example.com", { sources: ["anubis"], resolve: true, dnsConcurrency: 10 }, { resolve, fetch: fetchMany });
    expect(most).toBe(10);
  });

  test("a global limiter shared by two runs keeps the program under one cap", async () => {
    const limiter = createLimiter(5);
    const many = Array.from({ length: 40 }, (_, i) => `h${i}.example.com`);
    let inFlight = 0;
    let most = 0;
    const resolve = async () => { inFlight++; most = Math.max(most, inFlight); await new Promise((r) => setTimeout(r, 2)); inFlight--; return ["93.184.216.34"]; };
    const d = { resolve, limiter, fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(many)) }) };
    await Promise.all([discover("example.com", { sources: ["anubis"], resolve: true, dnsConcurrency: 10 }, d), discover("example.com", { sources: ["anubis"], resolve: true, dnsConcurrency: 10 }, d)]);
    expect(most).toBeLessThanOrEqual(5);
    expect(limiter.peak).toBe(5);
  });

  test("probing one host repeatedly (a redirect chain, several ports) waits between requests on the fake clock", async () => {
    const clock = fakeClock();
    const stamps: number[] = [];
    await discover("example.com", { sources: ["anubis"], resolve: true, probeHttp: true, ports: [80, 443, 8080], rateLimitMs: 400 }, {
      now: clock.now, sleep: clock.sleep,
      fetch: routeFetch({ "jonlu.ca": () => json(JSON.stringify(["www.example.com"])) }),
      resolve: async () => ["93.184.216.34"],
      http: async () => {
        stamps.push(clock.now());
        return stamps.length < 3 ? { status: 301, location: "https://www.example.com/", body: "" } : { status: 200, body: "<title>ok</title>" };
      },
      tcp: async () => { stamps.push(clock.now()); return true; },
    });
    expect(stamps.length).toBeGreaterThanOrEqual(5);
    // every request to the same host is at least 400 ms after the one before it of the same kind
    const http = stamps.slice(0, 3);
    for (let i = 1; i < http.length; i++) expect(http[i]! - http[i - 1]!).toBeGreaterThanOrEqual(400);
    const tcp = stamps.slice(3);
    for (let i = 1; i < tcp.length; i++) expect(tcp[i]! - tcp[i - 1]!).toBeGreaterThanOrEqual(400);
    expect(clock.sleeps.every((ms) => ms <= 400)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Private addresses
// ---------------------------------------------------------------------------------------------------------------

describe("which addresses count as private", () => {
  test("private, loopback, link-local, ULA, shared, multicast and reserved ranges are refused", () => {
    const refusedIps = [
      "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "127.0.0.1", "127.255.255.254", "169.254.169.254", "169.254.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.255",
      "100.64.0.1", "100.127.255.255", "192.0.0.5", "192.0.2.7", "198.18.0.1", "198.19.255.255", "198.51.100.9", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
      "::", "::1", "fe80::1", "febf::1", "fc00::1", "fd12:3456:789a::1", "fec0::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
      "64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::1", "2002:0a00:0001::1", "::2", "::127.0.0.1",
    ];
    for (const ip of refusedIps) expect(nonPublicReason(ip), ip).not.toBeNull();
  });
  test("ordinary public addresses are allowed", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "11.0.0.1", "100.63.255.255", "100.128.0.1", "169.253.0.1", "192.169.0.1", "2606:2800:220:1:248:1893:25c8:1946", "2001:4860:4860::8888", "::ffff:93.184.216.34", "64:ff9b::5db8:d822"]) expect(nonPublicReason(ip), ip).toBeNull();
  });
  test("things that are not IP addresses are never allowed", () => {
    for (const x of ["", "example.com", "1.2.3", "1.2.3.4.5", "999.1.1.1", "gggg::1", "1:2:3:4:5:6:7:8:9", "::1::2", "10.0.0.1/8", "0x7f.0.0.1"]) expect(nonPublicReason(x), x).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Active steps: DNS, wildcard, HTTP, ports
// ---------------------------------------------------------------------------------------------------------------

const oneHost = (...hosts: string[]) => routeFetch({ "jonlu.ca": () => json(JSON.stringify(hosts)) });
const dnsMap = (map: Record<string, string[] | Error>) => async (host: string) => {
  const answer = map[host];
  if (answer instanceof Error) throw answer;
  return answer ?? [];
};

describe("DNS verification and wildcard detection", () => {
  test("records addresses (IPv4 first), leaves hosts with no answer empty, and counts failed lookups", async () => {
    const { rows, summary, log } = await discover("example.com", { sources: ["anubis"], resolve: true }, {
      fetch: oneHost("www.example.com", "api.example.com", "gone.example.com", "broken.example.com"),
      resolve: dnsMap({ "www.example.com": ["93.184.216.34"], "api.example.com": ["2606:2800::1", "93.184.216.35", "93.184.216.35"], "broken.example.com": Object.assign(new Error("x"), { code: "ETIMEDOUT" }) }),
    });
    expect(rows.get("www.example.com")!.ip).toEqual(["93.184.216.34"]);
    expect(rows.get("api.example.com")!.ip).toEqual(["93.184.216.35", "2606:2800::1"]);
    expect(rows.get("gone.example.com")!.ip).toEqual([]);
    expect(rows.get("broken.example.com")!.ip).toBeUndefined();
    expect(summary.dnsFailures).toBe(1);
    expect(log.some((l) => l.includes("broken.example.com"))).toBe(true);
    expect(summary.wildcard.tested).toBe(false);
  });

  test("a wildcard zone (random names answer with the same address) marks the hosts that only match it", async () => {
    const asked: string[] = [];
    const { rows, summary } = await discover("example.com", { sources: ["anubis"], resolve: true, wildcard: true }, {
      fetch: oneHost("www.example.com", "real.example.com", "alsofake.example.com", "mixed.example.com"),
      resolve: async (host) => {
        asked.push(host);
        if (host.startsWith("wc-")) return ["203.0.113.7"];
        return ({ "www.example.com": ["203.0.113.7"], "real.example.com": ["93.184.216.40"], "alsofake.example.com": ["203.0.113.7"], "mixed.example.com": ["203.0.113.7", "93.184.216.41"] } as Record<string, string[]>)[host] ?? [];
      },
    });
    expect(summary.wildcard).toEqual({ tested: true, detected: true, ips: ["203.0.113.7"] });
    expect(rows.get("www.example.com")!.isWildcard).toBe(true);
    expect(rows.get("alsofake.example.com")!.isWildcard).toBe(true);
    expect(rows.get("real.example.com")!.isWildcard).toBeUndefined();
    expect(rows.get("mixed.example.com")!.isWildcard).toBeUndefined();
    const probes = asked.filter((h) => h.startsWith("wc-"));
    expect(probes).toHaveLength(3);
    expect(new Set(probes).size).toBe(3);
    for (const p of probes) expect(p).toMatch(/^wc-[a-z0-9]{9}\.example\.com$/);
  });

  test("a zone that does not answer for random names is not a wildcard", async () => {
    const { rows, summary } = await discover("example.com", { sources: ["anubis"], resolve: true, wildcard: true }, { fetch: oneHost("www.example.com"), resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }) });
    expect(summary.wildcard).toEqual({ tested: true, detected: false, ips: [] });
    expect(rows.get("www.example.com")!.isWildcard).toBeUndefined();
  });

  test("wildcard detection with DNS off asks nothing", async () => {
    let asked = 0;
    const { summary } = await discover("example.com", { sources: ["anubis"], resolve: false, wildcard: true }, { fetch: oneHost("www.example.com"), resolve: async () => { asked++; return []; } });
    expect(asked).toBe(0);
    expect(summary.wildcard.tested).toBe(false);
  });
});

describe("HTTP probing with an injected client", () => {
  const http200 = (title = "Hello"): HttpAnswer => ({ status: 200, body: `<html><title>${title}</title>` });
  const probe = (o: Partial<DiscoveryOptions>, d: Partial<EngineDeps>, ...hosts: string[]) =>
    discover("example.com", { sources: ["anubis"], resolve: true, probeHttp: true, ...o }, { fetch: oneHost(...hosts), ...d });

  test("status, scheme and a cleaned title; HTTPS first; the connection goes to the address that was checked", async () => {
    const seen: HttpRequest[] = [];
    const { rows } = await probe({}, { resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }), http: async (r) => { seen.push(r); return http200("Hi &amp; <b>there</b>"); } }, "www.example.com");
    const row = rows.get("www.example.com")!;
    expect(row).toMatchObject({ httpStatus: 200, httpScheme: "https", httpTitle: "Hi & <b>there</b>" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ scheme: "https", host: "www.example.com", ip: "93.184.216.34", port: 443, verifyTls: true });
  });

  test("when HTTPS can't connect it tries plain HTTP; an untrusted certificate is reported, not hidden", async () => {
    const { rows } = await probe({}, {
      resolve: dnsMap({ "a.example.com": ["93.184.216.34"], "b.example.com": ["93.184.216.35"] }),
      http: async (r) => {
        if (r.scheme === "https") throw Object.assign(new Error("x"), { code: r.host === "a.example.com" ? "ECONNREFUSED" : "CERT" });
        return http200("plain");
      },
    }, "a.example.com", "b.example.com");
    expect(rows.get("a.example.com")).toMatchObject({ httpStatus: 200, httpScheme: "http" });
    expect(rows.get("b.example.com")).toMatchObject({ httpStatus: 200, httpScheme: "http" });
    expect(rows.get("b.example.com")!.note).toContain("certificate isn't trusted");
    expect(rows.get("a.example.com")!.note).toBeUndefined();
  });

  test("accepting untrusted certificates is an explicit option, passed down to the client", async () => {
    const seen: Array<boolean | undefined> = [];
    await probe({ verifyTls: false }, { resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }), http: async (r) => { seen.push(r.verifyTls); return http200(); } }, "www.example.com");
    expect(seen).toEqual([false]);
  });

  test("hosts that nothing answers are left without a status, with no invented data", async () => {
    const { rows } = await probe({}, { resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }), http: async () => { throw Object.assign(new Error("x"), { code: "ETIMEDOUT" }); } }, "www.example.com");
    expect(rows.get("www.example.com")!.httpStatus).toBeUndefined();
    expect(rows.get("www.example.com")!.httpTitle).toBeUndefined();
  });

  test("hosts with no address are not probed at all", async () => {
    let calls = 0;
    await probe({}, { resolve: async () => [], http: async () => { calls++; return http200(); } }, "www.example.com");
    expect(calls).toBe(0);
  });

  test("redirects: at most 3 are followed, and the rest are reported", async () => {
    let calls = 0;
    const { rows } = await probe({}, { resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }), http: async () => { calls++; return { status: 302, location: `/hop${calls}`, body: "" }; } }, "www.example.com");
    // HTTPS: 1 request + 3 redirects, then the same again over HTTP is not needed because HTTPS answered
    expect(calls).toBe(4);
    expect(rows.get("www.example.com")).toMatchObject({ httpStatus: 302 });
    expect(rows.get("www.example.com")!.note).toContain("More than 3 redirects");
    expect(rows.get("www.example.com")!.httpTitle).toBeUndefined();
  });

  test("a redirect to another host of the same domain is followed (and re-checked); the note says where it went", async () => {
    const seen: string[] = [];
    const { rows } = await probe({}, {
      resolve: dnsMap({ "example.com": ["93.184.216.34"], "www.example.com": ["93.184.216.35"] }),
      http: async (r) => { seen.push(`${r.scheme}://${r.host}@${r.ip}`); return r.host === "example.com" ? { status: 301, location: "https://www.example.com/home", body: "" } : http200("Welcome"); },
    }, "example.com");
    expect(seen).toEqual(["https://example.com@93.184.216.34", "https://www.example.com@93.184.216.35"]);
    expect(rows.get("example.com")).toMatchObject({ httpStatus: 200, httpTitle: "Welcome" });
    expect(rows.get("example.com")!.note).toContain("Redirects to www.example.com");
  });

  test("redirects to another site, to credentials, other ports, other schemes, plain HTTP downgrades or junk are not followed", async () => {
    const cases: Array<[string, RegExp]> = [
      ["https://evil.org/steal", /another site/],
      ["https://user:pw@www.example.com/", /not followed/],
      ["https://www.example.com:8443/", /not followed/],
      ["ftp://www.example.com/", /not a web address/],
      ["javascript:alert(1)", /not a web address/],
      ["http://www.example.com/", /downgrade/],
      ["https://127.0.0.1/", /another site/],
    ];
    for (const [location, why] of cases) {
      const seen: string[] = [];
      const { rows } = await probe({}, { resolve: dnsMap({ "www.example.com": ["93.184.216.34"] }), http: async (r) => { seen.push(r.host); return { status: 302, location, body: "" }; } }, "www.example.com");
      expect(seen, location).toEqual(["www.example.com"]);
      expect(rows.get("www.example.com")!.httpStatus, location).toBe(302);
      expect(rows.get("www.example.com")!.note, location).toMatch(why);
    }
  });

  test("a redirect that points to a private address is refused, even inside the same domain", async () => {
    const connected: string[] = [];
    const { rows, summary } = await probe({}, {
      resolve: dnsMap({ "www.example.com": ["93.184.216.34"], "intranet.example.com": ["10.0.0.5"] }),
      http: async (r) => { connected.push(r.ip); return { status: 302, location: "https://intranet.example.com/admin", body: "" }; },
    }, "www.example.com", "intranet.example.com");
    expect(connected).toEqual(["93.184.216.34"]);
    expect(rows.get("www.example.com")!.note).toMatch(/redirect led to intranet\.example\.com points to a private network address/);
    expect(rows.get("intranet.example.com")!.httpStatus).toBeUndefined();
    expect(summary.blocked).toBeGreaterThanOrEqual(2);
  });

  test("loopback, link-local, private, ULA, mapped and mixed answers are refused before any connection", async () => {
    const answers: Record<string, string[]> = {
      "loop.example.com": ["127.0.0.1"], "meta.example.com": ["169.254.169.254"], "lan.example.com": ["192.168.1.10"], "ula.example.com": ["fd00::1"],
      "mapped.example.com": ["::ffff:10.0.0.1"], "mixed.example.com": ["93.184.216.34", "10.0.0.9"], "six.example.com": ["::1"],
    };
    const connected: string[] = [];
    const tcp: string[] = [];
    const { rows, summary } = await probe({ ports: [80, 443] }, {
      resolve: dnsMap({ ...answers, "ok.example.com": ["93.184.216.34"] }),
      http: async (r) => { connected.push(r.host); return http200(); },
      tcp: async (ip) => { tcp.push(ip); return true; },
    }, ...Object.keys(answers), "ok.example.com");
    expect(connected).toEqual(["ok.example.com"]);
    expect(tcp).toEqual(["93.184.216.34", "93.184.216.34"]);
    for (const host of Object.keys(answers)) {
      expect(rows.get(host)!.httpStatus, host).toBeUndefined();
      expect(rows.get(host)!.openPorts, host).toBeUndefined();
      expect(rows.get(host)!.note, host).toMatch(/not probed/i);
    }
    expect(summary.blocked).toBe(7);
  });

  test("a name that answers with a public address first and a private one later (DNS rebinding) never gets a connection to the private address", async () => {
    const lookups = new Map<string, number>();
    const connected: string[] = [];
    const { rows } = await probe({}, {
      resolve: async (host) => {
        const n = (lookups.get(host) ?? 0) + 1;
        lookups.set(host, n);
        return n === 1 ? ["93.184.216.34"] : ["127.0.0.1"];
      },
      http: async (r) => { connected.push(r.ip); return http200(); },
    }, "rebind.example.com");
    expect(connected).toEqual([]);
    expect(rows.get("rebind.example.com")!.httpStatus).toBeUndefined();
    expect(rows.get("rebind.example.com")!.note).toMatch(/not probed/i);
    expect(lookups.get("rebind.example.com")).toBeGreaterThanOrEqual(2);
  });

  test("with 'allow private addresses' on, internal hosts are probed (and only then)", async () => {
    const connected: string[] = [];
    const { rows, summary } = await probe({ allowPrivate: true, ports: [80] }, {
      resolve: dnsMap({ "lan.example.com": ["192.168.1.10"] }),
      http: async (r) => { connected.push(r.ip); return http200("Router"); },
      tcp: async () => true,
    }, "lan.example.com");
    expect(connected).toEqual(["192.168.1.10"]);
    expect(rows.get("lan.example.com")).toMatchObject({ httpStatus: 200, httpTitle: "Router", openPorts: [80] });
    expect(summary.blocked).toBe(0);
  });

  test("probing needs the lookup step: with DNS off nothing is probed", async () => {
    let calls = 0;
    await discover("example.com", { sources: ["anubis"], resolve: false, probeHttp: true, ports: [80] }, { fetch: oneHost("www.example.com"), http: async () => { calls++; return http200(); }, tcp: async () => { calls++; return true; } });
    expect(calls).toBe(0);
  });

  test("cancelling during the web checks stops the remaining hosts", async () => {
    const abort = new AbortController();
    const hosts = Array.from({ length: 30 }, (_, i) => `h${i}.example.com`);
    let calls = 0;
    const { summary, rows } = await discover("example.com", { sources: ["anubis"], resolve: true, probeHttp: true, httpConcurrency: 2 }, {
      fetch: oneHost(...hosts), resolve: async () => ["93.184.216.34"],
      http: async () => { calls++; if (calls === 3) abort.abort(); return http200(); },
    }, abort.signal);
    expect(summary.state).toBe("cancelled");
    expect(calls).toBeLessThan(10);
    expect(rows.size).toBe(30);
  });
});

describe("port probing", () => {
  test("connects to the checked address (never the name), reports the open ports, sorted as asked", async () => {
    const asked: string[] = [];
    const { rows } = await discover("example.com", { sources: ["anubis"], resolve: true, ports: [22, 80, 443] }, {
      fetch: oneHost("www.example.com", "closed.example.com"),
      resolve: dnsMap({ "www.example.com": ["93.184.216.34"], "closed.example.com": ["93.184.216.35"] }),
      tcp: async (ip, port) => { asked.push(`${ip}:${port}`); return ip === "93.184.216.34" && port !== 22; },
    });
    expect(rows.get("www.example.com")!.openPorts).toEqual([80, 443]);
    expect(rows.get("closed.example.com")!.openPorts).toEqual([]);
    expect(asked.sort()).toEqual(["93.184.216.34:22", "93.184.216.34:443", "93.184.216.34:80", "93.184.216.35:22", "93.184.216.35:443", "93.184.216.35:80"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The real subfinder program (a stand-in executable; nothing real is run)
// ---------------------------------------------------------------------------------------------------------------

const win = process.platform === "win32";
const bin = join(root, "bin");

function standIn(name: string, script: string): string {
  mkdirSync(bin, { recursive: true });
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("the subfinder program engine", () => {
  test.skipIf(win)("runs with an argument list: the domain is its own element and the flags are real subfinder flags", async () => {
    const record = join(root, "argv.txt");
    const exe = standIn("sf-ok", `printf '%s\\n' "$@" > '${record}'\necho '{"host":"a.example.com","source":["crtsh"]}'\necho '{"host":"B.EXAMPLE.com","source":["x"]}'\necho 'plain.example.com'\necho 'not json {'\necho '{"nohost":1}'\necho '[INF] some log line'`);
    const result = await runSubfinderProgram(exe, "example.com", { timeoutMs: 5000, timeoutSec: 5 });
    expect(result.names).toEqual(["a.example.com", "B.EXAMPLE.com", "plain.example.com"]);
    const argv = readFileSync(record, "utf8").trim().split("\n");
    expect(argv).toEqual(buildProgramArgs("example.com", { timeoutSec: 5 }));
    expect(argv.slice(0, 4)).toEqual(["-silent", "-json", "-nc", "-disable-update-check"]);
    expect(argv.slice(-2)).toEqual(["-d", "example.com"]);
    expect(argv).not.toContain("-all");
  });

  test("hostile domains are refused before anything starts (no flag injection, no shell words)", () => {
    const hostile = ["-o /etc/passwd", "--config=/etc/passwd", "-d x.com", "example.com; rm -rf /", "example.com && id", "$(id).example.com", "`id`.example.com", "example.com\n-silent", "a b.com", "../../x.com", "EXAMPLE.com", "example.com.", "com", "127.0.0.1", ""];
    for (const domain of hostile) expect(() => buildProgramArgs(domain, { timeoutSec: 5 }), JSON.stringify(domain)).toThrow(SourceError);
    let started = 0;
    const spawn: SpawnLike = () => { started++; throw new Error("must not start"); };
    for (const domain of hostile) expect(runSubfinderProgram("/bin/echo", domain, { timeoutMs: 100, timeoutSec: 1, spawn })).rejects.toBeInstanceOf(SourceError);
    expect(started).toBe(0);
  });

  test("a fake process: output is read as lines, the arguments reach it untouched, nothing is run through a shell", async () => {
    const calls: string[][] = [];
    const spawn: SpawnLike = (argv) => {
      calls.push(argv);
      const text = '{"host":"api.example.com"}\n{"host":"evil.org"}\nwww.example.com\n';
      return { stdout: new Response(text).body, stderr: null, exited: Promise.resolve(0), kill() {} } satisfies ProgramProcess;
    };
    const r = await runSubfinderProgram("/opt/x/subfinder", "example.com", { timeoutMs: 1000, timeoutSec: 3, spawn });
    expect(r.names).toEqual(["api.example.com", "evil.org", "www.example.com"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("/opt/x/subfinder");
    expect(calls[0]!.slice(1)).toEqual(buildProgramArgs("example.com", { timeoutSec: 3 }));
  });

  test.skipIf(win)("a program that runs too long is stopped; nothing printed yet means a timeout error", async () => {
    const exe = standIn("sf-slow", "exec sleep 30");
    const t0 = Date.now();
    const err = await runSubfinderProgram(exe, "example.com", { timeoutMs: 300, timeoutSec: 1 }).catch((e) => e as SourceError);
    expect((err as SourceError).code).toBe("timeout");
    expect((err as SourceError).message).toContain("didn't finish");
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  test.skipIf(win)("a program that printed some hosts and then ran out of time keeps them, with a note", async () => {
    const exe = standIn("sf-partial", "echo partial.example.com\nexec sleep 30");
    const r = await runSubfinderProgram(exe, "example.com", { timeoutMs: 400, timeoutSec: 1 });
    expect(r.names).toEqual(["partial.example.com"]);
    expect(r.note).toContain("may be incomplete");
  });

  test.skipIf(win)("endless output is cut at the output cap and the program is stopped", async () => {
    const exe = standIn("sf-flood", "exec yes flood.example.com");
    const t0 = Date.now();
    const r = await runSubfinderProgram(exe, "example.com", { timeoutMs: 20_000, timeoutSec: 20 });
    expect(r.note).toContain("cut short");
    expect(r.names.length).toBeGreaterThan(1000);
    expect(r.names.length).toBeLessThanOrEqual(500_000);
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  test.skipIf(win)("a failing program gives a plain error with its last message; cancelling stops it", async () => {
    const bad = standIn("sf-bad", "echo 'boom: bad provider config' >&2\nexit 3");
    const err = await runSubfinderProgram(bad, "example.com", { timeoutMs: 5000, timeoutSec: 5 }).catch((e) => e as SourceError);
    expect((err as SourceError).code).toBe("program");
    expect((err as SourceError).message).toContain("boom: bad provider config");
    const slow = standIn("sf-slow2", "exec sleep 30");
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 100);
    const t0 = Date.now();
    const cancelled = await runSubfinderProgram(slow, "example.com", { timeoutMs: 20_000, timeoutSec: 20, signal: abort.signal }).catch((e) => e as SourceError);
    expect((cancelled as SourceError).code).toBe("cancelled");
    expect(Date.now() - t0).toBeLessThan(5000);
    const missing = await runSubfinderProgram(join(bin, "does-not-exist"), "example.com", { timeoutMs: 1000, timeoutSec: 1 }).catch((e) => e as SourceError);
    expect((missing as SourceError).code).toBe("program");
  });

  test("output parsing is defensive: ANSI codes, huge lines, wrong shapes", () => {
    expect(parseProgramOutput("\u001b[32ma.example.com\u001b[0m\n{\"host\":1}\n{\"name\":\"n.example.com\"}\n" + "x".repeat(5000) + "\n\n[INF] hi\nwith space\n")).toEqual(["a.example.com", "n.example.com"]);
    expect(parseProgramOutput("")).toEqual([]);
  });

  test("merged into a run as the 'subfinder' source with the other sources, and validated like them", async () => {
    const spawn: SpawnLike = () => ({ stdout: new Response('{"host":"api.example.com"}\n{"host":"evil.org"}\n{"host":"only-sf.example.com"}\n{"host":"a\\u202e.example.com"}\n').body, stderr: null, exited: Promise.resolve(0), kill() {} });
    const { rows, sources } = await discover("example.com", { sources: ["hackertarget", "subfinder"], programPath: "/opt/x/subfinder" }, { spawn });
    expect(rows.get("api.example.com")!.sources.sort()).toEqual(["hackertarget", "subfinder"]);
    expect(rows.get("only-sf.example.com")!.sources).toEqual(["subfinder"]);
    expect(rows.has("evil.org")).toBe(false);
    expect(sources.get("subfinder")).toMatchObject({ state: "done", count: 2, dropped: 2 });
  });

  test("asking for the program when it isn't installed fails only that source, with the install hint", async () => {
    const { sources, rows } = await discover("example.com", { sources: ["anubis", "subfinder"], programPath: null });
    expect(sources.get("subfinder")!.state).toBe("failed");
    expect(sources.get("subfinder")!.error).toContain("brew install subfinder");
    expect(sources.get("anubis")!.state).toBe("done");
    expect(rows.size).toBe(2);
  });

  test.skipIf(win)("detection: version and path from a stand-in, and a different program with the same name is not accepted", async () => {
    const dir = join(root, "detect");
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, "subfinder");
    writeFileSync(exe, "#!/bin/sh\necho '[INF] Current Version: v9.8.7' >&2\necho '[INF] Subfinder Config Directory: /nowhere' >&2\n");
    chmodSync(exe, 0o755);
    const found = await detectProgram(createContext({ home: root, dataDir: join(root, "d1"), toolDirs: [dir] }));
    expect(found).toMatchObject({ installed: true, path: exe, version: "9.8.7" });
    expect(found.hint).toContain("brew install subfinder");
    const other = join(root, "detect2");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "subfinder"), "#!/bin/sh\necho hello\n");
    chmodSync(join(other, "subfinder"), 0o755);
    expect((await detectProgram(createContext({ home: root, dataDir: join(root, "d2"), toolDirs: [other] }))).installed).toBe(false);
    expect((await detectProgram(createContext({ home: root, dataDir: join(root, "d3"), toolDirs: [join(root, "nothing")] }))).installed).toBe(false);
  });

  test.skipIf(!Bun.which("subfinder"))("when the real program is installed here, only its version is asked (it is never run against a domain)", async () => {
    const info = await detectProgram(createContext({ home: root, dataDir: join(root, "d4") }));
    expect(info.installed).toBe(true);
    expect(info.version).toMatch(/^\d+\.\d+/);
    expect(info.path).toContain("subfinder");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Files: CSV, JSON, report, history
// ---------------------------------------------------------------------------------------------------------------

const sampleRows: SubdomainResult[] = [
  { host: "www.example.com", sources: ["crtsh", "anubis"], ip: ["93.184.216.34"], httpStatus: 200, httpTitle: "=HYPERLINK(\"http://evil\",\"x\")", openPorts: [80, 443] },
  { host: "api.example.com", sources: ["crtsh"], ip: ["93.184.216.35"], httpStatus: 301, httpTitle: "+cmd|' /C calc'!A0", isWildcard: true, note: "Redirects to www.example.com." },
  { host: "old.example.com", sources: ["alienvault"], ip: [], httpTitle: "@SUM(1+1), \"quoted\"\nnew line" },
];
const sampleMeta: RunMeta = {
  domain: "example.com", unicode: "example.com", startedAt: 1_700_000_000_000, endedAt: 1_700_000_012_000, state: "done",
  steps: { resolve: true, probeHttp: true, ports: [80, 443], wildcard: true, allowPrivate: false },
  sources: [
    { id: "crtsh", label: "crt.sh", state: "done", count: 2, dropped: 1, ms: 5 },
    { id: "anubis", label: "Anubis", state: "failed", count: 0, dropped: 0, ms: 5, error: "Anubis couldn't be reached." },
  ],
  summary: { state: "done", hosts: 3, truncated: false, wildcard: { tested: true, detected: true, ips: ["203.0.113.7"] }, dnsFailures: 0, blocked: 1, durationMs: 12000 },
  maxResults: 2000,
};

describe("export formats and the report", () => {
  test("CSV: formula-like cells are neutralised, quotes and newlines escaped, one header row", () => {
    const csv = toCsv(sampleRows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("host,sources,ip addresses,http status,page title,open ports,wildcard,note");
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(csv).toContain(",301,'+cmd|' /C calc'!A0,");
    expect(csv).toContain("\"'@SUM(1+1), \"\"quoted\"\"\nnew line\"");
    expect(csv).toContain("api.example.com,crtsh,93.184.216.35,301,");
    expect(csv.endsWith("\r\n")).toBe(true);
    for (const cell of csv.split(/\r\n|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
  });
  test("TXT is one host per line, sorted; empty stays empty", () => {
    expect(toTxt(sampleRows)).toBe("api.example.com\nold.example.com\nwww.example.com\n");
    expect(toTxt([])).toBe("");
  });
  test("Markdown escaping keeps text from the network from becoming formatting, links or HTML", () => {
    const s = mdEscape("[click](http://evil)|<img src=x onerror=1> *bold* `code` # head\nline2");
    expect(s).not.toMatch(/(?<!\\)[[\]<>|*`#]/);
    expect(s).not.toContain("\n");
  });
  test("the report has the date, target, sources, counts, the hosts and notes in plain words", () => {
    const md = toReport(sampleMeta, sampleRows, new Date("2026-03-04T05:06:07Z"));
    expect(md).toContain("# Subdomain report: example.com");
    expect(md).toContain("**Date:** 2026-03-04 05:06:07 UTC");
    expect(md).toContain("**Target:** example.com");
    expect(md).toContain("**Hosts found:** 3");
    expect(md).toContain("| crt.sh | answered | 2 |");
    expect(md).toContain("| Anubis | Anubis couldn't be reached. | 0 |");
    expect(md).toContain("With an IP address (live in DNS): 2");
    expect(md).toContain("Answered over HTTP or HTTPS: 2");
    expect(md).toContain("Matching the wildcard answer: 1");
    expect(md).toContain("## Notes in plain words");
    expect(md).toContain("not a complete or guaranteed list");
    expect(md).toContain("Active steps were used");
    expect(md).toContain("a wildcard");
    expect(md).toContain("Hosts that pointed to private or internal addresses (1) were not probed");
    expect(md).toContain("| www.example.com |");
    expect(md).not.toContain("<img");
    expect(md).toContain("=HYPERLINK\\(");
  });
  test("a passive-only report says nothing was contacted", () => {
    const md = toReport({ ...sampleMeta, steps: { resolve: false, probeHttp: false, ports: [], wildcard: false, allowPrivate: false }, summary: { ...sampleMeta.summary!, wildcard: { tested: false, detected: false, ips: [] }, blocked: 0 } }, sampleRows.slice(0, 1));
    expect(md).toContain("Only passive sources were used. No computer at the target was contacted");
    expect(md).not.toContain("With an IP address");
  });
});

describe("history store", () => {
  const entry = (n: number, extra: Record<string, unknown> = {}) => ({
    domain: "example.com", unicode: "example.com", at: new Date(1_700_000_000_000 + n * 1000).toISOString(), state: "done" as const, durationMs: 1000,
    counts: { hosts: n, live: 0, http: 0, withPorts: 0, wildcard: 0 }, sources: [{ id: "crtsh", state: "done", count: n }],
    steps: { resolve: false, probeHttp: false, ports: [], wildcard: false }, truncated: false, ...extra,
  });
  test("keeps the newest 20, newest first, and clear forgets everything", async () => {
    const ctx = createContext({ home: root, dataDir: join(root, "hist1") });
    for (let i = 1; i <= 25; i++) await addHistory(ctx, entry(i));
    const all = await loadHistory(ctx);
    expect(all).toHaveLength(MAX_HISTORY);
    expect(all[0]!.counts.hosts).toBe(25);
    expect(all.at(-1)!.counts.hosts).toBe(6);
    expect(await clearHistory(ctx)).toBe(20);
    expect(await loadHistory(ctx)).toEqual([]);
    expect(existsSync(join(root, "hist1", "file_manager_subdomains_history.json"))).toBe(false);
  });
  test("two entries added at the same moment are both kept", async () => {
    const ctx = createContext({ home: root, dataDir: join(root, "hist2") });
    await Promise.all(Array.from({ length: 8 }, (_, i) => addHistory(ctx, entry(i))));
    expect(await loadHistory(ctx)).toHaveLength(8);
  });
  test("a damaged or hand-edited file is ignored entry by entry; stored hosts are re-validated", async () => {
    const ctx = createContext({ home: root, dataDir: join(root, "hist3") });
    mkdirSync(join(root, "hist3"), { recursive: true });
    const good = { ...entry(1), id: "abcdef012345" };
    const evilRow = { host: "evil.org", sources: ["x"] };
    const hostRow = { host: "ok.example.com", sources: ["crtsh", "bad source!"], ip: ["1.2.3.4", "<script>"], httpTitle: "a\u202eb", openPorts: [80, 70000, "x"] };
    writeFileSync(join(root, "hist3", "file_manager_subdomains_history.json"), JSON.stringify({ history: [good, { ...good, id: "bad id" }, { ...good, id: "abcdef012346", domain: "com" }, { ...good, id: "abcdef012347", counts: { hosts: -1 } }, { ...good, id: "abcdef012348", results: [evilRow, hostRow, null, 5] }, "nonsense", null] }));
    const all = await loadHistory(ctx);
    expect(all.map((e) => e.id)).toEqual(["abcdef012345", "abcdef012348"]);
    expect(all[1]!.results).toEqual([{ host: "ok.example.com", sources: ["crtsh"], ip: ["1.2.3.4"], httpTitle: "a b", openPorts: [80] }]);
    writeFileSync(join(root, "hist3", "file_manager_subdomains_history.json"), "{ not json");
    expect(await loadHistory(ctx)).toEqual([]);
    expect(validateEntry(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The real HTTP client and TCP connect, against a throw-away server on this computer (no outside network)
// ---------------------------------------------------------------------------------------------------------------

describe("the real HTTP client", () => {
  type Reply = (request: string, socket: { write(data: string | Uint8Array): number; end(): void }) => void;
  const servers: Array<{ stop(): void }> = [];
  const requests: string[] = [];
  function serve(reply: Reply) {
    const server = Bun.listen<undefined>({
      hostname: "127.0.0.1", port: 0,
      socket: { data(socket, data) { const text = Buffer.from(data).toString("latin1"); requests.push(text); reply(text, socket); }, open() {}, close() {}, error() {} },
    });
    servers.push(server);
    return server.port;
  }
  afterAll(() => { for (const s of servers) s.stop(); });
  const get = (port: number, extra: Partial<HttpRequest> = {}) => realHttp({ scheme: "http", host: "www.example.com", ip: "127.0.0.1", port, timeoutMs: 2000, ...extra });
  const respond = (head: string, body = "") => ((_r, s) => { s.write(`${head}\r\n\r\n${body}`); s.end(); }) as Reply;

  test("sends one plain GET: the Host name, an identifying User-Agent, no cookies, no compression", async () => {
    requests.length = 0;
    const port = serve(respond("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8", "<html><title>Real &amp; local</title></html>"));
    const answer = await get(port);
    expect(answer.status).toBe(200);
    expect(extractTitle(answer.body)).toBe("Real & local");
    const sent = requests[0]!;
    expect(sent).toStartWith("GET / HTTP/1.1\r\n");
    expect(sent).toContain(`Host: www.example.com:${port}\r\n`);
    expect(sent).toContain(`User-Agent: ${USER_AGENT}\r\n`);
    expect(sent).toContain("Accept-Encoding: identity");
    expect(sent.toLowerCase()).not.toContain("cookie");
    expect(sent.toLowerCase()).not.toContain("authorization");
  });

  test("reads a chunked body, and reports the Location of a redirect", async () => {
    const chunked = "5\r\n<titl\r\n9\r\ne>Hello</\r\n7\r\ntitle>x\r\n0\r\n\r\n";
    const port = serve(respond("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: text/html", chunked));
    expect(extractTitle((await get(port)).body)).toBe("Hello");
    const moved = await get(serve(respond("HTTP/1.1 301 Moved Permanently\r\nLocation: https://www.example.com/home\r\nContent-Length: 0")));
    expect(moved).toMatchObject({ status: 301, location: "https://www.example.com/home" });
  });

  test("compressed or non-text bodies give no text (so no title is invented from binary)", async () => {
    expect((await get(serve(respond("HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Type: text/html", "<title>x</title>")))).body).toBe("");
    expect((await get(serve(respond("HTTP/1.1 200 OK\r\nContent-Type: image/png", "<title>x</title>")))).body).toBe("");
    expect((await get(serve(respond("HTTP/1.0 404 Not Found\r\nContent-Type: text/html", "<title>Nope</title>")))).status).toBe(404);
  });

  test("something that isn't a web server's answer is refused with a code", async () => {
    const err = await get(serve((_r, s) => { s.write("SSH-2.0-OpenSSH_9.0\r\n\r\n"); s.end(); })).catch((e) => e);
    expect(err.code).toBe("BAD_RESPONSE");
    const huge = await get(serve((_r, s) => { s.write(`HTTP/1.1 200 OK\r\nX-Big: ${"a".repeat(40_000)}`); })).catch((e) => e);
    expect(huge.code).toBe("BAD_RESPONSE");
    const closed = await get(serve((_r, s) => s.end())).catch((e) => e);
    expect(closed.code).toBe("BAD_RESPONSE");
  });

  test("only the start of a page is read, however much the server sends", async () => {
    const port = serve((_r, s) => {
      s.write("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<title>Big page</title>");
      const block = "x".repeat(64 * 1024);
      for (let i = 0; i < 160; i++) s.write(block);
    });
    const t0 = Date.now();
    const answer = await get(port);
    expect(extractTitle(answer.body)).toBe("Big page");
    expect(answer.body.length).toBeLessThanOrEqual(HTTP_LIMITS.bodyBytes);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test("silence ends at the time limit, refusal and cancelling are reported, and nothing is left open", async () => {
    const quiet = serve(() => {});
    const t0 = Date.now();
    expect((await get(quiet, { timeoutMs: 250 }).catch((e) => e)).code).toBe("ETIMEDOUT");
    expect(Date.now() - t0).toBeLessThan(2000);
    const dead = serve(() => {});
    servers.pop()!.stop();
    expect((await get(dead).catch((e) => e)).code).toBe("ECONNREFUSED");
    const abort = new AbortController();
    const pending = get(quiet, { timeoutMs: 5000, signal: abort.signal }).catch((e) => e);
    setTimeout(() => abort.abort(), 50);
    expect((await pending).code).toBe("ABORTED");
    expect((await get(quiet, { signal: abort.signal }).catch((e) => e)).code).toBe("ABORTED");
  });

  test("TCP connect: open is true, closed is false, and it gives up at the time limit", async () => {
    const open = serve(() => {});
    expect(await realTcp("127.0.0.1", open, 1000)).toBe(true);
    const closed = serve(() => {});
    servers.pop()!.stop();
    expect(await realTcp("127.0.0.1", closed, 1000)).toBe(false);
    const abort = new AbortController();
    abort.abort();
    expect(await realTcp("127.0.0.1", open, 1000, abort.signal)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Through the real server: token, loopback, validation, limits, files
// ---------------------------------------------------------------------------------------------------------------

describe("Subdomains operations over HTTP", () => {
  const TOKEN = "sub-token-1";
  const home = join(root, "home");
  const out = join(home, "out");
  const dataDir = join(root, "data");
  const launched: Array<{ command: string; args: string[] }> = [];
  type Routes = Parameters<typeof routeFetch>[0];
  const world: { routes: Routes; resolve: (h: string) => Promise<string[]>; http: (r: HttpRequest) => Promise<HttpAnswer>; tcp: (ip: string, port: number) => Promise<boolean> } = {
    routes: goodRoutes(), resolve: async () => ["93.184.216.34"], http: async () => ({ status: 200, body: "<title>Hello</title>" }), tcp: async () => true,
  };
  let server: ReturnType<typeof startFileManagerServer>;
  let base = "";
  let n = 0;
  const client = () => `tab${++n}`;

  beforeAll(() => {
    mkdirSync(out, { recursive: true });
    const progDir = join(root, "srvbin");
    mkdirSync(progDir, { recursive: true });
    if (!win) {
      const exe = join(progDir, "subfinder");
      writeFileSync(exe, "#!/bin/sh\necho '[INF] Current Version: v3.2.1' >&2\necho '[INF] Subfinder Config Directory: /x' >&2\nif [ \"$1\" = \"-version\" ]; then exit 0; fi\necho '{\"host\":\"viaprogram.example.com\",\"source\":[\"crtsh\"]}'\necho '{\"host\":\"evil.org\"}'\necho '{\"host\":\"www.example.com\"}'\n");
      chmodSync(exe, 0o755);
    }
    server = startFileManagerServer({
      port: 0, token: TOKEN,
      context: {
        home, dataDir, toolDirs: win ? [] : [join(root, "srvbin")], launch: async (command, args) => void launched.push({ command, args }),
        subdomains: {
          fetch: (url, init) => routeFetch(world.routes)(url, init),
          resolve: (host) => world.resolve(host),
          http: (req) => world.http(req),
          tcp: (ip, port) => world.tcp(ip, port),
        },
      },
    });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  async function api(op: string, body: unknown = {}, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function untilDone(id: string, ms = 15_000) {
    const end = Date.now() + ms;
    for (;;) {
      const r = await api("subdomains/status", { id, since: 0 });
      if (r.json.run.state !== "running") return r.json.run;
      if (Date.now() > end) throw new Error("run did not finish");
      await sleep(20);
    }
  }
  async function run(domain: string, options: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    const started = await api("subdomains/start", { domain, options, client: client(), ...extra });
    if (started.status !== 200) throw new Error(`start failed: ${JSON.stringify(started.json)}`);
    return untilDone(started.json.run.id);
  }
  const refusedWith = async (body: Record<string, unknown>, code: string, op = "subdomains/start") => {
    const r = await api(op, body);
    expect(r.status, JSON.stringify(body)).toBe(400);
    expect(r.json.error.code, JSON.stringify(body)).toBe(code);
    expect(String(r.json.error.message).length).toBeGreaterThan(15);
    return r.json.error.message as string;
  };
  const reset = () => {
    world.routes = goodRoutes();
    world.resolve = async () => ["93.184.216.34"];
    world.http = async () => ({ status: 200, body: "<title>Hello</title>" });
    world.tcp = async () => true;
  };

  test("every operation is registered", () => {
    for (const op of ["info", "start", "status", "results", "cancel", "export", "report", "open", "history", "history/clear"]) expect(API_OPERATIONS).toContain(`subdomains/${op}`);
  });

  test("they need the token, a JSON body, and a local Host and Origin", async () => {
    const plain = (headers: Record<string, string>, body = "{}") => fetch(`${base}/api/subdomains/info`, { method: "POST", headers, body });
    expect((await plain({ "Content-Type": "application/json" })).status).toBe(401);
    expect((await plain({ "Content-Type": "application/json", "x-fm-token": "wrong" })).status).toBe(401);
    expect((await plain({ "x-fm-token": TOKEN, "Content-Type": "text/plain" })).status).toBe(415);
    expect((await plain({ "x-fm-token": TOKEN, "Content-Type": "application/json", Origin: "https://evil.example" })).status).toBeGreaterThanOrEqual(400);
    expect((await plain({ "x-fm-token": TOKEN, "Content-Type": "application/json", Host: "attacker.example" })).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${base}/api/subdomains/start`, { method: "GET" })).status).not.toBe(200);
    expect((await plain({ "x-fm-token": TOKEN, "Content-Type": "application/json" }, "[1]")).status).toBe(400);
  });

  test("info: the program, sources, defaults and limits", async () => {
    const { json: info } = await api("subdomains/info");
    expect(info.sources.map((s: any) => s.id)).toEqual(["crtsh", "hackertarget", "alienvault", "anubis", "subfinder"]);
    for (const s of info.sources) expect(s.note.length).toBeGreaterThan(10);
    expect(info.defaults).toMatchObject({ timeoutSec: 15, maxResults: 2000, ports: "80,443", dnsConcurrency: 8, httpConcurrency: 4 });
    expect(info.limits).toMatchObject({ maxPorts: 20, maxResults: 10_000, maxDnsConcurrency: 10, maxHttpConcurrency: 5, maxRedirects: 3, maxRuns: 2, maxHistory: 20 });
    expect(info.tools.subfinder.hint).toContain("brew install subfinder");
    if (!win) expect(info.tools.subfinder).toMatchObject({ installed: true, version: "3.2.1" });
  });

  test("a passive run: progress per source, rows, counts, and nothing contacted", async () => {
    reset();
    let active = 0;
    world.resolve = async () => { active++; return []; };
    world.http = async () => { active++; throw new Error("x"); };
    world.tcp = async () => { active++; return false; };
    const done = await run("example.com");
    expect(done.state).toBe("done");
    expect(done.domain).toBe("example.com");
    expect(done.sources.map((s: any) => [s.id, s.state, s.count])).toEqual([["crtsh", "done", 4], ["hackertarget", "done", 2], ["alienvault", "done", 2], ["anubis", "done", 2]]);
    expect(done.counts).toEqual({ hosts: 8, live: 0, http: 0, withPorts: 0, wildcard: 0 });
    expect(done.rows.map((r: any) => r.host).sort()).toContain("www.example.com");
    expect(done.rows.find((r: any) => r.host === "www.example.com").sources.sort()).toEqual(["anubis", "crtsh", "hackertarget"]);
    expect(done.log.length).toBeGreaterThan(3);
    expect(done.phase).toMatchObject({ phase: "sources", done: 4, total: 4 });
    expect(active).toBe(0);
    const again = await api("subdomains/results", { id: done.id, since: done.rev ?? 0 });
    expect(again.json.rows.length).toBeGreaterThanOrEqual(0);
    const all = await api("subdomains/results", { id: done.id });
    expect(all.json).toMatchObject({ total: 8, more: false, state: "done" });
    expect(all.json.rows).toHaveLength(8);
    const none = await api("subdomains/results", { id: done.id, since: all.json.rev });
    expect(none.json.rows).toEqual([]);
  });

  test("active steps: the ownership confirmation is required by the server and remembered per domain for the session", async () => {
    reset();
    const options = { resolve: true, rateLimitMs: 100 };
    const first = await refusedWith({ domain: "mine.test-owner.com", options }, "PERMISSION_NEEDED");
    expect(first).toContain("own this domain or have permission");
    for (const extra of [{ probeHttp: true }, { probePorts: true, ports: "80" }, { wildcard: true }]) await refusedWith({ domain: "mine.test-owner.com", options: { resolve: true, ...extra } }, "PERMISSION_NEEDED");
    const ok = await run("mine.test-owner.com", options, { permission: true });
    expect(ok.state).toBe("done");
    expect(ok.options.resolve).toBe(true);
    // remembered for this domain, not for another one
    const again = await run("mine.test-owner.com", options);
    expect(again.state).toBe("done");
    await refusedWith({ domain: "other-site.example.org", options }, "PERMISSION_NEEDED");
    // passive runs never need it
    expect((await run("other-site.example.org")).state).toBe("done");
  });

  test("a full active run: DNS, wildcard flags, web status and title, open ports, private addresses refused", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(JSON.stringify(["www.act.example.net", "fake.act.example.net", "lan.act.example.net", "dead.act.example.net"]));
    world.resolve = async (h) => ({ "www.act.example.net": ["93.184.216.34"], "fake.act.example.net": ["203.0.113.7"], "lan.act.example.net": ["10.0.0.4"] } as Record<string, string[]>)[h] ?? (h.startsWith("wc-") ? ["203.0.113.7"] : []);
    world.http = async (r) => ({ status: r.host === "www.act.example.net" ? 200 : 403, body: `<title>${r.host}</title>` });
    world.tcp = async (_ip, port) => port === 443;
    const done = await run("act.example.net", { sources: ["anubis"], resolve: true, wildcard: true, probeHttp: true, probePorts: true, ports: "80, 443", rateLimitMs: 100 }, { permission: true });
    const by = (h: string) => done.rows.find((r: any) => r.host === h);
    expect(by("www.act.example.net")).toMatchObject({ ip: ["93.184.216.34"], httpStatus: 200, httpTitle: "www.act.example.net", openPorts: [443], httpScheme: "https" });
    expect(by("fake.act.example.net")).toMatchObject({ isWildcard: true });
    expect(by("lan.act.example.net").note).toMatch(/private network address/);
    expect(by("lan.act.example.net").httpStatus).toBeUndefined();
    expect(by("dead.act.example.net").ip).toEqual([]);
    expect(done.summary.wildcard).toMatchObject({ tested: true, detected: true });
    expect(done.summary.blocked).toBeGreaterThanOrEqual(1);
    expect(done.counts).toMatchObject({ hosts: 4, live: 3, wildcard: 1 });
  });

  test("option checks give plain messages, and each bad value is refused", async () => {
    reset();
    await refusedWith({}, "BAD_DOMAIN");
    await refusedWith({ domain: "http://example.com" }, "BAD_DOMAIN");
    await refusedWith({ domain: "co.uk" }, "BAD_DOMAIN");
    await refusedWith({ domain: "example.com", options: "x" }, "BAD_OPTION");
    await refusedWith({ domain: "example.com", options: [] }, "BAD_OPTION");
    await refusedWith({ domain: "example.com", options: { sources: [] } }, "NO_SOURCES");
    await refusedWith({ domain: "example.com", options: { sources: ["nope"] } }, "BAD_SOURCES");
    await refusedWith({ domain: "example.com", options: { sources: "crtsh" } }, "BAD_SOURCES");
    await refusedWith({ domain: "example.com", options: { sources: [5] } }, "BAD_SOURCES");
    for (const bad of [{ timeoutSec: 2 }, { timeoutSec: 61 }, { timeoutSec: "abc" }, { maxResults: 0 }, { maxResults: 10_001 }, { maxResults: 1.5 }, { dnsConcurrency: 11 }, { dnsConcurrency: 0 }, { httpConcurrency: 6 }, { rateLimitMs: 50 }, { rateLimitMs: 6000 }]) {
      await refusedWith({ domain: "example.com", options: bad }, "BAD_OPTION");
    }
    for (const flag of ["resolve", "probeHttp", "probePorts", "wildcard", "allowPrivate", "keepResults", "acceptUntrustedTls"]) await refusedWith({ domain: "example.com", options: { [flag]: "yes" } }, "BAD_OPTION");
    await refusedWith({ domain: "example.com", options: { probeHttp: true } }, "NEEDS_DNS");
    await refusedWith({ domain: "example.com", options: { wildcard: true } }, "NEEDS_DNS");
    await refusedWith({ domain: "example.com", options: { resolve: true, probePorts: true, ports: "" }, permission: true }, "BAD_PORTS");
    await refusedWith({ domain: "example.com", options: { resolve: true, probePorts: true, ports: "0" }, permission: true }, "BAD_PORTS");
    await refusedWith({ domain: "example.com", options: { resolve: true, probePorts: true, ports: Array.from({ length: 21 }, (_, i) => i + 1).join(",") }, permission: true }, "BAD_PORTS");
    await refusedWith({ domain: "example.com", options: { ports: "80;443" } }, "BAD_PORTS");
    await refusedWith({ domain: "example.com", client: "bad name!" }, "BAD_REQUEST");
    await refusedWith({ id: "nope" }, "NO_RUN", "subdomains/status");
    await refusedWith({ id: 5 }, "NO_RUN", "subdomains/status");
    await refusedWith({}, "NO_RUN", "subdomains/results");
  });

  test("'allow private addresses' is only honoured together with an active step", async () => {
    reset();
    const passive = await run("priv-test.example.org", { allowPrivate: true });
    expect(passive.options.allowPrivate).toBe(false);
    const active = await run("priv-test.example.org", { allowPrivate: true, resolve: true, rateLimitMs: 100 }, { permission: true });
    expect(active.options.allowPrivate).toBe(true);
  });

  test("the program source: refused when not installed, merged and tagged when it is", async () => {
    reset();
    if (win) return;
    const done = await run("example.com", { sources: ["subfinder", "anubis"] });
    expect(done.sources.find((s: any) => s.id === "subfinder")).toMatchObject({ state: "done", count: 2, dropped: 1 });
    const row = done.rows.find((r: any) => r.host === "www.example.com");
    expect(row.sources.sort()).toEqual(["anubis", "subfinder"]);
    expect(done.rows.some((r: any) => r.host === "viaprogram.example.com")).toBe(true);
    expect(done.rows.some((r: any) => r.host === "evil.org")).toBe(false);
  });

  test("one run per tab and two in all; cancelling frees the place; hanging sources can always be cancelled", async () => {
    reset();
    world.routes["crt.sh"] = () => new Promise<Response>(() => {});
    const opts = { sources: ["crtsh"], timeoutSec: 30 };
    const a = client();
    const b = client();
    const c = client();
    const first = await api("subdomains/start", { domain: "busy-a.example.org", options: opts, client: a });
    expect(first.status).toBe(200);
    expect(first.json.run.state).toBe("running");
    const sameTab = await api("subdomains/start", { domain: "busy-b.example.org", options: opts, client: a });
    expect(sameTab.json.error.code).toBe("BUSY");
    expect(sameTab.json.error.message).toContain("This tab already has a run");
    const second = await api("subdomains/start", { domain: "busy-b.example.org", options: opts, client: b });
    expect(second.status).toBe(200);
    const third = await api("subdomains/start", { domain: "busy-c.example.org", options: opts, client: c });
    expect(third.json.error.code).toBe("BUSY");
    expect(third.json.error.message).toContain("2 runs are already in progress");
    const status = await api("subdomains/status", { id: first.json.run.id });
    expect(status.json.run.sources[0]).toMatchObject({ id: "crtsh", state: "running" });
    expect((await api("subdomains/cancel", { id: first.json.run.id })).json.cancelled).toBe(1);
    const stopped = await untilDone(first.json.run.id);
    expect(stopped.state).toBe("cancelled");
    expect(stopped.sources[0].state).toBe("cancelled");
    expect((await api("subdomains/cancel", { id: first.json.run.id })).json.cancelled).toBe(0);
    const freed = await api("subdomains/start", { domain: "busy-c.example.org", options: opts, client: c });
    expect(freed.status).toBe(200);
    expect((await api("subdomains/cancel", { client: b })).json.cancelled).toBe(1);
    expect((await api("subdomains/cancel", { id: freed.json.run.id })).json.cancelled).toBe(1);
    expect((await untilDone(second.json.run.id)).state).toBe("cancelled");
    await untilDone(freed.json.run.id);
    reset();
  });

  test("a source that never answers ends at its time limit, the others still deliver", async () => {
    reset();
    world.routes["crt.sh"] = () => new Promise<Response>(() => {});
    const done = await run("example.com", { timeoutSec: 3 });
    expect(done.state).toBe("done");
    const crt = done.sources.find((s: any) => s.id === "crtsh");
    expect(crt.state).toBe("timeout");
    expect(crt.error).toContain("didn't answer within 3 seconds");
    expect(done.sources.filter((s: any) => s.state === "done")).toHaveLength(3);
    reset();
  }, 15_000);

  test("big results come back in pages, and finished runs are cleaned up", async () => {
    reset();
    const many = Array.from({ length: 3500 }, (_, i) => `p${i}.page.example.net`);
    world.routes["jonlu.ca"] = () => json(JSON.stringify(many));
    const started = await api("subdomains/start", { domain: "page.example.net", options: { sources: ["anubis"], maxResults: 5000 }, client: client() });
    await untilDone(started.json.run.id);
    const first = await api("subdomains/results", { id: started.json.run.id, since: 0 });
    expect(first.json.rows).toHaveLength(SUB_LIMITS.pollRows);
    expect(first.json.more).toBe(true);
    const rest = await api("subdomains/results", { id: started.json.run.id, since: first.json.rev });
    expect(rest.json.rows).toHaveLength(500);
    expect(rest.json.more).toBe(false);
    expect(new Set([...first.json.rows, ...rest.json.rows].map((r: any) => r.host)).size).toBe(3500);
    // only the newest finished runs are kept
    for (let i = 0; i < SUB_LIMITS.maxFinished + 2; i++) await run("example.com", { sources: ["anubis"] });
    await refusedWith({ id: started.json.run.id }, "NO_RUN", "subdomains/status");
    reset();
  });

  test("history: counts only by default (no host names on disk), hosts only with 'keep results', capped, clearable", async () => {
    reset();
    await api("subdomains/history/clear");
    const plain = await run("private-names.example.org", { sources: ["anubis"] });
    expect(plain.state).toBe("done");
    const file = join(dataDir, "file_manager_subdomains_history.json");
    const text = readFileSync(file, "utf8");
    expect(text).toContain("private-names.example.org");
    expect(text).not.toContain("www.example.com");
    expect(text).not.toContain("blog.example.com");
    const list = (await api("subdomains/history")).json;
    expect(list.history).toHaveLength(1);
    expect(list.history[0]).toMatchObject({ domain: "private-names.example.org", hasResults: false, keptHosts: 0, state: "done" });
    expect(list.history[0].counts.hosts).toBe(0);
    expect(list.history[0].results).toBeUndefined();
    world.routes["jonlu.ca"] = () => json(JSON.stringify(["a.keep.example.org", "b.keep.example.org"]));
    const kept = await run("keep.example.org", { sources: ["anubis"], keepResults: true });
    expect(kept.options.keepResults).toBe(true);
    const list2 = (await api("subdomains/history")).json;
    expect(list2.history[0]).toMatchObject({ domain: "keep.example.org", hasResults: true, keptHosts: 2 });
    expect(list2.history[0].results).toBeUndefined();
    const full = (await api("subdomains/history", { id: list2.history[0].id })).json.entry;
    expect(full.results.map((r: any) => r.host)).toEqual(["a.keep.example.org", "b.keep.example.org"]);
    await refusedWith({ id: "ffffffffffff" }, "NO_RUN", "subdomains/history");
    for (let i = 0; i < 22; i++) await run("cap.example.org", { sources: ["anubis"] });
    expect((await api("subdomains/history")).json.history).toHaveLength(20);
    expect((await api("subdomains/history/clear")).json.cleared).toBe(20);
    expect((await api("subdomains/history")).json.history).toEqual([]);
    reset();
  }, 30_000);

  test("export: txt, csv and json files in a folder, never overwriting, with CSV safe from formulas", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(JSON.stringify(["www.exp.example.org", "api.exp.example.org"]));
    world.http = async (r) => ({ status: 200, body: `<title>=HYPERLINK("http://evil/${r.host}")</title>` });
    const done = await run("exp.example.org", { sources: ["anubis"], resolve: true, probeHttp: true, rateLimitMs: 100 }, { permission: true });
    const exp = (body: Record<string, unknown>) => api("subdomains/export", { id: done.id, folder: out, ...body });
    const txt = await exp({ format: "txt" });
    expect(txt.status).toBe(200);
    expect(txt.json).toMatchObject({ name: "exp.example.org hosts.txt", count: 2 });
    expect(readFileSync(txt.json.path, "utf8")).toBe("api.exp.example.org\nwww.exp.example.org\n");
    const txt2 = await exp({ format: "txt" });
    expect(txt2.json.name).not.toBe(txt.json.name);
    expect(readFileSync(txt.json.path, "utf8")).toBe("api.exp.example.org\nwww.exp.example.org\n");
    const csv = await exp({ format: "csv", name: "my list" });
    expect(csv.json.name).toBe("my list.csv");
    const csvText = readFileSync(csv.json.path, "utf8");
    expect(csvText).toContain("\"'=HYPERLINK(");
    expect(csvText.split("\r\n")[0]).toContain("page title");
    const js = await exp({ format: "json", onlyLive: true });
    const parsed = JSON.parse(readFileSync(js.json.path, "utf8"));
    expect(parsed).toMatchObject({ target: "exp.example.org", count: 2 });
    expect(parsed.results[0]).toMatchObject({ host: "api.exp.example.org", ips: ["93.184.216.34"], httpStatus: 200, wildcard: false });
    const some = await exp({ format: "txt", hosts: ["www.exp.example.org", "nothere.exp.example.org"], name: "one.txt" });
    expect(readFileSync(some.json.path, "utf8")).toBe("www.exp.example.org\n");
    expect(some.json.count).toBe(1);
    const before = readdirSync(out).length;
    await refusedWith({ id: done.id, folder: out, format: "xml" }, "BAD_FORMAT", "subdomains/export");
    await refusedWith({ id: done.id, format: "txt" }, "BAD_PATH", "subdomains/export");
    await refusedWith({ id: done.id, folder: "relative/folder", format: "txt" }, "NOT_FOUND", "subdomains/export");
    await refusedWith({ id: done.id, folder: join(out, "missing"), format: "txt" }, "NOT_FOUND", "subdomains/export");
    await refusedWith({ id: done.id, folder: csv.json.path, format: "txt" }, "NOT_A_FOLDER", "subdomains/export");
    await refusedWith({ id: done.id, folder: out, format: "txt", name: "../evil.txt" }, "BAD_NAME", "subdomains/export");
    await refusedWith({ id: done.id, folder: out, format: "txt", name: "a/b" }, "BAD_NAME", "subdomains/export");
    await refusedWith({ id: done.id, folder: out, format: "txt", name: 5 }, "BAD_NAME", "subdomains/export");
    await refusedWith({ id: done.id, folder: out, format: "txt", hosts: "all" }, "BAD_REQUEST", "subdomains/export");
    await refusedWith({ id: done.id, folder: out, format: "txt", hosts: ["nothere.exp.example.org"] }, "NO_RESULTS", "subdomains/export");
    expect(readdirSync(out).length).toBe(before);
    expect(readdirSync(out).every((f) => !f.includes("evil"))).toBe(true);
  });

  test("nothing to export from a run that found nothing", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json("[]");
    const done = await run("nothing.example.org", { sources: ["anubis"] });
    await refusedWith({ id: done.id, folder: out, format: "txt" }, "NO_RESULTS", "subdomains/export");
  });

  test("the report: a Markdown file with date, target, sources, counts and notes; hostile titles can't inject formatting", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(JSON.stringify(["www.rep.example.org"]));
    world.http = async () => ({ status: 200, body: "<title>[click](http://evil.example) <img src=x onerror=alert(1)></title>" });
    const done = await run("rep.example.org", { sources: ["anubis"], resolve: true, probeHttp: true, rateLimitMs: 100 }, { permission: true });
    const rep = await api("subdomains/report", { id: done.id, folder: out });
    expect(rep.status).toBe(200);
    expect(rep.json.name).toBe("rep.example.org subdomain report.md");
    const md = readFileSync(rep.json.path, "utf8");
    expect(md).toContain("# Subdomain report: rep.example.org");
    expect(md).toMatch(/\*\*Date:\*\* \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/);
    expect(md).toContain("| Anubis | answered | 1 |");
    expect(md).toContain("## Notes in plain words");
    expect(md).toContain("\\[click\\]\\(http://evil.example\\)");
    expect(md).toContain("\\<img");
    expect(md).not.toMatch(/(?<!\\)<img/);
    const again = await api("subdomains/report", { id: done.id, folder: out });
    expect(again.json.name).not.toBe(rep.json.name);
    await refusedWith({ id: done.id, folder: out, name: "x/y" }, "BAD_NAME", "subdomains/report");
  });

  test("open in the browser: only a host of that run, only http or https", async () => {
    reset();
    const done = await run("example.com", { sources: ["anubis"] });
    launched.length = 0;
    const res = await api("subdomains/open", { id: done.id, host: "www.example.com" });
    expect(res.json.opened).toBe("https://www.example.com/");
    expect(launched).toHaveLength(1);
    expect(launched[0]!.args).toEqual(["https://www.example.com/"]);
    const plain = await api("subdomains/open", { id: done.id, host: "blog.example.com", scheme: "http" });
    expect(plain.json.opened).toBe("http://blog.example.com/");
    await refusedWith({ id: done.id, host: "evil.org" }, "NO_HOST", "subdomains/open");
    await refusedWith({ id: done.id, host: "nothere.example.com" }, "NO_HOST", "subdomains/open");
    await refusedWith({ id: done.id, host: "www.example.com", scheme: "file" }, "BAD_SCHEME", "subdomains/open");
    await refusedWith({ id: done.id, host: "www.example.com", scheme: "javascript" }, "BAD_SCHEME", "subdomains/open");
    await refusedWith({ id: done.id, host: "www.example.com/../x" }, "NO_HOST", "subdomains/open");
    expect(launched).toHaveLength(2);
  });
});

