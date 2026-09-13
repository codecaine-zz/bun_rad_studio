import { describe, expect, it } from "bun:test";
import {
  formatBytes,
  formatCount,
  formatRelativeBar,
  parseDfOutput,
  scanItem,
  sortDiskItems,
} from "./gduDoers.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("gdu doers", () => {
  it("formats bytes correctly for binary and SI prefixes", () => {
    expect(formatBytes(500).trim()).toBe("500 B");
    expect(formatBytes(1024).trim()).toBe("1.0 KiB");
    expect(formatBytes(1024 * 1024).trim()).toBe("1.0 MiB");
    expect(formatBytes(1000 * 1000, true).trim()).toBe("1.0 MB");
  });

  it("formats item count with SI abbreviation", () => {
    expect(formatCount(42).trim()).toBe("42");
    expect(formatCount(1500).trim()).toBe("1.5k");
    expect(formatCount(2500000).trim()).toBe("2.5M");
  });

  it("formats relative size bar accurately", () => {
    expect(formatRelativeBar(1.0, 10)).toBe("[##########]");
    expect(formatRelativeBar(0.5, 10)).toBe("[#####     ]");
    expect(formatRelativeBar(0.0, 10)).toBe("[          ]");
  });

  it("parses df output lines", () => {
    const rawDf = `Filesystem     1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk3s1   971319460  12336696 403165920     3%  458732 4031659200    0%   /
devfs                204       204         0   100%     708          0  100%   /dev
`;
    const disks = parseDfOutput(rawDf);
    expect(disks.length).toBe(1);
    expect(disks[0]?.filesystem).toBe("/dev/disk3s1");
    expect(disks[0]?.mountPoint).toBe("/");
    expect(disks[0]?.percentUsed).toBe("3%");
  });

  it("scans directory disk usage recursively", async () => {
    const testDir = join(tmpdir(), `gdu_test_${Date.now()}`);
    await Bun.write(join(testDir, "a.txt"), "hello world");
    await Bun.write(join(testDir, "b.txt"), "bun disk usage");

    const scanned = await scanItem(testDir, "testDir", [], false);
    expect(scanned.isDirectory).toBe(true);
    expect(scanned.itemCount).toBe(3); // dir + 2 files
    expect(scanned.children?.length).toBe(2);
    expect(scanned.size).toBeGreaterThan(0);
  });

  it("sorts disk items by name and count", () => {
    const items = [
      { name: "z_file", path: "/z", size: 100, itemCount: 10, isDirectory: false, mtime: new Date() },
      { name: "a_file", path: "/a", size: 200, itemCount: 5, isDirectory: false, mtime: new Date() },
    ];
    const byName = sortDiskItems(items, "name");
    expect(byName[0]?.name).toBe("a_file");

    const byCount = sortDiskItems(items, "count");
    expect(byCount[0]?.name).toBe("z_file");
  });

  it("parses human-readable byte sizes correctly", () => {
    const { parseByteSize } = require("./gduDoers.ts");
    expect(parseByteSize("500")).toBe(500);
    expect(parseByteSize("1k")).toBe(1024);
    expect(parseByteSize("2.5M")).toBe(2.5 * 1024 * 1024);
    expect(parseByteSize("1G")).toBe(1024 * 1024 * 1024);
  });

  it("formats disk items as json", () => {
    const { formatGduJson } = require("./gduDoers.ts");
    const item = { name: "test", path: "/test", size: 1024, itemCount: 1, isDirectory: false, mtime: new Date() };
    const jsonStr = formatGduJson(item);
    expect(jsonStr).toContain('"name": "test"');
    expect(JSON.parse(jsonStr).size).toBe(1024);
  });
});
