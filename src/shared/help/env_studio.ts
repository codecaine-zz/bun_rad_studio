import type { HelpTips, SkipRule } from "../helpMatch";

/** Environment & Secret Vault Studio. */
export const envStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_open_env": "Choose a .env file on this computer and show it in the box below. The file itself is not changed until you save.",
  "#btn_validate": "Check your settings for mistakes: a missing =, a name that is not valid, the same name twice. Empty values, placeholders and values with spaces are listed as notes. The results appear in the log at the bottom.",
  "#btn_mask": "Hide the values of secrets (passwords, keys, tokens) with asterisks so it is safe to share your screen.",
  "#btn_unmask": "Show the real values of secrets again. A line you edited while the dots were showing keeps your edit.",
  "#btn_copy_env": "Copy your settings to the clipboard, with the real values (even if the dots are showing). Paste it only where it is safe.",
  "#btn_clear_env": "Empty the settings box. A file you opened is not touched.",
  "#btn_diff": "Compare your settings with the example file and list what is missing, extra or empty in the report box. The example file is not changed.",
  "#btn_copy_example": "Copy the example file to the clipboard, ready to paste into a chat, a README or a new file.",
  "#btn_save_example": "Save the example file on this computer. It is usually called .env.example and can be committed to git.",
  "#btn_open_template": "Choose an existing example file (such as .env.example) to compare your settings with.",
  "#btn_gen_example": "Make an example file from your settings: the names stay, the values are blanked (only plain settings such as ports and hosts keep theirs, never a secret). Safe to share or commit.",
  "#btn_export_env": "Choose where to save your settings as a .env file. Only you can read the saved file. You choose the name, and your computer asks before replacing a file.",
  "#txt_env_active": "Your settings, one NAME=value per line. Lines that start with # are comments.",
  "#txt_env_compare": "The example (template) file to compare against. Paste, open or generate one here.",
  "#txt_env_report": "The result of the comparison: names missing from your settings, names only you have, and empty ones. It is rewritten each time you press Compare.",
  "#env_console": "A log of what the checks found. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const envStudioSkip: SkipRule[] = [];
