/**
 * Finding the helper programs, asking them what they can do, and explaining their failures in plain words.
 * (Making the conversion jobs is `fmConvert.ts`; the catalog, install plans and command building are `fmTools.ts`
 * and the `fmConv*` files.)
 */
import { statSync } from "fs";
import type { FmContext } from "./fmCore";
import { lastLines } from "./fmJobs";
import {
  PDF_ENGINES, TOOLS, TOOL_IDS, childEnv, ffmpegCapabilities, findExecutable, imageMagickCapabilities, imageMagickReadable, installPlan, searchDirs, tesseractCapabilities,
  type InstallPlan, type ManagerId, type Managers, type ToolId,
} from "./fmTools";

export async function capture(argv: string[], env: Record<string, string>, timeoutMs = 8000): Promise<{ code: number | null; text: string }> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env });
  } catch {
    return { code: null, text: "" };
  }
  // A program that ignores SIGTERM, or one that left a child holding the pipes open, must not keep us waiting: after the
  // time limit it is killed for good, and the answer is given up on shortly after.
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let giveUp: (() => void) | undefined;
  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
    hardTimer = setTimeout(() => {
      try { proc.kill(9); } catch {}
      giveUp?.();
    }, 500);
  }, timeoutMs);
  const abandoned = new Promise<{ code: number | null; text: string }>((resolve) => { giveUp = () => resolve({ code: null, text: "" }); });
  const finished = (async () => {
    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, text: out + (err ? `\n${err}` : "") };
    } catch {
      return { code: null, text: "" };
    }
  })();
  try {
    return await Promise.race([finished, abandoned]);
  } finally {
    clearTimeout(timer);
    clearTimeout(hardTimer);
  }
}

const MANAGER_PROGRAMS: Record<ManagerId, string[]> = { brew: ["brew"], winget: ["winget"], scoop: ["scoop"], choco: ["choco"], apt: ["apt-get"], dnf: ["dnf"], pacman: ["pacman"] };

export function detectManagers(ctx: FmContext): Managers {
  const dirs = searchDirs(ctx);
  const found: Managers = {};
  for (const [id, names] of Object.entries(MANAGER_PROGRAMS) as Array<[ManagerId, string[]]>) {
    const p = findExecutable(ctx.platform, names, dirs);
    if (p) found[id] = id === "apt" ? p.replace(/apt-get(\.exe)?$/, "apt") : p;
  }
  return found;
}

/** The program for a tool (or one named program of it), or null. ImageMagick 6 calls itself `convert`, which on Windows is something else, so it is only tried elsewhere. */
export function resolveTool(ctx: FmContext, tool: ToolId, program?: string): string | null {
  const dirs = searchDirs(ctx);
  const names = (program ? [program] : TOOLS[tool].executables).filter((n) => !(ctx.platform === "win32" && tool === "imagemagick" && n === "convert"));
  return findExecutable(ctx.platform, names, dirs);
}

export interface ToolStatus {
  id: ToolId;
  name: string;
  what: string;
  website: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  capabilities: string[];
  /** False when the program could not be asked what it can do; nothing is then reported as missing. */
  capabilitiesKnown: boolean;
  plan: InstallPlan;
  /** Only some extras need it, so the window shows it after the main three. */
  optional: boolean;
}

function parseVersion(text: string): string | null {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return /(\d+\.\d+(?:\.\d+)*[\w.+-]*)/.exec(first)?.[1] ?? null;
}

// What a program says about itself rarely changes, and asking takes a moment, so answers are kept until the file changes.
const versionCache = new Map<string, { code: number | null; text: string }>();
const capabilityCache = new Map<string, string[]>();

function fileKey(path: string): string {
  try {
    return `${path}|${statSync(path).mtimeMs}`;
  } catch {
    return path;
  }
}

async function probe(ctx: FmContext, id: ToolId, managers: Managers): Promise<ToolStatus> {
  const def = TOOLS[id];
  const env = childEnv(ctx);
  const plan = installPlan(ctx.platform, id, managers);
  const base: ToolStatus = { id, name: def.name, what: def.what, website: def.website, installed: false, path: null, version: null, capabilities: [], capabilitiesKnown: false, plan, optional: !!def.optional };
  const path = resolveTool(ctx, id);
  if (!path) return base;
  const key = fileKey(path);
  let v = versionCache.get(key);
  if (!v) {
    v = await capture([path, ...def.versionArgs], env, 15000);
    if (v.code !== null) versionCache.set(key, v);
  }
  if (v.code !== 0 && !v.text.trim()) return base;
  // A program with the same name might be something else ("convert" on old systems, "tar" that isn't bsdtar).
  if (def.versionMatch && !def.versionMatch.test(v.text)) return base;
  const caps = await capabilitiesOf(ctx, id, path, env, v.text);
  return { ...base, installed: true, path, version: parseVersion(v.text), capabilities: caps ?? [], capabilitiesKnown: caps !== null };
}

