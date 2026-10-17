import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { bufferSource } from "../src/features/filemanager/fmInfoCommon";
import { parseFlac, parseMp3, parseOgg, parseWav } from "../src/features/filemanager/fmInfoAudio";
import { fromFfprobe, mediaInfo } from "../src/features/filemanager/fmInfoMedia";
import { mediaGroups } from "../src/features/filemanager/fmInfoMediaRows";
import { parseMatroska, parseMp4 } from "../src/features/filemanager/fmInfoVideo";
import { box, flac, mp3, mp4, oggOpus, oggVorbis, scratchRoot, wav } from "./file_manager_info_fixtures";

const root = scratchRoot("media");
afterAll(() => root.remove());
// No helper programs: the built-in readers are used.
const bare = createContext({ home: root.dir, dataDir: join(root.dir, "data"), toolDirs: [] });
const real = createContext({ home: root.dir, dataDir: join(root.dir, "data") });

const rows = (info: ReturnType<typeof mediaGroups>) => Object.fromEntries(info.flatMap((g) => g.rows.map((r) => [`${g.id}/${r.label}`, r.value])));
const src = (b: Buffer) => bufferSource(b);

describe("WAV", () => {
  test("format, sample rate, channels and duration come from fmt and data", async () => {
    const m = await parseWav(src(wav(2.5, 22050, 2, 16, { INAM: "Beep", IART: "Tester", ICRD: "2020" })));
    expect(m.durationSec).toBeCloseTo(2.5, 3);
    expect(m.streams[0]).toMatchObject({ type: "audio", codec: "PCM (uncompressed)", channels: 2, sampleRate: 22050, bits: 16, bitrate: 22050 * 2 * 16 });
    expect(m.tags).toMatchObject({ title: "Beep", artist: "Tester", date: "2020" });
  });

  test("a data chunk that claims too much is limited to what the file holds", async () => {
    const w = wav(1);
    w.writeUInt32LE(0xffffffff, w.indexOf("data") + 4);
    expect((await parseWav(src(w))).durationSec).toBeCloseTo(1, 3);
    expect((await parseWav(src(w.subarray(0, 30)))).partial).toBe(true);
  });
});

describe("MP3", () => {
  test("ID3v2.3 text frames, cover art, Xing duration and the first frame's facts", async () => {
    const m = await parseMp3(src(mp3(40, undefined, { cover: true })));
    expect(m.tags).toMatchObject({ title: "Song Title", artist: "The Artist", album: "The Album", date: "1999", genre: "Rock", track: "3/12" });
    expect(m.coverArt).toBe(true);
    expect(m.container).toContain("ID3v2.3");
    expect(m.streams[0]).toMatchObject({ codec: "MP3 (MPEG-1 Layer III)", channels: 2, sampleRate: 44100 });
    expect(m.durationSec).toBeCloseTo((40 * 1152) / 44100, 4);
  });

  test("a file with no Xing header gets a bit-rate estimate, and ID3v1 fills the gaps", async () => {
    const plain = mp3(30, {}, { v1: true });
    const first = plain.indexOf(Buffer.from([0xff, 0xfb, 0x90, 0x00]));
    plain.fill(0, first + 36, first + 52); // remove the Xing header
    const m = await parseMp3(src(plain));
    expect(m.tags).toMatchObject({ title: "Old Title", artist: "Old Artist", genre: "Rock" });
    expect(m.notes.join(" ")).toContain("estimated");
    expect(m.bitrate).toBe(128000);
    expect(m.durationSec).toBeCloseTo((30 * 417 * 8) / 128000, 3);
  });

  test("UTF-16 text and ID3v2.2 / 2.4 frames", async () => {
    const utf16 = Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from("Ünï", "utf16le")]);
    const frame = Buffer.concat([Buffer.from("TIT2"), Buffer.from([0, 0, 0, utf16.length, 0, 0]), utf16]);
    const tag = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, frame.length]), frame]);
    expect((await parseMp3(src(Buffer.concat([tag, mp3(3, {}, { v1: false })])))).tags.title).toBe("Ünï");
    const f22 = Buffer.concat([Buffer.from("TT2"), Buffer.from([0, 0, 6]), Buffer.from([0]), Buffer.from("Hello")]);
    const t22 = Buffer.concat([Buffer.from("ID3"), Buffer.from([2, 0, 0, 0, 0, 0, f22.length]), f22]);
    expect((await parseMp3(src(Buffer.concat([t22, mp3(3, {}, { v1: false })])))).tags.title).toBe("Hello");
  });

  test("unsynchronized ID3 lyrics appear as a dedicated lyrics group", async () => {
    const m = await parseMp3(src(mp3(10, { TIT2: "Song", USLT: "eng\0First verse\nSecond line" })));
    expect(m.lyrics).toBe("First verse\nSecond line");
    const group = mediaGroups(m, 5000).find((item) => item.id === "lyrics");
    expect(group?.rows[0]).toMatchObject({ label: "Embedded lyrics", value: "First verse\nSecond line" });
  });

  test("not-an-MP3 and cut-off files don't throw", async () => {
    expect((await parseMp3(src(Buffer.from("hello world, no audio here")))).partial).toBe(true);
    await parseMp3(src(mp3(5).subarray(0, 30)));
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const base = mp3(10);
    for (let i = 0; i < 100; i++) {
      const b = Buffer.from(base);
      for (let k = 0; k < 5; k++) b[rnd() % b.length] = rnd() & 255;
      await parseMp3(src(b));
    }
  });
});

