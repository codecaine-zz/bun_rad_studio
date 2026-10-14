/**
 * EXIF (the camera's notes inside a picture): reads TIFF-style tag lists in either byte order, with guards against
 * loops, huge counts and truncated data. Pure: bytes in, tags out. Nothing here throws on bad data.
 */
import { clip, isoFromExif, Rows } from "./fmInfoCommon";
import {
  COLOR_SPACE, EXIF_TAGS, EXPOSURE_MODE, EXPOSURE_PROGRAM, GPS_TAGS, IFD0_TAGS, INTEROP_TAGS, LIGHT_SOURCE, METERING, ORIENTATION,
  RESOLUTION_UNIT, SCENE_TYPE, SENSING, WHITE_BALANCE, flashText, name,
} from "./fmInfoTables";

export type IfdName = "IFD0" | "IFD1" | "Exif" | "GPS" | "Interop";
export interface ExifTag {
  ifd: IfdName;
  id: number;
  name: string;
  type: number;
  count: number;
  value: number | string | number[] | null;
  /** The numerator and denominator of each rational value. */
  ratio?: Array<[number, number]>;
}
export interface ExifData {
  littleEndian: boolean;
  tags: ExifTag[];
  partial: boolean;
  hasThumbnail: boolean;
  hasMakerNote: boolean;
  makerNoteBytes: number;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const MAX_IFDS = 16;
const MAX_ENTRIES = 1000;
const MAX_TAGS = 3000;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_ITEMS = 64;

/** Reads the tag lists of a TIFF structure that starts at `start` in `buf` ("II*\0" or "MM\0*"). */
export function parseTiff(buf: Uint8Array, start = 0): ExifData | null {
  if (buf.length < start + 8) return null;
  const a = buf[start], b = buf[start + 1];
  const le = a === 0x49 && b === 0x49;
  if (!le && !(a === 0x4d && b === 0x4d)) return null;
  const v = new DataView(buf.buffer, buf.byteOffset + start, buf.length - start);
  const len = v.byteLength;
  if (v.getUint16(2, le) !== 42) return null;
  const data: ExifData = { littleEndian: le, tags: [], partial: false, hasThumbnail: false, hasMakerNote: false, makerNoteBytes: 0 };
  const seen = new Set<number>();
  const queue: Array<{ offset: number; ifd: IfdName }> = [{ offset: v.getUint32(4, le), ifd: "IFD0" }];

  function value(type: number, count: number, at: number): { value: ExifTag["value"]; ratio?: Array<[number, number]> } | null {
    const unit = TYPE_SIZE[type];
    if (!unit) return null;
    const bytes = unit * count;
    if (count < 0 || bytes > MAX_VALUE_BYTES * 16) return null;
    const where = bytes <= 4 ? at : v.getUint32(at, le);
    if (where + bytes > len || where < 8) {
      if (bytes <= 4) return null;
      data.partial = true;
      return null;
    }
    const take = Math.min(count, MAX_ITEMS);
    if (type === 2) {
      let end = where;
      const limit = where + Math.min(bytes, 4000);
      while (end < limit && buf[start + end] !== 0) end++;
      return { value: clip(Buffer.from(buf.subarray(start + where, start + end)).toString("utf8")).trim() };
    }
    if (type === 7 || type === 1) {
      if (count > 16 && type === 7) return { value: null };
      const arr = Array.from(buf.subarray(start + where, start + where + take));
      if (type === 7 && count >= 1 && arr.every((x) => x >= 0x20 && x < 0x7f)) return { value: String.fromCharCode(...arr) };
      return { value: take === 1 ? arr[0]! : arr };
    }
    const nums: number[] = [];
    const ratio: Array<[number, number]> = [];
    for (let i = 0; i < take; i++) {
      const p = where + i * unit;
      switch (type) {
        case 3: nums.push(v.getUint16(p, le)); break;
        case 4: nums.push(v.getUint32(p, le)); break;
        case 6: nums.push(v.getInt8(p)); break;
        case 8: nums.push(v.getInt16(p, le)); break;
        case 9: nums.push(v.getInt32(p, le)); break;
        case 11: nums.push(v.getFloat32(p, le)); break;
        case 12: nums.push(v.getFloat64(p, le)); break;
        case 5: {
          const n = v.getUint32(p, le), d = v.getUint32(p + 4, le);
          ratio.push([n, d]);
          nums.push(d === 0 ? NaN : n / d);
          break;
        }
        case 10: {
          const n = v.getInt32(p, le), d = v.getInt32(p + 4, le);
          ratio.push([n, d]);
          nums.push(d === 0 ? NaN : n / d);
          break;
        }
      }
    }
    return { value: nums.length === 1 ? nums[0]! : nums, ...(ratio.length ? { ratio } : {}) };
  }

  while (queue.length && seen.size < MAX_IFDS && data.tags.length < MAX_TAGS) {
    const { offset, ifd } = queue.shift()!;
    if (offset < 8 || offset + 2 > len || seen.has(offset)) {
      if (offset >= len) data.partial = true;
      continue;
    }
    seen.add(offset);
    let entries = v.getUint16(offset, le);
    if (entries > MAX_ENTRIES) entries = MAX_ENTRIES;
    if (offset + 2 + entries * 12 > len) {
      data.partial = true;
      entries = Math.max(0, Math.floor((len - offset - 2) / 12));
    }
    const table = ifd === "GPS" ? GPS_TAGS : ifd === "Interop" ? INTEROP_TAGS : ifd === "Exif" ? EXIF_TAGS : IFD0_TAGS;
    for (let i = 0; i < entries && data.tags.length < MAX_TAGS; i++) {
      const e = offset + 2 + i * 12;
      const id = v.getUint16(e, le);
      const type = v.getUint16(e + 2, le);
      const count = v.getUint32(e + 4, le);
      if ((ifd === "IFD0" || ifd === "IFD1") && id === 0x8769) { const p = v.getUint32(e + 8, le); queue.push({ offset: p, ifd: "Exif" }); continue; }
      if ((ifd === "IFD0" || ifd === "IFD1") && id === 0x8825) { queue.push({ offset: v.getUint32(e + 8, le), ifd: "GPS" }); continue; }
      if (ifd === "Exif" && id === 0xa005) { queue.push({ offset: v.getUint32(e + 8, le), ifd: "Interop" }); continue; }
      if (ifd === "Exif" && id === 0x927c) {
        data.hasMakerNote = true;
        data.makerNoteBytes = count;
        continue;
      }
      const decoded = value(type, count, e + 8);
      if (ifd === "IFD1" && (id === 0x201 || id === 0x202)) data.hasThumbnail = true;
      if (!decoded) continue;
      const tagName = table[id] ?? `Tag0x${id.toString(16).padStart(4, "0")}`;
      data.tags.push({ ifd, id, name: tagName, type, count, value: decoded.value, ...(decoded.ratio ? { ratio: decoded.ratio } : {}) });
    }
    if (ifd === "IFD0" && offset + 2 + entries * 12 + 4 <= len) {
      const next = v.getUint32(offset + 2 + entries * 12, le);
      if (next) queue.push({ offset: next, ifd: "IFD1" });
    }
  }
  return data;
}

/** The EXIF block of a JPEG APP1 payload ("Exif\0\0" then TIFF), or of a bare TIFF. */
export function parseExifBlock(block: Uint8Array): ExifData | null {
  if (block.length >= 14 && Buffer.from(block.subarray(0, 4)).toString("latin1") === "Exif") return parseTiff(block, 6);
  return parseTiff(block, 0);
}

const find = (d: ExifData, ifd: IfdName, id: number) => d.tags.find((t) => t.ifd === ifd && t.id === id);
export const exifNumber = (d: ExifData, ifd: IfdName, id: number): number | null => {
  const t = find(d, ifd, id);
  const x = Array.isArray(t?.value) ? t!.value[0] : t?.value;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
export const exifText = (d: ExifData, ifd: IfdName, id: number): string => {
  const t = find(d, ifd, id);
  return typeof t?.value === "string" ? t.value.trim() : "";
};

export interface Gps {
  lat: number;
  lon: number;
  altitude: number | null;
  direction: number | null;
  timestamp: string | null;
  latText: string;
  lonText: string;
}

function dms(parts: number[], ref: string): { deg: number; text: string } | null {
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null;
  const [d, m, s] = parts as [number, number, number];
  if (d < 0 || m < 0 || m >= 61 || s < 0 || s >= 61) return null;
  const sign = ref === "S" || ref === "W" ? -1 : 1;
  return { deg: sign * (d + m / 60 + s / 3600), text: `${d}° ${m}′ ${(Math.round(s * 100) / 100).toString()}″ ${ref}` };
}

export function gpsOf(d: ExifData): Gps | null {
  const latRef = exifText(d, "GPS", 1).toUpperCase().slice(0, 1);
  const lonRef = exifText(d, "GPS", 3).toUpperCase().slice(0, 1);
  const la = find(d, "GPS", 2)?.value;
  const lo = find(d, "GPS", 4)?.value;
  if (!Array.isArray(la) || !Array.isArray(lo) || !/^[NS]$/.test(latRef) || !/^[EW]$/.test(lonRef)) return null;
  const lat = dms(la, latRef), lon = dms(lo, lonRef);
  if (!lat || !lon || Math.abs(lat.deg) > 90 || Math.abs(lon.deg) > 180) return null;
  let altitude = exifNumber(d, "GPS", 6);
  if (altitude !== null && exifNumber(d, "GPS", 5) === 1) altitude = -altitude;
  const dir = exifNumber(d, "GPS", 17);
  const ts = find(d, "GPS", 7)?.value;
  const date = exifText(d, "GPS", 29).replace(/:/g, "-");
  const time = Array.isArray(ts) && ts.length >= 3 && ts.every((x) => Number.isFinite(x)) ? ts.map((x, i) => String(Math.floor(x)).padStart(2, "0") + (i < 2 ? ":" : "")).join("") : "";
  return {
    lat: Math.round(lat.deg * 1e6) / 1e6, lon: Math.round(lon.deg * 1e6) / 1e6, altitude: altitude === null ? null : Math.round(altitude * 10) / 10,
    direction: dir !== null && dir >= 0 && dir <= 360 ? Math.round(dir * 10) / 10 : null, timestamp: time ? `${date ? `${date} ` : ""}${time} UTC` : null,
    latText: lat.text, lonText: lon.text,
  };
}

export function shutterText(t: ExifTag | undefined): string {
  if (!t) return "";
  const r = t.ratio?.[0];
  const x = typeof t.value === "number" ? t.value : NaN;
  if (!Number.isFinite(x) || x <= 0) return "";
  if (r && r[0] === 1) return `1/${r[1]} s`;
  if (x < 1) return `1/${Math.round(1 / x)} s`;
  return `${Math.round(x * 10) / 10} s`;
}

const trimNum = (x: number, digits = 1) => String(Math.round(x * 10 ** digits) / 10 ** digits);

export interface PhotoSummary {
  camera: string;
  taken: string;
  iso: string;
  aperture: string;
  shutter: string;
  focal: string;
}

export interface ExifReport {
  camera: Rows;
  image: Rows;
  location: Rows;
  gps: Gps | null;
  photo: PhotoSummary;
  privacy: Array<{ id: string; label: string; present: boolean; detail: string }>;
  orientation: number | null;
}

export function summarizeExif(d: ExifData, extras: { xmp?: boolean; iptc?: boolean } = {}): ExifReport {
  const camera = new Rows(), image = new Rows(), location = new Rows();
  const make = exifText(d, "IFD0", 0x10f), model = exifText(d, "IFD0", 0x110);
  const cam = model.toLowerCase().startsWith(make.toLowerCase()) && make ? model : [make, model].filter(Boolean).join(" ");
  const lens = exifText(d, "Exif", 0xa434) || (() => { const s = find(d, "Exif", 0xa432)?.value; return Array.isArray(s) && s.length === 4 ? `${trimNum(s[0]!)}–${trimNum(s[1]!)} mm f/${trimNum(s[2]!)}–${trimNum(s[3]!)}` : ""; })();
  const dateRaw = exifText(d, "Exif", 0x9003) || exifText(d, "Exif", 0x9004) || exifText(d, "IFD0", 0x132);
  const offset = exifText(d, "Exif", 0x9011) || exifText(d, "Exif", 0x9010);
  const taken = dateRaw ? `${isoFromExif(dateRaw) ?? dateRaw}${offset ? ` (time zone ${offset})` : ""}` : "";
  const exposure = shutterText(find(d, "Exif", 0x829a));
  const f = exifNumber(d, "Exif", 0x829d);
  const iso = exifNumber(d, "Exif", 0x8827);
  const focal = exifNumber(d, "Exif", 0x920a);
  const focal35 = exifNumber(d, "Exif", 0xa405);
  const program = exifNumber(d, "Exif", 0x8822);
  const metering = exifNumber(d, "Exif", 0x9207);
  const flash = exifNumber(d, "Exif", 0x9209);
  const wb = exifNumber(d, "Exif", 0xa403);
  const mode = exifNumber(d, "Exif", 0xa402);
  const bias = exifNumber(d, "Exif", 0x9204);
  const scene = exifNumber(d, "Exif", 0xa406);

  camera.add("Camera", cam).add("Lens", lens).add("Date taken", taken, "When the camera says the picture was taken (from the camera's clock).");
  camera.add("Exposure time", exposure, "How long the shutter stayed open. 1/250 s means a quarter of a hundredth of a second.");
  camera.add("Aperture", f !== null ? `f/${trimNum(f)}` : "", "How wide the lens opened. A smaller f-number lets in more light.");
  camera.add("ISO", iso, "How sensitive the camera was to light. Higher numbers brighten the picture but add grain.");
  camera.add("Focal length", focal !== null ? `${trimNum(focal)} mm${focal35 ? ` (${trimNum(focal35, 0)} mm in 35 mm film terms)` : ""}` : "", "How much the lens zoomed. Bigger numbers look closer.");
  camera.add("Exposure compensation", bias !== null ? `${bias > 0 ? "+" : ""}${trimNum(bias, 2)} EV` : "", "How much brighter or darker than the camera's own choice.");
  camera.add("Exposure program", program !== null ? name(EXPOSURE_PROGRAM, program) : "").add("Exposure mode", mode !== null ? name(EXPOSURE_MODE, mode) : "");
  camera.add("Metering", metering !== null ? name(METERING, metering) : "", "How the camera measured the light.");
  camera.add("Flash", flash !== null ? flashText(flash) : "").add("White balance", wb !== null ? name(WHITE_BALANCE, wb) : "", "How the camera corrected the colour of the light.");
  camera.add("Scene type", scene !== null ? name(SCENE_TYPE, scene) : "").add("Light source", (() => { const n = exifNumber(d, "Exif", 0x9208); return n ? name(LIGHT_SOURCE, n) : ""; })());
  camera.add("Sensor type", (() => { const n = exifNumber(d, "Exif", 0xa217); return n ? name(SENSING, n) : ""; })());
  camera.add("Software", exifText(d, "IFD0", 0x131), "The program that made or last saved this picture.");
  camera.add("Artist", exifText(d, "IFD0", 0x13b)).add("Copyright", exifText(d, "IFD0", 0x8298)).add("Description", exifText(d, "IFD0", 0x10e));
  camera.add("Camera owner", exifText(d, "Exif", 0xa430)).add("Camera serial number", exifText(d, "Exif", 0xa431), "A number that identifies this exact camera.").add("Lens serial number", exifText(d, "Exif", 0xa435));

  const orient = exifNumber(d, "IFD0", 0x112);
  const unit = exifNumber(d, "IFD0", 0x128);
  const xr = exifNumber(d, "IFD0", 0x11a), yr = exifNumber(d, "IFD0", 0x11b);
  const cs = exifNumber(d, "Exif", 0xa001);
  image.add("Orientation", orient !== null ? name(ORIENTATION, orient) : "", "Which way the camera was held. Viewers turn the picture to match.");
  image.add("Resolution", xr && yr && unit !== 1 ? `${trimNum(xr, 2)} × ${trimNum(yr, 2)} per ${unit !== null ? name(RESOLUTION_UNIT, unit) : "unit"}` : "", "Print size hint (dots per inch). It does not change how many pixels the picture has.");
  image.add("Colour space", cs !== null ? name(COLOR_SPACE, cs) : "", "Which set of colours the picture uses. sRGB is the usual one for screens.");
  image.add("Size in the camera notes", exifNumber(d, "Exif", 0xa002) && exifNumber(d, "Exif", 0xa003) ? `${exifNumber(d, "Exif", 0xa002)} × ${exifNumber(d, "Exif", 0xa003)} pixels` : "");
  image.add("Thumbnail", d.hasThumbnail ? "Has a small preview picture inside" : "", "A tiny copy of the picture stored inside the file. It can show an older, uncropped version.");
  image.add("Camera maker's extra notes", d.hasMakerNote ? `Present (${d.makerNoteBytes.toLocaleString("en-US")} bytes, not decoded)` : "", "Private notes only the camera brand can read (it can include a serial number).");

  const gps = gpsOf(d);
  if (gps) {
    location.add("Warning", "This photo contains the location where it was taken.", "Anyone who gets this file can see where the picture was taken. Remove it before sharing.", "warn");
    location.add("Latitude", `${gps.latText}  (${gps.lat})`, "How far north (N) or south (S) of the equator.").add("Longitude", `${gps.lonText}  (${gps.lon})`, "How far east (E) or west (W) of Greenwich.");
    location.add("Coordinates", `${gps.lat}, ${gps.lon}`);
    location.add("Altitude", gps.altitude !== null ? `${Math.abs(gps.altitude)} m ${gps.altitude < 0 ? "below" : "above"} sea level` : "");
    location.add("Direction", gps.direction !== null ? `${gps.direction}° (0° is north)` : "").add("GPS time", gps.timestamp);
    const datum = exifText(d, "GPS", 18);
    location.add("Map datum", datum, "The map system the coordinates use. WGS-84 is the usual one.");
  }

  const present = (x: unknown) => x !== undefined && x !== "";
  const privacy = [
    { id: "gps", label: "Where it was taken (GPS)", present: !!gps, detail: gps ? `${gps.lat}, ${gps.lon}` : "" },
    { id: "serial", label: "Camera or lens serial number", present: present(exifText(d, "Exif", 0xa431)) || present(exifText(d, "Exif", 0xa435)), detail: exifText(d, "Exif", 0xa431) || exifText(d, "Exif", 0xa435) },
    { id: "owner", label: "Owner or author name", present: present(exifText(d, "Exif", 0xa430)) || present(exifText(d, "IFD0", 0x13b)), detail: exifText(d, "Exif", 0xa430) || exifText(d, "IFD0", 0x13b) },
    { id: "software", label: "Program used", present: present(exifText(d, "IFD0", 0x131)), detail: exifText(d, "IFD0", 0x131) },
    { id: "dates", label: "Date and time it was taken", present: present(dateRaw), detail: taken },
    { id: "thumbnail", label: "Hidden thumbnail picture", present: d.hasThumbnail, detail: "" },
    { id: "maker", label: "Camera maker's private notes", present: d.hasMakerNote, detail: "" },
    { id: "xmp", label: "Embedded XMP details", present: !!extras.xmp, detail: "" },
    { id: "iptc", label: "Embedded IPTC details", present: !!extras.iptc, detail: "" },
  ];
  const photo: PhotoSummary = { camera: cam, taken, iso: iso !== null ? `ISO ${iso}` : "", aperture: f !== null ? `f/${trimNum(f)}` : "", shutter: exposure, focal: focal !== null ? `${trimNum(focal)} mm` : "" };
  return { camera, image, location, gps, photo, privacy, orientation: orient };
}
