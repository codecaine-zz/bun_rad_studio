/** `info/image`, `info/save` and `info/openmap`: the picture report, saving a report next to the file, and the map link. */
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, pathApi, type FmContext } from "./fmCore";
import { fileSource, helperProgram, installHint, openForRead, pushGroup, regularFile, writeNewFile, type InfoGroup } from "./fmInfoCommon";
import { summarizeExif, type ExifData, type ExifReport, type Gps, type PhotoSummary } from "./fmInfoExif";
import { analyzeImage, commonImageRows } from "./fmInfoImage";
import { iccRows, xmpRows } from "./fmInfoMeta";
import { openCommand } from "./fmOpen";
import { FmError, extensionOf } from "./fmPaths";

export interface PrivacyItem {
  id: string;
  label: string;
  present: boolean;
  detail: string;
}

export interface ImageResult {
  format: string;
  kind: string;
  width: number | null;
  height: number | null;
  animated: boolean;
  hasAlpha: boolean | null;
  groups: InfoGroup[];
  gps: Gps | null;
  photo: (PhotoSummary & { size: string }) | null;
  privacy: PrivacyItem[];
  canStrip: boolean;
  helper: { exiftool: boolean; hint: string };
  partial: boolean;
  notes: string[];
}

const NO_EXIF: ExifData = { littleEndian: false, tags: [], partial: false, hasThumbnail: false, hasMakerNote: false, makerNoteBytes: 0 };

export async function imageInfo(ctx: FmContext, input: unknown): Promise<ImageResult> {
  const t = await regularFile(ctx, input);
  const path = absolutePath(ctx, input);
  const handle = await openForRead(path);
  let a;
  try {
    a = await analyzeImage(fileSource(handle, t.lst.size), extensionOf(path));
  } finally {
    await handle.close();
  }
  if (!a) throw new FmError("NOT_AN_IMAGE", "This doesn't look like a picture the built-in reader knows. Install ExifTool to read more kinds.");
  const report: ExifReport = summarizeExif(a.exif ?? NO_EXIF, { xmp: !!a.xmp, iptc: a.hasIptc });
  const groups: InfoGroup[] = [];
  const image = commonImageRows(a);
  for (const row of report.image.rows) if (!image.rows.some((r) => r.label === row.label)) image.rows.push(row);
  pushGroup(groups, image.group("image", "Image", "The picture itself: its size, colors and how it is stored."));
  pushGroup(groups, report.camera.group("camera", "Camera and shot", "What the camera recorded when the picture was taken."));
  pushGroup(groups, report.location.group("location", "Location", "Where the picture was taken. This is private information."));
  pushGroup(groups, iccRows(a.icc).group("colour", "Color profile", "How the colors should be shown."));
  pushGroup(groups, xmpRows(a.xmp).group("xmp", "Extra notes (XMP)", "A second place where programs keep notes about the picture."));
  for (const g of a.groups) groups.push(g);

  const privacy: PrivacyItem[] = report.privacy.map((p) => ({ ...p }));
  const gpsItem = privacy.find((p) => p.id === "gps")!;
  if (!gpsItem.present && a.xmp?.hasGps) {
    gpsItem.present = true;
    gpsItem.detail = "stored in the XMP notes";
  }
  if (a.textNotes > 0) privacy.push({ id: "text", label: "Text notes inside the file", present: true, detail: `${a.textNotes} note${a.textNotes === 1 ? "" : "s"}` });
  const hasFacts = !!(report.photo.camera || report.photo.taken || report.photo.iso || report.photo.aperture || report.photo.shutter);
  const exiftool = !!helperProgram(ctx, "exiftool");
  const notes = [...a.notes];
  if (!exiftool) notes.push(installHint(ctx.platform, "exiftool"));
  return {
    format: a.label, kind: a.kind, width: a.width, height: a.height, animated: a.animated, hasAlpha: a.hasAlpha, groups, gps: report.gps,
    photo: hasFacts ? { ...report.photo, size: a.width && a.height ? `${a.width} × ${a.height}` : "" } : null,
    privacy, canStrip: a.kind === "jpeg" || a.kind === "png" || a.kind === "webp", helper: { exiftool, hint: exiftool ? "" : installHint(ctx.platform, "exiftool") }, partial: a.partial, notes,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Saving a report
// ---------------------------------------------------------------------------------------------------------------

const MAX_REPORT = 900 * 1024;

/** Saves the text of a report as `<name>.info.json`, `.info.txt` or `.info.md` next to the file. Nothing is overwritten. */
export async function saveReport(ctx: FmContext, input: unknown, format: unknown, content: unknown): Promise<{ path: string; name: string }> {
  const path = absolutePath(ctx, input);
  if (format !== "json" && format !== "txt" && format !== "md") throw new FmError("BAD_REQUEST", "Choose JSON, text or Markdown.");
  if (typeof content !== "string" || !content.trim()) throw new FmError("BAD_REQUEST", "There is nothing to save yet.");
  if (content.length > MAX_REPORT) throw new FmError("TOO_LARGE", "That report is too large to save.");
  const p = pathApi(ctx);
  try {
    await fsp.lstat(path);
  } catch {
    throw new FmError("NOT_FOUND", "That item doesn't exist any more.");
  }
  const folder = p.dirname(path);
  assertCreatable(ctx, folder);
  return writeNewFile(ctx, folder, `${p.basename(path)}.info.${format}`, content);
}

// ---------------------------------------------------------------------------------------------------------------
// Map link
// ---------------------------------------------------------------------------------------------------------------

/** The map address is built here from two numbers; the page never supplies a web address. */
export function mapUrl(lat: unknown, lon: unknown): string {
  const la = typeof lat === "number" ? lat : NaN, lo = typeof lon === "number" ? lon : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new FmError("BAD_REQUEST", "Those coordinates aren't valid.");
  const a = la.toFixed(6), b = lo.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=16/${a}/${b}`;
}

export async function openMap(ctx: FmContext, body: Record<string, any>): Promise<{ opened: string }> {
  if (body.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Opening the map sends this location to openstreetmap.org. Please confirm.");
  const url = mapUrl(body.lat, body.lon);
  const cmd = openCommand(ctx.platform, url);
  try {
    await ctx.launch(cmd.command, cmd.args);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NO_OPENER", ctx.platform === "linux" ? "Opening a web page needs the 'xdg-open' program (package 'xdg-utils')." : `Couldn't start "${cmd.command}" to open that.`);
    throw new FmError("OPEN_FAILED", "Couldn't open the web page.");
  }
  return { opened: url };
}
