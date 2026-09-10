import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { existsSync } from "fs";

const DEFAULT_SAMPLE_JSON = JSON.stringify(
  {
    status: "success",
    project: "Bun RAD Studio",
    version: "2.0.0",
    author: {
      name: "Alex",
      github: "https://github.com/codecaine-zz/bun_rad_studio",
      active: true,
    },
    metrics: {
      stars: 4800,
      forks: 350,
      open_issues: 0,
      license: "MIT",
    },
    modules: [
      { name: "simplegui", lines: 3900, status: "stable", priority: 1 },
      { name: "simplecli", lines: 4500, status: "stable", priority: 2 },
      { name: "applications", lines: 2800, status: "stable", priority: 3 },
      { name: "designer", lines: 1200, status: "preview", priority: 4 },
    ],
    tags: ["bun", "typescript", "native-mac", "cocoa", "reactive", "responsive"],
  },
  null,
  2
);

/**
 * Pure Bun / TypeScript JSON Query Engine
 * Zero Homebrew CLI dependency: evaluates standard jq query syntax and expressions natively
 */
export function evaluateBunJsonQuery(jsonVal: any, query: string): any {
  const q = query.trim();
  if (!q || q === ".") return jsonVal;

  // JavaScript function / expression mode: "$..." or contains "=>"
  if (q.startsWith("$") || q.includes("=>")) {
    const fn = new Function("$", `return (${q});`);
    return fn(jsonVal);
  }

  // Handle pipeline splits (e.g. .modules | map(.name))
  if (q.includes(" | ")) {
    const stages = q.split(" | ");
    let current = jsonVal;
    for (const stage of stages) {
      current = evaluateBunJsonQuery(current, stage.trim());
    }
    return current;
  }

  // Built-in jq primitives
  if (q === "keys") {
    if (Array.isArray(jsonVal)) return jsonVal.map((_, i) => i);
    if (typeof jsonVal === "object" && jsonVal !== null) return Object.keys(jsonVal);
    return [];
  }

  if (q === "length" || q === ".length") {
    if (Array.isArray(jsonVal)) return jsonVal.length;
    if (typeof jsonVal === "object" && jsonVal !== null) return Object.keys(jsonVal).length;
    return String(jsonVal).length;
  }

  if (q === "add") {
    if (Array.isArray(jsonVal)) {
      return jsonVal.reduce((acc, v) => acc + v, 0);
    }
    return jsonVal;
  }

  // map(...)
  const mapMatch = q.match(/^map\((.+)\)$/);
  if (mapMatch && mapMatch[1] && Array.isArray(jsonVal)) {
    const inner = mapMatch[1].trim();
    return jsonVal.map((item) => evaluateBunJsonQuery(item, inner));
  }

  // join(...)
  const joinMatch = q.match(/^join\((["'])(.*?)\1\)$/);
  if (joinMatch && joinMatch[2] !== undefined && Array.isArray(jsonVal)) {
    return jsonVal.join(joinMatch[2]);
  }

  // select(...)
  const selectMatch = q.match(/^select\((.+)\)$/);
  if (selectMatch && selectMatch[1]) {
    const condStr = selectMatch[1].trim();
    // support simple equality e.g. .status == "stable"
    const eqMatch = condStr.match(/^\.([a-zA-Z0-9_]+)\s*==\s*["']([^"']+)["']$/);
    if (eqMatch && eqMatch[1] && eqMatch[2] !== undefined) {
      const prop = eqMatch[1];
      const targetVal = eqMatch[2];
      if (Array.isArray(jsonVal)) {
        return jsonVal.filter((x) => x && x[prop] === targetVal);
      }
      return jsonVal && jsonVal[prop] === targetVal ? jsonVal : null;
    }
  }

  // Array wrap reduction: e.g. [.modules[].lines]
  if (q.startsWith("[") && q.endsWith("]")) {
    const inner = q.slice(1, -1).trim();
    const evaluated = evaluateBunJsonQuery(jsonVal, inner);
    return Array.isArray(evaluated) ? evaluated : [evaluated];
  }

  // Array splat: .modules[]
  if (q.endsWith("[]")) {
    const base = q.slice(0, -2).trim();
    const arr = base ? evaluateBunJsonQuery(jsonVal, base) : jsonVal;
    return Array.isArray(arr) ? arr : [];
  }

  // Array select splat: .modules[] | select(...)
  // Handled already by pipeline split

  // Standard property path traversal: .author.name or .modules[0].name
  const pathParts = q.replace(/^\./, "").split(/(?:\.|\b)/).filter((p) => p && p !== ".");
  let cur = jsonVal;
  
  // Normalized tokenizer for foo[0].bar
  const tokens = q.match(/(\.[a-zA-Z0-9_]+|\[\d+\]|\[\?.*?\])/g);
  if (tokens) {
    for (const t of tokens) {
      if (cur === null || cur === undefined) return null;
      if (t.startsWith(".")) {
        const prop = t.slice(1);
        cur = cur[prop];
      } else if (t.startsWith("[") && t.endsWith("]")) {
        const idx = parseInt(t.slice(1, -1), 10);
        cur = Array.isArray(cur) ? cur[idx] : undefined;
      }
    }
    return cur;
  }

  // Fallback simple property lookup
  if (q.startsWith(".")) {
    const prop = q.slice(1);
    return cur ? cur[prop] : undefined;
  }

  return cur;
}

function findExternalJq(): string | null {
  const candidates = ["/opt/homebrew/bin/jq", "/usr/local/bin/jq", "/usr/bin/jq"];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const [out, code] = Sys.exec("which jq");
  if (code === 0 && out.trim()) return out.trim();
  return null;
}

export function createJqStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const externalJq = findExternalJq();
  const win = newSimpleWindow("JSON Query Studio Pro (JQ Studio Pro) -- Native JSON Query & Transformation Workbench", 1120, 880, {
    appId: "jq_studio",
    theme: options.theme || getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Header Bar
  win.beginRow();
  win.addHeading("JSON Query Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Zero Homebrew Reliance -- Powered by Bun's Native High-Speed JSON & JS Query Engine");

  // Query Configuration
  win.beginGroupBox("Query Configuration & Filter Presets");
  win.beginRow();
  win.addLabel("lbl_filter", "JSON Query:");
  win.addInput("txt_filter", ".").width(360);
  win.addLabel("lbl_engine", "Engine:");
  win.addDropdown(
    "dd_engine",
    [
      "Bun Native Engine (Zero Homebrew)",
      externalJq ? `External jq CLI (${externalJq})` : "External jq CLI (Not Installed)",
    ],
    "Bun Native Engine (Zero Homebrew)"
  ).width(250);
  win.addButton("btn_execute", "⚡ Run Query");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_presets", "Recipes:");
  win.addDropdown(
    "dd_presets",
    [
      "1. Pretty-Print Identity (.)",
      "2. Extract Root Keys (keys)",
      "3. Map Module Names (.modules | map(.name))",
      "4. Filter Stable Modules (.modules[] | select(.status == \"stable\"))",
      "5. Extract Tags (.tags | join(\", \"))",
      "6. Calculate Total Lines ([.modules[].lines] | add)",
      "7. Summary Metrics (.metrics)",
      "8. JS Expression ($.modules.map(m => m.name.toUpperCase()))",
    ],
    "1. Pretty-Print Identity (.)"
  );
  win.addButton("btn_reset_sample", "Reset Sample");
  win.endRow();
  win.endGroupBox();

  // Split View: JSON Input and Output
  win.beginGroupBox("Input Source JSON Document");
  win.addTextarea("txt_input_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  win.beginGroupBox("Transformed Query Output");
  win.addTextarea("txt_output_json", DEFAULT_SAMPLE_JSON);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("jq_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Engine: Bun Native  |  Status: Ready  |  Syntax: Valid JSON  |  Latency: 0ms");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("JQ Studio state saved successfully!");
  });

  win.onClick("btn_reset_sample", () => {
    win.setText("txt_input_json", DEFAULT_SAMPLE_JSON);
    win.setText("txt_filter", ".");
    win.setText("txt_output_json", DEFAULT_SAMPLE_JSON);
    win.appendConsole("jq_console", "[JQ Studio] Sample JSON reset to default\n", 1);
  });

  const executeQuery = () => {
    const filter = win.getValue("txt_filter") || ".";
    const rawJson = win.getValue("txt_input_json") || "{}";
    const selectedEngine = win.getValue("dd_engine") || "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e: any) {
      win.setText("txt_output_json", `[JSON Parse Error]: ${e.message}`);
      win.appendConsole("jq_console", `[JQ Studio] Invalid Input JSON: ${e.message}\n`, 3);
      win.setStatus("JSON Syntax Error");
      return;
    }

    const t0 = performance.now();

    // Option A: External jq CLI if explicitly chosen and installed
    if (selectedEngine.startsWith("External jq") && externalJq) {
      const escaped = rawJson.replace(/'/g, "'\\''");
      const [out, code] = Sys.exec(`echo '${escaped}' | "${externalJq}" '${filter}' 2>&1`);
      const elapsed = (performance.now() - t0).toFixed(2);

      if (code === 0) {
        win.setText("txt_output_json", out);
        win.appendConsole("jq_console", `[External jq] Query '${filter}' evaluated in ${elapsed}ms\n`, 2);
        win.setText("lbl_status", `Engine: External jq  |  Query OK (${elapsed}ms)`);
        win.setStatus(`Query OK (${elapsed}ms)`);
      } else {
        win.setText("txt_output_json", `[JQ CLI Error]:\n${out}`);
        win.appendConsole("jq_console", `[External jq] Filter error: ${out}\n`, 3);
        win.setStatus(`Filter Error (${elapsed}ms)`);
      }
      return;
    }

    // Option B: Native Bun Query Engine (Default, zero Homebrew dependency)
    try {
      const result = evaluateBunJsonQuery(parsed, filter);
      const elapsed = (performance.now() - t0).toFixed(2);
      const formatted = typeof result === "string" ? result : JSON.stringify(result, null, 2);

      win.setText("txt_output_json", formatted ?? "null");
      win.appendConsole(
        "jq_console",
        `[Bun Native Engine] Evaluated '${filter}' in ${elapsed}ms (Zero Homebrew)\n`,
        2
      );
      win.setText(
        "lbl_status",
        `Engine: Bun Native  |  Status: OK  |  Query: '${filter}'  |  Latency: ${elapsed}ms`
      );
      win.setStatus(`Evaluated in ${elapsed}ms`);
    } catch (err: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_output_json", `[Bun Query Error]:\n${err.message}`);
      win.appendConsole("jq_console", `[Bun Native Engine] Query error: ${err.message}\n`, 3);
      win.setStatus(`Query Error (${elapsed}ms)`);
    }
  };

  win.onClick("btn_execute", executeQuery);

  win.onChange("dd_presets", (_w, recipe: string) => {
    if (recipe.includes("Identity")) win.setText("txt_filter", ".");
    else if (recipe.includes("Root Keys")) win.setText("txt_filter", "keys");
    else if (recipe.includes("Module Names")) win.setText("txt_filter", ".modules | map(.name)");
    else if (recipe.includes("Filter Stable")) win.setText("txt_filter", ".modules[] | select(.status == \"stable\")");
    else if (recipe.includes("Extract Tags")) win.setText("txt_filter", ".tags | join(\", \")");
    else if (recipe.includes("Total Lines")) win.setText("txt_filter", "[.modules[].lines] | add");
    else if (recipe.includes("Summary Metrics")) win.setText("txt_filter", ".metrics");
    else if (recipe.includes("JS Expression")) win.setText("txt_filter", "$.modules.map(m => m.name.toUpperCase())");
    executeQuery();
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

export const createJsonStudio = createJqStudio;

if (import.meta.main) {
  const win = createJsonStudio({ fullscreen: true });
  console.log("Launching JSON Query Studio Pro (Bun Native)...");
  win.run();
}