async function capabilitiesOf(ctx: FmContext, id: ToolId, path: string, env: Record<string, string>, versionText: string): Promise<string[] | null> {
  if (id === "tesseract") {
    const asked = await capture([path, "--list-langs"], env, 15000);
    return asked.code === 0 && asked.text.trim() ? tesseractCapabilities(asked.text) : null;
  }
  if (!["ffmpeg", "imagemagick", "pandoc", "fonttools"].includes(id)) return [];
  const key = `${id}|${fileKey(path)}`;
  const cached = id === "pandoc" ? undefined : capabilityCache.get(key);
  if (cached) return cached;
  let caps: string[] | null;
  if (id === "pandoc") {
    caps = pdfEngineFor(ctx) ? ["pdfengine"] : [];
    const cacheKey = `${key}|formats`;
    let formats = capabilityCache.get(cacheKey);
    if (!formats) {
      const [i, o] = await Promise.all([capture([path, "--list-input-formats"], env, 15000), capture([path, "--list-output-formats"], env, 15000)]);
      const list = (text: string, prefix: string) => (text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[a-z0-9_+-]+$/.test(l)).map((l) => `${prefix}-${l}`));
      formats = [...(i.code === 0 ? list(i.text, "reader") : []), ...(o.code === 0 ? list(o.text, "writer") : [])];
      capabilityCache.set(cacheKey, formats);
    }
    caps = [...caps, ...formats];
    return caps;
  }
  if (id === "ffmpeg") {
    const asked = await capture([path, "-hide_banner", "-encoders"], env, 30000);
    caps = asked.code !== 0 || !asked.text.trim() ? null : ffmpegCapabilities(asked.text, versionText);
  } else if (id === "imagemagick") {
    const asked = await capture([path, "-list", "format"], env, 30000);
    caps = asked.code !== 0 || !asked.text.trim() ? null : [...imageMagickCapabilities(asked.text), ...imageMagickReadable(asked.text)];
  } else {
    // fontTools makes WOFF2 only when the Brotli add-on is there; asking for a file that doesn't exist shows which error comes first.
    const asked = await capture([path, "ttLib.woff2", "compress", "/nonexistent-file-manager-probe.ttf"], env, 20000);
    caps = asked.text.trim() ? (/brotli/i.test(asked.text) ? [] : ["woff2"]) : null;
  }
  if (caps) capabilityCache.set(key, caps);
  return caps;
}

export function pdfEngineFor(ctx: FmContext): string | null {
  const dirs = searchDirs(ctx);
  for (const e of PDF_ENGINES) if (findExecutable(ctx.platform, [e], dirs)) return e;
  return null;
}

export async function toolStatus(ctx: FmContext): Promise<{ platform: string; managers: Managers; tools: ToolStatus[] }> {
  const managers = detectManagers(ctx);
  const tools = await Promise.all(TOOL_IDS.map((id) => probe(ctx, id, managers)));
  return { platform: ctx.platform, managers, tools };
}

