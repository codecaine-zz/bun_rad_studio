/**
 * The page (as HTML text) an app shows, found by app id. For the audit and the tests: it only builds the page, it
 * never opens a window or starts a server.
 */
import { readdirSync } from "fs";
import { join } from "path";

const APPLICATIONS = join(import.meta.dir, "..", "..", "applications");

/** Apps whose page is not produced by `createXxxStudio().generateHtml()`: how to get it. */
const CUSTOM: Record<string, () => Promise<string>> = {
  // The visual designer is opened from index.ts, which adds the script to the built page.
  designer: async () => {
    const { getIdeHtml } = await import("../../index.ts");
    const { injectHelp } = await import("./helpTips");
    return injectHelp(getIdeHtml(), "designer");
  },
};

/** Pages that are not an `applications/*_studio.ts` file. */
const EXTRA_APPS = ["designer"];

export function appFiles(): string[] {
  return readdirSync(APPLICATIONS).filter((f) => f.endsWith("_studio.ts")).map((f) => f.replace(/\.ts$/, ""));
}

export async function pageFor(appId: string): Promise<string> {
  if (CUSTOM[appId]) return await CUSTOM[appId]!();
  const mod: any = await import(join(APPLICATIONS, `${appId}.ts`));
  const factory = Object.entries(mod).find(([k, v]) => /^create.*Studio$/.test(k) && typeof v === "function")?.[1] as ((o: object) => any) | undefined;
  if (!factory) throw new Error(`${appId} has no createXxxStudio() to build its page from`);
  const inst = factory({});
  const html = typeof inst.generateHtml === "function" ? inst.generateHtml() : "";
  if (!html) throw new Error(`${appId} did not produce a page`);
  return html;
}

/** The help dictionary id a page was injected with (see `injectHelp`), or null. */
export function helpIdOf(html: string): string | null {
  return /<!-- studio-help:([\w-]*) -->/.exec(html)?.[1] || null;
}

/** Apps that are games, which do not get help tooltips. Every other `applications/*_studio.ts` must have a dictionary. */
export const GAME_APPS = new Set([
  "artillery_studio", "asteroids_studio", "balatro_studio", "balloon_fight_studio", "bejeweled_studio", "blackjack_studio",
  "bomberman_studio", "bowling_studio", "breakout_studio", "centipede_studio", "chips_challenge_studio", "chuchu_rocket_studio",
  "codecaine_bros_studio", "connect4_studio", "cyber2048_studio", "cyber_maker_studio", "darts_studio", "dr_codecaine_studio",
  "flappy_bird_studio", "frogger_studio", "game_show_studio", "jezzball_studio", "lemmings_studio", "lode_runner_studio",
  "lolo_studio", "lunar_lander_studio", "magical_drop_studio", "mappy_studio", "marble_madness_studio", "math_munchers_studio",
  "maze_generator_studio", "memory_match_studio", "minesweeper_studio", "missile_command_studio", "pacman_studio", "peggle_studio",
  "pinball_studio", "pipe_dream_studio", "poker_studio", "pong_studio", "pool_studio", "qbert_studio",
  "qix_studio", "rampart_studio", "rat_screw_studio", "reversi_checkers_studio", "rodents_revenge_studio", "skifree_studio",
  "slots_studio", "snake_studio", "sokoban_studio", "solitaire_studio", "space_invaders_studio", "tetris_studio",
  "tictactoe_studio", "typing_studio", "uno_studio", "vampire_survivors_studio", "word_search_studio", "yahtzee_studio",
]);

/** Apps with their own page and tooltips, outside this system (the File Manager serves a locked-down page and has its own). */
export const OTHER_HELP = new Set(["file_manager_studio"]);

export function helpApps(): string[] {
  return [...appFiles().filter((a) => !GAME_APPS.has(a) && !OTHER_HELP.has(a)), ...EXTRA_APPS].sort();
}
