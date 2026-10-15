import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { openToolWebsite, startConvert } from "../src/features/filemanager/fmBatch";
import { resolveTool, toolStatus } from "../src/features/filemanager/fmToolDetect";
import { childEnv, findExecutable, searchDirs } from "../src/features/filemanager/fmTools";

const root = mkdtempSync(join(tmpdir(), "fm-win-tools-"));
afterAll(async () => {
  if (process.platform === "win32") await Bun.sleep(500);
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

(process.platform === "win32" ? describe : describe.skip)("Windows helper discovery", () => {
  const home = join(root, "home");
  const local = join(home, "AppData", "Local");
  const packages = join(local, "Microsoft", "WinGet", "Packages");

  test("finds nested portable WinGet tools without PATH or Links entries, including later installs", () => {
    const ctx = { platform: "win32" as const, home, toolDirs: undefined };
    const env = { PATH: "", LOCALAPPDATA: local, ProgramFiles: join(root, "programs") };
    expect(searchDirs(ctx, env)).not.toContain(join(packages, "Gyan.FFmpeg_source", "ffmpeg-8", "bin"));
    const ffmpeg = join(packages, "Gyan.FFmpeg_source", "ffmpeg-8", "bin");
    const poppler = join(packages, "oschwartz10612.Poppler_source", "poppler-25", "Library", "bin");
    for (const [dir, exe] of [[ffmpeg, "ffmpeg.exe"], [poppler, "pdftotext.exe"]]) {
      mkdirSync(dir!, { recursive: true });
      writeFileSync(join(dir!, exe!), "fixture");
    }
    const dirs = searchDirs(ctx, env);
    expect(findExecutable("win32", ["ffmpeg"], dirs)).toBe(join(ffmpeg, "ffmpeg.exe"));
    expect(findExecutable("win32", ["pdftotext"], dirs)).toBe(join(poppler, "pdftotext.exe"));
    expect(childEnv(ctx, env).Path).toContain(ffmpeg);
    expect(searchDirs({ ...ctx, toolDirs: [root] }, env)).toEqual([root]);
  });

  test("fresh WindowsApps and quoted PATH entries are searched", () => {
    const dirs = searchDirs({ platform: "win32", home, toolDirs: undefined }, { Path: `"${root}"`, LOCALAPPDATA: local });
    expect(dirs).toContain(root);
    expect(dirs).toContain(join(local, "Microsoft", "WindowsApps"));
  });

  test("an executable is probed using the same path that conversions resolve", async () => {
    const bin = join(root, "probe");
    mkdirSync(bin);
    copyFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), join(bin, "tar.exe"));
    const ctx = createContext({ home, dataDir: join(root, "data"), toolDirs: [bin] });
    const status = await toolStatus(ctx);
    const tar = status.tools.find((tool) => tool.id === "bsdtar")!;
    expect(tar.installed).toBe(true);
    expect(tar.path).toBe(resolveTool(ctx, "bsdtar"));
  }, 20000);

  const real = createContext({ home: root, dataDir: join(root, "real-data") });
  (resolveTool(real, "ffmpeg") ? test : test.skip)("the installed FFmpeg converts a real WAV into a nonempty MP3", async () => {
    const input = join(root, "audio.wav");
    const pcm = Buffer.alloc(8000 * 2);
    const wav = Buffer.alloc(44);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40);
    writeFileSync(input, Buffer.concat([wav, pcm]));
    const job = await startConvert(real, { action: "aud-mp3", paths: [input] });
    const done = await real.jobs.whenDone(job.id);
    expect(done.state).toBe("done");
    expect(done.outputs).toHaveLength(1);
    expect(statSync(done.outputs[0]!).size).toBeGreaterThan(0);
  }, 30000);
});

describe("helper download buttons", () => {
  test("opens catalog addresses through the OS and refuses arbitrary URLs", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const ctx = createContext({ platform: "win32", home: root, toolDirs: [], launch: async (command, args) => { calls.push({ command, args }); } });
    const result = await openToolWebsite(ctx, "ffmpeg");
    expect(result.opened).toBe("https://ffmpeg.org/download.html");
    expect(calls[0]).toEqual({ command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", result.opened] });
    expect((await openToolWebsite(ctx, "ffmpeg", true)).opened).toContain("learn.microsoft.com");
    await expect(openToolWebsite(ctx, "https://example.com")).rejects.toThrow("Choose a helper");
    await expect(openToolWebsite(ctx, "fonttools", true)).rejects.toThrow("doesn't need");
  });

  test("browser launch errors are visible to the caller", async () => {
    const ctx = createContext({ home: root, launch: async () => { throw new Error("test launch failure"); } });
    await expect(openToolWebsite(ctx, "ffmpeg")).rejects.toThrow("test launch failure");
  });
});
