import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

export function createDataConvertStudio(): SimpleWindow {
  const win = newSimpleWindow("Data Converter Studio Pro -- Enterprise Data Interchange Suite", 1160, 900, {
    appId: "dataconvert_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  const SAMPLE_CSV = `name,role,department,salary
Alice Smith,Principal Engineer,Core Systems,195000
Bob Jones,Product Architect,UI Platform,180000
Carol Danvers,Security Lead,Infrastructure,190000
David Miller,DevOps Engineer,Cloud Platform,165000`;

  // Title Row
  win.beginRow();
  win.addHeading("Data Converter Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Enterprise Multi-Format Transformer: JSON, CSV, TSV, YAML, Markdown Tables & Base64");

  // Converter Controls
  win.beginGroupBox("Format Transformation & Pipeline Settings");
  win.beginRow();
  win.addLabel("lbl_from", "Source Format:");
  win.addDropdown("dd_from", ["CSV", "TSV", "JSON", "Base64"], "CSV").width(140);
  win.addLabel("lbl_to", "Target Format:");
  win.addDropdown("dd_to", ["JSON", "Markdown Table", "CSV", "TSV", "YAML-like", "Base64"], "JSON").width(180);
  win.addButton("btn_convert", "⚡ Convert Document");
  win.addButton("btn_swap", "⇄ Swap Formats");
  win.addButton("btn_export", "💾 Save Output File");
  win.endRow();
  win.endGroupBox();

  // Input Data Box
  win.beginGroupBox("Source Document Input");
  win.addTextarea("txt_input_data", SAMPLE_CSV).height(75);
  win.endGroupBox();

  // Output Data Box
  win.beginGroupBox("Transformed Output Document");
  win.addTextarea(
    "txt_output_data",
    `[\n  {\n    "name": "Alice Smith",\n    "role": "Principal Engineer",\n    "department": "Core Systems",\n    "salary": "195000"\n  },\n  {\n    "name": "Bob Jones",\n    "role": "Product Architect",\n    "department": "UI Platform",\n    "salary": "180000"\n  }\n]`
  ).height(75);
  win.endGroupBox();

  // Tabular Preview
  win.beginGroupBox("Tabular Grid Inspection (Structured Record View)");
  win.addTable(
    "tbl_preview",
    ["name", "role", "department", "salary"],
    [
      ["Alice Smith", "Principal Engineer", "Core Systems", "195000"],
      ["Bob Jones", "Product Architect", "UI Platform", "180000"],
      ["Carol Danvers", "Security Lead", "Infrastructure", "190000"],
      ["David Miller", "DevOps Engineer", "Cloud Platform", "165000"],
    ]
  ).height(95);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Transformation Telemetry & Parsing Diagnostics");
  win.addConsole("dc_console", 85);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Parsed Rows: 4  |  Columns: 4  |  Zero Homebrew");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Data converter workspace saved!");
  });

  const convertData = () => {
    const fromFmt = (win.getValue("dd_from") || "CSV").toLowerCase();
    const toFmt = (win.getValue("dd_to") || "JSON").toLowerCase();
    const input = win.getValue("txt_input_data") || "";

    const t0 = performance.now();
    let headers: string[] = [];
    let rows: string[][] = [];

    try {
      if (fromFmt === "json") {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed) && parsed.length > 0) {
          headers = Object.keys(parsed[0]);
          rows = parsed.map((item) => headers.map((h) => String(item[h] ?? "")));
        }
      } else if (fromFmt === "base64") {
        const decoded = Buffer.from(input, "base64").toString("utf8");
        win.setText("txt_output_data", decoded);
        win.appendConsole("dc_console", `[Base64] Decoded ${input.length} chars to ${decoded.length} chars\n`, 2);
        return;
      } else {
        const delim = fromFmt === "tsv" ? "\t" : ",";
        const table = stdlib.csvParse(input, delim);
        if (table.length > 0) {
          headers = table[0] || [];
          rows = table.slice(1);
        }
      }

      let output = "";
      if (toFmt === "json") {
        const objects = rows.map((r) => {
          const obj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            const v = r[idx] ?? "";
            obj[h] = isNaN(Number(v)) || v === "" ? v : Number(v);
          });
          return obj;
        });
        output = JSON.stringify(objects, null, 2);
      } else if (toFmt.includes("markdown")) {
        const headerRow = `| ${headers.join(" | ")} |`;
        const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
        const dataRows = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
        output = `${headerRow}\n${sepRow}\n${dataRows}`;
      } else if (toFmt.includes("tsv")) {
        output = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
      } else if (toFmt.includes("base64")) {
        output = Buffer.from(input).toString("base64");
      } else if (toFmt.includes("yaml")) {
        // Lightweight clean YAML serializer
        const yamlLines: string[] = [];
        for (const r of rows) {
          yamlLines.push("-");
          headers.forEach((h, idx) => {
            yamlLines.push(`  ${h}: "${(r[idx] ?? "").replace(/"/g, '\\"')}"`);
          });
        }
        output = yamlLines.join("\n");
      } else {
        output = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      }

      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_output_data", output);
      win.setTableData("tbl_preview", headers.length > 0 ? headers : ["Columns"], rows.length > 0 ? rows : [["(no data)"]]);
      win.appendConsole(
        "dc_console",
        `[Convert OK] Transformed ${rows.length} rows (${fromFmt.toUpperCase()} -> ${toFmt.toUpperCase()}) in ${elapsed}ms\n`,
        2
      );
      win.setText("lbl_status", `Converted: ${rows.length} rows  |  Latency: ${elapsed}ms  |  Status: OK`);
      win.setStatus(`Converted in ${elapsed}ms`);
      win.toast(`Converted ${rows.length} rows`);
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.appendConsole("dc_console", `[Convert Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus(`Conversion Error: ${e.message}`);
    }
  };

  win.onClick("btn_convert", convertData);

  win.onClick("btn_swap", () => {
    const curFrom = win.getValue("dd_from") || "CSV";
    const curTo = win.getValue("dd_to") || "JSON";
    const curOut = win.getValue("txt_output_data") || "";
    if (curOut) {
      win.setText("txt_input_data", curOut);
    }
    win.setText("dd_from", curTo.includes("JSON") ? "JSON" : "CSV");
    win.setText("dd_to", curFrom.includes("JSON") ? "CSV" : "JSON");
    convertData();
  });

  win.onClick("btn_export", () => {
    const out = win.getValue("txt_output_data") || "";
    if (!out) {
      win.toast("No output to save");
      return;
    }
    const toFmt = (win.getValue("dd_to") || "JSON").toLowerCase();
    const ext = toFmt.includes("json") ? "json" : toFmt.includes("markdown") ? "md" : toFmt.includes("yaml") ? "yaml" : "csv";
    const outPath = resolve(process.cwd(), `converted_data.${ext}`);
    try {
      writeFileSync(outPath, out, "utf8");
      win.appendConsole("dc_console", `[Export] Saved converted document to ${outPath}\n`, 2);
      win.toast(`Saved ${basename(outPath)}`);
    } catch (e: any) {
      win.appendConsole("dc_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  return win;
}

export const createDataForgeStudio = createDataConvertStudio;

if (import.meta.main) {
  const win = createDataConvertStudio();
  console.log("⚡ Launching Data Converter Studio Pro...");
  win.run();
}
