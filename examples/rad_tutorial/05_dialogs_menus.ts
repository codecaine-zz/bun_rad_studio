// RAD tutorial 5: menus, toolbars, dialogs, timers and busy states.
// Run it with:  bun run examples/rad_tutorial/05_dialogs_menus.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createDialogsMenus(): SimpleWindow {
  const win = newSimpleWindow("Dialogs and menus", 900, 620, { theme: "tokyo_night" });

  win.addMenuBar("mainMenu", [
    { label: "File", items: ["📄 New", "💾 Save", "---", "🚪 Exit"] },
    { label: "Help", items: ["📖 Documentation", "ℹ️ About"] },
  ]);
  win.onClick("mainMenu", (w, item) => w.toast(`Menu: ${item}`));

  win.addToolBar("mainBar", ["📄 New", "📂 Open", "💾 Save"]);
  win.onClick("mainBar", (w, action) => w.setStatusBarText(`Toolbar: ${action}`));

  win.addLabel("⏰ --:--:--").id("lblClock").font(26, "#38bdf8", "700");
  win.addTimer(1000, (w) => {
    w.setText("lblClock", `⏰ ${new Date().toLocaleTimeString()}`);
  }, { id: "clock" });

  win.beginRow();
  win.addButton("ℹ️ Info", (w) => w.info("Saved!", "Your profile was saved."));
  win.addButton("⚠️ Warning", (w) => w.warn("Low storage", "Under 5% of the disk is free."));
  win.addButton("🗑 Ask first", async (w) => {
    if (await w.ask("Delete this file?", "Confirm delete")) w.toast("Deleted");
  });
  win.endRow();

  win.addButton("☁️ Sync (busy state)", async (w) => {
    await w.withBusyState(["btnSyncLabel"], "⏳ Syncing...", async (ctx) => {
      await ctx.sleep(2000);
      ctx.info("Done", "Everything is in sync.");
    });
  }).id("btnSyncLabel");

  win.addStatusBar("Status: Ready");
  return win;
}

if (import.meta.main) createDialogsMenus().run();
