// The File Manager tutorial's chapters in order. Chapter files write "<HOME>" for the sample home folder.
import type { Chapter } from "./fm_tutorial_types";
import { basics } from "./fm_tutorial_ch_basics";
import { operations } from "./fm_tutorial_ch_ops";
import { toolsAndSafety } from "./fm_tutorial_ch_tools";
import { finale } from "./fm_tutorial_ch_finale";

export const FM_HOME = "/tmp/fmv/home";

const place = (c: Chapter): Chapter => ({ ...c, path: c.path?.replace("<HOME>", FM_HOME) });

export const chapters: Chapter[] = [...basics, ...operations, ...toolsAndSafety, ...finale].map(place);
export type { Chapter, Step, World } from "./fm_tutorial_types";
