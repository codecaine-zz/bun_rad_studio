# `ipinfo`: IP Geolocation & ASN Lookup API

Lookup geolocation, autonomous system number (ASN), organization, city, region, and network details for any IP or the current machine.

---

## 1. CLI Usage

```bash
# Lookup IP, CIDR subnet, or local interfaces
bun run ipinfo [<ip|cidr>] [options]

# Common Flags
-l, --local             Show local network interfaces and assigned IPs
-t, --token <tok>       Use custom API token
-f, --field <field>     Lookup specific field (e.g. country, org, city, loc)
-j, --json              Output in JSON format
-c, --csv               Output in CSV format
-b, --bulk <file>       Lookup multiple IPs from a file or stdin ("-")
--nocolor               Disable colored output
-h, --help              Show help information
```

---

## 2. Type Definitions

```typescript
export interface IpInfoResult {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
  readme?: string;
}

export interface SubnetInfo {
  cidr: string;
  network: string;
  broadcast: string;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
}

export interface LocalInterfaceInfo {
  name: string;
  address: string;
  family: string;
  netmask: string;
  mac: string;
  internal: boolean;
}

export interface IpInfoOptions {
  targetIp?: string;
  token?: string;
  field?: string;
  json: boolean;
  csv: boolean;
  noColor: boolean;
  bulkFile?: string;
  local?: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Lookup Any Target IP Address
```typescript
import { queryIp } from "./ipinfoCoordinator.ts";

const googleDns = await queryIp("8.8.8.8");
console.log(`IP: ${googleDns.ip}`);
console.log(`Host: ${googleDns.hostname}`);
console.log(`Location: ${googleDns.city}, ${googleDns.region}, ${googleDns.country}`);
console.log(`Organization: ${googleDns.org}`);
```

### Example 2: Lookup Current Machine Public IP
```typescript
import { queryIp } from "./ipinfoCoordinator.ts";

const myIp = await queryIp();
console.log(`Current Public IP: ${myIp.ip}`);
console.log(`ISP/Org: ${myIp.org}`);
console.log(`Coordinates: ${myIp.loc}`);
```

### Example 3: Extract Specific Property Directly
```typescript
import { queryIp } from "./ipinfoCoordinator.ts";
import { extractField } from "./ipinfoDoers.ts";

const data = await queryIp("1.1.1.1");
const org = extractField(data, "org");       // "AS13335 Cloudflare, Inc."
const country = extractField(data, "country"); // "AU"
```

### Example 4: Output to JSON or CSV Formats
```typescript
import { queryIp } from "./ipinfoCoordinator.ts";
import { formatCsv, formatJson } from "./ipinfoDoers.ts";

const data = await queryIp("8.8.8.8");
const jsonStr = formatJson(data);
const csvStr = formatCsv(data);
```

### Example 5: IP Address Validation
```typescript
import { isIpAddress } from "./ipinfoDoers.ts";

console.log(isIpAddress("1.1.1.1"));                  // true
console.log(isIpAddress("2001:4860:4860::8888"));    // true
console.log(isIpAddress("google.com"));              // false
```

### Example 6: CIDR Subnet Calculation & Local Network Interfaces
```typescript
import {
  calculateSubnet,
  formatSubnetInfo,
  getLocalInterfaces,
  formatLocalInterfaces,
  isCidr,
} from "./ipinfoDoers.ts";

// Validate CIDR notation
console.log(isCidr("192.168.1.0/24")); // true

// Calculate detailed IPv4 subnet network metrics
const subnet = calculateSubnet("10.0.0.0/22");
console.log(`Usable hosts: ${subnet.usableHosts} (${subnet.firstHost} -> ${subnet.lastHost})`);
console.log(formatSubnetInfo(subnet));

// Inspect local machine network interfaces
const interfaces = getLocalInterfaces();
console.log(`Found ${interfaces.length} local interface(s):`);
console.log(formatLocalInterfaces(interfaces));
```

