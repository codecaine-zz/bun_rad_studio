import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { serverutils } from "../src/features/rad/modules/serverutils";
import { Sys } from "../src/simplecli/sys/index";

// Library helpers that start servers must not publish anything to the network unless asked to (D-037).
const LOOPBACK = ["127.0.0.1"];
const stoppers: Array<() => void> = [];
const dirs: string[] = [];

afterEach(() => {
  while (stoppers.length) stoppers.pop()!();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function siteDir() {
  const dir = mkdtempSync(join(tmpdir(), "serve-static-"));
  dirs.push(dir);
  writeFileSync(join(dir, "index.html"), "<p>hello</p>");
  return dir;
}

describe("Library servers listen on loopback by default", () => {
  test("rad serverutils.serveStatic", async () => {
    const srv = serverutils.serveStatic({ dir: siteDir() });
    stoppers.push(() => srv.stop());
    expect(LOOPBACK).toContain(srv.raw.hostname as string);
    expect(await (await fetch(`http://127.0.0.1:${srv.port}/`)).text()).toBe("<p>hello</p>");
  });

  test("rad serverutils.createWsHub", () => {
    const hub = serverutils.createWsHub();
    stoppers.push(() => hub.stop());
    expect(LOOPBACK).toContain(hub.raw.hostname as string);
  });

  test("SimpleCLI Sys.serve", () => {
    const srv = Sys.serve({ port: 0, fetch: () => new Response("ok") });
    stoppers.push(() => srv.stop(true));
    expect(LOOPBACK).toContain(srv.hostname);
  });

  test("SimpleCLI Sys.serveStatic", async () => {
    const srv = Sys.serveStatic(siteDir(), 0);
    stoppers.push(() => srv.stop(true));
    expect(LOOPBACK).toContain(srv.hostname);
    expect(await (await fetch(`http://127.0.0.1:${srv.port}/`)).text()).toBe("<p>hello</p>");
  });
});

describe("An explicit hostname is still honoured", () => {
  test("serveStatic, createWsHub and Sys.serveStatic accept hostname", () => {
    const a = serverutils.serveStatic({ dir: siteDir(), hostname: "127.0.0.1" });
    const b = serverutils.createWsHub({ hostname: "127.0.0.1" });
    const c = Sys.serveStatic(siteDir(), 0, "127.0.0.1");
    stoppers.push(() => a.stop(), () => b.stop(), () => c.stop(true));
    expect(a.raw.hostname).toBe("127.0.0.1");
    expect(b.raw.hostname).toBe("127.0.0.1");
    expect(c.hostname).toBe("127.0.0.1");
  });

  test("Sys.serve keeps working when the caller passes a hostname", () => {
    const srv = Sys.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("ok") });
    stoppers.push(() => srv.stop(true));
    expect(srv.hostname).toBe("127.0.0.1");
  });
});
