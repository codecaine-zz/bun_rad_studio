#!/usr/bin/env bun
/**
 * SQLite in the Codecaine File Manager: find a database in the file list, save it as a connection in the Databases tool,
 * open SQLite Studio inside the File Manager's window and use all of it (a calm, step-by-step tutorial).
 *
 *   bun scripts/tutorial_sqlite_studio.ts list                  the chapters
 *   bun scripts/tutorial_sqlite_studio.ts audio [--shard i/n]   write (or reuse) the narration for every step
 *   bun scripts/tutorial_sqlite_studio.ts record [ids,...]      record the chapters (each starts from a fresh, throwaway world)
 *   bun scripts/tutorial_sqlite_studio.ts build                 assemble youtube_production/sqlite_studio_tutorial.mp4 and its notes
 *   bun scripts/tutorial_sqlite_studio.ts all                   audio, record, build
 *
 * The engine is scripts/lib/step_video.ts. The File Manager runs from a private copy of the program's folders (so its
 * search for .env files never meets the real one), with its keychain calls answered from memory (nothing reaches the
 * real keychain), a throwaway home folder, and its own settings folder: see scripts/lib/sqlite_tutorial_world.ts.
 * Everything lives under /Users/Shared/sqlite_demo, which holds no personal data and is removed when you are done.
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { WORK, prepareAppCopy, seedSqliteWorld, type World as SqliteWorld } from "./lib/sqlite_tutorial_world";

// Nothing may be written to the real home folder: the File Manager and the studios read $HOME.
mkdirSync(join(WORK, "envhome"), { recursive: true });
process.env.HOME = join(WORK, "envhome");

import { Cdp, sleep } from "./lib/cdp_recorder";
import { EDGE_VOICE, fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import type { Chapter, World } from "./lib/fm_tutorial_types";
import { fmChapters } from "./lib/sqlite_tutorial_script";
import { studioChapters } from "./lib/sqlite_tutorial_ch_studio";
import { finishChapters } from "./lib/sqlite_tutorial_ch_finish";

const ROOT = process.cwd();
const FM_PORT = 51690;
const CDP_PORT = 9390;
const VIEW_H = 972;
const APP = join(WORK, "app");
const DATA = join(WORK, "data");
const HOME = join(WORK, "home");
let cdp: Cdp;
let fm: ReturnType<typeof Bun.spawn> | null = null;
let sqlite: SqliteWorld;

function seedWorld(): World {
  sqlite = seedSqliteWorld(HOME);
  rmSync(DATA, { recursive: true, force: true });
  rmSync(join(WORK, "grave"), { recursive: true, force: true });
  return { home: HOME, data: DATA, big: "", put: () => {} };
}

function stopServer() { try { fm?.kill(9); } catch {} fm = null; }

async function open(ch: Chapter) {
  stopServer();
  await sleep(600);
  fm = Bun.spawn(
    [process.execPath, "--preload", join(ROOT, "scripts/lib/sqlite_tutorial_nosecrets.ts"), join(APP, "applications", "file_manager_studio.ts"), "--server", "--port", String(FM_PORT), "--home", HOME, "--data-dir", DATA, "--path", sqlite.shopDir],
    { cwd: APP, stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: join(WORK, "grave") } },
  );
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break; } catch {} await sleep(250); }
  await cdp.goto(`http://127.0.0.1:${FM_PORT}/`);
  await cdp.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start')?.click()`);
  await sleep(700);
  void ch;
}

const notes = (marks: Array<{ at: number; title: string }>, total: number) => {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const text = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# SQLite in the Codecaine File Manager: the complete walkthrough (${fmtTime(total)})

## YouTube title

SQLite in the Codecaine File Manager: Browse, Edit, Query, Design and Import (Bun + TypeScript)

## YouTube description (copy and paste)

\`\`\`text
Work with SQLite databases without leaving the Codecaine File Manager, part of Bun RAD Studio. See how a real SQLite file is recognized in the file list, saved as a connection in the Databases tool (found in your environment, tested, edited, marked production), and opened in SQLite Studio inside the File Manager window. Then use the whole studio: sort, filter, totals and column chooser in the data grid, adding, editing and deleting rows without SQL, designing tables visually, the SQL editor with presets, explain plan and create view, the visual query designer with automatic joins, building and running a macro, PRAGMA settings, the audit log, exports and one-click backups, and Import with staging that checks every row before it reaches your table. All on made-up sample data.

Free and open source: ${REPO}
SQLite Studio guide: ${REPO}/blob/main/docs/userguides/01_sqlite_studio.md
File Manager guide: ${REPO}/blob/main/docs/userguides/43_file_manager.md

Chapters
${text}
\`\`\`

## Tags (copy and paste)

\`\`\`text
SQLite, SQLite tutorial, SQLite Studio, SQLite GUI, SQLite browser, database file manager, file manager database, Codecaine File Manager, Bun RAD Studio, Bun, bun:sqlite, TypeScript, SQL tutorial, SQL editor, visual query designer, query plan, EXPLAIN QUERY PLAN, CSV import, import with staging, database backup, SQL dump, PRAGMA, macro automation, database client, desktop database tool, open source, macOS, developer tools, database design
\`\`\`

## Hashtags

#SQLite #SQL #Bun #TypeScript #FileManager #Database #DatabaseTools #OpenSource #DevTools #SQLiteStudio #Tutorial #Programming #CSV #DataImport #RAD

## Notes

- Recorded from the real File Manager in headless Chrome with a visible cursor; nothing is faked. SQLite Studio is shown exactly as the File Manager shows it: inside the Databases tool, in a frame.
- Every chapter starts from a fresh throwaway world, so no real file, setting or password appears. The File Manager ran from a private copy of the program with a made-up .env file; the system keychain was replaced by an in-memory store for the recording.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female).
- Rebuild: \`bun scripts/tutorial_sqlite_studio.ts all\` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: \`... record 06_crud\` then \`... build\`.
`;
};

const suite: Suite = {
  name: "sqlite_studio",
  chapters: [...fmChapters, ...studioChapters, ...finishChapters],
  seedWorld,
  open: (ch) => open(ch),
  start: async () => {
    seedWorld();
    prepareAppCopy(ROOT, APP, sqlite.shopDb);
    cdp = await Cdp.launch(CDP_PORT, join(WORK, "chrome"), 1920, VIEW_H);
  },
  stop: () => { stopServer(); cdp?.close(); },
  cdp: () => cdp,
  notes,
  viewHeight: VIEW_H,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
