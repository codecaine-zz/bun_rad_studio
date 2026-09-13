#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runDoggoCoordinator } from "./doggoCoordinator.ts";
import { isIpAddress, parseTargetArgs } from "./doggoDoers.ts";
import type { DnsRecordType, DoggoOptions } from "./doggoTypes.ts";

export function parseDoggoArguments(args: string[]): DoggoOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      type: { type: "string", short: "t" },
      nameserver: { type: "string", short: "n" },
      short: { type: "boolean", default: false },
      json: { type: "boolean", short: "j", default: false },
      time: { type: "boolean", default: true },
      "no-time": { type: "boolean", default: false },
      reverse: { type: "boolean", short: "x", default: false },
      doh: { type: "boolean", default: false },
      "doh-url": { type: "string" },
      all: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printDoggoHelp();
    process.exit(0);
  }

  const parsed = parseTargetArgs(positionals);
  const domain = parsed.domain;
  if (!domain) {
    printDoggoHelp();
    process.exit(1);
  }

  const isRev = values.reverse || (isIpAddress(domain) && !values.type && !parsed.type);
  const queryType = (values.all ? "ALL" : (isRev ? "PTR" : (values.type?.toUpperCase() ?? parsed.type ?? "A"))) as DnsRecordType | "ALL";
  const nameserver = values.nameserver ?? parsed.nameserver;

  return {
    domain,
    queryType,
    nameserver,
    doh: values.doh ?? false,
    dohUrl: values["doh-url"],
    all: values.all ?? false,
    short: values.short ?? false,
    json: values.json ?? false,
    showTime: values["no-time"] ? false : true,
  };
}

export function printDoggoHelp(): void {
  console.log(`Usage: doggo [flags] [domain] [type] [@nameserver]

Command-line DNS Client for Humans written in Bun.

Arguments:
  [domain]             Target domain name to query (e.g. example.com)
  [type]               DNS record type (A, AAAA, CNAME, MX, TXT, NS, SOA, etc.)
  [@nameserver]        Custom nameserver (e.g. @1.1.1.1 or @8.8.8.8)

Flags:
  -t, --type <type>    DNS record type to query (default: "A")
  -n, --nameserver <s> Specify nameserver directly
      --doh            Use DNS-over-HTTPS (DoH) via Cloudflare/Google
      --doh-url <url>  Custom DoH provider URL (default: Cloudflare)
      --all            Query common record types (A, AAAA, MX, TXT, NS) in parallel
  -x, --reverse        Perform reverse DNS PTR query
      --short          Display only the answer values (like dig +short)
  -j, --json           Output in JSON format
      --no-time        Omit query response time and server footer
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseDoggoArguments(process.argv.slice(2));
  try {
    const output = await runDoggoCoordinator(options);
    console.log(output);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
