// RAD tutorial 6: pick any of the built-in themes at run time. Run it with:  bun run examples/rad_tutorial/06_themes.ts
import { getThemeNames, newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createThemes(): SimpleWindow {
  const win = newSimpleWindow("Themes", 880, 560, { theme: "apple_dark" });
  const names = getThemeNames();

  win.addHeading("Themes", `${names.length} built in. Pick one.`);
  win.addDropdown(names, "apple_dark", (w, name) => w.setTheme(String(name))).id("cmbTheme").width(320);

  win.beginCard("Preview", "Every control follows the theme");
  win.addTextInput("A text box").id("txtDemo");
  win.addSlider(0, 100, 60);
  win.addProgressBar(65);
  win.addBadge("Success", "success");
  win.addButton("A button").bg("#0284c7").color("#ffffff").width(160);
  win.endCard();

  return win;
}

if (import.meta.main) createThemes().run();
