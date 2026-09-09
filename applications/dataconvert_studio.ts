import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";

export function createDataConvertStudio(): SimpleWindow {
  const win = newSimpleWindow("DataConvert Studio -- Universal Format Interop", 1140, 950, {
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
  win.addHeading("DataConvert Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Workspace");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Converter Controls
  win.beginGroupBox("Format Transformation Controls");
  win.beginRow();
  win.addLabel("lbl_from", "From Format:");
  win.addDropdown("dd_from", ["CSV", "TSV", "JSON"], "CSV");
  win.addLabel("lbl_to", "To Format:");
  win.addDropdown("dd_to", ["JSON", "Markdown Table", "CSV", "TSV"], "JSON");
  win.endRow();

  win.beginRow();
  win.addButton("btn_convert", "⚡ Convert Data");
  win.addButton("btn_swap", "⇄ Swap Formats");
  win.endRow();
  win.endGroupBox();

  // Input Data Box
  win.beginGroupBox("Source Input Document");
  win.addTextarea("txt_input_data", SAMPLE_CSV).height(75);
  win.endGroupBox();

  // Output Data Box
  win.beginGroupBox("Converted Output Document");
  win.addTextarea("txt_output_data", "[\n  {\n    \"name\": \"Alice Smith\",\n    \"role\": \"Principal Engineer\",\n    \"department\": \"Core Systems\",\n    \"salary\": \"195000\"\n  },\n  {\n    \"name\": \"Bob Jones\",\n    \"role\": \"Product Architect\",\n    \"department\": \"UI Platform\",\n    \"salary\": \"180000\"\n  }\n]").height(75);
  win.endGroupBox();

  // Tabular Preview
  win.beginGroupBox("Parsed Tabular Preview");
  win.addTable("tbl_preview", ["name", "role", "department", "salary"], [
    ["Alice Smith", "Principal Engineer", "Core Systems", "195000"],
    ["Bob Jones", "Product Architect", "UI Platform", "180000"],
    ["Carol Danvers", "Security Lead", "Infrastructure", "190000"],
    ["David Miller", "DevOps Engineer", "Cloud Platform", "165000"],
  ]).height(110);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Conversion Telemetry & Parsing Diagnostics");
  win.addConsole("dc_console", 65);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Parsed Rows: 4  |  Columns: 4");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());

  const convertData = () => {
    const fromFmt = (win.getValue("dd_from") || "CSV").toLowerCase();
    const toFmt = (win.getValue("dd_to") || "JSON").toLowerCase();
    const input = win.getValue("txt_input_data") || "";

    let headers: string[] = [];
    let rows: string[][] = [];

    try {
      if (fromFmt === "json") {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed) && parsed.length > 0) {
          headers = Object.keys(parsed[0]);
          rows = parsed.map((item) => headers.map((h) => String(item[h] ?? "")));
        }
      } else {
        const delim = fromFmt === "tsv" ? "\t" : ",";
        const table = stdlib.csvParse(input, delim);
        if (table.length > 0) {
          headers = table[0] || [];
          rows = table.slice(1);
        }
      }

      let output = "";
      if (toFmt.includes("json")) {
        const objects = rows.map((r) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h] = r[idx] ?? "";
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
      } else {
        output = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      }

      win.setText("txt_output_data", output);
      win.setTableData("tbl_preview", headers.length > 0 ? headers : ["Columns"], rows.length > 0 ? rows : [["(no data)"]]);
      win.appendConsole("dc_console", `[DataConvert] Converted ${rows.length} rows from ${fromFmt.toUpperCase()} to ${toFmt.toUpperCase()}\n`, 2);
      win.setStatus(`Converted ${rows.length} rows`);
    } catch (e: any) {
      win.appendConsole("dc_console", `[DataConvert Error] ${e.message}\n`, 3);
      win.setStatus(`Conversion Error: ${e.message}`);
    }
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("DataConvert workspace saved successfully!");
  });
  win.onClick("btn_convert", convertData);

  return win;
}

if (import.meta.main) {
  const win = createDataConvertStudio();
  console.log("Launching DataConvert Studio...");
  win.run();
}
