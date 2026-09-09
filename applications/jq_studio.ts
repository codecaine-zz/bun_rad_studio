import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync } from "fs";

const DEFAULT_SAMPLE_JSON = JSON.stringify({
  status: "success",
  project: "Bun RAD Studio",
  version: "2.0.0",
  author: {
    name: "Alex",
    github: "https://github.com/codecaine-zz/bun_rad_studio",
    active: true
  },
  metrics: {
    stars: 4800,
    forks: 350,
    open_issues: 0,
    license: "MIT"
  },
  modules: [
    { name: "simplegui", lines: 3900, status: "stable", priority: 1 },
    { name: "simplecli", lines: 4500, status: "stable", priority: 2 },
    { name: "applications", lines: 2800, status: "stable", priority: 3 },
    { name: "designer", lines: 1200, status: "preview", priority: 4 }
  ],
  tags: ["bun", "typescript", "native-mac", "cocoa", "reactive", "responsive"]
}, null, 2);

function getJqBin(): string {
  const candidates = [
    "/opt/homebrew/bin/jq",
    "/usr/local/bin/jq",
    "/usr/bin/jq",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const [out, code] = Sys.exec("which jq");
  if (code === 0 && out.trim()) return out.trim();
  return "jq";
}

export function createJqStudio(): SimpleWindow {
  const jqBin = getJqBin();
  const win = newSimpleWindow("JQ Studio Pro -- JSON Query & Transformation Workbench", 1120, 880, {
    appId: "jq_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Header Bar
  win.beginRow();
  win.addHeading("JQ Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Filter Bar
  win.beginGroupBox("Query Configuration & Filter Presets");
  win.beginRow();
  win.addLabel("lbl_filter", "JQ Filter:");
  win.addInput("txt_filter", ".").width(420);
  win.addButton("btn_execute", "⚡ Run Query");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_presets", "Recipes:");
  win.addDropdown("dd_presets", [
    "1. Pretty-Print Identity (.)",
    "2. Extract Root Keys (keys)",
    "3. Map Module Names (.modules | map(.name))",
    "4. Filter Stable Modules (.modules[] | select(.status == \"stable\"))",
    "5. Extract Tags (.tags | join(\", \"))",
    "6. Calculate Total Lines ([.modules[].lines] | add)",
    "7. Summary Metrics (.metrics)",
  ], "1. Pretty-Print Identity (.)");
  win.addButton("btn_reset_sample", "Reset Sample");
  win.endRow();
  win.endGroupBox();

  // Split View: JSON Input and JQ Output
  win.beginGroupBox("Input Source JSON Document");
  win.addTextarea("txt_input_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  win.beginGroupBox("Transformed Query Output (JQ Result)");
  win.addTextarea("txt_output_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("jq_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Syntax: Valid JSON  |  Latency: 0ms");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_reset_sample", () => {
    win.setText("txt_input_json", DEFAULT_SAMPLE_JSON);
    win.setText("txt_filter", ".");
    win.appendConsole("jq_console", "[JQ Studio] Sample JSON reset to default\n", 1);
  });

  const executeJq = () => {
    const filter = win.getValue("txt_filter") || ".";
    const rawJson = win.getValue("txt_input_json") || "{}";

    try {
      JSON.parse(rawJson);
    } catch (e: any) {
      win.setText("txt_output_json", `[JSON Parse Error]: ${e.message}`);
      win.appendConsole("jq_console", `[JQ Studio] Invalid Input JSON: ${e.message}\n`, 3);
      win.setStatus("JSON Syntax Error");
      return;
    }

    const t0 = Date.now();
    // Use jq via Sys.exec
    const escaped = rawJson.replace(/'/g, "'\\''");
    const [out, code] = Sys.exec(`echo '${escaped}' | ${jqBin} '${filter}' 2>&1`);
    const elapsed = Date.now() - t0;

    if (code === 0) {
      win.setText("txt_output_json", out);
      win.appendConsole("jq_console", `[JQ Studio] Query '${filter}' evaluated successfully in ${elapsed}ms\n`, 2);
      win.setStatus(`Query OK (${elapsed}ms)`);
    } else {
      win.setText("txt_output_json", `[JQ Error]:\n${out}`);
      win.appendConsole("jq_console", `[JQ Studio] Filter failed: ${out}\n`, 3);
      win.setStatus(`Filter Error (${elapsed}ms)`);
    }
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("JQ Studio state saved successfully!");
  });
  win.onClick("btn_execute", executeJq);

  win.onChange("dd_presets", (_w, recipe: string) => {
    if (recipe.includes("Identity")) win.setText("txt_filter", ".");
    else if (recipe.includes("Root Keys")) win.setText("txt_filter", "keys");
    else if (recipe.includes("Module Names")) win.setText("txt_filter", ".modules | map(.name)");
    else if (recipe.includes("Filter Stable")) win.setText("txt_filter", ".modules[] | select(.status == \"stable\")");
    else if (recipe.includes("Extract Tags")) win.setText("txt_filter", ".tags | join(\", \")");
    else if (recipe.includes("Total Lines")) win.setText("txt_filter", "[.modules[].lines] | add");
    else if (recipe.includes("Summary Metrics")) win.setText("txt_filter", ".metrics");
    executeJq();
  });

  return win;
}

if (import.meta.main) {
  const win = createJqStudio();
  console.log("Launching JQ Studio Pro...");
  win.run();
}
