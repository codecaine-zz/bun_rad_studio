// Starting a chapter (a fresh File Manager, a freshly seeded database, and whatever the chapter assumes already happened) and a
// dry run that performs a chapter's actions without the narration, taking a picture after each step (for checking them).
import { mkdirSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./cdp_recorder";
import type { Chapter } from "./fm_tutorial_types";
import type { Do } from "./step_video";
import * as E from "./mysql_tutorial_env";
import { plans, mysqlChapters } from "./mysql_tutorial_script";

export async function openChapter(c: Cdp, ch: Chapter) {
  const plan = plans[ch.id];
  if (!plan) throw new Error(`no plan for ${ch.id}`);
  await E.freshFm(c, plan.path);
  if (plan.saved || plan.studio) await E.saveEnvConnection(c);
  if (plan.studio) await E.openStudioQuiet(c);
  if (plan.files) { await c.eval(`document.querySelector('#view-files')?.click()`); await sleep(800); }
}

/** A Do (the helpers a step's action uses) for dry runs; it behaves like the one the engine gives a recording. */
let snap: (() => Promise<void>) | null = null;
function dryDo(c: Cdp): Do {
  const need = async (ok: boolean, what: string) => { if (!ok) throw new Error(`could not find ${what}`); };
  const self: Do = {
    c, world: { home: E.HOME, data: E.DATA, big: "", put: () => {} },
    click: async (s, o) => need(await c.click(s, o), s),
    dblclick: async (s, o) => need(await c.dblclick(s, o), s),
    rclick: async (s, o) => need(await c.rclick(s, o), s),
    hover: async (s, ms) => { await need(await c.exists(s), s); await c.hover(s, ms); },
    type: (t, per) => c.type(t, per),
    key: (k, l) => c.key(k, l),
    scroll: (s, dy, steps) => c.scroll(s, dy, steps),
    wait: async (ms) => { await sleep(ms / 2); if (ms >= 2000 && snap) await snap(); await sleep(ms / 2); },
    waitFor: async (s, ms) => need(await c.waitFor(s, ms ?? 8000), s),
    menu: (t, o) => self.click(`.menu [role^=menuitem] >> ${t}`, { pause: o?.pause ?? 700 }),
    row: async (name, how = "click", o) => (how === "hover" ? self.hover(`#list .row >> ${name}`, 600) : self[how](`#list .row >> ${name}`, { pause: o?.pause })),
    dialog: (t, o) => self.click(`.dialog button >> ${t}`, { pause: o?.pause ?? 800 }),
    eval: (e) => c.eval(e),
  };
  return self;
}

/** `bun scripts/_dry.ts 05_grid[:3]` runs the chapter (or only step 3 of it, after the earlier ones) and saves pictures. */
export async function dryRun(ids: string[]) {
  const out = join(E.WORK, "dry");
  mkdirSync(out, { recursive: true });
  await E.startMysql();
  const c = await Cdp.launch(E.CDP_PORT, E.CHROME_DIR, 1920, 972);
  try {
    E.seedHome();
    for (const id of ids) {
      const ch = mysqlChapters.find((x) => x.id === id);
      if (!ch || ch.kind === "card") continue;
      console.log(`● ${id}`);
      await openChapter(c, ch);
      const d = dryDo(c);
      for (let i = 0; i < ch.steps.length; i++) {
        const t0 = performance.now();
        let w = 0;
        snap = () => c.screenshot(join(out, `${id}_${i}_w${w++}.png`));
        try {
          await ch.steps[i]!.act?.(d);
        } catch (e) {
          console.log(`  ✗ ${i} ${ch.steps[i]!.cap}: ${(e as Error).message}`);
          await c.screenshot(join(out, `${id}_${i}_FAILED.png`));
          break;
        }
        console.log(`  ✓ ${i} ${((performance.now() - t0) / 1000).toFixed(1)}s  ${ch.steps[i]!.cap}`);
        await c.screenshot(join(out, `${id}_${i}.png`));
      }
    }
  } finally { c.close(); E.stopFm(); }
}
