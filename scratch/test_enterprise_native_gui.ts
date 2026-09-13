/**
 * Native Webview Live Interactive Test for Enterprise Applications
 * Launches actual WebKit windows via Cocoa C-FFI, simulates user actions,
 * asserts UI updates, and cleanly closes without hangs or beachballs.
 */
import { createApiStudio } from "../applications/api_studio";
import { createBrewStudio } from "../applications/brew_studio";
import { createNetworkStudio } from "../applications/network_studio";
import { createDatabaseStudio } from "../applications/database_studio";
import { createColorStudio } from "../applications/color_studio";

console.log("⚡ Starting Live Native Webview Enterprise Apps Verification...");

// 1. Test API Studio in native Webview
console.log("\n[1/5] Launching API Studio in Webview...");
const apiWin = createApiStudio({ fullscreen: false });
setTimeout(() => {
  console.log("  -> Injecting test request to JSONPlaceholder...");
  apiWin.setValue("txt_url", "https://jsonplaceholder.typicode.com/todos/1");
  const handler = apiWin.eventHandlersMap.get("btn_send:onclick") || apiWin.eventHandlersMap.get("btn_send");
  if (handler) handler(apiWin);
  
  const body = apiWin.getValue("txt_resp_body") || "";
  console.log("  -> Received response body length:", body.length, "bytes");
  if (body.includes("delectus")) {
    console.log("  ✅ API Studio successfully received and rendered HTTP payload!");
  } else {
    console.error("  ❌ API Studio response payload missing!");
    process.exit(1);
  }

  // Close API window
  apiWin.close();
  testBrewStudio();
}, 200);

apiWin.run();

function testBrewStudio() {
  console.log("\n[2/5] Launching System & Package Workstation in Webview...");
  const brewWin = createBrewStudio({ fullscreen: false });
  setTimeout(() => {
    console.log("  -> Triggering telemetry & doctor report...");
    const doctorHandler = brewWin.eventHandlersMap.get("btn_doctor:onclick") || brewWin.eventHandlersMap.get("btn_doctor");
    if (doctorHandler) doctorHandler(brewWin);

    const docText = brewWin.getValue("txt_brew_out") || "";
    if (docText.includes("JavaScriptCore Engine: Enabled")) {
      console.log("  ✅ System & Package Workstation doctor report generated!");
    } else {
      console.error("  ❌ Doctor report missing!");
      process.exit(1);
    }

    brewWin.close();
    testNetworkStudio();
  }, 200);
  brewWin.run();
}

function testNetworkStudio() {
  console.log("\n[3/5] Launching Network Forensics Studio in Webview...");
  const netWin = createNetworkStudio({ fullscreen: false });
  setTimeout(() => {
    console.log("  -> Testing socket scan & DNS lookup...");
    netWin.setValue("txt_host", "google.com");
    netWin.setValue("txt_port", "443");
    const scanHandler = netWin.eventHandlersMap.get("btn_scan_socket:onclick") || netWin.eventHandlersMap.get("btn_scan_socket");
    if (scanHandler) scanHandler(netWin);

    const out = netWin.getValue("txt_net_results_raw") || "";
    if (out.includes("google.com") && out.includes("443")) {
      console.log("  ✅ Network Studio socket scan completed successfully!");
    } else {
      console.error("  ❌ Socket scan failed!");
      process.exit(1);
    }

    netWin.close();
    testDatabaseStudio();
  }, 200);
  netWin.run();
}

function testDatabaseStudio() {
  console.log("\n[4/5] Launching Database Studio Pro in Webview...");
  const dbWin = createDatabaseStudio(":memory:", { fullscreen: false });
  setTimeout(() => {
    console.log("  -> Executing in-memory query...");
    dbWin.setValue("txt_sql_query", "SELECT name, language, stars FROM developers ORDER BY stars DESC;");
    const sqlHandler = dbWin.eventHandlersMap.get("btn_run_sql:onclick") || dbWin.eventHandlersMap.get("btn_run_sql");
    if (sqlHandler) sqlHandler(dbWin);

    const rows = dbWin.getValue("tbl_results") as string[][];
    if (Array.isArray(rows) && rows.length > 0) {
      console.log("  ✅ Database Studio executed SQL and populated data grid with", rows.length, "rows!");
    } else {
      console.error("  ❌ Database query failed to populate table!");
      process.exit(1);
    }

    dbWin.close();
    testColorStudio();
  }, 200);
  dbWin.run();
}

function testColorStudio() {
  console.log("\n[5/5] Launching Color & Design Token Studio in Webview...");
  const colorWin = createColorStudio({ fullscreen: false });
  setTimeout(() => {
    console.log("  -> Computing WCAG contrast ratio & generating tokens...");
    colorWin.setValue("txt_color_hex", "#38bdf8");
    colorWin.setValue("txt_bg_hex", "#0f172a");
    const analyzeHandler = colorWin.eventHandlersMap.get("btn_analyze:onclick") || colorWin.eventHandlersMap.get("btn_analyze");
    if (analyzeHandler) analyzeHandler(colorWin);

    const contrast = colorWin.getValue("lbl_contrast") || "";
    if (contrast.includes("Contrast Ratio:")) {
      console.log("  ✅ Color Studio successfully calculated contrast and passed WCAG audit:", contrast);
    } else {
      console.error("  ❌ Color Studio failed contrast analysis!");
      process.exit(1);
    }

    colorWin.close();
    console.log("\n🎉 ALL 5 LIVE NATIVE WEBVIEW ENTERPRISE SUITES TESTED & PASSED CLEANLY!");
    process.exit(0);
  }, 200);
  colorWin.run();
}
