#!/usr/bin/env bun
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { ROOT, VERSION, defaultJobs, mapPool, parseJobs, run } from "./release/common";
import { createContext } from "../src/features/filemanager/fmCore";
import { createZip } from "../src/features/filemanager/fmZip";

const RELEASE = join(ROOT, "release");
const MUSIC = join(ROOT, "music lyrics");
const READY_MP3 = join(ROOT, "youtube_ready_mp3");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const MAX_ARCHIVE_BYTES = 1_900_000_000;
const VERSION_PREFIX = `bun-rad-studio-v${VERSION}-free-music-`;

interface PackFile {
  file: string;
  title: string;
}

export function localVideos(sourceDir: string): string[] {
  const files = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) throw new Error(`No lyric videos found in ${sourceDir}.`);
  return files;
}

function attribution(files: PackFile[], changes: string): string {
  return [
    "Free Music - Attribution and License",
    "",
    "Creator: Codecaine (Jerome Scott)",
    'Source: original local lyric videos supplied in the local "music lyrics" folder.',
    "License: Creative Commons Attribution 4.0 International (CC BY 4.0)",
    "https://creativecommons.org/licenses/by/4.0/",
    "",
    "Permissions & Credit:",
    "You are free to use, share, remix, and adapt these songs and lyric videos in your own videos, streams, games, apps, and projects (including commercially), as long as you give credit to Codecaine:",
    '  "Music by Codecaine — https://github.com/codecaine-zz/bun_rad_studio (CC BY 4.0)"',
    "",
    `Changes: ${changes}`,
    "",
    "Included works:",
    ...files.map(({ title }) => `${title} - Codecaine`),
    "",
  ].join("\n");
}

export async function createArchives(
  stage: string,
  work: string,
  format: "lyrics-videos" | "mp3",
  files: PackFile[],
  changes: string,
): Promise<string[]> {
  const groups: PackFile[][] = [];
  let group: PackFile[] = [];
  let bytes = 0;
  for (const item of files) {
    const size = statSync(join(work, item.file)).size;
    if (!size || size > MAX_ARCHIVE_BYTES) throw new Error(`Empty file or file exceeds the per-archive size limit: ${item.file}`);
    if (group.length && bytes + size > MAX_ARCHIVE_BYTES) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += size;
  }
  if (group.length) groups.push(group);

  const names: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const part = groups.length > 1 ? `-${i + 1}of${groups.length}` : "";
    const name = `${VERSION_PREFIX}${format}${part}.zip`;
    const archive = join(stage, name);
    writeFileSync(join(work, "ATTRIBUTION.txt"), attribution(groups[i]!, changes));
    const ctx = createContext({ home: stage, dataDir: join(stage, "data") });
    try {
      const created = await createZip(ctx, ["ATTRIBUTION.txt", ...groups[i]!.map((item) => item.file)].map((file) => join(work, file)), name);
      renameSync(created.zipPath, archive);
    } finally {
      for (const dispose of ctx.disposers) await dispose();
    }
    if (statSync(archive).size > 2_000_000_000) throw new Error(`Archive exceeds GitHub's 2 GB per-file limit: ${name}`);
    if (process.platform === "win32") {
      await run(["powershell.exe", "-NoProfile", "-Command",
        "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead($env:MUSIC_ARCHIVE); try { foreach ($entry in $zip.Entries) { $stream = $entry.Open(); try { $stream.CopyTo([IO.Stream]::Null) } finally { $stream.Dispose() } } } finally { $zip.Dispose() }"],
      { env: { MUSIC_ARCHIVE: archive } });
    } else await run(["unzip", "-tqq", archive]);
    names.push(name);
  }
  return names;
}

