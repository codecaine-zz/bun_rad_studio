// The MySQL tutorial's chapters, in order, and how each one starts (see tutorial_mysql_studio.ts).
import type { Chapter } from "./fm_tutorial_types";
import { fmChapters } from "./mysql_tutorial_ch_fm";
import { gridChapters, sqlChapters } from "./mysql_tutorial_ch_grid";
import { designChapters } from "./mysql_tutorial_ch_design";
import { diagChapters } from "./mysql_tutorial_ch_diag";
import { macroChapters } from "./mysql_tutorial_ch_macro";
import { importChapters } from "./mysql_tutorial_ch_import";
import { endChapters, workbenchChapters } from "./mysql_tutorial_ch_end";
import { HOME } from "./mysql_tutorial_env";

/** What a chapter needs before the recording starts (all of it done out of sight, quickly). */
export interface Plan {
  /** The folder the File Manager opens on. */
  path: string;
  /** Save the connection found in the environment, and select it in the Databases tool. */
  saved?: boolean;
  /** Open MySQL Studio in Focus mode, past its welcome message. */
  studio?: boolean;
  /** Go back to the file list. */
  files?: boolean;
}

const shop = `${HOME}/Projects/shop-app`;

export const plans: Record<string, Plan> = {
  "02_find": { path: shop },
  "03_connection": { path: HOME, saved: true },
  "04_open": { path: HOME, saved: true },
  "05_workbench": { path: HOME, studio: true },
  "06_grid": { path: HOME, studio: true },
  "07_sql": { path: HOME, studio: true },
  "08_design": { path: HOME, studio: true },
  "09_diagnostics": { path: HOME, studio: true },
  "10_macros": { path: HOME, studio: true },
  "11_import": { path: `${HOME}/Projects/shop-app/data`, saved: true, files: true },
  "12_back": { path: HOME, studio: true },
};

export const mysqlChapters: Chapter[] = [
  ...fmChapters, ...workbenchChapters, ...gridChapters, ...sqlChapters, ...designChapters, ...diagChapters, ...macroChapters, ...importChapters, ...endChapters,
];
