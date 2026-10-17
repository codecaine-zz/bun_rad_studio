import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { open } from "fs/promises";
import { buildMusicRelease, localVideos, titleFilename } from "../scripts/build_free_music_release";
import { run } from "../scripts/release/common";
import { readCentralDirectory } from "../src/features/filemanager/fmZip";

describe("music release filenames", () => {
  test("uses readable titles and replaces filesystem-invalid characters", () => {
    expect(titleFilename("Beyoncé: Live / At Home?", "mp3", new Set())).toBe("Beyoncé Live At Home.mp3");
  });

  test("adds a suffix when song titles repeat", () => {
    const used = new Set<string>();

    expect(titleFilename("Morning Song", "mp3", used)).toBe("Morning Song.mp3");
    expect(titleFilename("Morning Song", "mp3", used)).toBe("Morning Song (2).mp3");
  });

  test("handles Unicode, reserved names, option-like names and long titles safely", () => {
    const used = new Set<string>();
    expect(titleFilename("CON.live", "mp3", used)).toBe("Track - CON.live.mp3");
    expect(titleFilename("-Song", "mp3", used)).toBe("Track -Song.mp3");
    expect(titleFilename("...", "mp3", used)).toBe("Untitled track.mp3");
    expect(titleFilename("Café", "mp3", used)).toBe("Café.mp3");
    expect(titleFilename("Cafe\u0301", "mp3", used)).toBe("Cafe\u0301 (2).mp3");
    expect(Buffer.byteLength(titleFilename("曲".repeat(200), "mp3", used))).toBeLessThan(255);
  });

  test("finds only local videos directly inside the source folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-input-"));
    try {
      for (const file of ["Song.mp4", "Other.MOV", ".hidden.mp4", "song.mp3", "notes.txt"]) writeFileSync(join(dir, file), "");
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "nested", "Not included.mp4"), "");
      expect(localVideos(dir)).toEqual(["Other.MOV", "Song.mp4"]);
      expect(() => localVideos(join(dir, "nested", "missing"))).toThrow();
      rmSync(join(dir, "nested", "Not included.mp4"));
      expect(() => localVideos(join(dir, "nested"))).toThrow("No lyric videos found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const haveTools = ["ffmpeg", "ffprobe", "unzip"].every((tool) => !!Bun.which(tool));
describe.skipIf(!haveTools)("local music release integration", () => {
  test("packages original video bytes and named MP3s with attribution, without network access", async () => {
    const dir = mkdtempSync(join(tmpdir(), "music-release-"));
    const input = join(dir, "input");
    const output = join(dir, "output");
    mkdirSync(input);
    try {
      const original = join(input, "Morning Song.mp4");
      await run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-t", "1", "-c:v", "libx264", "-c:a", "aac", original]);
      copyFileSync(original, join(input, "Café’s Song.mp4"));
      copyFileSync(original, join(input, "Don’t Stop 🏆.mp4"));
      const names = await buildMusicRelease(input, output);
      expect(names).toHaveLength(2);
      const videoZip = names.find((name) => name.includes("-lyrics-videos"))!;
      const mp3Zip = names.find((name) => name.includes("-mp3"))!;
      const handle = await open(join(output, mp3Zip), "r");
      try {
        const entries = await readCentralDirectory(handle, (await handle.stat()).size);
        expect(entries.every((entry) => !!(entry.flags & 0x800))).toBe(true);
        expect(entries.map((entry) => entry.name)).toContain("Don’t Stop 🏆.mp3");
      } finally {
        await handle.close();
      }
      const extracted = join(dir, "extracted");
      await run(["unzip", "-qq", join(output, videoZip), "-d", extracted]);
      expect(readFileSync(join(extracted, "Morning Song.mp4"))).toEqual(readFileSync(original));
      expect(readFileSync(join(extracted, "Café’s Song.mp4"))).toEqual(readFileSync(original));
      const attribution = readFileSync(join(extracted, "ATTRIBUTION.txt"), "utf8");
      expect(attribution).toContain("Morning Song - Codecaine");
      expect(attribution).toContain("CC BY 4.0");
      expect(attribution).not.toContain("youtube");
      await run(["unzip", "-oq", join(output, mp3Zip), "-d", extracted]);
      expect(readdirSync(extracted)).toContain("Café’s Song.mp3");
      expect(readdirSync(extracted)).toContain("Don’t Stop 🏆.mp3");
      const probe = JSON.parse(await run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", join(extracted, "Morning Song.mp3")]));
      expect(probe.streams).toHaveLength(1);
      expect(probe.streams[0].codec_name).toBe("mp3");
      expect(probe.format.tags.title).toBe("Morning Song");
      expect(probe.format.tags.artist).toBe("Codecaine");
      expect(Number(probe.format.duration)).toBeGreaterThan(0);
      expect(readdirSync(output).sort()).toEqual(names.sort());
      await expect(buildMusicRelease(input, output)).rejects.toThrow("Refusing to overwrite");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails explicitly for a video without audio and leaves no partial release", async () => {
    const dir = mkdtempSync(join(tmpdir(), "music-no-audio-"));
    const input = join(dir, "input");
    const output = join(dir, "output");
    mkdirSync(input);
    try {
      await run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
        "-t", "1", "-c:v", "libx264", join(input, "Silent.mp4")]);
      await expect(buildMusicRelease(input, output)).rejects.toThrow();
      expect(readdirSync(output)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
