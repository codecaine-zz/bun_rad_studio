// Your first SimpleGUI app. Run it with:  bun run examples/hello_simplegui.ts
import { newSimpleWindow, type SimpleWindow } from "../src/simplegui";

export function createHello(): SimpleWindow {
  const win = newSimpleWindow("My First App", 760, 420, { theme: "apple_dark" });

  win.addLabel("⚡ Welcome to SimpleGUI!").font(24, "#38bdf8", "700");
  win.addInput("txtName", "", "Type your name…").width(320);

  win.addButton("🚀 Say hello", (w) => {
    const name = String(w.getValue("txtName") || "").trim() || "friend";
    w.setText("lblGreeting", `Hello, ${name}!`);
    w.toast(`Nice to meet you, ${name}`);
  }).bg("#0284c7").color("#ffffff").bold().width(160).height(40);

  win.addLabel("lblGreeting", "Your greeting will appear here.").font(18, "#e2e8f0", "600");
  return win;
}

if (import.meta.main) createHello().run();
