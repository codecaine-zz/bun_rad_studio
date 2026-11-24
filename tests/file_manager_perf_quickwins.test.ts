import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { runFileManagerCli } from "../src/features/filemanager/fmCli";
import {
  convertWavFileToAiffNative,
  createWavHeader,
  parseWavPcm,
} from "../src/features/filemanager/fmPhonon";
import {
  DEV_INI,
  getDevIni,
  getPhpHostGuardFile,
} from "../src/features/filemanager/fmServePhp";

/** Reference in-memory AIFF builder matching the pre-streaming implementation byte-for-byte. */
function buildReferenceAiff(wavBuf: Buffer): Buffer {
  const { sampleRate, numChannels, bitsPerSample, pcmData } =
    parseWavPcm(wavBuf);
  const bytesPerSample = bitsPerSample >> 3;
  const numSampleFrames = Math.floor(
    pcmData.length / (numChannels * bytesPerSample),
  );
  const bePcm = Buffer.from(pcmData);
  if (bytesPerSample === 2) bePcm.swap16();

  const srExtended = Buffer.alloc(10);
  let sr = sampleRate;
  let exp = 16383 + 31;
  while (sr < 0x80000000 && exp > 0) {
    sr *= 2;
    exp--;
  }
  srExtended.writeUInt16BE(exp, 0);
  srExtended.writeUInt32BE(Math.floor(sr) >>> 0, 2);
  srExtended.writeUInt32BE(0, 6);

  const commSize = 18;
  const ssndSize = 8 + bePcm.length;
  const formSize = 4 + (8 + commSize) + (8 + ssndSize);
  const header = Buffer.alloc(12 + 8 + commSize + 8 + 8);
  let o = 0;
  header.write("FORM", o, "ascii");
  o += 4;
  header.writeUInt32BE(formSize, o);
  o += 4;
  header.write("AIFF", o, "ascii");
  o += 4;
  header.write("COMM", o, "ascii");
  o += 4;
  header.writeUInt32BE(commSize, o);
  o += 4;
  header.writeUInt16BE(numChannels, o);
  o += 2;
  header.writeUInt32BE(numSampleFrames, o);
  o += 4;
  header.writeUInt16BE(bitsPerSample, o);
  o += 2;
  srExtended.copy(header, o);
  o += 10;
  header.write("SSND", o, "ascii");
  o += 4;
  header.writeUInt32BE(ssndSize, o);
  o += 4;
  header.writeUInt32BE(0, o);
  o += 4;
  header.writeUInt32BE(0, o);
  o += 4;

  return Buffer.concat([header, bePcm]);
}

