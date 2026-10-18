import type { HelpTips, SkipRule } from "../helpMatch";

/** RAD Utilities Studio: a catalog of 44 small helper modules with code recipes. */
export const radStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and the chosen category and module, so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#dd_category": "Show only the modules of one group (files, data, strings, system, network, functions) in the catalog table, or all 44. It does not change the Select Module list.",
  "#dd_module": "Choose one module. Its code example appears in the recipe box and the log notes the choice. Test Module and Copy Recipe work on this module.",
  "#btn_run_module": "Run a quick self-check of the chosen module and write the result and time to the log. Some modules do a real round trip (for example the file module writes a small test file in /tmp); others only confirm the module loads.",
  "#btn_run_all": "Check that all 44 modules are present and loaded, and log how many are available. It does not call their functions.",
  "#btn_copy_recipe": "Copy the TypeScript example for the chosen module to the clipboard, ready to paste into your own code. This also resets the recipe box to the original example.",
  "#btn_clear": "Empty the log at the bottom. Nothing else is affected.",
  "#txt_recipe": "A short TypeScript example showing how to use the chosen module. Changing the module replaces it, and edits are not saved.",
  "#console_rad": "A log of module choices, category filters and test results. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const radStudioSkip: SkipRule[] = [];
