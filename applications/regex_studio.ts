import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync, readFileSync, statSync } from "fs";
import { basename, extname } from "path";
import {
  MAX_MATCHES, MAX_CORPUS_BYTES, type MatchInfo, buildFlags, runRegexSync, validatePattern, looksCatastrophic, runRegexSafe, replaceSafe,
  markMatches, groupsLabel, matchesToList, matchesToCsv, matchesToJson, explainPattern, CHEATSHEET, CODE_LANGUAGES,
  generateCode, PRESETS, serializeWorkspace, parseWorkspace,
} from "../src/regex_tools";

export function createRegexStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Regex Studio Pro -- Enterprise Regular Expression Workbench", 1160, 920, {
    appId: "regex_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  const SAMPLE_TEXT = `Contact us at support@bunradstudio.io or dev-team@corp.net.
Server IP: 192.168.1.42 connected on port 8080.
Release version v2.4.1 tagged at 2026-09-09.
UUID: 4a3f9e8b-7c2d-4e1a-8f3b-9a0b1c2d3e4f
Visit https://bun.sh and https://github.com/codecaine-zz/bun_rad_studio.`;

  const DEFAULT_PATTERN = "([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)";
  const initialMatches = runRegexSync(DEFAULT_PATTERN, "gm", SAMPLE_TEXT).matches;
  const initialMarked = markMatches(SAMPLE_TEXT, initialMatches);
  const initialRows = initialMatches.map((m) => [String(m.num), m.text, String(m.index), String(m.length), groupsLabel(m) || "(none)", `${m.line}:${m.col}`]);

  // Title Row
  win.beginRow();
  win.addHeading("Regex Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Workspace");
  win.addButton("btn_save_ws_file", "📄 Save Workspace File…");
  win.addButton("btn_load_ws_file", "📂 Open Workspace File…");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Enterprise Regular Expression Pattern Engine, Substitution Preview & Code Generator");

  // Pattern Configuration
  win.beginGroupBox("Pattern & Flags Configuration");
  win.beginRow();
  win.addLabel("lbl_pattern", "Regex Pattern:");
  win.addInput("txt_pattern", "([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)").width(480);
  win.addButton("btn_test", "⚡ Test Pattern");
  win.addButton("btn_explain", "🧠 Explain");
  win.addButton("btn_cheatsheet", "📖 Cheat Sheet");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_lib", "Preset Library:");
  win.addDropdown("dd_lib", PRESETS.map((x) => x.name), "1. Email Addresses").width(260);
  win.addLabel("lbl_replace", "Substitution:");
  win.addInput("txt_subst", "[$1 at $2]").width(220);
  win.addButton("btn_replace", "Preview Replace");
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_g", "Global (g)", true);
  win.addCheckbox("chk_i", "Case Insensitive (i)", false);
  win.addCheckbox("chk_m", "Multiline (m)", true);
  win.addCheckbox("chk_s", "DotAll (s)", false);
  win.addCheckbox("chk_u", "Unicode (u)", false);
  win.addCheckbox("chk_live", "Live results while typing", true);
  win.endRow();
  win.endGroupBox();

  // Test String Input
  win.beginGroupBox("Test Target Corpus / Document");
  win.beginRow();
  win.addButton("btn_load_corpus", "📂 Load Text File…");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_corpus", SAMPLE_TEXT).width(1060).height(110);
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_marked", "Highlighted view (each match is wrapped in « »):");
  win.endRow();
  win.beginRow();
  win.addTextarea("txt_marked", initialMarked).width(1060).height(110);
  win.endRow();
  win.endGroupBox();

  // Matches Table & Replacement Preview
  win.beginGroupBox("Extracted Matches & Capture Groups");
  win.beginRow();
  win.addLabel("lbl_group_n", "Copy group # (0 = whole match):");
  win.addInput("txt_group_n", "0", "", { width: 60 });
  win.addButton("btn_copy_matches", "📋 Copy Matches");
  win.addButton("btn_export_matches", "💾 Export Matches…");
  win.addButton("btn_copy_replaced", "📋 Copy Replaced Text");
  win.addButton("btn_save_replaced", "💾 Save Replaced Text…");
  win.endRow();
  win.addTable("tbl_matches", ["Match #", "Matched Text", "Index", "Length", "Groups", "Line:Col"], initialRows).height(105);
  win.endGroupBox();

  // Code generation
  win.beginGroupBox("Code Generator");
  win.beginRow();
  win.addLabel("lbl_lang", "Language:");
  win.addDropdown("dd_lang", [...CODE_LANGUAGES], "TypeScript").width(180);
  win.addButton("btn_gen_code", "💻 Code Snippet");
  win.endRow();
  win.endGroupBox();

  // Activity & Match Telemetry
  win.beginGroupBox("Regex Diagnostics & Substitution Output");
  win.addConsole("regex_console", 85);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Matches Found: 2  |  Pattern: Valid ECMA RegExp  |  Engine: V8/JSC  |  Zero Homebrew");
  win.endRow();

  let lastMatches: MatchInfo[] = [];
  let lastReplaced = "";
  let evalSeq = 0;

  const currentFlags = (forceGlobal = false): string =>
    buildFlags({ g: forceGlobal || win.getBool("chk_g"), i: win.getBool("chk_i"), m: win.getBool("chk_m"), s: win.getBool("chk_s"), u: win.getBool("chk_u") });

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Regex Studio workspace saved successfully!");
  });

  const evaluateRegex = async (silent = false) => {
    const mySeq = ++evalSeq;
    const rawPattern = win.getValue("txt_pattern") || "";
    const corpus = win.getValue("txt_corpus") || "";
    const flags = currentFlags();
    const res = await runRegexSafe(rawPattern, flags, corpus, MAX_MATCHES, silent ? 2000 : 4000);
    if (mySeq !== evalSeq) return; // a newer evaluation superseded this one
    const elapsed = res.ms.toFixed(2);
    if (res.error) {
      if (!silent || res.timedOut) win.appendConsole("regex_console", `[RegEx Error] ${res.error} (${elapsed}ms)\n`, 3);
      win.setText("lbl_status", `Pattern error: ${res.error}`);
      win.setStatus(`Pattern error: ${res.error}`);
      return;
    }
    const matches = res.matches;
    lastMatches = matches;
    const rows = matches.map((m) => [String(m.num), m.text, String(m.index), String(m.length), groupsLabel(m) || "(none)", `${m.line}:${m.col}`]);
    win.setTableData(
      "tbl_matches",
      ["Match #", "Matched Text", "Index", "Length", "Groups", "Line:Col"],
      rows.length > 0 ? rows : [["0", "(No matches found)", "0", "0", "-", "-"]]
    );
    win.setText("txt_marked", matches.length ? markMatches(corpus, matches) : "");
    if (res.capped) win.appendConsole("regex_console", `[Warning] Result capped at ${MAX_MATCHES} matches.\n`, 3);
    if (!silent) {
      win.appendConsole("regex_console", `[RegEx Studio] Evaluated /${rawPattern}/${flags} in ${elapsed}ms -> ${matches.length} matches found\n`, 2);
      win.toast(`Found ${matches.length} match(es)`);
    }
    win.setText("lbl_status", `Matches: ${matches.length}${res.capped ? "+" : ""}  |  Latency: ${elapsed}ms  |  Status: OK`);
    win.setStatus(`Matches Found: ${matches.length} (${elapsed}ms)`);
  };

  win.onClick("btn_test", () => evaluateRegex(false));

  // Live feedback: instant validity, plus results as you type when enabled and safe.
  const onEdit = () => {
    const pat = win.getValue("txt_pattern") || "";
    const info = validatePattern(pat, currentFlags());
    if (!info.ok) {
      win.setText("lbl_status", `Pattern error: ${info.error}`);
      return;
    }
    const corpus = win.getValue("txt_corpus") || "";
    if (!win.getBool("chk_live")) {
      win.setText("lbl_status", `Pattern OK  |  ${info.groupCount} capture group(s)  |  Click Test Pattern`);
      return;
    }
    if (looksCatastrophic(pat) || corpus.length > 100_000) {
      win.setText("lbl_status", `Pattern OK  |  ${info.groupCount} capture group(s)  |  Live results paused (risky pattern or large text): click Test Pattern`);
      return;
    }
    void evaluateRegex(true);
  };
  for (const id of ["txt_pattern", "txt_corpus", "chk_g", "chk_i", "chk_m", "chk_s", "chk_u"]) win.onChange(id, onEdit);

  win.onClick("btn_replace", async () => {
    const rawPattern = win.getValue("txt_pattern") || "";
    const corpus = win.getValue("txt_corpus") || "";
    const subst = win.getValue("txt_subst") || "";
    const r = await replaceSafe(rawPattern, currentFlags(), corpus, subst);
    if (r.error) {
      win.appendConsole("regex_console", `[RegEx Replace Error] ${r.error}\n`, 3);
      return;
    }
    lastReplaced = r.text;
    win.appendConsole("regex_console", `[Substitution Preview]:\n${r.text}\n\n`, 1);
    win.toast(`Substitution preview generated (${r.count} replacement${r.count === 1 ? "" : "s"})`);
  });

  win.onClick("btn_copy_replaced", () => {
    if (!lastReplaced) { win.toast("Run Preview Replace first"); return; }
    win.copyToClipboard(lastReplaced);
    win.toast("Replaced text copied");
  });

  win.onClick("btn_save_replaced", () => {
    if (!lastReplaced) { win.toast("Run Preview Replace first"); return; }
    win.saveFile({ title: "Save replaced text", defaultName: "replaced.txt" }, (p) => {
      if (!p) return;
      try {
        writeFileSync(p, lastReplaced, "utf8");
        win.appendConsole("regex_console", `[Save] Replaced text written to ${p}\n`, 2);
        win.toast(`Saved ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("regex_console", `[Save Error] ${e.message}\n`, 3);
      }
    });
  });

  win.onClick("btn_gen_code", () => {
    const pattern = win.getValue("txt_pattern") || "";
    const lang = win.getValue("dd_lang") || "TypeScript";
    const code = generateCode(lang, pattern, currentFlags(true));
    win.appendConsole("regex_console", `[Generated Code Snippet]\n${code}\n`, 1);
    win.copyToClipboard(code);
    win.toast(`Generated ${lang} snippet (copied)`);
  });

  win.onClick("btn_explain", () => {
    const pattern = win.getValue("txt_pattern") || "";
    if (!pattern) { win.toast("Enter a pattern first"); return; }
    win.appendConsole("regex_console", `[Pattern Explanation]\n${explainPattern(pattern).join("\n")}\n\n`, 1);
  });

  win.onClick("btn_cheatsheet", () => {
    win.appendConsole("regex_console", `[Regex Cheat Sheet]\n${CHEATSHEET}\n\n`, 1);
  });

  win.onClick("btn_copy_matches", () => {
    if (lastMatches.length === 0) { win.toast("No matches to copy"); return; }
    const n = Math.max(0, parseInt(win.getValue("txt_group_n") || "0", 10) || 0);
    const maxG = lastMatches.reduce((a, m) => Math.max(a, m.groups.length), 0);
    if (n > maxG) { win.toast(`The pattern only has ${maxG} capture group(s)`); return; }
    win.copyToClipboard(matchesToList(lastMatches, n).join("\n"));
    win.toast(`Copied ${lastMatches.length} ${n ? `group ${n} value(s)` : "match(es)"}`);
  });

  win.onClick("btn_export_matches", () => {
    if (lastMatches.length === 0) {
      win.toast("No matches to export");
      return;
    }
    win.saveFile({ title: "Export matches (.json or .csv)", defaultName: "regex_matches.json" }, (p) => {
      if (!p) return;
      try {
        const csv = extname(p).toLowerCase() === ".csv";
        writeFileSync(p, csv ? matchesToCsv(lastMatches) : matchesToJson(lastMatches), "utf8");
        win.appendConsole("regex_console", `[Export] Saved ${lastMatches.length} matches to ${p}\n`, 2);
        win.toast(`Exported ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("regex_console", `[Export Error] ${e.message}\n`, 3);
      }
    });
  });

  win.onClick("btn_load_corpus", () => {
    win.openFile({ title: "Open a text file to test against" }, (p) => {
      if (!p) return;
      try {
        if (statSync(p).size > MAX_CORPUS_BYTES) throw new Error(`File is larger than ${MAX_CORPUS_BYTES / 1024 / 1024} MB`);
        win.setText("txt_corpus", readFileSync(p, "utf8"));
        win.appendConsole("regex_console", `[Load] ${p}\n`, 2);
        void evaluateRegex(true);
      } catch (e: any) {
        win.appendConsole("regex_console", `[Load Error] ${e.message}\n`, 3);
        win.toast(`Could not load file: ${e.message}`);
      }
    });
  });

  win.onClick("btn_save_ws_file", () => {
    win.saveFile({ title: "Save regex workspace", defaultName: "pattern.regex.json" }, (p) => {
      if (!p) return;
      try {
        writeFileSync(p, serializeWorkspace({
          pattern: win.getValue("txt_pattern") || "",
          subst: win.getValue("txt_subst") || "",
          corpus: win.getValue("txt_corpus") || "",
          flags: { g: win.getBool("chk_g"), i: win.getBool("chk_i"), m: win.getBool("chk_m"), s: win.getBool("chk_s"), u: win.getBool("chk_u") },
        }), "utf8");
        win.appendConsole("regex_console", `[Save] Workspace saved to ${p}\n`, 2);
        win.toast(`Saved ${basename(p)}`);
      } catch (e: any) {
        win.appendConsole("regex_console", `[Save Error] ${e.message}\n`, 3);
      }
    });
  });

  win.onClick("btn_load_ws_file", () => {
    win.openFile({ title: "Open regex workspace" }, (p) => {
      if (!p) return;
      try {
        const w = parseWorkspace(readFileSync(p, "utf8"));
        win.setText("txt_pattern", w.pattern);
        win.setText("txt_subst", w.subst);
        win.setText("txt_corpus", w.corpus);
        win.setBool("chk_g", w.flags.g);
        win.setBool("chk_i", w.flags.i);
        win.setBool("chk_m", w.flags.m);
        win.setBool("chk_s", w.flags.s);
        win.setBool("chk_u", w.flags.u);
        win.appendConsole("regex_console", `[Open] Loaded ${p}\n`, 2);
        void evaluateRegex(true);
      } catch (e: any) {
        win.appendConsole("regex_console", `[Open Error] ${e.message}\n`, 3);
        win.toast(e.message);
      }
    });
  });

  win.onChange("dd_lib", (_w, selected: string) => {
    const preset = PRESETS.find((x) => x.name === selected);
    if (preset) win.setText("txt_pattern", preset.pattern);
    return evaluateRegex(false);
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

if (import.meta.main) {
  const win = createRegexStudio({ fullscreen: true });
  console.log("⚡ Launching Regex Studio Pro...");
  win.run();
}
