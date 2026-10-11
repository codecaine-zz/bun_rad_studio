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

      win.setTableData("tbl_details", ipHeaders, rows);

      win.clearConsole("console_ipinfo");
      win.appendConsole("console_ipinfo", formatSummary(data) + "\n\n");
      win.appendConsole("console_ipinfo", "RAW JSON:\n" + formatJson(data) + "\n");

      win.setValue("lbl_status_bar", `✓ Successfully resolved IP details for ${data.ip} (${resolved.domain || data.hostname || "Host"}).`);
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
      win.setTableData("tbl_details", errorHeaders, errorRows);

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

      win.setTableData("tbl_details", subnetHeaders, rows);
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

      win.setTableData("tbl_details", ifaceHeaders, rows);
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
    currentInterfaces = [];
    win.setValue("txt_target", "");
    win.setValue("lbl_metric_ip", "Target IP: -");
    win.setValue("lbl_metric_location", "Location: -");
    win.setValue("lbl_metric_org", "ASN / Org: -");
    win.setValue("lbl_metric_timezone", "Timezone: -");
    win.setValue("lbl_metric_status", "Status: Cleared");
    win.setTableData("tbl_details", []);
    win.clearConsole("console_ipinfo");
    win.setValue("lbl_status_bar", "Cleared.");
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
