/**
 * Helper programs the File Manager can use for batch work on selected files: ffmpeg (video and sound), ImageMagick
 * (pictures) and pandoc (documents).
 *
 * This module only knows facts and builds commands; it never runs a shell. Everything here is plain data or a pure
 * function, so it is tested without the real programs. Running the commands is `fmJobs.ts`.
 *
 * Why detection looks in more places than PATH: the Homebrew "full" builds (`ffmpeg-full`, `imagemagick-full`) are
 * keg-only, so Homebrew does not link them into its `bin` folder, and a window started from Finder, the Dock or a
 * launcher does not get the PATH a terminal profile sets up. Without the extra folders the tools would show as
 * "not installed" while working fine in a terminal.
 */
import { readdirSync, statSync } from "fs";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { splitName, uniqueName } from "./fmPaths";

export type ToolId = "ffmpeg" | "imagemagick" | "pandoc";
export type ManagerId = "brew" | "winget" | "scoop" | "choco" | "apt" | "dnf" | "pacman";

export interface ToolDef {
  id: ToolId;
  name: string;
  /** One plain sentence about what it is for. */
  what: string;
  /** Program names to look for, best first. */
  executables: string[];
  versionArgs: string[];
  website: string;
  brew: string;
  winget: string;
  scoop: string;
  choco: string;
  apt: string;
  dnf: string;
  pacman: string;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  ffmpeg: {
    id: "ffmpeg", name: "ffmpeg", what: "Converts video and sound files (MP4, MP3, GIF and many more).",
    executables: ["ffmpeg"], versionArgs: ["-version"], website: "https://ffmpeg.org/download.html",
    brew: "ffmpeg-full", winget: "Gyan.FFmpeg", scoop: "ffmpeg", choco: "ffmpeg", apt: "ffmpeg", dnf: "ffmpeg-free", pacman: "ffmpeg",
  },
  imagemagick: {
    id: "imagemagick", name: "ImageMagick", what: "Converts, resizes and rotates pictures.",
    executables: ["magick", "convert"], versionArgs: ["-version"], website: "https://imagemagick.org/script/download.php",
    brew: "imagemagick-full", winget: "ImageMagick.ImageMagick", scoop: "imagemagick", choco: "imagemagick", apt: "imagemagick", dnf: "ImageMagick", pacman: "imagemagick",
  },
  pandoc: {
    id: "pandoc", name: "pandoc", what: "Converts documents (Markdown, Word, HTML, EPUB, PDF and more).",
    executables: ["pandoc"], versionArgs: ["--version"], website: "https://pandoc.org/installing.html",
    brew: "pandoc", winget: "JohnMacFarlane.Pandoc", scoop: "pandoc", choco: "pandoc", apt: "pandoc", dnf: "pandoc", pacman: "pandoc-cli",
  },
};

export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

// ---------------------------------------------------------------------------------------------------------------
// Finding programs
// ---------------------------------------------------------------------------------------------------------------

function listDirs(parent: string, startsWith: string): string[] {
  try {
    return readdirSync(parent).filter((n) => n.toLowerCase().startsWith(startsWith.toLowerCase())).map((n) => nodePath.join(parent, n));
  } catch {
    return [];
  }
}

