#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ROOT, VERSION, run, zipEntries } from "./release/common";

const RELEASE = join(ROOT, "release");
const PLAYLIST_URL = "https://www.youtube.com/watch?v=DevI7G5bh3A&list=PLLrJYAtW5i7A";
const PLAYLIST_ITEMS = "1-24,26";
const VIDEO_IDS = [
  "DevI7G5bh3A", "q7JKEqxgFw0", "PEyoJUWWvxs", "W9x2cMD7mUI", "C5GYL1itN4g",
  "TUSmEqnM7HQ", "4HZsUrsZNm8", "neL5xuzwX-s", "4jy6tOBDhgA", "IInm9jGJ-UU",
  "E5yLyexKqmg", "TOSkEX9DmhM", "7lWcrQbC32o", "6-w7VRI1qGo", "lQdPw1NdwcM",
  "QmQGJEGxbxI", "VAhdpOwSkyg", "El19ZTdGplA", "fogOjUOe-Fs", "CnYqk8hmZRA",
  "tzKpCFJunj8", "XKZR4Cfrz84", "r0fLVo4pIgQ", "UB2LcQhWbcc", "vIxSt2525Jk",
];
const MAX_ARCHIVE_BYTES = 1_900_000_000;
const VERSION_PREFIX = `bun-rad-studio-v${VERSION}-free-music-`;

interface PlaylistEntry {
  id: string;
  title: string;
  playlist_index?: number;
  uploader?: string;
  channel_url?: string;
  duration?: number;
  chapters?: Array<{ start_time: number; end_time?: number; title?: string }>;
}

interface BundleEntry extends PlaylistEntry {
  index: number;
}

interface Credit {
  title: string;
  uploader: string;
  url: string;
}

interface PackFile {
  file: string;
  credit: Credit;
}

function requireTool(name: string): void {
  if (!Bun.which(name)) throw new Error(`Missing required tool "${name}". Install it and retry.`);
}

function creditFor(entry: BundleEntry, title = entry.title): Credit {
  return {
    title,
    uploader: entry.uploader || "Codecaine",
    url: `https://www.youtube.com/watch?v=${entry.id}`,
  };
}

function attribution(credits: Credit[], changes: string): string {
  const lines = [
    "Free Music — Attribution and License",
    "",
    "Creator: Codecaine",
    "Source playlist: https://www.youtube.com/playlist?list=PLLrJYAtW5i7A",
    "License: Creative Commons Attribution 4.0 International (CC BY 4.0)",
    "https://creativecommons.org/licenses/by/4.0/",
    `Changes: ${changes}`,
    "",
    "Attribute each included work as follows:",
    "",
  ];
  for (const credit of credits) {
    lines.push(
      `${credit.title} — ${credit.uploader}`,
      `Source: ${credit.url}`,
      "License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
      "",
    );
  }
  lines.push("Playlist entry 25 (video O4CM5B24bhE) was unavailable and is not included.", "");
  return lines.join("\n");
}

function groupBySize(work: string, files: PackFile[]): PackFile[][] {
  const groups: PackFile[][] = [];
  let group: PackFile[] = [];
  let bytes = 0;
  for (const item of files) {
    const size = statSync(join(work, item.file)).size;
    if (size > MAX_ARCHIVE_BYTES) throw new Error(`One audio file exceeds the per-archive size limit: ${item.file}`);
    if (group.length && bytes + size > MAX_ARCHIVE_BYTES) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += size;
  }
  if (group.length) groups.push(group);
  return groups;
}