describe("FLAC and Ogg", () => {
  test("FLAC: STREAMINFO and Vorbis comments", async () => {
    const m = await parseFlac(src(flac(12.5, 48000, 2, 24)));
    expect(m.streams[0]).toMatchObject({ channels: 2, sampleRate: 48000, bits: 24, codec: "FLAC (lossless)" });
    expect(m.durationSec).toBeCloseTo(12.5, 3);
    expect(m.tags).toMatchObject({ title: "Flac Song", artist: "Flac Artist", album: "Flac Album", date: "2001" });
  });

  test("Ogg Vorbis and Opus: header facts, tags and the length from the last page", async () => {
    const v = await parseOgg(src(oggVorbis(7.25, 32000, 1, ["TITLE=Ogg Song", "ARTIST=Ogg Artist", "LYRICS=Verse one\nVerse two"])));
    expect(v.container).toBe("Ogg Vorbis audio");
    expect(v.streams[0]).toMatchObject({ codec: "Vorbis", channels: 1, sampleRate: 32000, bitrate: 128000 });
    expect(v.durationSec).toBeCloseTo(7.25, 3);
    expect(v.tags).toMatchObject({ title: "Ogg Song", artist: "Ogg Artist" });
    expect(v.lyrics).toBe("Verse one\nVerse two");
    const o = await parseOgg(src(oggOpus(3)));
    expect(o.container).toBe("Ogg Opus audio");
    expect(o.streams[0]).toMatchObject({ codec: "Opus", channels: 2 });
    expect(o.durationSec).toBeCloseTo(3, 3);
    expect(o.tags.title).toBe("Opus Song");
  });

  test("damaged files give partial answers", async () => {
    expect((await parseFlac(src(flac(1).subarray(0, 10)))).partial).toBe(true);
    expect((await parseOgg(src(Buffer.from("OggS" + "x".repeat(100))))).partial).toBe(true);
  });
});

describe("MP4 / MOV / M4A", () => {
  test("duration, tracks, codecs, size, frame rate and iTunes tags", async () => {
    const m = await parseMp4(src(mp4(4)));
    expect(m.container).toBe("MP4 video (MPEG-4)");
    expect(m.durationSec).toBe(4);
    const v = m.streams.find((s) => s.type === "video")!, a = m.streams.find((s) => s.type === "audio")!;
    expect(v).toMatchObject({ codec: "H.264 (AVC)", width: 320, height: 240 });
    expect(v.fps).toBeCloseTo(25, 3);
    expect(a).toMatchObject({ codec: "AAC", channels: 2, sampleRate: 44100, bits: 16 });
    expect(a.language).toBe("eng");
    expect(m.tags).toMatchObject({ title: "Movie Title", artist: "Movie Artist", album: "Movie Album", date: "2020", track: "2/9" });
    expect(m.coverArt).toBe(true);
  });

  test("a movie whose index is at the end of a big file is found, and one without an index is partial", async () => {
    const m = await parseMp4(src(mp4(2)));
    expect(m.streams).toHaveLength(2);
    const noMoov = Buffer.concat([box("ftyp", Buffer.from("isom\0\0\x02\0isom")), box("mdat", Buffer.alloc(500))]);
    const p = await parseMp4(src(noMoov));
    expect(p.partial).toBe(true);
    expect(p.notes.join(" ")).toContain("moov");
  });

  test("a QuickTime brand is named", async () => {
    const q = mp4(1);
    q.write("qt  ", q.indexOf("ftyp") + 4, "latin1");
    expect((await parseMp4(src(q))).container).toBe("QuickTime movie (MOV)");
  });

  test("damage never throws", async () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const base = mp4(3);
    for (let i = 0; i < 150; i++) {
      const b = Buffer.from(base);
      for (let k = 0; k < 5; k++) b[rnd() % b.length] = rnd() & 255;
      await parseMp4(src(b));
    }
    for (let len = 0; len < base.length; len += 53) await parseMp4(src(base.subarray(0, len)));
  });
});

