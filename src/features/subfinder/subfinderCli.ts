#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runSubfinderCoordinator } from "./subfinderCoordinator.ts";
import type { SubfinderOptions } from "./subfinderTypes.ts";

export function normalizeSubfinderArgs(args: string[]): string[] {
  return args.map((arg) => {
    if (arg === "-silent") return "--silent";
    if (arg === "-active" || arg === "-nW") return "--active";
    if (arg === "-probe") return "--probe";
    if (arg === "-json" || arg === "-oJ") return "--json";
    if (arg === "-output") return "--output";
    if (arg === "-ports") return "--ports";
    if (arg === "-wildcard") return "--wildcard";
    return arg;
  });
}

export function parseSubfinderArguments(args: string[]): SubfinderOptions {
  const normalized = normalizeSubfinderArgs(args);
  const { values, positionals } = parseArgs({
    args: normalized,
    options: {
      domain: { type: "string", short: "d" },
      output: { type: "string", short: "o" },
      json: { type: "boolean", default: false },
      silent: { type: "boolean", default: false },
      active: { type: "boolean", default: false },
      probe: { type: "boolean", short: "p", default: false },
      ports: { type: "string" },
      wildcard: { type: "boolean", default: false },
      timeout: { type: "string", default: "10" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printSubfinderHelp();
    process.exit(0);
  }

  const domainArg = values.domain ?? positionals[0];
  if (!domainArg) {
    printSubfinderHelp();
    process.exit(1);
  }

  const domains = domainArg.split(",").map((d) => d.trim());
  const timeoutSec = parseInt(values.timeout ?? "10", 10);
  const timeoutMs = (isNaN(timeoutSec) ? 10 : timeoutSec) * 1000;
  const ports = values.ports
    ? values.ports
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p))
    : undefined;

  return {
    domains,
    active: values.active ?? false,
    probe: values.probe ?? false,
    silent: values.silent ?? false,
    json: values.json ?? false,
    outputFile: values.output,
    timeoutMs,
    ports,
    detectWildcard: values.wildcard ?? false,
  };
}

export function printSubfinderHelp(): void {
  console.log(`Usage: subfinder [flags]

Fast passive subdomain discovery tool written in Bun.

Flags:
  -d, --domain <domain>        Target domain to find subdomains for
  -nW, -active, --active       Resolve found subdomains to verify active hosts
  -p, -probe, --probe          Probe HTTP/HTTPS service, status code, and HTML title
      --ports <ports>          Comma-separated list of ports to probe (e.g. 80,443,8080)
      --wildcard               Detect and flag wildcard DNS subdomains
  -silent, --silent            Display only subdomains in output
  -oJ, -json, --json           Write output in JSON format
  -o, --output <file>          File to write output to
      --timeout <seconds>      Timeout for each passive source query (default: 10)
  -h, --help                   Print help information
`);
}

async function main(): Promise<void> {
  const options = parseSubfinderArguments(process.argv.slice(2));
  try {
    const lines = await runSubfinderCoordinator(options);
    for (const line of lines) {
      console.log(line);
    }
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
