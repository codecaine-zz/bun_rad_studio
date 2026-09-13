import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buryTarget,
  decomposeGraveyard,
  getRecordInfo,
  pruneGraveyard,
  runRipCoordinator,
  unburyTarget,
} from "./ripCoordinator.ts";
import { formatRecordDetail, readManifest } from "./ripDoers.ts";

describe("rip features", () => {
  const testGraveyard = join(tmpdir(), `test_graveyard_${Date.now()}`);

  it("buries a file and records it in manifest", async () => {
    const testFile = join(tmpdir(), `test_rip_file_${Date.now()}.txt`);
    await Bun.write(testFile, "temporary content");

    const record = await buryTarget(testFile, testGraveyard);
    expect(record.originalPath).toBe(testFile);

    // File should not exist in original location
    const fileStillExists = await Bun.file(testFile).exists();
    expect(fileStillExists).toBe(false);

    // Manifest should contain record
    const manifest = await readManifest(testGraveyard);
    expect(manifest.records.some((r) => r.id === record.id)).toBe(true);
  });

  it("unburies the last buried file", async () => {
    const testFile = join(tmpdir(), `test_rip_restore_${Date.now()}.txt`);
    await Bun.write(testFile, "restore content");

    await buryTarget(testFile, testGraveyard);
    expect(await Bun.file(testFile).exists()).toBe(false);

    const restored = await unburyTarget(testGraveyard);
    expect(restored.originalPath).toBe(testFile);
    expect(await Bun.file(testFile).exists()).toBe(true);
    expect(await Bun.file(testFile).text()).toBe("restore content");
  });

  it("decomposes graveyard", async () => {
    const testFile = join(tmpdir(), `test_rip_decompose_${Date.now()}.txt`);
    await Bun.write(testFile, "decompose me");
    await buryTarget(testFile, testGraveyard);

    const count = await decomposeGraveyard(testGraveyard);
    expect(count).toBeGreaterThan(0);

    const manifest = await readManifest(testGraveyard);
    expect(manifest.records.length).toBe(0);
  });

  it("inspects buried record detail and unburies by index", async () => {
    const file1 = join(tmpdir(), `test_rip_idx1_${Date.now()}.txt`);
    const file2 = join(tmpdir(), `test_rip_idx2_${Date.now()}.txt`);
    await Bun.write(file1, "content 1");
    await Bun.write(file2, "content 2");

    const rec1 = await buryTarget(file1, testGraveyard);
    const rec2 = await buryTarget(file2, testGraveyard);

    const info = await getRecordInfo(testGraveyard, rec1.id);
    expect(info.id).toBe(rec1.id);
    const detailStr = formatRecordDetail(info);
    expect(detailStr).toContain(rec1.id);
    expect(detailStr).toContain("content 1".length.toString());

    // Unbury item 1 (which corresponds to file1)
    const restored = await unburyTarget(testGraveyard, "1");
    expect(restored.id).toBe(rec1.id);
    expect(await Bun.file(file1).exists()).toBe(true);

    // Clean up file1 & file2
    await Bun.file(file1).delete();
  });

  it("prunes records older than specified days", async () => {
    const file = join(tmpdir(), `test_rip_prune_${Date.now()}.txt`);
    await Bun.write(file, "old file");
    const rec = await buryTarget(file, testGraveyard);

    // Prune with 0 days should prune files
    const pruned = await pruneGraveyard(testGraveyard, 0);
    expect(pruned).toBeGreaterThanOrEqual(1);
  });

  it("computes graveyard size and summary", () => {
    const { computeGraveyardSize, formatGraveyardSummary } = require("./ripDoers.ts");
    const manifest = {
      version: 1,
      records: [
        { id: "1", originalPath: "/a", graveyardPath: "/g/1", deletedAt: new Date().toISOString(), isDirectory: false, size: 2048 },
        { id: "2", originalPath: "/b", graveyardPath: "/g/2", deletedAt: new Date().toISOString(), isDirectory: false, size: 4096 },
      ],
    };
    const sizeInfo = computeGraveyardSize(manifest);
    expect(sizeInfo.totalBytes).toBe(6144);
    expect(sizeInfo.count).toBe(2);

    const summary = formatGraveyardSummary(manifest);
    expect(summary).toContain("2 item(s)");
    expect(summary).toContain("6.0 KB");
  });
});

