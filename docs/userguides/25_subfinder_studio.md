# 🛰️ Subfinder Studio Pro -- User Guide

**Subfinder Studio Pro** is a fast, passive subdomain discovery and OSINT reconnaissance desktop workstation built natively for Bun. Designed as a visual counterpart to `subfinder`, it queries multi-source public certificate transparency logs and search databases (`crt.sh`, `HackerTarget`, `AlienVault`, `Anubis`), performs active DNS resolution verification, probes HTTP/HTTPS service titles and response codes, checks target ports, and detects wildcard DNS entries.

---

## ⚡ Quick Start

```bash
# Launch Subfinder Studio Pro desktop workstation
bun run app:subfinder

# Launch CLI mode directly
bun run cli:subfinder -d example.com
bun run cli:subfinder -d example.com -active
bun run cli:subfinder -d example.com -probe
```

You can also launch programmatically in TypeScript:
```ts
import { createSubfinderStudio } from "./applications/subfinder_studio";
const win = createSubfinderStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - Theme selector (63 themes), Fullscreen toggle, Save Config, and Window centering.
2. **Reconnaissance Telemetry**:
   - Target Domain, Discovered Subdomains count, Active live DNS hosts, HTTP OK endpoints, and Scanner state.
3. **Target Domain & Probe Settings**:
   - **Target Domain**: Root domain name to discover (e.g. `example.com`).
   - **Timeout (s)**: HTTP request timeout duration.
   - **Ports**: Comma-separated TCP ports to probe (e.g. `80,443,8080`).
   - **Active DNS Verification**: Resolves live IPv4 addresses.
   - **Probe HTTP Status & Title**: Extracts HTTP response status and HTML page `<title>`.
   - **Filter Wildcards**: Detects and suppresses catch-all DNS wildcard records.
4. **Discovered Subdomains Table**:
   - Interactive grid showing Subdomain, IP Address, HTTP Status, Page Title, Open Ports, and OSINT Sources.
5. **Output & Export Console**:
   - Raw host list and structured JSON export stream.
