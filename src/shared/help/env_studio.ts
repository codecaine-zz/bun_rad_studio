import type { HelpTips, SkipRule } from "../helpMatch";

/** Environment & Secret Vault Studio. */
export const envStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_validate": "Check the settings on the left for mistakes: a missing =, the same name twice, or an empty value that should be filled in. The results appear in the log at the bottom.",
  "#btn_mask": "Hide the values of secrets (passwords, keys, tokens) with asterisks so it is safe to share your screen.",
  "#btn_unmask": "Show the real values of secrets again.",
  "#btn_diff": "Compare your settings with the example file on the right and list what is missing or extra.",
  "#btn_gen_example": "Make an example file from your settings: the names stay, the values are blanked. Safe to share or commit.",
  "#btn_export_env": "Save your settings as a .env file on this computer.",
  "#txt_env_active": "Your settings, one NAME=value per line. Lines that start with # are comments.",
  "#txt_env_compare": "The example (template) file to compare against. Paste or generate one here.",
  "#env_console": "A log of what the checks found. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const envStudioSkip: SkipRule[] = [];
