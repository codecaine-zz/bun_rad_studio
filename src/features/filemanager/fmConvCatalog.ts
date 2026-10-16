/**
 * Every conversion the File Manager knows, in the order the window lists them within each group.
 */
import { ARCHIVE_BUILTIN_DEFS, DATA_DEFS, TEXT_DEFS } from "./fmConvBuiltinDefs";
import { ARCHIVE_TOOL_DEFS, DOC_DEFS, EBOOK_DEFS, FONT_DEFS, PDF_DEFS } from "./fmConvDocs";
import { META_DEFS, PICTURE_DEFS, SOUND_DEFS, VIDEO_DEFS } from "./fmConvMedia";
import { MORE_PICTURE_DEFS, MORE_SOUND_DEFS, MORE_VIDEO_DEFS } from "./fmConvMediaMore";
import { STUDIO_DEFS } from "./fmConvStudio";
import type { ConvDef } from "./fmConvTypes";

export const CATALOG: ConvDef[] = [
  ...PICTURE_DEFS,
  ...MORE_PICTURE_DEFS,
  ...VIDEO_DEFS,
  ...MORE_VIDEO_DEFS,
  ...SOUND_DEFS,
  ...MORE_SOUND_DEFS,
  ...DOC_DEFS,
  ...DATA_DEFS,
  ...TEXT_DEFS,
  ...ARCHIVE_BUILTIN_DEFS,
  ...ARCHIVE_TOOL_DEFS,
  ...PDF_DEFS,
  ...EBOOK_DEFS,
  ...FONT_DEFS,
  ...META_DEFS,
  ...STUDIO_DEFS,
];

export const CATALOG_BY_ID = new Map(CATALOG.map((d) => [d.id, d]));
