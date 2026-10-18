import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { DNS_TYPES, dnsAudit, dnsQuery, formatRecords, type DnsDeps, type DnsResolverLike } from "../src/features/filemanager/fmNetDns";
import {
  NET_LIMITS, clampTimeout, describeNetError, netState, parsePorts, validateHost, validatePort,
} from "../src/features/filemanager/fmNetCore";
import { netOperations } from "../src/features/filemanager/fmNetOps";
import { certVerdict, httpProbe, inspectTls, parseAltNames, parseHead } from "../src/features/filemanager/fmNetProbe";
import { cancelTasks, findTask, snapshot, startPing, startScan } from "../src/features/filemanager/fmNetScan";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const scratch = join(import.meta.dir, `.scratch-fm-net-${process.pid}`);
const home = join(scratch, "home");
const out = join(scratch, "out");
let ctx: FmContext;

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  mkdirSync(out, { recursive: true });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => {
  for (const dispose of ctx?.disposers.splice(0) ?? []) dispose();
});

const fresh = () => (ctx = createContext({ home, dataDir: join(scratch, "data") }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (op: string, body: Record<string, unknown> = {}) => netOperations[op]!(ctx, body) as Promise<any>;
const rejects = async (fn: () => unknown, code: string) => {
  let thrown: any;
  try {
    await fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown?.code).toBe(code);
  expect(String(thrown?.message).length).toBeGreaterThan(10);
  return thrown.message as string;
};
async function untilDone(id: string, limitMs = 8000) {
  const end = Date.now() + limitMs;
  for (;;) {
    const s = snapshot(findTask(ctx, id));
    if (s.state !== "running") return s;
    if (Date.now() > end) throw new Error("task did not finish");
    await wait(15);
  }
}
const expectClean = () => {
  const s = netState(ctx);
  expect(s.sockets.size).toBe(0);
  expect(s.timers.size).toBe(0);
};

// A socket that never connects (an unanswered, "filtered" port), counting how many are open at once.
function silentSockets() {
  const stats = { open: 0, peak: 0, made: 0 };
  const make = () => {
    const s = new Socket();
    let counted = false;
    s.connect = (() => {
      counted = true;
      stats.made++;
      stats.open++;
      stats.peak = Math.max(stats.peak, stats.open);
      return s;
    }) as any;
    const destroy = s.destroy.bind(s);
    s.destroy = ((...a: any[]) => {
      if (counted) stats.open--;
      counted = false;
      return destroy(...a);
    }) as any;
    return s;
  };
  return { stats, make };
}

function listener() {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open() {}, data() {}, close() {} } });
  return { port: server.port, stop: () => server.stop(true) };
}
function closedPort(): number {
  const l = listener();
  l.stop();
  return l.port;
}

// ---------------------------------------------------------------------------------------------------------------
// A self-signed certificate made at test time with node:crypto only (hand-built DER), so it works everywhere.
// ---------------------------------------------------------------------------------------------------------------
const lenBytes = (n: number) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]));
const der = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), lenBytes(body.length), body]);
};
const seq = (...p: Buffer[]) => der(0x30, ...p);
const oid = (s: string) => {
  const a = s.split(".").map(Number);
  const bytes = [a[0]! * 40 + a[1]!];
  for (const n of a.slice(2)) {
    const tmp = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) tmp.unshift((v & 0x7f) | 0x80);
    bytes.push(...tmp);
  }
  return der(0x06, Buffer.from(bytes));
};
const utc = (d: Date) => der(0x17, Buffer.from(d.toISOString().replace(/^\d\d(\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d).*$/, "$1$2$3$4$5$6Z")));
const dn = (cn: string) => seq(der(0x31, seq(oid("2.5.4.3"), der(0x0c, Buffer.from(cn)))));

