# 📡 Network Forensics Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native node:net & node:dns  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:network]  •  [Terminal CLI: bun run cli:network]
```

---

## 🌟 Executive Overview
**Network Forensics Studio** is a multi-dimensional network diagnostics, socket auditing, DNS reconnaissance, and latency analysis workstation. Built directly on Bun's native `node:net` and `node:dns` subsystems, it eliminates heavy networking packages and command-line tools like `nmap`, `dig`, and `traceroute` for standard developer workflows.

It features parallel multi-port TCP port scanning, complete DNS record extraction (`A`, `AAAA`, `MX`, `TXT`, `NS`, `SOA`, `CAA`), TTFB (Time To First Byte) HTTP latency profiling, and CIDR subnet calculation.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:network
```

### 2. Launch Terminal CLI Network Scanner
```bash
# Scan common development ports on localhost
bun run cli:network scan localhost --ports 3000,5432,6379,8080

# Resolve all DNS records for a domain
bun run cli:network dns example.com
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Network Forensics Desktop](../../screenshots/apps/network_studio_desktop.png) | ![Network Forensics Responsive](../../screenshots/apps/network_studio_responsive.png) |

---

## 🧭 Integrated Network Diagnostic Modes

### 1. 🔌 Parallel Port Scanner
- **Target Host**: IP address or hostname (`127.0.0.1`, `localhost`, `staging.server`).
- **Port Ranges / Presets**: Web (80, 443), Databases (5432, 3306, 6379, 27017), Dev Servers (3000, 5173, 8080, 8000), or custom port range (`1-1024`).
- **State Badges**: Color-coded `OPEN` (green), `CLOSED` (red), or `FILTERED/TIMEOUT` (yellow).

### 2. 🌐 Complete DNS Inspector
- Queries all authoritative records simultaneously: IPv4 (`A`), IPv6 (`AAAA`), Mail (`MX`), Verification & SPF (`TXT`), Nameservers (`NS`), Start of Authority (`SOA`), and Security (`CAA`).

### 3. ⚡ TTFB & HTTP Latency Profiler
- Measures DNS lookup latency, TCP connection time, TLS handshake time, and Time to First Byte (TTFB) in fractional milliseconds.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Discovering Conflicting Local Development Ports
1. Launch Network Forensics Studio: `bun run app:network`.
2. In Target Host, enter: `127.0.0.1`.
3. Click preset: **Dev & Database Ports**.
4. Click **Start Port Scan**.
5. The results table immediately displays which ports are currently held by active listeners (e.g., PostgreSQL on 5432, Redis on 6379, Vite on 5173).
