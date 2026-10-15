import { describe, expect, test } from "bun:test";
import * as ui1 from "../resources/file_manager/ui/qrtables.js";
const { ECC_LEVELS, alignmentPositions, blockLayout, dataCodewords, dataOrder, decodeFormatBits, formatBits, rawDataModules, rsCorrect, rsEncode, sizeOf, versionBits }: any = ui1;
import * as ui2 from "../resources/file_manager/ui/qrencode.js";
const { QrError, bestMode, encodeQr, maxCapacity }: any = ui2;
import * as ui3 from "../resources/file_manager/ui/qrdecode.js";
const { decodeMatrix, decodeQr, parseSegments }: any = ui3;
import * as ui4 from "../resources/file_manager/ui/qrrender.js";
const { checkColour, parseColour, qrToRgba, qrToSvg, qrToText }: any = ui4;
import * as ui5 from "../resources/file_manager/ui/qrcontent.js";
const { describePayload, emailPayload, eventPayload, geoPayload, phonePayload, smsPayload, urlPayload, vcardPayload, wifiPayload }: any = ui5;

// Reference symbols made by the independent Python "qrcode" library (version, level, mask and text fixed), as bits packed into hex with a leading 1.
const REFERENCE: Array<{ text: string; ecc: string; mask: number; version: number; size: number; hex: string }> = [
  { text: "49562553528543001", ecc: "H", mask: 2, version: 1, size: 21, hex: "3fd77f82d20dd7976e88bb7435d82fa0ff55fc03a00751e715a99eb55bd21353a58270087f7f164a09de97583eba9c65d5422089bdfc2c4" },
  { text: "AXVT*R3-0/$K9FMHA", ecc: "Q", mask: 1, version: 2, size: 25, hex: "3fcae7f822920dd2a176eae6bb74435d82eea0ff555fc031000c42b6809e8c8ab3b79ec70f4f0c6c22300a6fe94699cd6e98b851bfc00808d7f27d5a091e2974e5feba7eb05d5f13e0a0163fcbfeb" },
  { text: "&&oxz Cqc=2=y.m fm:sf1&~djwseqBmjb=igaq☃Auvmtpwké/ausréBq& w", ecc: "H", mask: 4, version: 7, size: 45, hex: "3fca9063697f8292275dd20dd031f494976e84068f96bb74205fcef5d82ade8c8820ff55555555fc029922e3c001e49dfa9c6228314dee5b14be64f938f4cc04b7ddb8f46e6533f9ce368f77124dbe0f9c39fa63f9809ceab731316e82b056a2887149bf5b51b109a4dad72721358a66459fc15fab9f278db28e2c8f65788d7ec550e373e2836209fc9bfc79fba82624e2cb33d4890b83af4540c031fe7f3fb54e7dbfff85f3b2ddb4756f8fdb2e19e4935c5ab846d76bfc94f3897a8d2681705b9a865ca79e55a6f73be1365abf7b5f1009f489888c7f65e56a054a0b10e2d6e3575ee3f871f0ba6e6a4c543dd24b0c6099a08e44baf861fcb3dd2d691" },
];
const bitsOf = (hex: string) => BigInt("0x" + hex).toString(2).slice(1);

describe("the encoder agrees with an independent implementation", () => {
  for (const r of REFERENCE) {
    test(`version ${r.version}, level ${r.ecc}, mask ${r.mask}: every one of the ${r.size * r.size} squares is the same`, () => {
      const q = encodeQr(r.text, { ecc: r.ecc as any, mask: r.mask });
      expect(q.version).toBe(r.version);
      expect(q.size).toBe(r.size);
      expect(q.modules.join("")).toBe(bitsOf(r.hex));
    });
  }
});

