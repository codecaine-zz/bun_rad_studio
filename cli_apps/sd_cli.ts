#!/usr/bin/env bun
import { parseSdArguments, printSdHelp } from "../src/features/sd/sdCli.ts";
import { runSdCoordinator } from "../src/features/sd/sdCoordinator.ts";

async function main(): Promise<void> {
  const options = parseSdArguments(process.argv.slice(2));
  const output = await runSdCoordinator(options);
  for (const line of output) {
    console.log(line);
  }
}

if (import.meta.main) {
  await main();
}
