#!/usr/bin/env bun
/**
 * All-in-One Master Tutorial Video & YouTube Release Notes Builder.
 *
 * Combines every tutorial in the Bun RAD Studio & Codecaine File Manager suite into a single
 * comprehensive master video starting with the Codecaine File Manager Complete Tutorial:
 *   1. Codecaine File Manager: The Complete Step-by-Step Guide (33 chapters)
 *   2. Databases Hub & Cross-Engine Cloning Masterclass: SQLite, MySQL, PostgreSQL & Redis (9 chapters)
 *   3. SQLite Studio: Complete Step-by-Step Walkthrough (15 chapters)
 *   4. MySQL Studio Pro: Complete Step-by-Step Walkthrough (12 chapters)
 *   5. SimpleGUI Visual Designer: Build Desktop Apps Without Code (11 chapters)
 *   6. Bun RAD Studio & SimpleGUI RAD: Complete Developer Tutorial (14 chapters)
 *   7. Bun RAD Studio Suite Tour: Launcher, 79 CLI Tools, Standalone Studios & 24 Arcade Games (10 chapters)
 *   8. Grand Finale Outro
 *
 * Usage:
 *   bun scripts/tutorial_all_in_one.ts list    # list all chapters across all sections
 *   bun scripts/tutorial_all_in_one.ts build   # assemble youtube_production/all_in_one_tutorial.mp4 + ALL_IN_ONE_TUTORIAL_NOTES.md
 *   bun scripts/tutorial_all_in_one.ts all     # same as build (reuses built segments from each tutorial)
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { EDGE_VOICE, FFMPEG, cardHtml, durationOf, fmtTime, screenshotHtml, sh } from "./lib/video_pipeline";
import { chapters as fmChapters } from "./lib/fm_tutorial_script";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const OUT = join(PROD, "all_in_one_tutorial");
const SEG = join(OUT, "segments");
const ASSETS = join(OUT, "assets");
const FINAL = join(PROD, "all_in_one_tutorial.mp4");
const NOTES = join(PROD, "ALL_IN_ONE_TUTORIAL_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

interface Timeline {
  id: string;
  chapter: string;
  title: string;
  clip: string;
  steps: Array<{ start: number; end: number; cap: string }>;
  seconds: number;
}

interface ExternalSection {
  id: string;
  kicker: string;
  title: string;
  blurb: string;
  dir: string;
  label: string;
}

interface SuiteTourScene {
  id: string;
  title: string;
}

const EXTERNAL_SECTIONS: ExternalSection[] = [
  {
    id: "23b_databases_masterclass",
    kicker: "Part 2 · Databases Masterclass",
    title: "All 4 Databases, Cross-Engine Cloning, Bun JS Macros & Studio IDE v2",
    blurb: "SQLite, MySQL, PostgreSQL, Redis, live cross-engine cloning, Bun JS & visual macros, staging import, ER diagram, schema diff & codegen",
    dir: "databases_masterclass_tutorial",
    label: "Databases Hub",
  },
  {
    id: "24_sqlite",
    kicker: "Part 3 · SQLite Studio",
    title: "SQLite Studio, step by step",
    blurb: "Find a database file, browse and edit it, design tables, write SQL, and keep it safe",
    dir: "sqlite_studio_tutorial",
    label: "SQLite",
  },
  {
    id: "25_mysql",
    kicker: "Part 4 · MySQL Studio Pro",
    title: "MySQL Studio, step by step",
    blurb: "Connect to a server, the workbench, the grid, SQL, design, imports and backups",
    dir: "mysql_studio_tutorial",
    label: "MySQL",
  },
  {
    id: "25b_designer",
    kicker: "Part 5 · SimpleGUI Visual Designer",
    title: "Build a Desktop App With No Code: The Visual Designer",
    blurb: "101 controls across 11 categories, property inspector, Delphi anchors, events, live preview, 63 themes, CRUD wizard & multi-language code export",
    dir: "designer_tutorial",
    label: "Visual Designer",
  },
  {
    id: "25c_rad",
    kicker: "Part 6 · SimpleGUI RAD & System Utilities",
    title: "Build Desktop Apps Fast With Bun & TypeScript",
    blurb: "Windows, layouts, controls, parity & enterprise widgets, reactive state, menus, SweetAlert2, 133 themes, SQLite contacts app, 45 RAD modules & single-binary builds",
    dir: "rad_tutorial",
    label: "SimpleGUI RAD",
  },
];

const SUITE_TOUR_SCENES: SuiteTourScene[] = [
  { id: "01_overview", title: "The Launcher: One App for Everything" },
  { id: "02_download", title: "Download or Install" },
  { id: "03_install", title: "Install from Source" },
  { id: "04_cli", title: "79 Command-Line Tools" },
  { id: "07_devtools", title: "Regex, JSON, Git and More" },
  { id: "09_security", title: "Hashes, Keys and Secrets" },
  { id: "10_system", title: "Disk Usage and Code Statistics" },
  { id: "11_games", title: "24 Games Built the Same Way" },
  { id: "12_themes", title: "Over 100 Themes" },
  { id: "13_ship", title: "Bundle and Share Your App" },
];

function makeSectionCard(id: string, kicker: string, title: string, blurb: string): string {
  mkdirSync(SEG, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });
  const out = join(SEG, `${id}_card.mp4`);
  const png = join(ASSETS, `chapter_${id}.png`);
  screenshotHtml(cardHtml(kicker, title, blurb ? [blurb] : []), png, ASSETS);
  sh(
    [
      FFMPEG,
      "-y",
      "-loop",
      "1",
      "-i",
      png,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      "-t",
      "3.5",
      "-r",
      "30",
      out,
    ],
    { quiet: true },
  );
  return out;
}

function externalSegments(sec: ExternalSection): Array<{ file: string; title: string }> {
  const dir = join(PROD, sec.dir);
  const listFile = join(dir, "segments", "list.txt");
  if (!existsSync(listFile)) throw new Error(`${sec.id}: ${listFile} is missing; build ${sec.dir} first`);
  const files = [...readFileSync(listFile, "utf8").matchAll(/^file '(.+)'$/gm)].map((m) => m[1]!);
  const parts = files.flatMap((file) => {
    const id = file.split("/").pop()!.replace(/\.mp4$/, "");
    const tlFile = join(dir, "timelines", `${id}.json`);
    if (id.endsWith("_card") && !existsSync(tlFile)) return [];
    const tl = existsSync(tlFile) ? (JSON.parse(readFileSync(tlFile, "utf8")) as Timeline) : null;
    if (!tl) return [];
    if (!tl.clip && /^(00_intro|01_server)$|_outro$/.test(id)) return [];
    if (!existsSync(file)) throw new Error(`${sec.id}: ${file} is missing; rebuild ${sec.dir}`);
    return [{ file, title: tl.title }];
  });
  if (!parts.length) throw new Error(`${sec.id}: no segments found in ${dir}`);
  return parts;
}

function ensureStereoSegment(srcFile: string, outName: string): string {
  mkdirSync(SEG, { recursive: true });
  const dstFile = join(SEG, outName);
  sh(
    [
      FFMPEG,
      "-y",
      "-i",
      srcFile,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      dstFile,
    ],
    { quiet: true },
  );
  return dstFile;
}

function notesText(
  marks: Array<{ at: number; title: string; section: string }>,
  sectionStarts: Array<{ at: number; title: string }>,
  total: number,
): string {
  const allChaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  const sectionOverviewText = sectionStarts.map((s, i) => `${fmtTime(i === 0 ? 0 : s.at)} ${s.title}`).join("\n");

  // Compact chapter list (<4,900 chars total description) spanning all 8 parts for YouTube's strict 5,000-char limit
  const compactChaptersText = marks
    .map((m, i) => {
      const t = fmtTime(i === 0 ? 0 : m.at);
      const shortTitle = m.title
        .replace(/^Databases Hub: /, "DB Hub: ")
        .replace(/^Visual Designer: /, "Designer: ")
        .replace(/^SimpleGUI RAD: /, "RAD: ")
        .replace(/^Suite Tour: /, "Suite: ");
      return `${t} ${shortTitle}`;
    })
    .filter((_, idx, arr) => idx === 0 || idx === arr.length - 1 || idx < 38 || idx % 2 === 0)
    .join("\n");

  return `# Codecaine File Manager & Bun RAD Studio: Complete All-in-One Master Tutorial (${fmtTime(total)})

## YouTube title

Codecaine File Manager & Bun RAD Studio Full Course: Terminal, Media, 200+ Themes, 194 Shaders, 4 Databases, Visual Designer & SimpleGUI RAD

## Alternative High-CTR Titles

1. **Codecaine File Manager + Bun RAD Studio: The Complete All-in-One Masterclass (${fmtTime(total)})**
2. **The Ultimate Developer Workstation & Desktop App Builder in Bun (Full ${fmtTime(total)} Course)**
3. **Codecaine File Manager Complete Tutorial + SQLite, MySQL, PostgreSQL, Redis, Visual Designer & SimpleGUI**

## Major Sections Summary

\`\`\`text
${sectionOverviewText}
\`\`\`

## YouTube description — Full Version with All ${marks.length} Chapters (copy and paste)

\`\`\`text
The complete, all-in-one step-by-step master tutorial for the Codecaine File Manager and Bun RAD Studio (${fmtTime(total)}): a free, open-source, keyboard-friendly file manager and rapid application development suite for macOS, Windows and Linux, powered by Bun and TypeScript. Every click is recorded live in real time on a throwaway workspace of sample files and databases so you can follow along at your own pace.

⬇️ Download (free): ${REPO}/releases/latest
⭐ Source code (MIT): ${REPO}
📖 Complete Documentation: ${REPO}/tree/main/docs
🗄️ Complete Databases Guide: ${REPO}/blob/main/docs/databases/complete-databases-guide.md
📘 SimpleGUI API Guide: ${REPO}/blob/main/docs/SIMPLEGUI_API.md

WHAT YOU WILL LEARN IN THIS ALL-IN-ONE COURSE
📁 Part 1 — Codecaine File Manager (0:00): The window, navigation, views, folder tabs, sidebar tree, color tags, copy & move with progress/Cancel/Retry, name clashes, Recycle Bin, Undo, Quick Look, permissions, password encryption, Convert, Find & bulk rename, Review, Compare, Projects, Actions, QR codes, built-in code editor, Terminal + files working together (PowerShell, CMD, Git Bash, WSL, zsh/bash), Replace across files, Dev tab, Watch, Serve, Crypto, Secrets, Env, Network, Downloads, Calculator, Timer, API, Bundler, Graveyard, Home/Split/Clocks/CLI utilities, Process & Task Manager, System Information & Hardware Telemetry, Image Studio, Media Studio, batch presets, Media Deck, Paint Studio, 24 Arcade Games, and 200+ themes with 5-row filter pills, per-folder pinned themes, side-by-side comparator, 4-stage Solar Cycle, 194 live atmospheric shaders + 6-layer mixer, Theme Editor v2, and custom shortcuts.
🗄️ Part 2 — Databases Hub & Cross-Engine Cloning Masterclass: Discover SQLite files by magic bytes, auto-detect .env connections for SQLite, MySQL, PostgreSQL and Redis with OS keychain security, clone entire databases and tables across SQLite, PostgreSQL, MySQL and Redis Hashes, automate with the Bun JavaScript & Visual Macro Studio, load 15 formats via the 5-step Staging Import Wizard, and use Studio IDE v2 (Data Grid Pro, Side Row Inspector, FK jump, multi-tab SQL IDE, ER Diagram, Schema Diff & 5-language Codegen).
🪶 Part 3 — SQLite Studio Complete Walkthrough: Browsing tables, GUI CRUD without SQL, visual table designer, SQL editor, visual query designer with automatic joins, macros, PRAGMAs, audit log, one-click backups, and staging imports.
🐬 Part 4 — MySQL Studio Pro Complete Walkthrough: Connection workbench, Effective Settings, GUI data grid with filters and totals, SQL editor & dumps, visual query and schema designers, ENUM/SET & partition trees, live activity/locks/explain plans/maintenance, macros, Studio IDE v2, and staging CSV imports.
🎨 Part 5 — SimpleGUI Visual Designer (No-Code App Builder): Place controls from 101 controls across 11 categories, edit properties, hover styles, Delphi anchors and data bindings, align and distribute, wire events, run live previews across 63 form themes, run layout audits and the MS Access CRUD wizard, and export Bun TypeScript, HTML, React, Vue 3, Python and FormSpec JSON.
⚡ Part 6 — Bun RAD Studio & SimpleGUI RAD Developer Course: Build desktop apps in TypeScript with windows, rows/grids/cards, standard/parity/extended/enterprise controls, reactive state & OS persistence, menus/dialogs/timers, SweetAlert2 & context menus, 253 SimpleGUI themes, a complete SQLite contacts app, 45 RAD utility modules, 10 system tools as plain functions, and single-binary compilation.
🚀 Part 7 — Bun RAD Studio Suite Tour: The Launcher (173 tools), GitHub v1.4.5 releases & source install, 79 CLI tools, Regex/JQ/DataConvert Studios, Crypto Studio, Tokei & Gdu Studios, 24 Arcade Games, and the App Bundler Studio.

CHAPTERS
${allChaptersText}

#FileManager #Bun #TypeScript #SQLite #MySQL #PostgreSQL #Redis #OpenSource #Tutorial #DesktopApps #RAD #DevTools
\`\`\`

## YouTube description — Compact Version (<5,000 characters for strict YouTube limit)

> If YouTube's description box rejects descriptions over 5,000 characters, paste the block below into the description box and paste the full chapter list above into a **Pinned Comment**.

\`\`\`text
The complete, all-in-one step-by-step master tutorial for the Codecaine File Manager and Bun RAD Studio (${fmtTime(total)}): a free, open-source file manager, 4-engine database workbench (SQLite, MySQL, PostgreSQL, Redis), media studio, 200+ theme & 194-shader desktop environment, no-code Visual Designer, and SimpleGUI TypeScript RAD suite for macOS, Windows and Linux.

⬇️ Download (free): ${REPO}/releases/latest
⭐ Source code: ${REPO}

CHAPTERS
${compactChaptersText}

#FileManager #Bun #TypeScript #SQLite #MySQL #PostgreSQL #Redis #OpenSource #Tutorial
\`\`\`

## Tags (comma separated)

codecaine file manager, bun rad studio, file manager tutorial, bun tutorial, typescript desktop apps, dual pane file manager, terminal file manager, sqlite studio, mysql studio, postgresql studio, redis studio, cross engine database cloning, bun js macros, visual macro studio, er diagram, schema diff, simplegui, visual form designer, delphi alternative, electron alternative, tauri alternative, open source file manager, macos file manager, windows file manager, linux file manager, developer workstation, ffmpeg media studio, image studio

## Notes

- Starts with the complete **Codecaine File Manager** tutorial (\`file_manager_tutorial\`), followed seamlessly by the **Databases Hub & Cross-Engine Cloning Masterclass** (\`databases_masterclass_tutorial\`), **SQLite Studio** (\`sqlite_studio_tutorial\`), **MySQL Studio Pro** (\`mysql_studio_tutorial\`), **SimpleGUI Visual Designer** (\`designer_tutorial\`), **SimpleGUI RAD & System Utilities** (\`rad_tutorial\`), **Bun RAD Studio Suite Tour** (\`tutorial\`), and the **Outro**.
- Every chapter is recorded live from the real programs in headless Chrome with a visible cursor; nothing is faked.
- Narration: Edge neural voice (${EDGE_VOICE}, female), normalized to -16 LUFS over a subtle ambient background chord bed.
- Rebuild: \`bun scripts/tutorial_all_in_one.ts build\`.
`;
}

function listChapters() {
  const fmCore = fmChapters.filter((c) => c.kind !== "external" && c.id !== "26_outro");
  console.log("=== Part 1: Codecaine File Manager ===");
  for (const ch of fmCore) console.log(`  ${ch.id.padEnd(28)} ${ch.title}`);
  for (const sec of EXTERNAL_SECTIONS) {
    console.log(`\n=== ${sec.kicker}: ${sec.title} ===`);
    for (const p of externalSegments(sec)) console.log(`  ${sec.label}: ${p.title}`);
  }
  console.log(`\n=== Part 7: Bun RAD Studio Suite Tour ===`);
  for (const sc of SUITE_TOUR_SCENES) console.log(`  Suite Tour: ${sc.title}`);
  console.log(`\n=== Outro ===\n  26_outro                     That is the tour`);
}

function buildAllInOne(notesOnly = false) {
  mkdirSync(SEG, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });

  const fmSegDir = join(PROD, "file_manager_tutorial", "segments");
  const fmTlDir = join(PROD, "file_manager_tutorial", "timelines");

  const list: string[] = [];
  const marks: Array<{ at: number; title: string; section: string }> = [];
  const sectionStarts: Array<{ at: number; title: string }> = [];
  let at = 0;

  // 1. Codecaine File Manager core chapters (00_intro through 23_databases)
  const fmCore = fmChapters.filter((c) => c.kind !== "external" && c.id !== "26_outro");
  sectionStarts.push({ at: 0, title: "Part 1 — Codecaine File Manager: The Complete Step-by-Step Guide" });

  for (const ch of fmCore) {
    const segFile = join(fmSegDir, `${ch.id}.mp4`);
    if (!existsSync(segFile)) throw new Error(`Missing File Manager segment: ${segFile}`);
    const tlFile = join(fmTlDir, `${ch.id}.json`);
    if (!existsSync(tlFile)) throw new Error(`Missing File Manager timeline: ${tlFile}`);

    if (ch.kind !== "card") {
      const cardFile = join(fmSegDir, `${ch.id}_card.mp4`);
      if (!existsSync(cardFile)) throw new Error(`Missing File Manager card: ${cardFile}`);
      marks.push({ at, title: ch.title, section: "Codecaine File Manager" });
      list.push(`file '${cardFile}'`);
      at += durationOf(cardFile);
    } else {
      marks.push({ at, title: ch.title, section: "Codecaine File Manager" });
    }
    list.push(`file '${segFile}'`);
    at += durationOf(segFile);
    if (!notesOnly) console.log(`  ✓ [File Manager] ${ch.id.padEnd(28)} -> ${fmtTime(at)}`);
  }

  // 2–6. External tutorials: Databases Masterclass, SQLite Studio, MySQL Studio, Visual Designer, SimpleGUI RAD
  for (const sec of EXTERNAL_SECTIONS) {
    sectionStarts.push({ at, title: `${sec.kicker.replace(" · ", " — ")}: ${sec.title}` });
    const parts = externalSegments(sec);
    const existingFmCard = join(fmSegDir, `${sec.id}_card.mp4`);
    const existingLocalCard = join(SEG, `${sec.id}_card.mp4`);
    const cardFile = existsSync(existingFmCard)
      ? existingFmCard
      : notesOnly && existsSync(existingLocalCard)
        ? existingLocalCard
        : makeSectionCard(sec.id, sec.kicker, sec.title, sec.blurb);

    list.push(`file '${cardFile}'`);
    const cardDur = durationOf(cardFile);

    parts.forEach((p, i) => {
      marks.push({ at, title: `${sec.label}: ${p.title}`, section: sec.label });
      if (i === 0) at += cardDur;
      list.push(`file '${p.file}'`);
      at += durationOf(p.file);
    });
    if (!notesOnly) console.log(`  ✓ [${sec.label}] ${sec.id.padEnd(28)} -> ${fmtTime(at)} (${parts.length} chapters)`);
  }

  // 7. Bun RAD Studio Suite Tour (Launcher, Install, 79 CLI Tools, Standalone Studios, 24 Games, App Bundler)
  sectionStarts.push({
    at,
    title: "Part 7 — Bun RAD Studio Suite Tour: Launcher, 79 CLI Tools, Standalone Studios & 24 Games",
  });
  const existingSuiteCard = join(SEG, "25d_suite_tour_card.mp4");
  const suiteCard =
    notesOnly && existsSync(existingSuiteCard)
      ? existingSuiteCard
      : makeSectionCard(
          "25d_suite_tour",
          "Part 7 · Bun RAD Studio Suite Tour",
          "The Launcher, 79 CLI Tools, Standalone Studios & 24 Games",
          "Explore the 172-tool Launcher, GitHub releases, CLI utilities, Regex/JQ/DataConvert/Crypto/Tokei/Gdu Studios, 24 Arcade Games & App Bundler",
        );
  list.push(`file '${suiteCard}'`);
  const suiteCardDur = durationOf(suiteCard);

  SUITE_TOUR_SCENES.forEach((sc, i) => {
    const srcSeg = join(PROD, "tutorial", "segments", `seg_${sc.id}.mp4`);
    if (!existsSync(srcSeg)) throw new Error(`Missing tutorial segment: ${srcSeg}`);
    const existingStereo = join(SEG, `suite_${sc.id}.mp4`);
    const stereoSeg = notesOnly && existsSync(existingStereo) ? existingStereo : ensureStereoSegment(srcSeg, `suite_${sc.id}.mp4`);
    marks.push({ at, title: `Suite Tour: ${sc.title}`, section: "Suite Tour" });
    if (i === 0) at += suiteCardDur;
    list.push(`file '${stereoSeg}'`);
    at += durationOf(stereoSeg);
  });
  if (!notesOnly) console.log(`  ✓ [Suite Tour]   25d_suite_tour               -> ${fmtTime(at)} (${SUITE_TOUR_SCENES.length} chapters)`);

  // 8. Grand Finale Outro (26_outro from file_manager_tutorial)
  const outroSeg = join(fmSegDir, "26_outro.mp4");
  if (!existsSync(outroSeg)) throw new Error(`Missing outro segment: ${outroSeg}`);
  sectionStarts.push({ at, title: "Part 8 — Conclusion & Next Steps" });
  marks.push({ at, title: "That is the tour", section: "Outro" });
  list.push(`file '${outroSeg}'`);
  at += durationOf(outroSeg);
  if (!notesOnly) console.log(`  ✓ [Outro]        26_outro                     -> ${fmtTime(at)}`);

  if (notesOnly) {
    const total = existsSync(FINAL) ? durationOf(FINAL) : at;
    writeFileSync(NOTES, notesText(marks, sectionStarts, total));
    console.log(`📝 ${NOTES} (${marks.length} chapters, ${fmtTime(total)})`);
    return;
  }

  // Concatenate all segments losslessly
  const listPath = join(SEG, "list.txt");
  writeFileSync(listPath, list.join("\n"));
  const merged = join(SEG, "merged.mp4");
  console.log(`\n🎬 Concatenating ${list.length} video segments (${fmtTime(at)})...`);
  sh([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", merged]);

  const total = durationOf(merged);
  const bed = join(SEG, "bed.m4a");
  console.log(`🎵 Mixing ambient background audio bed (${fmtTime(total)})...`);
  sh(
    [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=sin(130.81*2*PI*t)*0.015+sin(196*2*PI*t)*0.012+sin(261.63*2*PI*t)*0.015+sin(329.63*2*PI*t)*0.01:s=48000:d=${total.toFixed(1)}`,
      "-af",
      `lowpass=f=900,afade=t=in:d=3,afade=t=out:st=${(total - 4).toFixed(1)}:d=4`,
      "-c:a",
      "aac",
      bed,
    ],
    { quiet: true },
  );
  sh([
    FFMPEG,
    "-y",
    "-i",
    merged,
    "-i",
    bed,
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.09[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    FINAL,
  ]);
  rmSync(merged, { force: true });
  rmSync(bed, { force: true });

  writeFileSync(NOTES, notesText(marks, sectionStarts, total));
  console.log(
    `\n✔ ${FINAL}  ${fmtTime(total)}  ${(Bun.file(FINAL).size / 1048576).toFixed(1)} MB  (${marks.length} chapters)\n📝 ${NOTES}`,
  );
}

const [phase = "all"] = process.argv.slice(2);
if (phase === "list") {
  listChapters();
} else if (phase === "notes") {
  buildAllInOne(true);
} else if (phase === "build" || phase === "all") {
  buildAllInOne(false);
} else {
  console.error("Usage: bun scripts/tutorial_all_in_one.ts list|notes|build|all");
  process.exit(1);
}
