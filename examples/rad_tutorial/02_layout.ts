// RAD tutorial 2: the layout tools.
// Run it with:  bun run examples/rad_tutorial/02_layout.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createLayout(): SimpleWindow {
  const win = newSimpleWindow("Layout", 900, 640, { theme: "nord" });

  win.addHeading("🚀 Mission Control", "Rows, grids and cards");

  win.beginRow();
  win.addLabel("Search:").width(70);
  win.addSearchInput("Type keywords...").id("txtSearch").width(280);
  win.addButton("🔍 Go", (w) => w.setStatusBarText(`Searching for "${w.getText("txtSearch")}"`));
  win.endRow();

  win.beginGrid(3, 16);
  win.addTextInput("First name").id("txtFirst");
  win.addTextInput("Middle name").id("txtMid");
  win.addTextInput("Last name").id("txtLast");
  win.addSwitch("Active account", true).id("swtActive");
  win.endGrid();

  win.beginCard("👤 Profile", "Public settings");
  win.addTextInput("Display name").id("txtName");
  win.addTextInput("Email address").id("txtEmail");
  win.endCard();

  win.addStatusBar("Status: Ready");
  return win;
}

if (import.meta.main) createLayout().run();