describe("Matroska / WebM (best effort)", () => {
  const id = (n: number) => Buffer.from(n.toString(16).padStart(n > 0xffffff ? 8 : n > 0xffff ? 6 : n > 0xff ? 4 : 2, "0"), "hex");
  const size = (n: number) => Buffer.from([0x40 | (n >> 8), n & 255]);
  const el = (n: number, ...p: Buffer[]) => { const b = Buffer.concat(p); return Buffer.concat([id(n), size(b.length), b]); };
  const str = (s: string) => Buffer.from(s, "latin1");
  const f64 = (x: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b; };
  const mkv = (doctype: string) => Buffer.concat([
    el(0x1a45dfa3, el(0x4282, str(doctype))),
    el(0x18538067,
      el(0x1549a966, el(0x2ad7b1, Buffer.from([0x0f, 0x42, 0x40])), el(0x4489, f64(5500)), el(0x7ba9, str("Clip Title")), el(0x4d80, str("libtest"))),
      el(0x1654ae6b,
        el(0xae, el(0xd7, Buffer.from([1])), el(0x83, Buffer.from([1])), el(0x86, str("V_MPEG4/ISO/AVC")), el(0xe0, el(0xb0, Buffer.from([0x07, 0x80])), el(0xba, Buffer.from([0x04, 0x38])))),
        el(0xae, el(0xd7, Buffer.from([2])), el(0x83, Buffer.from([2])), el(0x86, str("A_OPUS")), el(0x22b59c, str("eng")), el(0xe1, el(0xb5, f64(48000)), el(0x9f, Buffer.from([2])))),
        el(0xae, el(0xd7, Buffer.from([3])), el(0x83, Buffer.from([0x11])), el(0x86, str("S_TEXT/UTF8")), el(0x22b59c, str("fre"))))),
  ]);

  test("duration, title, tracks and codecs", async () => {
    const m = await parseMatroska(src(mkv("matroska")));
    expect(m.container).toBe("Matroska video (MKV)");
    expect(m.durationSec).toBeCloseTo(5.5, 3);
    expect(m.tags).toMatchObject({ title: "Clip Title", encoder: "libtest" });
    expect(m.streams.map((s) => s.type)).toEqual(["video", "audio", "subtitle"]);
    expect(m.streams[0]).toMatchObject({ codec: "H.264 (AVC)", width: 1920, height: 1080 });
    expect(m.streams[1]).toMatchObject({ codec: "Opus", channels: 2, sampleRate: 48000, language: "eng" });
    expect(m.streams[2]).toMatchObject({ codec: "SubRip text (SRT)", language: "fre" });
    expect((await parseMatroska(src(mkv("webm")))).container).toBe("WebM video");
  });

  test("junk is partial, not an error", async () => {
    expect((await parseMatroska(src(Buffer.alloc(100, 0x1a)))).partial).toBe(true);
    for (let len = 0; len < 200; len += 7) await parseMatroska(src(mkv("matroska").subarray(0, len)));
  });
});

