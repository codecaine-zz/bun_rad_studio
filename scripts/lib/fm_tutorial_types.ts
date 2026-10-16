import type { Do } from "../tutorial_file_manager";

/** The sample world a chapter starts from (see seedWorld in tutorial_file_manager.ts). */
export interface World {
  home: string;
  data: string;
  put(rel: string, body: string): void;
  big: string;
}

export interface Step {
  /** What the narrator says while this step happens. Plain sentences: each one is spoken with a pause after it. */
  say: string;
  /** The short line shown in the caption strip under the picture (what to look at or do). */
  cap: string;
  /** What happens on screen. It starts `lead` milliseconds after the voice does. */
  act?: (d: Do) => Promise<void>;
  lead?: number;
  /** A rest after both the voice and the action are finished. */
  hold?: number;
}

export interface Chapter {
  id: string;
  /** The small label in the caption strip. */
  chapter: string;
  /** The chapter's title (also the YouTube chapter name). */
  title: string;
  blurb?: string;
  kind?: "live" | "card" | "external";
  card?: { kicker: string; title: string; lines: string[] };
  /**
   * For kind "external": the finished segments of another tutorial (youtube_production/<dir>/segments) are joined in
   * after this chapter's title card, without their own intro, outro and title cards. `label` prefixes their chapter names.
   */
  external?: { dir: string; label: string };
  /** The folder the File Manager opens on (default: the shop-app sample project). */
  path?: string;
  /** Leave the first-run welcome window open (the first chapter shows it). */
  welcome?: boolean;
  /** A view button to press before recording starts, for example "#view-tools". */
  view?: string;
  setup?: (w: World) => void;
  before?: (d: Do) => Promise<void>;
  steps: Step[];
}
