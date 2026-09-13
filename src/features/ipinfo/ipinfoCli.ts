#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runIpInfoCoordinator } from "./ipinfoCoordinator.ts";
import type { IpInfoOptions } from "./ipinfoTypes.ts";

export function parseIpInfoArguments(args: string[]): IpInfoOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      token: { type: "string", short: "t" },
      field: { type: "string", short: "f" },
      json: { type: "boolean", short: "j", default: false },
      csv: { type: "boolean", short: "c", default: false },
      nocolor: { type: "boolean", default: false },
      local: { type: "boolean", short: "l", default: false },
      bulk: { type: "string", short: "b" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printIpInfoHelp();
    process.exit(0);
  }

  const rawTarget = positionals[0];
  const bulkFile = values.bulk || (rawTarget === "-" ? "-" : undefined);
  const targetIp = bulkFile ? undefined : rawTarget;

  return {
    targetIp,
    token: values.token,
    field: values.field,
    json: values.json ?? false,
    csv: values.csv ?? false,
    noColor: values.nocolor ?? false,
    bulkFile,
    local: values.local ?? false,
  };
}

export function printIpInfoHelp(): void {
  console.log(`Usage: ipinfo [<ip|cidr>] [options]

Look up details for an IP address, calculate CIDR subnet, or inspect network interfaces.

Arguments:
  [<ip|cidr>]          IP address, domain, or CIDR range (e.g. 8.8.8.8, 192.168.1.0/24)

Options:
  -l, --local          Show local network interfaces and IP addresses
  -t, --token <tok>    Use API token
  -f, --field <field>  Lookup specific field (e.g. country, org, city, loc)
  -j, --json           Output in JSON format
  -c, --csv            Output in CSV format
  -b, --bulk <file>    Lookup multiple IPs from a file or stdin ("-")
  --nocolor            Disable colored output
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseIpInfoArguments(process.argv.slice(2));
  try {
    const output = await runIpInfoCoordinator(options);
    console.log(output);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
