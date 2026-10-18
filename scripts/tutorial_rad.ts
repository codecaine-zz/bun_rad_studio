#!/usr/bin/env bun
/**
 * "Bun RAD Studio: the complete RAD tutorial": build desktop apps with the SimpleGUI A P I, design a form, use the rad
 * modules and the system tools, and ship a program. The real example programs run next to their code.
 *
 *   bun scripts/tutorial_rad.ts list | audio [--shard i/n] | record [ids,...] | build | all
 *
 * Writes youtube_production/rad_tutorial.mp4 and RAD_TUTORIAL_NOTES.md. The engine is scripts/lib/step_video.ts; the side-by-side
 * stage is scripts/lib/rad_stage.ts; the chapters are scripts/lib/rad_tutorial_script.ts and examples/rad_tutorial/.
 */
import "./lib/tts_edge_default";
import { mkdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { hostApp, hostDesigner, type HostedApp } from "./lib/host_app";
import { EDGE_VOICE, fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import { loadStage, outputs, serveStage, type StageServer } from "./lib/rad_stage";
import { radChapters, stages } from "./lib/rad_tutorial_script";
import type { Chapter, World } from "./lib/fm_tutorial_types";

// SimpleGUI remembers the last theme in ~/.config/simplegui; the recording must not change the real one.
mkdirSync("/tmp/rad_home", { recursive: true });
process.env.HOME = "/tmp/rad_home";

const ROOT = process.cwd();
const WORK = "/tmp/rad_tutorial";
const EXAMPLES = join(ROOT, "examples", "rad_tutorial");
const CDP_PORT = 9366;
const VIEW_H = 972;
let cdp: Cdp;
let host: HostedApp | null = null;
let stageServer: StageServer | null = null;

const seedWorld = (): World => ({ home: WORK, data: WORK, big: "", put: () => {} });
const clean = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+$/, "");

/** Runs a command for real and returns what it printed (the video shows exactly this). */
function capture(cmd: string[], cwd: string): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return clean(r.stdout.toString() + r.stderr.toString());
}

async function open(ch: Chapter) {
  host?.stop(); host = null;
  stageServer?.stop(); stageServer = null;
  const spec = stages[ch.id];
  if (!spec) throw new Error(`no stage for ${ch.id}`);

  if (spec.designer) {
    rmSync(`${WORK}/draft`, { recursive: true, force: true });
    host = hostDesigner(`${WORK}/draft`);
    await cdp.goto(host.url, null);
    await sleep(2000);
    return;
  }

  if (ch.id === "11_ship") {
    rmSync(WORK, { recursive: true, force: true });
    mkdirSync(WORK, { recursive: true });
    const built = capture(["bun", "build", "--compile", join(ROOT, "examples/hello_simplegui.ts"), "--outfile", "hello"], WORK);
    outputs[ch.id] = `${built}\n${capture(["ls", "-lh", "hello"], WORK)}`.replace(/^\s+/, "");
  } else if (spec.term && "command" in spec.term) {
    outputs[ch.id] = capture(spec.term.command, ROOT);
  }

  stageServer = serveStage();
  let app: string | undefined;
  if (spec.make) {
    const mod: any = await import(join(EXAMPLES, spec.file));
    host = await hostApp(() => mod[spec.make!]());
    app = host.url;
  }
  await cdp.goto(stageServer.url, null);
  await sleep(600);
  await loadStage({ c: cdp }, { file: resolve(EXAMPLES, spec.file), title: spec.title, app, layout: "split" });
  if (!app) await cdp.eval("window.__stage.idle()");
  await sleep(1500);
  // The program is drawn a little larger than it is, so it reads well in a video.
  if (app) { await cdp.evalFrame("#appframe", `document.documentElement.style.zoom = ${JSON.stringify(String(spec.zoom ?? 1.2))}`); await sleep(500); }
}

const notes = (marks: Array<{ at: number; title: string }>, total: number) => {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const text = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Bun RAD Studio: the complete RAD tutorial (${fmtTime(total)})

## YouTube title

Build Desktop Apps Fast With Bun: The Complete SimpleGUI RAD & Visual Designer Tutorial (TypeScript)

## YouTube description (copy and paste)

\`\`\`text
Rapid application development with Bun RAD Studio and SimpleGUI RAD App Builder. Learn the SimpleGUI API one idea at a time with the code beside the running program: windows, rows, grids and cards, standard and form controls, VLang parity widgets, Studio extended controls, enterprise components, reactive state and OS persistence, menus, toolbars, context menus, SweetAlert2 dialogs, declarative modals, webview file pickers, timers, busy states, 133 themes, and a finished contacts app with SQLite. Then design a form with the visual designer, use the 45 rad utility modules and the 10 system tools (fd, sd, tokei, gdu, watchexec and more) as plain functions, and compile a single binary people can run.

Free and open source: ${REPO}
SimpleGUI API: ${REPO}/blob/main/docs/SIMPLEGUI_API.md
Designer / form API: ${REPO}/blob/main/docs/API.md
System utilities: ${REPO}/blob/main/docs/SYSTEM_UTILITIES_API.md
The programs in this video: ${REPO}/tree/main/examples/rad_tutorial

Chapters
${text}
\`\`\`

## Notes

- Every program is real and runs live next to its source file (examples/rad_tutorial/). Terminal output is what the command printed when the chapter was recorded.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female).
- Rebuild: \`bun scripts/tutorial_rad.ts all\`. Re-record one chapter: \`... record 05_dialogs_menus\` then \`... build\`.
`;
};

const suite: Suite = {
  name: "rad",
  chapters: radChapters,
  seedWorld,
  open: (ch) => open(ch),
  start: async () => { cdp = await Cdp.launch(CDP_PORT, "/tmp/rad_chrome", 1920, VIEW_H); },
  stop: () => { host?.stop(); stageServer?.stop(); cdp?.close(); },
  cdp: () => cdp,
  notes,
  viewHeight: VIEW_H,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
