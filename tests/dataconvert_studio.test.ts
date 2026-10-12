import { describe, it, expect } from "bun:test";
import { createDataConvertStudio } from "../applications/dataconvert_studio";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const trigger = async (win: any, buttonId: string) => {
  const handler = win.eventHandlersMap?.get(`${buttonId}:onclick`);
  if (!handler) throw new Error(`Handler not found for ${buttonId}:onclick`);
  await handler(win);
};

describe("🔄 Data Converter Studio Pro - Elite Feature Suite", () => {
  it("initializes complete interface with all elite editing controls", () => {
    const win = createDataConvertStudio({ fullscreen: false });
    expect(win).toBeDefined();

    const html = win.generateHtml();
    expect(html).toContain("Data Converter Studio Pro");

    // Elite editing buttons
    expect(html).toContain("btn_undo");
    expect(html).toContain("btn_redo");
    expect(html).toContain("btn_paste");
    expect(html).toContain("btn_select_all_input");
    expect(html).toContain("btn_select_all_output");
    expect(html).toContain("btn_copy_input");
    expect(html).toContain("btn_copy_output");
    expect(html).toContain("btn_import");
    expect(html).toContain("btn_export");

    // Helpers & Presets
    expect(html).toContain("btn_beautify");
    expect(html).toContain("btn_minify");
    expect(html).toContain("btn_clear_input");
    expect(html).toContain("dd_samples");
    expect(html).toContain("btn_load_sample");

    // Grid search & telemetry
    expect(html).toContain("txt_grid_search");
    expect(html).toContain("btn_filter_grid");
    expect(html).toContain("btn_reset_grid");
    expect(html).toContain("lbl_input_stats");
    expect(html).toContain("lbl_output_stats");
  });

  it("handles undo and redo history stack across edits", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Initial value
    const initialInput = win.getValue("txt_input_data") || "";
    expect(initialInput).toContain("Alice Smith");

    // Perform an action that mutates input (e.g. Load sample)
    win.setValue("dd_samples", "E-Commerce Orders (JSON)");
    await trigger(win, "btn_load_sample");
    const sampleInput = win.getValue("txt_input_data") || "";
    expect(sampleInput).toContain("Cyberdeck X1");

    // Trigger Undo
    await trigger(win, "btn_undo");
    const undoneInput = win.getValue("txt_input_data") || "";
    expect(undoneInput).toContain("Alice Smith");

    // Trigger Redo
    await trigger(win, "btn_redo");
    const redoneInput = win.getValue("txt_input_data") || "";
    expect(redoneInput).toContain("Cyberdeck X1");
  });

  it("supports copying input and output to clipboard", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Copy input
    let copiedText = "";
    (win as any).copyToClipboard = (text: string) => {
      copiedText = text;
    };

    await trigger(win, "btn_copy_input");
    expect(copiedText).toContain("Alice Smith");

    // Copy output
    await trigger(win, "btn_convert");
    await trigger(win, "btn_copy_output");
    expect(copiedText).toContain('"Alice Smith"');
  });

  it("supports selecting all in input and output via evalJS", async () => {
    const win = createDataConvertStudio({ fullscreen: false });
    let evaluatedJS = "";
    (win as any).evalJS = (code: string) => {
      evaluatedJS = code;
    };

    await trigger(win, "btn_select_all_input");
    expect(evaluatedJS).toContain("txt_input_data");
    expect(evaluatedJS).toContain(".select()");

    await trigger(win, "btn_select_all_output");
    expect(evaluatedJS).toContain("txt_output_data");
    expect(evaluatedJS).toContain(".select()");
  });

  it("simulates paste from clipboard with auto-detected format", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Mock clipboard text returning JSON
    const pastedJson = JSON.stringify([
      { id: 1, name: "Antigravity Agent", type: "AI Assistant" },
    ]);
    (win as any).getClipboardText = async () => pastedJson;

    await trigger(win, "btn_paste");

    expect(win.getValue("txt_input_data")).toBe(pastedJson);
    expect(win.getValue("dd_from")).toBe("JSON");

    // Output should automatically be converted
    const out = win.getValue("txt_output_data") || "";
    expect(out).toContain("Antigravity Agent");
  });

  it("simulates importing file with auto-detected extension", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Create a temporary TSV file
    const tempFile = join(process.cwd(), "test_import_sample.tsv");
    const tsvContent = "code\titem\tqty\nA101\tWidget\t50\nB202\tGadget\t25";
    writeFileSync(tempFile, tsvContent, "utf8");

    try {
      (win as any).openFileDialog = async () => tempFile;
      await trigger(win, "btn_import");

      expect(win.getValue("txt_input_data")).toBe(tsvContent);
      expect(win.getValue("dd_from")).toBe("TSV");

      const out = win.getValue("txt_output_data") || "";
      expect(out).toContain('"Widget"');
      expect(win.getValue("dc_console")).toContain("[Import]");
    } finally {
      unlinkSync(tempFile);
    }
  });

  it("clears, beautifies, and minifies inputs seamlessly", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Test JSON beautify & minify
    const unformatted = '{"a":1,"b":[2,3],"c":"test"}';
    win.setValue("txt_input_data", unformatted);
    win.setValue("dd_from", "JSON");

    await trigger(win, "btn_beautify");
    expect(win.getValue("txt_input_data")).toContain('  "a": 1');

    await trigger(win, "btn_minify");
    expect(win.getValue("txt_input_data")).toBe('{"a":1,"b":[2,3],"c":"test"}');

    // Test Clear Input
    await trigger(win, "btn_clear_input");
    expect(win.getValue("txt_input_data")).toBe("");
    expect(win.getValue("txt_output_data")).toBe("");
    expect(win.getValue("lbl_status")).toContain("Status: Cleared");

    // Test Undo restored cleared input
    await trigger(win, "btn_undo");
    expect(win.getValue("txt_input_data")).toBe('{"a":1,"b":[2,3],"c":"test"}');
  });

  it("loads diverse curated preset datasets", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // 1. E-Commerce Orders
    win.setValue("dd_samples", "E-Commerce Orders (JSON)");
    await trigger(win, "btn_load_sample");
    expect(win.getValue("dd_from")).toBe("JSON");
    expect(win.getValue("txt_input_data")).toContain("Cyberdeck X1");

    // 2. Server Access Logs
    win.setValue("dd_samples", "Server Access Logs (TSV)");
    await trigger(win, "btn_load_sample");
    expect(win.getValue("dd_from")).toBe("TSV");
    expect(win.getValue("txt_input_data")).toContain("/api/v1/telemetry");

    // 3. Financial Performance Metrics
    win.setValue("dd_samples", "Financial Performance Metrics (Markdown Table)");
    await trigger(win, "btn_load_sample");
    expect(win.getValue("dd_from")).toBe("Markdown Table");
    expect(win.getValue("txt_input_data")).toContain("Quarter");

    // 4. Product Catalog (XML)
    win.setValue("dd_samples", "Product Catalog (XML)");
    await trigger(win, "btn_load_sample");
    expect(win.getValue("dd_from")).toBe("XML");
    expect(win.getValue("txt_input_data")).toContain("<products>");
  });

  it("filters preview grid rows dynamically", async () => {
    const win = createDataConvertStudio({ fullscreen: false });
    win.setValue("dd_from", "CSV");
    win.setValue("dd_to", "JSON");
    await trigger(win, "btn_convert");

    // Filter to "Jones"
    win.setValue("txt_grid_search", "Jones");
    await trigger(win, "btn_filter_grid");
    const filteredRows = win.getValue("tbl_preview") as string[][];
    expect(filteredRows.length).toBe(1);
    expect(filteredRows[0][1]).toBe("Product Architect");

    // Reset grid
    await trigger(win, "btn_reset_grid");
    const resetRows = win.getValue("tbl_preview") as string[][];
    expect(resetRows.length).toBe(4);
  });

  it("converts across advanced formats: SQL INSERT, HTML Table, ndjson, TOML, XML, PHP, and Python", async () => {
    const win = createDataConvertStudio({ fullscreen: false });
    win.setValue("dd_from", "CSV");

    // 1. SQL INSERT Statements
    win.setValue("dd_to", "SQL INSERT Statements");
    await trigger(win, "btn_convert");
    const sqlOut = win.getValue("txt_output_data") || "";
    expect(sqlOut).toContain("INSERT INTO `converted_records`");
    expect(sqlOut).toContain("('Alice Smith'");

    // 2. HTML Table
    win.setValue("dd_to", "HTML Table");
    await trigger(win, "btn_convert");
    const htmlOut = win.getValue("txt_output_data") || "";
    expect(htmlOut).toContain('<table class="rad-data-table">');
    expect(htmlOut).toContain("<th>name</th>");
    expect(htmlOut).toContain("<td>Alice Smith</td>");

    // 3. JSON Lines (ndjson)
    win.setValue("dd_to", "JSON Lines (ndjson)");
    await trigger(win, "btn_convert");
    const ndjsonOut = win.getValue("txt_output_data") || "";
    expect(ndjsonOut.split("\n").length).toBe(4);
    expect(ndjsonOut).toContain('"name":"Alice Smith"');

    // 4. TOML
    win.setValue("dd_to", "TOML");
    await trigger(win, "btn_convert");
    const tomlOut = win.getValue("txt_output_data") || "";
    expect(tomlOut).toContain("[[records]]");
    expect(tomlOut).toContain('name = "Alice Smith"');

    // 5. XML
    win.setValue("dd_to", "XML");
    await trigger(win, "btn_convert");
    const xmlOut = win.getValue("txt_output_data") || "";
    expect(xmlOut).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlOut).toContain("<record>");
    expect(xmlOut).toContain("<name>Alice Smith</name>");

    // 6. PHP Array
    win.setValue("dd_to", "PHP Array");
    await trigger(win, "btn_convert");
    const phpOut = win.getValue("txt_output_data") || "";
    expect(phpOut).toContain("<?php");
    expect(phpOut).toContain('"name" => "Alice Smith"');

    // 7. Python Dict
    win.setValue("dd_to", "Python Dict");
    await trigger(win, "btn_convert");
    const pyOut = win.getValue("txt_output_data") || "";
    expect(pyOut).toContain("data = [");
    expect(pyOut).toContain('"name": "Alice Smith"');
  });

  it("handles malformed data gracefully without crashing", async () => {
    const win = createDataConvertStudio({ fullscreen: false });
    win.setValue("dd_from", "JSON");
    win.setValue("dd_to", "CSV");
    win.setValue("txt_input_data", "{ this is invalid json !!!");

    await trigger(win, "btn_convert");
    expect(win.getValue("dc_console")).toContain("[Convert Error]");
    expect(win.getValue("lbl_status")).toBeDefined();
  });
});
