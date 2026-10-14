import type { HelpTips, SkipRule } from "../helpMatch";

/** Task Manager Pro (the process monitor, app file process_studio / task_manager). */
export const taskManagerTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_refresh": "Read the list of running processes again right now and update the table, the counts and the log.",
  "#dd_autorefresh": "How often the process list updates by itself: every 1, 2 or 5 seconds, or never (Off). Use Refresh to update by hand when it is Off.",
  "#btn_export": "Save the processes currently shown in the table to a file you choose. A name ending in .json gives JSON; any other name gives CSV (a spreadsheet-friendly list).",
  "#btn_copy_table": "Copy the processes currently shown in the table to the clipboard as tab-separated text, ready to paste into a spreadsheet.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember the window size, the theme and the settings in this window (filter, sort, limit, refresh rate, port, group by app), so they are restored next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_cat_all": "Show every running process. Ignored while text is typed in the search box.",
  "#btn_cat_user": "Show only the processes started by you (your apps and tools), hiding system processes.",
  "#btn_cat_cpu": "Show only processes using at least 1 percent of the processor right now.",
  "#btn_cat_mem": "Show only processes using at least 100 MB of memory (RSS, the memory actually in use).",
  "#btn_cat_dev": "Show only development and runtime servers, such as node, bun, python and similar tools that often listen on a port.",
  "#btn_cat_ports": "Show only processes that are listening for network connections, with the port numbers they use.",
  "#txt_filter": "Type to narrow the table while you type. It looks in name, PID, port, user and command, tolerates small typos, and understands words such as terminal. While it has text, the category buttons are ignored.",
  "#btn_apply_filter": "Apply the search text now. The table also updates by itself shortly after you stop typing, or when you press Enter.",
  "#btn_clear_filter": "Empty the search box, go back to the All category and show every process.",
  "#dd_sort": "Choose the order of the table: busiest processor first, most memory (percent or MB), PID number, name, or port.",
  "#dd_limit": "Show every process or only the first 50, 100 or 200 after sorting. The limit is relaxed while a search is active.",
  "#txt_port": "A port number from 1 to 65535, such as 3000 or 8080, for the Kill Port Process button.",
  "#btn_kill_port": "Force-kill the process that is listening on the port in the box to its left (SIGKILL, no clean-up). It asks you to confirm first and shows which processes will be killed.",
  "#btn_clean_dev": "Find your own development servers that are listening on a port or were left running with no parent, then ask before terminating them. Never touches this app's own processes.",
  "#chk_group": "When on, the table shows one row per application name with a process count and combined CPU and memory, instead of one row per process. Click a row to select that app's busiest process.",
  "#txt_target_pid": "The PID (process number) that the buttons below act on. Clicking a row of the table fills it in; you can also type a PID.",
  "#btn_kill_force": "Kill the process at once with SIGKILL. It cannot clean up or save, so unsaved work is lost. Always asks you to confirm. PID 1, this app and system-critical processes are refused.",
  "#btn_kill_term": "Ask the process to quit politely (SIGTERM), so it can save and clean up. Asks to confirm when the process belongs to someone else, listens on a port or launched this app.",
  "#btn_kill_stop": "Freeze the process (SIGSTOP) without ending it. It uses no processor until you press Resume. Asks you to confirm first.",
  "#btn_kill_cont": "Continue a process that was frozen with Suspend (SIGCONT).",
  "#btn_kill_hup": "Send SIGHUP (hang-up). Many background services re-read their settings when they get it, but some programs quit instead.",
  "#btn_copy_pid": "Copy the Target PID number to the clipboard.",
  "#btn_copy_cmd": "Copy the full command line that started the selected process to the clipboard.",
  "#btn_kill_tree": "Terminate the selected process and everything it started (its child processes), after one confirmation that lists them. Uses SIGTERM.",
  "#btn_kill_group": "Terminate every process with the same name and owner as the selected one (for example all copies of an app), after one confirmation that lists them.",
  "#btn_inspect": "Write a detailed report on the selected process to the log below: state, owner, parent, child processes, uptime, listening ports, working folder, open files and full command.",
  "#btn_reveal": "Show the program file of the selected process in Finder. Works when the command starts with a full path, such as an app bundle.",
  "#btn_renice": "Give the selected process lower scheduling priority (nice +10) so it yields the processor to other programs. Works only on your own processes.",
  "#task_console": "A log of refreshes, signals sent, exports and inspection reports. You can't type here.",
  "#btn_clear_console": "Empty the log below. Nothing happens to any process.",
};

/** Controls that need no tip, each with a reason. */
export const taskManagerSkip: SkipRule[] = [
];