/** Every folder worth looking in, in order: the PATH first, then the places package managers install to. */
export function searchDirs(ctx: Pick<FmContext, "platform" | "home" | "toolDirs">, env: Record<string, string | undefined> = process.env): string[] {
  if (ctx.toolDirs) return [...ctx.toolDirs];
  const sep = ctx.platform === "win32" ? ";" : ":";
  const fromPath = (env.PATH ?? env.Path ?? "").split(sep).filter(Boolean);
  const dirs: string[] = [...fromPath];
  const optBins = (prefix: string) => TOOL_IDS.map((id) => `${prefix}/opt/${TOOLS[id].brew}/bin`);
  if (ctx.platform === "darwin") {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin", ...optBins("/opt/homebrew"), ...optBins("/usr/local"), "/opt/local/bin");
  } else if (ctx.platform === "linux") {
    const lb = "/home/linuxbrew/.linuxbrew";
    dirs.push(`${lb}/bin`, ...optBins(lb), `${ctx.home}/.linuxbrew/bin`, "/usr/local/bin", "/usr/bin", "/snap/bin", `${ctx.home}/.local/bin`);
  } else {
    const local = env.LOCALAPPDATA ?? nodePath.win32.join(ctx.home, "AppData", "Local");
    const programFiles = env.ProgramFiles ?? "C:\\Program Files";
    dirs.push(
      nodePath.win32.join(local, "Microsoft", "WinGet", "Links"),
      nodePath.win32.join(ctx.home, "scoop", "shims"),
      "C:\\ProgramData\\chocolatey\\bin",
      nodePath.win32.join(local, "Pandoc"),
      nodePath.win32.join(programFiles, "Pandoc"),
      "C:\\ffmpeg\\bin",
      ...listDirs(programFiles, "ImageMagick"),
    );
  }
  return [...new Set(dirs)];
}

function isRunnable(file: string, platform: FmContext["platform"]): boolean {
  try {
    const st = statSync(file);
    return st.isFile() && (platform === "win32" || (st.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

/** The first program with one of these names in these folders, or null. */
export function findExecutable(platform: FmContext["platform"], names: string[], dirs: string[]): string | null {
  const exts = platform === "win32" ? [".exe", ".cmd", ".bat", ".com"] : [""];
  const p = platform === "win32" ? nodePath.win32 : nodePath.posix;
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = p.join(dir, name + ext);
        if (isRunnable(candidate, platform)) return candidate;
      }
    }
  }
  return null;
}

/** The PATH a helper program is started with: the places we searched, then the usual PATH. */
export function childEnv(ctx: Pick<FmContext, "platform" | "home" | "toolDirs">, base: Record<string, string | undefined> = process.env): Record<string, string> {
  const sep = ctx.platform === "win32" ? ";" : ":";
  const pathKey = ctx.platform === "win32" ? "Path" : "PATH";
  const dirs = searchDirs(ctx, base);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && k.toUpperCase() !== "PATH") env[k] = v;
  env[pathKey] = dirs.join(sep);
  env.HOMEBREW_NO_ENV_HINTS = "1";
  env.NONINTERACTIVE = "1";
  return env;
}

// ---------------------------------------------------------------------------------------------------------------
// What each file type can be turned into
// ---------------------------------------------------------------------------------------------------------------

const IMAGE_IN = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico", "svg"]);
const VIDEO_IN = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv", "mpg", "mpeg", "3gp", "ts"]);
const AUDIO_IN = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "aif"]);
const DOC_IN = new Set(["md", "markdown", "txt", "html", "htm", "docx", "odt", "rtf", "epub", "tex", "rst", "org", "textile"]);

export type ActionGroup = "Pictures" | "Video" | "Sound" | "Documents";

export interface ActionDef {
  id: string;
  label: string;
  hint: string;
  group: ActionGroup;
  tool: ToolId;
  inputs: Set<string>;
  /** Extension of the new file, without the dot. */
  out: string;
  /** Used in the new file's name when it would otherwise have the same extension: "photo (smaller).jpg". */
  suffix: string;
  /** A capability the installed program must have (see `capabilitiesOf`). */
  needs?: string;
  /** One output for all the selected files together. */
  combine?: boolean;
  /** Arguments between the input and the output. */
  args: string[];
  /** Where an input goes (ffmpeg and pandoc differ from ImageMagick). */
  inputPrefix?: string[];
}

