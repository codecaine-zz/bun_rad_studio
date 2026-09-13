import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  isCidr,
  resolveTargetToIp,
  fetchIpDetails,
  calculateSubnet,
  getLocalInterfaces,
  formatSummary,
  formatJson,
  formatCsv,
  formatSubnetInfo,
} from "../src/features/ipinfo/ipinfoDoers.ts";
import type { IpInfoResult, SubnetInfo, LocalInterfaceInfo } from "../src/features/ipinfo/ipinfoTypes.ts";

export function createIpInfoStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "IpInfo Studio Pro -- IP Address Geolocation, ASN & Subnet Forensics",
    1240,
    920,
    {
      appId: "ipinfo_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let lastResult: IpInfoResult | null = null;
  let lastSubnet: SubnetInfo | null = null;

  // -----------------------------------------------------------------------------------------------
  // 1. Header Toolbar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addHeading("IpInfo Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();
  win.addCaption("IP Geolocation & ASN Diagnostics -- Lookup Public IP, Subnet Ranges & Local Interfaces");

  // -----------------------------------------------------------------------------------------------
  // 2. Geolocation Telemetry
  // -----------------------------------------------------------------------------------------------
  const isShot = process.env.SCREENSHOT_MODE === "1";
  win.beginGroupBox("IP Geolocation Telemetry");
  win.beginRow();
  win.addLabel("lbl_metric_ip", isShot ? "Target IP: 8.8.8.8" : "Target IP: -");
  win.addLabel("lbl_metric_location", isShot ? "Location: Mountain View, California, US" : "Location: -");
  win.addLabel("lbl_metric_org", isShot ? "ASN / Org: AS15169 Google LLC" : "ASN / Org: -");
  win.addLabel("lbl_metric_timezone", isShot ? "Timezone: America/Los_Angeles" : "Timezone: -");
  win.addLabel("lbl_metric_status", isShot ? "Status: Resolved" : "Status: Ready");
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3. Search & Query Controls
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Query Target & Network Mode");
  win.beginRow();
  win.addLabel("lbl_target", "IP / Domain / CIDR:");
  win.addInput("txt_target", "8.8.8.8", "e.g. 1.1.1.1, github.com, 192.168.1.0/24...", { width: 340 });
  win.addLabel("lbl_token", "API Token:");
  win.addInput("txt_token", "", "Optional ipinfo.io token...", { width: 180 });
  win.addButton("btn_search", "🔍 Lookup Target", { width: 130 });
  win.addButton("btn_my_ip", "🌐 My Public IP", { width: 130 });
  win.endRow();

  win.beginRow();
  win.addButton("btn_calc_subnet", "🧮 CIDR Subnet Calculator", { width: 190 });
  win.addButton("btn_local_ifaces", "💻 Local Network Interfaces", { width: 200 });
  win.addButton("btn_copy_json", "💾 Copy JSON", { width: 120 });
  win.addButton("btn_copy_csv", "📋 Copy CSV", { width: 120 });
  win.addButton("btn_clear", "✕ Clear", { width: 80 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Detailed Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Network Properties & Forensic Metadata");
  const tableHeaders = ["Property", "Resolved Value", "Category", "Description"];
  const demoRows = isShot ? [
    ["IP Address", "8.8.8.8", "Network", "Public IPv4 Anycast Address"],
    ["Hostname", "dns.google", "DNS", "Reverse DNS PTR / Host Domain"],
    ["City", "Mountain View", "Geolocation", "Municipal city name"],
    ["Region", "California", "Geolocation", "State / Province"],
    ["Country", "US", "Geolocation", "Two-letter ISO country code"],
    ["Coordinates", "37.4056,-122.0775", "Geolocation", "Latitude & Longitude"],
    ["Organization / ASN", "AS15169 Google LLC", "Routing", "Autonomous System & ISP Provider"],
    ["Postal Code", "94043", "Geolocation", "Local postal zip code"],
    ["Timezone", "America/Los_Angeles", "Locale", "IANA Timezone identifier"],
  ] : [];
  win.addTable("tbl_details", tableHeaders, demoRows, { height: 260 });
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 5. Console & Raw JSON View
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Raw Forensic Output & Deep Links");
  win.addConsole("console_ipinfo", 200);
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 6. Status Bar
  // -----------------------------------------------------------------------------------------------
  win.beginRow();
  win.addLabel("lbl_status_bar", isShot ? "✓ Successfully resolved IP details for 8.8.8.8 (dns.google)." : "Ready. Enter an IP, domain, or CIDR block to begin.");
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Logic
  // -----------------------------------------------------------------------------------------------
  const lookupIpOrDomain = (targetOverride?: string) => {
    let rawTarget = (targetOverride !== undefined && targetOverride !== null && String(targetOverride).trim() !== ""
      ? String(targetOverride).trim()
      : (win.getValue("txt_target") ?? "").trim());
    const token = win.getValue("txt_token")?.trim() || undefined;

    if (!rawTarget) rawTarget = "myip";

    win.setValue("lbl_status_bar", `Resolving target: "${rawTarget}"...`);
    win.appendConsole("console_ipinfo", `[INFO] Resolving target: "${rawTarget}"...\n`);

    try {
      const resolved = resolveTargetToIp(rawTarget);
      const ip = resolved.ip;
      const data = fetchIpDetails(ip, token);

      lastResult = data;
      lastSubnet = null;

      // When resolving "myip", update the input field with the discovered public IP
      if ((rawTarget === "myip" || !rawTarget) && data.ip) {
        win.setValue("txt_target", data.ip);
      }

      win.setValue("lbl_metric_ip", `Target IP: ${data.ip || "-"}`);
      win.setValue("lbl_metric_location", `Location: ${[data.city, data.region, data.country].filter(Boolean).join(", ") || "-"}`);
      win.setValue("lbl_metric_org", `ASN / Org: ${data.org?.slice(0, 24) || "-"}`);
      win.setValue("lbl_metric_timezone", `Timezone: ${data.timezone || "-"}`);
      win.setValue("lbl_metric_status", "Status: Resolved");

      const rows: string[][] = [
        ["IP Address", data.ip || "-", "Network", "Public IPv4 or IPv6 Address"],
        ["Hostname", data.hostname || resolved.domain || "-", "DNS", "Reverse DNS PTR / Host Domain"],
        ["City", data.city || "-", "Geolocation", "Municipal city name"],
        ["Region", data.region || "-", "Geolocation", "State / Province"],
        ["Country", data.country || "-", "Geolocation", "Two-letter ISO country code"],
        ["Coordinates", data.loc || "-", "Geolocation", "Latitude & Longitude"],
        ["Organization / ASN", data.org || "-", "Routing", "Autonomous System & ISP Provider"],
        ["Postal Code", data.postal || "-", "Geolocation", "Local postal zip code"],
        ["Timezone", data.timezone || "-", "Locale", "IANA Timezone identifier"],
      ];

      if (data.loc) {
        rows.push(["Google Maps Link", `https://maps.google.com/?q=${data.loc}`, "Deep Link", "Clickable Map Location"]);
      }

      win.setTableData("tbl_details", rows);

      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatSummary(data) + "\n\n");
      win.appendConsole("console_ipinfo", "RAW JSON:\n" + formatJson(data) + "\n");

      win.setValue("lbl_status_bar", `✓ Successfully resolved IP details for ${data.ip} (${resolved.domain || data.hostname || "Host"}).`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Lookup error: ${err.message}`);
      win.appendConsole("console_ipinfo", `[ERROR] ${err.message}\n`);
    }
  };

  const calculateCidrRange = (targetOverride?: string) => {
    const raw = (targetOverride !== undefined && targetOverride !== null && String(targetOverride).trim() !== ""
      ? String(targetOverride).trim()
      : (win.getValue("txt_target") ?? "").trim());
    if (!raw || !isCidr(raw)) {
      win.setValue("lbl_status_bar", "⚠️ Target must be in CIDR notation (e.g. 192.168.1.0/24 or 10.0.0.0/16).");
      return;
    }

    try {
      const subnet = calculateSubnet(raw);
      lastSubnet = subnet;
      lastResult = null;

      win.setValue("lbl_metric_ip", `Network: ${subnet.network}`);
      win.setValue("lbl_metric_location", `Netmask: ${subnet.netmask}`);
      win.setValue("lbl_metric_org", `Usable Hosts: ${subnet.usableHosts.toLocaleString()}`);
      win.setValue("lbl_metric_timezone", `Broadcast: ${subnet.broadcast}`);
      win.setValue("lbl_metric_status", "Mode: CIDR Subnet");

      const rows: string[][] = [
        ["CIDR Block", subnet.cidr, "Subnet", "Target IPv4 prefix range"],
        ["Network Address", subnet.network, "Subnet", "Base subnet network address"],
        ["Broadcast Address", subnet.broadcast, "Subnet", "Subnet broadcast address"],
        ["Subnet Netmask", subnet.netmask, "Addressing", "Dotted decimal subnet mask"],
        ["Wildcard Mask", subnet.wildcard, "Addressing", "Inverted subnet mask"],
        ["First Usable Host", subnet.firstHost, "Host Range", "First assignable host IP"],
        ["Last Usable Host", subnet.lastHost, "Host Range", "Last assignable host IP"],
        ["Total Usable Hosts", subnet.usableHosts.toLocaleString(), "Capacity", "Assignable client host addresses"],
        ["Total Addresses", subnet.totalHosts.toLocaleString(), "Capacity", "Total mathematical IP block count"],
      ];

      win.setTableData("tbl_details", rows);
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatSubnetInfo(subnet) + "\n");
      win.setValue("lbl_status_bar", `✓ Calculated subnet ${subnet.cidr}: ${subnet.usableHosts.toLocaleString()} usable hosts.`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ CIDR Error: ${err.message}`);
    }
  };

  const showLocalInterfaces = () => {
    try {
      const ifaces = getLocalInterfaces();
      win.setValue("lbl_metric_ip", "Local Interfaces");
      win.setValue("lbl_metric_location", `${ifaces.length} adapters found`);
      win.setValue("lbl_metric_org", "Host Machine");
      win.setValue("lbl_metric_status", "Mode: Local Network");

      const rows: string[][] = ifaces.map((i) => [
        i.name,
        i.address,
        i.family,
        `${i.internal ? "Internal Loopback" : "Physical/Wi-Fi"} | MAC: ${i.mac || "-"} | Mask: ${i.netmask || "-"}`,
      ]);

      win.setTableData("tbl_details", rows);
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", "LOCAL NETWORK INTERFACES:\n");
      for (const i of ifaces) {
        win.appendConsole("console_ipinfo", `Adapter: ${i.name.padEnd(10)} | ${i.family.padEnd(4)} | Address: ${i.address.padEnd(20)} | MAC: ${i.mac}\n`);
      }
      win.setValue("lbl_status_bar", `✓ Displaying ${ifaces.length} local network interface(s).`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ Failed to inspect local interfaces: ${err.message}`);
    }
  };

  const handleSearch = (override?: string) => {
    let raw = (override !== undefined && override !== null && String(override).trim() !== ""
      ? String(override).trim()
      : (win.getValue("txt_target") ?? "").trim());
    if (!raw) raw = "myip";
    if (isCidr(raw)) {
      return calculateCidrRange(raw);
    } else {
      return lookupIpOrDomain(raw);
    }
  };

  win.on("btn_search", "click", (_w, val) => {
    const raw = (val && typeof val === "string" && val.trim()) ? val.trim() : (win.getValue("txt_target") || "").trim();
    return handleSearch(raw);
  });

  win.on("txt_target", "enter", (_w, val) => handleSearch(val));

  win.on("btn_my_ip", "click", () => {
    win.setValue("txt_target", "myip");
    return lookupIpOrDomain("myip");
  });

  win.on("btn_calc_subnet", "click", () => calculateCidrRange());
  win.on("btn_local_ifaces", "click", () => showLocalInterfaces());

  win.on("btn_copy_json", "click", () => {
    if (lastResult) {
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatJson(lastResult));
      win.setValue("lbl_status_bar", "✓ JSON details output to console.");
    } else if (lastSubnet) {
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", JSON.stringify(lastSubnet, null, 2));
      win.setValue("lbl_status_bar", "✓ Subnet JSON copied to console output.");
    } else {
      win.setValue("lbl_status_bar", "⚠️ No active IP result to export.");
    }
  });

  win.on("btn_copy_csv", "click", () => {
    if (lastResult) {
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatCsv(lastResult));
      win.setValue("lbl_status_bar", "✓ CSV formatted output in console.");
    } else {
      win.setValue("lbl_status_bar", "⚠️ No active IP result to export.");
    }
  });

  win.on("btn_clear", "click", () => {
    win.setValue("txt_target", "");
    win.setTableData("tbl_details", []);
    win.clearConsole("console_ipinfo");
    win.setValue("lbl_status_bar", "Cleared.");
  });

  // Client-side direct click binding that cancels native bubbling and double execution
  win.addScript(`
    (function() {
      const btnSearch = document.getElementById("btn_search");
      const btnMyIp = document.getElementById("btn_my_ip");
      const txtTarget = document.getElementById("txt_target");

      if (btnSearch && txtTarget) {
        btnSearch.onclick = function(e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const val = (txtTarget.value || "").trim();
          if (window.on_txt_target_change) window.on_txt_target_change(val);
          if (window.on_btn_search_click) window.on_btn_search_click(val);
          return false;
        };
      }

      if (btnMyIp) {
        btnMyIp.onclick = function(e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (txtTarget) txtTarget.value = "myip";
          if (window.on_txt_target_change) window.on_txt_target_change("myip");
          if (window.on_btn_my_ip_click) window.on_btn_my_ip_click("myip");
          return false;
        };
      }
    })();
  `);

  // Initial resolution
  setTimeout(() => lookupIpOrDomain("8.8.8.8"), 100);

  return win;
}

export { createIpInfoStudio as createIpinfoStudio };

if (import.meta.main) {
  const win = createIpInfoStudio({ fullscreen: true });
  console.log("⚡ Launching IpInfo Studio Pro...");
  win.run();
}