describe("the media report", () => {
  test("rows and groups read as plain words", async () => {
    const m = await parseMp3(src(mp3(40, undefined, { cover: true })));
    const r = rows(mediaGroups(m, 20000));
    expect(r["media/Container"]).toContain("MP3");
    expect(r["media/Duration"]).toBe("1.04 s");
    expect(r["media/Cover picture"]).toContain("Yes");
    expect(r["audio/Channels"]).toBe("2 (stereo)");
    expect(r["audio/Sample rate"]).toBe("44,100 Hz");
    expect(r["tags/Title"]).toBe("Song Title");
    expect(r["media/Read with"]).toContain("built-in reader");
  });

  test("mediaInfo without helper programs uses the built-in readers and offers the install hint", async () => {
    const dir = join(root.dir, "m");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.mp3"), mp3(20));
    writeFileSync(join(dir, "b.wav"), wav(1));
    writeFileSync(join(dir, "c.flac"), flac(2));
    writeFileSync(join(dir, "d.ogg"), oggVorbis(1));
    writeFileSync(join(dir, "e.m4a"), mp4(1));
    writeFileSync(join(dir, "f.txt"), "plain words");
    for (const name of ["a.mp3", "b.wav", "c.flac", "d.ogg", "e.m4a"]) {
      const r = await mediaInfo(bare, join(dir, name));
      expect(r.source, name).toBe("built-in");
      expect(r.helper.ffprobe).toBe(false);
      expect(r.helper.hint.toLowerCase()).toContain("ffmpeg");
      expect(r.groups.length, name).toBeGreaterThan(1);
    }
    await expect(mediaInfo(bare, join(dir, "f.txt"))).rejects.toMatchObject({ code: "NOT_MEDIA" });
    await expect(mediaInfo(bare, dir)).rejects.toMatchObject({ code: "NOT_A_FILE" });
  });

  test("matching local lyric sidecars are included in More Info", async () => {
    const dir = join(root.dir, "sidecar");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "quiet-song.mp3"), mp3(10));
    writeFileSync(join(dir, "quiet-song.lrc"), "[00:01.00]First line\n[00:02.00]Second line\n");
    writeFileSync(join(dir, "quiet-song.txt"), "Alternate lyric source");
    const result = await mediaInfo(bare, join(dir, "quiet-song.mp3"));
    const lyrics = result.groups.find((group) => group.id === "lyrics");
    expect(lyrics?.rows).toEqual([
      { label: "Local file: quiet-song.lrc", value: "[00:01.00]First line\n[00:02.00]Second line" },
      { label: "Local file: quiet-song.txt", value: "Alternate lyric source" },
    ]);
  });
});

