#!/usr/bin/env bun
/**
 * "MySQL in the Codecaine File Manager": find a MySQL connection, save and test it in the File Manager's Databases tool, open
 * MySQL Studio Pro inside the File Manager window, and walk through the studio, on a throwaway MySQL server.
 *
 *   bun scripts/tutorial_mysql_studio.ts list | audio [--shard i/n] | record [ids,...] | build | all
 *
 * Writes youtube_production/mysql_studio_tutorial.mp4 and MYSQL_STUDIO_TUTORIAL_NOTES.md. The engine is scripts/lib/step_video.ts;
 * the chapters are scripts/lib/mysql_tutorial_script.ts (and mysql_tutorial_ch_*.ts); the throwaway server, home folder and
 * File Manager are started by scripts/lib/mysql_tutorial_env.ts. Everything lives in youtube_production/mysql_studio_tutorial/_work:
 * no real MySQL server, keychain, settings or home folder is touched.
 */
import "./lib/tts_edge_default";
import { mkdirSync } from "fs";
import { join } from "path";
import { Cdp } from "./lib/cdp_recorder";
import { EDGE_VOICE, fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import { mysqlChapters } from "./lib/mysql_tutorial_script";
import { openChapter } from "./lib/mysql_tutorial_run";
import * as E from "./lib/mysql_tutorial_env";
import type { World } from "./lib/fm_tutorial_types";

// Programs started from here (the mysql client, the voice) must not read or write the real home folder.
mkdirSync(join(E.WORK, "hosthome"), { recursive: true });
process.env.HOME = join(E.WORK, "hosthome");

const VIEW_H = 972;
let cdp: Cdp;

const seedWorld = (): World => {
  E.seedHome();
  return { home: E.HOME, data: E.DATA, big: "", put: () => {} };
};

const notes = (marks: Array<{ at: number; title: string }>, total: number) => {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const text = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# MySQL in the Codecaine File Manager (${fmtTime(total)})

## YouTube title

MySQL in the Codecaine File Manager: Save, Test and Open MySQL Studio Pro, Then Master the Studio (Bun + TypeScript)

## YouTube description (copy and paste)

\`\`\`text
A complete, narrated tutorial of MySQL Studio Pro, done from inside the Codecaine File Manager (Bun RAD Studio). Find a connection in a .env file or your environment variables, save it in the File Manager's Databases tab, test it, see where every setting comes from, and open the real MySQL Studio in the File Manager window. Then the studio itself: the data grid with GUI editing, filter bar, totals row and report, the SQL editor with presets and a one-click backup and dump, the visual query designer with cardinality badges, the schema designer and DDL, ENUM and SET types, partition trees, live activity and locks, replication and binary logs, the query plan visualizer, the raw JSON inspector, maintenance and telemetry, the macro designer, and loading a CSV file safely with staging, straight from the file list.

Everything runs on a throwaway MySQL server with sample data, so nothing real is shown.

Free and open source: ${REPO}
MySQL Studio guide: ${REPO}/blob/main/docs/userguides/41_mysql_studio.md
File Manager guide (Databases): ${REPO}/blob/main/docs/userguides/43_file_manager.md

Chapters
${text}
\`\`\`

## Tags (comma separated)

mysql, mysql studio, mysql gui, mysql client, mysql tutorial, mysql workbench alternative, database gui, database manager, file manager, codecaine file manager, bun, bun runtime, typescript, bun rad studio, sql editor, visual query designer, query builder, schema designer, mysql partitions, mysql enum, explain plan, query plan, binary log, replication, lock monitor, mysql backup, sql dump, csv import, staging import, macos

## Hashtags

#mysql #mysqlstudio #sql #database #databasegui #bun #typescript #filemanager #macos #opensource #dataengineering #devtools #sqleditor #queryplan #backend

## Notes

- Recorded from the real Codecaine File Manager in headless Chrome with a visible cursor: the Databases tool, and MySQL Studio Pro running inside the File Manager window (a studio is a page inside a frame, and the recording drives it). Nothing is faked, but note these honest points:
  - The MySQL server is a **throwaway** server (MySQL 26.7.0 from Homebrew) on port 3399 with an **empty root password** and the studio's own sample "shop" database, started just for the recording and deleted afterwards. The real server and data are never touched.
  - Because the root password is empty, no password was saved. On a real Mac a password goes to the system keychain. For the recording, the File Manager's keychain code was replaced in memory by a throwaway stand-in (the preload scripts/lib/mysql_tutorial_nokeychain.ts) so nothing could touch the recorder's own keychain. The same preload hides the repository's own .env file from the Databases tab. No program file is edited.
  - On this very new MySQL version the lock banner of the Live Activity pane stays green even while a real lock exists (it reads the old information_schema.innodb_lock_waits table); the process list shows the blockage. The Join Properties dialog offers five join choices in words (the guide mentions a Venn diagram, which is not drawn). Duplicating a row copies the created_at value in a format MySQL rejects, so the video presses "Now". The "Run ANALYZE TABLE" button of the maintenance pane sends no table name and fails, so the video uses "Optimize all tables" instead.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female).
- Rebuild: \`bun scripts/tutorial_mysql_studio.ts all\` (needs Google Chrome, ffmpeg-full and mysql from Homebrew, and the internet for the voice). Re-record one chapter: \`... record 06_grid\` then \`... build\`.
`;
};

const suite: Suite = {
  name: "mysql_studio",
  chapters: mysqlChapters,
  seedWorld,
  open: (ch) => openChapter(cdp, ch),
  start: async () => {
    await E.startMysql();
    cdp = await Cdp.launch(E.CDP_PORT, E.CHROME_DIR, 1920, VIEW_H);
  },
  stop: () => {
    E.stopFm();
    cdp?.close();
  },
  cdp: () => cdp,
  notes,
  viewHeight: VIEW_H,
};

await runTutorial(suite, process.argv.slice(2));
await E.stopMysql();
process.exit(0);
