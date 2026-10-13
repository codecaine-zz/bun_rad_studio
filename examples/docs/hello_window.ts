/**
 * Handbook example: the smallest SimpleGUI program (see docs/getting-started/install-and-first-launch.md).
 * Run from the repository root:  bun run examples/docs/hello_window.ts
 */
import { simplegui } from "../../index.ts";

const win = simplegui.createWindow("Hello from Bun RAD Studio", 520, 300, { theme: "apple_dark" });

win.addLabel("What is your name?").font(18, "#38bdf8", "700");
win.addTextInput("Type a name here").id("txtName").width(300);

win.addButton("Say hello", (w) => {
  const name = w.getText("txtName") || "friend";
  w.info("Greeting", `Hello, ${name}!`);
})
  .bg("#0284c7")
  .color("#ffffff")
  .width(160);

win.run();
