import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, basename, extname } from "path";
import { readClipboardSync, writeClipboardSync } from "../src/localGuard";

export interface DataRecord {
  [key: string]: any;
}

export interface ParseResult {
  headers: string[];
  rows: string[][];
  rawRecords?: DataRecord[];
}

export interface HistorySnapshot {
  input: string;
  fromFmt: string;
  toFmt: string;
  action: string;
}

export function createDataConvertStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("Data Converter Studio Pro -- Enterprise Data Interchange Suite", 1160, 920, {
    appId: "dataconvert_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  const SAMPLE_CSV = `name,role,department,salary
Alice Smith,Principal Engineer,Core Systems,195000
Bob Jones,Product Architect,UI Platform,180000
Carol Danvers,Security Lead,Infrastructure,190000
David Miller,DevOps Engineer,Cloud Platform,165000`;

  const SAMPLE_JSON = `[\n  {\n    "name": "Alice Smith",\n    "role": "Principal Engineer",\n    "department": "Core Systems",\n    "salary": 195000\n  },\n  {\n    "name": "Bob Jones",\n    "role": "Product Architect",\n    "department": "UI Platform",\n    "salary": 180000\n  }\n]`;

  // Pre-configured Curated Sample Datasets
  const PRESET_DATASETS: Record<string, { format: string; target: string; data: string; description: string }> = {
    "Employees Directory (CSV)": {
      format: "CSV",
      target: "JSON",
      description: "Engineering team roster with names, roles, departments and salaries",
      data: SAMPLE_CSV,
    },
    "E-Commerce Orders (JSON)": {
      format: "JSON",
      target: "Markdown Table",
      description: "Customer orders with order IDs, products, quantities and pricing",
      data: `[
  { "orderId": "ORD-9401", "customer": "Sarah Connor", "product": "Cyberdeck X1", "quantity": 1, "price": 1299.99, "shipped": true },
  { "orderId": "ORD-9402", "customer": "Neo Anderson", "product": "Neural Interface Cable", "quantity": 2, "price": 149.50, "shipped": true },
  { "orderId": "ORD-9403", "customer": "Rick Deckard", "product": "Voight-Kampff Sensor", "quantity": 1, "price": 3499.00, "shipped": false },
  { "orderId": "ORD-9404", "customer": "Major Kusanagi", "product": "Thermoptic Camouflage", "quantity": 1, "price": 5400.00, "shipped": true }
]`,
    },
    "Server Access Logs (TSV)": {
      format: "TSV",
      target: "SQL INSERT Statements",
      description: "Web server access logs with timestamp, IP, HTTP method and response latency",
      data: `timestamp\tip_address\tmethod\tpath\tstatus_code\tlatency_ms
2026-10-12T14:20:01Z\t192.168.1.101\tGET\t/api/v1/telemetry\t200\t12.4
2026-10-12T14:20:03Z\t192.168.1.105\tPOST\t/api/v1/auth/token\t201\t45.8
2026-10-12T14:20:07Z\t10.0.0.42\tGET\t/metrics/cluster\t200\t8.1
2026-10-12T14:20:12Z\t172.16.0.88\tPUT\t/api/v1/config/cluster\t204\t28.3`,
    },
    "Cloud Infrastructure Config (YAML)": {
      format: "YAML",
      target: "JSON",
      description: "Microservice cluster configuration with replica counts and memory limits",
      data: `- service: "api-gateway"
  replicas: "4"
  environment: "production"
  memory_limit: "2Gi"
  cpu_limit: "1000m"
- service: "auth-broker"
  replicas: "2"
  environment: "production"
  memory_limit: "1Gi"
  cpu_limit: "500m"
- service: "telemetry-collector"
  replicas: "3"
  environment: "production"
  memory_limit: "4Gi"
  cpu_limit: "2000m"`,
    },
    "Financial Performance Metrics (Markdown Table)": {
      format: "Markdown Table",
      target: "HTML Table",
      description: "Quarterly corporate revenue, profit margins and financial breakdown",
      data: `| Quarter | Revenue_M | Gross_Margin | Operating_Income_M | Net_Profit_Margin |
| --- | --- | --- | --- | --- |
| Q1 2026 | 48.5 | 76.2% | 14.2 | 24.5% |
| Q2 2026 | 54.1 | 78.0% | 17.8 | 27.1% |
| Q3 2026 | 61.3 | 79.4% | 21.0 | 29.3% |
| Q4 2026 | 72.8 | 81.2% | 26.5 | 31.0% |`,
    },
    "Product Catalog (XML)": {
      format: "XML",
      target: "CSV",
      description: "XML inventory feed with SKU, title, category and unit pricing",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <sku>PROD-101</sku>
    <title>Quantum Processor 64-Core</title>
    <category>Hardware</category>
    <price>3200.00</price>
    <in_stock>true</in_stock>
  </product>
  <product>
    <sku>PROD-102</sku>
    <title>Optical Bus Expansion Card</title>
    <category>Accessories</category>
    <price>450.00</price>
    <in_stock>true</in_stock>
  </product>
  <product>
    <sku>PROD-103</sku>
    <title>Cryogenic Cooling Unit</title>
    <category>Cooling</category>
    <price>1250.00</price>
    <in_stock>false</in_stock>
  </product>
</products>`,
    },
  };

  // State Management for Multi-Level Undo/Redo & Filter
  const undoStack: HistorySnapshot[] = [
    {
      input: SAMPLE_CSV,
      fromFmt: "CSV",
      toFmt: "JSON",
      action: "Initial Document",
    },
  ];
  const redoStack: HistorySnapshot[] = [];
  let currentHeaders: string[] = ["name", "role", "department", "salary"];
  let currentRows: string[][] = [
    ["Alice Smith", "Principal Engineer", "Core Systems", "195000"],
    ["Bob Jones", "Product Architect", "UI Platform", "180000"],
    ["Carol Danvers", "Security Lead", "Infrastructure", "190000"],
    ["David Miller", "DevOps Engineer", "Cloud Platform", "165000"],
  ];

  const ensureCurrentStateRecorded = () => {
    const curInput = win.getValue("txt_input_data") || "";
    const curFrom = win.getValue("dd_from") || "CSV";
    const curTo = win.getValue("dd_to") || "JSON";
    const last = undoStack[undoStack.length - 1];
    if (!last || last.input !== curInput || last.fromFmt !== curFrom || last.toFmt !== curTo) {
      undoStack.push({ input: curInput, fromFmt: curFrom, toFmt: curTo, action: "Edit" });
      if (undoStack.length > 100) undoStack.shift();
    }
  };

  const recordNewState = (action: string) => {
    const curInput = win.getValue("txt_input_data") || "";
    const curFrom = win.getValue("dd_from") || "CSV";
    const curTo = win.getValue("dd_to") || "JSON";
    const last = undoStack[undoStack.length - 1];
    if (last && last.input === curInput && last.fromFmt === curFrom && last.toFmt === curTo) {
      return; // Do not record duplicate state
    }
    undoStack.push({ input: curInput, fromFmt: curFrom, toFmt: curTo, action });
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0; // Clear redo on fresh edit
  };

  const pushUndoSnapshot = recordNewState;

  // 1. Title Row
  win.beginRow();
  win.addHeading("Data Converter Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption(
    "Enterprise Multi-Format Transformer: CSV, TSV, JSON, ndjson, YAML, TOML, XML, Markdown, SQL & Base64"
  );

  // 2. Format Transformation & Pipeline Settings
  win.beginGroupBox("Format Transformation & Pipeline Settings");
  win.beginRow();
  win.addLabel("lbl_from", "Source Format:");
  win.addDropdown(
    "dd_from",
    [
      "CSV",
      "TSV",
      "JSON",
      "JSON Lines (ndjson)",
      "YAML",
      "TOML",
      "XML",
      "Markdown Table",
      "Base64",
      "URL Encoded",
    ],
    "CSV"
  ).width(150);
  win.addLabel("lbl_to", "Target Format:");
  win.addDropdown(
    "dd_to",
    [
      "JSON",
      "Markdown Table",
      "CSV",
      "TSV",
      "YAML",
      "TOML",
      "XML",
      "SQL INSERT Statements",
      "HTML Table",
      "JSON Lines (ndjson)",
      "JSON (Minified)",
      "PHP Array",
      "Python Dict",
      "Base64",
      "URL Encoded",
    ],
    "JSON"
  ).width(180);
  win.addButton("btn_convert", "⚡ Convert Document");
  win.addButton("btn_paste_from_clipboard", "📋 Paste from Clipboard");
  win.addButton("btn_swap", "⇄ Swap Formats");
  win.addButton("btn_export", "💾 Save Output File");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_samples", "Preset Dataset:");
  win.addDropdown(
    "dd_samples",
    [
      "Select Preset Dataset...",
      "Employees Directory (CSV)",
      "E-Commerce Orders (JSON)",
      "Server Access Logs (TSV)",
      "Cloud Infrastructure Config (YAML)",
      "Financial Performance Metrics (Markdown Table)",
      "Product Catalog (XML)",
    ],
    "Select Preset Dataset..."
  ).width(250);
  win.addButton("btn_load_sample", "🎲 Load Preset");
  win.addButton("btn_beautify", "✨ Beautify Input");
  win.addButton("btn_minify", "⚡ Minify Input");
  win.addButton("btn_clear_input", "🧹 Clear Input");
  win.endRow();
  win.endGroupBox();

  // 3. Source Document Input Box with Complete Editing Actions (Undo, Paste, Select All, Copy, Import)
  win.beginGroupBox("Source Document Input (Supports Drag & Drop, File Import, Paste & Undo)");
  win.beginRow();
  win.addButton("btn_paste", "📋 Paste from Clipboard");
  win.addButton("btn_undo", "↩️ Undo");
  win.addButton("btn_redo", "↪️ Redo");
  win.addButton("btn_select_all_input", "🔍 Select All");
  win.addButton("btn_copy_input", "📋 Copy Input");
  win.addButton("btn_import", "📂 Import File");
  win.addLabel("lbl_input_stats", "Input: 4 lines · 224 chars · 0.2 KB");
  win.endRow();
  win.addTextarea("txt_input_data", SAMPLE_CSV).height(75);
  win.endGroupBox();

  // 4. Output Data Box with Clipboard and Selection Controls
  win.beginGroupBox("Transformed Output Document");
  win.beginRow();
  win.addButton("btn_copy_output", "📋 Copy to Clipboard");
  win.addButton("btn_select_all_output", "🔍 Select All");
  win.addButton("btn_export_output", "💾 Save Output File");
  win.addLabel("lbl_output_stats", "Output: Ready | 0.3 KB | 0ms");
  win.endRow();
  win.addTextarea("txt_output_data", SAMPLE_JSON).height(75);
  win.endGroupBox();

  // 5. Tabular Preview with Real-time Search & Filter
  win.beginGroupBox("Tabular Grid Inspection (Structured Record View)");
  win.beginRow();
  win.addLabel("lbl_grid_info", "🔍 Filter Preview Records:");
  win.addTextInput("txt_grid_search", "", "Type keyword to filter rows in preview table...").width(280);
  win.addButton("btn_filter_grid", "Filter Grid");
  win.addButton("btn_reset_grid", "Reset Grid");
  win.addLabel("lbl_grid_count", "Showing 4 of 4 records (4 columns)");
  win.endRow();
  win.addTable(
    "tbl_preview",
    currentHeaders,
    currentRows
  ).height(95);
  win.endGroupBox();

  // 6. Telemetry Console
  win.beginGroupBox("Transformation Telemetry & Parsing Diagnostics");
  win.addConsole("dc_console", 85);
  win.endGroupBox();

  // 7. Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Parsed Rows: 4  |  Columns: 4  |  Zero Homebrew");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Parsing & Data Conversion Engines
  // -----------------------------------------------------------------------------------------------

  const parseXmlRecords = (xml: string): ParseResult => {
    const recordMatches = xml.match(/<(record|product|item|row|entry|node)[\s>][\s\S]*?<\/\1>/gi);
    if (!recordMatches || recordMatches.length === 0) {
      throw new Error("No XML record tags (<record>, <product>, <item>, <row>, <entry>) found");
    }
    const records: DataRecord[] = [];
    const headerSet = new Set<string>();
    for (const block of recordMatches) {
      const rec: DataRecord = {};
      const fieldMatches = block.matchAll(/<([a-zA-Z0-9_\-]+)>([\s\S]*?)<\/\1>/g);
      for (const m of fieldMatches) {
        const tag = m[1]!;
        const val = m[2]!
          .trim()
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"');
        rec[tag] = val;
        headerSet.add(tag);
      }
      records.push(rec);
    }
    const headers = Array.from(headerSet);
    const rows = records.map((r) => headers.map((h) => (r[h] !== undefined ? String(r[h]) : "")));
    return { headers, rows, rawRecords: records };
  };

  const parseMarkdownTable = (md: string): ParseResult => {
    const lines = md
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && l.endsWith("|"));
    if (lines.length < 2) {
      throw new Error("Markdown table must contain at least a header row and separator row");
    }
    const parseRow = (line: string) =>
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, "|"));

    const headers = parseRow(lines[0]!);
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]!);
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // Skip header separator
      rows.push(headers.map((_, idx) => cells[idx] ?? ""));
    }
    return { headers, rows };
  };

  const parseNdjson = (input: string): ParseResult => {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error("JSON Lines input is empty");
    const records: DataRecord[] = lines.map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (e: any) {
        throw new Error(`JSON Lines syntax error at line ${i + 1}: ${e.message}`);
      }
    });
    const headerSet = new Set<string>();
    records.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);
    const rows = records.map((r) =>
      headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return "";
        return typeof v === "object" ? JSON.stringify(v) : String(v);
      })
    );
    return { headers, rows, rawRecords: records };
  };

  const parseSimpleYaml = (yaml: string): ParseResult => {
    const lines = yaml.split(/\r?\n/);
    const records: DataRecord[] = [];
    let currentRec: DataRecord | null = null;
    const headerSet = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      if (line === "-" || line.startsWith("- ")) {
        if (currentRec && Object.keys(currentRec).length > 0) records.push(currentRec);
        currentRec = {};
        const rest = line.replace(/^-+\s*/, "").trim();
        if (rest.includes(":")) {
          const idx = rest.indexOf(":");
          const k = rest.slice(0, idx).trim().replace(/^['"]|['"]$/g, "");
          const v = rest.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
          currentRec[k] = v;
          headerSet.add(k);
        }
      } else if (currentRec && line.includes(":")) {
        const idx = line.indexOf(":");
        const k = line.slice(0, idx).trim().replace(/^['"]|['"]$/g, "");
        const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        currentRec[k] = v;
        headerSet.add(k);
      }
    }
    if (currentRec && Object.keys(currentRec).length > 0) {
      records.push(currentRec);
    }
    if (records.length === 0) {
      throw new Error("Could not parse YAML records (expected list format '- key: value')");
    }
    const headers = Array.from(headerSet);
    const rows = records.map((r) => headers.map((h) => (r[h] !== undefined ? String(r[h]) : "")));
    return { headers, rows, rawRecords: records };
  };

  const parseToml = (input: string): ParseResult => {
    try {
      const data = (Bun as any).TOML?.parse ? (Bun as any).TOML.parse(input) : JSON.parse(input);
      const records = Array.isArray(data)
        ? data
        : Array.isArray((data as any).records)
        ? (data as any).records
        : [data];
      const headerSet = new Set<string>();
      records.forEach((r: any) => Object.keys(r).forEach((k) => headerSet.add(k)));
      const headers = Array.from(headerSet);
      const rows = records.map((r: any) =>
        headers.map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        })
      );
      return { headers, rows, rawRecords: records };
    } catch (e: any) {
      throw new Error(`TOML parse error: ${e.message}`);
    }
  };

  const updateInputTelemetry = (input: string) => {
    const lines = input.split(/\r?\n/).length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const chars = input.length;
    const kb = (chars / 1024).toFixed(1);
    win.setText("lbl_input_stats", `Input: ${lines} lines · ${words} words · ${chars} chars · ${kb} KB`);
  };

  const convertData = () => {
    const fromFmt = (win.getValue("dd_from") || "CSV").toLowerCase();
    const toFmt = (win.getValue("dd_to") || "JSON").toLowerCase();
    const input = win.getValue("txt_input_data") || "";

    updateInputTelemetry(input);

    const t0 = performance.now();
    let headers: string[] = [];
    let rows: string[][] = [];

    try {
      if (fromFmt === "json") {
        const parsed0 = JSON.parse(input);
        const parsed = Array.isArray(parsed0)
          ? parsed0
          : Array.isArray(parsed0.records)
          ? parsed0.records
          : Array.isArray(parsed0.data)
          ? parsed0.data
          : [parsed0];
        const records = parsed.filter((x: any) => x !== null && typeof x === "object");
        if (records.length === 0) throw new Error("JSON input must be an object or an array of objects");
        const keySet = new Set<string>();
        for (const rec of records) Object.keys(rec).forEach((k) => keySet.add(k));
        headers = [...keySet];
        rows = records.map((item: any) =>
          headers.map((h) => {
            const v = item[h];
            if (v === null || v === undefined) return "";
            return typeof v === "object" ? JSON.stringify(v) : String(v);
          })
        );
      } else if (fromFmt.includes("ndjson") || fromFmt.includes("lines")) {
        const res = parseNdjson(input);
        headers = res.headers;
        rows = res.rows;
      } else if (fromFmt === "xml") {
        const res = parseXmlRecords(input);
        headers = res.headers;
        rows = res.rows;
      } else if (fromFmt.includes("markdown")) {
        const res = parseMarkdownTable(input);
        headers = res.headers;
        rows = res.rows;
      } else if (fromFmt === "yaml") {
        const res = parseSimpleYaml(input);
        headers = res.headers;
        rows = res.rows;
      } else if (fromFmt === "toml") {
        const res = parseToml(input);
        headers = res.headers;
        rows = res.rows;
      } else if (fromFmt === "base64") {
        const decoded = Buffer.from(input, "base64").toString("utf8");
        win.setText("txt_output_data", decoded);
        const elapsed = (performance.now() - t0).toFixed(2);
        win.appendConsole("dc_console", `[Base64] Decoded ${input.length} chars to ${decoded.length} chars\n`, 2);
        win.setText("lbl_output_stats", `Decoded: ${decoded.length} chars | Latency: ${elapsed}ms`);
        win.setStatus(`Decoded Base64 in ${elapsed}ms`);
        return;
      } else if (fromFmt.includes("url")) {
        const decoded = decodeURIComponent(input);
        win.setText("txt_output_data", decoded);
        const elapsed = (performance.now() - t0).toFixed(2);
        win.appendConsole("dc_console", `[URL] Decoded ${input.length} chars to ${decoded.length} chars\n`, 2);
        win.setText("lbl_output_stats", `Decoded: ${decoded.length} chars | Latency: ${elapsed}ms`);
        return;
      } else {
        const delim = fromFmt === "tsv" ? "\t" : ",";
        const table = stdlib.csvParse(input, delim);
        if (table.length > 0) {
          headers = table[0] || [];
          rows = table.slice(1).filter((r) => r.some((c) => c && c.trim() !== ""));
        }
      }

      currentHeaders = headers.length > 0 ? headers : ["Columns"];
      currentRows = rows;

      const csvCell = (v: string, d: string) =>
        v.includes(d) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const mdCell = (v: string) => v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
      const escapeXml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      let output = "";

      if (toFmt === "json" || toFmt.includes("minified")) {
        const objects = rows.map((r) => {
          const obj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            const v = r[idx] ?? "";
            obj[h] = v !== "" && String(Number(v)) === v ? Number(v) : v;
          });
          return obj;
        });
        output = toFmt.includes("minified")
          ? JSON.stringify(objects)
          : JSON.stringify(objects, null, 2);
      } else if (toFmt.includes("ndjson") || toFmt.includes("lines")) {
        output = rows
          .map((r) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              const v = r[idx] ?? "";
              obj[h] = v !== "" && String(Number(v)) === v ? Number(v) : v;
            });
            return JSON.stringify(obj);
          })
          .join("\n");
      } else if (toFmt.includes("markdown")) {
        const headerRow = `| ${headers.map(mdCell).join(" | ")} |`;
        const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
        const dataRows = rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`).join("\n");
        output = `${headerRow}\n${sepRow}\n${dataRows}`;
      } else if (toFmt.includes("html")) {
        const thead = `  <thead>\n    <tr>\n${headers
          .map((h) => `      <th>${escapeXml(h)}</th>`)
          .join("\n")}\n    </tr>\n  </thead>`;
        const tbody = `  <tbody>\n${rows
          .map(
            (r) =>
              `    <tr>\n${headers
                .map((_, idx) => `      <td>${escapeXml(r[idx] ?? "")}</td>`)
                .join("\n")}\n    </tr>`
          )
          .join("\n")}\n  </tbody>`;
        output = `<table class="rad-data-table">\n${thead}\n${tbody}\n</table>`;
      } else if (toFmt.includes("sql")) {
        const tableName = "converted_records";
        const cols = headers.map((h) => `\`${h.replace(/`/g, "")}\``).join(", ");
        const valuesList = rows.map((r) => {
          const vals = headers
            .map((_, idx) => {
              const val = r[idx] ?? "";
              if (val !== "" && String(Number(val)) === val) return val;
              return `'${val.replace(/'/g, "''")}'`;
            })
            .join(", ");
          return `  (${vals})`;
        });
        output = `-- SQL INSERT Statements generated by Data Converter Studio Pro\nINSERT INTO \`${tableName}\` (${cols}) VALUES\n${valuesList.join(
          ",\n"
        )};`;
      } else if (toFmt.includes("tsv")) {
        const tsvCell = (v: string) => v.replace(/[\t\r\n]+/g, " ");
        output = [
          headers.map(tsvCell).join("\t"),
          ...rows.map((r) => headers.map((_, idx) => tsvCell(r[idx] ?? "")).join("\t")),
        ].join("\n");
      } else if (toFmt.includes("base64")) {
        output = Buffer.from(input).toString("base64");
      } else if (toFmt.includes("url")) {
        output = encodeURIComponent(input);
      } else if (toFmt.includes("yaml")) {
        const yq = (s: string) =>
          `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
        const yamlLines: string[] = [];
        for (const r of rows) {
          yamlLines.push("-");
          headers.forEach((h, idx) => {
            yamlLines.push(`  ${/^[A-Za-z_][\w.-]*$/.test(h) ? h : yq(h)}: ${yq(r[idx] ?? "")}`);
          });
        }
        output = yamlLines.join("\n");
      } else if (toFmt.includes("toml")) {
        const tomlLines: string[] = [];
        for (const r of rows) {
          tomlLines.push("[[records]]");
          headers.forEach((h, idx) => {
            const val = r[idx] ?? "";
            tomlLines.push(
              `${/^[A-Za-z_][\w.-]*$/.test(h) ? h : JSON.stringify(h)} = ${JSON.stringify(val)}`
            );
          });
          tomlLines.push("");
        }
        output = tomlLines.join("\n").trim();
      } else if (toFmt.includes("xml")) {
        const xmlLines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<records>"];
        for (const r of rows) {
          xmlLines.push("  <record>");
          headers.forEach((h, idx) => {
            const tag = h.replace(/[^a-zA-Z0-9_\-]/g, "_") || "field";
            xmlLines.push(`    <${tag}>${escapeXml(r[idx] ?? "")}</${tag}>`);
          });
          xmlLines.push("  </record>");
        }
        xmlLines.push("</records>");
        output = xmlLines.join("\n");
      } else if (toFmt.includes("php")) {
        const phpRecords = rows.map((r) => {
          const lines = headers.map(
            (h, idx) => `        ${JSON.stringify(h)} => ${JSON.stringify(r[idx] ?? "")},`
          );
          return `    [\n${lines.join("\n")}\n    ],`;
        });
        output = `<?php\n// Generated by Data Converter Studio Pro\n$data = [\n${phpRecords.join(
          "\n"
        )}\n];`;
      } else if (toFmt.includes("python")) {
        const pyRecords = rows.map((r) => {
          const lines = headers.map(
            (h, idx) => `        ${JSON.stringify(h)}: ${JSON.stringify(r[idx] ?? "")},`
          );
          return `    {\n${lines.join("\n")}\n    },`;
        });
        output = `# Generated by Data Converter Studio Pro\ndata = [\n${pyRecords.join("\n")}\n]`;
      } else {
        // Standard CSV
        output = [
          headers.map((h) => csvCell(h, ",")).join(","),
          ...rows.map((r) => headers.map((_, idx) => csvCell(r[idx] ?? "", ",")).join(",")),
        ].join("\n");
      }

      const elapsed = (performance.now() - t0).toFixed(2);
      win.setText("txt_output_data", output);
      win.setTableData(
        "tbl_preview",
        headers.length > 0 ? headers : ["Columns"],
        rows.length > 0 ? rows : [["(no data)"]]
      );

      const outKb = (output.length / 1024).toFixed(1);
      const inLen = input.length || 1;
      const ratio = (((output.length - inLen) / inLen) * 100).toFixed(0);
      const ratioStr = Number(ratio) >= 0 ? `+${ratio}%` : `${ratio}%`;
      win.setText(
        "lbl_output_stats",
        `Output: ${output.split(/\r?\n/).length} lines · ${output.length} chars · ${outKb} KB (Ratio: ${ratioStr}) · ${elapsed}ms`
      );

      win.setText("lbl_grid_count", `Showing ${rows.length} of ${rows.length} records (${headers.length} columns)`);
      win.appendConsole(
        "dc_console",
        `[Convert OK] Transformed ${rows.length} rows (${fromFmt.toUpperCase()} -> ${toFmt.toUpperCase()}) in ${elapsed}ms\n`,
        2
      );
      win.setText(
        "lbl_status",
        `Converted: ${rows.length} rows  |  Columns: ${headers.length}  |  Latency: ${elapsed}ms  |  Status: OK`
      );
      win.setStatus(`Converted in ${elapsed}ms`);
      win.toast(`Converted ${rows.length} rows`);
    } catch (e: any) {
      const elapsed = (performance.now() - t0).toFixed(2);
      win.appendConsole("dc_console", `[Convert Error] ${e.message} (${elapsed}ms)\n`, 3);
      win.setStatus(`Conversion Error: ${e.message}`);
      win.toast(`Error: ${e.message}`);
    }
  };

  // -----------------------------------------------------------------------------------------------
  // Event Handlers & User Action Dispatchers
  // -----------------------------------------------------------------------------------------------

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Data converter workspace saved!");
  });

  win.onClick("btn_convert", convertData);

  // Watch input changes for live telemetry and undo tracking
  win.onChange("txt_input_data", (_w, val) => {
    const text = String(val || "");
    updateInputTelemetry(text);
  });

  // Swap Formats
  win.onClick("btn_swap", () => {
    ensureCurrentStateRecorded();
    const curFrom = win.getValue("dd_from") || "CSV";
    const curTo = win.getValue("dd_to") || "JSON";
    const curOut = win.getValue("txt_output_data") || "";
    if (curOut) {
      win.setText("txt_input_data", curOut);
    }
    win.setText("dd_from", curTo.includes("JSON") ? "JSON" : "CSV");
    win.setText("dd_to", curFrom.includes("JSON") ? "CSV" : "JSON");
    recordNewState("Swap Formats");
    convertData();
  });

  // Undo Action
  win.onClick("btn_undo", (w) => {
    // If the input text in the window differs from the stack top (e.g. from direct editing/setting),
    // push current state so undo immediately reverts back to the previous snapshot.
    const curInput = w.getValue("txt_input_data") || "";
    const curFrom = w.getValue("dd_from") || "CSV";
    const curTo = w.getValue("dd_to") || "JSON";
    const top = undoStack[undoStack.length - 1];
    if (top && (top.input !== curInput || top.fromFmt !== curFrom || top.toFmt !== curTo)) {
      undoStack.push({ input: curInput, fromFmt: curFrom, toFmt: curTo, action: "Current State" });
    }

    if (undoStack.length <= 1) {
      w.toast("Nothing to undo");
      return;
    }
    const current = undoStack.pop()!;
    redoStack.push(current);
    // The length check above leaves at least one entry after the pop.
    const prev = undoStack[undoStack.length - 1]!;

    w.setText("txt_input_data", prev.input);
    w.setText("dd_from", prev.fromFmt);
    w.setText("dd_to", prev.toFmt);
    convertData();
    w.toast(`↩️ Undone: ${current.action}`);
  });

  // Redo Action
  win.onClick("btn_redo", (w) => {
    if (redoStack.length === 0) {
      w.toast("Nothing to redo");
      return;
    }
    const next = redoStack.pop()!;
    undoStack.push(next);

    w.setText("txt_input_data", next.input);
    w.setText("dd_from", next.fromFmt);
    w.setText("dd_to", next.toFmt);
    convertData();
    w.toast(`↪️ Redone: ${next.action}`);
  });

  // Unified Paste from Clipboard Routine (Reads directly from native desktop OS clipboard & Webview)
  const handlePasteFromClipboard = async (w: SimpleWindow) => {
    try {
      // 1. If explicit getClipboardText mock is attached to this instance (e.g. in test suites), honor it
      let text = "";
      if (Object.prototype.hasOwnProperty.call(w, "getClipboardText")) {
        try {
          text = await (w as any).getClipboardText();
        } catch {}
      }

      // 2. Direct OS Native Clipboard Read (macOS pbpaste, Windows Get-Clipboard, Linux wl-paste/xclip)
      if (!text || !text.trim()) {
        text = readClipboardSync();
      }

      // 3. Fallback to webview clipboard getter if still empty
      if (!text || !text.trim()) {
        try {
          text = await w.getClipboardText();
        } catch {}
      }

      if (!text || !text.trim()) {
        w.toast("Clipboard is empty or inaccessible. Press Ctrl/Cmd+V to paste.");
        return;
      }

      ensureCurrentStateRecorded();
      w.setText("txt_input_data", text);

      // Intelligent format autodetection on paste
      const trimmed = text.trim();
      let detectedFmt = "";
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        detectedFmt = "JSON";
      } else if (trimmed.startsWith("<") && trimmed.includes(">")) {
        detectedFmt = "XML";
      } else if (trimmed.startsWith("|") && trimmed.includes("\n|")) {
        detectedFmt = "Markdown Table";
      } else if (trimmed.includes("\t") && !trimmed.includes(",")) {
        detectedFmt = "TSV";
      } else if (trimmed.includes(",") && trimmed.includes("\n")) {
        detectedFmt = "CSV";
      } else if (trimmed.startsWith("- ") && trimmed.includes(":")) {
        detectedFmt = "YAML";
      }

      if (detectedFmt) {
        w.setText("dd_from", detectedFmt);
      }

      recordNewState("Paste from Clipboard");
      convertData();
      w.toast(`📋 Pasted ${text.length} characters from clipboard!`);
    } catch (e: any) {
      w.toast("Paste error: " + e.message);
    }
  };

  win.onClick("btn_paste", handlePasteFromClipboard);
  win.onClick("btn_paste_from_clipboard", handlePasteFromClipboard);

  // Select All Input
  win.onClick("btn_select_all_input", (w) => {
    w.evalJS(`
      const el = document.getElementById("txt_input_data");
      if (el) { el.focus(); el.select(); }
    `);
    w.toast("Selected all input text");
  });

  // Select All Output
  win.onClick("btn_select_all_output", (w) => {
    w.evalJS(`
      const el = document.getElementById("txt_output_data");
      if (el) { el.focus(); el.select(); }
    `);
    w.toast("Selected all output text");
  });

  // Copy Input to Clipboard
  win.onClick("btn_copy_input", (w) => {
    const input = w.getValue("txt_input_data") || "";
    if (!input) {
      w.toast("Source input is empty");
      return;
    }
    writeClipboardSync(input);
    w.copyToClipboard(input);
    w.toast(`📋 Copied ${input.length} characters of source input to clipboard!`);
  });

  // Copy Output to Clipboard
  const handleCopyOutput = (w: SimpleWindow) => {
    const out = w.getValue("txt_output_data") || "";
    if (!out) {
      w.toast("No transformed output to copy");
      return;
    }
    writeClipboardSync(out);
    w.copyToClipboard(out);
    w.toast(`📋 Copied ${out.length} characters of transformed output to clipboard!`);
  };
  win.onClick("btn_copy_output", handleCopyOutput);

  // Import File Dialog
  const handleImportFile = async (w: SimpleWindow) => {
    try {
      const selectedPath = await w.openFileDialog(
        "Select Data File to Convert",
        "*.csv;*.tsv;*.json;*.jsonl;*.ndjson;*.yaml;*.yml;*.toml;*.xml;*.md;*.txt"
      );
      if (!selectedPath) return;

      if (!existsSync(selectedPath)) {
        w.toast(`File not found: ${selectedPath}`);
        return;
      }

      const content = readFileSync(selectedPath, "utf8");
      ensureCurrentStateRecorded();
      w.setText("txt_input_data", content);

      // Auto-detect format based on file extension
      const ext = extname(selectedPath).toLowerCase();
      if (ext === ".json") w.setText("dd_from", "JSON");
      else if (ext === ".jsonl" || ext === ".ndjson") w.setText("dd_from", "JSON Lines (ndjson)");
      else if (ext === ".tsv") w.setText("dd_from", "TSV");
      else if (ext === ".yaml" || ext === ".yml") w.setText("dd_from", "YAML");
      else if (ext === ".toml") w.setText("dd_from", "TOML");
      else if (ext === ".xml") w.setText("dd_from", "XML");
      else if (ext === ".md") w.setText("dd_from", "Markdown Table");
      else if (ext === ".csv") w.setText("dd_from", "CSV");

      recordNewState(`Import ${basename(selectedPath)}`);
      convertData();
      w.appendConsole("dc_console", `[Import] Loaded ${selectedPath} (${(content.length / 1024).toFixed(1)} KB)\n`, 2);
      w.toast(`📂 Imported ${basename(selectedPath)}`);
    } catch (e: any) {
      w.toast("Import error: " + e.message);
    }
  };
  win.onClick("btn_import", handleImportFile);

  // Export File Dialog
  const handleExportFile = (w: SimpleWindow) => {
    const out = w.getValue("txt_output_data") || "";
    if (!out) {
      w.toast("No output to save");
      return;
    }
    const toFmt = (w.getValue("dd_to") || "JSON").toLowerCase();
    const ext = toFmt.includes("json (minified)")
      ? "min.json"
      : toFmt.includes("ndjson") || toFmt.includes("lines")
      ? "ndjson"
      : toFmt.includes("json")
      ? "json"
      : toFmt.includes("markdown")
      ? "md"
      : toFmt.includes("html")
      ? "html"
      : toFmt.includes("sql")
      ? "sql"
      : toFmt.includes("yaml")
      ? "yaml"
      : toFmt.includes("toml")
      ? "toml"
      : toFmt.includes("xml")
      ? "xml"
      : toFmt.includes("php")
      ? "php"
      : toFmt.includes("python")
      ? "py"
      : toFmt.includes("tsv")
      ? "tsv"
      : toFmt.includes("base64")
      ? "txt"
      : "csv";

    const outPath = resolve(process.cwd(), `converted_data.${ext}`);
    try {
      writeFileSync(outPath, out, "utf8");
      w.appendConsole("dc_console", `[Export] Saved converted document to ${outPath}\n`, 2);
      w.toast(`Saved ${basename(outPath)}`);
    } catch (e: any) {
      w.appendConsole("dc_console", `[Export Error] ${e.message}\n`, 3);
      w.toast("Export error: " + e.message);
    }
  };
  win.onClick("btn_export", handleExportFile);
  win.onClick("btn_export_output", handleExportFile);

  // Preset Dataset Loader
  win.onClick("btn_load_sample", (w) => {
    const choice = w.getValue("dd_samples") || "";
    const preset = PRESET_DATASETS[choice];
    if (!preset) {
      w.toast("Please select a preset dataset from the dropdown first");
      return;
    }
    ensureCurrentStateRecorded();
    w.setText("dd_from", preset.format);
    w.setText("dd_to", preset.target);
    w.setText("txt_input_data", preset.data);
    recordNewState(`Load Preset: ${choice}`);
    convertData();
    w.appendConsole("dc_console", `[Preset] Loaded '${choice}' (${preset.description})\n`, 2);
    w.toast(`🎲 Loaded preset: ${choice}`);
  });

  // Beautify / Minify / Clear Input Helpers
  win.onClick("btn_beautify", (w) => {
    const input = w.getValue("txt_input_data") || "";
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      ensureCurrentStateRecorded();
      w.setText("txt_input_data", JSON.stringify(parsed, null, 2));
      recordNewState("Beautify JSON");
      convertData();
      w.toast("✨ Beautified JSON");
    } catch {
      // If not JSON, normalize CSV/TSV spaces
      ensureCurrentStateRecorded();
      const normalized = input
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .join("\n");
      w.setText("txt_input_data", normalized);
      recordNewState("Beautify Table Whitespace");
      convertData();
      w.toast("✨ Normalized whitespace");
    }
  });

  win.onClick("btn_minify", (w) => {
    const input = w.getValue("txt_input_data") || "";
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      ensureCurrentStateRecorded();
      w.setText("txt_input_data", JSON.stringify(parsed));
      recordNewState("Minify JSON");
      convertData();
      w.toast("⚡ Minified JSON");
    } catch {
      ensureCurrentStateRecorded();
      const minified = input.replace(/[ \t]+/g, " ");
      w.setText("txt_input_data", minified);
      recordNewState("Minify Whitespace");
      convertData();
      w.toast("⚡ Minified whitespace");
    }
  });

  win.onClick("btn_clear_input", (w) => {
    ensureCurrentStateRecorded();
    w.setText("txt_input_data", "");
    w.setText("txt_output_data", "");
    w.setTableData("tbl_preview", ["Columns"], [["(cleared)"]]);
    w.setText("lbl_input_stats", "Input: 0 lines · 0 chars · 0.0 KB");
    w.setText("lbl_output_stats", "Output: (empty) · 0ms");
    w.setText("lbl_grid_count", "Showing 0 records");
    w.setText("lbl_status", "Status: Cleared");
    recordNewState("Clear Input");
    w.toast("🧹 Cleared input document");
  });

  // Tabular Grid Search & Filter
  const filterGrid = (w: SimpleWindow) => {
    const query = (w.getValue("txt_grid_search") || "").toLowerCase().trim();
    if (!query) {
      w.setTableData("tbl_preview", currentHeaders, currentRows);
      w.setText("lbl_grid_count", `Showing ${currentRows.length} of ${currentRows.length} records (${currentHeaders.length} columns)`);
      return;
    }
    const filtered = currentRows.filter((r) => r.some((c) => c.toLowerCase().includes(query)));
    w.setTableData("tbl_preview", currentHeaders, filtered.length > 0 ? filtered : [["(no matches)"]]);
    w.setText("lbl_grid_count", `Showing ${filtered.length} of ${currentRows.length} records (query: "${query}")`);
    w.toast(`Filtered to ${filtered.length} matching rows`);
  };
  win.onClick("btn_filter_grid", filterGrid);
  win.onClick("btn_reset_grid", (w) => {
    w.setValue("txt_grid_search", "");
    w.setTableData("tbl_preview", currentHeaders, currentRows);
    w.setText("lbl_grid_count", `Showing ${currentRows.length} of ${currentRows.length} records (${currentHeaders.length} columns)`);
    w.toast("Reset preview grid");
  });

  // -----------------------------------------------------------------------------------------------
  // Client-Side Script Injection for Instant DOM Undo/Redo, Direct Paste & Shortcuts
  // -----------------------------------------------------------------------------------------------
  win.addScript(`
    (function() {
      const inputEl = document.getElementById("txt_input_data");
      const outputEl = document.getElementById("txt_output_data");
      const ddFrom = document.getElementById("dd_from");
      const ddTo = document.getElementById("dd_to");
      const btnConvert = document.getElementById("btn_convert");
      const btnUndo = document.getElementById("btn_undo");
      const btnRedo = document.getElementById("btn_redo");

      // 1. Client-Side Undo / Redo Memory Stack
      const clientUndo = [];
      const clientRedo = [];

      function recordClientSnapshot(action) {
        if (!inputEl) return;
        const text = inputEl.value;
        const fromVal = ddFrom ? ddFrom.value : "CSV";
        const toVal = ddTo ? ddTo.value : "JSON";
        if (clientUndo.length > 0) {
          const top = clientUndo[clientUndo.length - 1];
          if (top.text === text && top.fromVal === fromVal && top.toVal === toVal) return;
        }
        clientUndo.push({ text, fromVal, toVal, action: action || "Edit" });
        if (clientUndo.length > 100) clientUndo.shift();
        clientRedo.length = 0;
      }

      if (inputEl) {
        recordClientSnapshot("Initial Document");
        let inputDebounce = null;
        inputEl.addEventListener("input", function() {
          clearTimeout(inputDebounce);
          inputDebounce = setTimeout(function() {
            recordClientSnapshot("Type text");
            const fn = window.on_txt_input_data_change || window.txt_input_data_onChange;
            if (typeof fn === "function") {
              try { fn(inputEl.value); } catch(e) {}
            }
          }, 250);
        });
      }

      function performClientUndo() {
        if (clientUndo.length > 1) {
          const current = clientUndo.pop();
          clientRedo.push(current);
          const prev = clientUndo[clientUndo.length - 1];
          if (prev && inputEl) {
            inputEl.value = prev.text;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            if (ddFrom && prev.fromVal) {
              ddFrom.value = prev.fromVal;
              ddFrom.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (ddTo && prev.toVal) {
              ddTo.value = prev.toVal;
              ddTo.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (btnConvert) btnConvert.click();
            showNotice("↩️ Undone: " + current.action);
            return true;
          }
        }
        return false;
      }

      function performClientRedo() {
        if (clientRedo.length > 0) {
          const next = clientRedo.pop();
          clientUndo.push(next);
          if (next && inputEl) {
            inputEl.value = next.text;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            if (ddFrom && next.fromVal) {
              ddFrom.value = next.fromVal;
              ddFrom.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (ddTo && next.toVal) {
              ddTo.value = next.toVal;
              ddTo.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (btnConvert) btnConvert.click();
            showNotice("↪️ Redone: " + next.action);
            return true;
          }
        }
        return false;
      }

      if (btnUndo) {
        btnUndo.addEventListener("click", function(e) {
          performClientUndo();
        });
      }

      if (btnRedo) {
        btnRedo.addEventListener("click", function(e) {
          performClientRedo();
        });
      }

      // 2. Client-Side Copy to Clipboard Handlers
      function copyToClipboardClient(text, label) {
        if (!text) {
          showNotice("Text is empty");
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
              showNotice("📋 Copied " + text.length + " characters of " + label + " to clipboard!");
            }).catch(function() {
              execCommandCopy(text, label);
            });
            return;
          }
        } catch(e) {}
        execCommandCopy(text, label);
      }

      function execCommandCopy(text, label) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch(e) {}
        showNotice("📋 Copied " + text.length + " characters of " + label + " to clipboard!");
      }

      const btnCopyIn = document.getElementById("btn_copy_input");
      if (btnCopyIn) {
        btnCopyIn.addEventListener("click", function() {
          const text = inputEl ? inputEl.value : "";
          if (text) copyToClipboardClient(text, "source input");
        });
      }

      const btnCopyOut = document.getElementById("btn_copy_output");
      if (btnCopyOut) {
        btnCopyOut.addEventListener("click", function() {
          const text = outputEl ? outputEl.value : "";
          if (text) copyToClipboardClient(text, "transformed output");
        });
      }

      // 3. Client-Side Paste from Clipboard with Gesture Security Token
      async function performClientPaste() {
        let text = "";
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
          }
        } catch (err) {}

        if (text && inputEl) {
          recordClientSnapshot("Before Paste");
          inputEl.value = text;
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));

          const trimmed = text.trim();
          let detected = "";
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) detected = "JSON";
          else if (trimmed.startsWith("<") && trimmed.includes(">")) detected = "XML";
          else if (trimmed.startsWith("|") && trimmed.includes("\n|")) detected = "Markdown Table";
          else if (trimmed.includes("\t") && !trimmed.includes(",")) detected = "TSV";
          else if (trimmed.includes(",") && trimmed.includes("\n")) detected = "CSV";
          else if (trimmed.startsWith("- ") && trimmed.includes(":")) detected = "YAML";

          if (detected && ddFrom) {
            ddFrom.value = detected;
            ddFrom.dispatchEvent(new Event("change", { bubbles: true }));
          }

          recordClientSnapshot("Paste from Clipboard");
          if (btnConvert) btnConvert.click();
          showNotice("📋 Pasted " + text.length + " characters from clipboard!");
        }
      }

      const pasteBtns = document.querySelectorAll("#btn_paste, #btn_paste_from_clipboard");
      pasteBtns.forEach(function(b) {
        b.addEventListener("click", function() {
          performClientPaste();
        });
      });

      // 3. Drag and Drop File Loader
      window.addEventListener("dragover", function(e) {
        e.preventDefault();
        if (inputEl) inputEl.style.boxShadow = "0 0 0 2px var(--color-primary, #0ea5e9)";
      });
      window.addEventListener("dragleave", function(e) {
        if (inputEl) inputEl.style.boxShadow = "";
      });
      window.addEventListener("drop", function(e) {
        e.preventDefault();
        if (inputEl) inputEl.style.boxShadow = "";
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          const reader = new FileReader();
          reader.onload = function(evt) {
            const text = evt.target && evt.target.result;
            if (typeof text === "string" && inputEl) {
              recordClientSnapshot("Before File Drop");
              inputEl.value = text;
              inputEl.dispatchEvent(new Event("input", { bubbles: true }));
              
              const name = file.name.toLowerCase();
              let fmt = "CSV";
              if (name.endsWith(".json")) fmt = "JSON";
              else if (name.endsWith(".jsonl") || name.endsWith(".ndjson")) fmt = "JSON Lines (ndjson)";
              else if (name.endsWith(".tsv")) fmt = "TSV";
              else if (name.endsWith(".yaml") || name.endsWith(".yml")) fmt = "YAML";
              else if (name.endsWith(".toml")) fmt = "TOML";
              else if (name.endsWith(".xml")) fmt = "XML";
              else if (name.endsWith(".md")) fmt = "Markdown Table";

              if (ddFrom) {
                ddFrom.value = fmt;
                ddFrom.dispatchEvent(new Event("change", { bubbles: true }));
              }
              recordClientSnapshot("Import " + file.name);
              if (btnConvert) btnConvert.click();
              showNotice("📂 Loaded " + file.name);
            }
          };
          reader.readAsText(file);
        }
      });

      // 4. Keyboard Shortcuts: <kbd>Ctrl+Enter</kbd> (Convert), <kbd>Ctrl+Z</kbd> (Undo), <kbd>Ctrl+Y</kbd> (Redo)
      window.addEventListener("keydown", function(e) {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        if (isCtrlOrMeta && e.key === "Enter") {
          e.preventDefault();
          if (btnConvert) btnConvert.click();
        } else if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === "z") {
          e.preventDefault();
          performClientUndo();
        } else if (isCtrlOrMeta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
          e.preventDefault();
          performClientRedo();
        }
      });

      function showNotice(msg) {
        if (typeof window.showToast === "function") {
          window.showToast(msg);
        } else {
          const t = document.createElement("div");
          t.className = "rad-toast";
          t.textContent = msg;
          t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0284c7;color:#fff;padding:8px 16px;border-radius:6px;font-weight:600;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
          document.body.appendChild(t);
          setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 2000);
        }
      }
    })();
  `);

  return win;
}

export const createDataForgeStudio = createDataConvertStudio;

if (import.meta.main) {
  const win = createDataConvertStudio({ fullscreen: true });
  console.log("⚡ Launching Data Converter Studio Pro (Fullscreen)...");
  win.run();
}
