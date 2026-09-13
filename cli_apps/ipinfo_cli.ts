#!/usr/bin/env bun
import { parseIpInfoArguments } from "../src/features/ipinfo/ipinfoCli.ts";
import { runIpInfoCoordinator } from "../src/features/ipinfo/ipinfoCoordinator.ts";

async function main(): Promise<void> {
  const options = parseIpInfoArguments(process.argv.slice(2));
  const output = await runIpInfoCoordinator(options);
  console.log(output);
}

if (import.meta.main) {
  await main();
}
