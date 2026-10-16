// RAD tutorial 1: a window, a card, two fields and a button. Run it with:  bun run examples/rad_tutorial/01_quickstart.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createQuickstart(): SimpleWindow {
  const win = newSimpleWindow("My First Desktop App", 760, 520, { theme: "apple_dark" });

  win.addLabel("⚡ Welcome to SimpleGUI!").font(22, "#38bdf8", "700");

  win.beginCard("User Authentication");
  win.beginRow();
  win.addLabel("Username:").width(90);
  win.addTextInput("Type your username...").id("txtUser").width(240);
  win.endRow();
  win.beginRow();
  win.addLabel("Password:").width(90);
  win.addPasswordInput("••••••••").id("txtPass").width(240);
  win.endRow();
  win.endCard();

  win.addButton("🚀 Login", (w) => {
    const username = w.getText("txtUser") || "Friend";
    w.info("Welcome!", `Hello ${username}, you are logged in!`);
  }).bg("#0284c7").color("#ffffff").bold().width(140).height(38);

  return win;
}

if (import.meta.main) createQuickstart().run();