export async function createArchives(
  stage: string,
  work: string,
  format: "source" | "mp3" | "songs-mp3",
  audioFiles: PackFile[],
  changes: string,
): Promise<string[]> {
  const groups = groupBySize(work, audioFiles);
  const names: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const part = groups.length > 1 ? `-${i + 1}of${groups.length}` : "";
    const name = `${VERSION_PREFIX}${format}${part}.zip`;
    const archive = join(stage, name);
    writeFileSync(join(work, "ATTRIBUTION.txt"), attribution(groups[i]!.map((item) => item.credit), changes));
    const entries = ["ATTRIBUTION.txt", ...groups[i]!.map((item) => item.file)];
    if (process.platform === "win32") await zipEntries(work, entries, archive);
    else await run(["zip", "-0", "-j", archive, ...entries], { cwd: work });
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

function slug(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "track";
}

async function main(): Promise<void> {
  for (const tool of ["yt-dlp", "ffmpeg", ...(process.platform === "win32" ? ["powershell.exe"] : ["zip", "unzip"])]) requireTool(tool);
  mkdirSync(RELEASE, { recursive: true });
  const existing = readdirSync(RELEASE).filter((name) => name.startsWith(VERSION_PREFIX) && name.endsWith(".zip"));
  if (existing.length) throw new Error(`Refusing to overwrite existing music archives: ${existing.join(", ")}`);

  const stage = mkdtempSync(join(RELEASE, ".free-music-"));
  try {
    const work = join(stage, "work");
    mkdirSync(work);
    const metadataText = await run(["yt-dlp", "--no-warnings", "--dump-json", "--skip-download", "--playlist-items", PLAYLIST_ITEMS, PLAYLIST_URL]);
    const entries = metadataText.trim().split("\n").map((line, index) => {
      const entry = JSON.parse(line) as PlaylistEntry;
      return { ...entry, index: entry.playlist_index ?? index + 1 };
    });
    if (entries.length !== VIDEO_IDS.length || entries.some((entry, index) => entry.id !== VIDEO_IDS[index])) {
      throw new Error("The playlist entries changed or are incomplete. Check the playlist before building this bundle.");
    }

    await run([
      "yt-dlp", "--format", "bestaudio", "--extract-audio", "--audio-format", "mp3",
      "--audio-quality", "128K", "--keep-video", "--embed-metadata",
      "--playlist-items", PLAYLIST_ITEMS, "--output", "%(playlist_index)02d-%(id)s.%(ext)s", PLAYLIST_URL,
    ], { cwd: work });

    const files = readdirSync(work).filter((name) => /^\d{2}-[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(name)).sort();
    const mp3Files = files.filter((name) => name.endsWith(".mp3"));
    const sourceFiles = files.filter((name) => !name.endsWith(".mp3"));
    if (mp3Files.length !== VIDEO_IDS.length || sourceFiles.length !== VIDEO_IDS.length) {
      throw new Error(`Expected ${VIDEO_IDS.length} source audio files and MP3s; found ${sourceFiles.length} and ${mp3Files.length}.`);
    }
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const packFiles = (names: string[]): PackFile[] => names.map((file) => {
      const match = /^\d{2}-([A-Za-z0-9_-]+)\./.exec(file);
      if (!match || !entriesById.has(match[1]!)) throw new Error(`Unexpected downloaded file: ${file}`);
      return { file, credit: creditFor(entriesById.get(match[1]!)!) };
    });
    const sourceArchives = await createArchives(stage, work, "source", packFiles(sourceFiles), "audio extracted from the YouTube video without MP3 transcoding");
    const mp3Archives = await createArchives(stage, work, "mp3", packFiles(mp3Files), "audio extracted and transcoded to MP3 at 128 kbps");

    const sourceById = new Map(sourceFiles.map((file) => [(/^\d{2}-([A-Za-z0-9_-]+)\./.exec(file) ?? [])[1]!, file]));
    const songFiles: PackFile[] = [];
    for (const entry of entries) {
      const source = sourceById.get(entry.id);
      if (!source) throw new Error(`Missing source audio for ${entry.id}.`);
      const chapters = entry.chapters?.length
        ? entry.chapters
        : [{ start_time: 0, end_time: entry.duration, title: entry.title }];
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i]!;
        const end = chapter.end_time ?? chapters[i + 1]?.start_time ?? entry.duration;
        if (!Number.isFinite(chapter.start_time) || !Number.isFinite(end) || end! <= chapter.start_time) {
          throw new Error(`Invalid chapter timing in ${entry.id}: ${chapter.title ?? entry.title}`);
        }
        const title = chapter.title || entry.title;
        const number = String(i + 1).padStart(2, "0");
        const file = `${String(entry.index).padStart(2, "0")}-${number}-${slug(title)}-${entry.id}.mp3`;
        await run([
          "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", chapter.start_time.toFixed(3),
          "-i", join(work, source), "-t", (end! - chapter.start_time).toFixed(3),
          "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "128K",
          "-metadata", `title=${title}`, "-metadata", `artist=${entry.uploader || "Codecaine"}`,
          "-metadata", `album=${entry.title}`, "-metadata", `track=${i + 1}/${chapters.length}`,
          "-id3v2_version", "3", join(work, file),
        ]);
        if (!statSync(join(work, file)).size) throw new Error(`ffmpeg produced an empty song file: ${file}`);
        songFiles.push({ file, credit: creditFor(entry, `${title} (from ${entry.title})`) });
      }
    }
    const songArchives = await createArchives(stage, work, "songs-mp3", songFiles, "individual chapter tracks cut from the source audio and transcoded to MP3 at 128 kbps");
    const outputs = [...sourceArchives, ...mp3Archives, ...songArchives];
    for (const name of outputs) renameSync(join(stage, name), join(RELEASE, name));
    console.log(`Created ${sourceArchives.length} source-audio, ${mp3Archives.length} full-length MP3, and ${songArchives.length} song-track MP3 archive(s) in ${RELEASE}.`);
    for (const name of outputs) console.log(`  ${name}`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`❌  ${error?.message ?? error}`);
    process.exit(1);
  });
}
