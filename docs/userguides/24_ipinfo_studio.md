# 🌐 IpInfo Studio Pro -- User Guide

**IpInfo Studio Pro** is an IP address geolocation, ASN diagnostics, and network forensics desktop workstation built natively for Bun. It provides instant public IP lookups, arbitrary IP/domain search, Autonomous System Number (ASN) and ISP extraction, interactive Google Maps coordinate deep-linking, an IPv4 CIDR subnet calculator, and local network interface inspection.

---

## ⚡ Quick Start

```bash
# Launch IpInfo Studio Pro desktop workstation
bun run app:ipinfo

# Launch CLI mode directly
bun run cli:ipinfo 8.8.8.8
bun run cli:ipinfo 192.168.1.0/24
bun run cli:ipinfo --local
```

You can also launch programmatically in TypeScript:
```ts
import { createIpInfoStudio } from "./applications/ipinfo_studio";
const win = createIpInfoStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - 63 visual themes, Fullscreen mode toggle, and Window centering.
2. **IP Geolocation Telemetry**:
   - Target IP address, Location (City, Region, Country), ASN / ISP Organization, Timezone, and Resolution Status.
3. **Query Target & Network Controls**:
   - **Target Input**: IP address (e.g. `8.8.8.8`), domain name (e.g. `github.com`), or CIDR range (e.g. `192.168.1.0/24`).
   - **My Public IP**: Instantly resolves current external IP.
   - **CIDR Subnet Calculator**: Calculates Network, Netmask, Broadcast, Wildcard, Host Range, and Total Usable Hosts.
   - **Local Network Interfaces**: Displays physical, Wi-Fi, and loopback network adapters with MAC and IPv4/v6 addresses.
   - **Export Options**: 1-click Copy JSON and Copy CSV.
4. **Network Properties & Metadata Table**:
   - Comprehensive grid detailing Property, Resolved Value, Category, and Descriptions.
5. **Raw Forensic Output Console**:
   - Formatted text summary and complete raw JSON response payload.
