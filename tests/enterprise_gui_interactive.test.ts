import { describe, it, expect } from "bun:test";
import { createApiStudio } from "../applications/api_studio";
import { createBunSystemStudio, createBrewStudio } from "../applications/brew_studio";
import { createNetworkStudio } from "../applications/network_studio";
import { createOmnitoolStudio, createDevToolsStudio } from "../applications/omnitool_studio";
import { createColorStudio } from "../applications/color_studio";
import { createCryptoStudio } from "../applications/crypto_studio";
import { createDatabaseStudio } from "../applications/database_studio";
import { createDataConvertStudio } from "../applications/dataconvert_studio";
import { createEnvStudio } from "../applications/env_studio";
import { createGitStudio } from "../applications/git_studio";
import { createJqStudio } from "../applications/jq_studio";
import { createMarkdownStudio } from "../applications/markdown_studio";
import { createRegexStudio } from "../applications/regex_studio";
import { createTaskTracker, createProcessStudio } from "../applications/task_manager";
import { createAppBundlerStudio } from "../applications/app_bundler_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, controlId: string, event = "click", val?: any) {
  const norm = event.startsWith("on") ? event.toLowerCase() : `on${event.toLowerCase()}`;
  const raw = event.toLowerCase();
  const handler =
    win.eventHandlersMap.get(`${controlId}:${norm}`) ||
    win.eventHandlersMap.get(`${controlId}:${raw}`) ||
    win.eventHandlersMap.get(`${controlId}`);
  if (!handler) {
    throw new Error(
      `Handler not found for control "${controlId}" (event: ${event}). Available: ${Array.from(
        win.eventHandlersMap.keys()
      ).join(", ")}`
    );
  }
  return await handler(win, val);
}

