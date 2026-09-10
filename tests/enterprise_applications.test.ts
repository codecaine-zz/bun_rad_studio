import { describe, it, expect } from "bun:test";
import { createDatabaseStudio, createSqliteStudio } from "../applications/database_studio";
import { createSystemStudio, createBunSystemStudio } from "../applications/system_studio";
import { createWatcherStudio, createWatchexecStudio } from "../applications/watcher_studio";
import { createJsonStudio, createJqStudio } from "../applications/json_studio";
import { createDevToolsStudio, createOmnitoolStudio } from "../applications/devtools_studio";
import { createProcessStudio, createTaskTracker } from "../applications/process_studio";
import { createApiStudio } from "../applications/api_studio";
import { createDataConvertStudio, createDataForgeStudio } from "../applications/dataconvert_studio";
import { createCryptoStudio } from "../applications/crypto_studio";
import { createRegexStudio } from "../applications/regex_studio";
import { createAppBundlerStudio } from "../applications/app_bundler_studio";
import { createNetworkStudio } from "../applications/network_studio";
import { createGitStudio } from "../applications/git_studio";
import { createMarkdownStudio } from "../applications/markdown_studio";
import { createColorStudio } from "../applications/color_studio";
import { createEnvStudio } from "../applications/env_studio";

describe("⚡ Enterprise 16-Application Suite Specification", () => {
  it("1. Database Studio Pro initializes with enterprise schema & query plans", () => {
    const win = createDatabaseStudio(":memory:");
    const html = win.generateHtml();
    expect(html).toContain("Database Studio Pro");
    expect(html).toContain("btn_explain");
    expect(html).toContain("btn_export_csv");
    expect(html).toContain("btn_export_inserts");
    expect(html).toContain("btn_seed");
    expect(win.getControls().length).toBeGreaterThan(15);
  });

  it("2. System & Package Workstation initializes with hardware telemetry", () => {
    const win = createSystemStudio();
    const html = win.generateHtml();
    expect(html).toContain("System & Package Workstation");
    expect(html).toContain("btn_telemetry");
    expect(html).toContain("btn_cache_info");
  });

  it("3. Task Watcher Studio initializes with fs.watch trigger pipeline", () => {
    const win = createWatcherStudio();
    const html = win.generateHtml();
    expect(html).toContain("Task Watcher Studio");
    expect(html).toContain("btn_start_watch");
    expect(html).toContain("txt_exec_cmd");
  });

  it("4. JSON Query Studio Pro initializes with native query engine", () => {
    const win = createJsonStudio();
    const html = win.generateHtml();
    expect(html).toContain("JSON Query Studio Pro");
    expect(html).toContain("btn_execute");
    expect(html).toContain("Bun Native Engine");
  });

  it("5. DevTools Studio Pro initializes all 6 developer tool engines", () => {
    const win = createDevToolsStudio();
    const html = win.generateHtml();
    expect(html).toContain("DevTools Studio Pro");
    expect(html).toContain("RG: Ready");
    expect(html).toContain("FD: Ready");
    expect(html).toContain("SD: Ready");
    expect(html).toContain("WATCHEXEC: Ready");
    expect(html).toContain("RIP: Ready");
    expect(html).toContain("JQ: Ready");
  });

  it("6. Process Monitor Studio initializes with Activity Monitor telemetry", () => {
    const win = createProcessStudio();
    const html = win.generateHtml();
    expect(html).toContain("Task Manager Pro");
    expect(html).toContain("btn_kill_term");
    expect(html).toContain("btn_kill_force");
  });

  it("7. API Studio Pro initializes with cURL generator & auth presets", () => {
    const win = createApiStudio();
    const html = win.generateHtml();
    expect(html).toContain("API Studio Pro");
    expect(html).toContain("btn_copy_curl");
    expect(html).toContain("btn_bench");
    expect(html).toContain("btn_export_resp");
  });

  it("8. Data Converter Studio Pro initializes with multi-format interop", () => {
    const win = createDataConvertStudio();
    const html = win.generateHtml();
    expect(html).toContain("Data Converter Studio Pro");
    expect(html).toContain("btn_convert");
    expect(html).toContain("btn_swap");
    expect(html).toContain("btn_export");
  });

  it("9. Crypto Studio Pro initializes with HMAC, JWT & entropy meter", () => {
    const win = createCryptoStudio();
    const html = win.generateHtml();
    expect(html).toContain("Crypto Studio Pro");
    expect(html).toContain("btn_decode_jwt");
    expect(html).toContain("btn_calc_hashes");
    expect(html).toContain("btn_entropy");
  });

  it("10. Regex Studio Pro initializes with code generator & pattern tester", () => {
    const win = createRegexStudio();
    const html = win.generateHtml();
    expect(html).toContain("Regex Studio Pro");
    expect(html).toContain("btn_gen_code");
    expect(html).toContain("btn_export_matches");
    expect(html).toContain("btn_replace");
  });

  it("11. App Bundler Studio Pro initializes with native bun compile target", () => {
    const win = createAppBundlerStudio();
    const html = win.generateHtml();
    expect(html).toContain("App Bundler Studio Pro");
    expect(html).toContain("btn_compile_binary");
    expect(html).toContain("btn_build_bundle");
  });

  it("12. Network Forensics Studio initializes with port scan & DNS tools", () => {
    const win = createNetworkStudio();
    const html = win.generateHtml();
    expect(html).toContain("Network Forensics Studio");
    expect(html).toContain("btn_scan_socket");
    expect(html).toContain("btn_scan_all");
    expect(html).toContain("btn_dns_a");
    expect(html).toContain("btn_ping_http");
  });

  it("13. Git Workbench Pro initializes with commit logs & diff viewer", () => {
    const win = createGitStudio();
    const html = win.generateHtml();
    expect(html).toContain("Git Workbench Pro");
    expect(html).toContain("btn_commit");
    expect(html).toContain("btn_view_diff");
    expect(html).toContain("btn_stage_all");
    expect(html).toContain("btn_stash");
  });

  it("14. Markdown Documentation Studio initializes with live HTML preview and interactive actions", () => {
    const win = createMarkdownStudio();
    const html = win.generateHtml();
    expect(html).toContain("Markdown Studio Pro");
    expect(html).toContain("btn_render");
    expect(html).toContain("btn_insert_table");
    expect(html).toContain("btn_insert_code");
    expect(html).toContain("btn_insert_alert");
    expect(html).toContain("btn_reset_doc");
    expect(html).toContain("btn_export_html");

    // Verify initial input and preview state
    expect(win.getValue("txt_md_input")).toContain("# Enterprise Systems Architecture Blueprint");
    expect(win.getValue("txt_md_preview")).toContain("<h1");
    expect(win.getValue("txt_md_preview")).toContain("<table");
    expect(win.getText("lbl_words")).toContain("Words:");

    // Test button: insert table
    const beforeTable = win.getValue("txt_md_input");
    const insertTableHandler = (win as any).eventHandlersMap.get("btn_insert_table:onclick");
    expect(insertTableHandler).toBeDefined();
    insertTableHandler(win);
    expect(win.getValue("txt_md_input")).toContain("Hardware Acceleration");
    expect(win.getValue("txt_md_input").length).toBeGreaterThan(beforeTable.length);

    // Test button: reset doc
    const resetHandler = (win as any).eventHandlersMap.get("btn_reset_doc:onclick");
    expect(resetHandler).toBeDefined();
    resetHandler(win);
    expect(win.getValue("txt_md_input")).toBe(beforeTable);

    // Test real-time onChange updates
    const changeHandler = (win as any).eventHandlersMap.get("txt_md_input:onchange");
    expect(changeHandler).toBeDefined();
    win.setValue("txt_md_input", "# Custom Title\n\n**Bold Text**\n\n- Item 1\n- Item 2");
    changeHandler(win);
    expect(win.getValue("txt_md_preview")).toContain("<h1");
    expect(win.getValue("txt_md_preview")).toContain("Custom Title");
    expect(win.getValue("txt_md_preview")).toContain("<strong style=\"color:#fff;\">Bold Text</strong>");
    expect(win.getValue("txt_md_preview")).toContain("<li");
  });

  it("15. Color & Design Token Studio initializes with WCAG contrast audit", () => {
    const win = createColorStudio();
    const html = win.generateHtml();
    expect(html).toContain("Color & Design Token Studio");
    expect(html).toContain("btn_analyze");
    expect(html).toContain("btn_palette_shades");
    expect(html).toContain("btn_export_css");
    expect(html).toContain("btn_export_tailwind");
  });

  it("16. Environment & Secret Vault Studio initializes with masking & diff", () => {
    const win = createEnvStudio();
    const html = win.generateHtml();
    expect(html).toContain("Environment & Secret Vault");
    expect(html).toContain("btn_validate");
    expect(html).toContain("btn_mask");
    expect(html).toContain("btn_diff");
    expect(html).toContain("btn_gen_example");
  });
});
