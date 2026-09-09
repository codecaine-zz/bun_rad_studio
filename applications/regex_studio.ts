import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";

export function createRegexStudio(): SimpleWindow {
  const win = newSimpleWindow("RegEx Studio Pro -- Real-Time Regular Expression Workbench", 1140, 880, {
    appId: "regex_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  const SAMPLE_TEXT = `Contact us at support@bunradstudio.io or dev-team@corp.net.
Server IP: 192.168.1.42 connected on port 8080.
Release version v2.4.1 tagged at 2026-09-09.
UUID: 4a3f9e8b-7c2d-4e1a-8f3b-9a0b1c2d3e4f
Visit https://bun.sh and https://github.com/codecaine-zz/bun_rad_studio.`;

  // Title Row
  win.beginRow();
  win.addHeading("RegEx Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Workspace");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Interactive Regular Expression Pattern & Substitution Engine");

  // Pattern Configuration
  win.beginGroupBox("Pattern & Flags Configuration");
  win.beginRow();
  win.addLabel("lbl_pattern", "Regex Pattern:");
  win.addInput("txt_pattern", "([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)").width(480);
  win.addButton("btn_test", "⚡ Test Pattern");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_lib", "Preset Library:");
  win.addDropdown("dd_lib", [
    "1. Email Addresses",
    "2. IPv4 Addresses",
    "3. Semantic Versions (SemVer)",
    "4. UUID v4 Tokens",
    "5. HTTP/HTTPS URLs",
    "6. ISO-8601 Dates",
  ], "1. Email Addresses");
  win.addLabel("lbl_replace", "Substitution:");
  win.addInput("txt_subst", "[$1 at $2]").width(220);
  win.addButton("btn_replace", "Preview Replace");
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_g", "Global (g)", true);
  win.addCheckbox("chk_i", "Case Insensitive (i)", false);
  win.addCheckbox("chk_m", "Multiline (m)", true);
  win.addCheckbox("chk_s", "DotAll (s)", false);
  win.endRow();
  win.endGroupBox();

  // Test String Input
  win.beginGroupBox("Test Target Corpus / Document");
  win.addTextarea("txt_corpus", SAMPLE_TEXT);
  win.endGroupBox();

  // Matches Table & Replacement Preview
  win.beginGroupBox("Extracted Matches & Capture Groups");
  win.addTable("tbl_matches", ["Match #", "Matched Text", "Index", "Length", "Groups"], [
    ["1", "support@bunradstudio.io", "14", "22", "Group 1: support, Group 2: bunradstudio.io"],
    ["2", "dev-team@corp.net", "40", "17", "Group 1: dev-team, Group 2: corp.net"],
  ]).height(125);
  win.endGroupBox();

  // Activity & Match Telemetry
  win.beginGroupBox("Regex Diagnostics & Substitution Output");
  win.addConsole("regex_console", 65);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Matches Found: 2  |  Pattern: Valid ECMA RegExp  |  Engine: V8/JSC");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("RegEx Studio workspace saved successfully!");
  });

  const evaluateRegex = () => {
    const rawPattern = win.getValue("txt_pattern") || "";
    const corpus = win.getValue("txt_corpus") || "";
    const isGlobal = win.getValue("chk_g") === "true" || win.getValue("chk_g") === true;
    const isInsensitive = win.getValue("chk_i") === "true" || win.getValue("chk_i") === true;
    const isMultiline = win.getValue("chk_m") === "true" || win.getValue("chk_m") === true;
    const isDotAll = win.getValue("chk_s") === "true" || win.getValue("chk_s") === true;

    let flags = "";
    if (isGlobal) flags += "g";
    if (isInsensitive) flags += "i";
    if (isMultiline) flags += "m";
    if (isDotAll) flags += "s";

    try {
      const regex = new RegExp(rawPattern, flags);
      const matches: RegExpExecArray[] = [];

      if (isGlobal) {
        let match: RegExpExecArray | null;
        let limit = 200;
        while ((match = regex.exec(corpus)) !== null && limit-- > 0) {
          matches.push(match);
          if (match.index === regex.lastIndex) regex.lastIndex++;
        }
      } else {
        const single = regex.exec(corpus);
        if (single) matches.push(single);
      }

      const rows = matches.map((m, idx) => {
        const groups = m.slice(1).map((g, gi) => `G${gi + 1}: ${g}`).join(", ");
        return [
          String(idx + 1),
          m[0],
          String(m.index),
          String(m[0].length),
          groups || "(none)",
        ];
      });

      win.setTableData("tbl_matches", ["Match #", "Matched Text", "Index", "Length", "Groups"], rows.length > 0 ? rows : [["0", "(No matches)", "0", "0", "-"]]);
      win.appendConsole("regex_console", `[RegEx Studio] Evaluated /${rawPattern}/${flags} -> ${matches.length} matches found\n`, 2);
      win.setStatus(`Matches Found: ${matches.length}`);
    } catch (e: any) {
      win.appendConsole("regex_console", `[RegEx Studio Error] ${e.message}\n`, 3);
      win.setStatus(`Syntax Error: ${e.message}`);
    }
  };

  win.onClick("btn_test", evaluateRegex);

  win.onClick("btn_replace", () => {
    const rawPattern = win.getValue("txt_pattern") || "";
    const corpus = win.getValue("txt_corpus") || "";
    const subst = win.getValue("txt_subst") || "";
    try {
      const regex = new RegExp(rawPattern, "g");
      const replaced = corpus.replace(regex, subst);
      win.appendConsole("regex_console", `[Substitution Preview]:\n${replaced.slice(0, 300)}...\n`, 1);
    } catch (e: any) {
      win.appendConsole("regex_console", `[RegEx Replace Error] ${e.message}\n`, 3);
    }
  });

  win.onChange("dd_lib", (_w, selected: string) => {
    if (selected.includes("Email")) {
      win.setText("txt_pattern", "([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)");
    } else if (selected.includes("IPv4")) {
      win.setText("txt_pattern", "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");
    } else if (selected.includes("SemVer")) {
      win.setText("txt_pattern", "v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-[a-zA-Z0-9.]+)?");
    } else if (selected.includes("UUID")) {
      win.setText("txt_pattern", "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    } else if (selected.includes("URLs")) {
      win.setText("txt_pattern", "https?:\\/\\/[\\w\\.-]+(?:\\.[a-zA-Z]{2,})(?:\\/[^\\s]*)?");
    } else if (selected.includes("Dates")) {
      win.setText("txt_pattern", "\\d{4}-\\d{2}-\\d{2}");
    }
    evaluateRegex();
  });

  return win;
}

if (import.meta.main) {
  const win = createRegexStudio();
  console.log("Launching RegEx Studio Pro...");
  win.run();
}
