import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  performAllLookup,
  performDnsLookup,
  performDohLookup,
  formatJsonOutput,
  formatDoggoTable,
  isIpAddress,
} from "../src/features/doggo/doggoDoers.ts";
import type { DoggoResponse, DnsRecordType } from "../src/features/doggo/doggoTypes.ts";

export function createDoggoStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Doggo Studio Pro -- DNS Client for Humans & Resolution Diagnostics",
    1240,
    1040,
    {
      appId: "doggo_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let lastResponse: DoggoResponse | null = null;

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Doggo Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("DNS Client for Humans -- Standard Records, Custom Nameservers, DoH & Reverse PTR Lookups");

  // -----------------------------------------------------------------------------------------------
  // 2. Query Telemetry
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("DNS Resolution Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_target", isShot ? "Target: example.com" : "Target: -");
  win.addLabel("lbl_metric_type", isShot ? "Record: A / AAAA" : "Record: -");
  win.addLabel("lbl_metric_rtt", isShot ? "Query Latency: 42 ms" : "Query Latency: 0 ms");
  win.addLabel("lbl_metric_ns", isShot ? "Resolver: 1.1.1.1 (DoH)" : "Resolver: System");
  win.addLabel("lbl_metric_answers", isShot ? "Answers: 2" : "Answers: 0");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Query Configuration
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Query Parameters & Resolver Configuration");
  win.beginRow();
  win.addLabel("lbl_target", "Target Domain / IP:");
  win.addInput("txt_target", "example.com", "e.g. example.com, 8.8.8.8...", { width: 300 });
  win.addLabel("lbl_type", "Record Type:");
  win.addDropdown("dd_type", ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SOA", "CAA", "PTR", "SRV", "ALL (Parallel)"], "A", { width: 140 });
  win.addLabel("lbl_ns", "Nameserver:");
  win.addInput("txt_ns", "", "e.g. @1.1.1.1, @8.8.8.8...", { width: 180 });
  win.addButton("btn_query", "🔍 Query DNS", { width: 130 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_doh", "Use DNS-over-HTTPS (DoH)", false);
  win.addCheckbox("chk_reverse", "Reverse PTR Lookup (-x)", false);
  win.addLabel("lbl_doh_url", "DoH Endpoint:");
  win.addInput("txt_doh_url", "https://cloudflare-dns.com/dns-query", "DoH URL...", { width: 300 });
  win.addButton("btn_query_all", "⚡ Query All Records", { width: 170 });
  win.addButton("btn_export_json", "💾 Export JSON", { width: 120 });
  win.addButton("btn_clear", "✕ Clear", { width: 80 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. DNS Answer Records Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Resolved DNS Records (Answers)");
  const tableHeaders = ["Type", "Name", "TTL", "Address / Target Data", "Priority"];
  const demoRecords = isShot ? [
    ["A", "example.com", "300s", "93.184.216.34", "-"],
    ["AAAA", "example.com", "300s", "2606:2800:220:1:248:1893:25c8:1946", "-"],
  ] : [];
  win.addTable("tbl_records", tableHeaders, demoRecords, { height: 280 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Output Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Raw DNS Message Output");
  win.addConsole("console_doggo", 180);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Enter domain and record type to query DNS.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Resolution Logic
  // -----------------------------------------------------------------------------------------------
  const executeDnsQuery = async (forceAll = false) => {
    let target = win.getValue("txt_target")?.trim();
    if (!target) {
      win.setValue("lbl_status_bar", "⚠️ Please specify a target domain or IP.");
      return;
    }

    const typeSel = win.getValue("dd_type") || "A";
    const ns = win.getValue("txt_ns")?.trim() || undefined;
    const doh = win.getBool("chk_doh");
    const dohUrl = win.getValue("txt_doh_url")?.trim() || undefined;
    const reverse = win.getBool("chk_reverse") || isIpAddress(target);

    let queryType = forceAll ? "ALL" : typeSel.split(" ")[0] as DnsRecordType | "ALL";
    if (reverse && !forceAll) {
      queryType = "PTR";
    }

    win.setValue("lbl_status_bar", `Resolving ${queryType} for "${target}"...`);

    try {
      const resp: DoggoResponse = queryType === "ALL"
        ? await performAllLookup(target, ns, doh, dohUrl)
        : doh
          ? await performDohLookup(target, queryType, dohUrl)
          : await performDnsLookup(target, queryType, ns);

      lastResponse = resp;

      win.setValue("lbl_metric_target", `Target: ${resp.domain}`);
      win.setValue("lbl_metric_type", `Record: ${queryType}`);
      win.setValue("lbl_metric_rtt", `Query Latency: ${resp.queryTimeMs} ms`);
      win.setValue("lbl_metric_ns", `Resolver: ${resp.server || "System Default"}`);
      win.setValue("lbl_metric_answers", `Answers: ${resp.answers.length}`);

      const rows: string[][] = resp.answers.map((a) => [
        a.type,
        a.name,
        String(a.ttl ?? "-"),
        a.data,
        a.data.match(/^\d+\s/) ? a.data.split(" ")[0]! : "-",
      ]);

      win.setTableData("tbl_records", rows);

      win.clearConsole("console_doggo");
      win.appendConsole("console_doggo", formatDoggoTable(resp, true) + "\n");
      win.setValue("lbl_status_bar", `✓ Received ${resp.answers.length} answer(s) in ${resp.queryTimeMs} ms.`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ DNS Query Error: ${err.message}`);
      win.appendConsole("console_doggo", `[ERROR] ${err.message}\n`);
    }
  };

  win.on("btn_query", "click", () => executeDnsQuery(false));
  win.on("btn_query_all", "click", () => executeDnsQuery(true));
  win.on("txt_target", "enter", () => executeDnsQuery(false));
  win.on("txt_ns", "enter", () => executeDnsQuery(false));

  win.on("btn_export_json", "click", () => {
    if (!lastResponse) {
      win.setValue("lbl_status_bar", "⚠️ No DNS response to export.");
      return;
    }
    const jsonStr = formatJsonOutput(lastResponse);
    win.clearConsole("console_doggo");
    win.appendConsole("console_doggo", jsonStr);
    win.setValue("lbl_status_bar", "✓ Exported DNS response JSON to console.");
  });

  win.on("btn_clear", "click", () => {
    win.setValue("txt_target", "");
    win.setTableData("tbl_records", []);
    win.clearConsole("console_doggo");
    win.setValue("lbl_status_bar", "Cleared.");
  });
  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("DNS configuration saved.");
  });

  // Initial lookup
  setTimeout(() => void executeDnsQuery(false), 100);

  return win;
}

if (import.meta.main) {
  const win = createDoggoStudio({ fullscreen: true });
  console.log("⚡ Launching Doggo Studio Pro...");
  win.run();
}
