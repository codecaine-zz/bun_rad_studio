import { simplegui } from "../index.ts";

export function createClickDemo() {
  const win = simplegui.createWindow(
    "Hello", 400, 240);
  win.addLabel("Ready").id("status");
  win.addButton("Click me", (w) => {
    w.setText("status", "It works!");
  });
  return win;
}

if (import.meta.main) createClickDemo().run();
