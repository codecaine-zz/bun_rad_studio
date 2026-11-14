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
import { SYSINFO_PROBE_CATALOG } from "../src/features/filemanager/fmSysinfo.ts";
import * as si from "systeminformation";

describe("⚡ System Information Studio Suite (All 71 systeminformation v6 APIs)", () => {
  it("1. Method registry and File Manager probe catalog contain all 71 systeminformation v6 public methods", () => {
    const keys = Object.keys(SI_METHODS);
    const siExports = Object.keys(si).filter(
      (k) => typeof (si as Record<string, unknown>)[k] === "function",
    );
    expect(siExports.length).toBe(71);
    expect(keys.length).toBe(71);
    expect(keys.sort()).toEqual([...siExports].sort());

    const catalogMethods = SYSINFO_PROBE_CATALOG.map((c) => c.method);
    expect(catalogMethods.length).toBe(71);
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
    expect(ver.data).toBe("6.0.0-beta.23");

    expect(sys.success).toBe(true);
    expect(sys.data).toBeDefined();

    expect(bios.success).toBe(true);
    expect(base.success).toBe(true);
    expect(chassis.success).toBe(true);
    expect(uuid.success).toBe(true);
    expect(pci.success).toBe(true);
    expect(tb.success).toBe(true);
  });

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
  });

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
    const [iface, gw, ifaces, stats, conns, wifiNet, wifiIf, wifiConn] =
      await Promise.all([
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
});
