# 📡 Network Forensics Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native node:net, node:tls & node:dns  •  Dependencies: 0  •  Port scans work offline; DNS/HTTP need internet
Launchers: [Desktop GUI: bun run app:network]  •  [Terminal CLI: bun run cli:network]
```

---

## 🌟 Executive Overview
**Network Forensics Studio** is a multi-dimensional network diagnostics, socket auditing, DNS reconnaissance, and latency analysis workstation. Built directly on Bun's native `node:net` and `node:dns` subsystems, it eliminates heavy networking packages and command-line tools like `nmap`, `dig`, and `traceroute` for standard developer workflows.

It features parallel TCP port scanning, DNS record inspection (`A`, `AAAA`, `MX`, `TXT`, `NS`, `SOA`, `CAA`, reverse `PTR`), HTTP timing breakdowns, TLS certificate inspection and TCP latency measurement.

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

## 🧭 Diagnostic Tools

Set the **Target** (host name, IP or URL) and **Port**, then pick a tool. A target that is not a valid host name or IP is rejected with an error instead of silently scanning something else.

| Tool | What it does |
| :--- | :--- |
| **HTTP Probe** | Sends a HEAD request, follows redirects and shows the status, response headers and timings (DNS, TCP connect, TLS, time to first byte, total), the redirect count and the remote IP. |
| **Scan Port** | Tests one TCP port and reports OPEN, CLOSED or TIMEOUT with latency. |
| **Scan Top Ports** | Checks 12 common service ports (FTP, SSH, DNS, HTTP, HTTPS, dev servers, MySQL, PostgreSQL, Redis, MongoDB). |
| **Full DNS Audit** | Queries A, AAAA, MX, TXT, NS, SOA and CNAME records together. |
| **A / AAAA / MX / TXT / NS / SOA / CAA** | Query one record type. |
| **Reverse DNS (PTR)** | Finds the host name for an IP address. |
| **Presets** | Localhost, Cloudflare, Google and GitHub fill in the target and port. |

---

## 🧰 Productivity Toolkit

- **Scan Port List**: scan your own ports, such as `22,80,443,8000-8010`. Separate entries with commas, spaces or semicolons. Ranges are expanded, duplicates removed, and a list is capped at 1024 ports.
- **Timeout (ms)**: per-port wait, 100-5000 (default 500). Raise it for slow or distant hosts.
- **Show open ports only**: hides closed and timed-out ports from the Scan Top Ports and Scan Port List results. The report notes how many were hidden.
- **SSL Certificate**: connects to the host and port (default 443) and shows the subject, issuer, validity dates, a days-left verdict (valid, expiring within 14 days, or expired), whether the system trusts it, protocol, cipher, alternative names and SHA-256 fingerprint. It inspects self-signed and expired certificates too, so you can see why a site fails.
- **TCP Ping x5**: five TCP connections to the host and port, with replies, packet loss, min/avg/max and jitter. This measures TCP connect time, not ICMP ping.
- **Copy Report** copies the raw text report.
- **Save Report...** opens a save dialog. Name the file `.csv` after a port scan to get a spreadsheet-friendly list; any other name saves the text report.

> Scans and checks run one after another and the window waits while they do, so a large list or slow host can pause the UI briefly.

> Only scan hosts you own or are authorized to test.

---

## 🛡️ Safety

- Everything shown from the network (DNS records, HTTP headers, error text) is HTML-escaped before display, so a hostile server cannot inject markup into the results panel.
- Your own addresses and MAC addresses are masked in the interface table.

---

## 🛠️ Step-by-Step Tutorial: Check a Certificate and a Port Range
1. Launch with `bun run app:network`.
2. Enter `example.com` as the target and `443` as the port, then click **SSL Certificate**.
3. Read the **Expiry Status** row: it tells you how many days remain.
4. Enter `127.0.0.1` as the target, set Ports to `3000,5432,6379,8000-8010`, tick **Show open ports only** and click **Scan Port List** to see which local services are running.
5. Click **Save Report...** and name it `ports.csv`.

---

## 💡 Pro Tips & Best Practices
- A TIMEOUT usually means a firewall is dropping packets; CLOSED means the host actively refused the connection.
- DNS and HTTP probes need an internet connection; local port scans and TCP ping to localhost work offline.
- Typed values are kept in the saved form state, so avoid putting sensitive hostnames on a shared machine.
