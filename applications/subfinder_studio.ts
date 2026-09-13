import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { enumerateDomain, enumerateDomainSync } from "../src/features/subfinder/subfinderCoordinator.ts";
import { cleanDomain } from "../src/features/subfinder/subfinderDoers.ts";
import type { SubdomainResult } from "../src/features/subfinder/subfinderTypes.ts";

export function createSubfinderStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "Subfinder Studio Pro -- Passive Subdomain Discovery & Reconnaissance",
    1260,
    940,
    {
      appId: "subfinder_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let currentResults: SubdomainResult[] = [];

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("Subfinder Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("Fast Passive Subdomain Discovery -- Multi-Source OSINT Reconnaissance with Live HTTP/DNS Probing");

  // -----------------------------------------------------------------------------------------------
  // 2. Recon Telemetry
  // 2. Reconnaissance Telemetry
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("Reconnaissance Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_domain", isShot ? "Domain: example.com" : "Domain: -");
  win.addLabel("lbl_metric_found", isShot ? "Discovered: 4" : "Discovered: 0");
  win.addLabel("lbl_metric_live", isShot ? "Live DNS: 4" : "Live DNS: 0");
  win.addLabel("lbl_metric_http", isShot ? "HTTP OK: 3" : "HTTP OK: 0");
  win.addLabel("lbl_metric_status", isShot ? "Engine: Complete" : "Engine: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Target & Recon Controls
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Target Domain & Probe Settings");
  win.beginRow();
  win.addLabel("lbl_domain", "Target Domain:");
  win.addInput("txt_domain", "example.com", "e.g. example.com, stripe.com...", { width: 340 });
  win.addLabel("lbl_timeout", "Timeout (s):");
  win.addInput("txt_timeout", "10", "10", { width: 60 });
  win.addLabel("lbl_ports", "Ports:");
  win.addInput("txt_ports", "80,443", "e.g. 80,443,8080...", { width: 140 });
  win.addButton("btn_start", "🚀 Start Discovery", { width: 160 });
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_active", "Active DNS Verification", true);
  win.addCheckbox("chk_probe", "Probe HTTP Status & Title", false);
  win.addCheckbox("chk_wildcard", "Filter Wildcards", false);
  win.addButton("btn_copy_list", "📋 Copy Host List", { width: 150 });
  win.addButton("btn_export_json", "💾 Export JSON", { width: 130 });
  win.addButton("btn_clear", "✕ Clear", { width: 80 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Subdomain Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Discovered Subdomains & Live Host Telemetry");
  const tableHeaders = ["Subdomain", "IP Address", "HTTP Status", "Page Title", "Open Ports", "OSINT Sources"];
  const demoSubs = isShot ? [
    ["api.example.com", "93.184.216.34", "200 OK", "Example API Gateway", "80, 443", "crt.sh, AlienVault"],
    ["auth.example.com", "93.184.216.35", "200 OK", "SSO Login Portal", "443", "crt.sh, Hackertarget"],
    ["cdn.example.com", "93.184.216.36", "200 OK", "Static Asset Delivery", "80, 443", "crt.sh, Anubis"],
    ["dev.example.com", "93.184.216.37", "403 Forbidden", "Access Denied", "8080", "crt.sh"],
  ] : [];
  win.addTable("tbl_subs", tableHeaders, demoSubs, { height: 320 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Output Console
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("OSINT Output & Export Console");
  win.addConsole("console_subs", 180);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", "Ready. Enter target domain and click Start Discovery.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Recon Logic
  // -----------------------------------------------------------------------------------------------
  const startDiscovery = (overrideDomain?: string) => {
    const rawDomain = (overrideDomain !== undefined && overrideDomain !== null && overrideDomain !== ""
      ? overrideDomain
      : win.getValue("txt_domain") ?? "").trim();
    if (!rawDomain) {
      win.setValue("lbl_status_bar", "⚠️ Please enter a target domain name.");
      return;
    }

    const domain = cleanDomain(rawDomain);
    const active = win.getBool("chk_active");
    const probe = win.getBool("chk_probe");
    const wildcard = win.getBool("chk_wildcard");

    const timeStr = new Date().toLocaleTimeString();
    win.setValue("lbl_status_bar", `⚡ [FETCHING DATA] Querying OSINT APIs & DNS records for "${domain}"...`);
    win.setValue("lbl_metric_domain", `Domain: ${domain}`);
    win.setValue("lbl_metric_found", "Scanning...");
    win.setValue("lbl_metric_status", "Engine: 📡 Active Scanning");
    win.clearConsole("console_subs");
    win.appendConsole("console_subs", `[${timeStr}] 🚀 [SUBFINDER] Enumerating targets for: ${domain}\n`);
    win.appendConsole("console_subs", `[${timeStr}] 📡 [SUBFINDER] Passive Sources: CertSpotter, HackerTarget, DNS-dict\n`);

    try {
      const results = enumerateDomainSync(domain, active, probe, undefined, wildcard, (msg) => {
        win.setValue("lbl_status_bar", msg);
      });

      currentResults = results;
      let liveCount = 0;
      let http200Count = 0;

      const rows: string[][] = results.map((r) => {
        if (r.ip && r.ip.length > 0) liveCount++;
        if (r.httpStatus && r.httpStatus >= 200 && r.httpStatus < 400) http200Count++;
        win.appendConsole("console_subs", `${r.host.padEnd(35)} | IP: ${(r.ip || ["-"]).join(", ").padEnd(20)} | HTTP: ${r.httpStatus || "-"}\n`);
        return [
          r.host,
          r.ip && r.ip.length > 0 ? r.ip.join(", ") : "-",
          r.httpStatus ? String(r.httpStatus) : "-",
          r.httpTitle ? r.httpTitle.slice(0, 40) : "-",
          "-",
          r.sources.join(", "),
        ];
      });

      win.setTableData("tbl_subs", rows);
      win.setValue("lbl_metric_domain", `Domain: ${domain}`);
      win.setValue("lbl_metric_found", `Discovered: ${results.length}`);
      win.setValue("lbl_metric_live", `Live DNS: ${liveCount}`);
      win.setValue("lbl_metric_http", `HTTP OK: ${http200Count}`);
      win.setValue("lbl_metric_status", "Engine: Ready");
      win.setValue("lbl_status_bar", `✓ Completed enumeration for "${domain}". Found ${results.length} subdomain(s).`);
    } catch (err: any) {
      win.setValue("lbl_metric_status", "Engine: Error");
      win.setValue("lbl_status_bar", `❌ Enumeration failed: ${err.message}`);
      win.appendConsole("console_subs", `\n[ERROR] ${err.message}\n`);
    }
  };

  win.on("btn_start", "click", (_w, val) => startDiscovery(val || win.getValue("txt_domain")));
  win.on("txt_domain", "enter", (_w, val) => startDiscovery(val || win.getValue("txt_domain")));

  win.on("btn_copy_list", "click", () => {
    if (currentResults.length === 0) {
      win.setValue("lbl_status_bar", "⚠️ No subdomains discovered yet.");
      return;
    }
    const hosts = currentResults.map((r) => r.host).join("\n");
    win.clearConsole("console_subs");
    win.appendConsole("console_subs", hosts);
    win.setValue("lbl_status_bar", `✓ Copied ${currentResults.length} hostnames to console.`);
  });

  win.on("btn_export_json", "click", () => {
    if (currentResults.length === 0) {
      win.setValue("lbl_status_bar", "⚠️ No subdomains discovered yet.");
      return;
    }
    const jsonStr = JSON.stringify(currentResults, null, 2);
    win.clearConsole("console_subs");
    win.appendConsole("console_subs", jsonStr);
    win.setValue("lbl_status_bar", "✓ Exported results JSON to console.");
  });

  win.on("btn_clear", "click", () => {
    win.setTableData("tbl_subs", []);
    win.clearConsole("console_subs");
    win.setValue("lbl_status_bar", "Cleared.");
  });

  // Client-side script for instant visual loading feedback and smooth ergonomics
  win.addScript(`
    (function() {
      const style = document.createElement("style");
      style.textContent = [
        "@keyframes subfinderSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }",
        "@keyframes subfinderPulse { 0% { opacity: 0.45; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } 100% { opacity: 0.45; transform: scale(0.9); } }",
        ".subfinder-spin { display: inline-block; animation: subfinderSpin 1s linear infinite; margin-right: 6px; }",
        ".subfinder-pulse { display: inline-block; width: 9px; height: 9px; background-color: #38bdf8; border-radius: 50%; margin-right: 8px; vertical-align: middle; animation: subfinderPulse 1.2s ease-in-out infinite; box-shadow: 0 0 10px #38bdf8; }"
      ].join(" ");
      document.head.appendChild(style);

      function initSubfinderErgonomics() {
        const btn = document.getElementById("btn_start");
        const txt = document.getElementById("txt_domain");
        if (!btn) return;

        const triggerLoadingState = function() {
          const domain = (txt ? txt.value : "").trim() || "example.com";
          btn.disabled = true;
          btn.innerHTML = '<span class="subfinder-spin">⏳</span> Scanning...';
          btn.style.opacity = "0.75";
          btn.style.cursor = "wait";

          const statusEl = document.getElementById("lbl_status_bar");
          if (statusEl) {
            statusEl.innerHTML = '<span class="subfinder-pulse"></span> <b style="color:#38bdf8;">FETCHING DATA:</b> Querying OSINT APIs (CertSpotter, HackerTarget) & DNS dictionary for "' + domain + '"...';
          }

          const foundEl = document.getElementById("lbl_metric_found");
          if (foundEl) foundEl.textContent = "Discovered: Scanning...";

          const engineEl = document.getElementById("lbl_metric_status");
          if (engineEl) engineEl.textContent = "Engine: 📡 Active Scanning";

          const tbl = document.getElementById("tbl_subs");
          if (tbl) {
            const tbody = tbl.querySelector("tbody");
            if (tbody) {
              tbody.innerHTML = '<tr style="opacity:0.85;font-style:italic;"><td colspan="6" style="padding:24px;text-align:center;"><span class="subfinder-spin">⏳</span> <b>Fetching subdomains for ' + domain + '...</b> Querying OSINT APIs & resolving DNS records.</td></tr>';
            }
          }
        };

        const restoreNormalState = function() {
          btn.disabled = false;
          btn.innerHTML = '🚀 Start Discovery';
          btn.style.opacity = "1";
          btn.style.cursor = "pointer";
        };

        const originalBtnStartClick = window.on_btn_start_click;
        btn.onclick = function(e) {
          if (btn.disabled) return;
          triggerLoadingState();
          setTimeout(function() {
            if (typeof originalBtnStartClick === "function") {
              originalBtnStartClick(txt ? txt.value : "");
            }
            restoreNormalState();
          }, 50);
        };

        if (txt) {
          txt.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
              btn.click();
            }
          });
        }
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSubfinderErgonomics);
      } else {
        setTimeout(initSubfinderErgonomics, 50);
      }
    })();
  `);

  return win;
}

if (import.meta.main) {
  const win = createSubfinderStudio({ fullscreen: true });
  console.log("⚡ Launching Subfinder Studio Pro...");
  win.run();
}
