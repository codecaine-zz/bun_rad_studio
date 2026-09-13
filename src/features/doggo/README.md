# `doggo`: Command-line DNS Client for Humans API

A modern, human-friendly command-line DNS client and modern `dig` alternative written in TypeScript for Bun.

---

## 1. CLI Usage

```bash
# Query DNS records
bun run doggo [domain] [type] [@nameserver]

# Examples
bun run doggo example.com
bun run doggo example.com MX
bun run doggo example.com TXT @8.8.8.8
bun run doggo example.com --short
bun run doggo example.com -j

# Common Flags
-t, --type <type>        DNS record type (A, AAAA, CNAME, MX, TXT, NS, SOA, CAA, PTR, SRV)
    --all                Query multiple record types (A, AAAA, MX, TXT, NS) in parallel
    --doh                Use DNS-over-HTTPS (DoH) via Cloudflare/Google JSON API
    --doh-url <url>      Custom DoH endpoint URL (default: https://cloudflare-dns.com/dns-query)
-n, --nameserver <srv>   Specify nameserver directly (or use @nameserver syntax)
-x, --reverse            Perform reverse DNS PTR query for an IP address
    --short              Display only answer values (similar to dig +short)
-j, --json               Output as JSON
    --time               Display query response latency
    --no-time            Omit query response time and server footer
-h, --help               Show help information
```

---

## 2. Type Definitions

```typescript
export type DnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "NS"
  | "SOA"
  | "PTR"
  | "CAA"
  | "SRV"
  | "ALL";

export interface DnsAnswer {
  name: string;
  type: string;
  class: string;
  ttl?: number;
  data: string;
}

export interface DoggoResponse {
  domain: string;
  queryType: string;
  answers: DnsAnswer[];
  queryTimeMs: number;
  server: string;
  protocol?: "UDP" | "DoH";
}

export interface DoggoOptions {
  domain: string;
  queryType: DnsRecordType | "ALL";
  nameserver?: string;
  doh?: boolean;
  dohUrl?: string;
  all?: boolean;
  short: boolean;
  json: boolean;
  showTime: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Standard DNS Lookup with Query Metrics
```typescript
import { lookupDomain } from "./doggoCoordinator.ts";

const res = await lookupDomain("example.com", "A");

console.log(`Domain: ${res.domain} (resolved in ${res.queryTimeMs}ms via ${res.server})`);
for (const ans of res.answers) {
  console.log(`- ${ans.name} [${ans.type}] ${ans.data} (TTL: ${ans.ttl})`);
}
```

### Example 2: Query MX & TXT Records with a Custom Nameserver
```typescript
import { lookupDomain } from "./doggoCoordinator.ts";

// Query MX records via Cloudflare (1.1.1.1)
const mxRes = await lookupDomain("google.com", "MX", "1.1.1.1");
console.log("MX Records:");
for (const ans of mxRes.answers) {
  console.log(`  ${ans.data}`);
}

// Query TXT records via Google (8.8.8.8)
const txtRes = await lookupDomain("google.com", "TXT", "8.8.8.8");
console.log("TXT Records:");
for (const ans of txtRes.answers) {
  console.log(`  ${ans.data}`);
}
```

### Example 3: Scripting with Short Answer Mode (like `dig +short`)
```typescript
import { lookupDomain } from "./doggoCoordinator.ts";
import { formatShortOutput } from "./doggoDoers.ts";

const res = await lookupDomain("example.com", "A");
const ipList = formatShortOutput(res).split("\n");

console.log("Resolved IPs:", ipList);
// ["172.66.147.243", "104.20.23.154"]
```

### Example 4: Full Coordinator with Table or JSON Formatting
```typescript
import { runDoggoCoordinator } from "./doggoCoordinator.ts";

// Colored table output
const table = await runDoggoCoordinator({
  domain: "example.com",
  queryType: "A",
  nameserver: "1.1.1.1",
  short: false,
  json: false,
  showTime: true,
});
console.log(table);

// JSON output
const jsonString = await runDoggoCoordinator({
  domain: "example.com",
  queryType: "A",
  short: false,
  json: true,
  showTime: false,
});
console.log(jsonString);
```

### Example 5: Positional Argument Parser Doer
```typescript
import { parseTargetArgs } from "./doggoDoers.ts";

const parsed = parseTargetArgs(["example.com", "MX", "@1.1.1.1"]);
console.log(parsed.domain);     // "example.com"
console.log(parsed.type);       // "MX"
console.log(parsed.nameserver); // "1.1.1.1"
```

### Example 6: DNS-over-HTTPS (DoH) & Raw Record Formatting
```typescript
import { performDohLookup, formatRecordData } from "./doggoDoers.ts";

// Execute secure DNS-over-HTTPS query against Cloudflare JSON API
const dohRes = await performDohLookup("example.com", "A", "https://cloudflare-dns.com/dns-query");
console.log(`DoH Server: ${dohRes.server} (Protocol: ${dohRes.protocol})`);
for (const ans of dohRes.answers) {
  console.log(`${ans.name} [${ans.type}]: ${ans.data}`);
}

// Format arbitrary DNS record answers to human-readable strings
const formatted = formatRecordData("MX", { exchange: "mail.example.com", preference: 10 });
console.log(formatted); // "10 mail.example.com"
```

