#!/usr/bin/env bun
/**
 * The SimpleGUI visual designer, from an empty form to exported code (a calm, step-by-step tutorial).
 *
 *   bun scripts/tutorial_designer.ts list | audio [--shard i/n] | record [ids,...] | build | all
 *
 * Writes youtube_production/designer_tutorial.mp4 and DESIGNER_TUTORIAL_NOTES.md. The designer is run through the same
 * hosted bridge the File Manager uses, in headless Chrome, with sample data in /tmp only. The engine is
 * scripts/lib/step_video.ts (shared with scripts/tutorial_file_manager.ts).
 */
import "./lib/tts_edge_default";
import { rmSync } from "fs";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { hostApp, hostDesigner, type HostedApp } from "./lib/host_app";
import { fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import { designerChapters } from "./lib/designer_tutorial_script";
import type { Chapter, World } from "./lib/fm_tutorial_types";

const WORK = "/tmp/designer_tutorial";
const CDP_PORT = 9355;
const VIEW_H = 972;
let cdp: Cdp;
let host: HostedApp | null = null;

const seedWorld = (): World => ({ home: WORK, data: WORK, big: "", put: () => {} });

async function open(ch: Chapter) {
  const prev = host;
  host = null;
  rmSync(`${WORK}/draft`, { recursive: true, force: true });
  if (ch.id === "11_hello") {
    const hello: any = await import("../examples/hello_simplegui.ts");
    host = await hostApp(() => hello.createHello());
    await cdp.goto(host.url, null);
  } else {
    host = hostDesigner(`${WORK}/draft`);
    await cdp.goto(host.url, null);
  }
  prev?.stop();
  await sleep(2000);
}

const notes = (marks: Array<{ at: number; title: string }>, total: number) => {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const text = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# SimpleGUI visual designer: build a desktop app without code (${fmtTime(total)})

## YouTube title

Build a Desktop App With No Code: The SimpleGUI Visual Designer (Bun + TypeScript)

## YouTube description (copy and paste)

\`\`\`text
A calm, step-by-step tutorial of the Bun RAD Studio visual designer: place controls from a palette of 101 controls across 11 collapsible categories, set their properties, hover styles, Delphi anchors and data bindings, align and distribute them, connect events in the script editor, run a live preview, choose from 63 form themes (133 in the SimpleGUI library), run layout audits and the MS Access CRUD database wizard, and export real Bun TypeScript, HTML, React, Vue 3, Python and FormSpec JSON code. Then the same ideas written by hand with the SimpleGUI API.

Free and open source: ${REPO}
Docs: ${REPO}/blob/main/docs/SIMPLEGUI_API.md

Chapters
${text}
\`\`\`

## Notes

- Recorded from the real designer in headless Chrome with a visible cursor; nothing is faked.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Rebuild: \`bun scripts/tutorial_designer.ts all\`. Re-record one chapter: \`... record 05_events\` then \`... build\`.
`;
};

const suite: Suite = {
  name: "designer",
  chapters: designerChapters,
  seedWorld,
  open: (ch) => open(ch),
  start: async () => { cdp = await Cdp.launch(CDP_PORT, "/tmp/designer_chrome", 1920, VIEW_H); },
  stop: () => { host?.stop(); cdp?.close(); },
  cdp: () => cdp,
  notes,
  viewHeight: VIEW_H,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
