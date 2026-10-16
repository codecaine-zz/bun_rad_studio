// RAD tutorial 4: state that controls follow. Run it with:  bun run examples/rad_tutorial/04_state.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createState(): SimpleWindow {
  const win = newSimpleWindow("State and binding", 820, 600, { theme: "apple_dark" });

  win.addHeading("Reactive state", "Change a value anywhere and every control follows");

  win.addTextInput("Your name", "Ada Lovelace").id("txtUser").bindState("username");
  win.addSlider(0, 100, 40).id("sldVolume").bindState("volume");
  win.addLabel("Hello, Ada Lovelace. Volume 40.").id("lblSummary").font(18, "#e2e8f0", "600");

  const refresh = (w: SimpleWindow) =>
    w.setText("lblSummary", `Hello, ${w.getState("username")}. Volume ${w.getState("volume")}.`);
  win.onStateChange("username", refresh);
  win.onStateChange("volume", refresh);

  win.addButton("Set the state from code", (w) => {
    w.setState("username", "Alan Turing");
    w.setState("volume", "85");
  }).bg("#0284c7").color("#ffffff").width(220);

  win.addButton("Switch to the Nord theme", (w) => w.setTheme("nord")).width(220);
  win.addButton("Switch to Apple Light", (w) => w.setTheme("apple_light")).width(220);

  return win;
}

if (import.meta.main) createState().run();