function selfSigned(cn: string, notBefore: Date, notAfter: Date) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const sigAlg = seq(oid("1.2.840.10045.4.3.2"));
  const san = seq(der(0x82, Buffer.from("localhost")), der(0x87, Buffer.from([127, 0, 0, 1])));
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([0x01, 0x23, 0x45])),
    sigAlg,
    dn(cn),
    seq(utc(notBefore), utc(notAfter)),
    dn(cn),
    publicKey.export({ type: "spki", format: "der" }) as Buffer,
    der(0xa3, seq(seq(oid("2.5.29.17"), der(0x04, san)))),
  );
  const signature = cryptoSign("sha256", tbs, privateKey);
  const cert = seq(tbs, sigAlg, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----\n`;
  return { cert: pem, key: privateKey.export({ type: "pkcs8", format: "pem" }) as string };
}
const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------

describe("checking what the person typed", () => {
  test("good hosts are accepted and cleaned up", () => {
    expect(validateHost("Example.COM")).toBe("example.com");
    expect(validateHost("example.com.")).toBe("example.com");
    expect(validateHost("192.168.1.10")).toBe("192.168.1.10");
    expect(validateHost("::1")).toBe("::1");
    expect(validateHost("[2001:DB8::1]")).toBe("2001:db8::1");
    expect(validateHost("localhost")).toBe("localhost");
    expect(validateHost("_dmarc.example.com")).toBe("_dmarc.example.com");
    expect(validateHost("bücher.example")).toBe("xn--bcher-kva.example");
  });

  test("web addresses, credentials, whitespace, control characters and injection attempts are refused", () => {
    const bad = [
      "", " ", "http://example.com", "https://example.com/path", "example.com/path", "user:pass@example.com", "user@example.com", "example.com:80",
      "exa mple.com", " example.com", "example.com ", "example.com\n", "example.com\r\nHost: evil", "exa\tmple.com", "exa\u0000mple.com", "example.com\u200b\u2028",
      "a;b.com", "$(reboot).com", "`id`.com", "a|b.com", "a&b.com", "a'b.com", 'a"b.com', "-bad.com", "bad-.com", "a..b.com", ".example.com", "a".repeat(64) + ".com",
      ("a".repeat(60) + ".").repeat(5) + "com", "127.1", "1.2.3", "2130706433", "0x7f.1", "0x7f000001", "fe80::1%en0", "0.0.0.0", "255.255.255.255", "224.0.0.1", "::", "ff02::1",
      "example.com?x=1", "example.com#frag", "exa%6Dple.com", "exa*ple.com",
    ];
    for (const host of bad) {
      let code = "";
      try {
        validateHost(host);
      } catch (err: any) {
        code = err.code;
        expect(err.message.length).toBeGreaterThan(10);
      }
      expect(code, JSON.stringify(host)).toBe("BAD_HOST");
    }
    expect(() => validateHost(undefined)).toThrow();
    expect(() => validateHost(42 as any)).toThrow();
    expect(() => validateHost({ toString: () => "a.com" } as any)).toThrow();
  });

  test("ports, time limits and port lists are clamped or refused", () => {
    expect(validatePort(443)).toBe(443);
    expect(validatePort("8080")).toBe(8080);
    for (const bad of [0, 65536, -1, 1.5, "abc", "", "80 ", "1e3", null, undefined, NaN, "70000", {}]) expect(() => validatePort(bad as any), String(bad)).toThrow();
    expect(clampTimeout(undefined, 800)).toBe(800);
    expect(clampTimeout(1, 800)).toBe(100);
    expect(clampTimeout(999_999, 800)).toBe(5000);
    expect(clampTimeout("250", 800)).toBe(250);
    expect(() => clampTimeout("soon", 800)).toThrow();
    expect(parsePorts("22, 80,443,8000-8010,80")).toEqual([22, 80, 443, ...Array.from({ length: 11 }, (_, i) => 8000 + i)]);
    expect(parsePorts("1-1024")).toHaveLength(1024);
    for (const bad of ["1-1025", "1-65535", "1-2000", "0", "65536", "9-5", "abc", "", "22,,x", "80-"]) expect(() => parsePorts(bad), bad).toThrow();
    expect(() => parsePorts(123 as any)).toThrow();
    expect(() => parsePorts("1,".repeat(1500))).toThrow();
  });

  test("the oversize-range refusal tells the person what to do", async () => {
    fresh();
    const message = await rejects(() => startScan(ctx, { host: "127.0.0.1", mode: "list", ports: "1-5000" }), "TOO_MANY_PORTS");
    expect(message).toContain("1024");
    expect(netState(ctx).tasks.size).toBe(0);
  });

  test("connection errors are explained in plain words", () => {
    expect(describeNetError("ENOTFOUND", "nope.example").message).toContain("nope.example");
    expect(describeNetError("EAI_AGAIN", "x").code).toBe("OFFLINE");
    expect(describeNetError("ENETUNREACH", "x").message).toMatch(/offline/i);
    expect(describeNetError("ECONNREFUSED", "x").code).toBe("REFUSED");
    expect(describeNetError(undefined, "x").message.length).toBeGreaterThan(10);
  });
});

describe("port scans", () => {
  test("open, closed and a single-port sentence", async () => {
    fresh();
    const open = listener();
    const shut = closedPort();
    const start = await call("net/scan", { host: "127.0.0.1", mode: "list", ports: `${open.port},${shut}`, timeoutMs: 1000 });
    expect(start.task.state).toBe("running");
    const done = await untilDone(start.task.id);
    open.stop();
    expect(done.state).toBe("done");
    expect(done.results.find((r) => r.port === open.port)?.status).toBe("OPEN");
    expect(done.results.find((r) => r.port === shut)?.status).toBe("CLOSED");
    expect(done.counts).toEqual({ open: 1, closed: 1, timeout: 0 });
    expect(done.summary).toContain("1 open");

    const l2 = listener();
    const single = await untilDone((await call("net/scan", { host: "localhost", mode: "single", port: l2.port })).task.id);
    l2.stop();
    expect(single.headline).toBe(`Port ${l2.port} is open: something is listening there.`);
    const closed = await untilDone((await call("net/scan", { host: "127.0.0.1", mode: "single", port: shut })).task.id);
    expect(closed.headline).toContain("is closed");
    expectClean();
  });

  test("known services are named", async () => {
    fresh();
    const done = await untilDone((await call("net/scan", { host: "127.0.0.1", mode: "list", ports: "22,443", timeoutMs: 200 })).task.id);
    expect(done.results.map((r) => r.service).sort()).toEqual(["HTTPS", "SSH"]);
  });

  test("top-ports mode checks the twelve common services", async () => {
    fresh();
    const done = await untilDone((await call("net/scan", { host: "127.0.0.1", mode: "top", timeoutMs: 300 })).task.id);
    expect(done.total).toBe(12);
    expect(done.results).toHaveLength(12);
    expect(done.results.map((r) => r.port)).toContain(27017);
  });

  test("an unanswered port is reported as no answer after the time limit", async () => {
    fresh();
    netState(ctx).makeSocket = silentSockets().make;
    const t0 = Date.now();
    const done = await untilDone((await call("net/scan", { host: "10.1.2.3", mode: "single", port: 81, timeoutMs: 150 })).task.id);
    expect(done.results[0]?.status).toBe("TIMEOUT");
    expect(done.results[0]?.latencyMs).toBe(150);
    expect(done.headline).toContain("no answer");
    expect(Date.now() - t0).toBeLessThan(1500);
    expectClean();
  });

  test("a name that can't be found stops the scan with a friendly error", async () => {
    fresh();
    netState(ctx).makeSocket = () => {
      const s = new Socket();
      s.connect = (() => {
        queueMicrotask(() => s.emit("error", Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })));
        return s;
      }) as any;
      return s;
    };
    const done = await untilDone((await call("net/scan", { host: "nowhere.example", mode: "list", ports: "1-50", timeoutMs: 200 })).task.id);
    expect(done.state).toBe("error");
    expect(done.error?.code).toBe("NAME_NOT_FOUND");
    expect(done.error?.message).toContain("nowhere.example");
    expect(done.counts.open + done.counts.closed + done.counts.timeout).toBe(0);
    expectClean();
  });

  test("at most 64 connections are open at once, however many are asked for", async () => {
    fresh();
    const silent = silentSockets();
    netState(ctx).makeSocket = silent.make;
    const task = startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-300", timeoutMs: 100, concurrency: 100_000 });
    const done = await untilDone(task.id);
    expect(done.total).toBe(300);
    expect(silent.stats.made).toBe(300);
    expect(silent.stats.peak).toBeLessThanOrEqual(NET_LIMITS.maxConcurrency);
    expect(silent.stats.peak).toBe(64);
    expect(task.peakInFlight).toBe(64);

    const small = silentSockets();
    netState(ctx).makeSocket = small.make;
    await untilDone(startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-40", timeoutMs: 100, concurrency: 5 }).id);
    expect(small.stats.peak).toBe(5);
    expectClean();
  });

  test("cancelling mid-scan stops it, closes every socket and keeps what was found", async () => {
    fresh();
    const silent = silentSockets();
    netState(ctx).makeSocket = silent.make;
    const task = startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-500", timeoutMs: 5000 });
    await wait(40);
    expect(silent.stats.open).toBeGreaterThan(0);
    const t0 = Date.now();
    const res = await call("net/cancel", { id: task.id });
    expect(res.cancelled).toBe(1);
    expect(Date.now() - t0).toBeLessThan(500);
    const snap = snapshot(task);
    expect(snap.state).toBe("cancelled");
    expect(snap.stoppedEarly).toBe("cancelled");
    expect(snap.summary).toContain("Cancelled");
    expect(silent.stats.open).toBe(0);
    expect(silent.stats.made).toBeLessThan(500);
    expectClean();
    expect((await call("net/cancel", { id: task.id })).cancelled).toBe(0);
  });

  test("a scan has a total time cap", async () => {
    fresh();
    const limits = NET_LIMITS as { scanTimeCapMs: number };
    const original = limits.scanTimeCapMs;
    limits.scanTimeCapMs = 200;
    try {
      netState(ctx).makeSocket = silentSockets().make;
      const done = await untilDone(startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-1000", timeoutMs: 5000 }).id);
      expect(done.stoppedEarly).toBe("time-limit");
      expect(done.state).toBe("done");
      expect(done.summary).toContain("time limit");
      expectClean();
    } finally {
      limits.scanTimeCapMs = original;
    }
  });

  test("only two background checks may run at once", async () => {
    fresh();
    netState(ctx).makeSocket = silentSockets().make;
    const a = startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-50", timeoutMs: 5000 });
    const b = startPing(ctx, { host: "10.1.2.3", port: 80, timeoutMs: 5000 });
    await rejects(() => startScan(ctx, { host: "10.1.2.3", mode: "single", port: 80 }), "BUSY");
    await rejects(() => call("net/tcpping", { host: "10.1.2.3" }), "BUSY");
    expect((await call("net/status", {})).running).toBe(2);
    await cancelTasks(ctx, a.id);
    const c = startScan(ctx, { host: "10.1.2.3", mode: "single", port: 80, timeoutMs: 100 });
    expect(c.state).toBe("running");
    await cancelTasks(ctx);
    expect([a, b, c].map((t) => t.state)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expectClean();
  });

  test("finished tasks are kept only up to a limit", async () => {
    fresh();
    for (let i = 0; i < NET_LIMITS.maxFinishedTasks + 4; i++) await untilDone(startScan(ctx, { host: "127.0.0.1", mode: "single", port: closedPort(), timeoutMs: 200 }).id);
    expect(netState(ctx).tasks.size).toBeLessThanOrEqual(NET_LIMITS.maxFinishedTasks);
    await rejects(() => call("net/status", { id: "t1" }), "NO_TASK");
  });

  test("status returns only what is new when given cursors", async () => {
    fresh();
    const l = listener();
    const task = startScan(ctx, { host: "127.0.0.1", mode: "list", ports: `${l.port},${closedPort()}`, timeoutMs: 500 });
    await untilDone(task.id);
    l.stop();
    const all = await call("net/status", { id: task.id });
    expect(all.task.results).toHaveLength(2);
    const later = await call("net/status", { id: task.id, logFrom: all.task.logCount, resultFrom: all.task.resultCount });
    expect(later.task.results).toEqual([]);
    expect(later.task.log).toEqual([]);
    expect(all.tasks[0].id).toBe(task.id);
    expect(all.task.log.some((x: any) => x.level === "ok")).toBe(true);
  });

  test("stopping the server (disposers) cancels running scans and leaves no sockets or timers", async () => {
    fresh();
    netState(ctx).makeSocket = silentSockets().make;
    const a = startScan(ctx, { host: "10.1.2.3", mode: "list", ports: "1-200", timeoutMs: 5000 });
    const b = startPing(ctx, { host: "10.1.2.3", port: 22, timeoutMs: 5000 });
    await wait(30);
    for (const dispose of ctx.disposers.splice(0)) dispose();
    await Promise.all([a.finished, b.finished]);
    expect([a.state, b.state]).toEqual(["cancelled", "cancelled"]);
    expectClean();
    expect(() => startScan(ctx, { host: "127.0.0.1", mode: "single", port: 80 })).toThrow();
  });

  test("bad requests are refused before anything starts", async () => {
    fresh();
    await rejects(() => call("net/scan", { host: "http://example.com", mode: "single", port: 80 }), "BAD_HOST");
    await rejects(() => call("net/scan", { host: "127.0.0.1", mode: "single", port: 0 }), "BAD_PORT");
    await rejects(() => call("net/scan", { host: "127.0.0.1", mode: "wide" }), "BAD_MODE");
    await rejects(() => call("net/scan", { host: "127.0.0.1", mode: "list", ports: "abc" }), "BAD_PORTS");
    await rejects(() => call("net/scan", { host: "127.0.0.1", mode: "single", port: 80, timeoutMs: "soon" }), "BAD_TIMEOUT");
    expect(netState(ctx).tasks.size).toBe(0);
  });
});

describe("TCP ping", () => {
  test("times five connections and summarizes them", async () => {
    fresh();
    const l = listener();
    const done = await untilDone((await call("net/tcpping", { host: "127.0.0.1", port: l.port })).task.id);
    l.stop();
    expect(done.samples).toHaveLength(5);
    expect(done.samples.every((s) => typeof s === "number")).toBe(true);
    expect(done.stats?.received).toBe(5);
    expect(done.stats?.lossPct).toBe(0);
    expect(done.stats!.min!).toBeLessThanOrEqual(done.stats!.avg!);
    expect(done.stats!.avg!).toBeLessThanOrEqual(done.stats!.max!);
    expect(done.summary).toContain("5 of 5");
    expectClean();
  });

  test("a closed port is 100% loss", async () => {
    fresh();
    const done = await untilDone(startPing(ctx, { host: "127.0.0.1", port: closedPort(), count: 3, timeoutMs: 300 }).id);
    expect(done.samples).toEqual([null, null, null]);
    expect(done.stats?.lossPct).toBe(100);
    expect(done.summary).toContain("No replies");
  });

  test("the count is clamped and a ping can be cancelled", async () => {
    fresh();
    netState(ctx).makeSocket = silentSockets().make;
    const task = startPing(ctx, { host: "10.1.2.3", port: 80, count: 9999, timeoutMs: 5000 });
    expect(task.total).toBe(NET_LIMITS.maxPingCount);
    await wait(20);
    await cancelTasks(ctx, task.id);
    expect(task.state).toBe("cancelled");
    expectClean();
  });
});

describe("HTTP probe", () => {
  let hits: string[] = [];
  let web: ReturnType<typeof Bun.serve>;
  beforeAll(() => {
    web = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const path = new URL(req.url).pathname;
        hits.push(`${req.method} ${path} host=${req.headers.get("host")}`);
        return new Response(req.method === "HEAD" ? null : "x".repeat(1_000_000), { status: 200, headers: { "X-Test": "yes", "Content-Type": "text/plain" } });
      },
    });
  });
  afterAll(() => web.stop(true));
  const probe = (port: number | undefined, extra: Record<string, unknown> = {}) => call("net/probe", { host: "127.0.0.1", port, timeoutMs: 3000, ...extra });

  test("reports status, headers and timings without downloading the page", async () => {
    fresh();
    hits = [];
    const res = await probe(web.port);
    expect(res.error).toBeNull();
    expect(res.scheme).toBe("http");
    expect(res.method).toBe("HEAD");
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(res.headers.find((pair: string[]) => pair[0]!.toLowerCase() === "x-test")?.[1]).toBe("yes");
    expect(res.remoteIp).toBe("127.0.0.1");
    expect(res.timings.totalMs).toBeGreaterThan(0);
    expect(res.explain).toContain("normally");
    expect(res.bodyBytesRead).toBe(0);
    expect(hits).toEqual([`HEAD / host=127.0.0.1:${web.port}`]);
    expect(res.log.length).toBeGreaterThan(2);
    expectClean();
  });

  test("with GET the body is read only up to a few KB, then the connection is closed", async () => {
    fresh();
    const res = await probe(web.port, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.bodyTruncated).toBe(true);
    expect(res.bodyBytesRead).toBeLessThanOrEqual(NET_LIMITS.maxBodyBytes);
    expect(res.bodyBytesRead).toBeGreaterThan(0);
    expectClean();
  });

  test("redirects are reported but never followed", async () => {
    fresh();
    const seen: string[] = [];
    const redirector = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const path = new URL(req.url).pathname;
        seen.push(path);
        if (path === "/") return new Response(null, { status: 302, headers: { Location: "http://elsewhere.example/landing?x=1" } });
        return new Response("moved here", { status: 200 });
      },
    });
    try {
      const away = await probe(redirector.port);
      expect(away.status).toBe(302);
      expect(away.location).toBe("http://elsewhere.example/landing?x=1");
      expect(away.redirect).toEqual({ to: "http://elsewhere.example/landing?x=1", sameHost: false });
      expect(away.explain).toContain("not follow");
      expect(away.log.some((l: any) => l.text.includes("not followed"))).toBe(true);
      expect(seen).toEqual(["/"]);
    } finally {
      redirector.stop(true);
    }
    const same = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null, { status: 301, headers: { Location: "/next" } }) });
    try {
      const res = await probe(same.port);
      expect(res.status).toBe(301);
      expect(res.redirect?.sameHost).toBe(true);
    } finally {
      same.stop(true);
    }
    expectClean();
  });

  test("something that isn't a web server, a closed port and a silent server give plain errors", async () => {
    fresh();
    const chatty = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open(s) { s.write("SSH-2.0-hello\r\n\r\n"); }, data() {} } });
    try {
      const res = await probe(chatty.port);
      expect(res.error?.code).toBe("NOT_HTTP");
      expect(res.status).toBeNull();
    } finally {
      chatty.stop(true);
    }
    const refused = await probe(closedPort());
    expect(refused.error?.code).toBe("REFUSED");
    expect(refused.error?.message).toContain("nothing is listening");

    const silent = listener();
    try {
      const t0 = Date.now();
      const slow = await probe(silent.port, { timeoutMs: 300 });
      expect(slow.error?.code).toBe("TIMEOUT");
      expect(Date.now() - t0).toBeLessThan(1500);
    } finally {
      silent.stop();
    }
    const huge = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open(s) { s.write("HTTP/1.1 200 OK\r\n" + "X-Pad: " + "a".repeat(40_000) + "\r\n"); }, data() {} } });
    try {
      expect((await probe(huge.port)).error?.code).toBe("TOO_BIG");
    } finally {
      huge.stop(true);
    }
    expectClean();
  });

  test("header values from the other computer are cleaned and capped", () => {
    const head = parseHead(`HTTP/1.1 404 Not Found\r\nX-Evil: ${"a".repeat(5000)}\x07bell\r\nSet-Cookie: a=b\r\nbroken line\r\n`);
    expect(head?.status).toBe(404);
    expect(head?.headers[0]?.[1].length).toBeLessThanOrEqual(1000);
    expect(head?.headers.some(([, v]) => /[\u0000-\u001f]/.test(v))).toBe(false);
    expect(head?.headers).toHaveLength(2);
    expect(parseHead("SSH-2.0-OpenSSH")).toBeNull();
    expect(parseHead("HTTP/1.1 abc")).toBeNull();
  });

  test("scheme and method are checked; the probe never takes a web address", async () => {
    fresh();
    await rejects(() => call("net/probe", { host: "http://127.0.0.1:80" }), "BAD_HOST");
    await rejects(() => call("net/probe", { host: "127.0.0.1", method: "DELETE" }), "BAD_METHOD");
    await rejects(() => call("net/probe", { host: "127.0.0.1", scheme: "ftp" }), "BAD_SCHEME");
    await rejects(() => call("net/probe", { host: "127.0.0.1", port: 99999 }), "BAD_PORT");
  });

  test("only a few quick checks run at once", async () => {
    fresh();
    const silent = listener();
    try {
      const running = Array.from({ length: NET_LIMITS.maxSyncOps }, () => probe(silent.port, { timeoutMs: 400 }));
      await wait(30);
      await rejects(() => probe(silent.port), "BUSY");
      await Promise.all(running);
    } finally {
      silent.stop();
    }
    expectClean();
  });

  test("the server stopping closes a probe that is waiting", async () => {
    fresh();
    const silent = listener();
    const pending = probe(silent.port, { timeoutMs: 5000 });
    await wait(50);
    expect(netState(ctx).sockets.size).toBe(1);
    for (const dispose of ctx.disposers.splice(0)) dispose();
    const res = await pending;
    expect(res.error).not.toBeNull();
    silent.stop();
    expectClean();
  });
});

describe("TLS certificates", () => {
  const good = selfSigned("probe.test", new Date(Date.now() - DAY), new Date(Date.now() + 100 * DAY));
  const expired = selfSigned("old.test", new Date(Date.now() - 400 * DAY), new Date(Date.now() - 10 * DAY));
  const servers: Array<{ stop: (force?: boolean) => void }> = [];
  const secure = (pair: { cert: string; key: string }) => {
    const s = Bun.serve({ port: 0, hostname: "127.0.0.1", tls: { cert: pair.cert, key: pair.key }, fetch: () => new Response("hello", { headers: { "X-Secure": "1" } }) });
    servers.push(s);
    return s;
  };
  afterAll(() => servers.forEach((s) => s.stop(true)));

  test("reads subject, issuer, validity, fingerprint and alternative names", async () => {
    fresh();
    const res = await call("net/tls", { host: "127.0.0.1", port: secure(good).port, timeoutMs: 4000 });
    expect(res.error).toBeNull();
    expect(res.cert.subject.CN).toBe("probe.test");
    expect(res.cert.issuer.CN).toBe("probe.test");
    expect(res.cert.selfSigned).toBe(true);
    expect(res.cert.daysLeft).toBeGreaterThanOrEqual(98);
    expect(res.cert.daysLeft).toBeLessThanOrEqual(100);
    expect(res.cert.fingerprint256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(res.cert.altNames).toContain("localhost");
    expect(res.cert.altNames).toContain("IP:127.0.0.1");
    expect(res.cert.authorized).toBe(false);
    expect(res.cert.protocol).toMatch(/^TLSv1/);
    expect(res.verdict).toBe("warn");
    expect(res.explain).toContain("doesn't trust");
    expect(res.rows.find((r: string[]) => r[0] === "Subject (CN)")?.[1]).toBe("probe.test");
    expectClean();
  });

  test("an expired certificate is flagged as bad", async () => {
    fresh();
    const res = await call("net/tls", { host: "127.0.0.1", port: secure(expired).port, timeoutMs: 4000 });
    expect(res.verdict).toBe("bad");
    expect(res.cert.daysLeft).toBeLessThan(0);
    expect(res.explain).toContain("expired");
    expect(res.rows.find((r: string[]) => r[0] === "Expiry Status")?.[1]).toContain("EXPIRED");
  });

  test("an https probe works against it and reports the certificate is not trusted", async () => {
    fresh();
    const res = await call("net/probe", { host: "127.0.0.1", port: secure(good).port, scheme: "https", timeoutMs: 4000 });
    expect(res.error).toBeNull();
    expect(res.status).toBe(200);
    expect(res.tls.trusted).toBe(false);
    expect(res.timings.tlsMs).toBeGreaterThanOrEqual(0);
    expect(res.headers.some((pair: string[]) => pair[0]!.toLowerCase() === "x-secure")).toBe(true);
    expectClean();
  });

  test("a port that doesn't speak TLS, or isn't open, gives a friendly message", async () => {
    fresh();
    const plain = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("plain") });
    try {
      const res = await call("net/tls", { host: "127.0.0.1", port: plain.port, timeoutMs: 2000 });
      expect(res.cert).toBeNull();
      expect(res.error?.message.length).toBeGreaterThan(20);
      expect(res.error?.code).not.toBe("UNKNOWN");
    } finally {
      plain.stop(true);
    }
    const refused = await call("net/tls", { host: "127.0.0.1", port: closedPort(), timeoutMs: 1000 });
    expect(refused.error?.code).toBe("REFUSED");
    const silent = listener();
    const slow = await call("net/tls", { host: "127.0.0.1", port: silent.port, timeoutMs: 300 });
    silent.stop();
    expect(slow.error?.code).toBe("TIMEOUT");
    expectClean();
  });

  test("verdicts and names from certificate details (fixture, no network)", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const base = { authorized: true, validFrom: "Jan  1 00:00:00 2025 GMT", validTo: "Jul  1 00:00:00 2026 GMT" };
    expect(certVerdict(base, now)).toMatchObject({ verdict: "ok", daysLeft: 181 });
    expect(certVerdict({ ...base, validTo: "Jan 10 00:00:00 2026 GMT" }, now)).toMatchObject({ verdict: "warn", daysLeft: 9 });
    expect(certVerdict({ ...base, validTo: "Dec 1 00:00:00 2025 GMT" }, now).verdict).toBe("bad");
    expect(certVerdict({ ...base, validFrom: "Jun 1 00:00:00 2026 GMT" }, now).explain).toContain("not valid yet");
    expect(certVerdict({ ...base, authorized: false, authError: "SELF_SIGNED_CERT_IN_CHAIN" }, now).explain).toContain("SELF_SIGNED");
    expect(parseAltNames("DNS:example.com, DNS:www.example.com, IP Address:10.0.0.1")).toEqual(["example.com", "www.example.com", "IP:10.0.0.1"]);
    expect(parseAltNames(undefined)).toEqual([]);
  });

  test("httpProbe and inspectTls clean up even when called directly", async () => {
    fresh();
    const state = netState(ctx);
    const res = await httpProbe(state, { host: "127.0.0.1", port: closedPort(), scheme: "http", method: "HEAD", timeoutMs: 500 });
    expect(res.error?.code).toBe("REFUSED");
    expect((await inspectTls(state, { host: "127.0.0.1", port: closedPort(), timeoutMs: 500 })).error?.code).toBe("REFUSED");
    expectClean();
  });
});

describe("DNS inspector", () => {
  const never = () => new Promise<never>(() => {});
  const reject = (code: string) => () => Promise.reject(Object.assign(new Error(code), { code }));
  const stub = (over: Partial<Record<keyof DnsResolverLike, (h: string) => Promise<unknown>>>): DnsResolverLike => ({
    resolve4: async () => ["93.184.216.34"], resolve6: async () => ["2606:2800::1"], resolveMx: async () => [{ priority: 20, exchange: "b.mail.test" }, { priority: 10, exchange: "a.mail.test" }],
    resolveTxt: async () => [["v=spf1 ", "-all"], ["hello"]], resolveNs: async () => ["ns1.test", "ns2.test"],
    resolveSoa: async () => ({ nsname: "ns1.test", hostmaster: "admin.test", serial: 5, refresh: 10, retry: 20, expire: 30, minttl: 40 }),
    resolveCaa: async () => [{ critical: 0, issue: "letsencrypt.org" }], resolveCname: reject("ENODATA"), reverse: async () => ["host.test"], ...over,
  } as DnsResolverLike);
  const deps = (system: DnsResolverLike, publicOnes: DnsResolverLike = stub({}), lookup: DnsDeps["lookup"] = async () => []): DnsDeps => ({ system, publicResolver: () => publicOnes, lookup });

  test("every record type is formatted for people", async () => {
    fresh();
    const state = netState(ctx);
    const d = deps(stub({}));
    expect((await dnsQuery(state, "example.test", "A", d)).lines).toEqual(["93.184.216.34"]);
    expect((await dnsQuery(state, "example.test", "MX", d)).lines).toEqual(["20 b.mail.test", "10 a.mail.test"]);
    expect((await dnsQuery(state, "example.test", "TXT", d)).lines).toEqual(["v=spf1 -all", "hello"]);
    expect((await dnsQuery(state, "example.test", "NS", d)).lines).toEqual(["ns1.test", "ns2.test"]);
    expect((await dnsQuery(state, "example.test", "CAA", d)).lines).toEqual(['0 issue "letsencrypt.org"']);
    const soa = await dnsQuery(state, "example.test", "SOA", d);
    expect(soa.lines[0]).toBe("Primary name server: ns1.test");
    expect(soa.source).toBe("system");
    expect(soa.explain).toContain("SOA");
    expect(formatRecords("A", undefined)).toEqual([]);
    expectClean();
  });

  test("no records is explained, not treated as a failure", async () => {
    fresh();
    const res = await dnsQuery(netState(ctx), "example.test", "CNAME", deps(stub({})));
    expect(res.noData).toBe(true);
    expect(res.error).toBeNull();
    expect(res.explain).toContain("No CNAME records");
  });

  test("a dead system DNS falls back to public servers, then to the system name lookup", async () => {
    fresh();
    const state = netState(ctx);
    const dead = stub({ resolve4: reject("ECONNREFUSED"), resolve6: reject("ETIMEOUT") });
    const viaPublic = await dnsQuery(state, "example.test", "A", deps(dead));
    expect(viaPublic.source).toBe("public");
    expect(viaPublic.sourceLabel).toContain("Public DNS");
    const viaOs = await dnsQuery(state, "example.test", "A", deps(dead, stub({ resolve4: reject("ECONNREFUSED") }), async () => [{ address: "10.0.0.9", family: 4 }, { address: "::9", family: 6 }]));
    expect(viaOs.source).toBe("os");
    expect(viaOs.lines).toEqual(["10.0.0.9"]);
    const v6 = await dnsQuery(state, "example.test", "AAAA", deps(dead, stub({ resolve6: reject("ECONNREFUSED") }), async () => [{ address: "::9", family: 6 }]));
    expect(v6.lines).toEqual(["::9"]);
    const offline = await dnsQuery(state, "example.test", "MX", deps(stub({ resolveMx: reject("ECONNREFUSED") }), stub({ resolveMx: reject("ETIMEOUT") })));
    expect(offline.error?.message).toContain("offline");
    expect(offline.lines).toEqual([]);
    expectClean();
  });

  test("a name that doesn't exist does not trigger the public fallback", async () => {
    fresh();
    let askedPublic = false;
    const d = deps(stub({ resolve4: reject("ENOTFOUND") }), stub({}), async () => []);
    d.publicResolver = () => {
      askedPublic = true;
      return stub({});
    };
    const res = await dnsQuery(netState(ctx), "gone.test", "A", d);
    expect(res.noData).toBe(true);
    expect(askedPublic).toBe(false);
  });

  test("a DNS server that never answers is given up on", async () => {
    fresh();
    const t0 = Date.now();
    const res = await dnsQuery(netState(ctx), "slow.test", "TXT", deps(stub({ resolveTxt: never }), stub({ resolveTxt: never })), 150);
    expect(res.error).not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
    expectClean();
  });

  test("localhost and IP addresses need no network", async () => {
    fresh();
    const state = netState(ctx);
    const boom: DnsDeps = { system: stub({ resolve4: reject("EFAIL"), reverse: reject("EFAIL") }), publicResolver: () => { throw new Error("must not be used"); }, lookup: reject("EFAIL") };
    const a = await call("net/dns", { host: "localhost", type: "A" });
    expect(a.result.lines).toEqual(["127.0.0.1"]);
    expect(a.result.source).toBe("local");
    expect((await call("net/dns", { host: "localhost", type: "AAAA" })).result.lines).toEqual(["::1"]);
    expect((await call("net/dns", { host: "127.0.0.1", type: "PTR" })).result.lines).toEqual(["localhost"]);
    expect((await call("net/dns", { host: "localhost", type: "mx" })).result.noData).toBe(true);
    const ip = await dnsQuery(state, "192.0.2.1", "A", boom);
    expect(ip.explain).toContain("already an IP address");
    await rejects(() => dnsQuery(state, "example.test", "PTR", boom), "NEEDS_IP");
  });

  test("the full audit asks every record type and counts the ones found", async () => {
    fresh();
    const audit = await dnsAudit(netState(ctx), "example.test", deps(stub({})));
    expect(audit.results.map((r) => r.type)).toEqual(["A", "AAAA", "MX", "TXT", "NS", "SOA", "CNAME", "CAA"]);
    expect(audit.active).toBe(7);
    const viaApi = await call("net/dns", { host: "localhost", type: "ALL" });
    expect(viaApi.type).toBe("ALL");
    expect(viaApi.results).toHaveLength(8);
    expect(viaApi.active).toBe(2);
    expect((await call("net/dns", { host: "127.0.0.1", type: "ALL" })).results.map((r: any) => r.type)).toEqual(["PTR"]);
  });

  test("bad record types and bad hosts are refused", async () => {
    fresh();
    await rejects(() => call("net/dns", { host: "localhost", type: "AXFR" }), "BAD_DNS_TYPE");
    await rejects(() => call("net/dns", { host: "evil.com; ls", type: "A" }), "BAD_HOST");
    await rejects(() => call("net/dns", { host: "example.com", type: "PTR" }), "NEEDS_IP");
    expect(DNS_TYPES).toContain("CAA");
  });
});

describe("saving a report", () => {
  test("always makes a new file, never overwrites, and keeps the original untouched", async () => {
    fresh();
    const a = await call("net/save", { folder: out, text: "first report" });
    const b = await call("net/save", { folder: out, text: "second report" });
    expect(a.name).toBe("Network report.txt");
    expect(b.name).toBe("Network report (2).txt");
    expect(readFileSync(a.path, "utf8")).toBe("first report");
    expect(readFileSync(b.path, "utf8")).toBe("second report");
    writeFileSync(join(out, "mine.txt"), "precious");
    const c = await call("net/save", { folder: out, text: "x", name: "mine.txt" });
    expect(c.name).toBe("mine (2).txt");
    expect(readFileSync(join(out, "mine.txt"), "utf8")).toBe("precious");
    const d = await call("net/save", { folder: out, text: "x", name: "notes" });
    expect(d.name).toBe("notes.txt");
  });

  test("parallel saves each get their own file", async () => {
    fresh();
    const sub = join(out, "race");
    mkdirSync(sub);
    const names = (await Promise.all(Array.from({ length: 8 }, (_, i) => call("net/save", { folder: sub, text: `r${i}` })))).map((r) => r.name);
    expect(new Set(names).size).toBe(8);
    expect(readdirSync(sub)).toHaveLength(8);
  });

  test("a scan can be saved as a table (CSV)", async () => {
    fresh();
    const l = listener();
    const done = await untilDone(startScan(ctx, { host: "127.0.0.1", mode: "list", ports: `${l.port}`, timeoutMs: 500 }).id);
    l.stop();
    const saved = await call("net/save", { folder: out, taskId: done.id, format: "csv" });
    expect(saved.name).toBe("Network scan.csv");
    const csv = readFileSync(saved.path, "utf8");
    expect(csv.split("\n")[0]).toBe("host,port,service,status,latency_ms");
    expect(csv).toContain(`"127.0.0.1","${l.port}"`);
    expect(csv).toContain('"OPEN"');
    await rejects(() => call("net/save", { folder: out, taskId: "nope", format: "csv" }), "NO_TASK");
  });

  test("bad names, folders and content are refused with plain messages", async () => {
    fresh();
    await rejects(() => call("net/save", { folder: out, text: "x", name: "../escape.txt" }), "BAD_NAME");
    await rejects(() => call("net/save", { folder: out, text: "x", name: "a/b.txt" }), "BAD_NAME");
    await rejects(() => call("net/save", { folder: out, text: "   " }), "NO_RESULTS");
    await rejects(() => call("net/save", { folder: out, text: "x".repeat(NET_LIMITS.maxReportChars + 1) }), "TOO_LARGE");
    await rejects(() => call("net/save", { folder: "", text: "x" }), "BAD_PATH");
    await rejects(() => call("net/save", { folder: join(out, "missing"), text: "x" }), "NOT_FOUND");
    await rejects(() => call("net/save", { folder: join(out, "Network report.txt"), text: "x" }), "NOT_A_FOLDER");
    await rejects(() => call("net/save", { folder: process.platform === "win32" ? "C:\\Windows" : "/etc", text: "x" }), "PROTECTED");
    expect(existsSync(join(scratch, "escape.txt"))).toBe(false);
  });

  test("~ means the home folder", async () => {
    fresh();
    const saved = await call("net/save", { folder: "~", text: "home report" });
    expect(saved.path).toBe(join(home, "Network report.txt"));
  });
});

describe("through the File Manager server", () => {
  const TOKEN = "net-test-token";
  let server: ReturnType<typeof startFileManagerServer>;
  let base: string;
  beforeAll(() => {
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(scratch, "api-data") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  async function api(op: string, body: unknown = {}, token: string | null = TOKEN) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["x-fm-token"] = token;
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  }
  async function poll(id: string) {
    for (let i = 0; i < 400; i++) {
      const r = await api("net/status", { id });
      if (r.json.task.state !== "running") return r.json.task;
      await wait(15);
    }
    throw new Error("did not finish");
  }

  test("every operation is registered and needs the token", async () => {
    for (const op of ["probe", "scan", "tcpping", "status", "cancel", "dns", "tls", "activity", "clear", "save", "presets"]) expect(API_OPERATIONS).toContain(`net/${op}`);
    expect((await api("net/presets", {}, null)).status).toBe(401);
    expect((await api("net/presets", {}, "wrong")).status).toBe(401);
  });

  test("presets describe the targets, limits and this computer", async () => {
    const r = await api("net/presets");
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.presets.map((p: any) => p.id)).toEqual(["localhost", "cloudflare", "google", "github"]);
    expect(r.json.topPorts).toHaveLength(12);
    expect(r.json.limits.maxPorts).toBe(1024);
    expect(r.json.limits.maxConcurrency).toBe(64);
    expect(r.json.dnsTypes).toContain("PTR");
    for (const c of r.json.connections) if (!c.internal) expect(c.address).toBe("hidden for privacy");
  });

  test("a scan runs in the background, the page polls it, and the audit table records it", async () => {
    const l = listener();
    const shut = closedPort();
    const start = await api("net/scan", { host: "127.0.0.1", mode: "list", ports: `${l.port},${shut}`, timeoutMs: 800 });
    expect(start.status).toBe(200);
    expect(start.json.task.state).toBe("running");
    const done = await poll(start.json.task.id);
    l.stop();
    expect(done.state).toBe("done");
    expect(done.counts.open).toBe(1);
    const act = await api("net/activity", {});
    expect(act.json.rows.filter((r: any) => r.kind === "scan").length).toBeGreaterThanOrEqual(2);
    expect(act.json.rows.some((r: any) => r.target === `127.0.0.1:${l.port}` && r.result === "open")).toBe(true);
    const newer = await api("net/activity", { since: act.json.total });
    expect(newer.json.rows).toEqual([]);
    const cleared = await api("net/clear", {});
    expect(cleared.json.cleared).toBe(true);
    expect((await api("net/activity", {})).json.rows).toEqual([]);
    expect((await api("net/status", {})).json.tasks).toEqual([]);
  });

  test("bad input comes back as a 400 with a plain message", async () => {
    const host = await api("net/scan", { host: "ftp://example.com", mode: "single", port: 21 });
    expect(host.status).toBe(400);
    expect(host.json.error.code).toBe("BAD_HOST");
    const big = await api("net/scan", { host: "127.0.0.1", mode: "list", ports: "1-65535" });
    expect(big.status).toBe(400);
    expect(big.json.error.code).toBe("TOO_MANY_PORTS");
    expect((await api("net/probe", { host: "127.0.0.1\r\nX: y" })).json.error.code).toBe("BAD_HOST");
    expect((await api("net/status", { id: "nope" })).json.error.code).toBe("NO_TASK");
  });

  test("probe, tls, dns and save work end to end", async () => {
    const web = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("hi", { status: 404 }) });
    try {
      const p = await api("net/probe", { host: "localhost", port: web.port, timeoutMs: 3000 });
      expect(p.json.status).toBe(404);
      expect(p.json.explain).toContain("no page");
      const d = await api("net/dns", { host: "localhost", type: "A" });
      expect(d.json.result.lines).toEqual(["127.0.0.1"]);
      const t = await api("net/tls", { host: "127.0.0.1", port: closedPort(), timeoutMs: 500 });
      expect(t.status).toBe(200);
      expect(t.json.error.code).toBe("REFUSED");
      const s = await api("net/save", { folder: out, text: p.json.url });
      expect(s.status).toBe(200);
      expect(readFileSync(s.json.path, "utf8")).toBe(p.json.url);
    } finally {
      web.stop(true);
    }
  });

  test("cancel works over HTTP", async () => {
    netState(server.context).makeSocket = silentSockets().make;
    const start = await api("net/scan", { host: "10.9.9.9", mode: "list", ports: "1-200", timeoutMs: 5000 });
    await wait(30);
    expect((await api("net/cancel", { id: start.json.task.id })).json.cancelled).toBe(1);
    const state = (await api("net/status", { id: start.json.task.id })).json.task.state;
    expect(state).toBe("cancelled");
    netState(server.context).makeSocket = undefined;
  });

  test("stopping the server cancels scans that are still running", async () => {
    const other = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(scratch, "api-data2") } });
    const state = netState(other.context);
    state.makeSocket = silentSockets().make;
    const res = await fetch(`http://127.0.0.1:${other.port}/api/net/scan`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify({ host: "10.9.9.9", mode: "list", ports: "1-100", timeoutMs: 5000 }) });
    expect(res.status).toBe(200);
    await wait(30);
    expect(state.sockets.size).toBeGreaterThan(0);
    const task = [...state.tasks.values()][0]!;
    other.stop(true);
    await task.finished;
    expect(task.state).toBe("cancelled");
    expect(state.sockets.size).toBe(0);
    expect(state.timers.size).toBe(0);
  });
});
