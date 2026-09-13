# `subfinder`: Passive Subdomain Discovery API

Fast passive subdomain enumeration tool querying multiple open public sources (crt.sh, HackerTarget, AlienVault OTX, Anubis) with optional active DNS verification.

---

## 1. CLI Usage

```bash
# Discover subdomains
bun run subfinder -d <domain>

# Common Flags
-d, --domain <domain>        Target domain name
-nW, -active, --active       Resolve found subdomains to verify live IPs
-p, -probe, --probe          Probe HTTP/HTTPS status code and HTML page title
    --ports <ports>          Comma-separated list of ports to probe (e.g. 80,443,8080)
    --wildcard               Detect and flag wildcard DNS subdomains
-silent, --silent            Print only subdomain names (one per line)
-oJ, -json, --json           Write output as JSON
-o, --output <file>          Save output to file
--timeout <seconds>          Timeout per source query (default: 10s)
-h, --help                   Show help information
```

---

## 2. Type Definitions

```typescript
export interface SubdomainResult {
  host: string;
  sources: string[];
  ip?: string[];
  httpStatus?: number;
  httpTitle?: string;
  openPorts?: number[];
  isWildcard?: boolean;
}

export interface SubfinderOptions {
  domains: string[];
  sources?: string[];
  active: boolean;
  probe: boolean;
  silent: boolean;
  json: boolean;
  outputFile?: string;
  timeoutMs: number;
  ports?: number[];
  detectWildcard?: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Passive Subdomain Discovery
```typescript
import { enumerateDomain } from "./subfinderCoordinator.ts";

// Queries all passive sources in parallel
const results = await enumerateDomain("example.com", 10000, false);

console.log(`Discovered ${results.length} subdomain(s):`);
for (const res of results) {
  console.log(`- ${res.host} (found via: ${res.sources.join(", ")})`);
}
```

### Example 2: Active Verification (Live DNS Resolution)
```typescript
import { enumerateDomain } from "./subfinderCoordinator.ts";

// Resolves DNS A/AAAA records in parallel, discarding inactive subdomains
const liveResults = await enumerateDomain("example.com", 10000, true);

for (const res of liveResults) {
  console.log(`${res.host} -> [${res.ip?.join(", ")}]`);
}
```

### Example 3: Full Coordinator Execution with File Export
```typescript
import { runSubfinderCoordinator } from "./subfinderCoordinator.ts";

const lines = await runSubfinderCoordinator({
  domains: ["example.com"],
  active: false,
  silent: true,
  json: false,
  outputFile: "subdomains.txt",
  timeoutMs: 8000,
});

console.log(`Wrote ${lines.length} subdomains to subdomains.txt`);
```

### Example 4: Querying Individual Passive Sources Directly
```typescript
import { queryCrtSh, queryHackerTarget, queryAlienVault, queryAnubis } from "./subfinderDoers.ts";

const ctLogs = await queryCrtSh("example.com");
console.log(`crt.sh hosts: ${ctLogs.length}`);

const htHosts = await queryHackerTarget("example.com");
console.log(`HackerTarget hosts: ${htHosts.length}`);

const otxHosts = await queryAlienVault("example.com");
console.log(`AlienVault hosts: ${otxHosts.length}`);

const anubisHosts = await queryAnubis("example.com");
console.log(`Anubis hosts: ${anubisHosts.length}`);
```

### Example 5: DNS Resolution & Deduplication Doers
```typescript
import { cleanDomain, cleanSubdomain, deduplicateSubdomains, resolveHostDns } from "./subfinderDoers.ts";

const domain = cleanDomain("https://sub.example.com/path"); // "sub.example.com"
const sub = cleanSubdomain("*.api.example.com", "example.com"); // "api.example.com"
const unique = deduplicateSubdomains(["b.example.com", "a.example.com", "b.example.com"]); // ["a.example.com", "b.example.com"]

const ips = await resolveHostDns("localhost");
console.log(ips); // ["127.0.0.1", "::1"]
```

### Example 6: HTTP Status Probing, Port Scanning & Wildcard DNS Filtering
```typescript
import {
  probeHttp,
  probePorts,
  detectWildcardDns,
  isWildcardMatch,
} from "./subfinderDoers.ts";

// Probe HTTP status code and HTML document title
const probe = await probeHttp("example.com", 3000);
console.log(`HTTP ${probe.status}: "${probe.title}"`);

// Probe common open ports concurrently
const openPorts = await probePorts("example.com", [80, 443, 8080]);
console.log(`Open ports: ${openPorts.join(", ")}`);

// Detect and check against wildcard DNS records
const wildcardIps = await detectWildcardDns("example.com");
if (wildcardIps) {
  console.log(`Detected wildcard DNS resolving to: ${wildcardIps.join(", ")}`);
  const isWild = isWildcardMatch(["93.184.216.34"], wildcardIps);
  console.log(`Matches wildcard: ${isWild}`);
}
```

