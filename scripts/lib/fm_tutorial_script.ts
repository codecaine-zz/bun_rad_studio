// The File Manager tutorial's chapters in order. Chapter files write "<HOME>" for the sample home folder.
import type { Chapter } from "./fm_tutorial_types";
import { basics } from "./fm_tutorial_ch_basics";
import { operations } from "./fm_tutorial_ch_ops";
import { toolsAndSafety } from "./fm_tutorial_ch_tools";
import { finale } from "./fm_tutorial_ch_finale";
import { power } from "./fm_tutorial_ch_power";
import { ending } from "./fm_tutorial_ch_ending";

// The real path (on macOS /tmp is a link to /private/tmp): the terminal reports the real folder after `cd`, and the file
// list follows it, so the sample home must already be written that way to stay the same folder on screen.
export const FM_HOME = process.platform === "darwin" ? "/private/tmp/fmv/home" : "/tmp/fmv/home";

const place = (c: Chapter): Chapter => ({ ...c, path: c.path?.replace("<HOME>", FM_HOME) });

export const chapters: Chapter[] = [...basics, ...operations, ...toolsAndSafety, ...finale, ...power, ...ending].map(place);
export type { Chapter, Step, World } from "./fm_tutorial_types";
