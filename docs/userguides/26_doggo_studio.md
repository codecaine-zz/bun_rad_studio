# 🐶 Doggo Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Modern DNS Client & DNS-over-HTTPS (DoH)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:doggo]  •  [Terminal CLI: bun run cli:doggo]
```

---

## 🌟 Executive Overview
**Doggo Studio Pro** is a modern, human-friendly DNS client and resolution diagnostics workstation built natively for Bun. As a visual desktop counterpart to `doggo` and modern `dig`, it features multi-record type querying (`A`, `AAAA`, `MX`, `TXT`, `CNAME`, `NS`, `SOA`, `CAA`, `PTR`, `SRV`), parallel record resolution (`ALL`), custom nameserver specification (`@1.1.1.1`, `@8.8.8.8`), DNS-over-HTTPS (DoH) support via Cloudflare and Google, and reverse PTR lookups.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:doggo

# Terminal CLI DNS query
bun run cli:doggo example.com
bun run cli:doggo example.com MX
bun run cli:doggo example.com --all
bun run cli:doggo example.com @1.1.1.1
bun run cli:doggo example.com --doh
bun run cli:doggo 8.8.8.8 -x
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Doggo Studio Desktop](../../screenshots/apps/doggo_studio_desktop.png) | ![Doggo Studio Responsive](../../screenshots/apps/doggo_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Target Domain & Record Selector**: Dropdown covering all standard DNS record types plus parallel `ALL`.
- **Custom Nameserver Bar**: Query specific resolvers (`@1.1.1.1`, `@8.8.8.8`, `@9.9.9.9`) or local routers.
- **DNS-over-HTTPS (DoH) Toggle**: Encrypts queries via HTTPS to bypass local DNS interception and filtering.
- **Answer Table**: Displays Record Type, Host Name, TTL (Time To Live), and Resolved Data.