describe("the tables", () => {
  test("every version has as many data squares as the table says, and a sensible block layout", () => {
    for (let v = 1; v <= 40; v++) {
      expect(dataOrder(v).length, `v${v}`).toBe(rawDataModules(v));
      for (const l of ECC_LEVELS) {
        const b = blockLayout(v, l);
        expect(b.shortLen - b.ecc).toBeGreaterThan(0);
        expect(dataCodewords(v, l)).toBeGreaterThan(0);
      }
    }
    expect(sizeOf(40)).toBe(177);
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
  });
  test("format and version information match the published values", () => {
    expect(formatBits("L", 0).toString(2).padStart(15, "0")).toBe("111011111000100");
    expect(formatBits("M", 0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
    expect(versionBits(40).toString(2).padStart(18, "0")).toBe("101000110001101001");
    // up to three wrong bits are still understood
    expect(decodeFormatBits(formatBits("Q", 5) ^ 0b101001)).toEqual({ level: "Q", mask: 5 });
    expect(decodeFormatBits(formatBits("Q", 5) ^ 0b1111)).not.toEqual({ level: "Q", mask: 5 });
  });
  test("Reed-Solomon repairs as many wrong bytes as half its error-correction bytes, and no more", () => {
    const data = Uint8Array.from({ length: 40 }, (_, i) => (i * 53 + 7) & 255);
    const ecc = rsEncode(data, 20);
    const good = Uint8Array.from([...data, ...ecc]);
    for (const wrong of [0, 1, 5, 10]) {
      const block = Uint8Array.from(good);
      for (let i = 0; i < wrong; i++) block[i * 6]! ^= 0x35 + i;
      expect(rsCorrect(block, 20), `${wrong} wrong`).toBe(wrong);
      expect(Buffer.from(block).equals(Buffer.from(good))).toBe(true);
    }
    const bad = Uint8Array.from(good);
    for (let i = 0; i < 14; i++) bad[i * 4]! ^= 0x77;
    expect(rsCorrect(bad, 20)).toBe(-1);
  });
});

describe("making codes", () => {
  test("the cheapest mode is chosen", () => {
    expect(bestMode("0123")).toBe("numeric");
    expect(bestMode("HELLO WORLD $%*+-./:")).toBe("alnum");
    expect(bestMode("Hello")).toBe("byte");
    expect(bestMode("")).toBe("byte");
    expect(encodeQr("0123456789").mode).toBe("numeric");
  });
  test("a bigger version is used only when needed, and the level changes the size", () => {
    expect(encodeQr("hi", { ecc: "L" }).version).toBe(1);
    expect(encodeQr("x".repeat(100), { ecc: "L" }).version).toBeLessThan(encodeQr("x".repeat(100), { ecc: "H" }).version);
    expect(encodeQr("hi", { minVersion: 5 }).version).toBe(5);
  });
  test("boosting the level costs no extra size", () => {
    const plain = encodeQr("hello", { ecc: "L" });
    const boosted = encodeQr("hello", { ecc: "L", boostEcc: true });
    expect(boosted.version).toBe(plain.version);
    expect(boosted.ecc).toBe("H");
  });
  test("accents, other scripts and emoji are sent as UTF-8 and read back the same", () => {
    for (const t of ["café ☃ — 日本語 😀", "Привет, мир", "naïve façade Ñandú"]) {
      const q = encodeQr(t);
      expect(decodeMatrix(q.modules, q.size)?.text).toBe(t);
    }
  });
  test("raw bytes can be sent too", () => {
    const bytes = Uint8Array.from([65, 66, 67, 0x20, 0x41]);
    const q = encodeQr(bytes);
    expect(q.mode).toBe("byte");
    expect(decodeMatrix(q.modules, q.size)?.text).toBe("ABC A");
  });
  test("an ECI marker is added on request and read", () => {
    const q = encodeQr("héllo", { eci: true });
    const r = decodeMatrix(q.modules, q.size)!;
    expect(r.text).toBe("héllo");
    expect(r.eci).toBe("utf-8");
  });
  test("too much data is a sentence that gives the limit", () => {
    expect(() => encodeQr("x".repeat(3000), { ecc: "L" })).toThrow(QrError);
    expect(() => encodeQr("x".repeat(3000), { ecc: "L" })).toThrow(/too much.*2,953/);
    expect(() => encodeQr("é".repeat(1600), { ecc: "L" })).toThrow(/2 to 4 bytes/);
    expect(encodeQr("x".repeat(2953), { ecc: "L" }).version).toBe(40);
    expect(maxCapacity("byte", "H")).toBe(1273);
    expect(maxCapacity("numeric", "L")).toBe(7089);
    expect(maxCapacity("alnum", "L")).toBe(4296);
    expect(() => encodeQr("x", { ecc: "Z" as any })).toThrow(/L, M, Q or H/);
  });
  test("a fixed mask is respected and the automatic one is a valid mask", () => {
    expect(encodeQr("mask me", { mask: 3 }).mask).toBe(3);
    const auto = encodeQr("mask me");
    expect(auto.mask).toBeGreaterThanOrEqual(0);
    expect(auto.mask).toBeLessThan(8);
  });
});

describe("reading codes", () => {
  const TEXTS = ["https://example.com/a?b=c&d=é", "HELLO WORLD", "0123456789".repeat(20), "x".repeat(700)];
  const SAMPLE = "Repair me: 1234567890 abcdefghijklmnopqrstuvwxyz";
  test("a code survives damage up to what its level allows", () => {
    for (const level of ["L", "M", "Q", "H"] as const) {
      const q = encodeQr(SAMPLE, { ecc: level });
      const m = Uint8Array.from(q.modules);
      // flip squares in the data area only, a few per block, fewer than one block can repair
      const order = dataOrder(q.version);
      const flips = Math.floor(blockLayout(q.version, level).ecc / 2) - 1;
      for (let i = 0; i < flips; i++) {
        const [x, y] = order[i * 8 * 3];
        m[y * q.size + x]! ^= 1;
      }
      const r = decodeMatrix(m, q.size);
      expect(r?.text, level).toBe(SAMPLE);
      expect(r!.corrected).toBeGreaterThan(0);
    }
  });
  test("a code with far too much damage is refused, never misread", () => {
    const q = encodeQr("Too damaged to read", { ecc: "L" });
    const m = Uint8Array.from(q.modules);
    const order = dataOrder(q.version);
    for (let i = 0; i < order.length; i += 2) { const [x, y] = order[i]; m[y * q.size + x]! ^= 1; }
    expect(decodeMatrix(m, q.size)).toBeNull();
  });
  test("a mirrored code is read too", () => {
    const q = encodeQr("mirror");
    const t = new Uint8Array(q.modules.length);
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) t[x * q.size + y] = q.modules[y * q.size + x];
    const r = decodeMatrix(t, q.size)!;
    expect(r.text).toBe("mirror");
    expect(r.mirrored).toBe(true);
  });
  test("pictures at different sizes, with quiet zones of different widths, in two levels", () => {
    for (const t of TEXTS) for (const l of ["L", "Q"] as const) for (const [scale, border] of [[2, 4], [5, 2], [9, 6]] as const) {
      const q = encodeQr(t, { ecc: l });
      const r = decodeQr(qrToRgba(q, { scale, border }));
      expect(r?.text, `v${q.version} ${l} x${scale}`).toBe(t);
    }
  });
  test("coloured and inverted pictures", () => {
    const q = encodeQr("colours");
    expect(decodeQr(qrToRgba(q, { scale: 6, fg: "#143c8c", bg: "#faf5c8" }))?.text).toBe("colours");
    const r = decodeQr(qrToRgba(q, { scale: 6, fg: "#ffffff", bg: "#000000" }));
    expect(r?.text).toBe("colours");
    expect(r?.inverted).toBe(true);
  });
  test("a code inside a larger picture, turned by an angle and noisy", () => {
    const q = encodeQr("https://example.com/found-it");
    const px = qrToRgba(q, { scale: 6, border: 4 });
    const W = 700, H = 560;
    const canvas = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { canvas[i * 4] = 225; canvas[i * 4 + 1] = 220; canvas[i * 4 + 2] = 210; canvas[i * 4 + 3] = 255; }
    const ang = (23 * Math.PI) / 180, cos = Math.cos(ang), sin = Math.sin(ang);
    const cx = 360, cy = 280, half = px.width / 2;
    let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * cos + dy * sin + half, v = -dx * sin + dy * cos + half;
      if (u < 0 || v < 0 || u >= px.width - 1 || v >= px.height - 1) continue;
      const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
      for (let c = 0; c < 3; c++) {
        const p = (a: number, b: number) => px.data[(b * px.width + a) * 4 + c];
        const val = p(iu, iv) * (1 - fu) * (1 - fv) + p(iu + 1, iv) * fu * (1 - fv) + p(iu, iv + 1) * (1 - fu) * fv + p(iu + 1, iv + 1) * fu * fv;
        canvas[(y * W + x) * 4 + c] = Math.max(0, Math.min(255, val + (rnd() - 0.5) * 50));
      }
    }
    expect(decodeQr({ data: canvas, width: W, height: H })?.text).toBe("https://example.com/found-it");
  });
  test("a big code (version 30 or more) is read", () => {
    const t = "Big: " + "0123456789abcdefghij".repeat(100);
    const q = encodeQr(t, { ecc: "L" });
    expect(q.version).toBeGreaterThan(30);
    expect(decodeQr(qrToRgba(q, { scale: 3, border: 4 }))?.text).toBe(t);
  });
  test("pictures without a code give null, quickly, and a blank or tiny picture doesn't crash", () => {
    const W = 400, H = 300;
    const noise = new Uint8ClampedArray(W * H * 4);
    let seed = 99; for (let i = 0; i < noise.length; i += 4) { const v = (seed = (seed * 1664525 + 1013904223) >>> 0) >>> 24; noise[i] = noise[i + 1] = noise[i + 2] = v; noise[i + 3] = 255; }
    const t0 = performance.now();
    expect(decodeQr({ data: noise, width: W, height: H })).toBeNull();
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(decodeQr({ data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H })).toBeNull();
    expect(decodeQr({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBeNull();
  });
  test("segment parsing: numeric, bad data, and Kanji", () => {
    const pack = (bits: string) => {
      const bytes = new Uint8Array(Math.ceil(bits.length / 8) + 1);
      [...bits].forEach((b, i) => (bytes[i >> 3]! |= Number(b) << (7 - (i & 7))));
      return bytes;
    };
    // numeric: mode 0001, count 5 in 10 bits, 123 in 10 bits, 45 in 7 bits
    expect(parseSegments(pack("0001" + "0000000101" + "0001111011" + "0101101"), 1)?.text).toBe("12345");
    expect(parseSegments(Uint8Array.from([0xff, 0xff]), 1)).toBeNull();
    // Kanji mode: count 1, the character 点 (Shift_JIS 0x935F; minus 0x8140 is 0x121F, 0x12 × 0xC0 + 0x1F = 3487) is the 13 bits 0b0110110011111
    expect(parseSegments(pack("1000" + "00000001" + "0110110011111"), 1)?.text).toBe("点");
  });
});

describe("pictures of a code", () => {
  const q = encodeQr("render me");
  test("SVG is valid, small, uses one path, and only accepts real colours", () => {
    const svg = qrToSvg(q, { fg: "#123456", bg: "#fefefe" });
    expect(svg).toContain(`viewBox="0 0 ${q.size + 8} ${q.size + 8}"`);
    expect(svg).toContain('fill="#123456"');
    expect(svg.match(/<path/g)?.length).toBe(1);
    const evil = qrToSvg(q, { fg: '" onload="alert(1)', bg: "url(#x)" });
    expect(evil).not.toContain("onload");
    expect(evil).toContain('fill="#000000"');
    expect(evil).toContain('fill="#ffffff"');
    expect(checkColour("#ABC", "#000")).toBe("#abc");
    expect(checkColour("red", "#000")).toBe("#000");
    expect(parseColour("#0f08")).toEqual([0, 255, 0, 136]);
  });
  test("pixel sizes are limited and the picture is square", () => {
    const px = qrToRgba(q, { scale: 4, border: 4 });
    expect(px.width).toBe((q.size + 8) * 4);
    expect(px.height).toBe(px.width);
    expect(qrToRgba(q, { scale: 1000 }).width).toBe((q.size + 8) * 64);
  });
  test("text art has two square rows per line", () => {
    const art = qrToText(q, { border: 2 });
    expect(art.split("\n").length - 1).toBe(Math.ceil((q.size + 4) / 2));
    expect(art).toMatch(/[█▀▄]/);
  });
});

describe("what goes inside a code", () => {
  test("Wi-Fi: special characters are escaped and read back, and mistakes are explained", () => {
    const text = wifiPayload({ ssid: 'My;Net:"x"', password: "pa\\ss;wo,rd:12", security: "WPA", hidden: true });
    expect(text).toBe('WIFI:T:WPA;S:My\\;Net\\:\\"x\\";P:pa\\\\ss\\;wo\\,rd\\:12;H:true;;');
    const info = describePayload(text);
    expect(info.kind).toBe("wifi");
    expect(info.fields.find((f: any) => f.label === "Network name")!.value).toBe('My;Net:"x"');
    const pw = info.fields.find((f: any) => f.label === "Password")!;
    expect(pw.value).toBe("pa\\ss;wo,rd:12");
    expect(pw.secret).toBe(true);
    expect(wifiPayload({ ssid: "Open", security: "nopass" })).toBe("WIFI:T:nopass;S:Open;;");
    expect(() => wifiPayload({ ssid: "", password: "x" })).toThrow(/network name/);
    expect(() => wifiPayload({ ssid: "A", password: "short" })).toThrow(/8 to 63/);
    expect(() => wifiPayload({ ssid: "A", password: "", security: "WEP" })).toThrow(/password/);
  });
  test("contact card, e-mail, SMS, phone, place, event and web address", () => {
    const card = vcardPayload({ first: "Ada", last: "Lovelace", org: "Analytical, Inc.", phone: "+44 20 7946 0000", email: "ada@example.com", note: "Line 1\nLine 2" });
    expect(card).toContain("BEGIN:VCARD");
    expect(card).toContain("N:Lovelace;Ada;;;");
    expect(card).toContain("ORG:Analytical\\, Inc.");
    expect(card).toContain("NOTE:Line 1\\nLine 2");
    const back = describePayload(card);
    expect(back.kind).toBe("contact");
    expect(back.fields.find((f: any) => f.label === "Note")!.value).toBe("Line 1\nLine 2");
    expect(() => vcardPayload({})).toThrow(/name/);
    const mail = emailPayload({ to: "a@b.co", subject: "Hi there", body: "A & B\nC" });
    expect(mail).toBe("mailto:a@b.co?subject=Hi%20there&body=A%20%26%20B%0AC");
    expect(describePayload(mail).fields.map((f: any) => f.value)).toEqual(["a@b.co", "Hi there", "A & B\nC"]);
    expect(() => emailPayload({ to: "nope" })).toThrow(/valid e-mail/);
    expect(smsPayload({ number: "+1 (555) 010-0100", message: "On my way" })).toBe("SMSTO:+15550100100:On my way");
    expect(describePayload("SMSTO:+15550100100:On my way").fields.map((f: any) => f.value)).toEqual(["+15550100100", "On my way"]);
    expect(phonePayload("+44 20 7946 0000")).toBe("tel:+442079460000");
    expect(() => phonePayload("call me")).toThrow(/phone number/);
    expect(geoPayload({ lat: "48.8584", lon: "2.2945" })).toBe("geo:48.8584,2.2945");
    expect(() => geoPayload({ lat: "91", lon: "0" })).toThrow(/Latitude/);
    expect(describePayload("geo:48.8584,2.2945").url).toContain("openstreetmap.org");
    const ev = eventPayload({ title: "Launch, party", start: "2026-05-01T18:30:00Z", end: "2026-05-01T20:00:00Z", location: "Hall; A" });
    expect(ev).toContain("DTSTART:20260501T183000Z");
    expect(ev).toContain("SUMMARY:Launch\\, party");
    expect(describePayload(ev).kind).toBe("event");
    expect(() => eventPayload({ title: "X", start: "2026-05-02T10:00:00Z", end: "2026-05-01T10:00:00Z" })).toThrow(/before it starts/);
    expect(urlPayload("example.com/a")).toBe("https://example.com/a");
    expect(urlPayload("http://x.org")).toBe("http://x.org");
    expect(urlPayload("  ")).toBe("");
  });
  test("what a code says is recognised, and links are offered only when they are plain web addresses", () => {
    expect(describePayload("https://example.com/path").url).toBe("https://example.com/path");
    for (const risky of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.org", "intent://x#Intent;end", "https://exa mple.com", "just some words"]) expect(describePayload(risky).url, risky).toBeUndefined();
    const otp = describePayload("otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example");
    expect(otp.kind).toBe("otp");
    expect(otp.warning).toContain("secret key");
    expect(otp.fields.find((f: any) => f.label === "Secret")!.secret).toBe(true);
    expect(describePayload("MECARD:N:Lovelace,Ada;TEL:123;;").fields[0].value).toBe("Ada Lovelace");
    expect(describePayload("plain").kind).toBe("text");
  });
});
