/**
 * "General" and "Where it came from" facts about one item: names, kind, size, dates, permissions, and what the
 * operating system itself knows (macOS metadata, quarantine, signature; Linux attributes). Only reads; nothing is run.
 */
import { existsSync, promises as fsp, type Stats } from "fs";
import { absolutePath, pathApi, type FmContext } from "./fmCore";
import { helperEnv, humanBytes, lstatTarget, openForRead, orElse, readBytes, Rows, runProgram, sizeText, type InfoGroup } from "./fmInfoCommon";
import { FmError, classify, extensionOf } from "./fmPaths";
import { SNIFF_BYTES, sniffType, type Sniffed } from "./fmSniff";

const MIME: Record<string, string> = {
  png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff", ico: "image/x-icon", cur: "image/x-icon", heic: "image/heic",
  avif: "image/avif", psd: "image/vnd.adobe.photoshop", svg: "image/svg+xml", pdf: "application/pdf", rtf: "application/rtf", zip: "application/zip", rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed", gzip: "application/gzip", bzip2: "application/x-bzip2", xz: "application/x-xz", zstd: "application/zstd", tar: "application/x-tar",
  mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", aiff: "audio/aiff", midi: "audio/midi", mp4: "video/mp4", m4a: "audio/mp4",
  m4v: "video/x-m4v", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm", avi: "video/x-msvideo", sqlite: "application/vnd.sqlite3",
  pe: "application/vnd.microsoft.portable-executable", elf: "application/x-elf", macho: "application/x-mach-binary", html: "text/html", xml: "application/xml",
  ttf: "font/ttf", otf: "font/otf", ttc: "font/collection", woff: "font/woff", woff2: "font/woff2", text: "text/plain", binary: "application/octet-stream", script: "text/x-script",
};

