# 🌍 IpInfo Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: IP Geolocation (ipinfo.io / ipwho.is) & Native CIDR Math  •  Dependencies: 0  •  Lookups need internet; subnet tools offline
Launchers: [Desktop GUI: bun run app:ipinfo]  •  [Terminal CLI: bun run cli:ipinfo]
```

---

## 🌟 Executive Overview
**IpInfo Studio Pro** is a comprehensive IP address reconnaissance, geolocation, Autonomous System Number (ASN), and CIDR subnet calculation workstation. Designed to replace third-party IP lookups and online calculators, it resolves public and local network interfaces, computes subnet host ranges, and displays geolocation data.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:ipinfo

# Terminal CLI IP lookup
bun run cli:ipinfo 8.8.8.8
bun run cli:ipinfo --subnet "192.168.1.0/24"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![IpInfo Studio Desktop](../../screenshots/apps/ipinfo_studio_desktop.png) | ![IpInfo Studio Responsive](../../screenshots/apps/ipinfo_studio_responsive.png) |

---

## 🧭 Core Features
- **Lookup Target**: enter an IP, domain, URL or CIDR. URLs are cleaned to the host, and domains are resolved first. Press Enter in the box to run it.
- **My Public IP**: looks up your own public address.
- **Details table**: IP, hostname, city, region, country, coordinates, organization/ASN, postal code, timezone and a Google Maps link. Private, loopback and reserved addresses are classified offline (for example RFC 1918).
- **CIDR Subnet Calculator**: network, broadcast, netmask, wildcard, first/last host and host counts for an IPv4 block.
- **Local Network Interfaces**: lists your adapters; click a row to look that address up.
- **Copy JSON / Copy CSV**, **Open in Google Maps** and an optional **API Token** for ipinfo.io.

> Public lookups need an internet connection and contact ipinfo.io (falling back to ipwho.is) and DNS-over-HTTPS resolvers. Private addresses and all the subnet tools work offline.

## 🧰 Productivity Toolkit

### Bulk lookup
- Paste one IP or domain per line, or click **Load List...** to read a text file. Lines starting with `#` are comments.
- Commas, spaces and semicolons also separate targets. Duplicates are removed and URLs are reduced to the host.
- Up to 50 targets per run; extras are skipped and the status bar says how many.
- Each row shows target, IP, city, region, country, organization and status. Failures appear as an error row and do not stop the run.
- CIDR blocks in the list are flagged, because bulk lookup is for addresses.

### Subnet and address tools (use the target box)
- **Is IP in Target CIDR?**: type a CIDR as the target and an address in **Test IP**.
- **Split CIDR**: split a block into smaller ones, for example a /24 into four /26 blocks (shows up to 256 blocks).
- **IP Formats**: shows an IPv4 address as dotted decimal, integer, hex, binary and octal, plus its reverse-DNS zone. Integer and `0x` hex input are accepted.
- **Mask ⇄ Prefix**: enter `/24` to get `255.255.255.0`, or a mask to get its prefix. Non-contiguous masks are rejected.
- These tools handle IPv4 only.

### Results
- **Copy IP**, **Copy Table** (tab-separated, ready for a spreadsheet) and **Save Results...** (choose a `.csv` or `.json` name).
- **ipinfo.io Page** and **BGP / ASN Page** open the current IP in your browser.
- **Recent Lookups** keeps your last 20 lookups for the session. Click a row to repeat it, or **Clear History**.

---

## 🛠️ Step-by-Step Tutorial: Audit a List of Hosts
1. Launch with `bun run app:ipinfo`.
2. Paste your hosts into the bulk box, or click **Load List...**.
3. Click **Bulk Lookup** and review the table.
4. Click **Save Results...** and name the file `hosts.csv`.

---

## 💡 Pro Tips & Best Practices
- Lookups run one after another and the window waits while they do, so large bulk lists can take a while.
- Typed values, including the **API Token**, are kept in the saved form state. Clear the token field if you share the machine.
