// Start-up: load the places and settings, apply them, draw everything and open the first folder.
import { ApiError } from "./api.js";
import { $, h } from "./dom.js";
import { showWelcome } from "./extras.js";
import { wireFavorites } from "./favorites.js";
import { wireInfo } from "./info.js";
import { wireKeys } from "./keys.js";
import { wireTextInputs } from "./textInputs.js";
import { isRenaming, renderList, wireList } from "./list.js";
import { menuIsOpen } from "./menus.js";
import { goTo, loadPlaces, refresh } from "./nav.js";
import { renderSidebar, wireSidebar } from "./sidebar.js";
import { on, state } from "./state.js";
import { openPower, setPowerExpanded, wirePower } from "./power.js";
import { wireChrome } from "./chrome.js";
import { applyPalette, effectiveAutoPalette } from "./themes.js";
import { wireTypeCheck } from "./typecheck.js";
import { wireWindowState } from "./windowState.js";
import { startCopySections } from "./copysection.js";
import { wireDual } from "./dual.js";
import { wireHome } from "./home.js";
import { registerHomeTiles } from "./homeTiles.js";
import { restoreWorkspace, wireWorkspace } from "./workspace.js";
import "./find.js";
import "./watch.js";
import "./serve.js";
import "./crypto.js";
import "./ip.js";
import "./net.js";
import "./subs.js";
import "./sd.js";
import "./vault.js";
import "./secrets.js";
import "./calc.js";
import "./qr.js";
import "./imageStudio.js";
import "./paint.js";
import "./mediaStudio.js";
import "./playerDeck.js";
import "./compare.js";
import "./projects.js";
import "./actions.js";
import "./timer.js";
import "./code.js";
import "./dev.js";
import "./graveyard.js";
import "./databases.js";
import "./hostedStudios.js";
import "./downloads.js";
import "./cliUtils.js";
import "./tasks.js";
import "./sysinfo.js";
import "./games.js";
import "./themeEditor.js";
import { applyAtmosphere } from "./atmosphereFx.js";
import { wireCommandPalette } from "./commandPalette.js";
import { startQuietDetect } from "./dbDetect.js";
import { wireQuickbar } from "./quickbar.js";
import { wireTabs } from "./tabs.js";
import { wireTerminal } from "./terminal.js";
import { wireTools } from "./tools.js";
import { renderAddress, renderBanner, updateSearchBox, updateToolbar, wireToolbar } from "./toolbar.js";

/** The settings that change how the list looks or is ordered. */
const LIST_SETTINGS = ["view", "sortBy", "sortDir", "foldersFirst", "columns", "groupBy", "rowDensity", "tags"];

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  const desiredPalette = s.palette || effectiveAutoPalette();
  // While the theme editor shows a theme that isn't saved yet, the page keeps it.
  if (root.dataset.palette === "preview") {
    // nothing to change
  } else if (desiredPalette) {
    if (root.dataset.palette !== desiredPalette) applyPalette(desiredPalette);
  } else if (root.dataset.palette) applyPalette("");
  else if (s.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty("--fm-scale", String(s.textSize / 100));
  root.dataset.density = s.rowDensity || "comfortable";
  const appEl = document.getElementById("app");
  if (appEl) appEl.dataset.density = s.rowDensity || "comfortable";
  $("#info").hidden = !s.showInfoPanel;
  applyAtmosphere();
}

function showFatal(message) {
  document.body.classList.add("ready");
  $("#list").replaceChildren(h("div", { class: "fatal", role: "alert" }, h("h2", {}, "The File Manager can't start"), h("p", {}, message)));
}

async function start() {
  wireTextInputs();
  try {
    await loadPlaces();
  } catch (err) {
    return showFatal(err instanceof ApiError ? err.message : "Something went wrong while starting.");
  }
  applySettings();
  wireToolbar();
  wireTabs();
  wireQuickbar();
  wireCommandPalette();
  wireList();
  wireSidebar();
  wireFavorites();
  wireInfo();
  // The view switcher and the Dual view listen for keys before the file list does, so Alt+digits, Esc (Focus), Tab, F5 and F6 reach them first.
  wireWorkspace();
  wireDual();
  wireHome();
  registerHomeTiles();
  wireKeys();
  wireTerminal();
  wireTools();
  wirePower();
  wireChrome();
  wireTypeCheck();
  wireWindowState();
  startCopySections();
  renderSidebar();

  // Settings changes: apply them, and redo only what they affect. Saving the last folder or a favorite must not
  // redraw the list (that would throw away a name someone is in the middle of typing).
  on("settings", (change) => {
    applySettings();
    updateToolbar();
    const keys = Object.keys(change ?? {});
    if (keys.includes("showHidden")) refresh();
    else if (keys.some((k) => LIST_SETTINGS.includes(k))) renderList();
  });

  const requested = document.querySelector('meta[name="fm-start"]')?.getAttribute("content") ?? "";
  const first = (requested && decodeURIComponent(requested)) || state.settings.lastPath || state.home;
  if (!(await goTo(first, { push: false }))) await goTo(state.home, { push: false });
  renderAddress();
  renderBanner();
  updateSearchBox();
  restoreWorkspace();
  const urlParams = new URLSearchParams(window.location.search);
  const startTool = urlParams.get("tool");
  const startGame = urlParams.get("game");
  if (startTool) {
    openPower(startTool, startGame ? { game: startGame } : undefined);
    if (urlParams.get("max") === "1") setPowerExpanded(true);
  }
  document.body.classList.add("ready");
  // Once, quietly: say so only if database connections turned up in the environment.
  startQuietDetect();
  // The window has no browser menu, so keep the system's own page menu (Reload, Inspect ...) out of the way.
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
  });
  $("#list").focus();
  if (!state.settings.seenWelcome) showWelcome();

  // Pick up changes made by other programs when you come back to this window.
  let last = Date.now();
  window.addEventListener("focus", () => {
    // Never rebuild the list under someone who is typing a new name, choosing from a menu or answering a dialog.
    if (Date.now() - last < 2000 || state.busy || isRenaming() || menuIsOpen() || document.querySelector(".modal-backdrop")) return;
    last = Date.now();
    refresh();
  });
}

start();
