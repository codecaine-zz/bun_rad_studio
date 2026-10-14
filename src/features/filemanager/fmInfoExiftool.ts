/** "Show everything": every tag ExifTool can read, grouped by where it lives in the file. ExifTool is optional. */
import { absolutePath, type FmContext } from "./fmCore";
import { clip, helperEnv, helperProgram, installHint, MAX_ROWS, regularFile, runProgram, type InfoGroup } from "./fmInfoCommon";

export interface ExiftoolResult {
  available: boolean;
  hint: string;
  groups: InfoGroup[];
  truncated: boolean;
  tags: number;
}

const GROUP_HINTS: Record<string, string> = {
  IFD0: "The main list of camera notes (EXIF).", ExifIFD: "Shooting details: exposure, ISO, lens.", GPS: "Where the picture was taken.", XMP: "Extra text notes (XMP).",
  ICC_Profile: "The colour profile.", File: "Facts about the file itself.", System: "Facts the file system keeps.", Composite: "Values ExifTool works out by combining other tags.",
  MakerNotes: "Private notes of the camera brand.", IPTC: "News-agency style notes (caption, keywords, credit).", PNG: "PNG header and text notes.", JFIF: "JPEG file header details.",
  QuickTime: "Movie and phone-video details.", PDF: "PDF document details.", ThumbnailIFD: "The small preview picture stored inside.",
};

function show(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return clip(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", "));
  if (typeof v === "object") return clip(JSON.stringify(v));
  return clip(String(v));
}

export function groupExiftoolJson(json: unknown): { groups: InfoGroup[]; tags: number; truncated: boolean } {
  const obj = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined) : undefined;
  const byGroup = new Map<string, Array<{ label: string; value: string }>>();
  let tags = 0;
  let truncated = false;
  for (const [key, raw] of Object.entries(obj ?? {})) {
    if (key === "SourceFile" || key.startsWith("ExifTool:")) continue;
    if (tags >= MAX_ROWS) { truncated = true; break; }
    const colon = key.indexOf(":");
    const group = colon > 0 ? key.slice(0, colon) : "Other";
    const name = colon > 0 ? key.slice(colon + 1) : key;
    const value = show(raw);
    if (!value) continue;
    const list = byGroup.get(group) ?? [];
    list.push({ label: clip(name, 120), value });
    byGroup.set(group, list);
    tags++;
  }
  const order = ["File", "System"];
  const groups = [...byGroup].sort(([a], [b]) => (order.includes(a) ? 1 : 0) - (order.includes(b) ? 1 : 0) || a.localeCompare(b)).map(([g, rows]): InfoGroup => {
    const family = g.split("-")[0]!.replace(/\d+$/, "");
    return { id: `exiftool-${g}`, title: g, rows, ...(GROUP_HINTS[g] ?? GROUP_HINTS[family] ? { hint: GROUP_HINTS[g] ?? GROUP_HINTS[family] } : {}) };
  });
  return { groups, tags, truncated };
}

export async function exiftoolInfo(ctx: FmContext, input: unknown): Promise<ExiftoolResult> {
  const t = await regularFile(ctx, input);
  const path = absolutePath(ctx, input);
  const bin = helperProgram(ctx, "exiftool");
  if (!bin) return { available: false, hint: installHint(ctx.platform, "exiftool"), groups: [], truncated: false, tags: 0 };
  // ExifTool treats a name ending in "|" as a command to run, so such a name is never handed to it.
  if (path.endsWith("|") || t.lst.size === 0) return { available: true, hint: "ExifTool was not asked about this file.", groups: [], truncated: false, tags: 0 };
  // The path is absolute (so it cannot look like an option), and "--" ends the options anyway. No argument file is ever used.
  const args = [bin, "-json", "-G1", "-a", "-s", "-m", ...(/[^\x20-\x7e]/.test(path) ? ["-charset", "filename=utf8"] : []), "--", path];
  const r = await runProgram(args, helperEnv(ctx), { timeoutMs: 9000, maxBytes: 4 * 1024 * 1024 });
  if (r.failedToStart || r.timedOut) return { available: true, hint: r.timedOut ? "ExifTool took too long, so it was stopped." : "ExifTool could not be started.", groups: [], truncated: false, tags: 0 };
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  const g = groupExiftoolJson(json);
  return { available: true, hint: g.tags ? "" : "ExifTool found nothing to show for this file.", groups: g.groups, truncated: g.truncated || r.truncated, tags: g.tags };
}
