/**
 * ⚡ Media Player Studio Pro (AmpDeck Audio Rack)
 *
 * Classic 90s modular rack media player reimagined with modern Web Audio DSP:
 * - Main Deck: clickable digital LED clock (elapsed / remaining), bitrate/kHz/stereo/pitch readout,
 *   scrolling marquee ticker, and 4-mode real-time visualizer (Classic Spectrum with peak-hold caps,
 *   Stereo Oscilloscope, Cyber-Tunnel Radial, Stereo VU Meters) + HD Video stage (PiP & Fullscreen)
 * - 10-Band Graphic Equalizer + Preamp (-12 dB to +12 dB) + live spline frequency curve + 18 presets
 *   + Stereo Balance/Pan + 3 DSP boosts (Sub-Bass, Air Exciter, Vocal Presence) + Vinyl Pitch mode
 * - Playlist Editor: Jump-to-File filter, folder scanner, M3U/M3U8 import & export, A-B section loop
 * - Karaoke Lyrics Deck: synced .lrc auto-scrolling highlight, embedded ID3/MP4/FLAC/Ogg tags & subtitles
 * - 5 Skins: Classic 90s Rack, Modern Bento Glass, Cyberpunk Neon, Retro Hi-Fi Tube, Match App Theme
 */

import { injectHelp } from "../src/shared/helpTips";
import { SizeHint, Webview } from "webview-bun";
import { resolve, join, extname, dirname, basename } from "path";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { guardLocalRequest } from "../src/localGuard";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";
import {
  DECK_HARDWARE_TIERS,
  EQ_BANDS,
  EQ_PRESETS,
  MAX_VIZ_LAYERS,
  VIZ_CATEGORIES,
  VIZ_MIX_PRESETS,
  VIZ_MODES,
  PLAYER_SKINS,
  mediaKindOfName,
  parseM3u,
  formatM3u,
} from "../resources/file_manager/ui/mediacore.js";

export interface MediaPlayerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  rootDir?: string;
}

export interface MediaPlayerStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  port?: number;
  url?: string;
  server?: any;
  webview?: Webview;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".weba": "audio/webm",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".mkv": "video/x-matroska",
};

const SUB_AND_LYR_EXTS = new Set([".lrc", ".txt", ".srt", ".vtt"]);

export function getDefaultMediaLibraryDir(): string {
  const candidates = [
    resolve(process.cwd(), "music lyrics"),
    resolve(import.meta.dir, "../music lyrics"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return process.cwd();
}

export function scanMediaFolder(folderPath: string) {
  const dir = resolve(folderPath || getDefaultMediaLibraryDir());
  if (!existsSync(dir)) {
    return { folder: dir, tracks: [], subtitles: [], playlists: [] };
  }
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return { folder: dir, tracks: [], subtitles: [], playlists: [] };
  }
  const tracks: Array<{ name: string; path: string; size: number; kind: string }> = [];
  const subtitles: Array<{ name: string; path: string; size: number }> = [];
  const playlists: Array<{ name: string; path: string; size: number }> = [];

  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = extname(name).toLowerCase();
    const kind = mediaKindOfName(name);
    if (kind) {
      tracks.push({ name, path: full, size: st.size, kind });
    } else if (SUB_AND_LYR_EXTS.has(ext)) {
      subtitles.push({ name, path: full, size: st.size });
    } else if (ext === ".m3u" || ext === ".m3u8") {
      playlists.push({ name, path: full, size: st.size });
    }
  }
  return { folder: dir, tracks, subtitles, playlists };
}

function parseByteRange(header: string | null, total: number): [number, number] | null {
  if (!header || !header.startsWith("bytes=") || total <= 0) return null;
  const spec = header.slice(6).trim();
  if (spec.includes(",")) return null;
  const [startStr, endStr] = spec.split("-");
  if (startStr === "") {
    const suffix = Number(endStr);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    return [Math.max(0, total - suffix), total - 1];
  }
  const start = Number(startStr);
  const end = endStr === "" ? total - 1 : Number(endStr);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= total) {
    return null;
  }
  return [start, Math.min(total - 1, end)];
}

export function generateMediaPlayerStudioHtml(options: { apiUrl?: string; token?: string } = {}): string {
  return injectHelp(buildMediaPlayerHtml(options), "media_player_studio");
}

