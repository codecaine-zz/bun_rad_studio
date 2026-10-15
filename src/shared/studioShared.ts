/**
 * Everything the three database studios (SQLite, MySQL, PostgreSQL) share on the page: one stylesheet and one script
 * made of the Columns control, the in-page dialogs, the Create-view dialog, the keyboard shortcuts, Focus mode and the visual polish. The studios import only
 * this file, so a feature added to any part reaches all three the same way.
 */
import { STUDIO_COLUMNS_STYLE, STUDIO_COLUMNS_SCRIPT } from "./studioColumns";
import { STUDIO_DIALOGS_STYLE, STUDIO_DIALOGS_SCRIPT } from "./studioDialogs";
import { STUDIO_VIEWS_STYLE, STUDIO_VIEWS_SCRIPT } from "./studioViews";
import { STUDIO_SHORTCUTS_STYLE, STUDIO_SHORTCUTS_SCRIPT } from "./studioShortcuts";
import { STUDIO_FOCUS_STYLE, STUDIO_FOCUS_SCRIPT } from "./studioFocus";
import { STUDIO_POLISH_STYLE, STUDIO_POLISH_SCRIPT } from "./studioPolish";

export const STUDIO_SHARED_STYLE = [STUDIO_COLUMNS_STYLE, STUDIO_DIALOGS_STYLE, STUDIO_VIEWS_STYLE, STUDIO_SHORTCUTS_STYLE, STUDIO_FOCUS_STYLE, STUDIO_POLISH_STYLE].join("\n");
export const STUDIO_SHARED_SCRIPT = [STUDIO_DIALOGS_SCRIPT, STUDIO_COLUMNS_SCRIPT, STUDIO_VIEWS_SCRIPT, STUDIO_SHORTCUTS_SCRIPT, STUDIO_FOCUS_SCRIPT, STUDIO_POLISH_SCRIPT].join("\n");