describe("⚡ Enterprise GUI Interactive Control & Verification Suite", () => {
  it("1. Controls API Studio Pro: dispatch, benchmark, curl copy, and presets", async () => {
    const win = createApiStudio({ fullscreen: false });

    // Test cURL copy generation
    win.setValue("txt_url", "https://jsonplaceholder.typicode.com/todos/1");
    win.setValue("dd_method", "GET");
    await trigger(win, "btn_copy_curl");
    expect(win.getValue("api_console")).toContain("curl -X GET");

    // Test synchronous request dispatch via curl
    await trigger(win, "btn_send");
    const respBody = win.getValue("txt_resp_body") || "";
    expect(respBody).toContain("userId");
    expect(respBody).toContain("delectus");
    expect(win.getValue("lbl_status")).toContain("200");
    expect(win.getValue("api_console")).toContain("[HTTP Response] 200 OK");

    // Test clear response
    await trigger(win, "btn_clear_resp");
    expect(win.getValue("txt_resp_body")).toBe("");

    // Test Benchmark firing 10 parallel requests
    await trigger(win, "btn_bench");
    expect(win.getValue("api_console")).toContain("[Benchmark Completed] 10 requests completed");

    // Test preset selection
    await trigger(win, "dd_presets", "change", "2. JSONPlaceholder Create (POST /posts)");
    expect(win.getValue("txt_url")).toContain("/posts");
    expect(win.getValue("dd_method")).toBe("POST");
  });

  it("2. Controls System & Package Workstation: telemetry, doctor, GC, and npm search", async () => {
    const win = createBrewStudio({ fullscreen: false });

    // Test telemetry refresh
    await trigger(win, "btn_telemetry");
    const report = win.getValue("txt_brew_out") || "";
    expect(report).toContain("=== Bun Native System Telemetry ===");
    expect(report).toContain("RSS (Resident Set):");
    expect(win.getValue("lbl_status")).toContain("Telemetry Refreshed");
    expect(win.getValue("brew_console")).toContain("[Telemetry] Retrieved full hardware");

    // Test Bun Doctor Diagnostics
    await trigger(win, "btn_doctor");
    const doctor = win.getValue("txt_brew_out") || "";
    expect(doctor).toContain("=== Bun Health & Diagnostics Report ===");
    expect(doctor).toContain("JavaScriptCore Engine: Enabled");
    expect(win.getValue("brew_console")).toContain("[Diagnostics] Generated Bun Health");

    // Test synchronous JSC Garbage Collector
    await trigger(win, "btn_gc");
    expect(win.getValue("brew_console")).toContain("[Garbage Collector]");

    // Test npm registry package info query via synchronous curl
    win.setValue("txt_pkg_name", "typescript");
    await trigger(win, "btn_info");
    const pkgInfo = win.getValue("txt_brew_out") || "";
    expect(pkgInfo).toContain("=== Package Info: typescript");
    expect(win.getValue("brew_console")).toContain("[Package Info] Retrieved metadata for typescript");
  });

  it("3. Controls Network Forensics Studio: socket scans, DNS audit, and HTTP probe", async () => {
    const win = createNetworkStudio({ fullscreen: false });

    // Test single port socket scan
    win.setValue("txt_host", "google.com");
    win.setValue("txt_port", "443");
    await trigger(win, "btn_scan_socket");
    expect(win.getValue("txt_net_results_raw")).toContain("[Socket Test Result]");
    expect(win.getValue("txt_net_results_raw")).toContain("Host:    google.com");
    expect(win.getValue("txt_net_results_raw")).toContain("Port:    443");
    expect(win.getValue("net_console")).toContain("[Scan Result] google.com:443 is OPEN");

    // Test DNS A record lookup
    await trigger(win, "btn_dns_a");
    expect(win.getValue("txt_net_results_raw")).toContain("DNS A RECORDS: google.com");
    expect(win.getValue("net_console")).toContain("[DNS Success] Retrieved A records");

    // Test HTTP probe
    await trigger(win, "btn_ping_http");
    expect(win.getValue("txt_net_results_raw")).toContain("[HTTP Probe Response]");
    expect(win.getValue("txt_net_results_raw")).toContain("Status Code:     200 OK");
    expect(win.getValue("net_console")).toContain("[HTTP Probe] 200 in");

    // Test Clear Diagnostics
    await trigger(win, "btn_clear_diag");
    expect(win.getValue("txt_net_results_raw")).toContain("[Output Cleared]");
  });

  it("4. Controls OmniTool Studio: Ripgrep, Fd, Sd, and JQ modes", async () => {
    const win = createOmnitoolStudio({ fullscreen: false });

    // Test Ripgrep file search
    win.setValue("dd_mode", "1. Ripgrep (rg) -- High-Speed Code Search");
    win.setValue("txt_pattern", "export function createOmnitoolStudio");
    win.setValue("txt_search_path", "./applications");
    await trigger(win, "btn_run_omni");
    expect(win.getValue("txt_results")).toContain("omnitool_studio.ts");
    expect(win.getValue("omni_console")).toContain("[Ripgrep Native]");

    // Test Fd file finder
    win.setValue("dd_mode", "2. Fd (fd) -- Lightning Fast File Finder");
    win.setValue("txt_pattern", "package\\.json");
    win.setValue("txt_search_path", ".");
    await trigger(win, "btn_run_omni");
    expect(win.getValue("txt_results")).toContain("package.json");
    expect(win.getValue("omni_console")).toContain("[Fd Native]");

    // Test Sd dry-run search & replace
    win.setValue("dd_mode", "3. Sd (sd) -- Safe Regex Find & Replace");
    win.setValue("txt_pattern", "version");
    win.setValue("txt_replace", "version_replaced");
    win.setValue("txt_search_path", "./package.json");
    win.setValue("chk_dry_run", true);
    await trigger(win, "btn_run_omni");
    expect(win.getValue("txt_results")).toContain("[DRY RUN PREVIEW]");
    expect(win.getValue("omni_console")).toContain("[Sd Native]");

    // Test JQ query mode
    win.setValue("dd_mode", "5. JQ (jq) -- High-Performance JSON Query Engine");
    win.setValue("txt_search_path", "./package.json");
    win.setValue("txt_pattern", ".name");
    await trigger(win, "btn_run_omni");
    expect(win.getValue("txt_results")).toContain("bun_rad_studio");
    expect(win.getValue("omni_console")).toContain("[JQ Native]");

    // Test Clear Results
    await trigger(win, "btn_clear_out");
    expect(win.getValue("txt_results")).toBe("");
  });

  it("5. Controls Color & Design Token Studio: contrast audit, shades, and tokens", async () => {
    const win = createColorStudio({ fullscreen: false });

    // Test color analysis & contrast ratio
    win.setValue("txt_color_hex", "#38bdf8");
    win.setValue("txt_bg_hex", "#0f172a");
    await trigger(win, "btn_analyze");
    expect(win.getValue("lbl_contrast")).toContain("Contrast Ratio:");
    expect(win.getValue("lbl_wcag_aa")).toContain("PASS");
    expect(win.getValue("color_console")).toContain("[Color Analysis]");

    // Test swap FG and BG
    await trigger(win, "btn_swap");
    expect(win.getValue("txt_color_hex")).toBe("#0f172a");
    expect(win.getValue("txt_bg_hex")).toBe("#38bdf8");

    // Test generate 50-950 shades
    await trigger(win, "btn_palette_shades");
    const shades = win.getValue("txt_tokens_output") || "";
    expect(shades).toContain("50:");
    expect(shades).toContain("500:");
    expect(shades).toContain("950:");
    expect(win.getValue("color_console")).toContain("[Palette Generator]");

    // Test export CSS variables
    await trigger(win, "btn_export_css");
    const css = win.getValue("txt_tokens_output") || "";
    expect(css).toContain(":root {");
    expect(css).toContain("--color-primary:");

    // Test export TypeScript constants
    await trigger(win, "btn_export_ts");
    const ts = win.getValue("txt_tokens_output") || "";
    expect(ts).toContain("export const ThemeTokens =");
  });

  it("6. Controls Crypto Studio Pro: hashes, AES encryption, entropy, and UUID", async () => {
    const win = createCryptoStudio({ fullscreen: false });

    // Test calculating hashes
    win.setValue("txt_hash_input", "Enterprise Bun RAD Studio");
    win.setValue("txt_hmac_key", "secret-test-key");
    await trigger(win, "btn_calc_hashes");
    const hashes = win.getValue("tbl_hashes") as string[][];
    expect(Array.isArray(hashes)).toBe(true);
    expect(hashes.length).toBe(5);
    expect(hashes.some(r => r[0] === "SHA-256")).toBe(true);
    expect(hashes.some(r => r[0] === "HMAC-SHA256")).toBe(true);
    expect(win.getValue("crypto_console")).toContain("[Hashes] Computed SHA-256/512");

    // Test AES-256 encryption & decryption
    win.setValue("txt_passphrase", "SecurePassphrase123!");
    await trigger(win, "btn_encrypt");
    const ciphertext = win.getValue("txt_cipher_text") || "";
    expect(ciphertext.length).toBeGreaterThan(10);
    expect(win.getValue("crypto_console")).toContain("[AES-256] Encrypted payload");

    // Decrypt back
    win.setValue("txt_hash_input", "");
    await trigger(win, "btn_decrypt");
    expect(win.getValue("txt_hash_input")).toBe("Enterprise Bun RAD Studio");

    // Test password entropy calculation
    await trigger(win, "btn_entropy");
    expect(win.getValue("lbl_entropy_out")).toContain("Entropy: ~");

    // Test UUID generation
    await trigger(win, "btn_gen_uuid");
    expect(win.getValue("lbl_token_out")).toContain("UUID:");

    // Test 32-byte hex key generation
    await trigger(win, "btn_gen_hex32");
    expect(win.getValue("lbl_token_out")).toContain("Hex Key:");
  });

  it("7. Controls Database Studio Pro: SQL query execution, schemas, and mutation logging", async () => {
    const win = createDatabaseStudio(":memory:", { fullscreen: false });

    // Test initial table results
    const initialRows = win.getValue("tbl_results") as string[][];
    expect(Array.isArray(initialRows)).toBe(true);
    expect(initialRows.length).toBeGreaterThanOrEqual(1);

    // Test executing custom SELECT query
    win.setValue("txt_sql_query", "SELECT name, language, stars FROM developers WHERE stars > 80000;");
    await trigger(win, "btn_run_sql");
    const queryRows = win.getValue("tbl_results") as string[][];
    expect(Array.isArray(queryRows)).toBe(true);
    expect(queryRows.length).toBeGreaterThanOrEqual(3);
    expect(win.getValue("sql_console")).toContain("[Success]");
    expect(win.getValue("lbl_status")).toContain("OK");

    // Test preset query
    await trigger(win, "dd_sql_presets", "change", "Department Salary Averages (Aggregates)");
    expect(win.getValue("txt_sql_query")).toContain("GROUP BY department");

    // Test clear query
    await trigger(win, "btn_clear_query");
    expect(win.getValue("txt_sql_query")).toBe("");
  });

  it("8. Controls Data Converter Studio Pro: CSV, JSON, Markdown, YAML, and TSV", async () => {
    const win = createDataConvertStudio({ fullscreen: false });

    // Test CSV to JSON conversion
    win.setValue("dd_from", "CSV");
    win.setValue("dd_to", "JSON");
    await trigger(win, "btn_convert");
    const jsonOut = win.getValue("txt_output_data") || "";
    expect(jsonOut).toContain('"name": "Alice Smith"');
    expect(win.getValue("dc_console")).toContain("[Convert OK]");

    // Test CSV to Markdown Table
    win.setValue("dd_to", "Markdown Table");
    await trigger(win, "btn_convert");
    const mdOut = win.getValue("txt_output_data") || "";
    expect(mdOut).toContain("| name | role | department | salary |");
    expect(mdOut).toContain("| --- | --- | --- | --- |");

    // Test CSV to YAML
    win.setValue("dd_to", "YAML");
    await trigger(win, "btn_convert");
    const yamlOut = win.getValue("txt_output_data") || "";
    expect(yamlOut).toContain("-");
    expect(yamlOut).toContain('name: "Alice Smith"');

    // Test Format Swap
    await trigger(win, "btn_swap");
    expect(win.getValue("dd_from")).toBe("CSV");
  });

  it("9. Controls Environment & Secret Vault Studio: validation, masking, and diff", async () => {
    const win = createEnvStudio({ fullscreen: false });

    // Test validate environment
    await trigger(win, "btn_validate");
    expect(win.getValue("lbl_total_vars")).toContain("Total Variables:");
    expect(win.getValue("lbl_duplicates")).toContain("0 (Clean)");
    expect(win.getValue("lbl_syntax")).toContain("Valid");
    expect(win.getValue("env_console")).toContain("[Audit Passed]");

    // Test mask secrets
    await trigger(win, "btn_mask");
    const masked = win.getValue("txt_env_active") || "";
    expect(masked).toContain("••••••••••••••••");
    expect(win.getValue("env_console")).toContain("[Vault] Sensitive keys masked for display");

    // Test unmask secrets
    await trigger(win, "btn_unmask");
    const unmasked = win.getValue("txt_env_active") || "";
    expect(unmasked).not.toContain("••••••••••••••••");

    // Test generate .env.example
    await trigger(win, "btn_gen_example");
    const example = win.getValue("txt_env_compare") || "";
    expect(example).toContain("# Generated .env.example Template");
    expect(example).toContain("PORT=3000");
  });

  it("10. Controls Git Workbench Pro: status refresh, commit logs, and diff viewer", async () => {
    const win = createGitStudio({ fullscreen: false });

    // Test repository status refresh
    await trigger(win, "btn_refresh");
    expect(win.getValue("lbl_branch")).toContain("Branch:");
    expect(win.getValue("lbl_head")).toContain("HEAD:");
    expect(win.getValue("git_console")).toContain("[Git Refresh] Repository telemetry updated");

    // Test commit history table
    const commits = win.getValue("tbl_commits") as string[][];
    expect(Array.isArray(commits)).toBe(true);
    expect(commits.length).toBeGreaterThanOrEqual(1);

    // Test View Diff
    await trigger(win, "btn_view_diff");
    expect(win.getValue("git_console")).toContain("[git diff] Loaded working tree diff");
  });

  it("11. Controls JSON Query (JQ) Studio Pro: evaluation, sample reset, and error handling", async () => {
    const win = createJqStudio({ fullscreen: false });

    // Test evaluating top-level field
    win.setValue("txt_filter", ".project");
    await trigger(win, "btn_execute");
    expect(win.getValue("txt_output_json")).toContain("Bun RAD Studio");
    expect(win.getValue("jq_console")).toContain("[Bun Native Engine] Evaluated '.project'");

    // Test nested query
    win.setValue("txt_filter", ".author.name");
    await trigger(win, "btn_execute");
    expect(win.getValue("txt_output_json")).toContain("Alex");

    // Test array property
    win.setValue("txt_filter", ".modules[0].name");
    await trigger(win, "btn_execute");
    expect(win.getValue("txt_output_json")).toContain("simplegui");

    // Test reset sample JSON
    await trigger(win, "btn_reset_sample");
    expect(win.getValue("txt_filter")).toBe(".");
    expect(win.getValue("txt_input_json")).toContain("Bun RAD Studio");
  });

  it("12. Controls Markdown Studio Pro: live render, stats, and snippet insertion", async () => {
    const win = createMarkdownStudio({ fullscreen: false });

    // Test live document rendering
    win.setValue("txt_md_input", "# Enterprise Document\n\nThis is a **high-performance** technical guide.");
    await trigger(win, "btn_render");
    expect(win.getValue("lbl_words")).toContain("Words: 9");
    expect(win.getValue("lbl_lines")).toContain("Lines: 3");
    expect(win.getValue("md_console")).toContain("[Markdown Render] Parsed 9 words");

    // Test insert table snippet
    await trigger(win, "btn_insert_table");
    expect(win.getValue("txt_md_input")).toContain("| Feature | Tier 1 | Tier 2 | Status |");

    // Test insert code block
    await trigger(win, "btn_insert_code");
    expect(win.getValue("txt_md_input")).toContain("```typescript");

    // Test reset template
    await trigger(win, "btn_reset_doc");
    expect(win.getValue("txt_md_input")).toContain("# Enterprise Systems Architecture Blueprint");
  });

  it("13. Controls Regex Studio Pro: pattern evaluation, replacement, and code generation", async () => {
    const win = createRegexStudio({ fullscreen: false });

    // Test regex testing with capture groups
    win.setValue("txt_pattern", "([A-Za-z]+)\\s+(\\d+)");
    win.setValue("txt_corpus", "Server 404, Worker 200, Database 500");
    await trigger(win, "btn_test");
    const matches = win.getValue("tbl_matches") as string[][];
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBe(3);
    expect(matches[0][1]).toBe("Server 404");
    expect(win.getValue("regex_console")).toContain("[RegEx Studio] Evaluated");

    // Test regex replacement preview
    win.setValue("txt_subst", "$1_OK");
    await trigger(win, "btn_replace");
    expect(win.getValue("regex_console")).toContain("[Substitution Preview]:\nServer_OK");

    // Test TypeScript code generator
    await trigger(win, "btn_gen_code");
    expect(win.getValue("regex_console")).toContain("// TypeScript / Bun RegExp");
  });

  it("14. Controls Task Manager Studio: categorization, search filter, and process selection", async () => {
    const win = createTaskTracker({ fullscreen: false });

    // Test process list refresh
    await trigger(win, "btn_refresh");
    const procs = win.getValue("tbl_procs") as string[][];
    expect(Array.isArray(procs)).toBe(true);
    expect(procs.length).toBeGreaterThanOrEqual(1);
    expect(win.getValue("lbl_status")).toContain("Monitoring");

    // Test Category filter: User Applications
    await trigger(win, "btn_cat_user");
    expect(win.getValue("task_console")).toContain("User Applications");

    // Test Category filter: CPU
    await trigger(win, "btn_cat_cpu");
    expect(win.getValue("task_console")).toContain("High CPU Processes");

    // Test Category filter: All
    await trigger(win, "btn_cat_all");
    expect(win.getValue("task_console")).toContain("All Processes");

    // Test filter search
    win.setValue("txt_filter", "bun");
    await trigger(win, "btn_apply_filter");
    expect(win.getValue("task_console")).toContain("Searching for 'bun'");

    // Test clear filter
    await trigger(win, "btn_clear_filter");
    expect(win.getValue("txt_filter")).toBe("");

    // Test process selection in table
    const firstPid = procs[0][0];
    await trigger(win, "sel_proc_ipc", "change", firstPid);
    expect(win.getValue("txt_target_pid")).toBe(firstPid);
  });

  it("15. Controls App Bundler Studio: rescan apps, preset loading, and compile validation", async () => {
    const win = createAppBundlerStudio({ fullscreen: false });

    // Test application rescanning
    await trigger(win, "btn_rescan");
    expect(win.getValue("bundler_console")).toContain("[Scanner] Rescanned ./applications/");

    // Test form values
    expect(win.getValue("txt_app_name")).toBe("DevToolsStudio");
    expect(win.getValue("txt_version")).toBe("1.0.0");
    expect(win.getValue("lbl_status")).toContain("Status: Ready");

    // Test non-existent entry point validation
    win.setValue("txt_exec_path", "./non_existent_file_xyz.ts");
    await trigger(win, "btn_compile_binary");
    expect(win.getValue("bundler_console")).toContain("[Compiler Error] Entry script does not exist");
  });
});
