import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `app_bundler_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const appBundlerStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme and the settings below (app, name, target, version, icon, options) so they are still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#dd_preset_app": "Pick one of the studio apps found in the applications folder. Choosing one fills in the name, entry script and a matching icon straight away.",
  "#btn_load_app": "Fill in the name, entry script and icon from the app chosen in the list on the left. It does the same as picking the app in the list.",
  "#btn_browse_app": "Choose any .ts or .js script on your computer with a file dialog. Its name, entry script and a matching icon are filled in below.",
  "#btn_rescan": "Look again in the applications and icons folders and refresh both lists. Use it after adding a new app or icon file.",
  "#txt_app_name": "The name of the finished program or .app, for example DevToolsStudio. Characters not allowed in file names are replaced with _. It is also used as the output file name.",
  "#dd_target": "The kind of computer to build for. Native Host builds for this computer. The standalone binary honours every choice; a macOS .app only honours the two Apple choices and ignores Linux and Windows.",
  "#btn_compile_binary": "Compile the entry script with Bun into one standalone program in the dist folder. It runs without Bun installed. The result and any errors appear in the log below.",
  "#txt_exec_path": "The script the program starts from, such as ./applications/devtools_studio.ts. The path is relative to the folder this app was started from. The build stops if the file does not exist.",
  "#btn_browse_script": "Choose the entry script with a file dialog. It loads the script exactly like Browse File above, so the name and icon are also replaced.",
  "#txt_version": "The version number written into the macOS .app, for example 1.0.0. It is not used by the standalone binary.",
  "#btn_build_bundle": "Build a macOS .app in the dist folder: a compiled program, an Info.plist and your icon. If compiling fails, a small launcher script that runs the source with Bun is used instead. Signs the app if Ad-hoc Codesign is on.",
  "#btn_open_dist": "Open the dist folder, where finished programs and .app bundles are saved. The folder is created if it does not exist yet.",
  "#dd_preset_icon": "Pick an icon from the icons folder. Choosing one copies its path into the icon box on the right.",
  "#txt_icon_path": "The icon file for the .app: .icns, .png or .ico. A PNG is converted to a macOS icon on a Mac. Empty means no icon. Only used when building a .app.",
  "#btn_browse_icon": "Choose an icon file (.icns, .png or .ico) with a file dialog. It is put in the icon box and added to the log.",
  "#chk_minify": "ON: make the program smaller by shortening its code (bun --minify). OFF: keep the code as written. Applies to both Compile Standalone Binary and Build macOS .app.",
  "#chk_sourcemap": "Meant to add sourcemaps for easier debugging. Currently it has no effect on any build.",
  "#chk_codesign": "ON: sign a built .app with an ad-hoc signature (codesign -s -) so macOS will open it on this Mac. It runs only on macOS and only for Build macOS .app, not for the standalone binary.",
  "#chk_retina": "Meant to switch high-resolution support on or off. Currently it has no effect: built apps always declare high-resolution support.",
  "#txt_plist_preview": "A summary of the build you have set up. After Build macOS .app it shows the Info.plist that was written. Editing this box changes nothing.",
  "#bundler_console": "A log of loading, compiling, signing and errors. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const appBundlerStudioSkip: SkipRule[] = [
];
