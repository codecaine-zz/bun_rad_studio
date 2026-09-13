# 🐶 Doggo Studio Pro -- User Guide

**Doggo Studio Pro** is a modern, human-friendly DNS client and resolution diagnostics workstation built natively for Bun. As a visual desktop counterpart to `doggo` and modern `dig`, it features multi-record type querying (`A`, `AAAA`, `MX`, `TXT`, `CNAME`, `NS`, `SOA`, `CAA`, `PTR`, `SRV`), parallel record resolution (`ALL`), custom nameserver specification (`@1.1.1.1`, `@8.8.8.8`), DNS-over-HTTPS (DoH) support via Cloudflare and Google, and reverse PTR lookups.

---

## ⚡ Quick Start

```bash
# Launch Doggo Studio Pro desktop workstation
bun run app:doggo

# Launch CLI mode directly
bun run cli:doggo example.com
bun run cli:doggo example.com MX
bun run cli:doggo example.com --all
bun run cli:doggo example.com @1.1.1.1
bun run cli:doggo example.com --doh
bun run cli:doggo 8.8.8.8 -x
```

You can also launch programmatically in TypeScript:
```ts
import { createDoggoStudio } from "./applications/doggo_studio";
const win = createDoggoStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - Dynamic theme switcher (63 built-in themes), Fullscreen toggle, and Window centering.
2. **DNS Resolution Telemetry**:
   - Target Domain/IP, Queried record type, Query latency (RTT ms), Nameserver resolver, and Total answers count.
3. **Query Parameters & Resolver Configuration**:
   - **Target Domain / IP**: Domain name or IP address to resolve.
   - **Record Type**: Dropdown across all standard record types plus `ALL (Parallel)`.
   - **Nameserver**: Custom resolver address (e.g. `@1.1.1.1`, `@8.8.8.8`, `@9.9.9.9`).
   - **DNS-over-HTTPS (DoH)**: Encrypted DNS query engine with Cloudflare & Google endpoints.
   - **Reverse PTR Lookup (-x)**: Reverse IP address lookup for pointer records.
   - **Actions**: Query DNS, Query All Records, and Export JSON.
4. **Resolved DNS Records (Answers) Table**:
   - Table displaying Record Type, Host Name, TTL (Time To Live), Address / Target Data, and MX Priority.
5. **Raw DNS Message Output Console**:
   - Formatted table and JSON inspection view.
