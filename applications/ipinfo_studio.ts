import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import {
  isCidr,
  isIpAddress,
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
import {
  parseTargets,
  bulkLookup,
  bulkToTableRows,
  bulkToCsv,
  tableToTsv,
  tableToCsv,
  BULK_HEADERS,
  MAX_BULK_TARGETS,
  cidrContains,
  splitCidr,
  describeIpv4,
  prefixToMask,
  maskToPrefix,
  isValidCidr,
  pushHistory,
  ipInfoUrl,
  bgpUrl,
  type BulkRow,
  type HistoryEntry,
} from "../src/features/ipinfo/ipinfoTools.ts";
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";

export function createIpInfoStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow(
    "IpInfo Studio Pro -- IP Address Geolocation, ASN & Subnet Forensics",
    1240,
    1000,
    {
      appId: "ipinfo_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    }
  );

  let lastResult: IpInfoResult | null = {
    ip: "8.8.8.8",
    hostname: "dns.google",
    city: "Mountain View",
    region: "California",
    country: "US",
    loc: "37.4056,-122.0775",
    org: "AS15169 Google LLC",
    postal: "94043",
    timezone: "America/Los_Angeles",
  };
  let lastSubnet: SubnetInfo | null = null;
  let lastBulk: BulkRow[] | null = null;
  let lastTable: { headers: string[]; rows: string[][] } | null = null;
  let history: HistoryEntry[] = [];

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
  win.addButton("btn_open_map", "🗺️ Open in Google Maps", { width: 190 });
  win.addButton("btn_copy_json", "💾 Copy JSON", { width: 120 });
  win.addButton("btn_copy_csv", "📋 Copy CSV", { width: 120 });
  win.addButton("btn_clear", "✕ Clear", { width: 80 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 3b. Productivity Toolkit
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Productivity Toolkit");
  win.addLabel("lbl_bulk", `Bulk lookup: one IP or domain per line (max ${MAX_BULK_TARGETS}, # for comments)`);
  win.addTextarea("txt_bulk", "", "8.8.8.8\n1.1.1.1\ngithub.com");
  win.beginRow();
  win.addButton("btn_bulk_load", "📄 Load List...", { width: 130 });
  win.addButton("btn_bulk_run", "⚡ Bulk Lookup", { width: 130 });
  win.addButton("btn_copy_ip", "📋 Copy IP", { width: 110 });
  win.addButton("btn_copy_table", "📋 Copy Table", { width: 120 });
  win.addButton("btn_save_results", "💾 Save Results...", { width: 150 });
  win.addButton("btn_open_ipinfo", "🌐 ipinfo.io Page", { width: 150 });
  win.addButton("btn_open_bgp", "🛰️ BGP / ASN Page", { width: 150 });
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_check_ip", "Test IP:");
  win.addInput("txt_check_ip", "", "e.g. 192.168.1.77", { width: 170 });
  win.addButton("btn_in_cidr", "✔ Is IP in Target CIDR?", { width: 190 });
  win.addLabel("lbl_split", "Split into /");
  win.addInput("txt_split_prefix", "26", "", { width: 60 });
  win.addButton("btn_split_cidr", "✂ Split CIDR", { width: 120 });
  win.addButton("btn_ip_formats", "🔢 IP Formats", { width: 120 });
  win.addButton("btn_mask_convert", "🎭 Mask ⇄ Prefix", { width: 140 });
  win.endRow();
  win.endGroupBox();

  // -----------------------------------------------------------------------------------------------
  // 4. Detailed Results Table
  // -----------------------------------------------------------------------------------------------
  win.beginGroupBox("Network Properties & Forensic Metadata");
  const tableHeaders = ["Property", "Resolved Value", "Category", "Description"];
  const defaultRows: string[][] = [
    ["IP Address", "8.8.8.8", "Network", "Public IPv4 Anycast Address"],
    ["Hostname", "dns.google", "DNS", "Reverse DNS PTR / Host Domain"],
    ["City", "Mountain View", "Geolocation", "Municipal city name"],
    ["Region", "California", "Geolocation", "State / Province"],
    ["Country", "US", "Geolocation", "Two-letter ISO country code"],
    ["Coordinates", "37.4056,-122.0775", "Geolocation", "Latitude & Longitude"],
    ["Organization / ASN", "AS15169 Google LLC", "Routing", "Autonomous System & ISP Provider"],
    ["Postal Code", "94043", "Geolocation", "Local postal zip code"],
    ["Timezone", "America/Los_Angeles", "Locale", "IANA Timezone identifier"],
    ["Google Maps Link", "https://maps.google.com/?q=37.4056,-122.0775", "Deep Link", "Clickable Map Location"],
  ];
  win.addTable("tbl_details", tableHeaders, defaultRows, { height: 260 });
  win.endGroupBox();

  win.beginGroupBox("Recent Lookups (click a row to repeat)");
  win.addTable("tbl_history", ["Target", "Result", "Time"], [], { height: 130 });
  win.beginRow();
  win.addButton("btn_clear_history", "Clear History", { width: 130 });
  win.endRow();
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

  let currentInterfaces: LocalInterfaceInfo[] = [];

  // -----------------------------------------------------------------------------------------------
  // Logic
  // -----------------------------------------------------------------------------------------------
  const showTable = (headers: string[], rows?: string[][]) => {
    if (rows) {
      win.setTableData("tbl_details", headers, rows);
      lastTable = { headers, rows };
    } else {
      win.setTableData("tbl_details", headers);
      lastTable = null;
    }
  };

  const nowStamp = () => new Date().toLocaleTimeString();
  const recordHistory = (target: string, summary: string) => {
    history = pushHistory(history, { target, summary, time: nowStamp() });
    win.setTableData("tbl_history", ["Target", "Result", "Time"], history.map((h) => [h.target, h.summary, h.time]));
  };
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
      currentInterfaces = [];

      // When resolving "myip", update the input field with the discovered public IP
      if ((rawTarget === "myip" || !rawTarget) && data.ip) {
        win.setValue("txt_target", data.ip);
      } else if (rawTarget !== win.getValue("txt_target")) {
        win.setValue("txt_target", rawTarget);
      }

      win.setValue("lbl_metric_ip", `Target IP: ${data.ip || "-"}`);
      win.setValue("lbl_metric_location", `Location: ${[data.city, data.region, data.country].filter(Boolean).join(", ") || "-"}`);
      win.setValue("lbl_metric_org", `ASN / Org: ${data.org?.slice(0, 24) || "-"}`);
      win.setValue("lbl_metric_timezone", `Timezone: ${data.timezone || "-"}`);
      win.setValue("lbl_metric_status", "Status: Resolved");

      const ipHeaders = ["Property", "Resolved Value", "Category", "Description"];
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

      if (data.loc && data.loc !== "0,0") {
        rows.push(["Google Maps Link", `https://maps.google.com/?q=${data.loc}`, "Deep Link", "Clickable Map Location"]);
      }

      showTable(ipHeaders, rows);

      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatSummary(data) + "\n\n");
      win.appendConsole("console_ipinfo", "RAW JSON:\n" + formatJson(data) + "\n");

      win.setValue("lbl_status_bar", `✓ Successfully resolved IP details for ${data.ip} (${resolved.domain || data.hostname || "Host"}).`);
      lastBulk = null;
      recordHistory(rawTarget, [data.ip, [data.city, data.country].filter(Boolean).join(", ")].filter(Boolean).join(" · "));
    } catch (err: any) {
      lastResult = null;
      lastSubnet = null;

      win.setValue("lbl_metric_ip", `Target: ${rawTarget}`);
      win.setValue("lbl_metric_location", "Unresolved");
      win.setValue("lbl_metric_org", "Lookup Failed");
      win.setValue("lbl_metric_timezone", "-");
      win.setValue("lbl_metric_status", "Status: Error");

      const errorHeaders = ["Diagnostic Property", "Diagnostic Details", "Status", "Resolution Guidance"];
      const errorRows: string[][] = [
        ["Target Query", rawTarget, "Failed", "Verify domain name spelling, IP address format, or CIDR notation"],
        ["Error Detail", err.message || "Failed to resolve target", "Error", "Target could not be resolved by DNS or upstream providers"],
        ["Query Type", isCidr(rawTarget) ? "CIDR Subnet" : "IP / Hostname", "Analysis", "Supported: IPv4, IPv6, Domain, CIDR block, or interface name"],
        ["Action", "Retry with valid target", "Guidance", "e.g. 1.1.1.1, 8.8.8.8, 192.168.1.1, github.com, or en0"],
      ];
      showTable(errorHeaders, errorRows);

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

      const subnetHeaders = ["Property", "Subnet Value", "Category", "Description"];
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

      showTable(subnetHeaders, rows);
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatSubnetInfo(subnet) + "\n");
      win.setValue("lbl_status_bar", `✓ Calculated subnet ${subnet.cidr}: ${subnet.usableHosts.toLocaleString()} usable hosts.`);
      lastBulk = null;
      recordHistory(raw, `${subnet.usableHosts.toLocaleString()} usable hosts`);
    } catch (err: any) {
      win.setValue("lbl_status_bar", `❌ CIDR Error: ${err.message}`);
    }
  };

  const showLocalInterfaces = () => {
    try {
      const ifaces = getLocalInterfaces();
      currentInterfaces = ifaces;
      win.setValue("lbl_metric_ip", "Local Interfaces");
      win.setValue("lbl_metric_location", `${ifaces.length} adapters found`);
      win.setValue("lbl_metric_org", "Host Machine");
      win.setValue("lbl_metric_status", "Mode: Local Network");

      const ifaceHeaders = ["Interface", "IP Address", "Family", "Adapter Details"];
      const rows: string[][] = ifaces.map((i) => [
        i.name,
        i.address,
        i.family,
        `${i.internal ? "Internal Loopback" : "Physical/Wi-Fi"} | MAC: ${i.mac || "-"} | Mask: ${i.netmask || "-"}`,
      ]);

      showTable(ifaceHeaders, rows);
      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", "LOCAL NETWORK INTERFACES:\n");
      for (const i of ifaces) {
        win.appendConsole("console_ipinfo", `Adapter: ${i.name.padEnd(10)} | ${i.family.padEnd(4)} | Address: ${i.address.padEnd(20)} | MAC: ${i.mac}\n`);
      }
      win.setValue("lbl_status_bar", `✓ Displaying ${ifaces.length} local network interface(s). Click any adapter row to inspect.`);
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

  win.on("txt_target", "change", (_w, val) => {
    if (val !== undefined && val !== null) {
      win.formValuesStore["txt_target"] = String(val);
    }
  });

  win.on("btn_my_ip", "click", () => {
    win.setValue("txt_target", "myip");
    return lookupIpOrDomain("myip");
  });

  const openLocationMap = () => {
    const loc = lastResult?.loc;
    if (!loc || loc === "0,0") {
      win.setValue("lbl_status_bar", "⚠️ No coordinates available. Look up an IP first.");
      return;
    }
    const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(loc)}`;
    win.openUrl(mapUrl);
    win.toast(`Opened Google Maps: ${loc}`);
  };

  win.on("btn_open_map", "click", () => openLocationMap());

  const handleTableRowSelect = (pid: string) => {
    if (!pid) return;
    const cleanPid = String(pid).trim();
    if (cleanPid === "Google Maps Link" || cleanPid.includes("Google Maps") || cleanPid.startsWith("https://maps.google.com")) {
      openLocationMap();
      return;
    }

    // 1. Check if clicking on an interface in local interfaces list
    const matchedIface = currentInterfaces.find(
      (i) => i.name.toLowerCase() === cleanPid.toLowerCase() || i.address.toLowerCase() === cleanPid.toLowerCase()
    );
    if (matchedIface && matchedIface.address) {
      win.setValue("txt_target", matchedIface.address);
      lookupIpOrDomain(matchedIface.address);
      return;
    }

    // 2. Check if cleanPid is an IP address or CIDR
    if (isCidr(cleanPid)) {
      win.setValue("txt_target", cleanPid);
      calculateCidrRange(cleanPid);
      return;
    }
    if (isIpAddress(cleanPid)) {
      win.setValue("txt_target", cleanPid);
      lookupIpOrDomain(cleanPid);
      return;
    }

    // 3. If in IP details view, check if clicking on "IP Address" or "Hostname" row
    if (lastResult) {
      if (cleanPid === "IP Address" && lastResult.ip) {
        win.setValue("txt_target", lastResult.ip);
        lookupIpOrDomain(lastResult.ip);
        return;
      }
      if (cleanPid === "Hostname" && lastResult.hostname) {
        win.setValue("txt_target", lastResult.hostname);
        lookupIpOrDomain(lastResult.hostname);
        return;
      }
    }
  };

  win.on("tbl_details", "click", (_w, pid) => handleTableRowSelect(String(pid)));
  win.on("tbl_details", "doubleclick", (_w, pid) => handleTableRowSelect(String(pid)));

  win.on("btn_calc_subnet", "click", () => calculateCidrRange());
  win.on("btn_local_ifaces", "click", () => showLocalInterfaces());

  const exportText = (text: string, label: string) => {
    win.clearConsole("console_ipinfo");
    win.appendConsole("console_ipinfo", text + "\n");
    win.copyToClipboard(text);
    win.setValue("lbl_status_bar", `✓ ${label} copied to clipboard.`);
    win.toast(`${label} copied to clipboard`);
  };

  win.on("btn_copy_json", "click", () => {
    if (lastResult) exportText(formatJson(lastResult), "JSON");
    else if (lastSubnet) exportText(JSON.stringify(lastSubnet, null, 2), "Subnet JSON");
    else win.setValue("lbl_status_bar", "⚠️ No active IP result to export.");
  });

  win.on("btn_copy_csv", "click", () => {
    if (lastResult) {
      exportText(formatCsv(lastResult), "CSV");
    } else if (lastSubnet) {
      const entries = Object.entries(lastSubnet);
      const csv = entries.map(([k]) => k).join(",") + "\n" + entries.map(([, v]) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      exportText(csv, "Subnet CSV");
    } else {
      win.setValue("lbl_status_bar", "⚠️ No active IP result to export.");
    }
  });

  win.on("btn_clear", "click", () => {
    lastResult = null;
    lastSubnet = null;
    lastBulk = null;
    currentInterfaces = [];
    win.setValue("txt_target", "");
    win.setValue("lbl_metric_ip", "Target IP: -");
    win.setValue("lbl_metric_location", "Location: -");
    win.setValue("lbl_metric_org", "ASN / Org: -");
    win.setValue("lbl_metric_timezone", "Timezone: -");
    win.setValue("lbl_metric_status", "Status: Cleared");
    showTable([]);
    win.clearConsole("console_ipinfo");
    win.setValue("lbl_status_bar", "Cleared.");
  });
  // -----------------------------------------------------------------------------------------------
  // Productivity Toolkit handlers
  // -----------------------------------------------------------------------------------------------
  const targetText = () => String(win.getValue("txt_target") ?? "").trim();
  const showToolRows = (headers: string[], rows: string[][], status: string, consoleText?: string) => {
    lastResult = null;
    lastSubnet = null;
    lastBulk = null;
    showTable(headers, rows);
    win.clearConsole("console_ipinfo");
    win.appendConsole("console_ipinfo", (consoleText ?? rows.map((r) => r.join("  |  ")).join("\n")) + "\n");
    win.setValue("lbl_status_bar", status);
  };

  win.onClick("btn_bulk_load", () => {
    win.openFile({ title: "Select a list of IPs / domains" }, (p) => {
      if (!p) return;
      try {
        win.setValue("txt_bulk", readFileSync(p, "utf-8"));
        win.toast(`Loaded ${basename(p)}`, 2500, "success");
      } catch (e: any) {
        win.toast(`Could not read file: ${e.message}`, 4000, "error");
      }
    });
  });

  win.onClick("btn_bulk_run", () => {
    const { targets, skipped } = parseTargets(String(win.getValue("txt_bulk") ?? ""));
    if (targets.length === 0) { win.toast("Add at least one IP or domain to the bulk list", 3000, "warning"); return; }
    const token = win.getValue("txt_token")?.trim() || undefined;
    win.setValue("lbl_status_bar", `Looking up ${targets.length} target(s)...`);
    const t0 = performance.now();
    const rows = bulkLookup(targets, token);
    lastBulk = rows;
    lastResult = null;
    lastSubnet = null;
    showTable(BULK_HEADERS, bulkToTableRows(rows));
    const ok = rows.filter((r) => r.status === "ok").length;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    win.setValue("lbl_metric_ip", `Bulk: ${rows.length} target(s)`);
    win.setValue("lbl_metric_location", `Resolved: ${ok}`);
    win.setValue("lbl_metric_org", `Failed: ${rows.length - ok}`);
    win.setValue("lbl_metric_timezone", `Time: ${secs}s`);
    win.setValue("lbl_metric_status", "Mode: Bulk Lookup");
    win.clearConsole("console_ipinfo");
    win.appendConsole("console_ipinfo", bulkToCsv(rows) + "\n");
    const note = skipped > 0 ? ` (${skipped} over the ${MAX_BULK_TARGETS} limit were skipped)` : "";
    win.setValue("lbl_status_bar", `✓ Bulk lookup finished: ${ok}/${rows.length} resolved in ${secs}s${note}.`);
    win.toast(`Bulk lookup: ${ok}/${rows.length} resolved${note}`, 3500, ok === rows.length ? "success" : "warning");
  });

  const currentIp = (): string => lastResult?.ip || (lastSubnet ? lastSubnet.network : "") || "";

  win.onClick("btn_copy_ip", () => {
    const ip = currentIp();
    if (!ip) { win.toast("Look up an IP first", 2500, "warning"); return; }
    win.copyToClipboard(ip);
    win.toast(`Copied ${ip}`, 2000, "success");
  });

  win.onClick("btn_copy_table", () => {
    if (!lastTable || lastTable.rows.length === 0) { win.toast("Nothing in the table to copy", 2500, "warning"); return; }
    win.copyToClipboard(tableToTsv(lastTable.headers, lastTable.rows));
    win.toast("Table copied (tab-separated)", 2500, "success");
  });

  win.onClick("btn_save_results", () => {
    if (!lastTable || lastTable.rows.length === 0) { win.toast("Nothing to save yet", 2500, "warning"); return; }
    win.saveFile({ title: "Save results (.json or .csv)", defaultName: "ipinfo_results.json" }, (p) => {
      if (!p) return;
      try {
        let text: string;
        if (p.toLowerCase().endsWith(".csv")) {
          text = lastBulk ? bulkToCsv(lastBulk) : lastResult ? formatCsv(lastResult) : tableToCsv(lastTable!.headers, lastTable!.rows);
        } else if (lastBulk) text = JSON.stringify(lastBulk, null, 2);
        else if (lastResult) text = formatJson(lastResult);
        else if (lastSubnet) text = JSON.stringify(lastSubnet, null, 2);
        else text = JSON.stringify(lastTable!.rows.map((r) => Object.fromEntries(lastTable!.headers.map((h, i) => [h, r[i] ?? ""]))), null, 2);
        writeFileSync(p, text, "utf-8");
        win.toast(`Saved ${basename(p)}`, 3000, "success");
      } catch (e: any) {
        win.toast(`Save failed: ${e.message}`, 4000, "error");
      }
    });
  });

  win.onClick("btn_open_ipinfo", () => {
    const ip = currentIp();
    if (!ip) { win.toast("Look up an IP first", 2500, "warning"); return; }
    win.openUrl(ipInfoUrl(ip));
  });
  win.onClick("btn_open_bgp", () => {
    const ip = currentIp();
    if (!ip) { win.toast("Look up an IP first", 2500, "warning"); return; }
    win.openUrl(bgpUrl(ip));
  });

  win.onClick("btn_in_cidr", () => {
    const cidr = targetText();
    const ip = String(win.getValue("txt_check_ip") ?? "").trim();
    if (!isValidCidr(cidr)) { win.toast("Enter a CIDR in the target box (e.g. 192.168.1.0/24)", 3500, "warning"); return; }
    if (!ip) { win.toast("Enter the IP to test", 2500, "warning"); return; }
    try {
      const inside = cidrContains(cidr, ip);
      showToolRows(
        ["Check", "Result", "Category", "Description"],
        [
          ["CIDR Block", cidr, "Subnet", "Target block"],
          ["Tested IP", ip, "Address", "Address being tested"],
          ["Contained", inside ? "YES" : "NO", "Result", inside ? "The IP is inside the block" : "The IP is outside the block"],
        ],
        `${inside ? "✓" : "✖"} ${ip} is ${inside ? "inside" : "outside"} ${cidr}.`
      );
      win.toast(`${ip} is ${inside ? "inside" : "outside"} ${cidr}`, 3000, inside ? "success" : "warning");
    } catch (e: any) {
      win.toast(e.message, 3500, "error");
      win.setValue("lbl_status_bar", `❌ ${e.message}`);
    }
  });

  win.onClick("btn_split_cidr", () => {
    const cidr = targetText();
    const prefix = parseInt(String(win.getValue("txt_split_prefix") ?? ""), 10);
    if (!isValidCidr(cidr)) { win.toast("Enter a CIDR in the target box (e.g. 10.0.0.0/16)", 3500, "warning"); return; }
    try {
      const res = splitCidr(cidr, prefix);
      const rows = res.blocks.map((b, i) => [`#${i + 1}`, b, "Subnet", `/${prefix} block`]);
      showToolRows(
        ["Block", "CIDR", "Category", "Description"],
        rows,
        `✓ ${cidr} splits into ${res.total.toLocaleString()} /${prefix} block(s)${res.truncated ? ` (showing first ${res.blocks.length})` : ""}.`,
        res.blocks.join("\n")
      );
    } catch (e: any) {
      win.toast(e.message, 3500, "error");
      win.setValue("lbl_status_bar", `❌ ${e.message}`);
    }
  });

  win.onClick("btn_ip_formats", () => {
    try {
      const rows = describeIpv4(targetText()).map((r) => [r[0]!, r[1]!, "Format", "IPv4 notation"]);
      showToolRows(["Notation", "Value", "Category", "Description"], rows, `✓ Showing notations for ${rows[0]![1]}.`);
    } catch (e: any) {
      win.toast(e.message, 3500, "error");
      win.setValue("lbl_status_bar", `❌ ${e.message}`);
    }
  });

  win.onClick("btn_mask_convert", () => {
    const raw = targetText().replace(/^\//, "");
    try {
      let prefix: number;
      let mask: string;
      if (/^\d{1,2}$/.test(raw)) { prefix = parseInt(raw, 10); mask = prefixToMask(prefix); }
      else { mask = raw; prefix = maskToPrefix(raw); }
      showToolRows(
        ["Property", "Value", "Category", "Description"],
        [["Prefix Length", `/${prefix}`, "Subnet", "CIDR prefix"], ["Netmask", mask, "Subnet", "Dotted decimal mask"], ["Hosts per block", (prefix >= 31 ? 2 ** (32 - prefix) : Math.max(0, 2 ** (32 - prefix) - 2)).toLocaleString(), "Capacity", "Usable addresses"]],
        `✓ /${prefix} = ${mask}`
      );
    } catch (e: any) {
      win.toast("Enter a prefix like /24 or a mask like 255.255.255.0 in the target box", 4000, "warning");
      win.setValue("lbl_status_bar", `❌ ${e.message}`);
    }
  });

  win.on("tbl_history", "click", (_w, pid) => { if (pid) handleSearch(String(pid)); });
  win.onClick("btn_clear_history", () => {
    history = [];
    win.setTableData("tbl_history", ["Target", "Result", "Time"], []);
    win.toast("History cleared", 2000, "info");
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("IP lookup configuration saved.");
  });

  // Client-side direct click binding that cancels native bubbling and double execution
  win.addScript(`
    (function() {
      const btnSearch = document.getElementById("btn_search");
      const btnMyIp = document.getElementById("btn_my_ip");
      const rawTarget = document.getElementById("txt_target");
      const txtTarget = rawTarget
        ? ((rawTarget.tagName === "INPUT" || rawTarget.tagName === "TEXTAREA")
            ? rawTarget
            : (rawTarget.querySelector("input, textarea") || rawTarget))
        : null;
      const readTarget = function() {
        return txtTarget ? String(txtTarget.value || "").trim() : "";
      };

      // Keep backend in sync on every keystroke (change only fires on blur)
      if (txtTarget) {
        txtTarget.addEventListener("input", function() {
          if (window.on_txt_target_change) window.on_txt_target_change(txtTarget.value);
        });
      }

      if (btnSearch) {
        btnSearch.onclick = function(e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          if (window.on_btn_search_click) window.on_btn_search_click(readTarget());
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
          if (window.on_btn_my_ip_click) window.on_btn_my_ip_click("myip");
          return false;
        };
      }
    })();
  `);

  // Initial resolution (preserves any restored target)
  setTimeout(() => {
    const cur = (win.getValue("txt_target") ?? "").trim();
    if (cur && cur !== "8.8.8.8") {
      handleSearch(cur);
    } else {
      lookupIpOrDomain("8.8.8.8");
    }
  }, 100);

  return win;
}

export { createIpInfoStudio as createIpinfoStudio };

if (import.meta.main) {
  const win = createIpInfoStudio({ fullscreen: true });
  console.log("⚡ Launching IpInfo Studio Pro...");
  win.run();
}