const imageAction = (id: string, label: string, hint: string, out: string, suffix: string, args: string[], extra: Partial<ActionDef> = {}): ActionDef => ({ id, label, hint, group: "Pictures", tool: "imagemagick", inputs: IMAGE_IN, out, suffix, args, ...extra });
const videoAction = (id: string, label: string, hint: string, out: string, suffix: string, args: string[], extra: Partial<ActionDef> = {}): ActionDef => ({ id, label, hint, group: "Video", tool: "ffmpeg", inputs: VIDEO_IN, out, suffix, args, ...extra });
const soundAction = (id: string, label: string, hint: string, out: string, suffix: string, args: string[], extra: Partial<ActionDef> = {}): ActionDef => ({ id, label, hint, group: "Sound", tool: "ffmpeg", inputs: AUDIO_IN, out, suffix, args, ...extra });
const docAction = (id: string, label: string, hint: string, out: string, args: string[], extra: Partial<ActionDef> = {}): ActionDef => ({ id, label, hint, group: "Documents", tool: "pandoc", inputs: DOC_IN, out, suffix: "converted", args, ...extra });

const FIRST_FRAME_ONLY = ["-delete", "1--1"];
const FLATTEN_WHITE = ["-background", "white", "-alpha", "remove", "-alpha", "off"];
const FIT = (px: number) => ["-resize", `${px}x${px}>`];

