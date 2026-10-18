import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `brew_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const brewStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme and the package name you typed so they are still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#txt_pkg_name": "The name of an npm package, such as webview-bun or @types/node. You can add a version, for example react@18. Search and Info use it as typed; bun add and bun remove only accept a valid package name.",
  "#btn_search": "Search the public npm registry (the online catalog of JavaScript packages) for the text in the box and list up to 8 matches with version, description and publisher. Needs an internet connection.",
  "#btn_info": "Look up the package named in the box on the npm registry and show its latest version, description, license, dates, repository and dependencies. Needs an internet connection.",
  "#btn_install": "Run bun add with the package in the box. It downloads the package and adds it to package.json in the folder this app was started from. The output is shown below.",
  "#btn_uninstall": "Run bun remove with the package in the box. It deletes the package from package.json and node_modules in the folder this app was started from.",
  "#btn_telemetry": "Show a snapshot of this computer and this app: Bun version, uptime, memory use, CPU cores, load average and network interfaces.",
  "#btn_list_all": "Run bun pm ls to list the packages installed in the project folder this app was started from.",
  "#btn_cache_info": "Run bun pm cache to show where Bun keeps its download cache (the saved copies of packages it has fetched).",
  "#btn_bin_path": "Run bun pm bin -g to show the folder where globally installed Bun programs are placed.",
  "#btn_cleanup": "Delete Bun's download cache after you confirm. Nothing in your project is touched, but packages are downloaded again the next time they are needed.",
  "#btn_doctor": "Show a short report on the Bun in use: where it is, its version and your system. It only prints facts known to the app and does not test anything; its System Health line is always OK.",
  "#btn_test": "Run bun test, the test runner, in the folder this app was started from. This can take a while. The test output is shown below.",
  "#btn_gc": "Ask Bun to free memory it no longer needs right now (garbage collection). The result is only noted in the log; it is safe to press at any time.",
  "#txt_brew_out": "The result of the last action, such as search results, package details or command output. You can select and copy the text.",
  "#brew_console": "A log of the actions you ran and how long each took. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const brewStudioSkip: SkipRule[] = [];
