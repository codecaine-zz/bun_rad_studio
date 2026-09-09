import { describe, it, expect } from "bun:test";
import {
  SI_METHODS,
  SI_CATEGORIES,
  executeSiMethod,
  formatDataSummary,
  createSystemInformationStudio,
  createBunSystemStudio,
  createSystemStudio,
  createBrewStudio,
} from "../applications/system_studio.ts";
import si from "systeminformation";

describe("⚡ System Information Studio Suite (All 60 systeminformation APIs)", () => {
  it("1. Method registry contains all 60 systeminformation public methods", () => {
    const keys = Object.keys(SI_METHODS);
    expect(keys.length).toBe(60);

    // Verify all 10 domain areas exist
    expect(SI_CATEGORIES.length).toBe(10);
    for (const cat of SI_CATEGORIES) {
      const methods = Object.values(SI_METHODS).filter((m) => m.category === cat);
      expect(methods.length).toBeGreaterThan(0);
    }
  });

  it("2. Category 1: Hardware & Baseboard methods execute successfully", async () => {
    const [ver, sys, bios, base, chassis, uuid] = await Promise.all([
      executeSiMethod("version"),
      executeSiMethod("system"),
      executeSiMethod("bios"),
      executeSiMethod("baseboard"),
      executeSiMethod("chassis"),
      executeSiMethod("uuid"),
    ]);

    expect(ver.success).toBe(true);
    expect(typeof ver.data).toBe("string");

    expect(sys.success).toBe(true);
    expect(sys.data).toBeDefined();

    expect(bios.success).toBe(true);
    expect(base.success).toBe(true);
    expect(chassis.success).toBe(true);
    expect(uuid.success).toBe(true);
  });

  it("3. Category 2: OS & Software Environment methods execute successfully", async () => {
    const [osInfo, versions, shell, time] = await Promise.all([
      executeSiMethod("osInfo"),
      executeSiMethod("versions"),
      executeSiMethod("shell"),
      executeSiMethod("time"),
    ]);

    expect(osInfo.success).toBe(true);
    expect(osInfo.data.platform).toBeDefined();

    expect(versions.success).toBe(true);
    expect(versions.data).toBeDefined();

    expect(shell.success).toBe(true);
    expect(time.success).toBe(true);
    expect(time.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it("4. Category 3: CPU, Load & Thermals methods execute successfully", async () => {
    const [cpu, flags, cache, speed, temp, load, full] = await Promise.all([
      executeSiMethod("cpu"),
      executeSiMethod("cpuFlags"),
      executeSiMethod("cpuCache"),
      executeSiMethod("cpuCurrentSpeed"),
      executeSiMethod("cpuTemperature"),
      executeSiMethod("currentLoad"),
      executeSiMethod("fullLoad"),
    ]);

    expect(cpu.success).toBe(true);
    expect(cpu.data.cores).toBeGreaterThan(0);

    expect(flags.success).toBe(true);
    expect(cache.success).toBe(true);
    expect(speed.success).toBe(true);
    expect(temp.success).toBe(true);

    expect(load.success).toBe(true);
    expect(typeof load.data.currentLoad).toBe("number");

    expect(full.success).toBe(true);
    expect(typeof full.data).toBe("number");
  });

  it("5. Category 4 & 5: Memory, Battery & Graphics execute successfully", async () => {
    const [mem, layout, bat, gfx] = await Promise.all([
      executeSiMethod("mem"),
      executeSiMethod("memLayout"),
      executeSiMethod("battery"),
      executeSiMethod("graphics"),
    ]);

    expect(mem.success).toBe(true);
    expect(mem.data.total).toBeGreaterThan(0);

    expect(layout.success).toBe(true);
    expect(Array.isArray(layout.data)).toBe(true);

    expect(bat.success).toBe(true);
    expect(bat.data).toBeDefined();

    expect(gfx.success).toBe(true);
    expect(gfx.data.controllers).toBeDefined();
  });

  it("6. Category 6: Storage & Filesystems execute successfully", async () => {
    const [fsSize, fsOpen, block, stats, io, layout] = await Promise.all([
      executeSiMethod("fsSize"),
      executeSiMethod("fsOpenFiles"),
      executeSiMethod("blockDevices"),
      executeSiMethod("fsStats"),
      executeSiMethod("disksIO"),
      executeSiMethod("diskLayout"),
    ]);

    expect(fsSize.success).toBe(true);
    expect(Array.isArray(fsSize.data)).toBe(true);

    expect(fsOpen.success).toBe(true);
    expect(block.success).toBe(true);
    expect(stats.success).toBe(true);
    expect(io.success).toBe(true);
    expect(layout.success).toBe(true);
  });

  it("7. Category 7: Network & Wi-Fi methods execute successfully", async () => {
    const [iface, gw, ifaces, stats, conns, wifiNet, wifiIf, wifiConn] = await Promise.all([
      executeSiMethod("networkInterfaceDefault"),
      executeSiMethod("networkGatewayDefault"),
      executeSiMethod("networkInterfaces"),
      executeSiMethod("networkStats"),
      executeSiMethod("networkConnections"),
      executeSiMethod("wifiNetworks"),
      executeSiMethod("wifiInterfaces"),
      executeSiMethod("wifiConnections"),
    ]);

    expect(iface.success).toBe(true);
    expect(gw.success).toBe(true);
    expect(ifaces.success).toBe(true);
    expect(stats.success).toBe(true);
    expect(conns.success).toBe(true);
    expect(wifiNet.success).toBe(true);
    expect(wifiIf.success).toBe(true);
    expect(wifiConn.success).toBe(true);
  }, 20000);

  it("8. Category 8 & 9: Processes, Services & Peripherals execute successfully", async () => {
    const [procs, procLoad, serv, users, audio, bt, printer, usb] = await Promise.all([
      executeSiMethod("processes"),
      executeSiMethod("processLoad", "bun"),
      executeSiMethod("services", "*"),
      executeSiMethod("users"),
      executeSiMethod("audio"),
      executeSiMethod("bluetoothDevices"),
      executeSiMethod("printer"),
      executeSiMethod("usb"),
    ]);

    expect(procs.success).toBe(true);
    expect(procs.data.all).toBeGreaterThan(0);

    expect(procLoad.success).toBe(true);
    expect(serv.success).toBe(true);
    expect(users.success).toBe(true);

    expect(audio.success).toBe(true);
    expect(bt.success).toBe(true);
    expect(printer.success).toBe(true);
    expect(usb.success).toBe(true);
  });

  it("9. Category 10: Virtualization, Docker & Batch methods execute successfully", async () => {
    const [dInfo, dImg, dCont, dVol, dAll, vbox, staticData, dynamicData, pStart, pRel] = await Promise.all([
      executeSiMethod("dockerInfo"),
      executeSiMethod("dockerImages"),
      executeSiMethod("dockerContainers"),
      executeSiMethod("dockerVolumes"),
      executeSiMethod("dockerAll"),
      executeSiMethod("vboxInfo"),
      executeSiMethod("getStaticData"),
      executeSiMethod("getDynamicData"),
      executeSiMethod("powerShellStart"),
      executeSiMethod("powerShellRelease"),
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

    expect(pStart.success).toBe(true);
    expect(pRel.success).toBe(true);
  }, 20000);

  it("10. formatDataSummary produces safe strings for all input structures", () => {
    expect(formatDataSummary("test", null)).toContain("No data returned");
    expect(formatDataSummary("test", "hello")).toBe("[test] Value: hello");
    expect(formatDataSummary("test", 42)).toBe("[test] Value: 42");
    expect(formatDataSummary("test", [])).toContain("0 entries");
    expect(formatDataSummary("test", [{ id: 1, name: "Node" }])).toContain("[#1]");
    expect(formatDataSummary("test", { key: "value", num: 123 })).toContain("key: value");
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
});