export function titleFilename(title: string, extension: string, usedNames: Set<string>): string {
  let base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "") || "Untitled track";
  // Leave room for the extension and duplicate suffix within a 255-byte filename.
  while (Buffer.byteLength(base, "utf8") > 200) base = Array.from(base).slice(0, -1).join("");
  base = base.replace(/[. ]+$/g, "");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(base)) base = `Track - ${base}`;
  if (base.startsWith("-")) base = `Track ${base}`;

  let candidate = `${base}.${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate.normalize("NFC").toLowerCase())) candidate = `${base} (${suffix++}).${extension}`;
  usedNames.add(candidate.normalize("NFC").toLowerCase());
  return candidate;
}

export async function buildMusicRelease(sourceDir = MUSIC, releaseDir = RELEASE, jobs = defaultJobs()): Promise<string[]> {
  parseJobs(String(jobs));
  for (const tool of ["ffmpeg", process.platform === "win32" ? "powershell.exe" : "unzip"]) {
    if (!Bun.which(tool)) throw new Error(`Missing required tool "${tool}". Install it and retry.`);
  }
  const videos = localVideos(sourceDir);
  mkdirSync(releaseDir, { recursive: true });
  const existing = readdirSync(releaseDir).filter((name) => name.startsWith(VERSION_PREFIX) && name.endsWith(".zip"));
  if (existing.length) throw new Error(`Refusing to overwrite existing music archives: ${existing.join(", ")}`);

  const stage = mkdtempSync(join(releaseDir, ".free-music-"));
  try {
    const videoDir = join(stage, "videos");
    const mp3Dir = join(stage, "mp3");
    mkdirSync(videoDir);
    mkdirSync(mp3Dir);
    const usedVideoNames = new Set<string>();
    const usedMp3Names = new Set<string>();
    const plans = videos.map((original) => {
      const extension = extname(original);
      const title = original.slice(0, -extension.length);
      const video = titleFilename(title, extension.slice(1).toLowerCase(), usedVideoNames);
      const mp3 = titleFilename(title, "mp3", usedMp3Names);
      return { original, title, video, mp3 };
    });
    const useReadyMp3 = sourceDir === MUSIC && existsSync(READY_MP3);
    const encode = async ({ original, title, video, mp3 }: typeof plans[number], index: number) => {
      const source = join(sourceDir, original);
      if (!statSync(source).size) throw new Error(`Empty lyric video: ${source}`);
      console.log(`[${index + 1}/${videos.length}] ${title}`);
      copyFileSync(source, join(videoDir, video), constants.COPYFILE_FICLONE);
      const cached = useReadyMp3 ? [join(READY_MP3, `${title}.mp3`), join(READY_MP3, mp3)].find((p) => existsSync(p) && statSync(p).size > 0) : undefined;
      if (cached) {
        copyFileSync(cached, join(mp3Dir, mp3), constants.COPYFILE_FICLONE);
        return;
      }
      await run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
        "-i", source, "-map", "0:a:0", "-vn", "-map_metadata", "-1", "-map_chapters", "-1",
        "-c:a", "libmp3lame", "-b:a", "128k", "-threads", "1",
        "-metadata", `title=${title}`, "-metadata", "artist=Codecaine",
        "-id3v2_version", "3", join(mp3Dir, mp3),
      ]);
      if (useReadyMp3) copyFileSync(join(mp3Dir, mp3), join(READY_MP3, mp3), constants.COPYFILE_FICLONE);
    };
    // Settle every active conversion before cleaning its files up on failure.
    const results = await mapPool(plans, jobs, async (plan, index) => (await Promise.allSettled([encode(plan, index)]))[0]!);
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, `Failed to convert local lyric videos: ${errors.map(String).join("; ")}`);
    const mp3Items: PackFile[] = plans.map(({ mp3, title }) => ({ file: mp3, title }));
    if (useReadyMp3) {
      for (const extra of readdirSync(READY_MP3).filter((f) => f.toLowerCase().endsWith(".mp3") && !f.startsWith(".")).sort()) {
        const extraTitle = extra.slice(0, -4);
        if (plans.some((p) => p.title === extraTitle || p.mp3 === extra)) continue;
        const safe = titleFilename(extraTitle, "mp3", usedMp3Names);
        copyFileSync(join(READY_MP3, extra), join(mp3Dir, safe), constants.COPYFILE_FICLONE);
        mp3Items.push({ file: safe, title: extraTitle });
      }
      writeFileSync(join(MUSIC, "ATTRIBUTION.txt"), attribution(plans.map(({ video, title }) => ({ file: video, title })), "none; original lyric videos, with filesystem-safe filenames"));
      writeFileSync(join(READY_MP3, "ATTRIBUTION.txt"), attribution(mp3Items, "audio extracted from the local lyric videos and transcoded to MP3 at 128 kbps"));
    }
    const packed = await Promise.allSettled([
      createArchives(stage, videoDir, "lyrics-videos", plans.map(({ video, title }) => ({ file: video, title })), "none; original lyric videos, with filesystem-safe filenames"),
      createArchives(stage, mp3Dir, "mp3", mp3Items, "audio extracted from the local lyric videos and transcoded to MP3 at 128 kbps"),
    ]);
    const videoResult = packed[0]!;
    const mp3Result = packed[1]!;
    if (videoResult.status === "rejected") throw videoResult.reason;
    if (mp3Result.status === "rejected") throw mp3Result.reason;
    const videoArchives = videoResult.value;
    const mp3Archives = mp3Result.value;
    const outputs = [...videoArchives, ...mp3Archives];
    for (const name of outputs) renameSync(join(stage, name), join(releaseDir, name));
    console.log(`Created ${videoArchives.length} lyric-video and ${mp3Archives.length} MP3 archive(s) from ${videos.length} local videos in ${releaseDir}.`);
    return outputs;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const main = async () => {
    if (args.length && (args.length !== 2 || args[0] !== "--jobs")) throw new Error("Usage: bun run release:music [--jobs 1-64]");
    return buildMusicRelease(MUSIC, RELEASE, args.length ? parseJobs(args[1]) : defaultJobs());
  };
  main().catch((error) => {
    console.error(`Music release failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