describe("perf quickwins — backend startup, streaming & leak fixes", () => {
  test("convertWavFileToAiffNative streams multi-MB PCM and matches reference byte-for-byte", async () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "fm-aiff-stream-"));
    try {
      // > 2.2 MB PCM to exercise multiple 1 MB streaming chunks + partial final chunk
      const pcmLen = 2 * 1024 * 1024 + 123_456;
      const pcm = Buffer.allocUnsafe(pcmLen);
      for (let i = 0; i < pcmLen; i += 2) {
        pcm.writeInt16LE(((i * 37) % 65536) - 32768, i);
      }
      const wavBuf = Buffer.concat([
        createWavHeader(pcmLen, 44100, 2, 16),
        pcm,
      ]);
      const wavPath = nodePath.join(dir, "multi_chunk.wav");
      const aiffPath = nodePath.join(dir, "multi_chunk.aiff");
      writeFileSync(wavPath, wavBuf);

      await convertWavFileToAiffNative(wavPath, aiffPath);
      const actual = readFileSync(aiffPath);
      const expected = buildReferenceAiff(wavBuf);

      expect(actual.byteLength).toBe(expected.byteLength);
      expect(Buffer.compare(actual, expected)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("convertWavFileToAiffNative handles non-44-byte WAV with extra JUNK chunk identically", async () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "fm-aiff-junk-"));
    try {
      const pcm = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
      const junkPayload = Buffer.from("EXTRA_META!"); // odd length (11 bytes) -> requires 1 pad byte
      const junkChunk = Buffer.alloc(8 + junkPayload.length + 1);
      junkChunk.write("JUNK", 0, "ascii");
      junkChunk.writeUInt32LE(junkPayload.length, 4);
      junkPayload.copy(junkChunk, 8);

      const fmtChunk = Buffer.alloc(24);
      fmtChunk.write("fmt ", 0, "ascii");
      fmtChunk.writeUInt32LE(16, 4);
      fmtChunk.writeUInt16LE(1, 8); // PCM
      fmtChunk.writeUInt16LE(1, 10); // mono
      fmtChunk.writeUInt32LE(24000, 12);
      fmtChunk.writeUInt32LE(48000, 16);
      fmtChunk.writeUInt16LE(2, 20);
      fmtChunk.writeUInt16LE(16, 22);

      const dataChunk = Buffer.alloc(8 + pcm.length);
      dataChunk.write("data", 0, "ascii");
      dataChunk.writeUInt32LE(pcm.length, 4);
      pcm.copy(dataChunk, 8);

      const riffBody = Buffer.concat([
        Buffer.from("WAVE", "ascii"),
        junkChunk,
        fmtChunk,
        dataChunk,
      ]);
      const riffHeader = Buffer.alloc(8);
      riffHeader.write("RIFF", 0, "ascii");
      riffHeader.writeUInt32LE(riffBody.length, 4);
      const wavBuf = Buffer.concat([riffHeader, riffBody]);

      const wavPath = nodePath.join(dir, "with_junk.wav");
      const aiffPath = nodePath.join(dir, "with_junk.aiff");
      writeFileSync(wavPath, wavBuf);

      await convertWavFileToAiffNative(wavPath, aiffPath);
      const actual = readFileSync(aiffPath);
      const expected = buildReferenceAiff(wavBuf);

      expect(Buffer.compare(actual, expected)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fmCli hash subcommand streams digests accurately across multi-chunk files", async () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "fm-cli-hash-"));
    try {
      const data = Buffer.allocUnsafe(300_000);
      for (let i = 0; i < data.length; i++) data[i] = (i * 131 + 17) & 0xff;
      const target = nodePath.join(dir, "sample.bin");
      writeFileSync(target, data);

      const lines: string[] = [];
      const errs: string[] = [];
      const code = await runFileManagerCli(["hash", target, "--json"], {
        cwd: dir,
        stdout: (l) => lines.push(l),
        stderr: (l) => errs.push(l),
        contextOptions: {
          home: dir,
          dataDir: nodePath.join(dir, ".data"),
        },
      });
      expect(code).toBe(0);
      expect(errs).toEqual([]);
      const parsed = JSON.parse(lines.join("\n"));
      expect(parsed.size).toBe(data.byteLength);
      expect(parsed.md5).toBe(createHash("md5").update(data).digest("hex"));
      expect(parsed.sha1).toBe(createHash("sha1").update(data).digest("hex"));
      expect(parsed.sha256).toBe(
        createHash("sha256").update(data).digest("hex"),
      );
      expect(parsed.sha512).toBe(
        createHash("sha512").update(data).digest("hex"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tts_cli, transcribe_cli, and fmCli avoid eager barrel / subcommand imports", () => {
    const ttsSrc = readFileSync(
      new URL("../cli_apps/tts_cli.ts", import.meta.url),
      "utf8",
    );
    const trSrc = readFileSync(
      new URL("../cli_apps/transcribe_cli.ts", import.meta.url),
      "utf8",
    );
    const fmCliSrc = readFileSync(
      new URL("../src/features/filemanager/fmCli.ts", import.meta.url),
      "utf8",
    );

    expect(ttsSrc).not.toMatch(/from\s+["']\.\.\/src\/index(\.ts)?["']/);
    expect(ttsSrc).toContain("../src/simplecli/core/SimpleCLI");
    expect(trSrc).not.toMatch(/from\s+["']\.\.\/src\/index(\.ts)?["']/);
    expect(trSrc).toContain("../src/simplecli/core/SimpleCLI");

    expect(fmCliSrc).not.toMatch(/^import\s+.*cli_apps\/tts_cli/m);
    expect(fmCliSrc).not.toMatch(/^import\s+.*cli_apps\/transcribe_cli/m);
    expect(fmCliSrc).toContain('await import("../../../cli_apps/tts_cli")');
    expect(fmCliSrc).toContain(
      'await import("../../../cli_apps/transcribe_cli")',
    );
  });

  test("fmServePhp lazily creates and caches PHP host guard file", () => {
    const src = readFileSync(
      new URL("../src/features/filemanager/fmServePhp.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain(
      "const PHP_HOST_GUARD_FILE = createPhpHostGuardFile()",
    );
    const guard1 = getPhpHostGuardFile();
    const guard2 = getPhpHostGuardFile();
    expect(guard1).toBe(guard2);
    expect(existsSync(guard1)).toBe(true);
    expect([...DEV_INI]).toEqual(getDevIni());
    expect(DEV_INI[DEV_INI.length - 1]).toBe(`auto_prepend_file=${guard1}`);
  });
});

describe("perf quickwins — frontend hardening & hot-path invariants", () => {
  test("power.js requires fromMountedFrame for loopback postMessage", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/power.js", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain(
      "(frames.length > 0 && Boolean(e.origin) && isLoopbackOrigin)",
    );
  });

  test("nav.js guards reportLoadError with mine === navigation in showTrash and runSearch", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/nav.js", import.meta.url),
      "utf8",
    );
    const matches =
      src.match(/if \(mine === navigation\) reportLoadError\(err\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test("terminal.js configures explicit https? linkHandler on Terminal", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/terminal.js", import.meta.url),
      "utf8",
    );
    expect(src).toContain("linkHandler:");
    expect(src).toContain('call("link/open", { url: uri })');
  });

  test("list.js updates clipboard cut class in-place and avoids duplicate settings renderList", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/list.js", import.meta.url),
      "utf8",
    );
    expect(src).toContain('on("clipboard", () => syncClipboard(left))');
    expect(src).not.toContain('on("clipboard", () => renderList(left))');
    expect(src).not.toMatch(
      /on\("settings",\s*\(c\)\s*=>\s*\{[\s\S]*?renderList\(left\)/,
    );
  });

  test("themes.js defers WebGL probing and guards Alt+* when modal or Quick Look is open", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/themes.js", import.meta.url),
      "utf8",
    );
    expect(src).toContain("const probeGpu = Boolean(opts && opts.probeGpu)");
    expect(src).toContain('document.querySelector(".ql-backdrop")');
  });

  test("quickbar.js skips kind-chips recount on quick-filter input events", () => {
    const src = readFileSync(
      new URL("../resources/file_manager/ui/quickbar.js", import.meta.url),
      "utf8",
    );
    expect(src).toContain("renderQuickbar({ filterOnly: true })");
    expect(src).toContain(
      "if (!(filterOnly && chipsBox && chipsBox.childElementCount > 0))",
    );
  });
});
