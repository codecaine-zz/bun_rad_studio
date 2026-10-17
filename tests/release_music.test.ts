import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createArchives } from "../scripts/build_free_music_release";
import { VERSION, run } from "../scripts/release/common";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test.skipIf(process.platform !== "win32" && (!Bun.which("zip") || !Bun.which("unzip")))("music packs preserve filenames, audio and attribution using host archive tools", async () => {
  const dir = mkdtempSync(join(tmpdir(), "music-release-"));
  dirs.push(dir);
  const work = join(dir, "work");
  mkdirSync(work);
  const file = "01-song [live]'s audio.mp3";
  const bytes = Buffer.from([0x49, 0x44, 0x33, 0, 1, 2, 255]);
  writeFileSync(join(work, file), bytes);
  const archives = await createArchives(dir, work, "mp3", [{
    file,
    credit: { title: "Fixture song", uploader: "Fixture creator", url: "https://example.com/fixture" },
  }], "test fixture");
  expect(archives).toEqual([`bun-rad-studio-v${VERSION}-free-music-mp3.zip`]);
  const archive = join(dir, archives[0]!);
  const out = join(dir, "extracted");
  if (process.platform === "win32") {
    await run(["powershell.exe", "-NoProfile", "-Command",
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:TEST_ARCHIVE -DestinationPath $env:TEST_OUT"],
    { env: { TEST_ARCHIVE: archive, TEST_OUT: out } });
  } else await run(["unzip", "-q", archive, "-d", out]);
  expect(readFileSync(join(out, file))).toEqual(bytes);
  const attribution = readFileSync(join(out, "ATTRIBUTION.txt"), "utf8");
  expect(attribution).toContain("Fixture song");
  expect(attribution).toContain("Fixture creator");
  expect(attribution).toContain("CC BY 4.0");
  expect(attribution).toContain("test fixture");
}, 30000);
