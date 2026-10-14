/** What the media readers answer with, and how it is turned into rows. Shared by the built-in readers and ffprobe. */
import { formatDuration, Rows, type InfoGroup } from "./fmInfoCommon";

export interface MediaStream {
  type: "video" | "audio" | "subtitle" | "data" | "other";
  codec: string;
  detail?: string;
  width?: number;
  height?: number;
  fps?: number;
  channels?: number;
  layout?: string;
  sampleRate?: number;
  bitrate?: number;
  bits?: number;
  language?: string;
  title?: string;
  isDefault?: boolean;
  durationSec?: number;
}

export interface MediaInfo {
  source: "ffprobe" | "built-in";
  container: string;
  durationSec: number | null;
  bitrate: number | null;
  streams: MediaStream[];
  tags: Record<string, string>;
  coverArt: boolean;
  chapters: Array<{ start: number; title: string }>;
  notes: string[];
  partial: boolean;
}

export function emptyMedia(container: string): MediaInfo {
  return { source: "built-in", container, durationSec: null, bitrate: null, streams: [], tags: {}, coverArt: false, chapters: [], notes: [], partial: false };
}

const TAG_LABELS: Array<[string, string]> = [
  ["title", "Title"], ["artist", "Artist"], ["album_artist", "Album artist"], ["album", "Album"], ["date", "Year / date"], ["genre", "Genre"], ["track", "Track"], ["disc", "Disc"],
  ["composer", "Composer"], ["comment", "Comment"], ["encoder", "Made with"], ["copyright", "Copyright"], ["creation_time", "Created"], ["language", "Language"],
];

const bitrateText = (bps: number) => (bps >= 1_000_000 ? `${Math.round(bps / 10_000) / 100} Mbit/s` : `${Math.round(bps / 1000)} kbit/s`);

export function mediaGroups(m: MediaInfo, size: number): InfoGroup[] {
  const groups: InfoGroup[] = [];
  const main = new Rows();
  main.add("Container", m.container, "The kind of file that holds the pictures and sound together (for example MP4 or MKV).");
  main.add("Duration", m.durationSec !== null ? formatDuration(m.durationSec) : "", "How long it plays.");
  const br = m.bitrate ?? (m.durationSec && m.durationSec > 0 ? Math.round((size * 8) / m.durationSec) : null);
  main.add("Overall bit rate", br ? `${bitrateText(br)}${m.bitrate ? "" : " (estimated from the file size)"}` : "", "How much data one second takes. Higher usually means better quality and a bigger file.");
  main.add("Tracks", m.streams.length ? `${m.streams.filter((s) => s.type === "video").length} video, ${m.streams.filter((s) => s.type === "audio").length} audio, ${m.streams.filter((s) => s.type === "subtitle").length} subtitle` : "");
  main.add("Cover picture", m.coverArt ? "Yes, it has an album cover or poster inside" : "");
  main.add("Read with", m.source === "ffprobe" ? "ffprobe (full details)" : "built-in reader (basic details)", "ffprobe is a free helper program that reads every kind of media file.");
  const g = main.group("media", "Media", undefined, m.partial ? "Partly readable: the file is cut short, or part of it isn't understood by the built-in reader." : undefined);
  if (g) groups.push(g);

  const video = m.streams.filter((s) => s.type === "video" && !(m.coverArt && s.detail === "cover"));
  const vr = new Rows();
  video.forEach((s, i) => {
    const p = video.length > 1 ? `Video ${i + 1}: ` : "";
    vr.add(`${p}Codec`, s.codec, "A codec is the method used to squeeze the pictures (or sound) into the file. For example H.264 or AV1.");
    vr.add(`${p}Size`, s.width && s.height ? `${s.width} × ${s.height} pixels` : "").add(`${p}Frame rate`, s.fps ? `${Math.round(s.fps * 1000) / 1000} frames per second` : "", "How many pictures are shown each second.");
    vr.add(`${p}Details`, s.detail, "Extra facts about the video, such as the colour format.").add(`${p}Bit rate`, s.bitrate ? bitrateText(s.bitrate) : "");
  });
  const vg = vr.group("video", "Video");
  if (vg) groups.push(vg);

  const audio = m.streams.filter((s) => s.type === "audio");
  const ar = new Rows();
  audio.forEach((s, i) => {
    const p = audio.length > 1 ? `Audio ${i + 1}: ` : "";
    ar.add(`${p}Codec`, s.codec, "A codec is the method used to squeeze the sound into the file. For example MP3 or AAC.");
    ar.add(`${p}Channels`, s.channels ? `${s.channels}${s.layout ? ` (${s.layout})` : s.channels === 1 ? " (mono)" : s.channels === 2 ? " (stereo)" : ""}` : "", "How many separate sound tracks are played: 1 is mono, 2 is stereo.");
    ar.add(`${p}Sample rate`, s.sampleRate ? `${s.sampleRate.toLocaleString("en-US")} Hz` : "", "How many times per second the sound was measured. 44,100 Hz is CD quality.");
    ar.add(`${p}Bits per sample`, s.bits || "", "How finely each measurement was recorded.").add(`${p}Bit rate`, s.bitrate ? bitrateText(s.bitrate) : "").add(`${p}Language`, s.language);
    ar.add(`${p}Details`, s.detail);
  });
  const ag = ar.group("audio", "Audio");
  if (ag) groups.push(ag);

  const tr = new Rows();
  const used = new Set<string>();
  for (const [k, label] of TAG_LABELS) {
    const v = m.tags[k];
    if (v) { tr.add(label, v); used.add(k); }
  }
  for (const [k, v] of Object.entries(m.tags)) if (!used.has(k) && tr.length < 60) tr.add(k, v);
  const tg = tr.group("tags", "Tags", "Information stored in the file: title, artist, album and so on.");
  if (tg) groups.push(tg);

  const sr = new Rows();
  m.streams.filter((s) => s.type === "subtitle").forEach((s, i) => sr.add(`Subtitle ${i + 1}`, [s.language, s.title, s.codec].filter(Boolean).join(" · ")));
  m.streams.filter((s) => s.type === "audio" && audio.length > 1).forEach((s, i) => sr.add(`Audio track ${i + 1}`, [s.language, s.title, s.codec].filter(Boolean).join(" · ")));
  const sg = sr.group("tracks", "Subtitles and audio tracks");
  if (sg) groups.push(sg);

  const cr = new Rows();
  m.chapters.slice(0, 200).forEach((c, i) => cr.add(`${i + 1}. ${formatDuration(c.start)}`, c.title || `Chapter ${i + 1}`));
  const cg = cr.group("chapters", "Chapters", "Marks that let a player jump to a part of the file.");
  if (cg) groups.push(cg);
  return groups;
}
