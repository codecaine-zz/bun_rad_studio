import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { homedir, hostname, tmpdir, userInfo } from "os";
import { join } from "path";
import {
  SI_METHODS,
  SI_CATEGORIES,
  executeSiMethod,
  formatDataSummary,
  sanitizeTelemetryForScreenshot,
  sanitizeKpisForScreenshot,
  generateEnterpriseAppHtml,
  createSystemInformationStudio,
  createBunSystemStudio,
  createSystemStudio,
  createBrewStudio,
} from "../applications/system_studio.ts";
import { startSystemStudioServer } from "../applications/system_studio_server.ts";
import { SYSINFO_PROBE_CATALOG } from "../src/features/filemanager/fmSysinfo.ts";
import * as si from "systeminformation";

describe("⚡ System Information Studio Suite (All 76 systeminformation v6 APIs)", () => {
  it("1. Method registry and File Manager probe catalog contain all 76 systeminformation v6 public methods", () => {
    const keys = Object.keys(SI_METHODS);
    const siExports = Object.keys(si).filter(
      (k) => typeof (si as Record<string, unknown>)[k] === "function",
    );
    expect(siExports.length).toBe(76);
    expect(keys.length).toBe(76);
    expect(keys.sort()).toEqual([...siExports].sort());

    const catalogMethods = SYSINFO_PROBE_CATALOG.map((c) => c.method);
    expect(catalogMethods.length).toBe(76);
    expect([...catalogMethods].sort()).toEqual([...siExports].sort());

    // Verify all 10 domain areas exist
    expect(SI_CATEGORIES.length).toBe(10);
    for (const cat of SI_CATEGORIES) {
      const methods = Object.values(SI_METHODS).filter(
        (m) => m.category === cat,
      );
      expect(methods.length).toBeGreaterThan(0);
    }
  });

  it("2. Category 1: Hardware & Baseboard methods execute successfully", async () => {
    const [ver, sys, bios, base, chassis, uuid, pci, tb] = await Promise.all([
      executeSiMethod("version"),
      executeSiMethod("system"),
      executeSiMethod("bios"),
      executeSiMethod("baseboard"),
      executeSiMethod("chassis"),
      executeSiMethod("uuid"),
      executeSiMethod("pci"),
      executeSiMethod("thunderbolt"),
    ]);

    expect(ver.success).toBe(true);
    expect(typeof ver.data).toBe("string");
    expect(ver.data).toBe("6.0.0-beta.26");

    expect(sys.success).toBe(true);
    expect(sys.data).toBeDefined();

    expect(bios.success).toBe(true);
    expect(base.success).toBe(true);
    expect(chassis.success).toBe(true);
    expect(uuid.success).toBe(true);
    expect(pci.success).toBe(true);
    expect(tb.success).toBe(true);
  }, 60_000);

  it("3. Category 2: OS & Software Environment methods execute successfully", async () => {
    const [osInfo, versions, npmRes, shell, time] = await Promise.all([
      executeSiMethod("osInfo"),
      executeSiMethod("versions", "node, git"),
      executeSiMethod("npm"),
      executeSiMethod("shell"),
      executeSiMethod("time"),
    ]);

    expect(osInfo.success).toBe(true);
    expect(osInfo.data.platform).toBeDefined();

    expect(versions.success).toBe(true);
    expect(versions.data).toBeDefined();

    expect(npmRes.success).toBe(true);
    expect(Array.isArray(npmRes.data)).toBe(true);

    expect(shell.success).toBe(true);
    expect(time.success).toBe(true);
    expect(time.data.uptime).toBeGreaterThanOrEqual(0);

    const psStart = await executeSiMethod("powerShellStart");
    expect(psStart.success).toBe(true);
    expect(psStart.data).toBeDefined();

    const psRelease = await executeSiMethod("powerShellRelease");
    expect(psRelease.success).toBe(true);
    expect(psRelease.data.released).toBe(true);
  }, 30_000);

  it("4. Category 3: CPU, Load & Thermals methods execute successfully", async () => {
    const [cpu, npu, flags, cache, speed, temp, fans, load, full] =
      await Promise.all([
        executeSiMethod("cpu"),
        executeSiMethod("npu"),
        executeSiMethod("cpuFlags"),
        executeSiMethod("cpuCache"),
        executeSiMethod("cpuCurrentSpeed"),
        executeSiMethod("cpuTemperature"),
        executeSiMethod("fans"),
        executeSiMethod("currentLoad"),
        executeSiMethod("fullLoad"),
      ]);

    expect(cpu.success).toBe(true);
    expect(cpu.data.cores).toBeGreaterThan(0);

    expect(npu.success).toBe(true);
    expect(flags.success).toBe(true);
    expect(cache.success).toBe(true);
    expect(speed.success).toBe(true);
    expect(temp.success).toBe(true);
    expect(fans.success).toBe(true);

    expect(load.success).toBe(true);
    expect(typeof load.data.currentLoad).toBe("number");

    expect(full.success).toBe(true);
    expect(typeof full.data).toBe("number");
  }, 60_000);

  it("5. Category 4 & 5: Memory, Battery, GPU & Displays execute successfully", async () => {
    const [mem, layout, bat, gpu, displays] = await Promise.all([
      executeSiMethod("mem"),
      executeSiMethod("memLayout"),
      executeSiMethod("battery"),
      executeSiMethod("gpu"),
      executeSiMethod("displays"),
    ]);

    expect(mem.success).toBe(true);
    expect(mem.data.total).toBeGreaterThan(0);

    expect(layout.success).toBe(true);
    expect(Array.isArray(layout.data)).toBe(true);

    expect(bat.success).toBe(true);
    expect(bat.data).toBeDefined();

    expect(gpu.success).toBe(true);
    expect(Array.isArray(gpu.data)).toBe(true);

    expect(displays.success).toBe(true);
    expect(Array.isArray(displays.data)).toBe(true);
  }, 60_000);

  it("6. Category 6: Storage & Filesystems execute successfully", async () => {
    const [fsSize, fsOpen, block, stats, io, layout, dSpeed] =
      await Promise.all([
        executeSiMethod("fsSize"),
        executeSiMethod("fsOpenFiles"),
        executeSiMethod("blockDevices"),
        executeSiMethod("fsStats"),
        executeSiMethod("disksIO"),
        executeSiMethod("diskLayout"),
        executeSiMethod("diskSpeed", "16"),
      ]);

    expect(fsSize.success).toBe(true);
    expect(Array.isArray(fsSize.data)).toBe(true);

    expect(fsOpen.success).toBe(true);
    expect(block.success).toBe(true);
    expect(stats.success).toBe(true);
    expect(io.success).toBe(true);
    expect(layout.success).toBe(true);
    expect(dSpeed.success).toBe(true);
    expect(dSpeed.data === null || typeof dSpeed.data.ms === "number").toBe(
      true,
    );
  }, 60_000);

  it("7. Category 7: Network & Wi-Fi methods execute successfully", async () => {
    const [iface, gw, ifaces, stats, routes, conns, wifiNet, wifiIf, wifiConn] =
      await Promise.all([
        executeSiMethod("networkInterfaceDefault"),
        executeSiMethod("networkGatewayDefault"),
        executeSiMethod("networkInterfaces"),
        executeSiMethod("networkStats"),
        executeSiMethod("networkRoutes"),
        executeSiMethod("networkConnections"),
        executeSiMethod("wifiNetworks"),
        executeSiMethod("wifiInterfaces"),
        executeSiMethod("wifiConnections"),
      ]);

    expect(iface.success).toBe(true);
    expect(gw.success).toBe(true);
    expect(ifaces.success).toBe(true);
    expect(stats.success).toBe(true);
    expect(routes.success).toBe(true);
    expect(Array.isArray(routes.data)).toBe(true);
    expect(conns.success).toBe(true);
    expect(wifiNet.success).toBe(true);
    expect(wifiIf.success).toBe(true);
    expect(wifiConn.success).toBe(true);
  }, 60000);

  it("8. Category 8 & 9: Processes, Services & Peripherals execute successfully", async () => {
    const [
      procs,
      procLoad,
      procFocused,
      serv,
      users,
      audio,
      bt,
      printer,
      usb,
      serialPorts,
      camera,
      keyboard,
      mouse,
    ] = await Promise.all([
      executeSiMethod("processes"),
      executeSiMethod("processLoad", "bun"),
      executeSiMethod("processFocused"),
      executeSiMethod("services", "*"),
      executeSiMethod("users"),
      executeSiMethod("audio"),
      executeSiMethod("bluetoothDevices"),
      executeSiMethod("printer"),
      executeSiMethod("usb"),
      executeSiMethod("serialPorts"),
      executeSiMethod("camera"),
      executeSiMethod("keyboard"),
      executeSiMethod("mouse"),
    ]);

    expect(procs.success).toBe(true);
    expect(procs.data.all).toBeGreaterThan(0);

    expect(procLoad.success).toBe(true);
    expect(procFocused.success).toBe(true);
    expect(serv.success).toBe(true);
    expect(users.success).toBe(true);

    expect(audio.success).toBe(true);
    expect(bt.success).toBe(true);
    expect(printer.success).toBe(true);
    expect(usb.success).toBe(true);
    expect(serialPorts.success).toBe(true);
    expect(camera.success).toBe(true);
    expect(keyboard.success).toBe(true);
    expect(mouse.success).toBe(true);
  }, 60000);

  it("9. Category 10: Virtualization, Docker & Batch methods execute successfully", async () => {
    const [
      dInfo,
      dImg,
      dCont,
      dVol,
      dAll,
      vbox,
      staticData,
      dynamicData,
      getQuery,
    ] = await Promise.all([
      executeSiMethod("dockerInfo"),
      executeSiMethod("dockerImages"),
      executeSiMethod("dockerContainers"),
      executeSiMethod("dockerVolumes"),
      executeSiMethod("dockerAll"),
      executeSiMethod("vboxInfo"),
      executeSiMethod("getStaticData"),
      executeSiMethod("getDynamicData"),
      executeSiMethod("get", '{"cpu": "brand, cores", "mem": "total"}'),
    ]);

    expect(dInfo.success).toBe(true);
    expect(dImg.success).toBe(true);
    expect(dCont.success).toBe(true);
    expect(dVol.success).toBe(true);
    expect(dAll.success).toBe(true);
    expect(vbox.success).toBe(true);

    expect(staticData.success).toBe(true);
    expect(staticData.data.cpu).toBeDefined();

    expect(dynamicData.success).toBe(true);
    expect(dynamicData.data.mem).toBeDefined();

    expect(getQuery.success).toBe(true);
    expect(getQuery.data.cpu).toBeDefined();
  }, 60000);

  it("10. formatDataSummary produces safe strings for all input structures", () => {
    expect(formatDataSummary("test", null)).toContain("No data returned");
    expect(formatDataSummary("test", "hello")).toBe("[test] Value: hello");
    expect(formatDataSummary("test", 42)).toBe("[test] Value: 42");
    expect(formatDataSummary("test", [])).toContain("0 entries");
    expect(formatDataSummary("test", [{ id: 1, name: "Node" }])).toContain(
      "[#1]",
    );
    expect(formatDataSummary("test", { key: "value", num: 123 })).toContain(
      "key: value",
    );
  });

  it("11. Desktop SimpleWindow factory creates window and preserves backward compatibility exports", () => {
    const win = createSystemInformationStudio();
    expect(win).toBeDefined();
    expect(typeof win.run).toBe("function");

    // Check aliases
    expect(createBunSystemStudio).toBe(createSystemInformationStudio);
    expect(createSystemStudio).toBe(createSystemInformationStudio);
    expect(typeof createBrewStudio).toBe("function");
  });

  it("12. Privacy sanitization masks hardware IDs, IPs, hostnames, users, and possessive peripheral names", () => {
    const user = userInfo().username;
    const home = homedir();
    const host = hostname();

    const sanitizedSys = sanitizeTelemetryForScreenshot("system", {
      manufacturer: "Acme",
      model: "Pro-1",
      serial: "C02SECRET123",
      uuid: "12345678-1234-5678-9abc-1234567890ab",
    });
    expect(sanitizedSys.serial).toContain("Protected / Masked");
    expect(sanitizedSys.uuid).toContain("Protected / Masked");

    const sanitizedNet = sanitizeTelemetryForScreenshot("networkInterfaces", [
      {
        iface: "en0",
        ip4: "10.0.1.55",
        ip6: "fe80::1234:5678:abcd:ef01",
        mac: "aa:bb:cc:dd:ee:ff",
      },
    ]);
    expect(sanitizedNet[0]!.ip4).toBe("192.168.1.*** (Masked)");
    expect(sanitizedNet[0]!.ip6).toBe("fe80::*** (Masked)");
    expect(sanitizedNet[0]!.mac).toContain("Protected / Masked");

    const sanitizedPub = sanitizeTelemetryForScreenshot("inetPublicIp", {
      ip: "198.51.100.42",
    });
    expect(sanitizedPub.ip).toBe("203.0.113.*** (Masked)");

    const sanitizedAudio = sanitizeTelemetryForScreenshot("audio", [
      {
        name: "Studio Headphones",
        manufacturer: "Alice’s AirPods Max",
      },
      {
        name: "USB Mic",
        manufacturer: "Bob's",
      },
    ]);
    expect(sanitizedAudio[1]!.manufacturer).toBe("Studio Peripheral");

    const sanitizedUsers = sanitizeTelemetryForScreenshot("users", [
      { user, command: `${home}/bin/worker` },
    ]);
    expect(sanitizedUsers[0]!.user).toBe("developer");
    if (home.length > 3) {
      expect(sanitizedUsers[0]!.command).not.toContain(home);
    }

    const sanitizedOs = sanitizeTelemetryForScreenshot("osInfo", {
      hostname: host,
      fqdn: `${host}.corp.local`,
    });
    expect(sanitizedOs.hostname).toBe("studio-workstation.local");
    expect(sanitizedOs.fqdn).toBe("studio-workstation.local");

    const kpis = sanitizeKpisForScreenshot({
      netIface: "en0",
      netGateway: "10.0.0.1",
      osDistro: `${host} Darwin`,
    });
    expect(kpis.netIface).toBe("en0 (Protected)");
    expect(kpis.netGateway).toBe("192.168.1.*** (Masked)");
    if (host.length >= 4) {
      expect(kpis.osDistro).not.toContain(host);
    }
  });

  it("13. Studio HTTP server handles /favicon.ico 204 and masks /api/kpis + /api/execute under SCREENSHOT_MODE=1", async () => {
    const prevShot = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    const srv = startSystemStudioServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const favRes = await fetch(`${base}/favicon.ico`);
      expect(favRes.status).toBe(204);

      const kpiRes = await fetch(`${base}/api/kpis`);
      expect(kpiRes.status).toBe(200);
      const kpis = (await kpiRes.json()) as Record<string, any>;
      expect(kpis.netGateway).toBe("192.168.1.*** (Masked)");
      expect(String(kpis.netIface)).toContain("Protected");

      const pubRes = await fetch(`${base}/api/execute?method=inetPublicIp`);
      expect(pubRes.status).toBe(200);
      const pubBody = (await pubRes.json()) as {
        success: boolean;
        data: { ip4?: string; ip6?: string };
      };
      expect(pubBody.success).toBe(true);
      expect(pubBody.data?.ip4).toContain("Masked");
      expect(pubBody.data?.ip6).toContain("Masked");

      const sysRes = await fetch(`${base}/api/execute?method=system`);
      expect(sysRes.status).toBe(200);
      const sysBody = (await sysRes.json()) as {
        success: boolean;
        data: { serial?: string; uuid?: string };
      };
      expect(sysBody.success).toBe(true);
      if (sysBody.data?.serial && sysBody.data.serial !== "unknown") {
        expect(sysBody.data.serial).toContain("Protected / Masked");
      }
      if (sysBody.data?.uuid && sysBody.data.uuid !== "unknown") {
        expect(sysBody.data.uuid).toContain("Protected / Masked");
      }
    } finally {
      srv.stop(true);
      if (prevShot === undefined) delete process.env.SCREENSHOT_MODE;
      else process.env.SCREENSHOT_MODE = prevShot;
    }
  });

  it("14. Generated HTML includes responsive layout CSS, light-theme overrides, ARIA attributes, 76-API demo payloads, and valid script syntax", () => {
    const html = generateEnterpriseAppHtml();
    expect(html).toContain('id="sysLightAndResponsiveCss"');
    expect(html).toContain("@media (max-width: 960px)");
    expect(html).toContain("@media (max-width: 640px)");
    expect(html).toContain("flex-direction: column;");
    expect(html).toContain("function buildDemoPayload");
    expect(html).toContain("function maskTelemetryClient");
    expect(html).toContain(
      `const STUDIO_BUN_VERSION = ${JSON.stringify(Bun.version)};`,
    );
    expect(html).not.toContain("48 GB LPDDR5");
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1]!,
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it("15. Live Headless Chrome CDP QA verifies Desktop/Mobile layouts, Dark/Light themes, all 76 demo APIs, privacy masking, and zero runtime errors", async () => {
    const chromeCandidates = [
      process.env.CHROME_BIN || "",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].filter(Boolean);
    const chromePath = chromeCandidates.find((p) => existsSync(p));
    if (!chromePath) {
      return;
    }

    const prevShot = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    const srv = startSystemStudioServer({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${srv.port}`;

    const portProbe = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("ok"),
    });
    const cdpPort = portProbe.port!;
    portProbe.stop(true);

    const profileDir = mkdtempSync(join(tmpdir(), "sysstudio-cdp-test-"));
    const chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    let ws: WebSocket | null = null;
    try {
      let wsUrl = "";
      for (let i = 0; i < 40; i++) {
        await Bun.sleep(150);
        try {
          const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
          if (res.ok) {
            const list = (await res.json()) as Array<{
              webSocketDebuggerUrl?: string;
              type?: string;
            }>;
            const target = list.find((t) => t.type === "page") || list[0];
            if (target?.webSocketDebuggerUrl) {
              wsUrl = target.webSocketDebuggerUrl;
              break;
            }
          }
        } catch {}
      }
      expect(wsUrl.length).toBeGreaterThan(0);

      ws = new WebSocket(wsUrl);
      await new Promise<void>((res, rej) => {
        ws!.onopen = () => res();
        ws!.onerror = (e) => rej(e);
      });

      let msgId = 1;
      const pending = new Map<number, (v: any) => void>();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const failedReqs: string[] = [];

      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)!(msg.result ?? msg.error);
          pending.delete(msg.id);
          return;
        }
        if (msg.method === "Runtime.exceptionThrown") {
          pageErrors.push(JSON.stringify(msg.params?.exceptionDetails));
        } else if (
          msg.method === "Runtime.consoleAPICalled" &&
          msg.params?.type === "error"
        ) {
          consoleErrors.push(JSON.stringify(msg.params.args));
        } else if (msg.method === "Network.loadingFailed") {
          failedReqs.push(JSON.stringify(msg.params));
        } else if (
          msg.method === "Network.responseReceived" &&
          Number(msg.params?.response?.status) >= 400
        ) {
          failedReqs.push(
            `${msg.params.response.status} ${msg.params.response.url}`,
          );
        }
      };

      const send = (method: string, params: Record<string, any> = {}) =>
        new Promise<any>((resolve) => {
          const id = msgId++;
          pending.set(id, resolve);
          ws!.send(JSON.stringify({ id, method, params }));
        });

      const evalJs = async (expression: string) => {
        const r = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (r?.exceptionDetails) {
          throw new Error(
            "CDP eval error: " + JSON.stringify(r.exceptionDetails),
          );
        }
        return r?.result?.value;
      };

      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");

      // Check Desktop (1440x900) and Mobile (390x844) across Dark and Light themes
      for (const vp of [
        { name: "desktop", w: 1440, h: 900, mobile: false },
        { name: "mobile", w: 390, h: 844, mobile: true },
      ]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width: vp.w,
          height: vp.h,
          deviceScaleFactor: 1,
          mobile: vp.mobile,
        });
        for (const theme of ["dark", "light"]) {
          await send("Page.navigate", { url: `${baseUrl}/?demo=1` });
          await Bun.sleep(700);
          await evalJs(
            theme === "light"
              ? `if (!document.documentElement.classList.contains("light")) toggleTheme();`
              : `if (document.documentElement.classList.contains("light")) toggleTheme();`,
          );
          await Bun.sleep(100);

          const layout = await evalJs(`(() => {
            const doc = document.documentElement;
            const qc = document.getElementById("quickChips")?.getBoundingClientRect();
            const qs = document.querySelector(".quick-settings")?.getBoundingClientRect();
            const quickOverlap = !!(qc && qs && !(qc.right <= qs.left + 0.5 || qs.right <= qc.left + 0.5 || qc.bottom <= qs.top + 0.5 || qs.bottom <= qc.top + 0.5));
            const catListH = document.getElementById("catListContainer")?.getBoundingClientRect().height || 0;
            const missingAria = [...document.querySelectorAll(".cat-header, .method-btn, .tab-btn")].filter(
              (el) => !el.getAttribute("role") || el.getAttribute("tabindex") === null
            ).length;
            return {
              isLight: doc.classList.contains("light"),
              overflow: doc.scrollWidth > doc.clientWidth,
              quickOverlap,
              catListH,
              missingAria,
              methodCount: document.querySelectorAll(".method-btn").length,
              catCount: document.querySelectorAll(".cat-group").length,
            };
          })()`);

          expect(layout.isLight).toBe(theme === "light");
          expect(layout.overflow).toBe(false);
          expect(layout.quickOverlap).toBe(false);
          expect(layout.catListH).toBeGreaterThanOrEqual(100);
          expect(layout.missingAria).toBe(0);
          expect(layout.methodCount).toBe(76);
          expect(layout.catCount).toBe(10);
        }
      }

      // Reset to Desktop dark and execute all 76 APIs in ?demo=1 + category filters + snapshot diff
      await send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send("Page.navigate", { url: `${baseUrl}/?demo=1` });
      await Bun.sleep(700);
      await evalJs(
        `if (document.documentElement.classList.contains("light")) toggleTheme();`,
      );

      const all76 = await evalJs(`(async () => {
        const badUndef = [];
        const badNaN = [];
        const badEmpty = [];
        for (const m of ALL_METHODS) {
          await selectMethod(m.name, true);
          const vis = document.getElementById("visualContainer").innerText;
          const json = document.getElementById("jsonInspector").innerText;
          if (/\\bundefined\\b/.test(vis) || /\\bundefined\\b/.test(json)) badUndef.push(m.name);
          if (/\\bNaN\\b/.test(vis) || /\\bNaN\\b/.test(json)) badNaN.push(m.name);
          if (!vis.trim() || !json.trim()) badEmpty.push(m.name);
        }
        filterByCategory("Graphics & Displays");
        const gpuActive = document.querySelector('.cat-pill-btn[data-cat="Graphics & Displays"]')?.classList.contains("active");
        const gpuCount = document.querySelectorAll(".method-btn").length;
        filterByCategory("ALL");

        await selectMethod("currentLoad", true);
        takeSnapshot();
        await compareSnapshot();
        const overlayShow = document.getElementById("overlay")?.classList.contains("show");
        const diffRows = document.querySelectorAll("#overlayBody tbody tr").length;
        closeOverlay();

        return { total: ALL_METHODS.length, badUndef, badNaN, badEmpty, gpuActive, gpuCount, overlayShow, diffRows };
      })()`);

      expect(all76.total).toBe(76);
      expect(all76.badUndef).toEqual([]);
      expect(all76.badNaN).toEqual([]);
      expect(all76.badEmpty).toEqual([]);
      expect(all76.gpuActive).toBe(true);
      expect(all76.gpuCount).toBe(2);
      expect(all76.overlayShow).toBe(true);
      expect(all76.diffRows).toBeGreaterThan(0);

      // Verify live SCREENSHOT_MODE=1 page masks personal identifiers
      await send("Page.navigate", { url: `${baseUrl}/` });
      await Bun.sleep(900);
      const liveText = await evalJs(`document.body.innerText`);
      const user = userInfo().username;
      const home = homedir();
      const host = hostname();
      if (user.length >= 3) {
        expect(new RegExp(`\\b${user}\\b`, "i").test(liveText)).toBe(false);
      }
      if (home.length > 3) {
        expect(liveText).not.toContain(home);
      }
      if (host.length >= 4) {
        expect(liveText).not.toContain(host);
      }
      expect(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(
          liveText,
        ),
      ).toBe(false);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(failedReqs).toEqual([]);
    } finally {
      try {
        ws?.close();
      } catch {}
      try {
        chrome.kill("SIGKILL");
      } catch {}
      srv.stop(true);
      rmSync(profileDir, { recursive: true, force: true });
      if (prevShot === undefined) delete process.env.SCREENSHOT_MODE;
      else process.env.SCREENSHOT_MODE = prevShot;
    }
  }, 30000);
});
