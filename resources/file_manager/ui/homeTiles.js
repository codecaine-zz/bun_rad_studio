// The built-in tiles of the Home view. Each tool in the Power panel gets a tile automatically; other parts of the
// page can add their own with registerHomeTile() from home.js.
import { openAboutLink, showAbout, showDonate } from "./about.js";
import { showHelp, showSettings } from "./extras.js";
import { showThemePicker } from "./themes.js";
import { showMoreInfo } from "./fileinfo.js";
import { registerHomeTile, registerHomeTileProvider } from "./home.js";
import { showTrash } from "./nav.js";
import { showOpenWith } from "./openwith.js";
import { listPowerTabs, openPower } from "./power.js";
import { openServeTool } from "./serveActions.js";
import { selectedEntries } from "./selection.js";
import { emit, state } from "./state.js";
import { showToolsDialog } from "./tools.js";
import { lockSelection } from "./vault.js";

const toFiles = () => emit("workspace-go", "files");

/** Plain-words descriptions for the tools; a tool without one here uses the tip it registered with. */
const TOOL_TEXT = {
  find: "Find files by name, text inside them, size or date. Spot duplicates and act on many at once.",
  watch: "Run a command automatically whenever the files in a folder change.",
  crypto: "Make checksums, lock and unlock text, create passwords and tokens, and convert codes.",
  ip: "Look up an internet address or website, and work out network ranges.",
  net: "Check ports, website names, certificates and whether a connection works.",
  sd: "Change a word or phrase in many files at once, with a preview and Undo.",
  calc: "Everyday, scientific, graphing and programmer calculators, plus unit conversion.",
  timer: "A timer for workouts, studying and cooking, with sounds and music.",
  code: "Write and edit text and code files, with find and replace, and run them.",
  vault: "Lock files with a password, and open them again later.",
  dev: "Developer information about a folder: lines of code per language, project type, Git history, disk usage and TODO notes.",
};

export function registerHomeTiles() {
  registerHomeTile({ id: "browse", order: 10, icon: "📁", title: "Browse files", text: "Look through your folders, open, copy, move and delete files.", run: toFiles });
  registerHomeTile({ id: "split", order: 12, icon: "⫼", title: "Files beside a tool", text: "Keep your file list in view while you use Find, Convert, Code, the Calculator or the Timer.", run: () => emit("workspace-go", "split") });
  registerHomeTile({ id: "dual", order: 14, icon: "🗂", title: "Two folders", text: "Show two folders side by side and copy or move between them.", run: () => emit("workspace-go", "dual") });
  registerHomeTile({ id: "convert", order: 20, icon: "🔄", title: "Convert files", text: "Change the format of pictures, video, sound and documents, or make them smaller.", run: () => { toFiles(); return showToolsDialog(); } });
  registerHomeTile({ id: "lock", order: 25, icon: "🔒", title: "Lock files", text: "Protect files or folders with a password, or unlock them again. Select what to lock first.", run: () => { toFiles(); return lockSelection(); } });
  registerHomeTile({ id: "moreinfo", order: 27, icon: "🔍", title: "Details and hidden info", text: "See everything about a file or picture: camera, location, checksums and more. Select something first.", run: () => { toFiles(); const items = selectedEntries(); return showMoreInfo(items.length ? items.map((e) => e.path) : [state.location.path]); } });
  // The Serve tool's tile has its own name, "Live server", which is what people look for.
  registerHomeTile({ id: "tool-serve", order: 36, icon: "🌐", title: "Live server", text: "Show a folder of web pages in your browser that reloads when you save, or run PHP's built-in server. Opens the Serve tool.", run: () => openServeTool(state.location.kind === "folder" ? state.location.path : "") });
  registerHomeTileProvider(() => listPowerTabs().map((t, i) => ({
    id: `tool-${t.id}`, order: 30 + i, icon: t.icon, title: t.label, text: TOOL_TEXT[t.id] ?? t.tip, run: () => openPower(t.id),
  })));
  registerHomeTile({
    id: "terminal", order: 60, icon: "⌨️", title: "Terminal", text: "Type commands in a real terminal that starts in the folder you are looking at.", run: () => emit("toggle-terminal"),
    enabled: () => state.platform !== "win32", why: "The terminal needs macOS or Linux for now.",
  });
  registerHomeTile({ id: "openwith", order: 70, icon: "🧩", title: "Open with…", text: "Choose which program opens a kind of file, and add your own programs. Select a file first.", run: () => { toFiles(); return showOpenWith(); } });
  registerHomeTile({ id: "bin", order: 80, icon: "🗑️", title: "Recycle Bin", text: "See what you deleted, put things back, or empty the bin.", run: () => { toFiles(); return showTrash(); } });
  registerHomeTile({ id: "themes", order: 88, icon: "🎨", title: "Themes", text: "Change how the whole window looks: over a hundred dark, light, futuristic, Linux, Windows and macOS themes.", run: showThemePicker });
  registerHomeTile({ id: "settings", order: 90, icon: "⚙️", title: "Settings", text: "Colours, text size, hidden files and what to show when this app starts.", run: showSettings });
  registerHomeTile({ id: "donate", order: 98, icon: "💙", title: "Support the project", text: "Say thanks with an optional PayPal donation: scan the QR code or open the link.", run: showDonate });
  registerHomeTile({ id: "tutorials", order: 96, icon: "📚", title: "Markdown tutorials", text: "Learn Markdown, the plain-text format for README files and notes, with lessons and examples. Opens in your web browser.", run: () => openAboutLink("tutorials") });
  registerHomeTile({ id: "about", order: 97, icon: "🐙", title: "About and GitHub", text: "Find the project on GitHub, report a problem or suggest an idea.", run: showAbout });
  registerHomeTile({ id: "help", order: 95, icon: "❓", title: "Help and shortcuts", text: "A short guide, and every keyboard shortcut.", run: showHelp });
}