export function explainFailure(tool: ToolId | "builtin", text: string, code: number | null): string {
  const t = text.replace(/\r/g, "\n");
  const generic = lastLines(t, 2) || `It stopped with an error (code ${code}).`;
  if (/No space left on device|disk is full|ENOSPC/i.test(t)) return "The disk is full.";
  if (/Permission denied|Access is denied|EACCES/i.test(t)) return "No permission to write in this folder.";
  if (tool === "ffmpeg") {
    if (/Unknown encoder|Encoder .* not found|Automatic encoder selection failed/i.test(t)) return `This ffmpeg can't make that format. The "ffmpeg-full" build can.`;
    if (/moov atom not found|Invalid data found|could not find codec parameters/i.test(t)) return "ffmpeg can't read this file. It may be damaged, unfinished, or not really a video.";
    if (/Stream map .* matches no streams|Output file does not contain any stream|Subtitle|matches no streams/i.test(t)) return "The file doesn't have what this needs (for example no subtitles, or no sound).";
    if (/No such filter|Filter .* not found|Error initializing filter/i.test(t)) return `This ffmpeg is missing a part this needs. The "ffmpeg-full" build has everything.`;
    if (/No such file or directory/i.test(t)) return "The file could not be found. Was it moved?";
  }
  if (tool === "imagemagick") {
    if (/no decode delegate|NoDecodeDelegateForThisImageFormat/i.test(t)) return `ImageMagick can't read this kind of picture. The "imagemagick-full" build reads more formats (for example HEIC).`;
    if (/no encode delegate|NoEncodeDelegateForThisImageFormat/i.test(t)) return `ImageMagick can't write that format. The "imagemagick-full" build writes more.`;
    if (/not authorized|policy/i.test(t)) return "ImageMagick's security policy blocks this format. Its policy.xml file can allow it.";
    if (/unable to open image|no such file/i.test(t)) return "The picture could not be opened. It may be damaged.";
    if (/gs|ghostscript|FailedToExecuteCommand/i.test(t) && /pdf|ps|eps/i.test(t)) return "ImageMagick needs Ghostscript to read PDF files. Install Ghostscript below.";
  }
  if (tool === "pandoc") {
    if (/Unknown (reader|writer)/i.test(t)) return "pandoc doesn't know that file format.";
    if (/pdflatex|xelatex|lualatex|typst|pdf-engine|not found/i.test(t) && /pdf/i.test(t)) return "pandoc needs a PDF engine such as Typst or LaTeX to make a PDF.";
    if (/invalid byte sequence|UTF-8|hGetContents/i.test(t)) return "This file isn't plain text that pandoc can read (it is not UTF-8).";
  }
  if (tool === "ghostscript") {
    if (/password|encrypted/i.test(t)) return "This PDF is protected by a password, so it can't be changed here.";
    if (/Error: \/syntaxerror|Error: \/undefined|Unrecoverable error|Can't find .*PDF|not a PDF|No pages will be processed/i.test(t)) return "Ghostscript can't read this file. It may be damaged, or not really a PDF.";
    if (/Requested page.*out of range|No pages/i.test(t)) return "That page range has no pages in this PDF.";
  }
  if (tool === "qpdf") {
    if (/invalid password|password/i.test(t)) return "This PDF is protected by a password, so it can't be changed here.";
    if (/can't find PDF header|not a PDF|unable to find trailer|file is damaged/i.test(t)) return "qpdf can't read this file. It may be damaged, or not really a PDF.";
    if (/page range|invalid page|out of range/i.test(t)) return "That page range doesn't fit this PDF.";
  }
  if (tool === "libreoffice") {
    if (/Error: source file could not be loaded|source file could not be loaded|Could not open/i.test(t)) return "LibreOffice can't open this file. It may be damaged or protected by a password.";
    if (/SIGKILL|crash|terminated/i.test(t)) return "LibreOffice stopped while converting. Close other LibreOffice windows and try again.";
  }
  if (tool === "tesseract") {
    if (/Failed loading language|Error opening data file|Could not initialize tesseract/i.test(t)) return "Tesseract doesn't have that language installed. Install its language pack (tesseract-lang).";
    if (/Image too|Cannot open|Error in pixRead|Unsupported image/i.test(t)) return "Tesseract can't read this picture.";
  }
  if (tool === "calibre") {
    if (/DRMError|DRM/i.test(t)) return "This e-book is copy-protected (DRM), so it can't be converted.";
    if (/Conversion error|No plugin|cannot convert/i.test(t)) return "calibre can't convert this kind of file.";
  }
  if (tool === "fonttools" || tool === "woff2") {
    if (/brotli/i.test(t)) return "Making WOFF2 needs the Brotli add-on for fontTools (pip install brotli), or the woff2 program.";
    if (/TTLibError|not a valid|bad magic|invalid/i.test(t)) return "This doesn't look like a valid font file.";
  }
  if (tool === "sevenzip" || tool === "unar" || tool === "bsdtar") {
    if (/password|encrypted|wrong password/i.test(t)) return "This archive is protected by a password, which isn't supported here.";
    if (/Can not open|Unrecognized archive|not an archive|Couldn't recognize|not a valid|Unsupported|Cannot find archive|format/i.test(t)) return "This program can't open this archive. It may be damaged or an unsupported kind.";
  }
  return generic;
}