const ZIP_BASED = new Set(["docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "jar", "apk", "xpi", "cbz", "war", "aar", "ipa", "vsix", "nupkg", "whl", "kmz", "numbers", "pages", "key"]);
const TEXTY = new Set(["text", "binary", "script", "html", "xml", "svg"]);

export function mimeOf(path: string, sniffed: Sniffed | null): string {
  if (sniffed && MIME[sniffed.kind]) return MIME[sniffed.kind]!;
  const t = Bun.file(path).type;
  return t.split(";")[0] || "application/octet-stream";
}

/** "2024-05-01 12:00:00" in this computer's time zone. */
export function localTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function permissionText(mode: number): string {
  const bits = "rwxrwxrwx";
  let s = "";
  for (let i = 0; i < 9; i++) s += mode & (0o400 >> i) ? bits[i] : "-";
  if (mode & 0o4000) s = s.slice(0, 2) + (s[2] === "x" ? "s" : "S") + s.slice(3);
  if (mode & 0o2000) s = s.slice(0, 5) + (s[5] === "x" ? "s" : "S") + s.slice(6);
  if (mode & 0o1000) s = s.slice(0, 8) + (s[8] === "x" ? "t" : "T");
  return s;
}

function typeWord(st: Stats): string {
  return st.isSymbolicLink() ? "Link (shortcut)" : st.isDirectory() ? "Folder" : st.isFile() ? "File" : st.isFIFO() ? "Named pipe" : st.isSocket() ? "Socket" : st.isBlockDevice() || st.isCharacterDevice() ? "Device" : "Other";
}

/** Names for the numbers of an owner and group, asked from the system. */
async function ownerNames(ctx: FmContext, path: string): Promise<string | null> {
  if (process.platform === "win32" || !existsSync("/usr/bin/stat")) return null;
  const args = process.platform === "darwin" ? ["-f", "%Su:%Sg", path] : ["-c", "%U:%G", path];
  const r = await runProgram(["/usr/bin/stat", ...args], helperEnv(ctx), { timeoutMs: 3000, maxBytes: 4096 });
  const t = r.stdout.trim();
  return r.code === 0 && /^[^\s:]+:[^\s:]+$/.test(t) ? t : null;
}

/** `mdls` prints `name = value`; arrays span several lines between "(" and ")". */
export function parseMdls(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(kMDItem\w+)\s*=\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!;
    const val = m[2]!.trim();
    if (val === "(null)") continue;
    const items: string[] = [];
    if (val === "(") {
      while (++i < lines.length && lines[i]!.trim() !== ")") items.push(lines[i]!.trim().replace(/,$/, "").replace(/^"|"$/g, ""));
    } else items.push(val.replace(/^"|"$/g, "").replace(/\\"/g, '"'));
    out[key] = items.filter(Boolean).slice(0, 30);
  }
  return out;
}

export function parseQuarantine(value: string): { app: string; when: string | null; flags: string } | null {
  const parts = value.trim().split(";");
  if (parts.length < 3 || !/^[0-9a-f]{1,4}$/i.test(parts[0]!)) return null;
  const secs = parseInt(parts[1]!, 16);
  return { flags: parts[0]!, when: Number.isFinite(secs) && secs > 0 ? localTime(secs * 1000) : null, app: parts[2]!.replace(/[^\w .()-]/g, "").slice(0, 80) };
}

async function macExtras(ctx: FmContext, path: string, isDir: boolean, sniffed: Sniffed | null, ext: string): Promise<InfoGroup[]> {
  const env = helperEnv(ctx);
  const rows = new Rows();
  const sec = new Rows();
  const names = ["kMDItemKind", "kMDItemWhereFroms", "kMDItemContentType", "kMDItemContentTypeTree", "kMDItemUserTags", "kMDItemFinderComment", "kMDItemDateAdded", "kMDItemLastUsedDate", "kMDItemUseCount"];
  const hasMdls = existsSync("/usr/bin/mdls");
  const hasXattr = existsSync("/usr/bin/xattr");
  const signable = (isDir ? ext === "app" : sniffed?.kind === "macho") && existsSync("/usr/bin/codesign");
  const [mdls, q, list, c] = await Promise.all([
    hasMdls ? runProgram(["/usr/bin/mdls", ...names.flatMap((n) => ["-name", n]), path], env, { timeoutMs: 5000, maxBytes: 64 * 1024 }) : Promise.resolve(null),
    hasXattr ? runProgram(["/usr/bin/xattr", "-p", "com.apple.quarantine", path], env, { timeoutMs: 3000, maxBytes: 4096 }) : Promise.resolve(null),
    hasXattr ? runProgram(["/usr/bin/xattr", path], env, { timeoutMs: 3000, maxBytes: 16 * 1024 }) : Promise.resolve(null),
    signable ? runProgram(["/usr/bin/codesign", "-dv", "--verbose=2", path], env, { timeoutMs: 8000, maxBytes: 32 * 1024 }) : Promise.resolve(null),
  ]);
  const md = mdls && mdls.code === 0 ? parseMdls(mdls.stdout) : {};
  rows.add("macOS kind", md.kMDItemKind?.[0], "The name the Finder shows for this kind of item.");
  rows.add("Content type", md.kMDItemContentType?.[0], "A technical type name macOS uses (a UTI), for example public.jpeg.");
  rows.add("Type family", md.kMDItemContentTypeTree?.join(" → "), "The chain of broader types this type belongs to.");
  rows.add("Date added", md.kMDItemDateAdded?.[0]?.replace(/ \+0000$/, " UTC"), "When it first appeared in this folder, as Spotlight recorded it.");
  rows.add("Last opened", md.kMDItemLastUsedDate?.[0]?.replace(/ \+0000$/, " UTC")).add("Times opened", md.kMDItemUseCount?.[0]);
  rows.add("Finder tags", md.kMDItemUserTags?.join(", "), "Colored labels you or other programs added in the Finder.");
  rows.add("Finder comment", md.kMDItemFinderComment?.[0]);
  const from = md.kMDItemWhereFroms;
  if (from?.length) sec.add("Downloaded from", from.join("  ·  "), "The web addresses this file was downloaded from, saved by the browser. They can reveal where you were browsing.", "warn");
  if (q && list) {
    const parsed = q.code === 0 ? parseQuarantine(q.stdout) : null;
    sec.add("Quarantine", parsed ? `Marked as downloaded from the internet${parsed.app ? ` by ${parsed.app}` : ""}${parsed.when ? ` on ${parsed.when}` : ""}. macOS may ask before opening it.` : "Not marked", "macOS puts this flag on files that came from the internet and checks them before the first opening.", parsed ? "warn" : "good");
    const attrs = list.code === 0 ? list.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 40) : [];
    sec.add("Extended attributes", attrs.join(", "), "Small hidden labels the system or programs attach to a file, outside its content.");
  }
  if (c) {
    const text = c.stderr + c.stdout;
    if (/not signed at all/i.test(text)) sec.add("Code signature", "Not signed", "A signature proves who made a program and that it wasn't changed afterwards.", "warn");
    else if (c.code === 0 || /Identifier=/.test(text)) {
      const pick = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(text)?.[1]?.trim();
      sec.add("Code signature", "Signed (display only: not checked for validity here)", "A signature proves who made a program and that it wasn't changed afterwards.");
      sec.add("Signed identifier", pick("Identifier")).add("Signed by", pick("Authority")).add("Team", pick("TeamIdentifier"));
    }
  }
  const groups: InfoGroup[] = [];
  const g1 = rows.group("macos", "macOS details", "What macOS itself knows about this item.");
  const g2 = sec.group("security", "Origin and security", "Where the item came from and whether the system trusts it.");
  if (g1) groups.push(g1);
  if (g2) groups.push(g2);
  return groups;
}

async function linuxExtras(ctx: FmContext, path: string): Promise<InfoGroup[]> {
  const sec = new Rows();
  const env = helperEnv(ctx);
  if (existsSync("/usr/bin/file")) {
    const f = await runProgram(["/usr/bin/file", "-b", path], env, { timeoutMs: 4000, maxBytes: 8192 });
    if (f.code === 0) sec.add("Described by the 'file' program", f.stdout.trim());
  }
  for (const bin of ["/usr/bin/getfattr", "/bin/getfattr"]) {
    if (!existsSync(bin)) continue;
    const a = await runProgram([bin, "-d", "-m", "-", path], env, { timeoutMs: 4000, maxBytes: 16 * 1024 });
    if (a.code === 0) sec.add("Extended attributes", a.stdout.split(/\r?\n/).filter((l) => l && !l.startsWith("#")).slice(0, 30).join("  ·  "), "Small hidden labels the system or programs attach to a file, outside its content.");
    break;
  }
  const g = sec.group("security", "Origin and security");
  return g ? [g] : [];
}

export interface FileInfoResult {
  path: string;
  name: string;
  isDir: boolean;
  isLink: boolean;
  /** Where a link points, when that place exists. */
  realPath: string | null;
  ext: string;
  kind: string;
  family: string;
  mime: string;
  sniffKind: string;
  groups: InfoGroup[];
}

export async function fileInfo(ctx: FmContext, input: unknown): Promise<FileInfoResult> {
  const t = await lstatTarget(ctx, input);
  const path = absolutePath(ctx, input);
  const p = pathApi(ctx);
  const name = p.basename(path);
  const lst = t.lst;
  if (!lst.isFile() && !lst.isDirectory() && !lst.isSymbolicLink()) throw new FmError("NOT_A_FILE", "That isn't an ordinary file or folder.");
  const ext = extensionOf(name);
  const rows = new Rows();
  const groups: InfoGroup[] = [];
  let sniffed: Sniffed | null = null;
  let realPath: string | null = null;
  rows.add("Name", name).add("Full path", path);
  if (lst.isSymbolicLink()) {
    let link = "";
    try { link = await fsp.readlink(path); } catch { link = ""; }
    rows.add("Link points to", link, "This item is a shortcut (a symbolic link). Its content isn't read; open the target to see that.");
    try {
      const real = await fsp.realpath(path);
      const target = await fsp.stat(real);
      realPath = real;
      rows.add("Real location", real).add("Target is", typeWord(target)).add("Target size", target.isFile() ? sizeText(target.size) : "");
    } catch {
      rows.add("Target", "Missing: the link points to nothing", "", "warn");
    }
  }
  if (lst.isFile()) {
    try {
      const h = await openForRead(path);
      try { sniffed = sniffType(await readBytes(h, 0, SNIFF_BYTES)); } finally { await h.close(); }
    } catch {
      sniffed = null;
    }
  }
  const byName = classify(name, lst.isDirectory(), ctx.platform !== "win32" && lst.isFile() && (lst.mode & 0o111) !== 0);
  const kindLabel = lst.isDirectory() ? (ext === "app" ? "Application bundle (folder)" : "Folder") : lst.isSymbolicLink() ? "Link (shortcut)" : sniffed ? sniffed.label.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()) : byName.label;
  const mime = lst.isFile() ? mimeOf(path, sniffed) : lst.isDirectory() ? "inode/directory" : "";
  rows.add("Kind", kindLabel, "What the file really is, worked out from its first bytes, not from its name.");
  rows.add("Kind by its name", byName.label !== kindLabel ? byName.label : "");
  rows.add("Content type (MIME)", mime, "A standard label for the kind of content, used by browsers and email, like image/png.");
  if (sniffed && ext && !TEXTY.has(sniffed.kind) && !sniffed.extensions.includes(ext) && !(sniffed.kind === "zip" && ZIP_BASED.has(ext)) && !(sniffed.kind === "ole2" && ["doc", "xls", "ppt", "msi", "msg"].includes(ext)) && !(sniffed.kind === "mp4" && ["m4v", "mov", "3gp", "m4a"].includes(ext))) {
    rows.add("Name and content", `The name ends in .${ext}, but the content looks like ${sniffed.label}.`, "A file whose name doesn't match its content may be mislabelled, or disguised.", "warn");
  }
  if (lst.isFile()) rows.add("Size", sizeText(lst.size), "How many bytes of data the file holds.");
  if (lst.blocks !== undefined && ctx.platform !== "win32" && lst.isFile()) rows.add("Size on disk", `${humanBytes(lst.blocks * 512)} (${lst.blocks.toLocaleString("en-US")} blocks of 512 bytes)`, "The space it really takes on the disk. Disks store files in whole blocks, so this is usually a little more.");
  const g = rows.group("general", "General");
  if (g) groups.push(g);

  const dates = new Rows();
  dates.add("Created", lst.birthtimeMs > 0 ? localTime(lst.birthtimeMs) : "", "When the file was first made on this disk (not shown by every file system).");
  dates.add("Modified", localTime(lst.mtimeMs), "When the content was last changed.").add("Opened", localTime(lst.atimeMs), "When it was last read. Some systems don't keep this up to date.");
  dates.add("Status changed", ctx.platform === "win32" ? "" : localTime(lst.ctimeMs), "When the file's own details (like permissions or name) last changed.");
  const gd = dates.group("dates", "Dates");
  if (gd) groups.push(gd);

  const perm = new Rows();
  if (ctx.platform !== "win32") {
    const m = lst.mode & 0o7777;
    const owner = await ownerNames(ctx, path);
    const runnable = lst.isFile() && (lst.mode & 0o111) !== 0;
    perm.add("Permissions", `${m.toString(8).padStart(3, "0")}  (${permissionText(m)})`, "Who may read (r), write (w) or run (x): owner, group, then everyone else.");
    perm.add("Owner and group", owner ? owner.replace(":", " : ") : `user ${lst.uid}, group ${lst.gid}`, "The account that owns the file and the group it belongs to.");
    perm.add("Hidden", name.startsWith(".") ? "Yes: the name starts with a dot" : "No");
    perm.add("Can be run", runnable ? "Yes (has the execute permission)" : "", "", runnable ? "info" : undefined);
    perm.add("Inode", lst.ino ? String(lst.ino) : "", "The file system's own number for this item.").add("Hard links", lst.nlink > 1 ? `${lst.nlink} names point to this same file` : "1");
  } else {
    perm.add("Read-only", (lst.mode & 0o200) === 0 ? "Yes" : "No", "A read-only file can't be changed until you clear this.").add("Hidden", name.startsWith(".") ? "Yes: the name starts with a dot" : "Not checked on Windows (the hidden attribute isn't read here)");
  }
  const gp = perm.group("permissions", "Permissions and owner");
  if (gp) groups.push(gp);

  // What the system itself knows is a bonus: slow or missing helpers must never hide the basic facts.
  if (process.platform === "darwin" && ctx.platform === "darwin") groups.push(...(await orElse(6000, macExtras(ctx, path, lst.isDirectory(), sniffed, ext), [])));
  else if (process.platform === "linux" && ctx.platform === "linux" && !lst.isSymbolicLink()) groups.push(...(await orElse(6000, linuxExtras(ctx, path), [])));
  return { path, name, isDir: lst.isDirectory(), isLink: lst.isSymbolicLink(), realPath, ext, kind: kindLabel, family: sniffed?.family ?? (lst.isDirectory() ? "folder" : byName.kind), mime, sniffKind: sniffed?.kind ?? "", groups };
}
