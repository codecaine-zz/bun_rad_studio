#!/usr/bin/env bun
import { parseSubfinderArguments } from "../src/features/subfinder/subfinderCli.ts";
import { runSubfinderCoordinator } from "../src/features/subfinder/subfinderCoordinator.ts";

async function main(): Promise<void> {
  const options = parseSubfinderArguments(process.argv.slice(2));
  const output = await runSubfinderCoordinator(options);
  for (const line of output) {
    console.log(line);
  }
}

if (import.meta.main) {
  await main();
}
