import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `launcher_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const launcherStudioTips: HelpTips = {
  // Window
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Save the values in the boxes and the window settings to this app's settings file. This window does not load them back when it starts, so it changes little.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_rescan": "Look through the project again for tools that were added or removed, and update the list, the running status and the counts at the top.",

  // Quick launch: studios
  "#btn_quick_sqlite": "Open SQLite Studio, a window for browsing SQLite database files and running SQL queries.",
  "#btn_quick_redis": "Open Redis Studio, a window for looking at and editing the data on a Redis server.",
  "#btn_quick_api": "Open API Studio, a window for sending web requests (HTTP and REST) and reading the answers.",
  "#btn_quick_task": "Open Task Manager, a window that shows the running processes and how much CPU and memory they use.",
  "#btn_quick_bundler": "Open App Bundler Studio, a window for turning a script into a standalone program or a Mac .app.",
  "#btn_quick_code": "Open NovaCode, a code editor window.",
  "#btn_quick_env": "Open Env Studio, a window for checking and sharing .env settings files safely.",
  "#btn_quick_ipinfo": "Open IpInfo Studio, a window for finding where an IP address or website is located and for working out subnet ranges.",
  "#btn_quick_interval": "Open Interval Timer, a window for timed workouts and other repeating countdowns.",
  "#btn_quick_drcodecaine": "Open Dr. Codecaine, a retro arcade game.",
  "#btn_quick_lolo": "Open Lolo, a puzzle arcade game.",
  "#btn_quick_tetris": "Open Tetris Ultra, a falling-blocks game.",
  "#btn_quick_rad": "Open RAD Studio, a window with many small development utilities in one place.",
  "#btn_quick_calc": "Open the Calculator window.",
  "#btn_quick_markdown": "Open Markdown Studio, a window for writing Markdown text with a live preview.",
  "#btn_quick_paint": "Open Chroma Studio, a drawing and colouring window.",
  "#btn_quick_system": "Open System Studio, a window that shows information about this computer.",
  "#btn_quick_db": "Open Database Studio. This opens the same SQLite window as the SQLite Studio button.",
  "#btn_quick_fd": "Open Fd Studio, a window for finding files and folders and acting on the results.",
  "#btn_quick_git": "Open Git Studio, a window for viewing and committing changes in a Git repository.",
  "#btn_quick_tokei": "Open Tokei Studio, a window that counts the lines of code in a folder, by language.",
  "#btn_quick_gdu": "Open Gdu Studio, a window that shows which folders use the most disk space.",
  "#btn_quick_network": "Open Network Studio, a window for scanning ports and checking DNS.",
  "#btn_quick_crypto": "Open Crypto Studio, a window for hashes, encryption and token tools.",

  // Quick launch: terminal tools
  "#btn_quick_sys_cli": "Run the System command-line tool in a terminal window with the --telemetry flag, which prints information about this computer.",
  "#btn_quick_db_cli": "Run the Database command-line tool in a terminal window with --help, which lists what it can do.",
  "#btn_quick_fd_cli": "Run the Fd (file finder) command-line tool in a terminal window with --help, which lists what it can do.",
  "#btn_quick_git_cli": "Run the Git command-line helper in a terminal window with --help, which lists what it can do.",
  "#btn_quick_tokei_cli": "Run the Tokei (line counter) command-line tool in a terminal window with --help, which lists what it can do.",
  "#btn_quick_gdu_cli": "Run the Gdu (disk usage) command-line tool in a terminal window with --help, which lists what it can do.",
  "#btn_quick_net_cli": "Run the Network command-line tool in a terminal window with --help, which lists what it can do.",
  "#btn_quick_crypto_cli": "Run the Crypto command-line tool in a terminal window with --help, which lists what it can do.",

  // Favorites strip
  "#btn_quick_favs_filter": "Show only your favorite tools in the list and table below.",
  "#btn_quick_launch_fav1": "Start the first favorite tool. If you have no favorites yet, it marks the selected tool as a favorite and starts it.",
  "#btn_quick_toggle_fav": "Add the selected tool to your favorites, or remove it if it is one already. Favorites are listed first.",

  // Select and launch
  "#dd_select_app": "Pick the tool that the buttons next to it act on. It always shows the same choice as the list and the table below.",
  "#txt_cli_args": "Flags to give a command-line tool, such as --help or --telemetry. Quotes keep words together. Studio apps and demos ignore this box.",
  "#btn_launch": "Start the selected tool. A studio app or demo opens in its own window. A command-line tool opens in a terminal window with the flags from the box.",
  "#btn_fav": "Add the selected tool to your favorites, or remove it if it is one already. Favorites are listed first.",
  "#btn_terminal": "Run the selected command-line tool in a terminal window so you can type to it. Studio apps and demos just open their own window.",
  "#btn_run_inline": "Run the selected command-line tool here and show what it prints in the output box. It is stopped after 8 seconds. Studio apps and demos just open their own window.",
  "#btn_kill": "Stop the selected tool if it is running, by asking its process to end. Unsaved work in that window may be lost.",
  "#btn_reveal": "Show the selected tool's script file in your computer's file manager (Finder on a Mac).",
  "#btn_copy": "Copy the command that starts the selected tool, with the flags from the box, to the clipboard.",
  "#btn_edit": "Open the selected tool's source file in VS Code if it is installed, otherwise in your default text editor.",
  "#btn_copy_path": "Copy the full path of the selected tool's script file to the clipboard.",
  "#btn_stop_all": "Stop every running tool that is listed here, after you confirm. This can close windows with unsaved work.",
  "#btn_clear_history": "Reset the launch counts and last-used times of all tools, after you confirm. Your favorites are kept.",
  "#lst_apps": "All tools that match the filters. Click one to select it; double-click it or press Enter to start it. Stars mark favorites and [2x] means several copies are running.",

  // Search and filter
  "#txt_search": "Type words to search tool names, commands, paths, categories and descriptions. Every word must match. The list updates as you type, best matches first.",
  "#dd_category": "Show only tools of one kind: studio apps, command-line tools, demos, favorites, running tools or recently used ones. Choosing favorites clears the search and category.",
  "#dd_app_category": "Show only tools of one subject, such as Database or Games. The number is how many tools it holds. Choosing one clears the search and sets the scope to all tools.",
  "#dd_sort": "Choose the order of the list: favorites then running then A to Z, most recently used, most used, or A to Z.",
  "#btn_quick_favs": "Show only your favorite tools in the list and table below.",
  "#btn_filter": "Look through the project again and apply the search, scope, category and sort that are set now.",
  "#btn_clear_filter": "Clear the search and set scope and category back to all tools, so the whole list is shown.",
  "#btn_cat_all": "Show tools of every category again. The search and scope stay as they are.",
  "#btn_cat_db": "Show only database and storage tools. The number is how many there are. Clears the search.",
  "#btn_cat_devtools": "Show only developer tools. The number is how many there are. Clears the search.",
  "#btn_cat_system": "Show only system and hardware tools. The number is how many there are. Clears the search.",
  "#btn_cat_files": "Show only file and folder tools. The number is how many there are. Clears the search.",
  "#btn_cat_network": "Show only network and cloud tools. The number is how many there are. Clears the search.",
  "#btn_cat_prod": "Show only productivity and text tools. The number is how many there are. Clears the search.",
  "#btn_cat_games": "Show only games and entertainment. The number is how many there are. Clears the search.",
  "#btn_cat_security": "Show only security and cryptography tools. The number is how many there are. Clears the search.",
  "#btn_cat_design": "Show only design and media tools. The number is how many there are. Clears the search.",
  "#btn_cat_demos": "Show only demos and templates. The number is how many there are. Clears the search.",
  "#btn_cat_cli": "Show only command-line tools, which run in a terminal. The number is how many there are. Clears the search.",

  // Output
  "#txt_output": "Details of the selected tool (path, command, description, status), or the text a command-line tool printed when you ran it inline.",
  "#launcher_console": "A log of what the launcher did: tools started, stopped or rescanned, and any errors.",
};

/** Controls that need no tip, each with a reason. */
export const launcherStudioSkip: SkipRule[] = [];
