# 🔎 Subfinder Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Passive & Active DNS Reconnaissance  •  Dependencies: 0  •  Needs network access (queries online OSINT services)
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

## 🗂️ Also inside the Codecaine File Manager
The same engine is available in the [Codecaine File Manager](43_file_manager.md#subdomains-subfinder) as **Find & more → Subdomains** (🔭): the same four passive sources plus the real `subfinder` program when it is installed, live progress per source, a filterable results table, Copy, Export, a Markdown report, a short history, and a hand-off of any host to the File Manager's Network tab. It adds a responsible-use confirmation before any DNS, HTTP or port step, refuses to probe private or internal addresses unless you allow it, and caps results and concurrency. This desktop app, the CLI and their tests are unchanged.
