# 🌐 Network Forensics Studio -- User Guide

**Network Forensics Studio** is a developer networking, socket diagnostics, and DNS exploration workbench. Built exclusively on Node's native `node:net` and `node:dns/promises` APIs, it provides multi-port TCP socket scanning, DNS record inspection, and HTTP Time-To-First-Byte (TTFB) latency probing with zero external tools like `nmap` or `dig`.

---

## ⚡ Quick Start

```bash
bun run app:network
```

---

## 🖥️ User Interface Overview

1. **TCP Socket Port Scanner**:
   - **Target Host / IP**: Domain name or IPv4 address (e.g. `localhost`, `127.0.0.1`, `example.com`).
   - **Port Range / Presets**:
     - Web Ports (`80, 443, 8080, 8443, 3000, 4567, 5173`)
     - Database Ports (`3306, 5432, 6379, 27017, 1433, 9200`)
     - Custom Ranges (`1-1024` or comma-separated lists)
   - **Connection Timeout**: Timeout in milliseconds per socket attempt (defaults to `600ms`).
   - **⚡ Scan Ports**: Concurrently scans ports, reporting state (`OPEN`, `CLOSED`, `FILTERED`) and response time.
2. **Comprehensive DNS Query Engine**:
   - **Domain Name**: Hostname to resolve (e.g. `google.com`, `github.com`).
   - **Record Type Dropdown**: Supports `A`, `AAAA`, `MX`, `TXT`, `NS`, `CNAME`, `SOA`, or `ALL Records`.
   - **🔍 Resolve DNS**: Queries system and upstream DNS servers via `node:dns/promises`.
3. **HTTP Latency & TTFB Probe**:
   - **Target URL**: Web address to probe.
   - **⚡ Probe Latency**: Measures DNS lookup time, TCP handshake, TLS negotiation, and Time-To-First-Byte (TTFB).
4. **Audit Log & Telemetry**:
   - High-contrast console displaying scan results, open socket counts, and DNS record tables.
   - **📋 Copy Report**: Exports the network audit to clipboard.

---

## 📖 Practical Tutorials

### 1. Checking Which Dev Servers and Databases Are Active Locally
1. Leave **Target Host** as `127.0.0.1`.
2. Select the **Database Ports** preset (`3306, 5432, 6379, 27017, 1433`).
3. Click **⚡ Scan Ports**.
4. Network Forensics Studio will show which database ports are currently listening locally (e.g. `Port 5432 (PostgreSQL): OPEN in 1.8ms`).

### 2. Inspecting Mail Exchanger (MX) and Security Records (TXT/SPF)
1. In the **DNS Query** box, enter your company domain:
   ```text
   mycompany.com
   ```
2. Select **Record Type: MX**.
3. Click **🔍 Resolve DNS**.
4. The MX host priority and server names will be displayed in the results table.
5. Change **Record Type** to `TXT` to inspect SPF, DKIM, and domain ownership verification tokens.

### 3. Diagnosing High Latency on External APIs
1. Enter the API URL in the **HTTP Latency Probe** box:
   ```text
   https://api.github.com/zen
   ```
2. Click **⚡ Probe Latency**.
3. Network Forensics Studio breaks down the latency waterfall:
   - DNS Resolution: `12ms`
   - TCP Connection: `24ms`
   - TTFB: `48ms`
   - Total Round Trip: `84ms`

---

## 🛡️ Enterprise Resilience Features
- **Non-Intrusive Scanning**: Socket probes send no payloads and close connections immediately upon establishing a handshake.
- **Concurrent Socket Throttling**: Batch scans run with controlled concurrency to prevent socket descriptor exhaustion.
- **Pure Node/Bun Network Stack**: Direct access to OS networking. Zero external C-library or Homebrew dependencies.
