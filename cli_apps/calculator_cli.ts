#!/usr/bin/env bun
import { SimpleCLI } from "../src/index.ts";
import { createCalculatorStudio, startCalculatorStudioServer } from "../applications/calculator_studio.ts";

const app = SimpleCLI.newApp("calculator-cli", "2.7.0")
  .setDescription("Orbit Universal Computing Suite & Scientific Calculator CLI");

app.addFlagBool("gui", "g", false, "Launch Orbit Universal Computing Suite desktop application");
app.addFlagBool("server", "s", false, "Launch background web server without opening window");
app.addFlagInt("port", "p", 0, "Specific HTTP port to bind to when running as server");
app.addFlagString("eval", "e", "", "Evaluate mathematical expression (e.g. 'sin(pi/4) + sqrt(16)')");

if (!app.parseCli()) process.exit(0);

// 1. Launch GUI
if (app.getFlagBool("gui")) {
  console.log("⚡ Launching Orbit Universal Computing Suite GUI...");
  const studio = createCalculatorStudio({ fullscreen: true });
  await studio.run();
  process.exit(0);
}

// 2. Launch Server
if (app.getFlagBool("server")) {
  const port = app.getFlagInt("port") || 0;
  const srv = startCalculatorStudioServer({ port, host: "127.0.0.1" });
  app.banner("Orbit Universal Computing Suite", `v2.7.0 - Web Server`);
  console.log(`⚡ Server active at: http://127.0.0.1:${srv.port}`);
  console.log(`Press Ctrl+C to stop.`);
  setInterval(() => {}, 60000);
} else if (app.getFlagString("eval")) {
  // 3. Fast Evaluation
  const expr = app.getFlagString("eval");
  try {
    const sanitized = expr
      .replace(/\s+/g, "")
      .replace(/pi/gi, "Math.PI")
      .replace(/\be\b/gi, "Math.E")
      .replace(/sin\(/gi, "Math.sin(")
      .replace(/cos\(/gi, "Math.cos(")
      .replace(/tan\(/gi, "Math.tan(")
      .replace(/sqrt\(/gi, "Math.sqrt(")
      .replace(/ln\(/gi, "Math.log(")
      .replace(/log\(/gi, "Math.log10(")
      .replace(/\^/g, "**");

    const fn = new Function(`"use strict"; return (${sanitized});`);
    const result = fn();
    app.banner("Orbit Math Evaluator", "v2.7.0");
    app.printKv({
      "Expression": expr,
      "Result": String(result),
      "Type": typeof result,
    });
  } catch (err: any) {
    console.error(`Evaluation Error: ${err?.message || err}`);
    process.exit(1);
  }
} else {
  // Default: Launch GUI or display banner & prompt
  const args = app.getPositionalArgs();
  if (args.length > 0) {
    const expr = args.join(" ");
    try {
      const sanitized = expr
        .replace(/\s+/g, "")
        .replace(/pi/gi, "Math.PI")
        .replace(/\be\b/gi, "Math.E")
        .replace(/sin\(/gi, "Math.sin(")
        .replace(/cos\(/gi, "Math.cos(")
        .replace(/tan\(/gi, "Math.tan(")
        .replace(/sqrt\(/gi, "Math.sqrt(")
        .replace(/ln\(/gi, "Math.log(")
        .replace(/log\(/gi, "Math.log10(")
        .replace(/\^/g, "**");

      const fn = new Function(`"use strict"; return (${sanitized});`);
      const result = fn();
      app.banner("Orbit Math Evaluator", "v2.7.0");
      app.printKv({
        "Expression": expr,
        "Result": String(result),
      });
    } catch (err: any) {
      console.error(`Evaluation Error: ${err?.message || err}`);
      process.exit(1);
    }
  } else {
    // Launch GUI when called with no arguments
    console.log("⚡ Launching Orbit Universal Computing Suite GUI...");
    const studio = createCalculatorStudio({ fullscreen: true });
    await studio.run();
    process.exit(0);
  }
}
