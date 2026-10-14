import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `watchexec_studio` (also the page of `watcher_studio`). Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const watchexecStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Save the window size, theme and what you typed or ticked in the boxes, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_watch_path": "The folder to keep an eye on, including its subfolders, such as ./src. A relative path starts from the folder the app was started from. Changes made inside it run the command.",
  "#btn_browse_path": "Choose the folder to watch in a folder picker and put it in the Watch Directory box.",
  "#txt_cwd": "The folder the command runs in. Leave empty to use the folder the app was started from.",
  "#btn_browse_cwd": "Choose the folder the command runs in with a folder picker and put it in the Run In box.",
  "#dd_preset": "Pick a ready-made command, such as bun test or a type-check, to fill the Execute Command box. You can still edit it. Custom leaves the box as it is.",
  "#txt_exec_cmd": "The shell command to run each time a watched file changes, such as bun test or echo hello. It runs through sh, so pipes and && work.",
  "#btn_trigger_now": "Run the command once right now, without waiting for a file change. It works even when the watcher is stopped.",
  "#txt_exts": "Only react to files with these endings, separated by commas, such as ts,js. Leave empty to react to every file. Used when the watcher starts.",
  "#txt_ignore": "Ignore changes to any path that contains one of these texts, separated by commas, such as node_modules,.git. Used when the watcher starts.",
  "#txt_debounce": "Milliseconds to wait after the last change before running. A burst of saves then runs the command once. Used when the watcher starts; 150 if empty.",
  "#chk_clear": "ON: empty the console before each run, so you only see the newest output. OFF: keep adding to it.",
  "#chk_postpone": "ON: wait for the first file change before running. OFF: run the command once as soon as the watcher starts.",
  "#chk_restart": "ON: a new change stops a command that is still running and starts it again. OFF: changes are ignored until the running command finishes.",
  "#chk_notify": "ON: show a short pop-up message when a run ends, saying whether it succeeded or failed. OFF: no pop-up.",
  "#btn_start_watch": "Start watching the folder. When a matching file changes, the command runs after the debounce wait. Pressing it again restarts the watcher with the current settings.",
  "#btn_stop_watch": "Stop watching the folder. A command that is still running is stopped too.",
  "#btn_kill_run": "Stop the command that is running now. The watcher keeps watching and will run it again on the next change.",
  "#btn_clear_console": "Empty the console view. The copy used by Copy Log and Export Log is not emptied.",
  "#btn_copy_log": "Copy the console text to the clipboard.",
  "#btn_export_log": "Save the console text to a text file; a save dialog asks where.",
  "#watch_console": "Live output of the command, with a note for each run and its exit code. You cannot type here.",
  "#btn_clear_history": "Empty the history table of runs. This does not affect the console.",
};

/** Controls that need no tip, each with a reason. */
export const watchexecStudioSkip: SkipRule[] = [];