describe("ffprobe's JSON is turned into the same shape", () => {
  test("streams, format tags, chapters and cover art", () => {
    const m = fromFfprobe({
      format: { format_long_name: "QuickTime / MOV", duration: "12.5", bit_rate: "800000", tags: { title: "T", ARTIST: "A", "album-artist": "AA", LYRICS: "First verse\nSecond line" } },
      streams: [
        { codec_type: "video", codec_name: "h264", codec_long_name: "H.264", width: 1280, height: 720, avg_frame_rate: "30000/1001", pix_fmt: "yuv420p", profile: "High", disposition: { attached_pic: 0 } },
        { codec_type: "video", codec_name: "mjpeg", width: 300, height: 300, disposition: { attached_pic: 1 } },
        { codec_type: "audio", codec_name: "aac", channels: 6, channel_layout: "5.1", sample_rate: "48000", bit_rate: "384000", tags: { language: "eng", title: "Main" } },
      ],
      chapters: [{ start_time: "0.000000", tags: { title: "Intro" } }, { start_time: "60.5" }],
    });
    expect(m.durationSec).toBe(12.5);
    expect(m.bitrate).toBe(800000);
    expect(m.tags).toMatchObject({ title: "T", artist: "A", album_artist: "AA" });
    expect(m.lyrics).toBe("First verse\nSecond line");
    expect(m.coverArt).toBe(true);
    expect(m.streams[0]!.fps).toBeCloseTo(29.97, 2);
    expect(m.streams[2]).toMatchObject({ channels: 6, layout: "5.1", sampleRate: 48000, language: "eng", title: "Main" });
    expect(m.chapters).toEqual([{ start: 0, title: "Intro" }, { start: 60.5, title: "" }]);
    expect(fromFfprobe(null).streams).toEqual([]);
    expect(() => fromFfprobe({ streams: "bad", chapters: 5, format: { tags: 5 } })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Against real files and the real ffprobe, when they are installed
// ---------------------------------------------------------------------------------------------------------------
const ffmpeg = Bun.which("ffmpeg");
const ffprobe = Bun.which("ffprobe");

async function make(args: string[], out: string) {
  const p = Bun.spawn([ffmpeg!, "-loglevel", "error", "-y", ...args, out], { stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  await p.exited;
  if (p.exitCode !== 0) throw new Error(err);
}

describe.skipIf(!ffmpeg || !ffprobe)("built-in readers agree with ffprobe on real files", () => {
  const dir = join(root.dir, "real");
  const sine = ["-f", "lavfi", "-i", "sine=frequency=440:duration=2.3:sample_rate=44100"];
  const files = ["a.wav", "b.mp3", "c.flac", "d.ogg", "e.opus", "f.m4a", "g.mp4", "h.mkv", "i.webm"];

  test("durations, codecs, channels and tags match", async () => {
    mkdirSync(dir, { recursive: true });
    const meta = ["-metadata", "title=Real Title", "-metadata", "artist=Real Artist", "-metadata", "album=Real Album"];
    await make([...sine, ...meta], join(dir, "a.wav"));
    await make([...sine, ...meta, "-c:a", "libmp3lame", "-b:a", "128k"], join(dir, "b.mp3"));
    await make([...sine, ...meta], join(dir, "c.flac"));
    await make([...sine, ...meta, "-c:a", "libvorbis"], join(dir, "d.ogg"));
    await make([...sine, ...meta, "-c:a", "libopus"], join(dir, "e.opus"));
    await make([...sine, ...meta, "-c:a", "aac"], join(dir, "f.m4a"));
    await make(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=24:duration=2", ...sine, "-shortest", ...meta, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac"], join(dir, "g.mp4"));
    await make(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=24:duration=2", ...sine, "-shortest", ...meta, "-c:v", "libvpx-vp9", "-c:a", "libopus"], join(dir, "h.mkv"));
    await make(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=24:duration=2", ...sine, "-shortest", "-c:v", "libvpx-vp9", "-c:a", "libopus"], join(dir, "i.webm"));
    for (const name of files) {
      const mine = await mediaInfo(bare, join(dir, name));
      const theirs = await mediaInfo(real, join(dir, name));
      expect(mine.source, name).toBe("built-in");
      expect(theirs.source, name).toBe("ffprobe");
      const a = rows(mine.groups), b = rows(theirs.groups);
      const secs = (t: string | undefined) => (t ? (t.endsWith(" s") ? parseFloat(t) : t.split(":").reduce((n, x) => n * 60 + Number(x), 0)) : NaN);
      expect(Math.abs(secs(a["media/Duration"]) - secs(b["media/Duration"])), `${name} duration ${a["media/Duration"]} vs ${b["media/Duration"]}`).toBeLessThan(0.25);
      const has = (n: string) => n.endsWith("wav") || n.endsWith("flac") || n.endsWith("ogg") || n.endsWith("opus");
      if (a["audio/Channels"]) expect(a["audio/Channels"].split(" ")[0], name).toBe((b["audio/Channels"] ?? "").split(" ")[0]);
      if (a["audio/Sample rate"] && !name.endsWith("opus") && !name.endsWith("webm") && !name.endsWith("mkv")) expect(a["audio/Sample rate"], name).toBe(b["audio/Sample rate"]!);
      if (has(name) || name.endsWith("mp3") || name.endsWith("m4a") || name.endsWith("mp4") || name.endsWith("mkv")) {
        if (a["tags/Title"] && b["tags/Title"]) expect(a["tags/Title"], name).toBe(b["tags/Title"]);
        if (a["tags/Artist"] && b["tags/Artist"]) expect(a["tags/Artist"], name).toBe(b["tags/Artist"]);
      }
      if (name === "g.mp4" || name === "h.mkv" || name === "i.webm") expect(a["video/Size"], name).toBe(b["video/Size"]);
    }
    const wavInfo = rows((await mediaInfo(bare, join(dir, "a.wav"))).groups);
    expect(wavInfo["audio/Codec"]).toBe("PCM (uncompressed)");
    expect(wavInfo["tags/Title"]).toBe("Real Title");
    expect(rows((await mediaInfo(bare, join(dir, "g.mp4"))).groups)["video/Codec"]).toBe("H.264 (AVC)");
    expect(rows((await mediaInfo(bare, join(dir, "b.mp3"))).groups)["audio/Codec"]).toContain("MP3");
  });
});