function buildMediaPlayerHtml(options: { apiUrl?: string; token?: string } = {}): string {
  const apiBase = options.apiUrl ?? "";
  const token = options.token ?? "";
  const defaultFolder = getDefaultMediaLibraryDir();
  const uiDir = resolve(import.meta.dir, "../resources/file_manager/ui");
  let playerCss = "";
  try {
    playerCss = readFileSync(join(uiDir, "player.css"), "utf8");
  } catch {
    playerCss = "";
  }

  const skinOptions = PLAYER_SKINS.map(
    (s: { id: string; label: string }) => `<option value="${s.id}">${s.label}</option>`,
  ).join("");

  const presetOptions = [
    ...Object.keys(EQ_PRESETS).map((name) => `<option value="${name}">${name}</option>`),
    `<option value="Custom">Custom</option>`,
  ].join("");

  const vizMixOptions = VIZ_MIX_PRESETS.map(
    (p: { id: string; label: string; icon: string }) => `<option value="${p.id}">${p.icon} ${p.label}</option>`,
  ).join("");

  const vizOptions = VIZ_MODES.map(
    (v: { id: string; label: string }) => `<option value="${v.id}">${v.label}</option>`,
  ).join("");

  const fxPresetButtonsHtml = VIZ_MIX_PRESETS.map(
    (p: { id: string; label: string; icon: string; desc: string }) =>
      `<button type="button" class="wa-pill-btn wa-fx-preset-pill" data-preset="${p.id}" title="${p.desc}">${p.icon} ${p.label}</button>`,
  ).join("");

  const fxTierButtonsHtml = DECK_HARDWARE_TIERS.map(
    (t: { id: string; label: string; badge: string; desc: string }, idx: number) =>
      `<button type="button" class="wa-pill-btn wa-fx-tier-btn${idx === 0 ? " is-on" : ""}" data-tier="${t.id}" title="${t.desc}">${t.label} (${t.badge})</button>`,
  ).join("");

  const fxCatButtonsHtml = VIZ_CATEGORIES.map(
    (c: { id: string; label: string; icon: string }, idx: number) =>
      `<button type="button" class="wa-pill-btn wa-fx-cat-btn${idx === 0 ? " is-on" : ""}" data-cat="${c.id}" title="Filter visualizers by ${c.label}">${c.icon} ${c.label}</button>`,
  ).join("");

  const bandSlidersHtml = (EQ_BANDS as number[])
    .map((hz: number, i: number) => {
      const label = hz >= 1000 ? `${hz / 1000}k` : String(hz);
      const unit = hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
      return `<div class="wa-band-col">
        <span class="wa-band-val" id="val-eq-${i}">0dB</span>
        <input id="slider-eq-${i}" type="range" class="wa-vslider" min="-12" max="12" step="1" value="0" orient="vertical" aria-label="${unit} gain" title="Adjust the ${unit} equaliser band between -12 dB and +12 dB.">
        <span class="wa-band-lbl">${label}</span>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Media Player Studio Pro</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f17;
      --panel: #151c2c;
      --border: #2e3a52;
      --hover: #1e293b;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #00ff44;
    }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: #0b0f17;
      color: #f1f5f9;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    ${playerCss}
    .wa-shell {
      min-height: 100vh;
      padding: 0.85rem;
    }
    .wa-folder-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
    }
    .wa-folder-input {
      flex: 1 1 14rem;
      background: var(--wa-lcd-bg);
      color: var(--wa-led);
      border: 1px solid var(--wa-lcd-border);
      border-radius: calc(var(--wa-radius) * 0.75);
      padding: 0.32rem 0.55rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
    }
  </style>
</head>
<body>
  <div id="ampdeck-studio" class="wa-shell" data-skin="classic" tabindex="-1">
    <header class="wa-titlebar">
      <div class="wa-brand">
        <span class="wa-bolt" aria-hidden="true">⚡</span>
        <span class="wa-brand-title">AMPDECK STUDIO PRO // CODECAINE AUDIO RACK</span>
        <button id="btn-studio-clock" type="button" class="wa-studio-clock" title="Live Studio Clock & Date — click to toggle between 12-hour and 24-hour time.">🕒 --:--</button>
      </div>
      <div class="wa-titlebar-actions">
        <div class="wa-rack-toggles" role="group" aria-label="Rack modules">
          <button id="btn-rack-fx" type="button" class="wa-pill-btn" aria-pressed="false" title="Show or hide the 108-Mode Visualizer & Multi-Layer Atmospheric FX Studio rack (X).">✨ FX</button>
          <button id="btn-rack-eq" type="button" class="wa-pill-btn is-on" aria-pressed="true" title="Show or hide the 10-band graphic equaliser rack with preamp, live spline curve and DSP boosts.">EQ</button>
          <button id="btn-rack-pl" type="button" class="wa-pill-btn is-on" aria-pressed="true" title="Show or hide the playlist editor with Jump-to-File search and M3U8 playlist management.">PL</button>
          <button id="btn-rack-lyr" type="button" class="wa-pill-btn is-on" aria-pressed="true" title="Show or hide the synced karaoke LRC and embedded lyrics panel.">LYR</button>
          <button id="btn-rack-shade" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle Window Shade mode to collapse the player into a compact single-line toolbar.">SHADE</button>
        </div>
        <select id="select-skin" class="wa-skin-select" aria-label="Visual skin" title="Choose from 16 studio visual skins including Outrun 1984, Dracula, Tokyo Night, Apple Pro Titanium, and Cyberpunk Neon.">
          ${skinOptions}
        </select>
      </div>
    </header>

    <div class="wa-racks">
      <!-- MAIN RACK -->
      <section class="wa-rack wa-main-rack" aria-label="Main Deck">
        <div class="wa-display">
          <div class="wa-lcd-left">
            <button id="btn-led-clock" type="button" class="wa-led-clock" title="Click to toggle the digital LED clock between elapsed track time and remaining track time.">00:00</button>
            <div id="lbl-play-state" class="wa-play-state">■ READY</div>
          </div>
          <div class="wa-lcd-right">
            <div class="wa-marquee-wrap">
              <div id="lbl-marquee" class="wa-marquee">*** AMPDECK STUDIO PRO — SELECT OR LOAD A TRACK TO PLAY ***</div>
            </div>
            <div class="wa-badges">
              <span id="badge-kbps" class="wa-badge">--- KBPS</span>
              <span id="badge-khz" class="wa-badge">48 KHZ</span>
              <span id="badge-stereo" class="wa-badge wa-badge-active">STEREO</span>
              <span id="badge-pitch" class="wa-badge">LOCK</span>
              <span id="badge-fx-count" class="wa-badge wa-badge-active">1FX</span>
              <span id="badge-loop" class="wa-badge" hidden>A–B</span>
            </div>
            <p id="lbl-msg" class="wa-msg" role="status" hidden></p>
          </div>
        </div>

        <div id="stage-box" class="wa-stage">
          <canvas id="canvas-viz" class="wa-viz" width="540" height="170"></canvas>
          <video id="media-el" class="wa-media" preload="metadata" playsinline></video>
          <div id="art-box" class="wa-art" aria-hidden="true">🎵</div>
          <div class="wa-stage-overlay">
            <div class="wa-viz-controls">
              <select id="select-viz-mode" class="wa-viz-select" aria-label="Visualizer preset" title="Choose from 108 real-time audio visualizers and 12 multi-layer signature mixes.">
                <option id="opt-custom-mix" value="spectrum" hidden>🔀 Custom Mix</option>
                <optgroup label="✨ Multi-Layer Signature Mixes (3FX)">
                  ${vizMixOptions}
                </optgroup>
                <optgroup label="🎛️ 108 Audio Visualizers & Atmospheric FX">
                  ${vizOptions}
                </optgroup>
              </select>
              <button id="btn-viz-mode" type="button" class="wa-viz-mode-btn" title="Step to the next real-time audio visualizer preset.">⏭ Viz</button>
              <button id="btn-viz-surprise" type="button" class="wa-viz-mode-btn" title="Generate a random 3-layer Visualizer + Atmospheric Stage FX combination.">🎲 Mix</button>
              <button id="btn-viz-fx-open" type="button" class="wa-viz-mode-btn" title="Open the 108-Mode Visualizer & Multi-Layer FX Studio Rack.">✨ 108 FX</button>
              <button id="btn-viz-auto" type="button" class="wa-viz-mode-btn" aria-pressed="false" title="Automatically cycle through audio visualizers every 7 seconds.">🔄 Auto</button>
            </div>
            <div class="wa-video-tools">
              <button id="btn-video-pip" type="button" class="wa-pill-btn" title="Pop the playing video out into a floating Picture-in-Picture window on your screen.">⧉ PiP</button>
              <button id="btn-video-fs" type="button" class="wa-pill-btn" title="Toggle full-screen view for the visualizer stage or video display.">⛶ Full</button>
            </div>
          </div>
        </div>

        <div class="wa-seek-row">
          <span id="lbl-elapsed" class="wa-time">0:00</span>
          <div class="wa-seek-wrap">
            <input id="slider-seek" type="range" class="wa-slider wa-seek" min="0" max="1000" value="0" aria-label="Seek timeline" title="Scrub through the current audio or video track timeline.">
            <div id="bar-ab" class="wa-ab-bar" hidden></div>
          </div>
          <span id="lbl-duration" class="wa-time">0:00</span>
        </div>

        <div class="wa-mix-row">
          <div class="wa-mix-cell">
            <button id="btn-mute" type="button" class="wa-btn wa-btn-sm" aria-label="Mute (M)" title="Mute or unmute the audio output while keeping your volume level saved.">🔊</button>
            <input id="slider-volume" type="range" class="wa-slider" min="0" max="100" value="85" aria-label="Volume" title="Adjust the master playback volume from 0 to 100 percent.">
            <span id="lbl-vol" class="wa-mix-val">85%</span>
          </div>
          <div class="wa-mix-cell">
            <span class="wa-mix-label">PAN</span>
            <input id="slider-balance" type="range" class="wa-slider" min="-100" max="100" step="5" value="0" aria-label="Stereo balance" title="Pan the stereo image between the left and right speakers, or double-click to re-center.">
            <span id="lbl-bal" class="wa-mix-val">CTR</span>
          </div>
          <div class="wa-mix-cell">
            <select id="select-speed" class="wa-select" aria-label="Playback speed" title="Change the playback speed from 0.5x up to 2x.">
              <option value="0.5">0.5×</option>
              <option value="0.75">0.75×</option>
              <option value="0.9">0.9×</option>
              <option value="1" selected>1×</option>
              <option value="1.1">1.1×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.5×</option>
              <option value="1.75">1.75×</option>
              <option value="2">2×</option>
            </select>
            <button id="btn-vinyl-pitch" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle Vinyl Turntable pitch mode so speed changes shift musical pitch naturally like an analog record.">💿 Vinyl</button>
          </div>
        </div>

        <div class="wa-transport-row">
          <div class="wa-transport-main">
            <button id="btn-prev" type="button" class="wa-btn" title="Jump to the previous track in the playlist, or restart the current track if past 3 seconds.">⏮</button>
            <button id="btn-play" type="button" class="wa-btn wa-btn-play" title="Play or pause the active audio or video track (Space).">▶</button>
            <button id="btn-stop" type="button" class="wa-btn" title="Stop playback and rewind the current track to 0:00.">⏹</button>
            <button id="btn-next" type="button" class="wa-btn" title="Advance to the next track in the play queue (N).">⏭</button>
          </div>
          <div class="wa-transport-modes">
            <button id="btn-ab-loop" type="button" class="wa-btn wa-btn-sm" title="Mark loop start A, mark loop end B, or clear the A-B repeat section.">A–B</button>
            <button id="btn-shuffle" type="button" class="wa-btn wa-btn-sm" aria-pressed="false" title="Toggle randomized shuffle order across the playlist without repeating tracks.">🔀 SHUF</button>
            <button id="btn-repeat" type="button" class="wa-btn wa-btn-sm is-on" title="Cycle repeat mode between Repeat All, Repeat One, and Off.">🔁 REP ALL</button>
          </div>
        </div>
      </section>

      <!-- 108-MODE VISUALIZER & ATMOSPHERIC FX STUDIO RACK -->
      <section id="rack-fx" class="wa-rack wa-fx-rack" aria-label="108-Mode Visualizer and Atmospheric FX Studio" hidden>
        <header class="wa-rack-head">
          <span class="wa-rack-title">✨ VISUALIZER & ATMOSPHERIC FX STUDIO // 108 MODES + ${MAX_VIZ_LAYERS}-LAYER MIXER</span>
          <div class="wa-rack-controls">
            <button id="btn-fx-mix-mode" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle Multi-Layer Mix Mode so clicking any card layers up to 4 simultaneous effects.">🔀 Mix Mode (Up to ${MAX_VIZ_LAYERS})</button>
            <button id="btn-fx-surprise" type="button" class="wa-pill-btn" title="Create a random 3-layer mix of an atmospheric backdrop, harmonic wave, and studio analyzer.">🎲 Surprise 3-Layer Mix</button>
            <button id="btn-fx-reset" type="button" class="wa-pill-btn" title="Reset to single Classic Spectrum analyzer.">↺ Reset</button>
          </div>
        </header>
        <div class="wa-fx-mixer-dock">
          <div class="wa-fx-dock-label">ACTIVE LAYER STACK (BACK → FRONT):</div>
          <div id="box-fx-active-layers" class="wa-fx-active-layers"></div>
          <div class="wa-fx-dock-label">SIGNATURE 3-LAYER STUDIO MIXES:</div>
          <div id="box-fx-presets" class="wa-fx-presets-row">${fxPresetButtonsHtml}</div>
        </div>
        <div class="wa-fx-toolbar">
          <div id="box-fx-tiers" class="wa-fx-tier-row" role="group" aria-label="Hardware graphics tier">${fxTierButtonsHtml}</div>
          <div class="wa-fx-filter-bar">
            <input id="input-fx-search" type="search" class="wa-pl-filter wa-fx-search" placeholder="Search 108 visualizers & weather effects (rain, synthwave, wormhole, M4 metaballs, VU, matrix)..." aria-label="Search visualizers" title="Search across all 108 real-time audio visualizers and atmospheric stage effects.">
            <div id="box-fx-cats" class="wa-fx-cat-row" role="group" aria-label="Visualizer categories">${fxCatButtonsHtml}</div>
          </div>
        </div>
        <div id="box-fx-sections" class="wa-fx-sections"></div>
      </section>

      <!-- 10-BAND GRAPHIC EQUALIZER RACK -->
      <section id="rack-eq" class="wa-rack wa-eq-rack" aria-label="10-Band Equalizer">
        <header class="wa-rack-head">
          <span class="wa-rack-title">🎚 GRAPHIC EQUALIZER // 10-BAND + PREAMP</span>
          <div class="wa-rack-controls">
            <label class="wa-eq-toggle">
              <input id="chk-eq-on" type="checkbox" checked title="Enable or bypass the 10-band Web Audio graphic equaliser and preamp stage."> ON
            </label>
            <select id="select-eq-preset" class="wa-select" aria-label="Equaliser preset" title="Load one of 32 classic and studio equaliser presets such as Rock, Techno, Full Bass & Treble, or Headphones.">
              ${presetOptions}
            </select>
            <button id="btn-eq-flat" type="button" class="wa-pill-btn" title="Reset the preamp and all ten equaliser frequency bands back to 0 dB flat response.">Flat</button>
          </div>
        </header>
        <div class="wa-eq-body">
          <canvas id="canvas-eq-spline" class="wa-eq-curve" width="320" height="62"></canvas>
          <div class="wa-eq-bands">
            <div class="wa-band-col wa-preamp-col">
              <span id="val-preamp" class="wa-band-val">0dB</span>
              <input id="slider-preamp" type="range" class="wa-vslider" min="-12" max="12" step="1" value="0" orient="vertical" aria-label="Preamp gain" title="Boost or cut the master preamp gain between -12 dB and +12 dB before the 10-band equaliser.">
              <span class="wa-band-lbl">PRE</span>
            </div>
            ${bandSlidersHtml}
          </div>
        </div>
        <div class="wa-dsp-row">
          <span class="wa-dsp-title">DSP FX:</span>
          <button id="btn-dsp-bass" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle the 80 Hz low-shelf Sub-Bass harmonic warmth boost (+5 dB).">🔊 Sub-Bass +5dB</button>
          <button id="btn-dsp-treble" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle the 10 kHz high-shelf Air Exciter treble sparkle boost (+4 dB).">✨ Air Exciter +4dB</button>
          <button id="btn-dsp-vocal" type="button" class="wa-pill-btn" aria-pressed="false" title="Toggle the 2.2 kHz peaking Vocal Presence boost (+3.5 dB).">🎙️ Vocal Presence</button>
        </div>
      </section>

      <!-- PLAYLIST EDITOR RACK -->
      <section id="rack-pl" class="wa-rack wa-pl-rack" aria-label="Playlist Editor">
        <header class="wa-rack-head">
          <span class="wa-rack-title">☰ PLAYLIST EDITOR // M3U8</span>
          <div class="wa-rack-controls">
            <button id="btn-load-library" type="button" class="wa-pill-btn" title="Load all audio and video tracks from the project music lyrics library into the playlist.">🎵 Music Library</button>
            <button id="btn-import-m3u" type="button" class="wa-pill-btn" title="Import an M3U or M3U8 playlist file from disk into the play queue.">📂 Load .M3U</button>
            <button id="btn-export-m3u" type="button" class="wa-pill-btn" title="Export the current play queue as a standard UTF-8 .m3u8 playlist file.">💾 Save .M3U8</button>
            <button id="btn-clear-pl" type="button" class="wa-pill-btn" title="Clear all tracks from the current playlist editor.">🗑 Clear</button>
          </div>
        </header>
        <div class="wa-folder-bar">
          <input id="input-folder-path" type="text" class="wa-folder-input" value="${defaultFolder.replace(/"/g, "&quot;")}" placeholder="Folder path to scan for audio/video..." aria-label="Media folder path" title="Type or paste a folder path on your computer to scan for audio, video, LRC lyrics and M3U playlists.">
          <button id="btn-scan-folder" type="button" class="wa-pill-btn" title="Scan the entered folder path and load its playable media tracks into the playlist.">📂 Scan Folder</button>
        </div>
        <div class="wa-pl-toolbar">
          <input id="input-pl-filter" type="search" class="wa-pl-filter" placeholder="Jump to file (filter by title, artist or format)..." aria-label="Filter playlist" title="Jump to file: filter the playlist tracks in real time by song title, artist, or file extension.">
          <span id="lbl-pl-stats" class="wa-pl-stats">0 tracks</span>
        </div>
        <ol id="list-playlist" class="wa-pl-list" aria-label="Playlist tracks"></ol>
        <div id="lbl-pl-empty" class="wa-pl-empty">No tracks loaded yet — click 🎵 Music Library or 📂 Scan Folder above.</div>
      </section>

      <!-- KARAOKE LYRICS RACK -->
      <section id="rack-lyr" class="wa-rack wa-lyr-rack" aria-label="Lyrics and Subtitles">
        <header class="wa-rack-head">
          <span class="wa-rack-title">♪ SYNCED LRC & LYRICS</span>
          <div class="wa-rack-controls">
            <select id="select-lyrics-src" class="wa-select" aria-label="Lyrics source" title="Switch between synced .lrc karaoke lyrics, embedded ID3 or Vorbis lyrics, and subtitle transcripts.">
              <option value="default">Auto Lyrics</option>
            </select>
          </div>
        </header>
        <div id="box-lyrics" class="wa-lyr-body">
          <pre class="wa-lyr-plain">Synced .lrc or embedded lyrics will appear here when a track plays.</pre>
        </div>
      </section>
    </div>
  </div>

  <script type="module">
    import {
      EQ_BANDS, EQ_PRESETS, MAX_VIZ_LAYERS, VIZ_MIX_PRESETS, VIZ_MODES, PlayQueue,
      activeLrcIndex, clampBalance, clampGain, detectDeckHardwareTier, formatClock, formatLedClock,
      formatVizLabel, normalizeVizSpec, parseLrc, parseVizLayers, computeEqSpline, renderAudioVisualizer
    } from "${apiBase}/ui/mediacore.js";

    const API_BASE = ${JSON.stringify(apiBase)};
    const TOKEN = ${JSON.stringify(token)};
    const $ = (sel) => document.querySelector(sel);

    const shell = $("#ampdeck-studio");
    const media = $("#media-el");
    const vizCanvas = $("#canvas-viz");
    const eqCanvas = $("#canvas-eq-spline");
    const ledClock = $("#btn-led-clock");
    const playState = $("#lbl-play-state");
    const marquee = $("#lbl-marquee");
    const kbpsBadge = $("#badge-kbps");
    const khzBadge = $("#badge-khz");
    const pitchBadge = $("#badge-pitch");
    const loopBadge = $("#badge-loop");
    const seekSlider = $("#slider-seek");
    const abBar = $("#bar-ab");
    const elapsedLbl = $("#lbl-elapsed");
    const durationLbl = $("#lbl-duration");
    const volSlider = $("#slider-volume");
    const volLbl = $("#lbl-vol");
    const balSlider = $("#slider-balance");
    const balLbl = $("#lbl-bal");
    const speedSelect = $("#select-speed");
    const vinylBtn = $("#btn-vinyl-pitch");
    const playBtn = $("#btn-play");
    const shuffleBtn = $("#btn-shuffle");
    const repeatBtn = $("#btn-repeat");
    const eqOnChk = $("#chk-eq-on");
    const eqPresetSel = $("#select-eq-preset");
    const preampSlider = $("#slider-preamp");
    const preampVal = $("#val-preamp");
    const bandSliders = EQ_BANDS.map((_, i) => $("#slider-eq-" + i));
    const bandVals = EQ_BANDS.map((_, i) => $("#val-eq-" + i));
    const plList = $("#list-playlist");
    const plEmpty = $("#lbl-pl-empty");
    const plStats = $("#lbl-pl-stats");
    const plFilter = $("#input-pl-filter");
    const folderInput = $("#input-folder-path");
    const lyricsBox = $("#box-lyrics");
    const vizSelect = $("#select-viz-mode");
    const vizAutoBtn = $("#btn-viz-auto");
    const fxCountBadge = $("#badge-fx-count");
    const customMixOpt = $("#opt-custom-mix");
    const studioClockBtn = $("#btn-studio-clock");
    const fxRack = $("#rack-fx");
    const fxActiveLayersBox = $("#box-fx-active-layers");
    const fxSectionsBox = $("#box-fx-sections");
    const fxSearchInput = $("#input-fx-search");

    const state = {
      skin: "classic",
      vizMode: "spectrum",
      hwTier: "auto",
      vizMixMode: false,
      fxCategory: "all",
      fxSearch: "",
      clock24h: false,
      vizAutoCycle: false,
      remainingTime: false,
      volume: 0.85,
      muted: false,
      balance: 0,
      rate: 1,
      vinylPitch: false,
      eqOn: true,
      preamp: 0,
      eq: (EQ_PRESETS["Full Bass & Treble"] || EQ_PRESETS.Flat).slice(),
      preset: "Full Bass & Treble",
      dspBass: false,
      dspTreble: false,
      dspVocal: false,
      loopA: null,
      loopB: null,
      tracks: [],
      subtitles: [],
      currentIndex: -1,
      lrcCues: [],
    };

    function updateStudioClock() {
      if (!studioClockBtn) return;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: !state.clock24h });
      const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      studioClockBtn.textContent = "🕒 " + timeStr + " · " + dateStr;
    }
    updateStudioClock();
    setInterval(updateStudioClock, 15000);
    if (studioClockBtn) {
      studioClockBtn.addEventListener("click", () => {
        state.clock24h = !state.clock24h;
        updateStudioClock();
      });
    }

    let queue = new PlayQueue(0, 0);
    let graph = null;
    let raf = 0;
    let vizPhase = 0;
    let lastAutoCycleMs = 0;
    const peaks = new Float32Array(64);

    function syncSlider(el) {
      if (!el) return;
      el.style.setProperty("--attr-min", el.min || "0");
      el.style.setProperty("--attr-max", el.max || "100");
      el.style.setProperty("--control-value", el.value || "0");
    }

    function drawEqSpline() {
      const g2 = eqCanvas.getContext("2d");
      if (!g2) return;
      const w = eqCanvas.width;
      const h = eqCanvas.height;
      g2.clearRect(0, 0, w, h);
      g2.fillStyle = "rgba(8, 12, 22, 0.9)";
      g2.fillRect(0, 0, w, h);
      const { points, anchors, zeroY } = computeEqSpline(state.preamp, state.eq, w, h);
      g2.strokeStyle = "rgba(148, 163, 184, 0.3)";
      g2.beginPath();
      g2.moveTo(0, zeroY);
      g2.lineTo(w, zeroY);
      g2.stroke();
      g2.strokeStyle = state.eqOn ? "#00ff44" : "#64748b";
      g2.lineWidth = 2;
      g2.beginPath();
      points.forEach((pt, idx) => (idx === 0 ? g2.moveTo(pt.x, pt.y) : g2.lineTo(pt.x, pt.y)));
      g2.stroke();
      for (const pt of anchors) {
        g2.fillStyle = state.eqOn ? "#facc15" : "#94a3b8";
        g2.fillRect(pt.x - 2, pt.y - 2, 4, 4);
      }
    }

    function ensureAudioGraph() {
      if (graph) return graph;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const ctx = new Ctx();
        const source = ctx.createMediaElementSource(media);
        const preampNode = ctx.createGain();
        const filters = EQ_BANDS.map((hz, i) => {
          const f = ctx.createBiquadFilter();
          f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
          f.frequency.value = hz;
          f.Q.value = 1.4;
          return f;
        });
        const dspBass = ctx.createBiquadFilter();
        dspBass.type = "lowshelf";
        dspBass.frequency.value = 80;
        const dspTreble = ctx.createBiquadFilter();
        dspTreble.type = "highshelf";
        dspTreble.frequency.value = 10000;
        const dspVocal = ctx.createBiquadFilter();
        dspVocal.type = "peaking";
        dspVocal.frequency.value = 2200;
        dspVocal.Q.value = 1.2;
        const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;

        let node = source;
        node.connect(preampNode);
        node = preampNode;
        for (const f of filters) {
          node.connect(f);
          node = f;
        }
        node.connect(dspBass);
        dspBass.connect(dspTreble);
        dspTreble.connect(dspVocal);
        if (panner) {
          dspVocal.connect(panner);
          panner.connect(analyser);
        } else {
          dspVocal.connect(analyser);
        }
        analyser.connect(ctx.destination);
        khzBadge.textContent = Math.round((ctx.sampleRate || 48000) / 1000) + " KHZ";
        graph = { ctx, preampNode, filters, dspBass, dspTreble, dspVocal, panner, analyser };
        applyEq();
      } catch {
        graph = null;
      }
      return graph;
    }

    function applyEq() {
      if (graph) {
        const linear = state.eqOn ? Math.pow(10, state.preamp / 20) : 1;
        graph.preampNode.gain.value = linear;
        graph.filters.forEach((f, i) => {
          f.gain.value = state.eqOn ? state.eq[i] : 0;
        });
        graph.dspBass.gain.value = state.dspBass ? 5 : 0;
        graph.dspTreble.gain.value = state.dspTreble ? 4 : 0;
        graph.dspVocal.gain.value = state.dspVocal ? 3.5 : 0;
        if (graph.panner) graph.panner.pan.value = Math.max(-1, Math.min(1, state.balance / 100));
      }
      preampSlider.value = String(state.preamp);
      preampVal.textContent = (state.preamp > 0 ? "+" : "") + state.preamp + "dB";
      syncSlider(preampSlider);
      bandSliders.forEach((s, i) => {
        s.value = String(state.eq[i]);
        bandVals[i].textContent = (state.eq[i] > 0 ? "+" : "") + state.eq[i] + "dB";
        syncSlider(s);
      });
      eqPresetSel.value = Object.keys(EQ_PRESETS).includes(state.preset) ? state.preset : "Custom";
      drawEqSpline();
    }

    function setVizMode(spec) {
      const normalized = normalizeVizSpec(spec);
      if (!normalized) return;
      state.vizMode = normalized;
      const layers = parseVizLayers(normalized);
      if (fxCountBadge) fxCountBadge.textContent = layers.length + "FX";
      if (vizSelect) {
        const hasOpt = [...vizSelect.options].some((o) => o.value === normalized && o !== customMixOpt);
        if (hasOpt) {
          if (customMixOpt) customMixOpt.hidden = true;
          vizSelect.value = normalized;
        } else if (customMixOpt) {
          customMixOpt.value = normalized;
          customMixOpt.textContent = "🔀 " + formatVizLabel(normalized);
          customMixOpt.hidden = false;
          vizSelect.value = normalized;
        }
      }
      if (fxRack && !fxRack.hidden) renderFxRack();
      if (media.paused) drawVisualizerFrame();
    }

    function toggleVizLayer(modeId) {
      const current = parseVizLayers(state.vizMode);
      const idx = current.indexOf(modeId);
      if (idx >= 0) {
        if (current.length === 1) return;
        current.splice(idx, 1);
      } else {
        if (current.length >= MAX_VIZ_LAYERS) current.shift();
        current.push(modeId);
      }
      setVizMode(current.join("+"));
    }

    function surpriseVizMix() {
      const backdrops = VIZ_MODES.filter((m) => (m.depth ?? 2) === 1);
      const middles = VIZ_MODES.filter((m) => (m.depth ?? 2) === 2);
      const foregrounds = VIZ_MODES.filter((m) => (m.depth ?? 2) === 3);
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.id || "spectrum";
      setVizMode([pick(backdrops), pick(middles), pick(foregrounds)].join("+"));
    }

    function renderFxRack() {
      if (!fxSectionsBox || !fxActiveLayersBox) return;
      const activeLayers = parseVizLayers(state.vizMode);
      const normalized = activeLayers.join("+");

      fxActiveLayersBox.replaceChildren();
      activeLayers.forEach((id, idx) => {
        const m = VIZ_MODES.find((item) => item.id === id) || { id, label: id, icon: "✨" };
        const chip = document.createElement("span");
        chip.className = "wa-fx-layer-chip";
        const num = document.createElement("span");
        num.className = "wa-fx-layer-num";
        num.textContent = "L" + (idx + 1);
        chip.append(num, " " + (m.icon || "✨") + " " + m.label);
        if (activeLayers.length > 1) {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "wa-fx-layer-remove";
          rm.textContent = "×";
          rm.addEventListener("click", () => toggleVizLayer(id));
          chip.append(rm);
        }
        fxActiveLayersBox.append(chip);
      });

      document.querySelectorAll(".wa-fx-preset-pill").forEach((btn) => {
        btn.classList.toggle("is-on", normalizeVizSpec(btn.dataset.preset) === normalized);
      });
      document.querySelectorAll(".wa-fx-tier-btn").forEach((btn) => {
        btn.classList.toggle("is-on", btn.dataset.tier === state.hwTier);
      });
      document.querySelectorAll(".wa-fx-cat-btn").forEach((btn) => {
        btn.classList.toggle("is-on", btn.dataset.cat === state.fxCategory);
      });

      const q = (state.fxSearch || "").trim().toLowerCase();
      const tiers = [
        { tier: "ultra", title: "🚀 HIGH-END & MODERN ARM ULTRA (APPLE M-SERIES / 120FPS RAYMARCHED & COSMIC FX)" },
        { tier: "medium", title: "⚡ MEDIUM GRAPHICS (BALANCED 60FPS STAGE, WEATHER & SYNTHWAVE HORIZONS)" },
        { tier: "low", title: "🔋 LOW GRAPHICS (ECO-FRIENDLY STUDIO ANALYZERS, CRT SCOPES & CHILL AMBIENCE)" },
      ];
      fxSectionsBox.replaceChildren();
      for (const sec of tiers) {
        const items = VIZ_MODES.filter((m) => {
          if ((m.tier || "medium") !== sec.tier) return false;
          if (state.fxCategory !== "all" && m.cat !== state.fxCategory) return false;
          if (q && !(m.label + " " + (m.desc || "") + " " + (m.badge || "")).toLowerCase().includes(q)) return false;
          return true;
        });
        if (!items.length) continue;
        const secEl = document.createElement("div");
        secEl.className = "wa-fx-tier-section";
        const head = document.createElement("div");
        head.className = "wa-fx-tier-header";
        const title = document.createElement("div");
        title.className = "wa-fx-tier-title";
        title.textContent = sec.title + " (" + items.length + ")";
        head.append(title);
        const grid = document.createElement("div");
        grid.className = "wa-fx-grid";
        for (const m of items) {
          const layerIdx = activeLayers.indexOf(m.id);
          const isSel = layerIdx >= 0;
          const card = document.createElement("div");
          card.className = "wa-fx-card" + (isSel ? " is-active" : "");
          const prev = document.createElement("div");
          prev.className = "wa-fx-card-preview";
          const c1 = (m.params && m.params.color1) || "#00f5ff";
          const c2 = (m.params && m.params.color2) || "#ec4899";
          prev.style.background = "radial-gradient(circle at 22% 35%, " + c1 + "44, transparent 65%), linear-gradient(135deg, #070b14 0%, " + c2 + "33 100%)";
          const ico = document.createElement("span");
          ico.className = "wa-fx-card-icon";
          ico.textContent = m.icon || "✨";
          const bdg = document.createElement("span");
          bdg.className = "wa-fx-card-badge";
          bdg.textContent = m.badge || sec.tier.toUpperCase();
          const mixBtn = document.createElement("button");
          mixBtn.type = "button";
          mixBtn.className = "wa-fx-card-mix-btn" + (isSel ? " is-on" : "");
          mixBtn.textContent = isSel ? "✓ Layer " + (layerIdx + 1) : "+ Mix";
          mixBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            toggleVizLayer(m.id);
          });
          prev.append(ico, bdg, mixBtn);
          const body = document.createElement("div");
          body.className = "wa-fx-card-body";
          const t = document.createElement("div");
          t.className = "wa-fx-card-title";
          t.textContent = m.label;
          const d = document.createElement("div");
          d.className = "wa-fx-card-desc";
          d.textContent = m.desc || "";
          body.append(t, d);
          card.append(prev, body);
          card.addEventListener("click", () => {
            if (state.vizMixMode) toggleVizLayer(m.id);
            else setVizMode(m.id);
          });
          grid.append(card);
        }
        secEl.append(head, grid);
        fxSectionsBox.append(secEl);
      }
    }

    function drawVisualizerFrame() {
      raf = 0;
      const curTrack = state.tracks[state.currentIndex];
      if (curTrack && curTrack.kind === "video") return;
      const playing = !media.paused && !!graph;
      if (playing) raf = requestAnimationFrame(drawVisualizerFrame);
      vizPhase++;
      if (playing && state.vizAutoCycle && performance.now() - lastAutoCycleMs > 7000) {
        lastAutoCycleMs = performance.now();
        const primary = parseVizLayers(state.vizMode)[0] || "spectrum";
        const idx = VIZ_MODES.findIndex((m) => m.id === primary);
        const next = VIZ_MODES[(idx + 1) % VIZ_MODES.length];
        setVizMode(next.id);
      }
      const binCount = graph ? graph.analyser.frequencyBinCount : 128;
      const freq = new Uint8Array(binCount);
      const time = new Uint8Array(binCount);
      if (playing) {
        graph.analyser.getByteFrequencyData(freq);
        graph.analyser.getByteTimeDomainData(time);
      } else {
        for (let i = 0; i < binCount; i++) {
          freq[i] = Math.max(12, Math.round(95 * Math.exp(-i / 42) + 45 * Math.sin(i * 0.28 + 0.8) * Math.sin(i * 0.11)));
          time[i] = Math.round(128 + 38 * Math.sin(i * 0.22) * Math.cos(i * 0.07));
        }
      }
      const g2 = vizCanvas.getContext("2d");
      if (!g2) return;
      const accent = getComputedStyle(shell).getPropertyValue("--wa-led").trim() || "#00ff44";
      renderAudioVisualizer(g2, vizCanvas.width, vizCanvas.height, state.vizMode, freq, time, peaks, accent, vizPhase);
    }

    function renderPlaylist() {
      const q = (plFilter.value || "").trim().toLowerCase();
      plStats.textContent = state.tracks.length + " track" + (state.tracks.length === 1 ? "" : "s");
      plEmpty.hidden = state.tracks.length > 0;
      plList.replaceChildren();
      state.tracks.forEach((tr, idx) => {
        if (q && !tr.name.toLowerCase().includes(q)) return;
        const li = document.createElement("li");
        li.className = "wa-pl-row" + (idx === state.currentIndex ? " is-current" : "");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wa-pl-play";
        btn.title = "Play " + tr.name;
        const num = document.createElement("span");
        num.className = "wa-pl-num";
        num.textContent = String(idx + 1).padStart(2, "0") + ".";
        const name = document.createElement("span");
        name.className = "wa-pl-name";
        name.textContent = tr.name;
        btn.append(num, name);
        btn.addEventListener("click", () => playTrack(idx));
        li.append(btn);
        plList.append(li);
      });
    }

    async function loadLyricsForTrack(track) {
      state.lrcCues = [];
      lyricsBox.replaceChildren();
      const base = track.name.replace(/\\.[^.]+$/, "").toLowerCase();
      const match = state.subtitles.find((s) => s.name.replace(/\\.[^.]+$/, "").toLowerCase() === base);
      if (!match) {
        const pre = document.createElement("pre");
        pre.className = "wa-lyr-plain";
        pre.textContent = "Now playing: " + track.name + "\\n(Drop a matching .lrc or .srt file in the folder for synced karaoke lyrics.)";
        lyricsBox.append(pre);
        return;
      }
      try {
        const res = await fetch(API_BASE + "/api/lyrics?path=" + encodeURIComponent(match.path) + "&token=" + encodeURIComponent(TOKEN));
        if (!res.ok) return;
        const text = await res.text();
        const cues = parseLrc(text);
        if (Array.isArray(cues) && cues.length) {
          state.lrcCues = cues;
          const wrap = document.createElement("div");
          wrap.className = "wa-lyr-sync";
          cues.forEach((c, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "wa-lyr-line";
            b.dataset.idx = String(i);
            b.textContent = c.text || "♪";
            b.title = "Jump to " + formatClock(c.time);
            b.addEventListener("click", () => { media.currentTime = c.time; });
            wrap.append(b);
          });
          lyricsBox.append(wrap);
        } else {
          const pre = document.createElement("pre");
          pre.className = "wa-lyr-plain";
          pre.textContent = text;
          lyricsBox.append(pre);
        }
      } catch {}
    }

    async function playTrack(idx) {
      if (idx < 0 || idx >= state.tracks.length) return;
      media.pause();
      state.currentIndex = idx;
      queue.jumpTo(idx);
      const tr = state.tracks[idx];
      const isVid = tr.kind === "video";
      shell.classList.toggle("is-video", isVid);
      marquee.textContent = "*** " + (idx + 1) + ". " + tr.name.toUpperCase() + " ***";
      media.src = API_BASE + "/api/raw?path=" + encodeURIComponent(tr.path) + "&token=" + encodeURIComponent(TOKEN);
      media.playbackRate = state.rate;
      media.preservesPitch = !state.vinylPitch;
      renderPlaylist();
      loadLyricsForTrack(tr);
      try {
        if (!isVid || state.dspBass || state.dspTreble || state.dspVocal || state.balance !== 0) {
          ensureAudioGraph();
          if (graph && graph.ctx.state === "suspended") await graph.ctx.resume();
        }
        await media.play();
      } catch {}
    }

    async function scanFolder(folderPath) {
      const res = await fetch(API_BASE + "/api/library?folder=" + encodeURIComponent(folderPath || "") + "&token=" + encodeURIComponent(TOKEN));
      if (!res.ok) return;
      const data = await res.json();
      folderInput.value = data.folder || folderPath;
      state.tracks = data.tracks || [];
      state.subtitles = data.subtitles || [];
      queue = new PlayQueue(state.tracks.length, 0);
      renderPlaylist();
      if (state.tracks.length > 0 && state.currentIndex === -1) {
        playTrack(0);
      }
    }

    // Wire events
    $("#select-skin").addEventListener("change", (e) => {
      state.skin = e.target.value;
      shell.dataset.skin = state.skin;
      drawEqSpline();
      if (media.paused) drawVisualizerFrame();
    });
    $("#btn-rack-fx")?.addEventListener("click", (e) => {
      if (!fxRack) return;
      fxRack.hidden = !fxRack.hidden;
      e.currentTarget.classList.toggle("is-on", !fxRack.hidden);
      e.currentTarget.setAttribute("aria-pressed", String(!fxRack.hidden));
      if (!fxRack.hidden) renderFxRack();
    });
    $("#btn-rack-eq").addEventListener("click", (e) => {
      const rack = $("#rack-eq");
      rack.hidden = !rack.hidden;
      e.currentTarget.classList.toggle("is-on", !rack.hidden);
      e.currentTarget.setAttribute("aria-pressed", String(!rack.hidden));
    });
    $("#btn-rack-pl").addEventListener("click", (e) => {
      const rack = $("#rack-pl");
      rack.hidden = !rack.hidden;
      e.currentTarget.classList.toggle("is-on", !rack.hidden);
      e.currentTarget.setAttribute("aria-pressed", String(!rack.hidden));
    });
    $("#btn-rack-lyr").addEventListener("click", (e) => {
      const rack = $("#rack-lyr");
      rack.hidden = !rack.hidden;
      e.currentTarget.classList.toggle("is-on", !rack.hidden);
      e.currentTarget.setAttribute("aria-pressed", String(!rack.hidden));
    });
    $("#btn-rack-shade").addEventListener("click", (e) => {
      const shaded = shell.classList.toggle("is-shade");
      e.currentTarget.classList.toggle("is-on", shaded);
      e.currentTarget.setAttribute("aria-pressed", String(shaded));
    });
    ledClock.addEventListener("click", () => {
      state.remainingTime = !state.remainingTime;
      ledClock.textContent = formatLedClock(media.currentTime, media.duration, state.remainingTime);
    });
    if (vizSelect) {
      vizSelect.addEventListener("change", () => setVizMode(vizSelect.value));
    }
    $("#btn-viz-mode").addEventListener("click", () => {
      const primary = parseVizLayers(state.vizMode)[0] || "spectrum";
      const i = VIZ_MODES.findIndex((m) => m.id === primary);
      const next = VIZ_MODES[(i + 1) % VIZ_MODES.length];
      setVizMode(next.id);
    });
    $("#btn-viz-surprise")?.addEventListener("click", () => surpriseVizMix());
    $("#btn-viz-fx-open")?.addEventListener("click", () => {
      if (fxRack && fxRack.hidden) $("#btn-rack-fx")?.click();
      fxRack?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
    $("#btn-fx-mix-mode")?.addEventListener("click", (e) => {
      state.vizMixMode = !state.vizMixMode;
      e.currentTarget.classList.toggle("is-on", state.vizMixMode);
      e.currentTarget.setAttribute("aria-pressed", String(state.vizMixMode));
      renderFxRack();
    });
    $("#btn-fx-surprise")?.addEventListener("click", () => surpriseVizMix());
    $("#btn-fx-reset")?.addEventListener("click", () => setVizMode("spectrum"));
    document.querySelectorAll(".wa-fx-preset-pill").forEach((btn) => {
      btn.addEventListener("click", () => setVizMode(btn.dataset.preset));
    });
    document.querySelectorAll(".wa-fx-tier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.hwTier = btn.dataset.tier;
        renderFxRack();
      });
    });
    document.querySelectorAll(".wa-fx-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.fxCategory = btn.dataset.cat;
        renderFxRack();
      });
    });
    fxSearchInput?.addEventListener("input", () => {
      state.fxSearch = fxSearchInput.value;
      renderFxRack();
    });
    if (vizAutoBtn) {
      vizAutoBtn.addEventListener("click", () => {
        state.vizAutoCycle = !state.vizAutoCycle;
        lastAutoCycleMs = performance.now();
        vizAutoBtn.classList.toggle("is-on", state.vizAutoCycle);
        vizAutoBtn.setAttribute("aria-pressed", String(state.vizAutoCycle));
      });
    }
    vizCanvas.addEventListener("click", () => $("#btn-viz-mode").click());
    $("#btn-video-pip").addEventListener("click", () => {
      if (document.pictureInPictureElement) document.exitPictureInPicture?.().catch(() => {});
      else media.requestPictureInPicture?.().catch(() => {});
    });
    $("#btn-video-fs").addEventListener("click", () => {
      const stage = $("#stage-box");
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else stage.requestFullscreen?.().catch(() => {});
    });
    seekSlider.addEventListener("input", () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        media.currentTime = (Number(seekSlider.value) / 1000) * media.duration;
      }
      syncSlider(seekSlider);
    });
    $("#btn-mute").addEventListener("click", () => {
      state.muted = !state.muted;
      media.muted = state.muted;
      $("#btn-mute").textContent = state.muted ? "🔇" : "🔊";
    });
    volSlider.addEventListener("input", () => {
      state.volume = Number(volSlider.value) / 100;
      media.volume = state.volume;
      volLbl.textContent = Math.round(state.volume * 100) + "%";
      syncSlider(volSlider);
    });
    balSlider.addEventListener("input", () => {
      state.balance = clampBalance(balSlider.value);
      balLbl.textContent = state.balance === 0 ? "CTR" : state.balance < 0 ? Math.abs(state.balance) + "L" : state.balance + "R";
      syncSlider(balSlider);
      applyEq();
    });
    balSlider.addEventListener("dblclick", () => {
      balSlider.value = "0";
      balSlider.dispatchEvent(new Event("input"));
    });
    speedSelect.addEventListener("change", () => {
      state.rate = Number(speedSelect.value) || 1;
      media.playbackRate = state.rate;
    });
    vinylBtn.addEventListener("click", () => {
      state.vinylPitch = !state.vinylPitch;
      media.preservesPitch = !state.vinylPitch;
      vinylBtn.classList.toggle("is-on", state.vinylPitch);
      vinylBtn.setAttribute("aria-pressed", String(state.vinylPitch));
      pitchBadge.textContent = state.vinylPitch ? "VINYL" : "LOCK";
    });
    $("#btn-prev").addEventListener("click", () => {
      const p = queue.prev(media.currentTime);
      if (!p) return;
      if (p.restart) media.currentTime = 0;
      else playTrack(p.index);
    });
    playBtn.addEventListener("click", () => {
      if (media.paused) {
        if (state.currentIndex === -1 && state.tracks.length) playTrack(0);
        else media.play()?.catch(() => {});
      } else {
        media.pause();
      }
    });
    $("#btn-stop").addEventListener("click", () => {
      media.pause();
      media.currentTime = 0;
      playState.textContent = "■ STOPPED";
    });
    $("#btn-next").addEventListener("click", () => {
      const idx = queue.next(false);
      if (idx >= 0) playTrack(idx);
    });
    $("#btn-ab-loop").addEventListener("click", () => {
      if (state.loopA === null) {
        state.loopA = media.currentTime;
        loopBadge.hidden = false;
        loopBadge.textContent = "A: " + formatClock(state.loopA);
      } else if (state.loopB === null && media.currentTime > state.loopA + 0.2) {
        state.loopB = media.currentTime;
        loopBadge.textContent = "A–B";
      } else {
        state.loopA = null;
        state.loopB = null;
        loopBadge.hidden = true;
      }
    });
    shuffleBtn.addEventListener("click", () => {
      queue.setShuffle(!queue.shuffle);
      shuffleBtn.classList.toggle("is-on", queue.shuffle);
      shuffleBtn.setAttribute("aria-pressed", String(queue.shuffle));
    });
    repeatBtn.addEventListener("click", () => {
      const mode = queue.cycleRepeat();
      repeatBtn.textContent = mode === "one" ? "🔂 REP 1" : mode === "all" ? "🔁 REP ALL" : "🔁 REP OFF";
      repeatBtn.classList.toggle("is-on", mode !== "off");
    });
    eqOnChk.addEventListener("change", () => {
      state.eqOn = eqOnChk.checked;
      applyEq();
    });
    eqPresetSel.addEventListener("change", () => {
      const name = eqPresetSel.value;
      if (EQ_PRESETS[name]) {
        state.eq = EQ_PRESETS[name].slice();
        state.preset = name;
        state.eqOn = true;
        eqOnChk.checked = true;
        applyEq();
      }
    });
    $("#btn-eq-flat").addEventListener("click", () => {
      state.preamp = 0;
      state.eq = EQ_PRESETS.Flat.slice();
      state.preset = "Flat";
      applyEq();
    });
    preampSlider.addEventListener("input", () => {
      state.preamp = clampGain(preampSlider.value);
      applyEq();
    });
    bandSliders.forEach((s, i) => {
      s.addEventListener("input", () => {
        state.eq[i] = clampGain(s.value);
        state.preset = "Custom";
        applyEq();
      });
    });
    $("#btn-dsp-bass").addEventListener("click", (e) => {
      state.dspBass = !state.dspBass;
      e.currentTarget.classList.toggle("is-on", state.dspBass);
      e.currentTarget.setAttribute("aria-pressed", String(state.dspBass));
      applyEq();
    });
    $("#btn-dsp-treble").addEventListener("click", (e) => {
      state.dspTreble = !state.dspTreble;
      e.currentTarget.classList.toggle("is-on", state.dspTreble);
      e.currentTarget.setAttribute("aria-pressed", String(state.dspTreble));
      applyEq();
    });
    $("#btn-dsp-vocal").addEventListener("click", (e) => {
      state.dspVocal = !state.dspVocal;
      e.currentTarget.classList.toggle("is-on", state.dspVocal);
      e.currentTarget.setAttribute("aria-pressed", String(state.dspVocal));
      applyEq();
    });
    $("#btn-load-library").addEventListener("click", () => scanFolder(""));
    $("#btn-scan-folder").addEventListener("click", () => scanFolder(folderInput.value));
    $("#btn-clear-pl").addEventListener("click", () => {
      state.tracks = [];
      state.currentIndex = -1;
      renderPlaylist();
    });
    plFilter.addEventListener("input", renderPlaylist);
    $("#btn-export-m3u").addEventListener("click", async () => {
      if (!state.tracks.length) return;
      const res = await fetch(API_BASE + "/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export", folder: folderInput.value, tracks: state.tracks }),
      });
      if (res.ok) {
        const out = await res.json();
        $("#lbl-msg").hidden = false;
        $("#lbl-msg").textContent = "Saved playlist: " + out.path;
      }
    });
    $("#btn-import-m3u").addEventListener("click", async () => {
      const res = await fetch(API_BASE + "/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", folder: folderInput.value }),
      });
      if (res.ok) {
        const out = await res.json();
        if (Array.isArray(out.tracks) && out.tracks.length) {
          state.tracks = out.tracks;
          queue = new PlayQueue(state.tracks.length, 0);
          renderPlaylist();
          playTrack(0);
        }
      }
    });

    media.addEventListener("play", () => {
      playBtn.textContent = "⏸";
      playState.textContent = "▶ PLAYING";
      const curTrack = state.tracks[state.currentIndex];
      if ((!curTrack || curTrack.kind !== "video") && !raf) raf = requestAnimationFrame(drawVisualizerFrame);
    });
    media.addEventListener("pause", () => {
      playBtn.textContent = "▶";
      playState.textContent = "⏸ PAUSED";
    });
    media.addEventListener("loadedmetadata", () => {
      durationLbl.textContent = formatClock(media.duration);
      const tr = state.tracks[state.currentIndex];
      if (tr && tr.size && media.duration > 0) {
        kbpsBadge.textContent = Math.round((tr.size * 8) / media.duration / 1000) + " KBPS";
      }
    });
    media.addEventListener("timeupdate", () => {
      if (state.loopA !== null && state.loopB !== null && media.currentTime >= state.loopB) {
        media.currentTime = state.loopA;
      }
      elapsedLbl.textContent = formatClock(media.currentTime);
      ledClock.textContent = formatLedClock(media.currentTime, media.duration, state.remainingTime);
      if (Number.isFinite(media.duration) && media.duration > 0) {
        seekSlider.value = String(Math.round((media.currentTime / media.duration) * 1000));
        syncSlider(seekSlider);
      }
      if (state.lrcCues.length) {
        const idx = activeLrcIndex(state.lrcCues, media.currentTime);
        lyricsBox.querySelectorAll(".wa-lyr-line").forEach((el, i) => {
          el.classList.toggle("is-active", i === idx);
        });
      }
    });
    media.addEventListener("ended", () => {
      const idx = queue.next(true);
      if (idx >= 0) playTrack(idx);
    });

    for (const s of [seekSlider, volSlider, balSlider, preampSlider, ...bandSliders]) syncSlider(s);
    applyEq();
    drawVisualizerFrame();
    if (API_BASE || TOKEN) scanFolder(folderInput.value);
  </script>
</body>
</html>`;
}

export function startMediaPlayerStudioServer(options: { port?: number; host?: string; rootDir?: string } = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const token = randomBytes(16).toString("hex");
  const uiDir = resolve(import.meta.dir, "../resources/file_manager/ui");

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST") {
        const blocked = guardLocalRequest(req, server.port);
        if (blocked) return blocked;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const apiUrl = `http://${host}:${server.port}`;
        return new Response(generateMediaPlayerStudioHtml({ apiUrl, token }), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/ui/mediacore.js") {
        const content = readFileSync(join(uiDir, "mediacore.js"), "utf8");
        return new Response(content, {
          headers: { "Content-Type": "text/javascript; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/library") {
        const folder = url.searchParams.get("folder") || options.rootDir || getDefaultMediaLibraryDir();
        return Response.json(scanMediaFolder(folder));
      }

      if (url.pathname === "/api/lyrics") {
        const filePath = url.searchParams.get("path") ?? "";
        if (!filePath || !existsSync(filePath)) return new Response("Not found", { status: 404 });
        const ext = extname(filePath).toLowerCase();
        if (!SUB_AND_LYR_EXTS.has(ext)) return new Response("Forbidden", { status: 403 });
        return new Response(readFileSync(filePath, "utf8"), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/raw") {
        const filePath = url.searchParams.get("path") ?? "";
        if (!filePath || !existsSync(filePath)) return new Response("Not found", { status: 404 });
        const ext = extname(filePath).toLowerCase();
        const mime = MIME_BY_EXT[ext];
        if (!mime) return new Response("Forbidden media type", { status: 403 });
        const st = statSync(filePath);
        const total = st.size;
        const rangeHeader = req.headers.get("range");
        const file = Bun.file(filePath);
        if (rangeHeader) {
          const parsed = parseByteRange(rangeHeader, total);
          if (!parsed) {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${total}` },
            });
          }
          const [start, end] = parsed;
          return new Response(file.slice(start, end + 1), {
            status: 206,
            headers: {
              "Content-Type": mime,
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${end}/${total}`,
              "Content-Length": String(end - start + 1),
            },
          });
        }
        return new Response(file, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Accept-Ranges": "bytes",
            "Content-Length": String(total),
          },
        });
      }

      if (url.pathname === "/api/playlist" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as any;
        const folder = resolve(body.folder || getDefaultMediaLibraryDir());
        if (body.action === "export" && Array.isArray(body.tracks)) {
          const target = join(folder, "playlist.m3u8");
          const m3u = formatM3u(body.tracks);
          writeFileSync(target, m3u, "utf8");
          return Response.json({ ok: true, path: target });
        }
        if (body.action === "import") {
          const scanned = scanMediaFolder(folder);
          const firstPl = scanned.playlists[0];
          if (!firstPl) return Response.json({ ok: false, tracks: [] });
          const raw = readFileSync(firstPl.path, "utf8");
          const items = parseM3u(raw);
          const baseDir = dirname(firstPl.path);
          const resolvedTracks = items
            .map((item: { path: string; title?: string; duration?: number }) => {
              const p = item.path.startsWith("/") ? item.path : resolve(baseDir, item.path);
              if (!existsSync(p)) return null;
              const name = basename(p);
              const kind = mediaKindOfName(name);
              if (!kind) return null;
              const st = statSync(p);
              return { name, path: p, size: st.size, kind };
            })
            .filter(Boolean);
          return Response.json({ ok: true, path: firstPl.path, tracks: resolvedTracks });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  const url = `http://${host}:${server.port}`;
  console.log(`Media Player Studio Pro API Server running at: ${url}/`);
  return { server, port: server.port, url, token };
}

export function createMediaPlayerStudio(options: MediaPlayerStudioOptions = {}): MediaPlayerStudioInstance {
  const { width = 1280, height = 840, fullscreen = false, alwaysOnTop = false, port = 0, host = "127.0.0.1" } = options;
  const title = "⚡ Media Player Studio Pro";

  return {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMediaPlayerStudioHtml(),
    run() {
      const { server, url } = startMediaPlayerStudioServer({ port, host, rootDir: options.rootDir });
      this.server = server;
      this.port = server.port;
      this.url = url;

      const webview = new Webview();
      this.webview = webview;
      webview.title = title;

      const dims = fullscreen ? getScreenDimensions() : { width, height };
      webview.size = { width: dims.width, height: dims.height, hint: SizeHint.NONE };

      attachWindowShortcuts(webview, {
        title,
        onToggleFullscreen: () => toggleFullscreenNative(title),
      });

      const shortcutScript = getWindowShortcutsScript();
      if (shortcutScript) webview.init(shortcutScript);

      webview.navigate(url);
      if (fullscreen) {
        setTimeout(() => toggleFullscreenNative(title), 250);
      } else {
        setWindowPositionNative(title, 80, 60);
      }
      if (alwaysOnTop) {
        setTimeout(() => setAlwaysOnTopNative(title, true), 300);
      }

      try {
        webview.run();
      } finally {
        server.stop(true);
      }
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const serverOnly = args.includes("--server");
  const fullscreen = args.includes("--fullscreen");
  const alwaysOnTop = args.includes("--on-top");
  const portIdx = args.indexOf("--port");
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) || 0 : 0;

  if (serverOnly) {
    const { port: boundPort } = startMediaPlayerStudioServer({ port });
    console.log(`READY:${boundPort}`);
  } else {
    const app = createMediaPlayerStudio({ fullscreen, alwaysOnTop, port });
    app.run();
  }
}
