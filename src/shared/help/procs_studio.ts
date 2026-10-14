import type { HelpTips, SkipRule } from "../helpMatch";

/** Procs Studio: a process viewer with ports, a tree view and signals. */
export const procsStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and the settings in this window (filter, sort, limit and the two tick boxes), so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#txt_search": "Narrow the list to processes whose command or user contains this text, or whose PID equals it. It is applied the next time the list refreshes: press Refresh.",
  "#dd_sort": "The order of the table: busiest processor first, most memory first, lowest PID first or by user name. Takes effect on the next refresh.",
  "#txt_limit": "The most rows to show, for example 50 or 100. Leave empty to show every process. Takes effect on the next refresh.",
  "#chk_ports": "When on, also look up which processes are listening for network connections and show their port numbers in the Ports column. Turning it off makes refreshing a little faster.",
  "#chk_auto": "When on, the process list refreshes by itself every 3 seconds. Turn it off to freeze the list.",
  "#btn_refresh": "Read the list of running processes again and apply the filter, sort order and limit.",
  "#btn_tree": "Switch the panel at the bottom between a family tree of processes (each process under the one that started it) and the details of the selected row. Press again to go back.",
  "#btn_sigterm": "Ask the selected process to quit politely (SIGTERM) so it can save and clean up. Select a row first. You are asked to confirm.",
  "#btn_sigkill": "Kill the selected process at once (SIGKILL). It cannot clean up, so unsaved work is lost. Select a row first. You are asked to confirm.",
  "#btn_inspect": "Show the full details of the selected row in the panel at the bottom: owner, parent, CPU and memory, state, CPU time, ports and the complete command.",
  "#btn_clear_filter": "Empty the filter box and refresh, so every process is listed again.",
  "#console_detail": "Shows the process tree or the details of the selected process. You can't type here.",
};

/** Controls that need no tip, each with a reason. */
export const procsStudioSkip: SkipRule[] = [
];