/** Every action, in the order the dialog lists them. */
export const ACTIONS: ActionDef[] = [
  imageAction("img-jpg", "Convert to JPG", "The most common picture format; small files.", "jpg", "converted", [...FIRST_FRAME_ONLY, "-auto-orient", ...FLATTEN_WHITE, "-quality", "90"], { needs: "jpeg" }),
  imageAction("img-png", "Convert to PNG", "Sharp pictures that keep see-through areas.", "png", "converted", [...FIRST_FRAME_ONLY, "-auto-orient"], { needs: "png" }),
  imageAction("img-webp", "Convert to WebP", "Small pictures for websites.", "webp", "converted", [...FIRST_FRAME_ONLY, "-auto-orient", "-quality", "85"], { needs: "webp" }),
  imageAction("img-pdf", "Make a PDF (one for each picture)", "Each picture becomes its own PDF.", "pdf", "converted", [...FIRST_FRAME_ONLY, "-auto-orient"], { needs: "pdf" }),
  imageAction("img-combine-pdf", "Combine into one PDF", "All the selected pictures, in name order, become pages of one PDF.", "pdf", "combined", ["-auto-orient"], { needs: "pdf", combine: true }),
  imageAction("img-ico", "Make an icon (.ico)", "A Windows icon with the usual sizes.", "ico", "icon", [...FIRST_FRAME_ONLY, "-define", "icon:auto-resize=256,128,64,48,32,16"], { needs: "ico" }),
  imageAction("img-half", "Half the size (50%)", "Pictures with a quarter of the pixels.", "", "half size", [...FIRST_FRAME_ONLY, "-auto-orient", "-resize", "50%"]),
  imageAction("img-quarter", "Quarter the size (25%)", "Small thumbnails.", "", "quarter size", [...FIRST_FRAME_ONLY, "-auto-orient", "-resize", "25%"]),
  imageAction("img-fit-1920", "Fit within 1920 px", "Good for a full-screen picture on the web. Smaller pictures stay as they are.", "", "1920 px", [...FIRST_FRAME_ONLY, "-auto-orient", ...FIT(1920)]),
  imageAction("img-fit-1280", "Fit within 1280 px", "Good for email.", "", "1280 px", [...FIRST_FRAME_ONLY, "-auto-orient", ...FIT(1280)]),
  imageAction("img-fit-800", "Fit within 800 px", "Small enough for a chat message.", "", "800 px", [...FIRST_FRAME_ONLY, "-auto-orient", ...FIT(800)]),
  imageAction("img-rot-right", "Rotate right", "Turn the picture a quarter turn clockwise.", "", "rotated", [...FIRST_FRAME_ONLY, "-rotate", "90"]),
  imageAction("img-rot-left", "Rotate left", "Turn the picture a quarter turn the other way.", "", "rotated", [...FIRST_FRAME_ONLY, "-rotate", "270"]),
  imageAction("img-gray", "Black and white", "Remove the colour.", "", "black and white", [...FIRST_FRAME_ONLY, "-auto-orient", "-colorspace", "Gray"]),
  imageAction("img-strip", "Remove location and camera info", "A copy without the hidden details (where and when it was taken, the camera).", "", "private", [...FIRST_FRAME_ONLY, "-auto-orient", "-strip"]),

  videoAction("vid-mp4", "Convert to MP4", "Plays almost everywhere.", "mp4", "converted", ["-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"], { needs: "x264" }),
  videoAction("vid-small", "Make smaller for sharing", "A smaller MP4, at most 1280 pixels wide.", "mp4", "small", ["-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-crf", "28", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"], { needs: "x264" }),
  videoAction("vid-webm", "Convert to WebM", "For websites. This one is slow.", "webm", "converted", ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus"], { needs: "vp9" }),
  videoAction("vid-gif", "Make an animated GIF", "A short silent loop, 480 pixels wide.", "gif", "animation", ["-an", "-vf", "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse"]),
  videoAction("vid-mp3", "Save the sound as MP3", "Just the audio.", "mp3", "audio", ["-vn", "-c:a", "libmp3lame", "-q:a", "2"], { needs: "mp3" }),
  videoAction("vid-cover", "Save a cover picture", "One picture from the video, as PNG.", "png", "cover", ["-vf", "thumbnail", "-frames:v", "1"]),

  soundAction("aud-mp3", "Convert to MP3", "Plays everywhere.", "mp3", "converted", ["-vn", "-c:a", "libmp3lame", "-q:a", "2"], { needs: "mp3" }),
  soundAction("aud-m4a", "Convert to M4A (AAC)", "Good quality in a small file.", "m4a", "converted", ["-vn", "-c:a", "aac", "-b:a", "192k"]),
  soundAction("aud-wav", "Convert to WAV", "Uncompressed, for editing.", "wav", "converted", ["-vn", "-c:a", "pcm_s16le"]),
  soundAction("aud-flac", "Convert to FLAC", "Lossless but smaller than WAV.", "flac", "converted", ["-vn", "-c:a", "flac"]),

  docAction("doc-html", "Convert to a web page (HTML)", "One self-contained page.", "html", ["-s", "--embed-resources"]),
  docAction("doc-docx", "Convert to Word (DOCX)", "Opens in Word, Pages and Google Docs.", "docx", []),
  docAction("doc-odt", "Convert to OpenDocument (ODT)", "Opens in LibreOffice.", "odt", []),
  docAction("doc-md", "Convert to Markdown", "Plain text with simple marks.", "md", ["--wrap=none"]),
  docAction("doc-txt", "Convert to plain text", "Only the words.", "txt", ["--wrap=none"]),
  docAction("doc-epub", "Convert to an e-book (EPUB)", "For e-readers.", "epub", []),
  docAction("doc-pdf", "Convert to PDF", "Needs a PDF engine such as Typst or LaTeX.", "pdf", [], { needs: "pdfengine" }),
];

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** The lower-case extension of a file name without the dot. */
export function extOf(name: string): string {
  return splitName(name)[1].replace(/^\./, "").toLowerCase();
}

/** What the file's extension says a helper program could do with it (used to decide whether to offer the dialog). */
export function kindsFor(name: string): ActionGroup[] {
  const e = extOf(name);
  const kinds: ActionGroup[] = [];
  if (IMAGE_IN.has(e)) kinds.push("Pictures");
  if (VIDEO_IN.has(e)) kinds.push("Video");
  if (AUDIO_IN.has(e)) kinds.push("Sound");
  if (DOC_IN.has(e)) kinds.push("Documents");
  return kinds;
}

/** Can this action be applied to a file with this name? (Same-format document conversions make no sense.) */
export function actionAccepts(action: ActionDef, fileName: string): boolean {
  const e = extOf(fileName);
  if (!action.inputs.has(e)) return false;
  if (action.group === "Documents") return e !== action.out && !(action.out === "html" && e === "htm") && !(action.out === "md" && e === "markdown");
  if (action.id === "vid-mp3" || action.group === "Sound") return e !== action.out;
  return true;
}

/** Name of the new file, which never exists yet: "photo.png" -> "photo.jpg", or "photo (half size).png". */
export function outputName(action: ActionDef, inputName: string, exists: (candidate: string) => boolean): string {
  const [base, dotExt] = splitName(inputName);
  const ext = dotExt.replace(/^\./, "");
  const sameFormat = !action.out || action.out === ext.toLowerCase();
  const wanted = sameFormat ? `${base} (${action.suffix})${dotExt}` : `${base}.${action.out}`;
  return uniqueName(wanted, exists);
}

/** The arguments to start a helper program for one step. `input` is a list for combine actions. */
export function buildArgs(action: ActionDef, input: string | string[], output: string, extra: { pdfEngine?: string; title?: string } = {}): string[] {
  const inputs = Array.isArray(input) ? input : [input];
  if (action.tool === "ffmpeg") {
    return ["-nostdin", "-hide_banner", "-loglevel", "error", "-n", "-i", `file:${inputs[0]}`, ...action.args, `file:${output}`];
  }
  if (action.tool === "pandoc") {
    const args = [...inputs, ...action.args];
    if (action.out === "html") args.push("--metadata", `pagetitle=${extra.title ?? "Document"}`);
    if (action.out === "pdf" && extra.pdfEngine) args.push(`--pdf-engine=${extra.pdfEngine}`);
    return [...args, "-o", output];
  }
  return [...inputs, ...action.args, output];
}

// ---------------------------------------------------------------------------------------------------------------
// What the installed programs can do
// ---------------------------------------------------------------------------------------------------------------

/** Capability names found in `ffmpeg -encoders` output. */
export function ffmpegCapabilities(encoders: string): string[] {
  const caps: string[] = [];
  if (/\blibx264\b/.test(encoders)) caps.push("x264");
  if (/\blibvpx-vp9\b/.test(encoders)) caps.push("vp9");
  if (/\blibmp3lame\b/.test(encoders)) caps.push("mp3");
  return caps;
}

/** Capability names (formats it can write) found in `magick -list format` output. */
export function imageMagickCapabilities(formats: string): string[] {
  const writable = new Set<string>();
  for (const line of formats.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9]+)\*?\s+\S+\s+([r-][w-][+-])/i.exec(line);
    if (m && m[2]![1] === "w") writable.add(m[1]!.toUpperCase());
  }
  const caps: string[] = [];
  for (const [cap, format] of [["jpeg", "JPEG"], ["png", "PNG"], ["webp", "WEBP"], ["pdf", "PDF"], ["ico", "ICO"]] as const) if (writable.has(format)) caps.push(cap);
  return caps;
}

export const PDF_ENGINES = ["typst", "tectonic", "xelatex", "lualatex", "pdflatex", "wkhtmltopdf", "weasyprint"];

/** Why an action can't be used with the installed program, or null if it can. */
export function missingCapability(action: ActionDef, caps: string[], tool: ToolId): string | null {
  if (!action.needs || caps.includes(action.needs)) return null;
  if (action.needs === "pdfengine") return "Needs a PDF engine. Install Typst (brew install typst) or LaTeX, then reopen this window.";
  const full = tool === "ffmpeg" ? "ffmpeg-full" : tool === "imagemagick" ? "imagemagick-full" : TOOLS[tool].name;
  return `This ${TOOLS[tool].name} was built without that format. The "${full}" build has it.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Installing
// ---------------------------------------------------------------------------------------------------------------

export interface InstallPlan {
  tool: ToolId;
  method: ManagerId | null;
  /** The command, as a list (never a shell string); null when no package manager is available. */
  argv: string[] | null;
  /** The command as a person would type it. */
  display: string;
  /** Can the File Manager run it itself? False when it needs an administrator password. */
  auto: boolean;
  /** Short plain-language explanation shown under the command. */
  note: string;
  /** Set when the package manager itself is missing. */
  missingManager: null | { id: "brew" | "winget"; name: string; url: string; command: string; note: string };
}

export const HOMEBREW_INSTALL_COMMAND = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

export type Managers = Partial<Record<ManagerId, string>>;

export function packageOf(tool: ToolId, manager: ManagerId): string {
  return TOOLS[tool][manager];
}

/** The install command to offer for one tool, from the package managers that are present. */
export function installPlan(platform: FmContext["platform"], tool: ToolId, managers: Managers): InstallPlan {
  const base = { tool, method: null, argv: null, display: "", auto: false, note: "", missingManager: null } as InstallPlan;
  const def = TOOLS[tool];
  const display = (argv: string[]) => argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");

  if (managers.brew && (platform === "darwin" || platform === "linux")) {
    const argv = [managers.brew, "install", def.brew];
    const shown = ["brew", "install", def.brew];
    const full = def.brew.endsWith("-full") ? ` The "full" build includes every common format.` : "";
    return { ...base, method: "brew", argv, display: display(shown), auto: true, note: `Installs ${def.name} with Homebrew. No password is needed.${full}` };
  }
  if (platform === "win32") {
    if (managers.winget) {
      const argv = [managers.winget, "install", "--id", def.winget, "-e", "--accept-package-agreements", "--accept-source-agreements"];
      return { ...base, method: "winget", argv, display: display(["winget", "install", "--id", def.winget, "-e"]), auto: true, note: `Installs ${def.name} with winget (built into Windows 10 and 11). Windows may ask you to allow it.` };
    }
    if (managers.scoop) {
      const argv = [managers.scoop, "install", def.scoop];
      return { ...base, method: "scoop", argv, display: display(["scoop", "install", def.scoop]), auto: true, note: `Installs ${def.name} with Scoop.` };
    }
    if (managers.choco) {
      const argv = [managers.choco, "install", def.choco, "-y"];
      return { ...base, method: "choco", argv, display: display(["choco", "install", def.choco, "-y"]), auto: false, note: `Chocolatey needs an administrator window: open PowerShell as administrator and run this.` };
    }
    return { ...base, display: `winget install --id ${def.winget} -e`, note: "Windows 10 and 11 include winget (the App Installer from the Microsoft Store). Install or update it, then try again.", missingManager: { id: "winget", name: "winget", url: "https://learn.microsoft.com/windows/package-manager/winget/", command: `winget install --id ${def.winget} -e`, note: "Or download the program from its website." } };
  }
  if (platform === "linux") {
    const systemManagers: Array<[ManagerId, string[], string]> = [["apt", ["sudo", "apt", "install", "-y", def.apt], "apt"], ["dnf", ["sudo", "dnf", "install", "-y", def.dnf], "dnf"], ["pacman", ["sudo", "pacman", "-S", "--needed", "--noconfirm", def.pacman], "pacman"]];
    for (const [id, argv] of systemManagers) {
      if (managers[id]) return { ...base, method: id, argv, display: display(argv), auto: false, note: "Your system's package manager needs your administrator password, so run this in a terminal." };
    }
  }
  return {
    ...base,
    display: `brew install ${def.brew}`,
    note: "Homebrew is a free tool that installs programs like this with one command.",
    missingManager: { id: "brew", name: "Homebrew", url: "https://brew.sh", command: HOMEBREW_INSTALL_COMMAND, note: platform === "darwin" ? "Paste the command in the Terminal app. It asks for your password once. Then come back and press Check again." : "Paste the command in a terminal. Then come back and press Check again." },
  };
}
