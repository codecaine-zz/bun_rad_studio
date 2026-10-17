/**
 * The Quick Look player's brain (resources/file_manager/ui/mediacore.js): the tags inside music files (hand-built bytes for
 * each format, and real files made by ffmpeg when it is installed), subtitle conversion, clock text, and the play queue
 * with shuffle and repeat. No page is needed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AUDIO_MIME, VIDEO_MIME } from "../src/features/filemanager/fmQuickLook";
import { AUDIO_EXTS, EQ_BANDS, EQ_PRESETS, PlayQueue, VIDEO_EXTS, clampGain, formatClock, mediaKindOfName, parseFlac, parseId3, parseMp4Tags, parseOggTags, srtToVtt, subtitleText } from "../resources/file_manager/ui/mediacore.js";

const enc = new TextEncoder();
const cat = (...parts: Array<Uint8Array | number[]>) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const sync = (n: number) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));

describe("which files play", () => {
  test("the page and the server agree on the formats", () => {
    expect([...AUDIO_EXTS].sort()).toEqual(Object.keys(AUDIO_MIME).sort());
    expect([...VIDEO_EXTS].sort()).toEqual(Object.keys(VIDEO_MIME).sort());
  });
  test("kinds come from the ending, case-insensitively; no ending is nothing", () => {
    expect(mediaKindOfName("Song.MP3")).toBe("audio");
    expect(mediaKindOfName("clip.final.MOV")).toBe("video");
    expect(mediaKindOfName("mp3")).toBeNull();
    expect(mediaKindOfName("notes.txt")).toBeNull();
    expect(mediaKindOfName(".mp3")).toBeNull();
  });
});

describe("clock text and subtitles", () => {
  test("minutes and hours; nonsense is 0:00", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5.9)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
    for (const bad of [NaN, Infinity, -3, undefined as any]) expect(formatClock(bad)).toBe("0:00");
  });
  test("SubRip becomes WebVTT; a WebVTT file is left alone", () => {
    const vtt = srtToVtt("\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nHello, world\r\n");
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:01.500 --> 00:00:03.000");
    expect(vtt).toContain("Hello, world");
    expect(vtt).not.toContain("\r");
    const already = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi";
    expect(srtToVtt(already)).toBe(already);
  });
  test("subtitle text drops cue numbers and timestamps for the lyrics panel", () => {
    expect(subtitleText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst line\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line"))
      .toBe("First line\n\nSecond line");
  });
});

describe("ID3 tags (MP3)", () => {
  const frame3 = (id: string, body: number[]) => [...enc.encode(id), ...be32(body.length), 0, 0, ...body];
  const text = (s: string) => [3, ...enc.encode(s)]; // UTF-8
  test("v2.3 text frames and a front cover", () => {
    const apic = [0, ...enc.encode("image/png"), 0, 3, 0, ...PNG];
    const frames = [...frame3("TIT2", text("Blue Train")), ...frame3("TPE1", text("John Coltrane")), ...frame3("TALB", text("Blue Train")), ...frame3("TYER", text("1958")), ...frame3("TRCK", text("2/5")), ...frame3("APIC", apic)];
    const tag = cat(enc.encode("ID3"), [3, 0, 0], sync(frames.length), frames, new Array(40).fill(0));
    const t = parseId3(tag)!;
    expect([t.title, t.artist, t.album, t.year, t.track]).toEqual(["Blue Train", "John Coltrane", "Blue Train", "1958", "2/5"]);
    expect((t as any).cover.mime).toBe("image/png");
    expect(Array.from((t as any).cover.data)).toEqual(Array.from(PNG));
  });
  test("v2.4 uses sync-safe frame sizes; UTF-16 text with a byte-order mark is read", () => {
    const utf16 = [1, 0xff, 0xfe, ...Array.from("Żółć").flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];
    const f = [...enc.encode("TIT2"), ...sync(utf16.length), 0, 0, ...utf16];
    const tag = cat(enc.encode("ID3"), [4, 0, 0], sync(f.length), f);
    expect(parseId3(tag)!.title).toBe("Żółć");
  });
  test("v2.2 three-letter frames", () => {
    const body = [0, ...enc.encode("Old Song")];
    const f = [...enc.encode("TT2"), (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
    const tag = cat(enc.encode("ID3"), [2, 0, 0], sync(f.length), f);
    expect(parseId3(tag)!.title).toBe("Old Song");
  });
  test("unsynchronized lyrics preserve line breaks", () => {
    const lyrics = enc.encode("First line\nSecond line");
    const body = [3, ...enc.encode("eng"), 0, ...lyrics];
    const tag = cat(enc.encode("ID3"), [3, 0, 0], sync(frame3("USLT", body).length), frame3("USLT", body));
    expect(parseId3(tag)!.lyrics).toBe("First line\nSecond line");
  });
  test("no tag, a damaged tag, or an empty one gives null and never throws", () => {
    expect(parseId3(new Uint8Array(0))).toBeNull();
    expect(parseId3(enc.encode("not an mp3 at all"))).toBeNull();
    expect(parseId3(cat(enc.encode("ID3"), [3, 0, 0], sync(500), [1, 2, 3]))).toBeNull();
    expect(parseId3(cat(enc.encode("ID3"), [9, 0, 0], sync(0)))).toBeNull();
  });
});

describe("MP4 / M4A tags", () => {
  const box = (type: string, ...kids: Array<number[] | Uint8Array>) => { const body = cat(...kids); return cat(be32(8 + body.length), type.length === 4 ? Array.from(type, (c) => c.charCodeAt(0)) : [], body); };
  const item = (type: string, flags: number, payload: Uint8Array | number[]) => box(type, box("data", [0, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255, 0, 0, 0, 0], payload));
  test("title, artist, album, year, track and cover from the iTunes atoms", () => {
    const ilst = box("ilst", item("\u00a9nam", 1, enc.encode("AAC Tone")), item("\u00a9ART", 1, enc.encode("M4A Band")), item("\u00a9alb", 1, enc.encode("Atoms")), item("\u00a9day", 1, enc.encode("2026-01-02")), item("trkn", 0, [0, 0, 0, 7, 0, 9, 0, 0]), item("covr", 14, PNG));
    const moov = box("moov", box("udta", box("meta", [0, 0, 0, 0], ilst)));
    const t = parseMp4Tags(moov.subarray(8))!;
    expect([t.title, t.artist, t.album, t.year, t.track]).toEqual(["AAC Tone", "M4A Band", "Atoms", "2026", "7"]);
    expect((t as any).cover.mime).toBe("image/png");
    expect((t as any).cover.data.length).toBe(PNG.length);
  });
  test("nothing useful, or a box that lies about its size, gives null", () => {
    expect(parseMp4Tags(new Uint8Array(0))).toBeNull();
    expect(parseMp4Tags(cat(be32(9999), enc.encode("udta"), [1, 2, 3]))).toBeNull();
  });
});

describe("FLAC tags", () => {
  const block = (type: number, last: boolean, body: number[]) => [(last ? 0x80 : 0) | type, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
  test("Vorbis comments and the front cover", () => {
    const comments = ["TITLE=Flac Tone", "ARTIST=Flac Ensemble", "ALBUM=Lossless", "DATE=2026-03-04", "TRACKNUMBER=3", "LYRICS=First verse\nSecond line", "bad line"].map((c) => enc.encode(c));
    const vorbis = [...le32(3), ...enc.encode("bun"), ...le32(comments.length), ...comments.flatMap((c) => [...le32(c.length), ...c])];
    const picture = [...be32(3), ...be32(9), ...enc.encode("image/png"), ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(PNG.length), ...PNG];
    const file = cat(enc.encode("fLaC"), block(0, false, new Array(34).fill(0)), block(4, false, vorbis), block(6, true, picture));
    const t = parseFlac(file)!;
    expect([t.title, t.artist, t.album, t.year, t.track]).toEqual(["Flac Tone", "Flac Ensemble", "Lossless", "2026", "3"]);
    expect(t.lyrics).toBe("First verse\nSecond line");
    expect((t as any).cover.mime).toBe("image/png");
    expect(Array.from((t as any).cover.data)).toEqual(Array.from(PNG));
  });

  test("not FLAC, or cut short, gives null", () => {
    expect(parseFlac(enc.encode("RIFFxxxx"))).toBeNull();
    expect(parseFlac(cat(enc.encode("fLaC"), [0x84, 0, 0xff, 0xff, 1, 2, 3]))).toBeNull();
  });
});

describe("Ogg embedded lyrics", () => {
  test("Opus comments are read from an OpusTags packet", () => {
    const vendor = enc.encode("test");
    const comment = enc.encode("LYRICS=First verse\nSecond line");
    const le = (n: number) => le32(n);
    const tags = cat(enc.encode("OpusTags"), le(vendor.length), vendor, le(1), le(comment.length), comment);
    expect(parseOggTags(tags)!.lyrics).toBe("First verse\nSecond line");
  });
});

const ffmpeg = ["/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", Bun.which("ffmpeg") ?? ""].find((p) => p && existsSync(p) && Bun.spawnSync([p, "-version"]).exitCode === 0);
describe.skipIf(!ffmpeg)("real files made by ffmpeg", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "fm-player-")); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
  const run = (args: string[]) => expect(Bun.spawnSync([ffmpeg!, "-y", "-loglevel", "error", ...args], { cwd: dir }).exitCode).toBe(0);
  test("an MP3 with ID3 tags and a cover", () => {
    mkdirSync(dir, { recursive: true });
    run(["-f", "lavfi", "-i", "testsrc2=size=64x64:rate=1", "-frames:v", "1", "cover.png"]);
    run(["-f", "lavfi", "-i", "sine=duration=1", "-i", "cover.png", "-map", "0", "-map", "1", "-c:a", "libmp3lame", "-c:v", "copy", "-id3v2_version", "3", "-metadata", "title=Real Song", "-metadata", "artist=Real Artist", "-metadata", "album=Real Album", "-metadata", "date=2024", "-metadata", "track=4", "-disposition:v", "attached_pic", "a.mp3"]);
    const t = parseId3(new Uint8Array(readFileSync(join(dir, "a.mp3"))))!;
    expect([t.title, t.artist, t.album, t.year, t.track]).toEqual(["Real Song", "Real Artist", "Real Album", "2024", "4"]);
    expect((t as any).cover.mime).toContain("png");
    expect((t as any).cover.data[1]).toBe(0x50);
  });
  test("a FLAC with Vorbis comments", () => {
    run(["-f", "lavfi", "-i", "sine=duration=1", "-metadata", "title=Real Flac", "-metadata", "artist=Flac Artist", "b.flac"]);
    const t = parseFlac(new Uint8Array(readFileSync(join(dir, "b.flac"))))!;
    expect([t.title, t.artist]).toEqual(["Real Flac", "Flac Artist"]);
  });
  test("an M4A with tags and a cover (the moov box is found and read)", () => {
    run(["-f", "lavfi", "-i", "sine=duration=1", "-i", "cover.png", "-map", "0", "-map", "1", "-c:a", "aac", "-c:v", "copy", "-disposition:v", "attached_pic", "-metadata", "title=Real M4A", "-metadata", "artist=M4A Artist", "c.m4a"]);
    const bytes = new Uint8Array(readFileSync(join(dir, "c.m4a")));
    // The page walks the top-level boxes; do the same here.
    let pos = 0;
    let moov: Uint8Array | null = null;
    const dv = new DataView(bytes.buffer);
    while (pos + 8 <= bytes.length) {
      const size = dv.getUint32(pos);
      const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
      if (type === "moov") { moov = bytes.subarray(pos + 8, pos + size); break; }
      pos += size;
    }
    const t = parseMp4Tags(moov!)!;
    expect([t.title, t.artist]).toEqual(["Real M4A", "M4A Artist"]);
    expect(t.cover).not.toBeNull();
  });
});

describe("the play queue", () => {
  const seeded = (seed = 1) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
  test("plays in order, then stops; Next at the end of a longer list wraps", () => {
    const q = new PlayQueue(3, 0);
    expect([q.next(true), q.next(true), q.next(true)]).toEqual([1, 2, null]);
    expect(q.index).toBe(2);
    expect(q.next(false)).toBe(0);
    expect(new PlayQueue(1, 0).next(false)).toBeNull();
  });
  test("repeat all wraps by itself; repeat one stays on the track when it ends but Next still moves on", () => {
    const all = new PlayQueue(2, 1);
    all.setRepeat("all");
    expect(all.next(true)).toBe(0);
    const one = new PlayQueue(3, 1);
    one.setRepeat("one");
    expect(one.next(true)).toBe(1);
    expect(one.next(false)).toBe(2);
    expect(one.cycleRepeat()).toBe("off");
    expect(one.cycleRepeat()).toBe("all");
    expect(one.cycleRepeat()).toBe("one");
  });
  test("shuffle starts on the current track and plays every track once before any repeats", () => {
    const q = new PlayQueue(8, 3, seeded());
    q.setShuffle(true);
    expect(q.index).toBe(3);
    const seen = [q.index];
    for (let i = 0; i < 7; i++) seen.push(q.next(true)!);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(q.next(true)).toBeNull();
    q.setShuffle(false);
    // Turning shuffle off keeps the current track and carries on in the list's own order.
    expect(q.index).toBe(seen.at(-1)!);
    const after = q.next(true);
    expect(after === null ? q.index === 7 : after === seen.at(-1)! + 1).toBe(true);
  });
  test("Previous restarts after the first seconds, and goes back before that", () => {
    const q = new PlayQueue(3, 2);
    expect(q.prev(10)).toEqual({ restart: true, index: 2 });
    expect(q.prev(1)).toEqual({ restart: false, index: 1 });
    expect(q.prev(1)).toEqual({ restart: false, index: 0 });
    expect(q.prev(1)).toEqual({ restart: true, index: 0 });
    q.setRepeat("all");
    expect(q.prev(1)).toEqual({ restart: false, index: 2 });
  });
  test("jumping to a track in a shuffled queue plays that track and the order continues from it", () => {
    const q = new PlayQueue(5, 0, seeded(7));
    q.setShuffle(true);
    expect(q.jumpTo(4)).toBe(4);
    expect(q.index).toBe(4);
  });
  test("an empty queue has nothing to play", () => {
    expect(new PlayQueue(0).next(false)).toBeNull();
  });
});

describe("the equaliser", () => {
  test("every preset has one gain per band, inside the limits, and Flat is flat", () => {
    for (const [name, gains] of Object.entries(EQ_PRESETS)) {
      expect(gains.length, name).toBe(EQ_BANDS.length);
      for (const g of gains) expect(Math.abs(g)).toBeLessThanOrEqual(12);
    }
    expect(EQ_PRESETS.Flat.every((g: number) => g === 0)).toBe(true);
  });
  test("gains are rounded and clamped; nonsense is 0", () => {
    expect([clampGain(3.6), clampGain(99), clampGain(-99), clampGain("x"), clampGain(undefined)]).toEqual([4, 12, -12, 0, 0]);
  });
});
