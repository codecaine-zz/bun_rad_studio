# 🔎 Subfinder Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Passive & Active DNS Reconnaissance  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:subfinder]  •  [Terminal CLI: bun run cli:subfinder]
```

---

## 🌟 Executive Overview
**Subfinder Studio Pro** is a passive and active subdomain reconnaissance workbench built natively for Bun. Designed for security researchers, penetration testers, and system architects, it discovers subdomains across targeted apex domains using Certificate Transparency (CT) logs, passive DNS datasets, and direct authoritative DNS probing.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:subfinder

# Terminal CLI subdomain recon
bun run cli:subfinder example.com
bun run cli:subfinder example.com --probe-http
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Subfinder Studio Desktop](../../screenshots/apps/subfinder_studio_desktop.png) | ![Subfinder Studio Responsive](../../screenshots/apps/subfinder_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Multi-Source Subdomain Enumeration**: Extracts subdomains without sending intrusive traffic to target networks.
- **HTTP / HTTPS Live Probing**: Checks status codes (200, 301, 403, 500) and page titles.
- **Export Formats**: One-click CSV, TXT, or JSON export of valid targets.
